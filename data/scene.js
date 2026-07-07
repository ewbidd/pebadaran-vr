// =============================================================
// DATA SCENE - Virtual Tour Fakultas Teknik UNRI
// =============================================================
//
// PANDUAN SETTING ARAH KAMERA:
// ─────────────────────────────────────────────────────────────
//  Field: cameraYaw  (satuan: derajat, 0–360)
//
//  Cara kerja:
//    0°   → menghadap depan (default A-Frame)
//    90°  → putar kamera ke KANAN
//   -90°  → putar kamera ke KIRI
//   180°  → menghadap ke belakang
//
//  Tips penyesuaian arah saat gambar pertama muncul:
//    - Jika tampilan terlalu ke kiri  → naikkan nilai cameraYaw (misal: -90 → -45)
//    - Jika tampilan terlalu ke kanan → turunkan nilai cameraYaw (misal: 0 → -45)
//    - Coba kelipatan 45° untuk perubahan cepat
//
//  Field: rotation
//    Koreksi rotasi GAMBAR 360° (bukan kamera).
//    "0 90 0" = geser gambar 90° ke kiri agar jalan lurus di tengah.
//    Ubah nilai Y jika perlu, misalnya "0 45 0" atau "0 135 0".
//
// PANDUAN SETTING NAVIGASI (links[]):
// ─────────────────────────────────────────────────────────────
//  Field: links  → array arah navigasi dari scene ini
//
//  Format:
//    links: [
//      { dir: "N", targetId: 2 },                          // default pos & rot
//      { dir: "S", targetId: 1, pos: "2 0 5" },            // custom position
//      { dir: "E", targetId: 4, pos: "5 0 0", rot: "..." },// custom pos & rot
//    ]
//
//  Keterangan tiap field dalam objek link:
//    dir      : arah mata angin — "N", "S", "E", atau "W"
//    targetId : ID scene tujuan (harus cocok dengan field id di scene lain)
//    pos      : posisi tombol 3D "X Y Z" (opsional, ada default per arah)
//    rot      : rotasi tombol 3D "X Y Z" (opsional, ada default per arah)
//
//  Default posisi per arah (jika pos tidak diisi):
//    N = "0 0 -5"   (depan)
//    S = "0 0 5"    (belakang)
//    E = "5 0 0"    (kanan)
//    W = "-5 0 0"   (kiri)
//
//  Default rotasi per arah (jika rot tidak diisi):
//    N = "-90 0 0"
//    S = "-90 180 0"
//    E = "-90 -90 0"
//    W = "-90 90 0"
//
//  Warna tombol per arah (untuk development, bisa direset ke putih):
//    N = hijau (#00E676)
//    S = merah (#FF5252)
//    E = biru  (#448AFF)
//    W = kuning (#FFD740)
//
// PANDUAN SETTING LABEL PLANE (Panel Nama Lokasi di Scene 3D):
// ─────────────────────────────────────────────────────────────
//  Field: planes  → array berisi satu atau lebih panel teks di scene 3D
//
//  Format:
//    planes: [
//      { pos: "X Y Z", rot: "X Y Z", label: "Teks opsional" },
//    ]
//
//  Keterangan tiap field dalam objek plane:
//    pos   : posisi panel (X=kiri/kanan, Y=atas/bawah, Z=depan/belakang)
//    rot   : rotasi panel dalam derajat (opsional, default "0 0 0")
//    label : teks yang ditampilkan (opsional, default = label scene)
//
//  Contoh 1 plane (pakai label scene):
//    planes: [{ pos: "-3 1.5 -8", rot: "0 30 0" }]
//
//  Contoh 2 plane dengan teks berbeda:
//    planes: [
//      { pos: "6 1 -5",  rot: "0 -110 0", label: "Gedung A" },
//      { pos: "-4 1 3",  rot: "0 80 0",   label: "Gedung B" }
//    ]
//
//  Tips:
//    - Z negatif = di depan kamera (terlihat saat scene dibuka)
//    - Y = 1 ~ 2 agar setinggi mata
//    - Gunakan rot.Y untuk memutar panel menghadap objek tertentu
//    - Hapus field planes (atau kosongi) jika tidak ingin plane di scene itu
// =============================================================

const SCENES = [
  {
    id: 1,
    src: "assets/image/1.jpg",
    label: "Tugu Kampung Pebadaran",
    description: "desc",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "N", targetId: 2 }],
    planes: [{ pos: "6 1 -5", rot: "0 -110 0" }],
  },
  {
    id: 2,
    src: "assets/image/2.jpg",
    label: "Masjid Raya Pusako",
    description: "Masjid Sultan Mahmud Abdul Jalil Muzaffar SYAH",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 3 },
      { dir: "S", targetId: 1 },
    ],
    planes: [{ pos: "5 1 -1", rot: "0 -90 0" }],
  },
  {
    id: 3,
    src: "assets/image/3.jpg",
    label: "Simpang Kantor Desa",
    description: "Simpang Kantor Desa",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 6 },
      { dir: "S", targetId: 2 },
      { dir: "E", targetId: 4 },
    ],
    planes: [{ pos: "6 1 3", rot: "0 -75 0" }],
  },
  {
    id: 4,
    src: "assets/image/4.jpg",
    label: "Kantor Kampung",
    description: "Kantor Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 5 },
      { dir: "S", targetId: 3, pos: "2.5 0 5" },
    ],
    planes: [{ pos: "-3 1 -4", rot: "0 100 0" }],
  },
  {
    id: 5,
    src: "assets/image/5.jpg",
    label: "KUA",
    description: "Kantor Urusan Agama Kec. Pusako",
    rotation: "0 0 0",
    cameraYaw: 90,
    links: [{ dir: "S", targetId: 4, pos: "1.5 0 5" }],
    planes: [{ pos: "-2 1 -0.5", rot: "0 100 0" }],
  },
  {
    id: 6,
    src: "assets/image/6.jpg",
    label: "Puskesmas",
    description: "Puskesmas Kec. Pusako",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 7 },
      { dir: "S", targetId: 3, pos: "1.5 0 5" },
    ],
    planes: [
      { pos: "4 1 -1", rot: "0 -100 0" },
      { pos: "-3 0.5 4", rot: "0 100 0" },
    ],
  },
  {
    id: 7,
    src: "assets/image/7.jpg",
    label: "Mushola",
    description: "Mushola Nurul-Hasanah",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 8 },
      { dir: "S", targetId: 6, pos: "1.5 0 5", rot: "-90 -155 0" },
    ],
    planes: [
      { pos: "-3.5 0.5 -1", rot: "0 110 0" },
      { pos: "6 0.5 2", rot: "0 -65 0" },
    ],
  },
  {
    id: 8,
    src: "assets/image/8.jpg",
    label: "Koperasi Kampung",
    description: "Koperasi Tuah Abadi Makmur Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 9 },
      { dir: "S", targetId: 7 },
    ],
    planes: [{ pos: "-3 0.5 1", rot: "0 110 0" }],
  },
  {
    id: 9,
    src: "assets/image/9.jpg",
    label: "Posko",
    description: "Posko KKN UNRI 2026",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 10 },
      { dir: "S", targetId: 8 },
    ],
    planes: [{ pos: "8 0.5 -0.8", rot: "0 -110 0" }],
  },
  {
    id: 10,
    src: "assets/image/10.jpg",
    label: "RT 05",
    description: "Rumah Ketua RT 05",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 11 },
      { dir: "S", targetId: 9 },
    ],
    planes: [{ pos: "-6 2.5 5", rot: "0 110 0" }],
  },
  {
    id: 11,
    src: "assets/image/11.jpg",
    label: "Simpang Mangrove",
    description: "Simpang Mangrove & Dermaga",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 12 },
      { dir: "E", targetId: 13 },
      { dir: "S", targetId: 10 },
    ],
    planes: [{ pos: "4 1 -4", rot: "0 -45 0" }],
  },
  {
    id: 12,
    src: "assets/image/12.jpg",
    label: "Rumah RW 02",
    description: "Rumah Ketua RW 02 Kampung Pebadaran",
    rotation: "0 0 0",
    cameraYaw: 180,
    links: [
      { dir: "N", targetId: 21 },
      { dir: "S", targetId: 11 },
    ],
    planes: [{ pos: "4 1 -4", rot: "0 -90 0" }],
  },
  {
    id: 13,
    src: "assets/image/13.jpg",
    label: "Rumah Penghulu",
    description: "Rumah Penghulu Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 14 },
      { dir: "S", targetId: 11 },
    ],
    planes: [{ pos: "4 1 -4", rot: "0 -90 0" }],
  },
  {
    id: 14,
    src: "assets/image/14.jpg",
    label: "Simpang Lapangan",
    description: "Simpang Lapangan Volley Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 15 },
      { dir: "E", targetId: 16 },
      { dir: "W", targetId: 17 },
      { dir: "S", targetId: 13 },
    ],
    planes: [
      { pos: "-5 1 -3", rot: "0 90 0" },
      { pos: "6 1 1", rot: "0 -90 0", label: "Parkiran" },
    ],
  },
  {
    id: 15,
    src: "assets/image/15.jpg",
    label: "Dermaga",
    description: "Dermaga Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "W", targetId: 14, rot: "-90 -155 0" }],
    planes: [
      { pos: "-6 1 -1", rot: "0 90 0" },
      { pos: "6 1 4", rot: "0 -70", label: "Parkiran" },
    ],
  },
  {
    id: 16,
    src: "assets/image/16.jpg",
    label: "Rumah Kadus 02",
    description: "Rumah Ketua Dusun 02 Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "N", targetId: 14 }],
    planes: [
      { pos: "-6 1 5", rot: "0 135 0" },
      { pos: "7 2 -2", rot: "0 -90 0", label: "Parkiran" },
    ],
  },
  {
    id: 17,
    src: "assets/image/17.jpg",
    label: "Gang Sekolah",
    description: "Gang Sekolah Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 18 },
      { dir: "E", targetId: 20 },
      { dir: "S", targetId: 14 },
    ],
    planes: [{ pos: "3 1 -1", rot: "0 -90 0" }],
  },
  {
    id: 18,
    src: "assets/image/18.jpg",
    label: "Masjid At-Taqwa",
    description: "Masjid At-Taqwa",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "N", targetId: 19 },
      { dir: "S", targetId: 17 },
    ],
    planes: [{ pos: "1 1 -6", rot: "0 -90 0" }],
  },
  {
    id: 19,
    src: "assets/image/19.jpg",
    label: "Posyandu Kamboja",
    description: "Posyandu Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "S", targetId: 18 }],
    planes: [{ pos: "1 1 -3", rot: "0 -90 0" }],
  },
  {
    id: 20,
    src: "assets/image/20.jpg",
    label: "SDN 04",
    description: "Sekolah Dasar 04 Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 21, pos: "-1.5 0 3" },
      { dir: "N", targetId: 17, pos: "-1.5 0 -5" },
    ],
    planes: [{ pos: "1 1 -5", rot: "0 -90 0" }],
  },
  {
    id: 21,
    src: "assets/image/21.jpg",
    label: "Simpang Gg. Sekolah & Gg. TK MDTA",
    description: "Simpang Gg. Sekolah & Gg. TK MDTA",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 23 },
      { dir: "E", targetId: 22 },
      { dir: "W", targetId: 20 },
      { dir: "N", targetId: 12 },
    ],
    planes: [{ pos: "4 1 -0.5", rot: "0 -70 0" }],
  },
  {
    id: 22,
    src: "assets/image/22.jpg",
    label: "TK Buah Hati Bunda",
    description: "TK Buah Hati Bunda Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "S", targetId: 21 }],
    planes: [{ pos: "2 1 -3", rot: "0 -70 0" }],
  },
  {
    id: 23,
    src: "assets/image/23.jpg",
    label: "mark 23",
    description: "",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 24 },
      { dir: "N", targetId: 21 },
    ],
    planes: [{ pos: "2 1 -4.5", rot: "0 -60 0" }],
  },
  {
    id: 24,
    src: "assets/image/24.jpg",
    label: "Rumah Ketua RW 01",
    description: "Rumah Ketua RW 01 Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 25, pos: "-1 0 -5" },
      { dir: "N", targetId: 23 },
    ],
    planes: [{ pos: "2 1 -4.5", rot: "0 -60 0" }],
  },
  {
    id: 25,
    src: "assets/image/25.jpg",
    label: "mark 25",
    description: "",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 26, pos: "-1 0 -5" },
      { dir: "N", targetId: 24 },
    ],
    planes: [
      { pos: "2 1 -4.5", rot: "0 -60 0" },
      { pos: "5 1 4", rot: "0 -120 0", label: "24" },
    ],
  },
  {
    id: 26,
    src: "assets/image/26.jpg",
    label: "mark 26",
    description: "",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [
      { dir: "S", targetId: 27 },
      { dir: "N", targetId: 25 },
    ],
    planes: [
      { pos: "2 1 -4.5", rot: "0 -60 0" },
      { pos: "-5.4 2 -6", rot: "0 0 0", label: "Parkiran" },
    ],
  },
  {
    id: 27,
    src: "assets/image/27.jpg",
    label: "Tugu Selamat Jalan",
    description: "Tugu Selamat Jalan Kampung Pebadaran",
    rotation: "0 180 0",
    cameraYaw: 0,
    links: [{ dir: "S", targetId: 26 }],
    planes: [
      { pos: "3.5 1 -4", rot: "0 -70 0" },
      { pos: "-5.4 1 -2", rot: "0 90 0", label: "Parkiran" },
    ],
  },
];
