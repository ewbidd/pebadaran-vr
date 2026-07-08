/* =========================================================
   VIRTUAL TOUR – Kampung Pebadaran
   app.js – Three.js Implementation (Google Street View UX)
   =========================================================
   Fitur:
   - Three.js panorama sphere (SphereGeometry + BackSide)
   - OrbitControls (damping, zoom, pitch/yaw built-in)
   - LAZY LOADING: Hanya muat gambar yang dibutuhkan
   - Smart preload: otomatis siapkan scene tetangga (links[])
   - Image/Texture cache dengan LRU (max 7 di memory)
   - Mini spinner saat scene belum siap
   - Zoom-forward transition (Google Maps style)
   - Multi-directional nav: N/S/E/W (simpang 3 & 4)
   - Dynamic 3D nav arrows (raycaster click)
   - Dynamic 3D label planes (CanvasTexture)
   - HUD: scene info, scene selector, scene dots
   - Compass live (mengikuti arah pandang kamera)
   - Fullscreen API, Gyroscope mobile
   - Drag hint auto-hide
   - Grab/grabbing cursor (Google Street View style)
   ========================================================= */

"use strict";

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── DOM References ─────────────────────────────────────────
const $loadingScreen = document.getElementById("loading-screen");
const $loadingBar = document.getElementById("loadingBar");
const $loadingHint = document.getElementById("loadingHint");

const $canvas = document.getElementById("vrCanvas");
const $fadeOverlay = document.getElementById("fadeOverlay");

const $btnFullscreen = document.getElementById("btnFullscreen");
const $btnGyro = document.getElementById("btnGyro");

const $sceneLabel = document.getElementById("sceneLabel");
const $sceneDesc = document.getElementById("sceneDesc");
const $sceneDots = document.getElementById("sceneDots");
const $dragHint = document.getElementById("dragHint");
const $compassNeedle = document.querySelector(".compass-needle");
const $sceneSpinner = document.getElementById("sceneSpinner");
const $selectScene = document.getElementById("selectScene");

// ── Three.js Core ─────────────────────────────────────────
let scene, camera, renderer, orbitControls;
let sphereMesh, sphereMaterial;
const textureLoader = new THREE.TextureLoader();

// ── State ──────────────────────────────────────────────────
let currentIndex = 0;
let isTransitioning = false;
let hintDismissed = false;
let gyroEnabled = false;

// 3D objects in scene (to be cleaned up on scene change)
let activeNavArrows = [];    // THREE.Group objects for nav arrows
let activeLabelPlanes = [];  // THREE.Mesh objects for label planes
let nadirMesh = null;        // nadir copyright mesh

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredArrow = null;

// ── Texture Cache (LRU) ──────────────────────────────────
const TEXTURE_CACHE_MAX = 7;
const textureCache = new Map(); // key: scene index, value: THREE.Texture

// ── FOV Constants ──────────────────────────────────────────
const FOV_NORMAL = 80;
const FOV_ZOOMED = 55;
const ZOOM_IN_MS = 300;
const ZOOM_OUT_MS = 380;
const ZOOM_FOV_MIN = 30;
const ZOOM_FOV_MAX = 100;

// Default positions per compass direction
const DIR_DEFAULTS = {
  N: { pos: "0 0 -5", rot: "-90 0 0" },
  S: { pos: "0 0 5", rot: "-90 180 0" },
  E: { pos: "5 0 0", rot: "-90 -90 0" },
  W: { pos: "-5 0 0", rot: "-90 90 0" },
};

// Colors per compass direction
const DIR_COLORS = {
  N: "#00E676",
  S: "#FF5252",
  E: "#448AFF",
  W: "#FFD740",
};

// Compass offset
const COMPASS_OFFSET = 90;

// ── Utility: Parse A-Frame format strings ──────────────────
function parsePosition(str) {
  const parts = str.trim().split(/\s+/).map(Number);
  return new THREE.Vector3(parts[0] || 0, parts[1] || 0, parts[2] || 0);
}

function parseRotationDeg(str) {
  const parts = str.trim().split(/\s+/).map(Number);
  return new THREE.Euler(
    THREE.MathUtils.degToRad(parts[0] || 0),
    THREE.MathUtils.degToRad(parts[1] || 0),
    THREE.MathUtils.degToRad(parts[2] || 0)
  );
}

// ── Easing functions ───────────────────────────────────────
function easeInQuart(t) {
  return t * t * t * t;
}
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// ══════════════════════════════════════════════════════════════
//  THREE.JS SETUP
// ══════════════════════════════════════════════════════════════

function initThree() {
  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(
    FOV_NORMAL,
    window.innerWidth / window.innerHeight,
    0.1,
    1100
  );
  camera.position.set(0, 0, 0.01); // slightly off center for OrbitControls

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: $canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  // Panorama Sphere
  const sphereGeo = new THREE.SphereGeometry(500, 64, 32);
  sphereGeo.scale(-1, 1, 1); // invert so texture is on inside
  sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.FrontSide,
  });
  sphereMesh = new THREE.Mesh(sphereGeo, sphereMaterial);
  scene.add(sphereMesh);

  // OrbitControls
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.enableZoom = false;    // We handle zoom via FOV
  orbitControls.enablePan = false;
  orbitControls.rotateSpeed = -0.3;    // negative = reverse drag (Google Street View style)
  orbitControls.target.set(0, 0, 0);
  // Limit vertical rotation
  orbitControls.minPolarAngle = 0.1;   // don't go fully above
  orbitControls.maxPolarAngle = Math.PI - 0.1; // don't go fully below

  // Window resize handler
  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ══════════════════════════════════════════════════════════════
//  TEXTURE CACHE (LRU)
// ══════════════════════════════════════════════════════════════

function loadTexture(index) {
  if (index < 0 || index >= SCENES.length) return Promise.resolve(null);

  // Already cached?
  if (textureCache.has(index)) {
    const cached = textureCache.get(index);
    textureCache.delete(index);
    textureCache.set(index, cached);
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    textureLoader.load(
      SCENES[index].src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        addToCache(index, texture);
        resolve(texture);
      },
      undefined,
      (err) => {
        console.warn("Texture load error for index", index, err);
        resolve(null);
      }
    );
  });
}

function addToCache(index, texture) {
  if (textureCache.has(index)) {
    textureCache.delete(index);
  }
  textureCache.set(index, texture);

  // Evict oldest if over limit
  while (textureCache.size > TEXTURE_CACHE_MAX) {
    const oldestKey = textureCache.keys().next().value;
    const oldTex = textureCache.get(oldestKey);
    if (oldTex) oldTex.dispose();
    textureCache.delete(oldestKey);
  }
}

function isTextureCached(index) {
  return textureCache.has(index);
}

function preloadNeighbors(centerIndex) {
  const sceneData = SCENES[centerIndex];
  if (!sceneData || !sceneData.links) return;

  sceneData.links.forEach((link) => {
    const targetIdx = SCENES.findIndex((s) => s.id === link.targetId);
    if (targetIdx !== -1 && !textureCache.has(targetIdx)) {
      loadTexture(targetIdx); // fire-and-forget
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  SCENE APPLICATION (apply texture + rotation + camera yaw)
// ══════════════════════════════════════════════════════════════

function applyScene(index) {
  const sceneData = SCENES[index];
  const texture = textureCache.get(index);

  // Apply texture
  if (texture) {
    sphereMaterial.map = texture;
    sphereMaterial.color.setHex(0xffffff);
    sphereMaterial.needsUpdate = true;
  }

  // Apply sphere rotation (image rotation from scene.js)
  if (sceneData.rotation) {
    const euler = parseRotationDeg(sceneData.rotation);
    sphereMesh.rotation.set(euler.x, euler.y, euler.z);
  } else {
    sphereMesh.rotation.set(0, 0, 0);
  }

  // Apply camera yaw
  applyCameraYaw(sceneData.cameraYaw || 0);
}

function applyCameraYaw(yawDeg) {
  const yawRad = THREE.MathUtils.degToRad(yawDeg || 0);

  // Reset camera to center
  camera.position.set(0, 0, 0.01);

  // Calculate target point from yaw
  // In Three.js: yaw = rotation around Y axis
  // A-Frame yaw 0 = forward (-Z), 90 = right (+X), -90 = left (-X)
  const targetX = Math.sin(yawRad) * 10;
  const targetZ = -Math.cos(yawRad) * 10;

  orbitControls.target.set(targetX, 0, targetZ);
  orbitControls.update();
}

// ══════════════════════════════════════════════════════════════
//  3D NAV ARROWS
// ══════════════════════════════════════════════════════════════

function createNavArrow(link) {
  const defaults = DIR_DEFAULTS[link.dir] || DIR_DEFAULTS.N;
  const colorHex = DIR_COLORS[link.dir] || "#FFFFFF";
  const color = new THREE.Color(colorHex);

  const group = new THREE.Group();
  group.userData = { targetId: link.targetId, dir: link.dir, isNavArrow: true };

  // Arrow triangle
  const triShape = new THREE.Shape();
  triShape.moveTo(0, 0.35);
  triShape.lineTo(-0.25, -0.15);
  triShape.lineTo(0.25, -0.15);
  triShape.closePath();

  const triGeo = new THREE.ShapeGeometry(triShape);
  const triMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const triMesh = new THREE.Mesh(triGeo, triMat);
  triMesh.userData = { isNavArrow: true, targetId: link.targetId };
  group.add(triMesh);

  // Background circle
  const circleGeo = new THREE.CircleGeometry(0.45, 32);
  const circleMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const circleMesh = new THREE.Mesh(circleGeo, circleMat);
  circleMesh.position.set(0, 0.07, -0.005);
  circleMesh.userData = { isNavArrow: true, targetId: link.targetId };
  group.add(circleMesh);

  // Outer glow ring (for hover effect)
  const glowGeo = new THREE.RingGeometry(0.42, 0.52, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.set(0, 0.07, -0.006);
  glowMesh.userData = { isGlow: true };
  group.add(glowMesh);

  // Position & rotation
  const pos = parsePosition(link.pos || defaults.pos);
  const rot = parseRotationDeg(link.rot || defaults.rot);
  group.position.copy(pos);
  group.rotation.copy(rot);

  return group;
}

function updateNavArrows() {
  // Remove existing arrows
  activeNavArrows.forEach((g) => {
    scene.remove(g);
    g.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  });
  activeNavArrows = [];

  const sceneData = SCENES[currentIndex];
  if (!sceneData || !sceneData.links || sceneData.links.length === 0) return;

  sceneData.links.forEach((link) => {
    const arrow = createNavArrow(link);
    scene.add(arrow);
    activeNavArrows.push(arrow);
  });
}

function hideNavArrows() {
  activeNavArrows.forEach((g) => {
    g.visible = false;
  });
}

// ══════════════════════════════════════════════════════════════
//  3D LABEL PLANES (CanvasTexture)
// ══════════════════════════════════════════════════════════════

function createTextTexture(text, options = {}) {
  const fontSize = options.fontSize || 40;
  const fontFamily = options.fontFamily || "Inter, sans-serif";
  const textColor = options.textColor || "#FFFFFF";
  const bgColor = options.bgColor || "rgba(0, 0, 0, 0.60)";
  const padding = options.padding || 24;

  // Measure text
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = `500 ${fontSize}px ${fontFamily}`;
  const metrics = measureCtx.measureText(text);
  const textWidth = metrics.width;

  const canvasWidth = Math.ceil(textWidth + padding * 2);
  const canvasHeight = Math.ceil(fontSize * 1.5 + padding * 1.2);

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  // Background with rounded corners
  const radius = 12;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(canvasWidth - radius, 0);
  ctx.quadraticCurveTo(canvasWidth, 0, canvasWidth, radius);
  ctx.lineTo(canvasWidth, canvasHeight - radius);
  ctx.quadraticCurveTo(canvasWidth, canvasHeight, canvasWidth - radius, canvasHeight);
  ctx.lineTo(radius, canvasHeight);
  ctx.quadraticCurveTo(0, canvasHeight, 0, canvasHeight - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.font = `500 ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvasWidth / 2, canvasHeight / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return { texture, width: canvasWidth, height: canvasHeight };
}

function createLabelPlane(label, posStr, rotStr) {
  const { texture, width, height } = createTextTexture(label);

  // Scale to world units (maintain aspect ratio)
  const planeHeight = 0.5;
  const planeWidth = (width / height) * planeHeight;

  const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);

  const pos = parsePosition(posStr || "0 2 -8");
  const rot = parseRotationDeg(rotStr || "0 0 0");
  mesh.position.copy(pos);
  mesh.rotation.copy(rot);

  mesh.renderOrder = 1;

  return mesh;
}

function updateLabelPlanes() {
  // Remove existing
  activeLabelPlanes.forEach((m) => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (m.material.map) m.material.map.dispose();
      m.material.dispose();
    }
  });
  activeLabelPlanes = [];

  const sceneData = SCENES[currentIndex];
  const planes = sceneData.planes;
  if (!planes || planes.length === 0) return;

  planes.forEach((planeDef) => {
    const label = planeDef.label || sceneData.label;
    const mesh = createLabelPlane(label, planeDef.pos, planeDef.rot);
    scene.add(mesh);
    activeLabelPlanes.push(mesh);
  });
}

// ── Nadir Copyright ─────────────────────────────────────────

function createNadirCopyright() {
  const { texture, width, height } = createTextTexture(
    "Copyright 2026 | Dibuat oleh Kukerta UNRI 2026",
    {
      fontSize: 28,
      bgColor: "rgba(0, 0, 0, 0)",
      textColor: "rgba(255, 255, 255, 0.7)",
    }
  );

  const planeHeight = 0.4;
  const planeWidth = (width / height) * planeHeight;

  const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  nadirMesh = new THREE.Mesh(geo, mat);
  nadirMesh.position.set(0, 0.05, 0);
  nadirMesh.rotation.set(-Math.PI / 2, 0, 0);
  nadirMesh.renderOrder = 2;
  scene.add(nadirMesh);
}

// ══════════════════════════════════════════════════════════════
//  SCENE NAVIGATION
// ══════════════════════════════════════════════════════════════

function goToScene(index) {
  if (isTransitioning) return;
  if (index < 0 || index >= SCENES.length) return;
  if (index === currentIndex) return;

  isTransitioning = true;

  if (isTextureCached(index)) {
    performTransition(index);
  } else {
    showSceneSpinner();
    loadTexture(index).then(() => {
      hideSceneSpinner();
      performTransition(index);
    });
  }
}

function performTransition(index) {
  hideNavArrows();

  // Phase 1: Zoom-in + blur
  $canvas.classList.add("vr-zoom");

  animateFOV(FOV_NORMAL, FOV_ZOOMED, ZOOM_IN_MS, easeInQuart, () => {
    // Midpoint: swap scene
    $canvas.classList.remove("vr-zoom");

    currentIndex = index;
    applyScene(index);
    updateHUD();

    // Reset FOV for zoom-out
    camera.fov = FOV_ZOOMED;
    camera.updateProjectionMatrix();

    // Phase 2: Zoom-out (settle)
    animateFOV(FOV_ZOOMED, FOV_NORMAL, ZOOM_OUT_MS, easeOutQuart, () => {
      isTransitioning = false;
    });

    preloadNeighbors(index);
  });
}

function animateFOV(fromFov, toFov, duration, easeFn, onComplete) {
  const startTime = performance.now();

  function tick(now) {
    const raw = Math.min((now - startTime) / duration, 1);
    const eased = easeFn(raw);
    const fov = fromFov + (toFov - fromFov) * eased;

    camera.fov = fov;
    camera.updateProjectionMatrix();

    if (raw < 1) {
      requestAnimationFrame(tick);
    } else {
      onComplete && onComplete();
    }
  }

  requestAnimationFrame(tick);
}

function findSceneIndex(targetId) {
  return SCENES.findIndex((s) => s.id === targetId);
}

function goToSceneById(targetId) {
  const idx = findSceneIndex(targetId);
  if (idx !== -1) {
    goToScene(idx);
  }
}

function getLinkByDir(dir) {
  const sceneData = SCENES[currentIndex];
  if (!sceneData || !sceneData.links) return null;
  return sceneData.links.find((l) => l.dir === dir) || null;
}

// ══════════════════════════════════════════════════════════════
//  SPINNERS
// ══════════════════════════════════════════════════════════════

function showSceneSpinner() {
  if ($sceneSpinner) $sceneSpinner.classList.add("visible");
}

function hideSceneSpinner() {
  if ($sceneSpinner) $sceneSpinner.classList.remove("visible");
}

// ══════════════════════════════════════════════════════════════
//  RAYCASTER (Click & Hover on Nav Arrows)
// ══════════════════════════════════════════════════════════════

function onPointerMove(event) {
  // Calculate normalized mouse position
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Raycast against nav arrows
  raycaster.setFromCamera(mouse, camera);
  const clickables = [];
  activeNavArrows.forEach((g) => {
    g.traverse((child) => {
      if (child.isMesh && !child.userData.isGlow) clickables.push(child);
    });
  });

  const intersects = raycaster.intersectObjects(clickables, false);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const arrowGroup = findParentArrowGroup(hit);

    if (arrowGroup && hoveredArrow !== arrowGroup) {
      // Unhover previous
      if (hoveredArrow) unhoverArrow(hoveredArrow);
      hoveredArrow = arrowGroup;
      hoverArrow(arrowGroup);
      $canvas.style.cursor = "pointer";
    }
  } else {
    if (hoveredArrow) {
      unhoverArrow(hoveredArrow);
      hoveredArrow = null;
      $canvas.style.cursor = "";
    }
  }
}

function findParentArrowGroup(mesh) {
  let obj = mesh;
  while (obj) {
    if (obj.userData && obj.userData.isNavArrow) return obj;
    obj = obj.parent;
  }
  return null;
}

function hoverArrow(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.isGlow) {
        child.material.opacity = 0.4;
      }
    }
  });
  // Scale up slightly
  group.scale.set(1.2, 1.2, 1.2);
}

function unhoverArrow(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.isGlow) {
        child.material.opacity = 0;
      }
    }
  });
  group.scale.set(1, 1, 1);
}

function onPointerDown(event) {
  // Store mouse position to detect click vs drag
  onPointerDown._startX = event.clientX;
  onPointerDown._startY = event.clientY;
}

function onPointerUp(event) {
  // Only fire click if mouse didn't drag significantly
  const dx = event.clientX - (onPointerDown._startX || 0);
  const dy = event.clientY - (onPointerDown._startY || 0);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 5) return; // was a drag, not a click

  if (isTransitioning) return;

  // Raycast for click
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const clickables = [];
  activeNavArrows.forEach((g) => {
    g.traverse((child) => {
      if (child.isMesh && !child.userData.isGlow) clickables.push(child);
    });
  });

  const intersects = raycaster.intersectObjects(clickables, false);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const arrowGroup = findParentArrowGroup(hit);
    if (arrowGroup && arrowGroup.userData.targetId != null) {
      goToSceneById(arrowGroup.userData.targetId);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  HUD MANAGEMENT
// ══════════════════════════════════════════════════════════════

function updateHUD() {
  const sceneData = SCENES[currentIndex];

  if ($sceneLabel) $sceneLabel.textContent = sceneData.label;
  if ($sceneDesc) $sceneDesc.textContent = sceneData.description;

  updateDots();
  updateNavArrows();
  updateLabelPlanes();
}

// ── Scene Dots (3 dots) ─────────────────────────────────────

function buildDots() {
  $sceneDots.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "scene-dot";
    $sceneDots.appendChild(dot);
  }
  updateDots();
}

function updateDots() {
  const dots = $sceneDots.querySelectorAll(".scene-dot");
  if (dots.length < 3) return;

  let activeIdx;
  if (currentIndex === 0) {
    activeIdx = 0;
  } else if (currentIndex === SCENES.length - 1) {
    activeIdx = 2;
  } else {
    activeIdx = 1;
  }

  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === activeIdx);
  });
}

// ── Scene Selector ──────────────────────────────────────────

function populateSceneSelector() {
  if (!$selectScene) return;
  $selectScene.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Lompat ke...";
  placeholder.disabled = true;
  placeholder.selected = true;
  $selectScene.appendChild(placeholder);

  const labelMap = new Map();
  SCENES.forEach((s) => {
    const key = (s.label || "").trim().toLowerCase();
    if (!key) return;
    if (!labelMap.has(key)) {
      labelMap.set(key, s);
    } else if (s.id < labelMap.get(key).id) {
      labelMap.set(key, s);
    }
  });

  const uniqueScenes = Array.from(labelMap.values()).sort((a, b) => a.id - b.id);

  uniqueScenes.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.label || "Lokasi " + s.id;
    $selectScene.appendChild(opt);
  });

  $selectScene.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val) {
      goToSceneById(Number(val));
      $selectScene.value = "";
    }
  });
}

// ── Compass ──────────────────────────────────────────────────

function updateCompass() {
  if (!$compassNeedle) return;

  // Get camera's look direction as azimuthal angle
  const lookDir = new THREE.Vector3();
  camera.getWorldDirection(lookDir);

  // Calculate yaw from the look direction (angle around Y axis)
  const yDeg = THREE.MathUtils.radToDeg(Math.atan2(lookDir.x, lookDir.z));
  $compassNeedle.style.transform = `rotate(${-yDeg + COMPASS_OFFSET}deg)`;
}

// ── Drag Hint ───────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════
//  ZOOM (Scroll Wheel + Pinch)
// ══════════════════════════════════════════════════════════════

function bindZoom() {
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (isTransitioning) return;
      const delta = e.deltaY > 0 ? 3 : -3;
      camera.fov = Math.max(ZOOM_FOV_MIN, Math.min(ZOOM_FOV_MAX, camera.fov + delta));
      camera.updateProjectionMatrix();
    },
    { passive: false }
  );

  // Pinch zoom
  let lastPinchDist = 0;

  renderer.domElement.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      lastPinchDist = getPinchDistance(e.touches);
    }
  });

  renderer.domElement.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
      const dist = getPinchDistance(e.touches);
      const diff = lastPinchDist - dist;
      if (!isTransitioning) {
        camera.fov = Math.max(
          ZOOM_FOV_MIN,
          Math.min(ZOOM_FOV_MAX, camera.fov + diff * 0.15)
        );
        camera.updateProjectionMatrix();
      }
      lastPinchDist = dist;
    }
  });
}

function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ══════════════════════════════════════════════════════════════
//  KEYBOARD NAVIGATION
// ══════════════════════════════════════════════════════════════

function bindKeyboard() {
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
    if (dir === "A") dir = "W";
    if (dir) {
      const link = getLinkByDir(dir);
      if (link) goToSceneById(link.targetId);
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  FULLSCREEN
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  GYROSCOPE (Custom lightweight implementation)
//  DeviceOrientationControls was removed from Three.js r134+
// ══════════════════════════════════════════════════════════════

let deviceOrientationHandler = null;

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function toggleGyro() {
  if (typeof DeviceOrientationEvent === "undefined") {
    alert("Gyroscope tidak tersedia di perangkat ini.");
    return;
  }

  if (!gyroEnabled) {
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
  gyroEnabled = true;

  // Disable orbit controls while gyro is active
  orbitControls.enabled = false;

  // Listen to device orientation
  deviceOrientationHandler = (event) => {
    if (!gyroEnabled) return;

    const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
    const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
    const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

    // Apply device orientation to camera
    const euler = new THREE.Euler(beta, alpha, -gamma, "YXZ");
    camera.quaternion.setFromEuler(euler);

    // Compensate for screen orientation
    const screenOrientation = window.screen?.orientation?.angle || 0;
    const screenQuat = new THREE.Quaternion();
    screenQuat.setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      -THREE.MathUtils.degToRad(screenOrientation)
    );
    camera.quaternion.multiply(screenQuat);

    // World correction (device looks at floor by default, we want horizon)
    const worldQuat = new THREE.Quaternion();
    worldQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    camera.quaternion.premultiply(worldQuat);
  };

  window.addEventListener("deviceorientation", deviceOrientationHandler, true);

  if ($btnGyro) {
    $btnGyro.textContent = "GYRO: ON";
    $btnGyro.style.color = "var(--accent)";
    $btnGyro.style.borderColor = "var(--accent)";
  }
}

function disableGyro() {
  gyroEnabled = false;

  if (deviceOrientationHandler) {
    window.removeEventListener("deviceorientation", deviceOrientationHandler, true);
    deviceOrientationHandler = null;
  }

  // Re-enable orbit controls
  orbitControls.enabled = true;

  if ($btnGyro) {
    $btnGyro.textContent = "GYRO: OFF";
    $btnGyro.style.color = "";
    $btnGyro.style.borderColor = "";
  }
}

// ══════════════════════════════════════════════════════════════
//  EVENTS BINDING
// ══════════════════════════════════════════════════════════════

function bindEvents() {
  $btnFullscreen.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", onFullscreenChange);
  $btnGyro.addEventListener("click", toggleGyro);

  // Raycaster events
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
}

// ══════════════════════════════════════════════════════════════
//  LOADING & FIRST SCENE
// ══════════════════════════════════════════════════════════════

function loadFirstScene() {
  $loadingHint.textContent = "Memuat panorama 360°...";

  let fakeProgress = 0;
  const fakeInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 15, 85);
    $loadingBar.style.width = fakeProgress + "%";
  }, 200);

  loadTexture(0).then(() => {
    clearInterval(fakeInterval);
    $loadingBar.style.width = "100%";
    $loadingHint.textContent = "Siap!";

    applyScene(0);
    updateHUD();
    createNadirCopyright();

    preloadNeighbors(0);

    setTimeout(hideLoading, 400);
  });

  // Fallback timeout
  setTimeout(() => {
    if (!$loadingScreen.classList.contains("hidden")) {
      clearInterval(fakeInterval);
      $loadingBar.style.width = "100%";
      applyScene(0);
      updateHUD();
      createNadirCopyright();
      setTimeout(hideLoading, 300);
    }
  }, 15000);
}

function hideLoading() {
  $loadingScreen.classList.add("hidden");
}

// ══════════════════════════════════════════════════════════════
//  RENDER LOOP
// ══════════════════════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);

  // Update controls
  if (!gyroEnabled) {
    orbitControls.update();
  }

  // Compass
  updateCompass();

  // Render
  renderer.render(scene, camera);
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

function init() {
  console.log("[VirtualTour] Initializing Three.js...");

  initThree();

  // Gyro default: OFF
  gyroEnabled = false;
  if ($btnGyro) {
    $btnGyro.textContent = "GYRO: OFF";
  }

  buildDots();
  loadFirstScene();
  bindEvents();
  bindZoom();
  bindKeyboard();
  populateSceneSelector();
  scheduleDragHintDismiss();

  // Start render loop
  animate();

  console.log("[VirtualTour] Init complete.");
}

// Global shortcut
window.jumpToSceneById = function (id) {
  goToSceneById(Number(id));
};

// ── Bootstrap ──────────────────────────────────────────────
init();
