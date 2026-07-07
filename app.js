/* =========================================================
   VIRTUAL TOUR – Fakultas Teknik UNRI
   app.js – Main Application Logic (Optimized Lazy Loading)
   =========================================================
   Fitur:
   - LAZY LOADING: Hanya muat gambar yang dibutuhkan
   - Loading screen hanya tunggu 1 gambar (bukan semua)
   - Smart preload: otomatis siapkan scene tetangga (links[])
   - Image cache dengan LRU (max 7 gambar di memory)
   - Mini spinner saat scene belum siap
   - Zoom-forward transition (Google Maps style)
   - Multi-directional nav: N/S/E/W (simpang 3 & 4)
   - Dynamic 3D nav buttons (generated per scene)
   - HUD: scene info, scene selector, scene dots
   - Compass live (mengikuti arah pandang kamera)
   - Fullscreen API, Gyroscope mobile
   - Drag hint auto-hide
   - Mouse drag inertia (smooth stopping)
   ========================================================= */

"use strict";

// ── DOM References ─────────────────────────────────────────
const $loadingScreen = document.getElementById("loading-screen");
const $loadingBar = document.getElementById("loadingBar");
const $loadingHint = document.getElementById("loadingHint");

const $sky = document.getElementById("sky");
const $fadeOverlay = document.getElementById("fadeOverlay");

const $btnPrev = document.getElementById("btnPrev");
const $btnNext = document.getElementById("btnNext");
const $btnFullscreen = document.getElementById("btnFullscreen");
const $btnGyro = document.getElementById("btnGyro");

const $sceneLabel = document.getElementById("sceneLabel");
const $sceneDesc = document.getElementById("sceneDesc");
const $sceneNum = document.getElementById("sceneNum");
const $sceneTotal = document.getElementById("sceneTotal");
const $sceneDots = document.getElementById("sceneDots");
const $dragHint = document.getElementById("dragHint");
const $compassNeedle = document.querySelector(".compass-needle");
const $sceneSpinner = document.getElementById("sceneSpinner");
const $cursor = document.getElementById("cursor");
const $selectScene = document.getElementById("selectScene");

// ── State ──────────────────────────────────────────────────
let currentIndex = 0;
let isTransitioning = false;
let hintDismissed = false;
let activeLabelPlanes = []; // Menyimpan referensi plane 3D yang sedang aktif
let activeNavButtons = []; // Menyimpan referensi tombol navigasi 3D yang sedang aktif

// ── Image Cache (LRU) ─────────────────────────────────────
// Menyimpan Image objects yang sudah dimuat.
// Max 7 gambar di memory agar tidak boros RAM.
const IMAGE_CACHE_MAX = 7;
const imageCache = new Map(); // key: scene index, value: Image object

/**
 * Muat gambar secara lazy. Mengembalikan Promise<Image>.
 * Jika sudah ada di cache, langsung resolve.
 */
function loadImage(index) {
  if (index < 0 || index >= SCENES.length) return Promise.resolve(null);

  // Sudah di cache? Pindahkan ke akhir (LRU) dan return
  if (imageCache.has(index)) {
    const cached = imageCache.get(index);
    imageCache.delete(index);
    imageCache.set(index, cached);
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      addToCache(index, img);
      resolve(img);
    };
    img.onerror = () => {
      // Tetap resolve agar tidak block
      resolve(null);
    };
    img.src = SCENES[index].src;
  });
}

/**
 * Tambahkan gambar ke cache. Evict yang paling lama jika penuh.
 */
function addToCache(index, img) {
  if (imageCache.has(index)) {
    imageCache.delete(index);
  }
  imageCache.set(index, img);

  // Evict oldest jika melebihi batas
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldestKey = imageCache.keys().next().value;
    imageCache.delete(oldestKey);
  }
}

/**
 * Cek apakah gambar sudah tersedia di cache.
 */
function isImageCached(index) {
  return imageCache.has(index);
}

/**
 * Preload scene-scene tetangga di background (tidak blocking).
 * Membaca links[] dari scene aktif dan preload semua targetId-nya.
 */
function preloadNeighbors(centerIndex) {
  const scene = SCENES[centerIndex];
  if (!scene || !scene.links) return;

  scene.links.forEach((link) => {
    const targetIdx = SCENES.findIndex((s) => s.id === link.targetId);
    if (targetIdx !== -1 && !imageCache.has(targetIdx)) {
      loadImage(targetIdx); // fire-and-forget
    }
  });
}

// ── Init ───────────────────────────────────────────────────
function init() {
  if ($sceneTotal) $sceneTotal.textContent = SCENES.length;

  // Default A-Frame di mobile menyalakan gyro saat load, sinkronisasikan state-nya
  if (
    typeof AFRAME !== "undefined" &&
    AFRAME.utils &&
    AFRAME.utils.device &&
    AFRAME.utils.device.isMobile()
  ) {
    window.gyroEnabled = true;
    if ($btnGyro) {
      $btnGyro.textContent = "GYRO: ON";
      $btnGyro.style.color = "var(--accent)";
      $btnGyro.style.borderColor = "var(--accent)";
    }
  } else {
    window.gyroEnabled = false;
    if ($btnGyro) {
      $btnGyro.textContent = "GYRO: OFF";
    }
  }

  buildDots();
  loadFirstScene();
  bindEvents();
  bindZoom();
  initVirtualNav();
  populateSceneSelector();
  startCompass();
  scheduleDragHintDismiss();
  bindTouchPitch(); // Pitch manual saat Gyro OFF
  bindMouseInertia(); // Smooth stopping saat mouse drag dilepas
}

// ── Build Scene Dots (max 3 bulir) ─────────────────────────
// Hanya 3 dot: kiri = awal, tengah = tengah, kanan = akhir
function buildDots() {
  $sceneDots.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "scene-dot";
    $sceneDots.appendChild(dot);
  }
  updateDots();
}

/**
 * Update posisi dot aktif berdasarkan currentIndex:
 * - Foto pertama (index 0) → dot kiri aktif
 * - Foto terakhir → dot kanan aktif
 * - Di tengah-tengah → dot tengah aktif
 */
function updateDots() {
  const dots = $sceneDots.querySelectorAll(".scene-dot");
  if (dots.length < 3) return;

  let activeIdx;
  if (currentIndex === 0) {
    activeIdx = 0; // kiri
  } else if (currentIndex === SCENES.length - 1) {
    activeIdx = 2; // kanan
  } else {
    activeIdx = 1; // tengah
  }

  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === activeIdx);
  });
}

// ── Load First Scene (menggantikan preloadAssets) ──────────
// Hanya muat 1 gambar pertama, lalu preload tetangga di background.
function loadFirstScene() {
  $loadingHint.textContent = "Memuat panorama 360°...";

  // Simulasi progress bar yang halus
  let fakeProgress = 0;
  const fakeInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 15, 85);
    $loadingBar.style.width = fakeProgress + "%";
  }, 200);

  const aScene = document.getElementById("aScene");

  const applyFirstScene = () => {
    // Muat gambar pertama
    loadImage(0).then(() => {
      clearInterval(fakeInterval);
      $loadingBar.style.width = "100%";
      $loadingHint.textContent = "Siap!";

      $sky.setAttribute("src", SCENES[0].src);
      $sky.setAttribute("rotation", SCENES[0].rotation);
      applyCameraYaw(SCENES[0].cameraYaw);
      updateHUD();

      // Preload tetangga di background
      preloadNeighbors(0);

      setTimeout(hideLoading, 400);
    });
  };

  if (aScene.hasLoaded) {
    applyFirstScene();
  } else {
    aScene.addEventListener("loaded", applyFirstScene, { once: true });
  }

  // Fallback timeout (jika gambar pertama gagal load)
  setTimeout(() => {
    if (!$loadingScreen.classList.contains("hidden")) {
      clearInterval(fakeInterval);
      $loadingBar.style.width = "100%";
      $sky.setAttribute("src", SCENES[0].src);
      $sky.setAttribute("rotation", SCENES[0].rotation);
      applyCameraYaw(SCENES[0].cameraYaw);
      updateHUD();
      setTimeout(hideLoading, 300);
    }
  }, 15000);
}

function hideLoading() {
  $loadingScreen.classList.add("hidden");
}

// ── Core: Go To Scene (Google Maps zoom-forward transition) ──
const FOV_NORMAL = 80; // derajat FOV saat normal
const FOV_ZOOMED = 55; // derajat FOV saat zoom-in
const ZOOM_IN_MS = 300; // durasi zoom-in (ms)
const ZOOM_OUT_MS = 380; // durasi zoom-out / settle (ms)

function goToScene(index) {
  if (isTransitioning) return;
  // Bounds check (navigasi sekarang berbasis graph, bukan circular)
  if (index < 0 || index >= SCENES.length) return;

  if (index === currentIndex) return;

  isTransitioning = true;
  const next = SCENES[index];
  const camEl = document.getElementById("camera");
  const canvas = document.querySelector("a-scene canvas");

  // Cek apakah gambar sudah ada di cache
  if (isImageCached(index)) {
    // Gambar sudah siap — langsung transisi
    performTransition(index, next, camEl, canvas);
  } else {
    // Gambar belum siap — tampilkan spinner, muat dulu
    showSceneSpinner();

    loadImage(index).then(() => {
      hideSceneSpinner();
      performTransition(index, next, camEl, canvas);
    });
  }
}

/**
 * Jalankan animasi transisi zoom-forward yang dioptimalkan.
 * Alur: zoom-in (blur) → swap gambar → zoom-out
 */
function performTransition(index, next, camEl, canvas) {
  // Sembunyikan nav buttons selama transisi
  hideNavButtons();

  // ── Phase 1: Zoom-in + blur (maju ke depan) ───────────
  canvas?.classList.add("vr-zoom");

  animateFOV(camEl, FOV_NORMAL, FOV_ZOOMED, ZOOM_IN_MS, easeInQuart, () => {
    // ── Midpoint: swap scene di titik paling blur ──────
    // Blur + scale cukup menyembunyikan pergantian tanpa overlay
    resetZoom();
    $sky.setAttribute("src", next.src);
    $sky.setAttribute("rotation", next.rotation);
    applyCameraYaw(next.cameraYaw);
    currentIndex = index;
    updateHUD();

    // ── Phase 2: Zoom-out (settle ke lokasi baru) ──────
    canvas?.classList.remove("vr-zoom");
    animateFOV(camEl, FOV_ZOOMED, FOV_NORMAL, ZOOM_OUT_MS, easeOutQuart, () => {
      isTransitioning = false;
    });

    // Preload tetangga baru di background
    preloadNeighbors(index);
  });
}

/**
 * Tampilkan mini spinner saat gambar scene sedang dimuat.
 */
function showSceneSpinner() {
  if ($sceneSpinner) $sceneSpinner.classList.add("visible");
}

function hideSceneSpinner() {
  if ($sceneSpinner) $sceneSpinner.classList.remove("visible");
}

// ── FOV Animation Engine ───────────────────────────────────
function animateFOV(camEl, fromFov, toFov, duration, easeFn, onComplete) {
  const startTime = performance.now();

  function tick(now) {
    const raw = Math.min((now - startTime) / duration, 1);
    const eased = easeFn(raw);
    const fov = fromFov + (toFov - fromFov) * eased;

    camEl.setAttribute("camera", "fov", fov);

    if (raw < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete && onComplete();
    }
  }

  requestAnimationFrame(tick);
}

// ── Easing functions ───────────────────────────────────────
// Quart: lebih ekspresif dari cubic — akselerasi lebih cepat, deselerasi lebih smooth
function easeInQuart(t) {
  return t * t * t * t;
}
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}
// Cubic (dipertahankan sebagai referensi)
function easeInCubic(t) {
  return t * t * t;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ── Apply Camera Yaw (arah pandang awal per scene) ─────────
function applyCameraYaw(yawDeg) {
  const camEl = document.getElementById("camera");
  if (!camEl || !camEl.object3D) return;
  camEl.object3D.rotation.y = THREE.MathUtils.degToRad(yawDeg || 0);
  camEl.object3D.rotation.x = 0; // reset pitch ke horizon
}

// ── Virtual Navigation Buttons (Multi-Directional, Dynamic) ──
// Tombol navigasi 3D di-generate secara dinamis dari links[] di scene.js.
// Mendukung 1–4 arah: N (utara), S (selatan), E (timur), W (barat).

// Default posisi per arah mata angin
const DIR_DEFAULTS = {
  N: { pos: "0 0 -5", rot: "-90 0 0" },
  S: { pos: "0 0 5", rot: "-90 180 0" },
  E: { pos: "5 0 0", rot: "-90 -90 0" },
  W: { pos: "-5 0 0", rot: "-90 90 0" },
};

// Warna debug per arah (mudah diganti putih semua saat final)
const DIR_COLORS = {
  N: "#00E676", // hijau
  S: "#FF5252", // merah
  E: "#448AFF", // biru
  W: "#FFD740", // kuning
};

/**
 * Inisialisasi virtual nav — tidak perlu bind handler statis lagi.
 * Tombol dibuat/dihapus secara dinamis oleh updateNavButtons().
 */
function initVirtualNav() {
  // Dynamic buttons — nothing to init
}

/**
 * Cari index scene berdasarkan ID.
 * @param {number} targetId - ID scene tujuan
 * @returns {number} index di array SCENES, atau -1 jika tidak ditemukan
 */
function findSceneIndex(targetId) {
  return SCENES.findIndex((s) => s.id === targetId);
}

/**
 * Navigasi ke scene berdasarkan ID (bukan index).
 * @param {number} targetId - ID scene tujuan
 */
function goToSceneById(targetId) {
  const idx = findSceneIndex(targetId);
  if (idx !== -1) {
    goToScene(idx);
  } else {
    console.warn(`Scene dengan ID ${targetId} tidak ditemukan.`);
  }
}

/**
 * Cari link ke arah tertentu dari scene aktif.
 * @param {string} dir - arah: "N", "S", "E", atau "W"
 * @returns {object|null} link object atau null jika tidak ada
 */
function getLinkByDir(dir) {
  const scene = SCENES[currentIndex];
  if (!scene || !scene.links) return null;
  return scene.links.find((l) => l.dir === dir) || null;
}

/**
 * Buat satu entity tombol navigasi 3D di A-Frame.
 * @param {object} link - objek link dari scene.links[]
 * @returns {HTMLElement} entity A-Frame
 */
function createNavButton(link) {
  const defaults = DIR_DEFAULTS[link.dir] || DIR_DEFAULTS.N;
  const color = DIR_COLORS[link.dir] || "#FFFFFF";

  const entity = document.createElement("a-entity");
  entity.classList.add("clickable", "nav-btn-dynamic");
  entity.setAttribute("position", link.pos || defaults.pos);
  entity.setAttribute("rotation", link.rot || defaults.rot);

  // Arrow triangle
  const tri = document.createElement("a-triangle");
  tri.classList.add("clickable");
  tri.setAttribute("color", color);
  tri.setAttribute("vertex-a", "0 0.35 0");
  tri.setAttribute("vertex-b", "-0.25 -0.15 0");
  tri.setAttribute("vertex-c", "0.25 -0.15 0");
  tri.setAttribute(
    "material",
    "side: double; opacity: 0.85; transparent: true; shader: flat",
  );
  entity.appendChild(tri);

  // Background circle
  const circle = document.createElement("a-circle");
  circle.classList.add("clickable");
  circle.setAttribute("radius", "0.45");
  circle.setAttribute("color", color);
  circle.setAttribute("position", "0 0.07 -0.005");
  circle.setAttribute(
    "material",
    "side: double; opacity: 0.15; transparent: true; shader: flat",
  );
  entity.appendChild(circle);

  // Click handler → navigate to targetId
  entity.addEventListener("click", () => {
    goToSceneById(link.targetId);
  });

  return entity;
}

/**
 * Hapus semua tombol navigasi lama dan buat tombol baru
 * berdasarkan links[] dari scene aktif.
 */
function updateNavButtons() {
  const aScene = document.getElementById("aScene");
  if (!aScene) return;

  // Hapus semua tombol navigasi aktif sebelumnya
  activeNavButtons.forEach((el) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  activeNavButtons = [];

  const scene = SCENES[currentIndex];
  if (!scene || !scene.links || scene.links.length === 0) return;

  // Buat tombol baru untuk setiap link
  scene.links.forEach((link) => {
    const btn = createNavButton(link);
    aScene.appendChild(btn);
    activeNavButtons.push(btn);
  });
}

/**
 * Sembunyikan semua tombol navigasi dinamis saat transisi.
 */
function hideNavButtons() {
  activeNavButtons.forEach((el) => {
    el.setAttribute("visible", false);
  });
}

// ── Label Planes 3D (Panel Nama Lokasi, Multi-Plane Support) ───────
// Dibaca dari field planes[] di scene.js.
// Tiap elemen: { pos: "X Y Z", rot: "X Y Z" }

/**
 * Buat satu entitas label plane di A-Frame secara dinamis.
 * @param {string} label  - teks yang ditampilkan
 * @param {string} pos    - posisi "X Y Z"
 * @param {string} rot    - rotasi "X Y Z" (default "0 0 0")
 */
function createLabelPlaneEntity(label, pos, rot) {
  const entity = document.createElement("a-entity");
  entity.setAttribute("position", pos || "0 2 -8");
  entity.setAttribute("rotation", rot || "0 0 0");

  // Background hitam transparan
  const bg = document.createElement("a-plane");
  bg.setAttribute("width", "3.2");
  bg.setAttribute("height", "0.5");
  bg.setAttribute("color", "#000000");
  bg.setAttribute(
    "material",
    "opacity: 0.60; transparent: true; shader: flat; side: double",
  );
  bg.setAttribute("position", "0 0 0");
  entity.appendChild(bg);

  // Teks label putih di tengah plane
  const text = document.createElement("a-text");
  text.setAttribute("value", label || "");
  text.setAttribute("color", "#FFFFFF");
  text.setAttribute("align", "center");
  text.setAttribute("anchor", "center");
  text.setAttribute("baseline", "center");
  text.setAttribute("width", "3.0");
  text.setAttribute("position", "0 0 0.01");
  entity.appendChild(text);

  return entity;
}

/**
 * Hapus semua plane lama dan buat plane baru sesuai data scene aktif.
 * Membaca field planes[] dari SCENES[currentIndex].
 * Jika planes tidak ada / kosong, tidak ada plane yang ditampilkan.
 */
function updateLabelPlanes() {
  const aScene = document.getElementById("aScene");
  if (!aScene) return;

  // Hapus semua plane aktif sebelumnya
  activeLabelPlanes.forEach((el) => {
    if (el.parentNode) el.parentNode.removeChild(el);
  });
  activeLabelPlanes = [];

  const scene = SCENES[currentIndex];
  const planes = scene.planes;

  // Tidak ada planes di scene ini → tidak perlu render apapun
  if (!planes || planes.length === 0) return;

  // Buat entitas baru untuk setiap plane
  planes.forEach((planeDef) => {
    const entity = createLabelPlaneEntity(
      planeDef.label || scene.label, // label per-plane, fallback ke label scene
      planeDef.pos,
      planeDef.rot,
    );
    aScene.appendChild(entity);
    activeLabelPlanes.push(entity);
  });
}

// ── Update HUD ──────────────────────────────────────────────
function updateHUD() {
  const scene = SCENES[currentIndex];

  if ($sceneLabel) $sceneLabel.textContent = scene.label;
  if ($sceneDesc) $sceneDesc.textContent = scene.description;
  if ($sceneNum) $sceneNum.textContent = currentIndex + 1;

  // HUD buttons: disable jika tidak ada link ke arah N/S
  if ($btnPrev) $btnPrev.disabled = !getLinkByDir("S");
  if ($btnNext) $btnNext.disabled = !getLinkByDir("N");

  // Update 3-dot indicator
  updateDots();

  // Update tombol navigasi 3D (dynamic, multi-arah)
  updateNavButtons();

  // Update label planes 3D (multi-plane support)
  updateLabelPlanes();
}

// ── Compass (live dari rotasi kamera) ──────────────────────
// COMPASS_OFFSET: geser arah North di HUD (derajat, searah jarum jam)
// 0 = default | 90 = North geser 90° ke kanan | -90 = ke kiri
const COMPASS_OFFSET = 90;

function startCompass() {
  const camEl = document.getElementById("camera");
  if (!camEl) return;

  // Tunggu sampai A-Frame scene siap
  const aScene = document.getElementById("aScene");
  const run = () => {
    setInterval(() => {
      if (!camEl.object3D) return;
      const yDeg = THREE.MathUtils.radToDeg(camEl.object3D.rotation.y);
      $compassNeedle.style.transform = `rotate(${-yDeg + COMPASS_OFFSET}deg)`;
    }, 60);
  };

  if (aScene.hasLoaded) run();
  else aScene.addEventListener("loaded", run, { once: true });
}

// ── Drag Hint Auto-hide ─────────────────────────────────────
function scheduleDragHintDismiss() {
  const dismiss = () => {
    if (hintDismissed) return;
    hintDismissed = true;
    $dragHint.classList.add("hidden");
    window.removeEventListener("mousemove", dismiss);
    window.removeEventListener("touchstart", dismiss);
  };
  window.addEventListener("mousemove", dismiss);
  window.addEventListener("touchstart", dismiss);
  setTimeout(dismiss, 5000);
}

// ── Events ─────────────────────────────────────────────────
function bindEvents() {
  // HUD buttons: next = follow N link, prev = follow S link
  if ($btnNext) {
    $btnNext.addEventListener("click", () => {
      const link = getLinkByDir("N");
      if (link) goToSceneById(link.targetId);
    });
  }

  if ($btnPrev) {
    $btnPrev.addEventListener("click", () => {
      const link = getLinkByDir("S");
      if (link) goToSceneById(link.targetId);
    });
  }

  // Keyboard navigation (multi-directional)
  // Arrow keys / WASD → follow link ke arah N/S/E/W
  document.addEventListener("keydown", (e) => {
    let dir = null;
    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        dir = "N";
        break;
      case "ArrowDown":
      case "s":
        dir = "S";
        break;
      case "ArrowRight":
      case "d":
      case "D":
        dir = "E";
        break;
      case "ArrowLeft":
      case "a":
        dir = "A";
        break;
      case "f":
      case "F":
        toggleFullscreen();
        return;
    }
    // 'A' dan 'a' dipetakan ke W (Barat), 'S' hanya lowercase agar tidak bentrok Shift+S
    if (dir === "A") dir = "W";
    if (dir) {
      const link = getLinkByDir(dir);
      if (link) goToSceneById(link.targetId);
    }
  });

  $btnFullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", onFullscreenChange);

  $btnGyro.addEventListener("click", toggleGyro);
}

// ── Zoom (scroll wheel + pinch) ────────────────────────────
// Mengubah FOV kamera untuk efek zoom in/out pada panorama
const ZOOM_FOV_MIN = 30; // zoom-in maksimal
const ZOOM_FOV_MAX = 100; // zoom-out maksimal
let currentFov = FOV_NORMAL;

function bindZoom() {
  const canvas = document.querySelector("a-scene");
  if (!canvas) return;

  // Mouse wheel zoom
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 3 : -3; // scroll down = zoom out, up = zoom in
      applyZoom(delta);
    },
    { passive: false },
  );

  // Pinch zoom (mobile)
  let lastPinchDist = 0;

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      lastPinchDist = getPinchDistance(e.touches);
    }
  });

  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const dist = getPinchDistance(e.touches);
      const diff = lastPinchDist - dist;
      applyZoom(diff * 0.15); // pinch in = zoom in, pinch out = zoom out
      lastPinchDist = dist;
    }
  });
}

function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function applyZoom(delta) {
  if (isTransitioning) return;
  const camEl = document.getElementById("camera");
  if (!camEl) return;

  currentFov = Math.max(
    ZOOM_FOV_MIN,
    Math.min(ZOOM_FOV_MAX, currentFov + delta),
  );
  camEl.setAttribute("camera", "fov", currentFov);
}

// Reset zoom saat pindah scene
function resetZoom() {
  currentFov = FOV_NORMAL;
  const camEl = document.getElementById("camera");
  if (camEl) camEl.setAttribute("camera", "fov", FOV_NORMAL);
}

// ── Fullscreen ─────────────────────────────────────────────
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function onFullscreenChange() {
  const isFs = !!document.fullscreenElement;
  $btnFullscreen.title = isFs ? "Keluar Layar Penuh" : "Layar Penuh";
  $btnFullscreen.style.color = isFs ? "var(--accent)" : "";
}

// ── Gyroscope ─────────────────────────────────────────────
function toggleGyro() {
  if (typeof DeviceOrientationEvent === "undefined") {
    alert("Gyroscope tidak tersedia di perangkat ini.");
    return;
  }
  if (!window.gyroEnabled) {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((r) => {
          if (r === "granted") enableGyro();
        })
        .catch(console.error);
    } else {
      enableGyro();
    }
  } else {
    disableGyro();
  }
}

function enableGyro() {
  window.gyroEnabled = true;
  if ($btnGyro) {
    $btnGyro.textContent = "GYRO: ON";
    $btnGyro.style.color = "var(--accent)";
    $btnGyro.style.borderColor = "var(--accent)";
  }
}

function disableGyro() {
  window.gyroEnabled = false;
  if ($btnGyro) {
    $btnGyro.textContent = "GYRO: OFF";
    $btnGyro.style.color = "";
    $btnGyro.style.borderColor = "";
  }
}

// ── Touch Pitch Manual (aktif saat Gyro OFF) ───────────────
// A-Frame hanya handle yaw via touch di mobile.
// Saat gyro dimatikan, handler ini tambah kontrol pitch (atas-bawah)
// secara langsung ke camera object3D tanpa konflik.
function bindTouchPitch() {
  const aScene = document.getElementById("aScene");
  if (!aScene) return;

  let lastTouchY = 0;
  const PITCH_SENSITIVITY = 0.004; // radian per pixel
  const PITCH_MAX = Math.PI / 2; // 90 derajat batas atas/bawah

  aScene.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        lastTouchY = e.touches[0].clientY;
      }
    },
    { passive: true },
  );

  aScene.addEventListener(
    "touchmove",
    (e) => {
      // Hanya aktif saat gyro OFF dan single touch
      if (window.gyroEnabled || e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const deltaY = currentY - lastTouchY;
      lastTouchY = currentY;

      const camEl = document.getElementById("camera");
      if (!camEl || !camEl.object3D) return;

      // Tambah pitch (A-Frame sudah handle yaw via touchmove-nya sendiri)
      const newPitch = Math.max(
        -PITCH_MAX,
        Math.min(
          PITCH_MAX,
          camEl.object3D.rotation.x + deltaY * PITCH_SENSITIVITY,
        ),
      );
      camEl.object3D.rotation.x = newPitch;
    },
    { passive: true },
  );
}

// ── Mouse Drag Inertia (Smooth Stopping) ───────────────────
// Setelah user melepas mouse drag, kamera tetap berputar
// dengan kecepatan yang menurun secara halus (momentum).
function bindMouseInertia() {
  const aScene = document.getElementById("aScene");
  if (!aScene) return;

  let isDragging = false;
  let velocityX = 0; // yaw velocity (rad/frame)
  let velocityY = 0; // pitch velocity (rad/frame)
  let lastMouseX = 0;
  let lastMouseY = 0;
  let lastMoveTime = 0;
  let inertiaRAF = null;

  const FRICTION = 0.92; // Faktor pelambatan per frame (0.92 = halus)
  const VELOCITY_THRESHOLD = 0.0001; // Batas minimum velocity untuk berhenti
  const SENSITIVITY = 0.003; // Sensitivitas velocity dari mouse movement
  const PITCH_MAX = Math.PI / 2.5; // Batas pitch atas/bawah (72 derajat)

  // Track mouse down
  aScene.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // Hanya left click
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastMoveTime = performance.now();
    velocityX = 0;
    velocityY = 0;

    // Hentikan inertia yang sedang berjalan
    if (inertiaRAF) {
      cancelAnimationFrame(inertiaRAF);
      inertiaRAF = null;
    }
  });

  // Track mouse movement untuk menghitung velocity
  aScene.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const now = performance.now();
    const dt = now - lastMoveTime;

    if (dt > 0) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;

      // Hitung velocity (dengan smoothing)
      velocityX = velocityX * 0.5 + dx * SENSITIVITY * 0.5;
      velocityY = velocityY * 0.5 + dy * SENSITIVITY * 0.5;
    }

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastMoveTime = now;
  });

  // Mouse up → mulai inertia
  const onMouseUp = (e) => {
    if (!isDragging) return;
    isDragging = false;

    // Jika mouse diam terlalu lama sebelum release, jangan ada inertia
    const timeSinceLastMove = performance.now() - lastMoveTime;
    if (timeSinceLastMove > 80) {
      velocityX = 0;
      velocityY = 0;
      return;
    }

    // Mulai animasi inertia
    startInertia();
  };

  window.addEventListener("mouseup", onMouseUp);

  function startInertia() {
    const camEl = document.getElementById("camera");
    if (!camEl || !camEl.object3D) return;

    // Hanya jalankan jika ada velocity yang signifikan
    if (
      Math.abs(velocityX) < VELOCITY_THRESHOLD &&
      Math.abs(velocityY) < VELOCITY_THRESHOLD
    ) {
      return;
    }

    function inertiaStep() {
      // Apply friction
      velocityX *= FRICTION;
      velocityY *= FRICTION;

      // Berhenti jika velocity sudah sangat kecil
      if (
        Math.abs(velocityX) < VELOCITY_THRESHOLD &&
        Math.abs(velocityY) < VELOCITY_THRESHOLD
      ) {
        velocityX = 0;
        velocityY = 0;
        inertiaRAF = null;
        return;
      }

      // Apply rotation (inverted karena reverseMouseDrag: true)
      // Yaw: velocityX positif = mouse geser kanan = kamera geser kiri
      camEl.object3D.rotation.y += velocityX;

      // Pitch: velocityY positif = mouse geser bawah = kamera geser atas
      const newPitch = camEl.object3D.rotation.x + velocityY;
      camEl.object3D.rotation.x = Math.max(
        -PITCH_MAX,
        Math.min(PITCH_MAX, newPitch),
      );

      inertiaRAF = requestAnimationFrame(inertiaStep);
    }

    inertiaRAF = requestAnimationFrame(inertiaStep);
  }
}

// ── Jump to Scene by ID (Shortcut) ─────────────────────────
window.jumpToSceneById = function (id) {
  goToSceneById(Number(id));
};

function populateSceneSelector() {
  if (!$selectScene) return;
  $selectScene.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Lompat ke...";
  placeholder.disabled = true;
  placeholder.selected = true;
  $selectScene.appendChild(placeholder);

  // Kelompokkan scene berdasarkan label (case-insensitive).
  // Simpan hanya scene dengan ID terkecil per label unik.
  const labelMap = new Map(); // key: label lowercase, value: scene object (ID terkecil)

  SCENES.forEach((scene) => {
    const key = (scene.label || "").trim().toLowerCase();
    if (!key) return; // skip scene tanpa label

    if (!labelMap.has(key)) {
      labelMap.set(key, scene);
    } else {
      // Ambil yang ID-nya lebih kecil
      if (scene.id < labelMap.get(key).id) {
        labelMap.set(key, scene);
      }
    }
  });

  // Urutkan berdasarkan ID scene terkecil di tiap grup agar urutan logis
  const uniqueScenes = Array.from(labelMap.values()).sort(
    (a, b) => a.id - b.id,
  );

  uniqueScenes.forEach((scene) => {
    const opt = document.createElement("option");
    opt.value = scene.id;
    opt.textContent = scene.label || "Lokasi " + scene.id;
    $selectScene.appendChild(opt);
  });

  $selectScene.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val) {
      window.jumpToSceneById(val);
      $selectScene.value = "";
    }
  });
}

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
