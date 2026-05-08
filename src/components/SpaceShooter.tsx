     1|'use client';
     2|
     3|import { useEffect, useRef } from 'react';
     4|import * as THREE from 'three';
     5|
     6|declare global {
     7|  interface Window {
     8|    initVibeJamPortals?: (config: {
     9|      scene: THREE.Scene;
    10|      getPlayer: () => THREE.Object3D | null;
    11|      spawnPoint: { x: number; y: number; z: number };
    12|      exitPosition: { x: number; y: number; z: number };
    13|    }) => void;
    14|    animateVibeJamPortals?: () => void;
    15|  }
    16|}
    17|
    18|export default function SpaceShooter() {
    19|  const mountRef = useRef<HTMLDivElement>(null);
    20|
    21|  useEffect(() => {
    22|    const mount = mountRef.current;
    23|    if (!mount) return;
    24|
    25|    const isAndroid = /Android/i.test(navigator.userAgent);
    26|    const searchParams = new URLSearchParams(window.location.search);
    27|    const portalMode = searchParams.get('portal') === 'true';
    28|    const portalSpawnPoint = { x: 0, y: 50, z: 0 };
    29|    const portalExitPosition = { x: 300, y: 100, z: -400 };
    30|    const getViewportSize = () => {
    31|      const vv = window.visualViewport;
    32|      const viewportWidth = vv?.width ?? window.innerWidth;
    33|      const viewportHeight = vv?.height ?? window.innerHeight;
    34|      const width = Math.round(viewportWidth);
    35|      const height = Math.round(viewportHeight);
    36|      return {
    37|        width: Math.max(1, width),
    38|        height: Math.max(1, height),
    39|      };
    40|    };
    41|
    42|    const applyMountViewport = () => {
    43|      const { width, height } = getViewportSize();
    44|      mount.style.width = `${width}px`;
    45|      mount.style.height = `${height}px`;
    46|      mount.style.maxWidth = `${width}px`;
    47|      mount.style.maxHeight = `${height}px`;
    48|      mount.style.minWidth = `${width}px`;
    49|      mount.style.minHeight = `${height}px`;
    50|      mount.style.overflow = 'hidden';
    51|    };
    52|
    53|    applyMountViewport();
    54|
    55|    // ── Renderer ──────────────────────────────────────────────────────────────
    56|    const renderer = new THREE.WebGLRenderer({ antialias: true });
    57|    const initialViewport = getViewportSize();
    58|    renderer.setSize(initialViewport.width, initialViewport.height);
    59|    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    60|    renderer.toneMapping = THREE.NoToneMapping;
    61|    renderer.toneMappingExposure = 1.0;
    62|    renderer.domElement.style.pointerEvents = 'none';
    63|    mount.appendChild(renderer.domElement);
    64|
    65|    // ── Scene ─────────────────────────────────────────────────────────────────
    66|    const scene = new THREE.Scene();
    67|    scene.background = new THREE.Color(0x0a1a3a); // deep blue — sky dome handles the gradient
    68|    scene.fog = new THREE.FogExp2(0x1a3a6a, 0.0012); // exponential haze, atmosphere-tinted
    69|
    70|    // ── Gradient Sky Dome (Background Layer) ──────────────────────────────────
    71|    // A large hemisphere with vertex colors: horizon warm, zenith deep blue
    72|    const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    73|    const skyColors: number[] = [];
    74|    const skyPosArr = skyGeo.attributes.position.array as Float32Array;
    75|    for (let i = 0; i < skyPosArr.length / 3; i++) {
    76|      const yy = skyPosArr[i * 3 + 1];
    77|      const t = Math.max(0, Math.min(1, (yy + 2000) / 4000)); // 0=bottom, 1=top
    78|      // Horizon: warm golden-blue; zenith: deep midnight blue
    79|      const r = 0.40 * (1 - t) + 0.04 * t;
    80|      const g = 0.55 * (1 - t) + 0.08 * t;
    81|      const b = 0.80 * (1 - t) + 0.22 * t;
    82|      skyColors.push(r, g, b);
    83|    }
    84|    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    85|    const skyMat = new THREE.MeshBasicMaterial({
    86|      vertexColors: true,
    87|      side: THREE.BackSide,
    88|      depthWrite: false,
    89|    });
    90|    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    91|    scene.add(skyDome);
    92|
    93|    // Sky color palettes per phase (horizon RGB, zenith RGB)
    94|    const SKY_SPACE = { hr: 0.00, hg: 0.00, hb: 0.04, zr: 0.00, zg: 0.00, zb: 0.00 };
    95|
    96|    // ── Planet Theme System ────────────────────────────────────────────────────
    97|    // Nine worlds — Lava 🔥 · Asteroid ☄️ · Cyber ⚡ · Ice ❄️ · Desert 🏜️ · Forest 🌿 · Ocean 🌊 · Storm ⛈️ · Gas Giant 🪐
    98|    type PlanetTheme = 'earth' | 'lava' | 'asteroid' | 'cyber' | 'ice' | 'desert' | 'forest' | 'ocean' | 'storm' | 'gas';
    99|    interface ThemeConfig {
   100|      name: string; emoji: string;
   101|      sky: { hr: number; hg: number; hb: number; zr: number; zg: number; zb: number };
   102|      fogColor: number; fogDensity: number;
   103|      rimColor: number; crackHue: number;
   104|      dustColor: number; atmoColor: number;
   105|      cloudColor: number;
   106|      enemySpeedMult: number; cloudSpeedMult: number;
   107|      earthColorFn: (landVal: number, absLat: number, detail: number) => [number, number, number];
   108|    }
   109|
   110|    const THEMES: Record<PlanetTheme, ThemeConfig> = {
   111|      // ── 🔥 LAVA — molten rock world ──────────────────────────────────────────
   112|      lava: {
   113|        name: 'Lava World', emoji: '🔥',
   114|        sky: { hr: 0.30, hg: 0.07, hb: 0.01, zr: 0.08, zg: 0.01, zb: 0.00 },
   115|        fogColor: 0x550e00, fogDensity: 0.0018,
   116|        rimColor: 0xff4400, crackHue: 0.04,
   117|        dustColor: 0xff6600, atmoColor: 0xff2200,
   118|        cloudColor: 0xff4400,
   119|        enemySpeedMult: 1.35, cloudSpeedMult: 1.4,
   120|        earthColorFn: (landVal, _absLat, detail) => {
   121|          if (landVal > 0.14) return [0.10 + detail * 0.06, 0.05 + detail * 0.03, 0.03 + detail * 0.02];
   122|          if (landVal > -0.04) { const glow = 0.55 + detail * 0.30; return [0.88 + glow * 0.12, 0.22 + glow * 0.12, 0.00]; }
   123|          return [0.62 + detail * 0.10, 0.10 + detail * 0.04, 0.00];
   124|        },
   125|      },
   126|
   127|      // ── ☄️ ASTEROID — cratered rubble world ──────────────────────────────────
   128|      asteroid: {
   129|        name: 'Asteroid Belt', emoji: '☄️',
   130|        sky: { hr: 0.03, hg: 0.02, hb: 0.02, zr: 0.00, zg: 0.00, zb: 0.00 },
   131|        fogColor: 0x060606, fogDensity: 0.0007,
   132|        rimColor: 0x999999, crackHue: 0.09,
   133|        dustColor: 0xbbbbbb, atmoColor: 0x555555,
   134|        cloudColor: 0x999999,
   135|        enemySpeedMult: 1.25, cloudSpeedMult: 0.5,
   136|        earthColorFn: (landVal, _absLat, detail) => {
   137|          if (landVal > 0.22) return [0.42 + detail * 0.10, 0.36 + detail * 0.08, 0.28 + detail * 0.08];
   138|          if (landVal > -0.04) return [0.24 + detail * 0.12, 0.20 + detail * 0.10, 0.16 + detail * 0.08];
   139|          return [0.09 + detail * 0.06, 0.07 + detail * 0.04, 0.05 + detail * 0.04];
   140|        },
   141|      },
   142|
   143|      // ── ⚡ CYBER / PUNK — neon megacity world ────────────────────────────────
   144|      cyber: {
   145|        name: 'Punk World', emoji: '⚡',
   146|        sky: { hr: 0.20, hg: 0.00, hb: 0.32, zr: 0.05, zg: 0.00, zb: 0.10 },
   147|        fogColor: 0x1a0033, fogDensity: 0.0016,
   148|        rimColor: 0xdd00ff, crackHue: 0.80,
   149|        dustColor: 0xff22ff, atmoColor: 0x9900cc,
   150|        cloudColor: 0xcc66ff,
   151|        enemySpeedMult: 1.5, cloudSpeedMult: 2.5,
   152|        earthColorFn: (landVal, _absLat, detail) => {
   153|          if (landVal > 0.18) return [0.06 + detail * 0.06, 0.00, 0.16 + detail * 0.08];
   154|          if (landVal > 0.00) return [0.03 + detail * 0.05, 0.00 + detail * 0.03, 0.12 + detail * 0.10];
   155|          return [0.02 + detail * 0.04, 0.00 + detail * 0.02, 0.08 + detail * 0.06];
   156|        },
   157|      },
   158|
   159|      // ── ❄️ ICE — frozen tundra world ─────────────────────────────────────────
   160|      ice: {
   161|        name: 'Ice Planet', emoji: '❄️',
   162|        sky: { hr: 0.55, hg: 0.72, hb: 0.90, zr: 0.10, zg: 0.18, zb: 0.40 },
   163|        fogColor: 0x8ab8e8, fogDensity: 0.0014,
   164|        rimColor: 0x88ccff, crackHue: 0.58,
   165|        dustColor: 0xaaddff, atmoColor: 0x44aaff,
   166|        cloudColor: 0xeef8ff,
   167|        enemySpeedMult: 1.2, cloudSpeedMult: 0.8,
   168|        earthColorFn: (landVal, absLat, detail) => {
   169|          // Deep polar tundra — blue-white ice sheets
   170|          if (absLat > 0.5) return [0.80 + detail * 0.18, 0.90 + detail * 0.08, 1.0];
   171|          // Mountain ridges — icy pale blue
   172|          if (landVal > 0.20) return [0.65 + detail * 0.20, 0.78 + detail * 0.14, 0.92 + detail * 0.06];
   173|          // Glacial plains — soft blue-white
   174|          if (landVal > -0.02) return [0.72 + detail * 0.16, 0.84 + detail * 0.10, 0.96 + detail * 0.04];
   175|          // Frozen seas — deep pale cyan
   176|          return [0.44 + detail * 0.10, 0.62 + detail * 0.12, 0.82 + detail * 0.10];
   177|        },
   178|      },
   179|
   180|      // ── 🏜️ DESERT — scorched sand world ──────────────────────────────────────
   181|      desert: {
   182|        name: 'Desert Planet', emoji: '🏜️',
   183|        sky: { hr: 0.72, hg: 0.48, hb: 0.18, zr: 0.28, zg: 0.14, zb: 0.04 },
   184|        fogColor: 0xc87830, fogDensity: 0.0020,
   185|        rimColor: 0xffaa44, crackHue: 0.07,
   186|        dustColor: 0xffcc66, atmoColor: 0xff8800,
   187|        cloudColor: 0xffe4b0,
   188|        enemySpeedMult: 1.30, cloudSpeedMult: 1.8,
   189|        earthColorFn: (landVal, _absLat, detail) => {
   190|          // Rock outcrops — deep red-brown sandstone
   191|          if (landVal > 0.22) return [0.60 + detail * 0.14, 0.32 + detail * 0.10, 0.10 + detail * 0.06];
   192|          // Sand dunes — warm amber-tan
   193|          if (landVal > 0.00) return [0.82 + detail * 0.12, 0.58 + detail * 0.14, 0.24 + detail * 0.08];
   194|          // Flat desert basin — pale ochre
   195|          return [0.74 + detail * 0.10, 0.52 + detail * 0.10, 0.20 + detail * 0.06];
   196|        },
   197|      },
   198|
   199|      // ── 🌿 FOREST — dense jungle world ───────────────────────────────────────
   200|      forest: {
   201|        name: 'Forest Planet', emoji: '🌿',
   202|        sky: { hr: 0.22, hg: 0.45, hb: 0.18, zr: 0.04, zg: 0.14, zb: 0.06 },
   203|        fogColor: 0x1a4a1a, fogDensity: 0.0022,
   204|        rimColor: 0x44ff44, crackHue: 0.33,
   205|        dustColor: 0x66ff66, atmoColor: 0x00aa22,
   206|        cloudColor: 0xccffcc,
   207|        enemySpeedMult: 1.15, cloudSpeedMult: 1.0,
   208|        earthColorFn: (landVal, _absLat, detail) => {
   209|          // Dense jungle canopy — very deep emerald
   210|          if (landVal > 0.18) return [0.04 + detail * 0.06, 0.32 + detail * 0.20, 0.05 + detail * 0.04];
   211|          // Forest floor / undergrowth — mid green
   212|          if (landVal > 0.00) return [0.06 + detail * 0.08, 0.44 + detail * 0.18, 0.08 + detail * 0.06];
   213|          // River deltas / swamps — dark teal-green
   214|          return [0.02 + detail * 0.04, 0.22 + detail * 0.14, 0.10 + detail * 0.08];
   215|        },
   216|      },
   217|
   218|      // ── 🌊 OCEAN — water world ────────────────────────────────────────────────
   219|      ocean: {
   220|        name: 'Ocean Planet', emoji: '🌊',
   221|        sky: { hr: 0.10, hg: 0.38, hb: 0.70, zr: 0.02, zg: 0.08, zb: 0.28 },
   222|        fogColor: 0x0a2a5a, fogDensity: 0.0012,
   223|        rimColor: 0x00aaff, crackHue: 0.60,
   224|        dustColor: 0x44ccff, atmoColor: 0x0055cc,
   225|        cloudColor: 0xffffff,
   226|        enemySpeedMult: 1.20, cloudSpeedMult: 1.2,
   227|        earthColorFn: (landVal, absLat, detail) => {
   228|          // Polar ice caps
   229|          if (absLat > 0.78) return [0.85 + detail * 0.12, 0.92 + detail * 0.06, 1.00];
   230|          // Tiny islands / atolls — tropical sand
   231|          if (landVal > 0.28) return [0.80 + detail * 0.14, 0.72 + detail * 0.12, 0.44 + detail * 0.10];
   232|          // Shallow reefs — vivid turquoise
   233|          if (landVal > 0.04) return [0.02 + detail * 0.04, 0.58 + detail * 0.18, 0.76 + detail * 0.12];
   234|          // Deep ocean — rich midnight blue
   235|          return [0.01 + detail * 0.02, 0.14 + detail * 0.10, 0.58 + detail * 0.14];
   236|        },
   237|      },
   238|
   239|      // ── ⛈️ STORM — perpetual lightning world ─────────────────────────────────
   240|      storm: {
   241|        name: 'Storm Planet', emoji: '⛈️',
   242|        sky: { hr: 0.08, hg: 0.08, hb: 0.14, zr: 0.02, zg: 0.02, zb: 0.06 },
   243|        fogColor: 0x111122, fogDensity: 0.0025,
   244|        rimColor: 0xaaaaff, crackHue: 0.65,
   245|        dustColor: 0x6666cc, atmoColor: 0x334488,
   246|        cloudColor: 0x888899,
   247|        enemySpeedMult: 1.45, cloudSpeedMult: 3.0,
   248|        earthColorFn: (landVal, _absLat, detail) => {
   249|          // Dark storm-scarred rock
   250|          if (landVal > 0.20) return [0.14 + detail * 0.08, 0.14 + detail * 0.08, 0.22 + detail * 0.10];
   251|          // Charged plains — deep slate with faint blue tinge
   252|          if (landVal > -0.02) return [0.10 + detail * 0.08, 0.10 + detail * 0.08, 0.18 + detail * 0.10];
   253|          // Flooded lowlands — dark indigo water
   254|          return [0.06 + detail * 0.04, 0.06 + detail * 0.04, 0.18 + detail * 0.08];
   255|        },
   256|      },
   257|
   258|      // ── 🪐 GAS GIANT — banded gas giant ──────────────────────────────────────
   259|      gas: {
   260|        name: 'Gas Giant', emoji: '🪐',
   261|        sky: { hr: 0.55, hg: 0.32, hb: 0.10, zr: 0.20, zg: 0.10, zb: 0.04 },
   262|        fogColor: 0x6a3010, fogDensity: 0.0010,
   263|        rimColor: 0xff9944, crackHue: 0.06,
   264|        dustColor: 0xffbb66, atmoColor: 0xcc6600,
   265|        cloudColor: 0xffddaa,
   266|        enemySpeedMult: 1.40, cloudSpeedMult: 2.0,
   267|        earthColorFn: (landVal, _absLat, detail) => {
   268|          // Alternating warm gas bands — orange / tan / cream
   269|          const bandVal = (Math.sin(landVal * 18.0) * 0.5 + 0.5);
   270|          if (bandVal > 0.70) return [0.88 + detail * 0.10, 0.52 + detail * 0.14, 0.18 + detail * 0.08];
   271|          if (bandVal > 0.40) return [0.72 + detail * 0.14, 0.38 + detail * 0.12, 0.10 + detail * 0.06];
   272|          return [0.56 + detail * 0.10, 0.24 + detail * 0.10, 0.06 + detail * 0.04];
   273|        },
   274|      },
   275|    };
   276|
   277|    let currentTheme: PlanetTheme = 'lava';
   278|    let lightningTimer = 0;
   279|    let lightningFlash = 0;
   280|
   281|    const SKY_ATMO = THEMES['lava'].sky;
   282|    let skyTarget = SKY_ATMO;
   283|    let skyCurrent = { ...SKY_ATMO };
   284|
   285|    function applyTheme(theme: PlanetTheme) {
   286|      currentTheme = theme;
   287|      const cfg = THEMES[theme];
   288|      // Sky
   289|      skyTarget = cfg.sky;
   290|      skyCurrent = { ...cfg.sky };
   291|      // Fog
   292|      (scene.fog as THREE.FogExp2).color.set(cfg.fogColor);
   293|      (scene.fog as THREE.FogExp2).density = cfg.fogDensity;
   294|      // Atmosphere glow
   295|      atmoMat.color.set(cfg.atmoColor);
   296|      // Rim glow
   297|      rimMat.color.set(cfg.rimColor);
   298|      rimInnerMat.color.set(cfg.rimColor);
   299|      // Dust
   300|      dustMat.color.set(cfg.dustColor);
   301|      // Swap planet texture from pre-built cache — instant, no computation
   302|      // Also clear emissive so the story-mode evolution canvas doesn't wash out the theme
   303|      const cached = planetTextureCache.get(theme);
   304|      if (cached && earthMat instanceof THREE.MeshStandardMaterial) {
   305|        earthMat.map = cached.map;
   306|        earthMat.roughnessMap = cached.roughnessMap;
   307|        earthMat.emissiveMap = null;
   308|        earthMat.emissive.set(0x000000);
   309|        earthMat.emissiveIntensity = 0;
   310|        earthMat.needsUpdate = true;
   311|      }
   312|      // Rebuild surface cracks with theme hue
   313|      makeSurfaceCracks();
   314|    }
   315|
   316|    function updateSkyDome(dt: number) {
   317|      const lerpF = 1 - Math.pow(0.01, dt);
   318|      skyCurrent.hr += (skyTarget.hr - skyCurrent.hr) * lerpF;
   319|      skyCurrent.hg += (skyTarget.hg - skyCurrent.hg) * lerpF;
   320|      skyCurrent.hb += (skyTarget.hb - skyCurrent.hb) * lerpF;
   321|      skyCurrent.zr += (skyTarget.zr - skyCurrent.zr) * lerpF;
   322|      skyCurrent.zg += (skyTarget.zg - skyCurrent.zg) * lerpF;
   323|      skyCurrent.zb += (skyTarget.zb - skyCurrent.zb) * lerpF;
   324|      const colArr = skyGeo.attributes.color.array as Float32Array;
   325|      for (let i = 0; i < skyPosArr.length / 3; i++) {
   326|        const yy = skyPosArr[i * 3 + 1];
   327|        const t = Math.max(0, Math.min(1, (yy + 2000) / 4000));
   328|        colArr[i * 3]     = skyCurrent.hr * (1 - t) + skyCurrent.zr * t;
   329|        colArr[i * 3 + 1] = skyCurrent.hg * (1 - t) + skyCurrent.zg * t;
   330|        colArr[i * 3 + 2] = skyCurrent.hb * (1 - t) + skyCurrent.zb * t;
   331|      }
   332|      skyGeo.attributes.color.needsUpdate = true;
   333|      // Sync fog color to horizon
   334|      (scene.fog as THREE.FogExp2).color.setRGB(skyCurrent.hr * 0.6, skyCurrent.hg * 0.6, skyCurrent.hb * 0.6);
   335|      scene.background = new THREE.Color(skyCurrent.zr, skyCurrent.zg, skyCurrent.zb);
   336|    }
   337|
   338|    // ── Perspective Camera — wide FOV to show Earth curvature on horizon ──────
   339|    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.5, 5000);
   340|    // Camera sits behind and above the jet — close enough to see the Earth curve below
   341|    const CAM_HEIGHT = 22;
   342|    const CAM_BACK = 20;
   343|    camera.position.set(0, CAM_HEIGHT, CAM_BACK);
   344|    camera.lookAt(0, 0, -5);
   345|
   346|    // ── Lighting ──────────────────────────────────────────────────────────────
   347|    // Balanced for MeshStandardMaterial — low ambient so texture colors show, directional for depth
   348|    const ambient = new THREE.AmbientLight(0x334466, 0.5);
   349|    scene.add(ambient);
   350|    const sun = new THREE.DirectionalLight(0xfff5e0, 1.6);
   351|    sun.position.set(60, 120, 40);
   352|    scene.add(sun);
   353|    // Fill light from opposite side — softens shadows, reveals dark-side detail
   354|    const fillLight = new THREE.DirectionalLight(0x6688aa, 0.4);
   355|    fillLight.position.set(-40, 20, -30);
   356|    scene.add(fillLight);
   357|
   358|    // ── Game State ────────────────────────────────────────────────────────────
   359|    let score = 0;
   360|    let lives = 3; // kept for collision — 3 hits before game over
   361|    let wave = 1;
   362|    let phase: 'atmosphere' | 'transition' | 'space' = 'atmosphere';
   363|    let gameState: 'start' | 'playing' | 'gameover' | 'missioncomplete' = 'start';
   364|    let gameMode: 'story' | 'endless' = 'story';
   365|
   366|    // ── Difficulty ────────────────────────────────────────────────────────────
   367|    type Difficulty = 'easy' | 'medium' | 'hard';
   368|    let difficulty: Difficulty = 'medium';
   369|    const DIFF: Record<Difficulty, {
   370|      lives: number;           // starting lives
   371|      shootCooldown: number;   // player fire rate (lower = faster)
   372|      enemySpeedMult: number;  // multiplier on enemy base speed
   373|      spawnRateMult: number;   // multiplier on spawn interval (lower = faster spawns)
   374|      enemyShootMult: number;  // multiplier on enemy shoot interval (lower = more shots)
   375|    }> = {
   376|      easy:   { lives: 5, shootCooldown: 0.13, enemySpeedMult: 0.65, spawnRateMult: 1.55, enemyShootMult: 1.7 },
   377|      medium: { lives: 3, shootCooldown: 0.20, enemySpeedMult: 1.00, spawnRateMult: 1.00, enemyShootMult: 1.0 },
   378|      hard:   { lives: 2, shootCooldown: 0.26, enemySpeedMult: 1.45, spawnRateMult: 0.65, enemyShootMult: 0.6 },
   379|    };
   380|    let endlessKills = 0;
   381|    let endlessStage = 0; // 0-8, one per world
   382|    // 9 worlds in order — each triggered by a kill milestone
   383|    const ENDLESS_WORLDS: PlanetTheme[] = ['lava','desert','ice','forest','ocean','storm','asteroid','cyber','gas'];
   384|    // Kill count needed to enter each world (world 0 starts immediately, then every 5 kills)
   385|    const ENDLESS_THRESHOLDS = [0, 5, 10, 15, 20, 25, 30, 35, 40];
   386|    let levelUpFlashTimer = 0; // >0 = white flash active
   387|    let invincible = 0;
   388|    let transitionTimer = 0;
   389|    let waveTimer = 0;
   390|    let spawnTimer = 0;
   391|    let frameId = 0;
   392|
   393|    // ── Mission System ────────────────────────────────────────────────────────
   394|    interface Mission {
   395|      id: number;
   396|      title: string;
   397|      description: string;
   398|      killTarget: number;
   399|      bonusScore: number;
   400|      planet: string;
   401|    }
   402|    const MISSIONS: Mission[] = [
   403|      { id: 1, title: 'FIRST CONTACT',    description: 'Destroy 5 enemy fighters',   killTarget: 5,  bonusScore: 500,  planet: 'Lava World'     },
   404|      { id: 2, title: 'MOLTEN SWEEP',     description: 'Destroy 10 enemy fighters',  killTarget: 10, bonusScore: 1000, planet: 'Asteroid Belt'  },
   405|      { id: 3, title: 'ROCK & RUIN',      description: 'Destroy 15 enemy fighters',  killTarget: 15, bonusScore: 1500, planet: 'Punk World'     },
   406|      { id: 4, title: 'NEON STORM',       description: 'Destroy 20 enemy fighters',  killTarget: 20, bonusScore: 2500, planet: 'Lava World'     },
   407|      { id: 5, title: 'RUBBLE RUSH',      description: 'Destroy 25 alien warships',  killTarget: 25, bonusScore: 3500, planet: 'Asteroid Belt'  },
   408|      { id: 6, title: 'CYBER RECKONING',  description: 'Destroy 30 alien warships',  killTarget: 30, bonusScore: 5000, planet: 'Punk World'     },
   409|    ];
   410|    // Planet theme for each mission index — rotates through the 3 worlds
   411|    const MISSION_THEMES: PlanetTheme[] = ['lava', 'asteroid', 'cyber', 'lava', 'asteroid', 'cyber'];
   412|    let missionIndex = 0;
   413|    let missionKills = 0;
   414|    let missionCompleteTimer = 0; // countdown after mission complete before next starts
   415|    let planetTransitionTimer = -1; // >0 means a planet change is pending after this many seconds
   416|
   417|    // ── Player heading (angle in XZ plane, 0 = facing -Z = "forward") ─────────
   418|    let jetHeading = 0; // radians — yaw
   419|    let jetPitch   = 0; // radians — nose up/down
   420|    let jetRoll    = 0; // radians — wing tilt
   421|    let jetSpeed = 0;
   422|    const JET_MAX_SPEED   = 14;
   423|    const JET_BOOST_SPEED = 28;
   424|    const JET_ACCEL       = 18;
   425|    const JET_DECEL       = 10;
   426|    const JET_TURN_SPEED  = 2.2;
   427|    const JET_PITCH_SPEED = 1.6;
   428|    const FLIGHT_ALTITUDE = 12; // units above planet surface — gravity lock target
   429|
   430|    // ── Camera view toggle (V key) ────────────────────────────────────────────
   431|    let cameraView: 0 | 1 | 2 = 0; // 0=chase, 1=cockpit, 2=planet-center
   432|
   433|    // ── Mouse aiming — nose follows cursor ────────────────────────────────────
   434|    let mouseAimX = 0; // -1..1 (left..right)
   435|    let mouseAimY = 0; // -1..1 (up..down)
   436|    const onMouseMove = (e: MouseEvent) => {
   437|      const rect = mount.getBoundingClientRect();
   438|      mouseAimX = ((e.clientX - rect.left) / rect.width  - 0.5) * 2;
   439|      mouseAimY = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
   440|    };
   441|    mount.addEventListener('mousemove', onMouseMove);
   442|
   443|    // ── Keys ──────────────────────────────────────────────────────────────────
   444|    const keys: Record<string, boolean> = {};
   445|    const onKeyDown = (e: KeyboardEvent) => {
   446|      keys[e.code] = true;
   447|      // V key — cycle camera view
   448|      if (e.code === 'KeyV' && gameState === 'playing') {
   449|        cameraView = ((cameraView + 1) % 3) as 0 | 1 | 2;
   450|      }
   451|    };
   452|    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
   453|    window.addEventListener('keydown', onKeyDown);
   454|    window.addEventListener('keyup', onKeyUp);
   455|
   456|    // ── Touch / Mobile controls ───────────────────────────────────────────────
   457|    // Try to lock to landscape on mobile
   458|    if (typeof screen !== 'undefined' && screen.orientation && (screen.orientation as unknown as {lock:(o:string)=>Promise<void>}).lock) {
   459|      (screen.orientation as unknown as {lock:(o:string)=>Promise<void>}).lock('landscape').catch(() => {/* silently ignore — some browsers disallow */});
   460|    }
   461|
   462|    // Rotate-to-landscape overlay shown when in portrait
   463|    const rotateOverlay = document.createElement('div');
   464|    rotateOverlay.style.cssText = `
   465|      position:fixed;top:0;left:0;width:100vw;height:100dvh;
   466|      background:#000;color:#00ddff;
   467|      display:none;flex-direction:column;align-items:center;justify-content:center;
   468|      z-index:9999;font-family:monospace;pointer-events:none;
   469|      padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
   470|    `;
   471|    rotateOverlay.innerHTML = `
   472|      <div style="font-size:64px;margin-bottom:18px;animation:spin 2s linear infinite;">📱</div>
   473|      <div style="font-size:22px;font-weight:900;letter-spacing:4px;text-shadow:0 0 20px #00ddff;">ROTATE TO PLAY</div>
   474|      <div style="font-size:13px;color:#4a8aaa;margin-top:10px;letter-spacing:2px;">Landscape mode required</div>
   475|      <style>@keyframes spin{0%{transform:rotate(0deg)}25%{transform:rotate(-90deg)}75%{transform:rotate(-90deg)}100%{transform:rotate(-360deg)}}</style>
   476|    `;
   477|    document.body.appendChild(rotateOverlay);
   478|
   479|    function checkOrientation() {
   480|      const { width, height } = getViewportSize();
   481|      const isPortrait = height > width;
   482|      rotateOverlay.style.display = isAndroid && isPortrait ? 'flex' : 'none';
   483|      document.documentElement.style.overflow = 'hidden';
   484|      document.body.style.overflow = 'hidden';
   485|      document.body.style.width = `${width}px`;
   486|      document.body.style.height = `${height}px`;
   487|    }
   488|    checkOrientation();
   489|    window.addEventListener('resize', checkOrientation);
   490|    window.addEventListener('orientationchange', checkOrientation);
   491|
   492|    // Virtual touch controls — joystick (left) + fire/bomb buttons (right)
   493|    const touchLayer = document.createElement('div');
   494|    touchLayer.style.cssText = `
   495|      position:absolute;top:0;left:0;width:100%;height:100%;
   496|      pointer-events:none;z-index:25;user-select:none;-webkit-user-select:none;
   497|      overflow:hidden;
   498|      padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
   499|      box-sizing:border-box;
   500|    `;
   501|    // ── Left D-pad ────────────────────────────────────────────────────────────
   502|    const dpad = document.createElement('div');
   503|    dpad.style.cssText = `
   504|      position:absolute;bottom:24px;left:24px;
   505|      width:150px;height:150px;pointer-events:auto;
   506|      touch-action:none;
   507|    `;
   508|    // Centre circle
   509|    const dpadInner = document.createElement('div');
   510|    dpadInner.style.cssText = `
   511|      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
   512|      width:60px;height:60px;border-radius:50%;
   513|      background:rgba(0,200,255,0.12);border:2px solid rgba(0,200,255,0.35);
   514|    `;
   515|    // Arrow labels
   516|    const arrows = [
   517|      {label:'▲', style:'top:0;left:50%;transform:translateX(-50%);'},
   518|      {label:'▼', style:'bottom:0;left:50%;transform:translateX(-50%);'},
   519|      {label:'◀', style:'left:0;top:50%;transform:translateY(-50%);'},
   520|      {label:'▶', style:'right:0;top:50%;transform:translateY(-50%);'},
   521|    ];
   522|    arrows.forEach(a => {
   523|      const el = document.createElement('div');
   524|      el.style.cssText = `position:absolute;${a.style}width:44px;height:44px;
   525|        display:flex;align-items:center;justify-content:center;
   526|        font-size:20px;color:rgba(0,200,255,0.55);pointer-events:none;`;
   527|      el.textContent = a.label;
   528|      dpad.appendChild(el);
   529|    });
   530|    dpad.appendChild(dpadInner);
   531|
   532|    // Joystick knob
   533|    const knob = document.createElement('div');
   534|    knob.style.cssText = `
   535|      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
   536|      width:54px;height:54px;border-radius:50%;
   537|      background:radial-gradient(circle at 35% 35%,rgba(0,220,255,0.55),rgba(0,100,200,0.35));
   538|      border:2px solid rgba(0,200,255,0.7);
   539|      box-shadow:0 0 14px rgba(0,200,255,0.4);
   540|      pointer-events:none;transition:box-shadow 0.1s;
   541|    `;
   542|    dpad.appendChild(knob);
   543|
   544|    let dpadRect = { x: 0, y: 0, w: 150, h: 150 };
   545|    let dpadActive = false;
   546|
   547|    function updateDpadRect() {
   548|      const r = dpad.getBoundingClientRect();
   549|      dpadRect = { x: r.left, y: r.top, w: r.width, h: r.height };
   550|    }
   551|
   552|    dpad.addEventListener('touchstart', (e) => {
   553|      e.preventDefault();
   554|      dpadActive = true;
   555|      updateDpadRect();
   556|      processDpadTouch(e.touches[0]);
   557|    }, { passive: false });
   558|
   559|    dpad.addEventListener('touchmove', (e) => {
   560|      e.preventDefault();
   561|      if (dpadActive) processDpadTouch(e.touches[0]);
   562|    }, { passive: false });
   563|
   564|    dpad.addEventListener('touchend', (e) => {
   565|      e.preventDefault();
   566|      dpadActive = false;
   567|      keys['ArrowLeft']  = false;
   568|      keys['ArrowRight'] = false;
   569|      keys['ArrowUp']    = false;
   570|      keys['ArrowDown']  = false;
   571|      knob.style.transform = 'translate(-50%,-50%)';
   572|    }, { passive: false });
   573|
   574|    function processDpadTouch(t: Touch) {
   575|      const cx = dpadRect.x + dpadRect.w / 2;
   576|      const cy = dpadRect.y + dpadRect.h / 2;
   577|      const dx = t.clientX - cx;
   578|      const dy = t.clientY - cy;
   579|      const maxR = dpadRect.w / 2 - 8;
   580|      const dist = Math.sqrt(dx * dx + dy * dy);
   581|      const clampedDx = dist > maxR ? (dx / dist) * maxR : dx;
   582|      const clampedDy = dist > maxR ? (dy / dist) * maxR : dy;
   583|      knob.style.transform = `translate(calc(-50% + ${clampedDx}px), calc(-50% + ${clampedDy}px))`;
   584|
   585|      const threshold = maxR * 0.3;
   586|      keys['ArrowLeft']  = dx < -threshold;
   587|      keys['ArrowRight'] = dx >  threshold;
   588|      keys['ArrowUp']    = dy < -threshold;
   589|      keys['ArrowDown']  = dy >  threshold;
   590|    }
   591|
   592|    // ── Right buttons: FIRE + BOMB ─────────────────────────────────────────────
   593|    const rightBtns = document.createElement('div');
   594|    rightBtns.style.cssText = `
   595|      position:absolute;bottom:24px;right:24px;
   596|      display:flex;flex-direction:column;gap:14px;
   597|      align-items:flex-end;pointer-events:none;
   598|    `;
   599|
   600|    function makeBtn(label: string, color: string, size: number) {
   601|      const btn = document.createElement('div');
   602|      btn.style.cssText = `
   603|        width:${size}px;height:${size}px;border-radius:50%;
   604|        background:radial-gradient(circle at 35% 35%,${color}44,${color}22);
   605|        border:2px solid ${color}99;
   606|        box-shadow:0 0 14px ${color}44;
   607|        display:flex;align-items:center;justify-content:center;
   608|        font-size:${Math.round(size * 0.35)}px;color:${color};
   609|        pointer-events:auto;touch-action:none;user-select:none;
   610|        -webkit-user-select:none;cursor:pointer;
   611|        transition:box-shadow 0.08s,background 0.08s;
   612|      `;
   613|      btn.textContent = label;
   614|      return btn;
   615|    }
   616|
   617|    const fireBtn = makeBtn('🔥', '#ff4400', 76);
   618|    const bombBtn = makeBtn('💣', '#ffaa00', 60);
   619|
   620|    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys['Space'] = true;  fireBtn.style.boxShadow = '0 0 28px #ff440088'; }, { passive: false });
   621|    fireBtn.addEventListener('touchend',   (e) => { e.preventDefault(); keys['Space'] = false; fireBtn.style.boxShadow = '0 0 14px #ff440044'; }, { passive: false });
   622|    bombBtn.addEventListener('touchstart', (e) => { e.preventDefault(); keys['KeyB'] = true;   bombBtn.style.boxShadow = '0 0 28px #ffaa0088'; }, { passive: false });
   623|    bombBtn.addEventListener('touchend',   (e) => { e.preventDefault(); keys['KeyB'] = false;  bombBtn.style.boxShadow = '0 0 14px #ffaa0044'; }, { passive: false });
   624|
   625|    // Start / restart tap on fire button when on start/gameover screen
   626|    fireBtn.addEventListener('touchstart', (e) => {
   627|      e.preventDefault();
   628|      if (gameState === 'start')    { resetGame(); startBgMusic(); }
   629|      else if (gameState === 'gameover') { resetGame(); }
   630|    }, { passive: false });
   631|
   632|    rightBtns.appendChild(fireBtn);
   633|    rightBtns.appendChild(bombBtn);
   634|
   635|    touchLayer.appendChild(dpad);
   636|    touchLayer.appendChild(rightBtns);
   637|    mount.appendChild(touchLayer);
   638|
   639|    // ── HUD (DOM overlay) ─────────────────────────────────────────────────────
   640|    const hud = document.createElement('div');
   641|    hud.style.cssText = `
   642|      position:absolute;top:0;left:0;width:100%;height:100%;
   643|      pointer-events:none;font-family:monospace;color:#fff;z-index:10;
   644|    `;
   645|    mount.style.position = 'relative';
   646|    mount.appendChild(hud);
   647|
   648|    // ── Modal overlay (start / gameover screens) — separate from hud so pointer-events work ──
   649|    const modal = document.createElement('div');
   650|    modal.style.cssText = `
   651|      position:absolute;top:0;left:0;width:100%;height:100%;
   652|      display:flex;align-items:center;justify-content:center;
   653|      pointer-events:auto;font-family:monospace;color:#fff;z-index:15;
   654|    `;
   655|    mount.appendChild(modal);
   656|
   657|    // ── Persistent planet switcher (toggle button + slide-in drawer) ──────────
   658|    // Toggle button (always visible during play)
   659|    const planetToggle = document.createElement('button');
   660|    planetToggle.style.cssText = `
   661|      position:absolute;top:50px;right:12px;z-index:21;
   662|      background:rgba(0,10,30,0.88);border:1px solid rgba(0,200,255,0.35);
   663|      border-radius:10px;padding:8px 14px;cursor:pointer;
   664|      font-family:monospace;font-size:13px;font-weight:bold;color:#00eeff;
   665|      letter-spacing:1px;pointer-events:auto;display:none;
   666|      box-shadow:0 0 12px rgba(0,200,255,0.2);
   667|    `;
   668|    planetToggle.textContent = '🌍 WORLDS';
   669|    mount.appendChild(planetToggle);
   670|
   671|    // Slide-in drawer
   672|    const planetDrawer = document.createElement('div');
   673|    planetDrawer.style.cssText = `
   674|      position:absolute;top:0;right:0;bottom:0;width:300px;z-index:20;
   675|      background:rgba(0,2,18,0.96);border-left:1px solid rgba(0,200,255,0.2);
   676|      padding:16px 12px;overflow-y:auto;display:none;flex-direction:column;gap:8px;
   677|      pointer-events:auto;backdrop-filter:blur(12px);
   678|    `;
   679|    mount.appendChild(planetDrawer);
   680|
   681|    let drawerOpen = false;
   682|    planetToggle.addEventListener('click', () => {
   683|      drawerOpen = !drawerOpen;
   684|      planetDrawer.style.display = drawerOpen ? 'flex' : 'none';
   685|      planetToggle.style.background = drawerOpen
   686|        ? 'rgba(0,200,255,0.25)' : 'rgba(0,10,30,0.88)';
   687|    });
   688|
   689|    const themeAccentsMap: Record<PlanetTheme, string> = {
   690|      earth: '#44aaff', ice: '#aaddff', lava: '#ff5500', storm: '#8844ff',
   691|      ocean: '#00ccff', desert: '#ffaa33', forest: '#44ff88', cyber: '#ff00ff', asteroid: '#aaaaaa',
   692|    };
   693|    const themeBgMap: Record<PlanetTheme, string> = {
   694|      earth:    'linear-gradient(135deg,#0a1a3a 0%,#1a4a2a 60%,#0a2a4a 100%)',
   695|      ice:      'linear-gradient(135deg,#0a1a3a 0%,#1a3a5a 50%,#aaddff22 100%)',
   696|      lava:     'linear-gradient(135deg,#1a0500 0%,#3a0a00 50%,#ff330022 100%)',
   697|      storm:    'linear-gradient(135deg,#0a0020 0%,#1a0040 50%,#8844ff22 100%)',
   698|      ocean:    'linear-gradient(135deg,#001a3a 0%,#003a6a 60%,#00ccff22 100%)',
   699|      desert:   'linear-gradient(135deg,#1a0e00 0%,#3a2000 60%,#ffaa3322 100%)',
   700|      forest:   'linear-gradient(135deg,#001a00 0%,#0a3a0a 60%,#44ff8822 100%)',
   701|      cyber:    'linear-gradient(135deg,#0a0020 0%,#200040 60%,#ff00ff22 100%)',
   702|      asteroid: 'linear-gradient(135deg,#0a0a0a 0%,#1a1a1a 60%,#aaaaaa22 100%)',
   703|    };
   704|
   705|    function updatePlanetPanel() {
   706|      planetDrawer.innerHTML = `
   707|        <div style="font-size:11px;color:#445566;letter-spacing:2px;text-transform:uppercase;
   708|          margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid rgba(0,200,255,0.15);">
   709|          🌌 CHOOSE YOUR WORLD
   710|        </div>
   711|        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
   712|          ${(Object.keys(THEMES) as PlanetTheme[]).map(key => {
   713|            const t = THEMES[key];
   714|            const sel = key === currentTheme;
   715|            const accent = themeAccentsMap[key];
   716|            const bg = themeBgMap[key];
   717|            return `<button data-planet="${key}" style="
   718|              display:flex;flex-direction:column;align-items:center;justify-content:center;
   719|              gap:5px;padding:12px 8px;border-radius:10px;cursor:pointer;
   720|              border:2px solid ${sel ? accent : 'rgba(255,255,255,0.08)'};
   721|              background:${bg};
   722|              box-shadow:${sel ? `0 0 16px ${accent}66,inset 0 0 10px ${accent}22` : '0 2px 8px rgba(0,0,0,0.6)'};
   723|              position:relative;overflow:hidden;
   724|            ">
   725|              <div style="font-size:26px;line-height:1;">${t.emoji}</div>
   726|              <div style="font-size:9px;font-weight:bold;color:${sel ? accent : '#778899'};
   727|                letter-spacing:0.5px;text-transform:uppercase;font-family:monospace;">${t.name}</div>
   728|              ${sel ? `<div style="position:absolute;bottom:0;left:0;right:0;height:2px;
   729|                background:${accent};box-shadow:0 0 8px ${accent};"></div>` : ''}
   730|            </button>`;
   731|          }).join('')}
   732|        </div>
   733|        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,200,255,0.1);
   734|          font-size:9px;color:#334455;text-align:center;letter-spacing:1px;">
   735|          TAP ANY WORLD TO SWITCH INSTANTLY
   736|        </div>
   737|      `;
   738|      planetDrawer.querySelectorAll('button[data-planet]').forEach(btn => {
   739|        btn.addEventListener('click', () => {
   740|          applyTheme((btn as HTMLElement).dataset.planet as PlanetTheme);
   741|          updatePlanetPanel();
   742|        });
   743|      });
   744|    }
   745|
   746|    // ── Persistent playing HUD elements (created once, updated cheaply) ────────
   747|    const hudBar = document.createElement('div');
   748|    hudBar.style.cssText = `position:absolute;top:0;left:0;right:0;
   749|      background:rgba(0,0,0,0.55);padding:10px 20px;
   750|      justify-content:space-between;align-items:center;display:none;`;
   751|    hud.appendChild(hudBar);
   752|
   753|    const hudScore = document.createElement('span');
   754|    hudScore.style.cssText = 'font-size:20px;color:#00ffff;font-weight:bold;text-shadow:0 0 10px #00ffff;';
   755|    const hudPhase = document.createElement('span');
   756|    hudPhase.style.cssText = 'font-size:15px;color:#88ff88;font-weight:bold;';
   757|    const hudLivesInline = document.createElement('span');
   758|    hudLivesInline.style.cssText = 'font-size:20px;color:#ff4444;';
   759|    hudBar.appendChild(hudScore);
   760|    hudBar.appendChild(hudPhase);
   761|    hudBar.appendChild(hudLivesInline);
   762|
   763|    // ── MISSION PANEL — compact strip, centred, always visible during play ──
   764|    const hudMissionBar = document.createElement('div');
   765|    hudMissionBar.style.cssText = `
   766|      position:absolute;top:48px;left:50%;transform:translateX(-50%);
   767|      width:min(320px,80%);display:none;
   768|      background:rgba(0,0,0,0.65);
   769|      border:1px solid rgba(255,200,0,0.45);
   770|      border-radius:8px;padding:6px 12px 8px;
   771|      box-shadow:0 0 16px rgba(255,160,0,0.2),0 2px 8px rgba(0,0,0,0.7);
   772|    `;
   773|    hudMissionBar.innerHTML = `
   774|      <div id="mission-label" style="
   775|        font-size:11px;font-weight:700;color:#ffe066;letter-spacing:1.5px;
   776|        text-transform:uppercase;text-align:center;margin-bottom:5px;
   777|        text-shadow:0 0 8px #ffaa00;line-height:1.2;
   778|      "></div>
   779|      <div style="background:rgba(255,255,255,0.10);border-radius:4px;height:8px;overflow:hidden;
   780|        border:1px solid rgba(255,200,0,0.25);position:relative;">
   781|        <div id="mission-fill" style="
   782|          height:100%;
   783|          background:linear-gradient(90deg,#cc2200,#ff6600,#ffcc00,#ffff44);
   784|          border-radius:4px;transition:width 0.3s ease;width:0%;
   785|          box-shadow:0 0 6px #ff8800;
   786|        "></div>
   787|      </div>
   788|      <div id="mission-kills-text" style="
   789|        font-size:10px;color:#ffe066;text-align:center;
   790|        margin-top:4px;letter-spacing:1.5px;font-weight:700;
   791|        text-shadow:0 0 6px #ffaa00;
   792|      "></div>
   793|    `;
   794|    hud.appendChild(hudMissionBar);
   795|
   796|    // Mission complete flash — compact top-left banner, non-blocking
   797|    const missionFlash = document.createElement('div');
   798|    missionFlash.style.cssText = `
   799|      position:absolute;top:52px;left:12px;
   800|      display:none;pointer-events:none;z-index:12;
   801|    `;
   802|    missionFlash.innerHTML = `
   803|      <div id="mission-flash-inner" style="
   804|        padding:8px 14px;
   805|        background:rgba(0,0,0,0.80);border-radius:8px;
   806|        border:1px solid #ffdd00;
   807|        box-shadow:0 0 12px #ffaa0055;max-width:220px;
   808|      ">
   809|        <div style="font-size:9px;color:#ffaa00;letter-spacing:3px;margin-bottom:2px;
   810|          text-transform:uppercase;text-shadow:0 0 8px #ffaa00;">✅ MISSION COMPLETE</div>
   811|        <div id="mission-flash-title" style="font-size:13px;font-weight:900;color:#ffe066;letter-spacing:1px;
   812|          text-shadow:0 0 10px #ffaa00;margin-bottom:1px;"></div>
   813|        <div id="mission-flash-bonus" style="font-size:11px;color:#00ffcc;font-weight:bold;
   814|          text-shadow:0 0 8px #00ffcc;"></div>
   815|        <div id="mission-flash-next" style="font-size:9px;color:#aabbcc;margin-top:3px;letter-spacing:0.5px;"></div>
   816|      </div>
   817|    `;
   818|    hud.appendChild(missionFlash);
   819|    let missionFlashTimer = 0;
   820|
   821|    // Red danger vignette — pulses when an enemy bullet is close to the player
   822|    const dangerVignette = document.createElement('div');
   823|    dangerVignette.style.cssText = `
   824|      position:absolute;top:0;left:0;width:100%;height:100%;
   825|      pointer-events:none;z-index:11;opacity:0;
   826|      background:radial-gradient(ellipse at center, transparent 40%, rgba(255,0,0,0.75) 100%);
   827|      transition:opacity 0.08s ease;
   828|    `;
   829|    hud.appendChild(dangerVignette);
   830|
   831|    // Level-up flash overlay — full-screen cyan burst when endlessStage advances
   832|    const levelUpFlashEl = document.createElement('div');
   833|    levelUpFlashEl.id = 'level-up-flash';
   834|    levelUpFlashEl.style.cssText = `
   835|      position:absolute;top:0;left:0;width:100%;height:100%;
   836|      pointer-events:none;z-index:13;display:none;opacity:0;
   837|      background:radial-gradient(ellipse at center, rgba(120,0,255,0.55) 0%, rgba(0,200,255,0.2) 60%, transparent 100%);
   838|    `;
   839|    hud.appendChild(levelUpFlashEl);
   840|
   841|    // Lives (hearts) — kept for legacy reference but now shown inline in hudBar
   842|    const hudLives = document.createElement('div');
   843|    hudLives.style.cssText = 'display:none;';
   844|    hud.appendChild(hudLives);
   845|
   846|    const hudHint = document.createElement('div');
   847|    hudHint.style.cssText = `position:absolute;bottom:16px;left:50%;transform:translateX(-50%);
   848|      font-size:13px;color:rgba(255,255,255,0.5);display:none;`;
   849|    hudHint.textContent = '← → TURN  |  ↑ THROTTLE  |  SPACE FIRE';
   850|    hud.appendChild(hudHint);
   851|
   852|    let lastScore = -1, lastLives = -1, lastMissionKills = -1, lastPhase = '';
   853|
   854|    function showPlayingHUD(show: boolean) {
   855|      hudBar.style.display = show ? 'flex' : 'none';
   856|      hudMissionBar.style.display = show ? 'block' : 'none';
   857|      hudHint.style.display = show ? 'block' : 'none';
   858|      if (!show) { missionFlash.style.display = 'none'; missionFlashTimer = 0; }
   859|    }
   860|
   861|    function updatePlayingHUD() {
   862|      if (score !== lastScore) { hudScore.textContent = `SCORE: ${score.toLocaleString()}`; lastScore = score; }
   863|      if (lives !== lastLives) {
   864|        hudLivesInline.textContent = '❤ '.repeat(lives);
   865|        lastLives = lives;
   866|      }
   867|      if (gameMode === 'endless') {
   868|        // Endless mode: show kill count + stage in the mission bar slot
   869|        hudMissionBar.style.display = 'block';
   870|        if (endlessKills !== lastMissionKills) {
   871|          // Use ENDLESS_WORLDS and ENDLESS_THRESHOLDS for accurate stage display
   872|          const worldName = ENDLESS_WORLDS[Math.min(endlessStage, ENDLESS_WORLDS.length - 1)].toUpperCase();
   873|          const nextThreshold = endlessStage < ENDLESS_THRESHOLDS.length - 1 ? ENDLESS_THRESHOLDS[endlessStage + 1] : null;
   874|          const prevThreshold = ENDLESS_THRESHOLDS[endlessStage] ?? 0;
   875|          const killsInStage = endlessKills - prevThreshold;
   876|          const targetInStage = nextThreshold !== null ? nextThreshold - prevThreshold : 5;
   877|          const pct = nextThreshold === null ? 100 : Math.min(100, (killsInStage / targetInStage) * 100);
   878|          const fillColors = ['linear-gradient(90deg,#ff4400,#ff8800)','linear-gradient(90deg,#ffaa00,#ffdd00)','linear-gradient(90deg,#88ddff,#0088ff)','linear-gradient(90deg,#00ffcc,#00aa88)','linear-gradient(90deg,#0088ff,#0044ff)','linear-gradient(90deg,#8844ff,#4400cc)','linear-gradient(90deg,#888888,#444444)','linear-gradient(90deg,#00ffff,#0088ff)','linear-gradient(90deg,#ff88ff,#aa00ff)'];
   879|          const label = hudMissionBar.querySelector('#mission-label') as HTMLElement | null;
   880|          const fill  = hudMissionBar.querySelector('#mission-fill') as HTMLElement | null;
   881|          const killsTxt = hudMissionBar.querySelector('#mission-kills-text') as HTMLElement | null;
   882|          if (label) label.textContent = `♾ WORLD ${endlessStage + 1} — ${worldName}`;
   883|          if (fill)  { fill.style.width = `${pct}%`; fill.style.background = fillColors[Math.min(endlessStage, fillColors.length - 1)]; }
   884|          if (killsTxt) killsTxt.textContent = nextThreshold !== null ? `${endlessKills} KILLS  •  NEXT WORLD: ${nextThreshold}` : `${endlessKills} KILLS  •  MAX WORLD!`;
   885|          lastMissionKills = endlessKills;
   886|        }
   887|        if (phase !== lastPhase) {
   888|          hudPhase.textContent = '♾️ ENDLESS';
   889|          hudPhase.style.color = '#cc88ff';
   890|          lastPhase = phase;
   891|        }
   892|      } else {
   893|        const mission = MISSIONS[Math.min(missionIndex, MISSIONS.length - 1)];
   894|        if (missionKills !== lastMissionKills) {
   895|          const pct = Math.min(100, (missionKills / mission.killTarget) * 100);
   896|          const label = hudMissionBar.querySelector('#mission-label') as HTMLElement | null;
   897|          const fill  = hudMissionBar.querySelector('#mission-fill') as HTMLElement | null;
   898|          const killsTxt = hudMissionBar.querySelector('#mission-kills-text') as HTMLElement | null;
   899|          if (label) label.textContent = `⚔ MISSION ${mission.id} / ${MISSIONS.length}  —  ${mission.title}`;
   900|          if (fill)  fill.style.width = `${pct}%`;
   901|          if (killsTxt) killsTxt.textContent = `${missionKills} / ${mission.killTarget} KILLS`;
   902|          lastMissionKills = missionKills;
   903|        }
   904|        if (phase !== lastPhase) {
   905|          const label = phase === 'space' ? '🌌 SPACE' : phase === 'transition' ? '🚀 BREAKING ATMO...' : '🌍 ATMOSPHERE';
   906|          hudPhase.textContent = label;
   907|          hudPhase.style.color = phase === 'space' ? '#aa88ff' : '#88ff88';
   908|          lastPhase = phase;
   909|        }
   910|      }
   911|      // Mission complete flash countdown
   912|      if (missionFlashTimer > 0) {
   913|        missionFlashTimer -= 1/60;
   914|        if (missionFlashTimer <= 0) {
   915|          missionFlash.style.display = 'none';
   916|          missionFlashTimer = 0;
   917|        }
   918|      }
   919|    }
   920|
   921|    function showMissionCompleteFlash(completedMission: Mission, nextMission: Mission | null) {
   922|      const inner = missionFlash.querySelector('#mission-flash-title') as HTMLElement | null;
   923|      const bonus = missionFlash.querySelector('#mission-flash-bonus') as HTMLElement | null;
   924|      const next  = missionFlash.querySelector('#mission-flash-next')  as HTMLElement | null;
   925|      if (inner) inner.textContent = completedMission.title;
   926|      if (bonus) bonus.textContent = `+${completedMission.bonusScore.toLocaleString()} BONUS`;
   927|      if (next) {
   928|        if (nextMission) {
   929|          const nextTheme = MISSION_THEMES[missionIndex < MISSION_THEMES.length ? missionIndex : MISSION_THEMES.length - 1];
   930|          const nextThemeEmoji = THEMES[nextTheme]?.emoji ?? '🪐';
   931|          next.textContent = `${nextThemeEmoji} ENTERING ${nextMission.planet.toUpperCase()} — MISSION ${nextMission.id}: ${nextMission.title}`;
   932|        } else {
   933|          next.textContent = '🏆 ALL MISSIONS COMPLETE!';
   934|        }
   935|      }
   936|      missionFlash.style.display = 'flex';
   937|      missionFlashTimer = 3.5; // show for 3.5 seconds
   938|    }
   939|
   940|    function drawHUD() {
   941|      // Planet toggle only in story mode (endless worlds change automatically by kills)
   942|      const isPlaying = gameState === 'playing';
   943|      const showToggle = isPlaying && gameMode === 'story';
   944|      planetToggle.style.display = showToggle ? 'block' : 'none';
   945|      if (!showToggle) { planetDrawer.style.display = 'none'; drawerOpen = false; }
   946|      if (isPlaying) {
   947|        showPlayingHUD(true);
   948|        updatePlayingHUD();
   949|        // drawer is persistent — only rebuilt when planet changes, not every frame
   950|        return;
   951|      }
   952|      showPlayingHUD(false);
   953|      if (gameState === 'start') {
   954|        // Write into the dedicated modal div (pointer-events:auto, z-index:15)
   955|        modal.style.display = 'flex';
   956|        const diffLabels: Record<Difficulty, string> = { easy: '🟢 EASY', medium: '🟡 MEDIUM', hard: '🔴 HARD' };
   957|        const diffColors: Record<Difficulty, string> = { easy: '#44ff88', medium: '#ffdd44', hard: '#ff4444' };
   958|        const diffDesc: Record<Difficulty, string> = {
   959|          easy:   '5 lives · fast fire · slow enemies',
   960|          medium: '3 lives · balanced · standard speed',
   961|          hard:   '2 lives · slow fire · fast enemies',
   962|        };
   963|        modal.innerHTML = `
   964|          <div style="
   965|            background:rgba(4,8,28,0.96);border:1px solid rgba(60,120,200,0.45);border-radius:22px;
   966|            padding:40px 44px;text-align:center;
   967|            box-shadow:0 0 70px rgba(0,100,220,0.30),0 0 140px rgba(30,60,180,0.18),inset 0 0 60px rgba(0,30,80,0.25);
   968|            min-width:min(420px,100%);max-width:min(480px,100%);max-height:min(86vh,100%);overflow-y:auto;overflow-x:hidden;backdrop-filter:blur(10px);">
   969|
   970|            <!-- Title -->
   971|            <div style="font-size:42px;color:#00ddff;font-weight:900;margin-bottom:4px;
   972|              letter-spacing:4px;text-shadow:0 0 28px #00ddff,0 0 56px #0066ff;">✈ JET STRIKER</div>
   973|            <div style="font-size:11px;color:#3a6080;font-weight:bold;margin-bottom:24px;
   974|              letter-spacing:4px;text-transform:uppercase;">PLANETARY COMBAT SQUADRON</div>
   975|
   976|            <!-- Divider -->
   977|            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(0,180,255,0.4),transparent);margin-bottom:18px;"></div>
   978|
   979|            <!-- Difficulty selector -->
   980|            <div style="margin-bottom:20px;">
   981|              <div style="font-size:10px;color:#3a6080;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;">SELECT DIFFICULTY</div>
   982|              <div style="display:flex;gap:8px;justify-content:center;">
   983|                <button id="diff-easy" style="flex:1;padding:10px 6px;border-radius:10px;cursor:pointer;font-size:11px;font-weight:900;letter-spacing:1px;
   984|                  border:2px solid ${difficulty==='easy'?'#44ff88':'rgba(68,255,136,0.3)'};
   985|                  background:${difficulty==='easy'?'rgba(0,80,30,0.85)':'rgba(0,30,10,0.6)'};
   986|                  color:${difficulty==='easy'?'#44ff88':'#2a6040'};pointer-events:auto;transition:all 0.15s;">
   987|                  🟢 EASY<br><span style="font-size:9px;font-weight:400;opacity:0.7;">5 lives · slow foes</span>
   988|                </button>
   989|                <button id="diff-medium" style="flex:1;padding:10px 6px;border-radius:10px;cursor:pointer;font-size:11px;font-weight:900;letter-spacing:1px;
   990|                  border:2px solid ${difficulty==='medium'?'#ffdd44':'rgba(255,221,68,0.3)'};
   991|                  background:${difficulty==='medium'?'rgba(60,50,0,0.85)':'rgba(30,25,0,0.6)'};
   992|                  color:${difficulty==='medium'?'#ffdd44':'#806a20'};pointer-events:auto;transition:all 0.15s;">
   993|                  🟡 MEDIUM<br><span style="font-size:9px;font-weight:400;opacity:0.7;">3 lives · balanced</span>
   994|                </button>
   995|                <button id="diff-hard" style="flex:1;padding:10px 6px;border-radius:10px;cursor:pointer;font-size:11px;font-weight:900;letter-spacing:1px;
   996|                  border:2px solid ${difficulty==='hard'?'#ff4444':'rgba(255,68,68,0.3)'};
   997|                  background:${difficulty==='hard'?'rgba(80,0,0,0.85)':'rgba(30,0,0,0.6)'};
   998|                  color:${difficulty==='hard'?'#ff4444':'#802020'};pointer-events:auto;transition:all 0.15s;">
   999|                  🔴 HARD<br><span style="font-size:9px;font-weight:400;opacity:0.7;">2 lives · fast foes</span>
  1000|                </button>
  1001|              </div>
  1002|              <div id="diff-desc" style="font-size:10px;color:${diffColors[difficulty]};margin-top:8px;letter-spacing:1px;">${diffDesc[difficulty]}</div>
  1003|            </div>
  1004|
  1005|            <!-- Divider -->
  1006|            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(0,180,255,0.4),transparent);margin-bottom:18px;"></div>
  1007|
  1008|            <!-- Story Missions button -->
  1009|            <button id="btn-story" style="
  1010|              display:block;width:100%;margin-bottom:14px;
  1011|              padding:18px 24px;border-radius:13px;cursor:pointer;
  1012|              border:2px solid rgba(0,200,255,0.55);
  1013|              background:linear-gradient(135deg,rgba(0,30,70,0.9) 0%,rgba(0,60,120,0.7) 100%);
  1014|              box-shadow:0 0 22px rgba(0,160,255,0.25),inset 0 0 20px rgba(0,80,180,0.15);
  1015|              pointer-events:auto;text-align:left;position:relative;overflow:hidden;">
  1016|              <div style="display:flex;align-items:center;gap:14px;">
  1017|                <div style="font-size:34px;line-height:1;">🚀</div>
  1018|                <div>
  1019|                  <div style="font-size:17px;color:#00ddff;font-weight:900;letter-spacing:2px;
  1020|                    text-transform:uppercase;text-shadow:0 0 12px #00aaff;">STORY MISSIONS</div>
  1021|                  <div style="font-size:11px;color:#4a7a99;margin-top:3px;letter-spacing:1px;">
  1022|                    6 missions · escalating kill targets · planet progression
  1023|                  </div>
  1024|                </div>
  1025|                <div style="margin-left:auto;font-size:20px;color:#00aaff;opacity:0.7;">›</div>
  1026|              </div>
  1027|              <div style="position:absolute;bottom:0;left:0;right:0;height:2px;
  1028|                background:linear-gradient(90deg,transparent,#00ddff,transparent);opacity:0.6;"></div>
  1029|            </button>
  1030|
  1031|            <!-- Endless Defense button -->
  1032|            <button id="btn-endless" style="
  1033|              display:block;width:100%;margin-bottom:24px;
  1034|              padding:18px 24px;border-radius:13px;cursor:pointer;
  1035|              border:2px solid rgba(180,80,255,0.55);
  1036|              background:linear-gradient(135deg,rgba(20,0,50,0.9) 0%,rgba(50,0,100,0.7) 100%);
  1037|              box-shadow:0 0 22px rgba(160,60,255,0.25),inset 0 0 20px rgba(100,0,200,0.15);
  1038|              pointer-events:auto;text-align:left;position:relative;overflow:hidden;">
  1039|              <div style="display:flex;align-items:center;gap:14px;">
  1040|                <div style="font-size:34px;line-height:1;">♾️</div>
  1041|                <div>
  1042|                  <div style="font-size:17px;color:#cc88ff;font-weight:900;letter-spacing:2px;
  1043|                    text-transform:uppercase;text-shadow:0 0 12px #aa44ff;">ENDLESS DEFENSE</div>
  1044|                  <div style="font-size:11px;color:#6a4a88;margin-top:3px;letter-spacing:1px;">
  1045|                    survive as long as possible · planet evolves with kills
  1046|                  </div>
  1047|                </div>
  1048|                <div style="margin-left:auto;font-size:20px;color:#aa66ff;opacity:0.7;">›</div>
  1049|              </div>
  1050|              <div style="position:absolute;bottom:0;left:0;right:0;height:2px;
  1051|                background:linear-gradient(90deg,transparent,#cc88ff,transparent);opacity:0.6;"></div>
  1052|            </button>
  1053|
  1054|            <!-- Mission guide -->
  1055|            <div style="margin-top:2px;border-radius:16px;border:1px solid rgba(90,150,220,0.28);background:rgba(5,14,34,0.82);padding:16px 18px;text-align:left;box-shadow:inset 0 0 24px rgba(0,40,90,0.18);">
  1056|              <div style="font-size:10px;color:#5d87a8;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;text-align:center;">Flight guide</div>
  1057|              <div style="font-size:11px;color:#d9f6ff;line-height:1.8;display:grid;gap:6px;">
  1058|                <div><span style="color:#00ddff;font-weight:800;">Best played on desktop</span> for full keyboard and mouse control.</div>
  1059|                <div><span style="color:#7fd6ff;font-weight:800;">Move / turn:</span> <span style="color:#ffffff;">W A S D</span> or <span style="color:#ffffff;">Arrow Keys</span></div>
  1060|                <div><span style="color:#7fd6ff;font-weight:800;">Fire lasers:</span> <span style="color:#ffffff;">Space</span></div>
  1061|                <div><span style="color:#7fd6ff;font-weight:800;">Boost:</span> <span style="color:#ffffff;">F</span></div>
  1062|                <div><span style="color:#7fd6ff;font-weight:800;">Drop bomb:</span> <span style="color:#ffffff;">B</span></div>
  1063|                <div><span style="color:#7fd6ff;font-weight:800;">Pause / resume:</span> <span style="color:#ffffff;">P</span></div>
  1064|                <div><span style="color:#7fd6ff;font-weight:800;">Aim nose:</span> <span style="color:#ffffff;">Mouse move</span></div>
  1065|              </div>
  1066|            </div>
  1067|          </div>`;
  1068|
  1069|        // Difficulty button wiring — clicking a diff button rebuilds the modal with the new selection
  1070|        const diffDesc2: Record<Difficulty, string> = {
  1071|          easy:   '5 lives · fast fire · slow enemies',
  1072|          medium: '3 lives · balanced · standard speed',
  1073|          hard:   '2 lives · slow fire · fast enemies',
  1074|        };
  1075|        const diffColors2: Record<Difficulty, string> = { easy: '#44ff88', medium: '#ffdd44', hard: '#ff4444' };
  1076|        (['easy', 'medium', 'hard'] as Difficulty[]).forEach(d => {
  1077|          const btn = modal.querySelector(`#diff-${d}`);
  1078|          if (btn) btn.addEventListener('click', () => {
  1079|            difficulty = d;
  1080|            // Update button styles in-place without full redraw
  1081|            (['easy', 'medium', 'hard'] as Difficulty[]).forEach(dd => {
  1082|              const b = modal.querySelector(`#diff-${dd}`) as HTMLButtonElement | null;
  1083|              if (!b) return;
  1084|              const active = dd === d;
  1085|              const c = diffColors2[dd];
  1086|              b.style.border = `2px solid ${active ? c : c.replace(')', ',0.3)').replace('rgb', 'rgba')}`;
  1087|              b.style.background = active
  1088|                ? (dd === 'easy' ? 'rgba(0,80,30,0.85)' : dd === 'medium' ? 'rgba(60,50,0,0.85)' : 'rgba(80,0,0,0.85)')
  1089|                : (dd === 'easy' ? 'rgba(0,30,10,0.6)'  : dd === 'medium' ? 'rgba(30,25,0,0.6)'  : 'rgba(30,0,0,0.6)');
  1090|              b.style.color = active ? c : (dd === 'easy' ? '#2a6040' : dd === 'medium' ? '#806a20' : '#802020');
  1091|            });
  1092|            const descEl = modal.querySelector('#diff-desc') as HTMLElement | null;
  1093|            if (descEl) { descEl.textContent = diffDesc2[d]; descEl.style.color = diffColors2[d]; }
  1094|          });
  1095|        });
  1096|
  1097|        const storyBtn = modal.querySelector('#btn-story');
  1098|        if (storyBtn) storyBtn.addEventListener('click', () => { gameMode = 'story'; resetGame(); startBgMusic(); }, { once: true });
  1099|        const endlessBtn = modal.querySelector('#btn-endless');
  1100|        if (endlessBtn) endlessBtn.addEventListener('click', () => { gameMode = 'endless'; resetGame(); startBgMusic(); }, { once: true });
  1101|        return;
  1102|      }
  1103|      if (gameState === 'gameover') {
  1104|        modal.style.display = 'flex';
  1105|
  1106|        if (gameMode === 'endless') {
  1107|          // ── Endless mode gameover ──────────────────────────────────────────
  1108|          const stageNames = ['', 'STAGE 1', 'STAGE 2', 'STAGE 3', 'STAGE 4'];
  1109|          const stageColors = ['', '#ff6666', '#ff8844', '#44aaff', '#cc66ff'];
  1110|          const stageName = stageNames[Math.min(endlessStage, 4)];
  1111|          const stageColor = stageColors[Math.min(endlessStage, 4)];
  1112|          modal.innerHTML = `
  1113|            <div style="
  1114|              background:rgba(10,0,20,0.95);border:2px solid #aa55ff;border-radius:20px;
  1115|              padding:40px 52px;text-align:center;box-shadow:0 0 60px #aa55ff44,0 0 120px #6600cc22;
  1116|              backdrop-filter:blur(8px);min-width:420px;">
  1117|              <div style="font-size:48px;color:#cc88ff;font-weight:bold;margin-bottom:6px;
  1118|                text-shadow:0 0 28px #aa44ff,0 0 56px #6600cc;">♾ DEFENDER DOWN</div>
  1119|              <div style="font-size:12px;color:#8855aa;letter-spacing:3px;margin-bottom:24px;
  1120|                text-transform:uppercase;">Endless Defense — Run Over</div>
  1121|              <div style="background:rgba(255,255,255,0.05);border-radius:14px;padding:20px 28px;margin-bottom:24px;">
  1122|                <div style="font-size:30px;color:#ffdd55;font-weight:bold;margin-bottom:12px;">SCORE: ${score.toLocaleString()}</div>
  1123|                <div style="display:flex;justify-content:space-around;gap:12px;">
  1124|                  <div style="text-align:center;">
  1125|                    <div style="font-size:28px;color:#fff;font-weight:bold;">${endlessKills}</div>
  1126|                    <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;">Total Kills</div>
  1127|                  </div>
  1128|                  <div style="width:1px;background:rgba(255,255,255,0.1);"></div>
  1129|                  <div style="text-align:center;">
  1130|                    <div style="font-size:28px;font-weight:bold;" style="color:${stageColor};">${stageName}</div>
  1131|                    <div style="font-size:10px;color:#888;letter-spacing:1px;text-transform:uppercase;">Stage Reached</div>
  1132|                  </div>
  1133|                </div>
  1134|              </div>
  1135|              <div style="display:flex;gap:12px;justify-content:center;">
  1136|                <button id="restart-btn" style="font-size:16px;color:#000;background:linear-gradient(135deg,#cc88ff,#8800cc);border:none;
  1137|                  font-weight:bold;padding:13px 32px;border-radius:10px;cursor:pointer;
  1138|                  box-shadow:0 0 20px #aa44ff88;letter-spacing:2px;text-transform:uppercase;">
  1139|                  ♾ PLAY AGAIN
  1140|                </button>
  1141|                <button id="menu-btn" style="font-size:16px;color:#aaa;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
  1142|                  font-weight:bold;padding:13px 32px;border-radius:10px;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">
  1143|                  ☰ MENU
  1144|                </button>
  1145|              </div>
  1146|            </div>`;
  1147|          const btn = modal.querySelector('#restart-btn');
  1148|          if (btn) btn.addEventListener('click', () => { gameMode = 'endless'; resetGame(); }, { once: true });
  1149|          const menuBtn = modal.querySelector('#menu-btn');
  1150|          if (menuBtn) menuBtn.addEventListener('click', () => { gameState = 'start'; drawHUD(); }, { once: true });
  1151|        } else {
  1152|          // ── Story mode gameover ────────────────────────────────────────────
  1153|          const completedMissions = missionIndex;
  1154|          const allDone = completedMissions >= MISSIONS.length;
  1155|          const currentMission = MISSIONS[Math.min(missionIndex, MISSIONS.length - 1)];
  1156|          if (allDone) {
  1157|            modal.innerHTML = `
  1158|              <div style="
  1159|                background:rgba(0,10,20,0.95);border:2px solid #00ffcc;border-radius:20px;
  1160|                padding:40px 56px;text-align:center;box-shadow:0 0 60px #00ffcc66,0 0 120px #00aa8822;
  1161|                backdrop-filter:blur(8px);min-width:420px;">
  1162|                <div style="font-size:52px;color:#00ffcc;font-weight:bold;margin-bottom:8px;
  1163|                  text-shadow:0 0 30px #00ffcc,0 0 60px #00ff88;">🏆 VICTORY!</div>
  1164|                <div style="font-size:14px;color:#88ffcc;letter-spacing:3px;margin-bottom:24px;
  1165|                  text-transform:uppercase;">All 6 missions completed</div>
  1166|                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px 24px;margin-bottom:24px;">
  1167|                  <div style="font-size:32px;color:#ffdd00;font-weight:bold;margin-bottom:8px;">SCORE: ${score.toLocaleString()}</div>
  1168|                  <div style="font-size:13px;color:#aaffcc;">You cleared every mission. The skies are yours.</div>
  1169|                </div>
  1170|                <div style="display:flex;gap:12px;justify-content:center;">
  1171|                  <button id="restart-btn" style="font-size:18px;color:#000;background:linear-gradient(135deg,#00ffcc,#00aa88);border:none;
  1172|                    font-weight:bold;padding:13px 36px;border-radius:10px;cursor:pointer;
  1173|                    box-shadow:0 0 24px #00ffcc88;letter-spacing:2px;text-transform:uppercase;">
  1174|                    🔄 PLAY AGAIN
  1175|                  </button>
  1176|                  <button id="menu-btn" style="font-size:18px;color:#aaa;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
  1177|                    font-weight:bold;padding:13px 28px;border-radius:10px;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">
  1178|                    ☰ MENU
  1179|                  </button>
  1180|                </div>
  1181|              </div>`;
  1182|          } else {
  1183|            modal.innerHTML = `
  1184|              <div style="
  1185|                background:rgba(20,0,0,0.92);border:2px solid #ff4444;border-radius:20px;
  1186|                padding:40px 56px;text-align:center;box-shadow:0 0 60px #ff444466,0 0 120px #ff220022;
  1187|                backdrop-filter:blur(8px);min-width:420px;">
  1188|                <div style="font-size:52px;color:#ff4444;font-weight:bold;margin-bottom:8px;
  1189|                  text-shadow:0 0 30px #ff4444,0 0 60px #ff2200;">MISSION FAILED</div>
  1190|                <div style="font-size:14px;color:#ff8866;letter-spacing:3px;margin-bottom:24px;
  1191|                  text-transform:uppercase;">You were shot down</div>
  1192|                <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:16px 24px;margin-bottom:24px;">
  1193|                  <div style="font-size:26px;color:#fff;font-weight:bold;margin-bottom:8px;">SCORE: ${score.toLocaleString()}</div>
  1194|                  <div style="font-size:15px;color:#ffaa66;margin-bottom:4px;">
  1195|                    ${completedMissions > 0 ? `✅ Completed ${completedMissions} mission${completedMissions > 1 ? 's' : ''}` : '❌ No missions completed'}
  1196|                  </div>
  1197|                  <div style="font-size:13px;color:#888;margin-top:6px;">
  1198|                    Last mission: ${currentMission.title} — ${missionKills}/${currentMission.killTarget} kills
  1199|                  </div>
  1200|                </div>
  1201|                <div style="display:flex;gap:12px;justify-content:center;">
  1202|                  <button id="restart-btn" style="font-size:18px;color:#000;background:linear-gradient(135deg,#ff6644,#ff2222);border:none;
  1203|                    font-weight:bold;padding:13px 36px;border-radius:10px;cursor:pointer;
  1204|                    box-shadow:0 0 24px #ff444488;letter-spacing:2px;text-transform:uppercase;">
  1205|                    🔄 TRY AGAIN
  1206|                  </button>
  1207|                  <button id="menu-btn" style="font-size:18px;color:#aaa;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
  1208|                    font-weight:bold;padding:13px 28px;border-radius:10px;cursor:pointer;letter-spacing:2px;text-transform:uppercase;">
  1209|                    ☰ MENU
  1210|                  </button>
  1211|                </div>
  1212|              </div>`;
  1213|          }
  1214|          const btn = modal.querySelector('#restart-btn');
  1215|          if (btn) btn.addEventListener('click', () => { gameMode = 'story'; resetGame(); }, { once: true });
  1216|          const menuBtn = modal.querySelector('#menu-btn');
  1217|          if (menuBtn) menuBtn.addEventListener('click', () => { gameState = 'start'; drawHUD(); }, { once: true });
  1218|        }
  1219|        return;
  1220|      }
  1221|    }
  1222|
  1223|    // ── Web Audio Sound Engine ────────────────────────────────────────────────
  1224|    let audioCtx: AudioContext | null = null;
  1225|    function getAudio(): AudioContext {
  1226|      if (!audioCtx) audioCtx = new AudioContext();
  1227|      return audioCtx;
  1228|    }
  1229|
  1230|    function playShootSound() {
  1231|      // Sharp blue ZAP — high-pitched sine sweep with a click transient
  1232|      try {
  1233|        const ctx = getAudio();
  1234|        const t = ctx.currentTime;
  1235|        // Click transient
  1236|        const click = ctx.createOscillator();
  1237|        const clickGain = ctx.createGain();
  1238|        click.type = 'square';
  1239|        click.frequency.setValueAtTime(4200, t);
  1240|        click.frequency.exponentialRampToValueAtTime(800, t + 0.012);
  1241|        clickGain.gain.setValueAtTime(0.22, t);
  1242|        clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
  1243|        click.connect(clickGain); clickGain.connect(ctx.destination);
  1244|        click.start(t); click.stop(t + 0.012);
  1245|        // Zap sweep
  1246|        const zap = ctx.createOscillator();
  1247|        const zapGain = ctx.createGain();
  1248|        zap.type = 'sine';
  1249|        zap.frequency.setValueAtTime(2200, t + 0.008);
  1250|        zap.frequency.exponentialRampToValueAtTime(180, t + 0.10);
  1251|        zapGain.gain.setValueAtTime(0.14, t + 0.008);
  1252|        zapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  1253|        zap.connect(zapGain); zapGain.connect(ctx.destination);
  1254|        zap.start(t + 0.008); zap.stop(t + 0.10);
  1255|      } catch (_) { /* audio blocked */ }
  1256|    }
  1257|
  1258|    function playEnemyShootSound() {
  1259|      // Low thump — deep sine thud with sub-bass rumble
  1260|      try {
  1261|        const ctx = getAudio();
  1262|        const t = ctx.currentTime;
  1263|        const thump = ctx.createOscillator();
  1264|        const thumpGain = ctx.createGain();
  1265|        thump.type = 'sine';
  1266|        thump.frequency.setValueAtTime(140, t);
  1267|        thump.frequency.exponentialRampToValueAtTime(38, t + 0.18);
  1268|        thumpGain.gain.setValueAtTime(0.55, t);
  1269|        thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  1270|        thump.connect(thumpGain); thumpGain.connect(ctx.destination);
  1271|        thump.start(t); thump.stop(t + 0.22);
  1272|        // Distortion layer
  1273|        const dist = ctx.createOscillator();
  1274|        const distGain = ctx.createGain();
  1275|        dist.type = 'sawtooth';
  1276|        dist.frequency.setValueAtTime(70, t);
  1277|        dist.frequency.exponentialRampToValueAtTime(28, t + 0.12);
  1278|        distGain.gain.setValueAtTime(0.08, t);
  1279|        distGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  1280|        dist.connect(distGain); distGain.connect(ctx.destination);
  1281|        dist.start(t); dist.stop(t + 0.12);
  1282|      } catch (_) { /* audio blocked */ }
  1283|    }
  1284|
  1285|    // ── Background Music (combat synth — driving rhythm + bass + melody) ───────
  1286|    let bgMusicNodes: { stop: () => void } | null = null;
  1287|
  1288|    function startBgMusic() {
  1289|      if (bgMusicNodes) return; // already playing
  1290|      try {
  1291|        const ctx = getAudio();
  1292|        const master = ctx.createGain();
  1293|        master.gain.value = 0;
  1294|        master.connect(ctx.destination);
  1295|        // Fade in over 2 s
  1296|        master.gain.linearRampToValueAtTime(0.72, ctx.currentTime + 2.0);
  1297|
  1298|        // ── Compressor to glue everything together ──────────────────────────
  1299|        const comp = ctx.createDynamicsCompressor();
  1300|        comp.threshold.value = -18; comp.knee.value = 6;
  1301|        comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
  1302|        comp.connect(master);
  1303|
  1304|        // ── Reverb (convolution-free: feedback delay as room sim) ──────────
  1305|        const delay = ctx.createDelay(0.5);
  1306|        delay.delayTime.value = 0.22;
  1307|        const delayFb = ctx.createGain(); delayFb.gain.value = 0.28;
  1308|        const delayWet = ctx.createGain(); delayWet.gain.value = 0.18;
  1309|        delay.connect(delayFb); delayFb.connect(delay);
  1310|        delay.connect(delayWet); delayWet.connect(comp);
  1311|
  1312|        // ── Helper: schedule a short percussive hit ─────────────────────────
  1313|        const kick = (t: number) => {
  1314|          const o = ctx.createOscillator();
  1315|          const g = ctx.createGain();
  1316|          o.type = 'sine';
  1317|          o.frequency.setValueAtTime(160, t);
  1318|          o.frequency.exponentialRampToValueAtTime(38, t + 0.08);
  1319|          g.gain.setValueAtTime(1.0, t);
  1320|          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  1321|          o.connect(g); g.connect(comp);
  1322|          o.start(t); o.stop(t + 0.18);
  1323|        };
  1324|
  1325|        const snare = (t: number) => {
  1326|          // noise burst
  1327|          const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  1328|          const d = buf.getChannelData(0);
  1329|          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.4);
  1330|          const src = ctx.createBufferSource(); src.buffer = buf;
  1331|          const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.8;
  1332|          const g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  1333|          src.connect(filt); filt.connect(g); g.connect(comp); g.connect(delay);
  1334|          src.start(t);
  1335|        };
  1336|
  1337|        const hihat = (t: number, vol = 0.18) => {
  1338|          const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
  1339|          const d = buf.getChannelData(0);
  1340|          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
  1341|          const src = ctx.createBufferSource(); src.buffer = buf;
  1342|          const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 7000;
  1343|          const g = ctx.createGain(); g.gain.value = vol;
  1344|          src.connect(filt); filt.connect(g); g.connect(comp);
  1345|          src.start(t);
  1346|        };
  1347|
  1348|        const bass = (t: number, freq: number, dur: number, vol = 0.55) => {
  1349|          const o = ctx.createOscillator();
  1350|          const g = ctx.createGain();
  1351|          o.type = 'sawtooth';
  1352|          o.frequency.value = freq;
  1353|          // sub-bass filter
  1354|          const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 280; filt.Q.value = 2.2;
  1355|          g.gain.setValueAtTime(vol, t);
  1356|          g.gain.setValueAtTime(vol * 0.7, t + dur * 0.6);
  1357|          g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  1358|          o.connect(filt); filt.connect(g); g.connect(comp);
  1359|          o.start(t); o.stop(t + dur + 0.01);
  1360|        };
  1361|
  1362|        const lead = (t: number, freq: number, dur: number, vol = 0.12) => {
  1363|          const o = ctx.createOscillator();
  1364|          const g = ctx.createGain();
  1365|          o.type = 'square';
  1366|          o.frequency.value = freq;
  1367|          const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1800; filt.Q.value = 1.5;
  1368|          g.gain.setValueAtTime(0, t);
  1369|          g.gain.linearRampToValueAtTime(vol, t + 0.01);
  1370|          g.gain.setValueAtTime(vol, t + dur - 0.04);
  1371|          g.gain.linearRampToValueAtTime(0, t + dur);
  1372|          o.connect(filt); filt.connect(g); g.connect(delay); g.connect(comp);
  1373|          o.start(t); o.stop(t + dur + 0.01);
  1374|        };
  1375|
  1376|        const pad = (t: number, freq: number, dur: number, vol = 0.06) => {
  1377|          const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator();
  1378|          const g = ctx.createGain();
  1379|          o1.type = 'triangle'; o1.frequency.value = freq;
  1380|          o2.type = 'triangle'; o2.frequency.value = freq * 1.005; // slight detune
  1381|          g.gain.setValueAtTime(0, t);
  1382|          g.gain.linearRampToValueAtTime(vol, t + 0.08);
  1383|          g.gain.setValueAtTime(vol, t + dur - 0.1);
  1384|          g.gain.linearRampToValueAtTime(0, t + dur);
  1385|          o1.connect(g); o2.connect(g); g.connect(delay); g.connect(comp);
  1386|          o1.start(t); o2.start(t); o1.stop(t + dur + 0.01); o2.stop(t + dur + 0.01);
  1387|        };
  1388|
  1389|        // ── Pattern: 4/4 at ~128 BPM, bar = 1.875 s, beat = 0.469 s ──────────
  1390|        const BPM = 128;
  1391|        const BEAT = 60 / BPM;          // ~0.469 s
  1392|        const BAR  = BEAT * 4;          // ~1.875 s
  1393|        const LOOP = BAR * 8;           // 8-bar loop ~15 s
  1394|
  1395|        // Bass line (root notes in A minor: A2=110, E2=82, G2=98, C3=131, D2=73)
  1396|        const bassLine = [
  1397|          [0,110],[0.5,110],[1,82],[1.5,82],[2,98],[2.5,98],[3,110],[3.5,73],
  1398|          [4,110],[4.5,110],[5,82],[5.5,82],[6,131],[6.5,131],[7,110],[7.5,98],
  1399|        ]; // in beats
  1400|
  1401|        // Lead melody (A minor pentatonic: A3=220, C4=262, D4=294, E4=330, G4=392)
  1402|        const melody = [
  1403|          [0,220,1],[2,262,0.5],[2.5,294,0.5],[3,330,1],[4,294,0.5],[4.5,262,0.5],
  1404|          [5,220,1],[6,330,0.5],[6.5,392,0.5],[7,330,1],
  1405|          [8,262,1],[10,294,0.5],[10.5,330,0.5],[11,392,1],[12,330,0.5],[12.5,294,0.5],
  1406|          [13,262,1],[14,220,0.5],[14.5,294,0.5],[15,330,1],
  1407|        ]; // in beats
  1408|
  1409|        // Pad chords (Am, F, G, Am)
  1410|        const chords = [
  1411|          [0,[220,262,330],BAR*2],[BAR*2,[175,220,262],BAR*2],
  1412|          [BAR*4,[196,247,294],BAR*2],[BAR*6,[220,262,330],BAR*2],
  1413|        ]; // [startSec, freqs[], dur]
  1414|
  1415|        let stopped = false;
  1416|        const allTimeouts: ReturnType<typeof setTimeout>[] = [];
  1417|
  1418|        const scheduleLoop = (loopStart: number) => {
  1419|          if (stopped) return;
  1420|          const t0 = loopStart;
  1421|
  1422|          // Drums — 8 bars
  1423|          for (let bar = 0; bar < 8; bar++) {
  1424|            const b = t0 + bar * BAR;
  1425|            // Kick: beats 1 & 3
  1426|            kick(b);
  1427|            kick(b + BEAT * 2);
  1428|            // Snare: beats 2 & 4
  1429|            snare(b + BEAT);
  1430|            snare(b + BEAT * 3);
  1431|            // Hi-hats: every 8th note
  1432|            for (let i = 0; i < 8; i++) hihat(b + i * BEAT * 0.5, i % 2 === 0 ? 0.22 : 0.12);
  1433|            // Extra kick on beat 3.5 in bars 2,4,6,8 for drive
  1434|            if (bar % 2 === 1) kick(b + BEAT * 3.5);
  1435|          }
  1436|
  1437|          // Bass line — repeated twice over 8 bars
  1438|          for (let rep = 0; rep < 2; rep++) {
  1439|            bassLine.forEach(([beat, freq]) => {
  1440|              bass(t0 + rep * BAR * 4 + beat * BEAT, freq as number, BEAT * 0.85);
  1441|            });
  1442|          }
  1443|
  1444|          // Lead melody
  1445|          melody.forEach(([beat, freq, dur]) => {
  1446|            lead(t0 + beat * BEAT, freq as number, (dur as number) * BEAT * 0.9);
  1447|          });
  1448|
  1449|          // Pad chords
  1450|          chords.forEach(([start, freqs, dur]) => {
  1451|            (freqs as number[]).forEach(f => pad(t0 + (start as number), f, dur as number));
  1452|          });
  1453|
  1454|          // Schedule next loop
  1455|          const delay2 = (loopStart + LOOP - ctx.currentTime) * 1000 - 200;
  1456|          const tid = setTimeout(() => scheduleLoop(loopStart + LOOP), Math.max(0, delay2));
  1457|          allTimeouts.push(tid);
  1458|        };
  1459|
  1460|        // Start first loop slightly ahead
  1461|        scheduleLoop(ctx.currentTime + 0.1);
  1462|
  1463|        bgMusicNodes = {
  1464|          stop: () => {
  1465|            stopped = true;
  1466|            allTimeouts.forEach(id => clearTimeout(id));
  1467|            master.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 1.2);
  1468|            bgMusicNodes = null;
  1469|          }
  1470|        };
  1471|      } catch (_) { /* audio blocked */ }
  1472|    }
  1473|
  1474|    function playExplosionSound(big = false) {
  1475|      try {
  1476|        const ctx = getAudio();
  1477|        const bufSize = ctx.sampleRate * (big ? 0.6 : 0.35);
  1478|        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  1479|        const data = buf.getChannelData(0);
  1480|        for (let i = 0; i < bufSize; i++) {
  1481|          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, big ? 1.2 : 1.8);
  1482|        }
  1483|        const src = ctx.createBufferSource();
  1484|        src.buffer = buf;
  1485|        const gain = ctx.createGain();
  1486|        const filter = ctx.createBiquadFilter();
  1487|        filter.type = 'lowpass';
  1488|        filter.frequency.value = big ? 600 : 900;
  1489|        src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  1490|        gain.gain.setValueAtTime(big ? 0.9 : 0.55, ctx.currentTime);
  1491|        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (big ? 0.6 : 0.35));
  1492|        src.start(ctx.currentTime);
  1493|      } catch (_) { /* audio blocked */ }
  1494|    }
  1495|
  1496|    // ── Screen Shake ──────────────────────────────────────────────────────────
  1497|    let shakeTimer = 0;
  1498|    let shakeMag = 0;
  1499|
  1500|    // ── Floating Score Text ───────────────────────────────────────────────────
  1501|    interface FloatText { el: HTMLDivElement; life: number; vy: number }
  1502|    const floatTexts: FloatText[] = [];
  1503|
  1504|    function spawnFloatText(text: string, screenX: number, screenY: number, color: string) {
  1505|      const el = document.createElement('div');
  1506|      el.textContent = text;
  1507|      el.style.cssText = `
  1508|        position:absolute;left:${screenX}px;top:${screenY}px;
  1509|        font-family:monospace;font-size:22px;font-weight:bold;
  1510|        color:${color};text-shadow:0 0 8px ${color};
  1511|        pointer-events:none;transform:translateX(-50%);
  1512|        transition:none;white-space:nowrap;
  1513|      `;
  1514|      hud.appendChild(el);
  1515|      floatTexts.push({ el, life: 1.0, vy: -1.8 });
  1516|    }
  1517|
  1518|    function worldToScreen(pos: THREE.Vector3): { x: number; y: number } | null {
  1519|      const v = pos.clone().project(camera);
  1520|      if (v.z > 1) return null; // behind camera
  1521|      const w = mount!.clientWidth, h = mount!.clientHeight;
  1522|      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  1523|    }
  1524|
  1525|    // ── Spherical Earth ───────────────────────────────────────────────────────
  1526|    const EARTH_RADIUS = 80;    // smaller sphere = more dramatic visible curvature
  1527|    // FLIGHT_ALTITUDE declared above in jet state vars (= 12)
  1528|
  1529|    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 96, 96);
  1530|    // NASA-accurate Earth vertex colors
  1531|    const earthColors: number[] = [];
  1532|    const earthPos = earthGeo.attributes.position.array as Float32Array;
  1533|
  1534|    // Smooth deterministic noise — no Math.random() so colors are stable per vertex
  1535|    function hash(a: number, b: number, c: number): number {
  1536|      let s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  1537|      return s - Math.floor(s);
  1538|    }
  1539|    function smoothNoise(nx: number, ny: number, nz: number, freq: number): number {
  1540|      return Math.sin(nx * freq + 1.3) * Math.cos(ny * freq * 0.9 + 0.7) * Math.sin(nz * freq * 1.1 + 2.4);
  1541|    }
  1542|
  1543|    for (let i = 0; i < earthPos.length / 3; i++) {
  1544|      const x = earthPos[i * 3], y = earthPos[i * 3 + 1], z = earthPos[i * 3 + 2];
  1545|      const len = Math.sqrt(x * x + y * y + z * z);
  1546|      const nx = x / len, ny = y / len, nz = z / len;
  1547|
  1548|      // Latitude: ny = -1 (south pole) to +1 (north pole)
  1549|      const lat = ny; // signed
  1550|      const absLat = Math.abs(lat);
  1551|
  1552|      // Multi-octave continent noise
  1553|      const n1 = smoothNoise(nx, ny, nz, 3.8);
  1554|      const n2 = smoothNoise(nx, ny, nz, 7.2) * 0.5;
  1555|      const n3 = smoothNoise(nx, ny, nz, 13.1) * 0.25;
  1556|      const n4 = smoothNoise(nx + 0.5, ny + 0.3, nz + 0.7, 5.5) * 0.4;
  1557|      const landVal = n1 * 0.45 + n2 * 0.25 + n3 * 0.15 + n4 * 0.15;
  1558|
  1559|      // Fine detail hash for micro-variation (replaces Math.random)
  1560|      const detail = hash(nx, ny, nz);
  1561|
  1562|      // ── Polar ice caps — NASA Blue Marble white ───────────────────────────
  1563|      if (absLat > 0.76) {
  1564|        const iceBlend = Math.min(1, (absLat - 0.76) / 0.14);
  1565|        // Pure brilliant white with very faint blue tint (like real Antarctic ice)
  1566|        earthColors.push(
  1567|          0.90 + iceBlend * 0.09 + detail * 0.01,
  1568|          0.93 + iceBlend * 0.06 + detail * 0.01,
  1569|          0.97 + iceBlend * 0.03
  1570|        );
  1571|
  1572|      // ── Sub-polar: tundra / boreal taiga ─────────────────────────────────
  1573|      } else if (absLat > 0.60) {
  1574|        if (landVal > 0.0) {
  1575|          // Siberian / Canadian tundra — dark olive-brown with grey patches
  1576|          earthColors.push(0.38 + detail * 0.10, 0.44 + detail * 0.10, 0.28 + detail * 0.08);
  1577|        } else {
  1578|          // Arctic / Southern ocean — very dark navy blue (near-black like real polar seas)
  1579|          earthColors.push(0.02 + detail * 0.02, 0.12 + detail * 0.06, 0.38 + detail * 0.08);
  1580|        }
  1581|
  1582|      // ── Temperate zone ────────────────────────────────────────────────────
  1583|      } else if (absLat > 0.26) {
  1584|        if (landVal > 0.06) {
  1585|          const elevation = landVal;
  1586|          if (elevation > 0.36) {
  1587|            // High mountains — bare rock grey + bright snow caps (Alps, Rockies, Himalayas)
  1588|            const snowBlend = Math.min(1, (elevation - 0.36) / 0.12);
  1589|            earthColors.push(
  1590|              0.48 + snowBlend * 0.46 + detail * 0.06,
  1591|              0.46 + snowBlend * 0.48 + detail * 0.06,
  1592|              0.42 + snowBlend * 0.52 + detail * 0.04
  1593|            );
  1594|          } else if (elevation > 0.20) {
  1595|            // Mid-elevation hills — warm brown-tan (like Appalachians, European hills)
  1596|            earthColors.push(0.46 + detail * 0.10, 0.36 + detail * 0.10, 0.22 + detail * 0.08);
  1597|          } else {
  1598|            // Temperate forest — vivid medium green (Europe, eastern USA, China)
  1599|            earthColors.push(0.14 + detail * 0.10, 0.46 + detail * 0.16, 0.08 + detail * 0.06);
  1600|          }
  1601|        } else if (landVal > -0.03) {
  1602|          // Coastal shelf / estuary — bright teal-green (like real satellite coastal water)
  1603|          earthColors.push(0.02 + detail * 0.02, 0.42 + detail * 0.12, 0.58 + detail * 0.12);
  1604|        } else {
  1605|          // Deep temperate ocean — rich saturated Atlantic/Pacific blue
  1606|          earthColors.push(0.01 + detail * 0.01, 0.18 + detail * 0.06, 0.62 + detail * 0.08);
  1607|        }
  1608|
  1609|      // ── Tropical / subtropical zone ───────────────────────────────────────
  1610|      } else {
  1611|        if (landVal > 0.06) {
  1612|          const desertNoise = smoothNoise(nx + 1.1, ny + 0.4, nz + 0.9, 4.2);
  1613|          const isDesert = desertNoise > 0.16 && absLat > 0.07;
  1614|          const isSavanna = desertNoise > -0.12 && desertNoise <= 0.16 && absLat > 0.05;
  1615|          const elevation = landVal;
  1616|
  1617|          if (elevation > 0.38) {
  1618|            // Tropical high mountain — Andes / Ethiopian highlands grey-brown
  1619|            earthColors.push(0.44 + detail * 0.10, 0.38 + detail * 0.10, 0.30 + detail * 0.08);
  1620|          } else if (isDesert) {
  1621|            // Hot desert — vivid Sahara orange-red / Arabian tan
  1622|            const redShift = smoothNoise(nx * 2.2, ny * 2.2, nz * 2.2, 5.5) * 0.5 + 0.5;
  1623|            earthColors.push(
  1624|              0.82 + redShift * 0.14 + detail * 0.04,  // deep orange-red
  1625|              0.56 + redShift * 0.10 + detail * 0.06,  // golden yellow
  1626|              0.18 + detail * 0.08                      // very low blue
  1627|            );
  1628|          } else if (isSavanna) {
  1629|            // Savanna / dry grassland — warm golden-yellow (Africa, Brazil cerrado)
  1630|            earthColors.push(0.64 + detail * 0.10, 0.52 + detail * 0.10, 0.18 + detail * 0.08);
  1631|          } else {
  1632|            // Tropical rainforest — deep saturated Amazon / Congo green
  1633|            earthColors.push(0.04 + detail * 0.06, 0.42 + detail * 0.16, 0.04 + detail * 0.06);
  1634|          }
  1635|        } else if (landVal > -0.04) {
  1636|          // Tropical shallow reef — vivid Caribbean / Coral Sea turquoise
  1637|          earthColors.push(0.01 + detail * 0.02, 0.58 + detail * 0.14, 0.76 + detail * 0.10);
  1638|        } else {
  1639|          // Deep tropical ocean — intense Pacific / Indian Ocean blue
  1640|          earthColors.push(0.01, 0.14 + detail * 0.06, 0.60 + detail * 0.10);
  1641|        }
  1642|      }
  1643|    }
  1644|
  1645|    earthGeo.setAttribute('color', new THREE.Float32BufferAttribute(earthColors, 3));
  1646|    earthGeo.computeVertexNormals();
  1647|
  1648|    // ── Procedural Planet Texture Generator ───────────────────────────────────
  1649|    // Generates color, roughness, and emissive canvas textures for each planet type.
  1650|    // Uses the same noise functions as the vertex color system for consistency.
  1651|    const TEX_W = 1024, TEX_H = 512;
  1652|
  1653|    function buildPlanetTextures(theme: PlanetTheme): {
  1654|      map: THREE.CanvasTexture;
  1655|      roughnessMap: THREE.CanvasTexture;
  1656|      emissiveMap: THREE.CanvasTexture;
  1657|    } {
  1658|      const colorCanvas = document.createElement('canvas');
  1659|      colorCanvas.width = TEX_W; colorCanvas.height = TEX_H;
  1660|      const roughCanvas = document.createElement('canvas');
  1661|      roughCanvas.width = TEX_W; roughCanvas.height = TEX_H;
  1662|      const emitCanvas = document.createElement('canvas');
  1663|      emitCanvas.width = TEX_W; emitCanvas.height = TEX_H;
  1664|
  1665|      const cc = colorCanvas.getContext('2d')!;
  1666|      const rc = roughCanvas.getContext('2d')!;
  1667|      const ec = emitCanvas.getContext('2d')!;
  1668|
  1669|      const cImg = cc.createImageData(TEX_W, TEX_H);
  1670|      const rImg = rc.createImageData(TEX_W, TEX_H);
  1671|      const eImg = ec.createImageData(TEX_W, TEX_H);
  1672|
  1673|      for (let py = 0; py < TEX_H; py++) {
  1674|        for (let px = 0; px < TEX_W; px++) {
  1675|          // Convert pixel to sphere normal (equirectangular)
  1676|          const lon = (px / TEX_W) * Math.PI * 2 - Math.PI;
  1677|          const lat = (py / TEX_H) * Math.PI - Math.PI / 2;
  1678|          const nx = Math.cos(lat) * Math.cos(lon);
  1679|          const ny = Math.sin(lat);
  1680|          const nz = Math.cos(lat) * Math.sin(lon);
  1681|          const absLat = Math.abs(ny);
  1682|
  1683|          // Multi-octave noise — same as vertex color system
  1684|          const n1 = smoothNoise(nx, ny, nz, 3.8);
  1685|          const n2 = smoothNoise(nx, ny, nz, 7.2) * 0.5;
  1686|          const n3 = smoothNoise(nx, ny, nz, 13.1) * 0.25;
  1687|          const n4 = smoothNoise(nx + 0.5, ny + 0.3, nz + 0.7, 5.5) * 0.4;
  1688|          const landVal = n1 * 0.45 + n2 * 0.25 + n3 * 0.15 + n4 * 0.15;
  1689|
  1690|          // Fine detail — high-frequency micro-variation
  1691|          const d1 = smoothNoise(nx, ny, nz, 22.0) * 0.5 + 0.5;
  1692|          const d2 = smoothNoise(nx + 1.7, ny + 0.9, nz + 2.3, 38.0) * 0.5 + 0.5;
  1693|          const detail = hash(nx, ny, nz);
  1694|          const microDetail = d1 * 0.6 + d2 * 0.4;
  1695|
  1696|          const idx = (py * TEX_W + px) * 4;
  1697|          let cr = 0, cg = 0, cb = 0;
  1698|          let rough = 0.7;
  1699|          let er = 0, eg = 0, eb = 0;
  1700|
  1701|          if (theme === 'earth') {
  1702|            if (absLat > 0.76) {
  1703|              // Polar ice — brilliant white with faint blue
  1704|              const ib = Math.min(1, (absLat - 0.76) / 0.14);
  1705|              cr = 0.90 + ib * 0.09; cg = 0.93 + ib * 0.06; cb = 0.97 + ib * 0.03;
  1706|              rough = 0.25 + microDetail * 0.15;
  1707|            } else if (landVal > 0.06) {
  1708|              if (landVal > 0.36) {
  1709|                // Mountain snow caps
  1710|                const sb = Math.min(1, (landVal - 0.36) / 0.12);
  1711|                cr = 0.48 + sb * 0.46 + detail * 0.06;
  1712|                cg = 0.46 + sb * 0.48 + detail * 0.06;
  1713|                cb = 0.42 + sb * 0.52 + detail * 0.04;
  1714|                rough = 0.55 + microDetail * 0.2;
  1715|              } else if (landVal > 0.20) {
  1716|                // Hills / rock
  1717|                cr = 0.46 + detail * 0.10; cg = 0.36 + detail * 0.10; cb = 0.22 + detail * 0.08;
  1718|                rough = 0.80 + microDetail * 0.15;
  1719|              } else {
  1720|                // Forest / grassland — rich greens with micro variation
  1721|                cr = 0.10 + microDetail * 0.12 + detail * 0.08;
  1722|                cg = 0.42 + microDetail * 0.14 + detail * 0.12;
  1723|                cb = 0.06 + microDetail * 0.06 + detail * 0.04;
  1724|                rough = 0.75 + microDetail * 0.15;
  1725|              }
  1726|            } else if (landVal > -0.03) {
  1727|              // Coastal shelf — teal
  1728|              cr = 0.02 + microDetail * 0.04; cg = 0.42 + microDetail * 0.12; cb = 0.58 + microDetail * 0.10;
  1729|              rough = 0.15 + microDetail * 0.10;
  1730|            } else {
  1731|              // Deep ocean — rich blue with wave shimmer
  1732|              cr = 0.01 + microDetail * 0.02;
  1733|              cg = 0.14 + microDetail * 0.08 + detail * 0.06;
  1734|              cb = 0.55 + microDetail * 0.12 + detail * 0.08;
  1735|              rough = 0.08 + microDetail * 0.12;
  1736|            }
  1737|
  1738|          } else if (theme === 'ice') {
  1739|            if (landVal > 0.05 || absLat > 0.35) {
  1740|              // Ice sheet — white-blue with frozen crack detail
  1741|              const crackVal = smoothNoise(nx * 2, ny * 2, nz * 2, 18.0);
  1742|              const isCrack = crackVal > 0.55 && crackVal < 0.62;
  1743|              if (isCrack) {
  1744|                // Frozen crack lines — deep blue
  1745|                cr = 0.30 + detail * 0.10; cg = 0.50 + detail * 0.10; cb = 0.80 + detail * 0.08;
  1746|                rough = 0.60;
  1747|              } else {
  1748|                const blend = Math.min(1, absLat * 1.5);
  1749|                cr = 0.82 + blend * 0.16 + microDetail * 0.02;
  1750|                cg = 0.88 + blend * 0.10 + microDetail * 0.02;
  1751|                cb = 0.96 + blend * 0.04;
  1752|                rough = 0.20 + microDetail * 0.15; // very smooth ice
  1753|              }
  1754|            } else {
  1755|              // Frozen ocean — dark blue-grey
  1756|              cr = 0.28 + microDetail * 0.10; cg = 0.48 + microDetail * 0.12; cb = 0.72 + microDetail * 0.10;
  1757|              rough = 0.12 + microDetail * 0.10;
  1758|            }
  1759|
  1760|          } else if (theme === 'lava') {
  1761|            // Real fire lava: multi-layer noise for flowing rivers of fire
  1762|            const fireN1 = smoothNoise(nx * 1.8, ny * 1.8, nz * 1.8, 6.0);
  1763|            const fireN2 = smoothNoise(nx + 2.1, ny + 0.8, nz + 1.4, 11.0) * 0.5;
  1764|            const fireN3 = smoothNoise(nx * 3.5, ny * 3.5, nz * 3.5, 18.0) * 0.25;
  1765|            const fireFlow = fireN1 * 0.55 + fireN2 * 0.30 + fireN3 * 0.15;
  1766|            // Crack network — thin bright lines of molten rock
  1767|            const crackA = smoothNoise(nx * 4.0, ny * 4.0, nz * 4.0, 22.0);
  1768|            const crackB = smoothNoise(nx + 1.3, ny + 2.7, nz + 0.5, 30.0);
  1769|            const isCrack = (Math.abs(crackA) < 0.08) || (Math.abs(crackB) < 0.06);
  1770|            // Hot core channels
  1771|            const isLavaRiver = fireFlow > 0.10 && fireFlow < 0.45;
  1772|            const isHotSpot   = fireFlow > 0.45;
  1773|
  1774|            if (isCrack) {
  1775|              // Glowing crack — pure white-yellow core like real lava cracks
  1776|              const crackHeat = 0.7 + microDetail * 0.3;
  1777|              cr = 1.0; cg = 0.85 + crackHeat * 0.15; cb = crackHeat * 0.40;
  1778|              rough = 0.05;
  1779|              er = 1.0; eg = 0.70 + crackHeat * 0.20; eb = crackHeat * 0.20;
  1780|            } else if (isHotSpot) {
  1781|              // Hottest lava — bright yellow-white core
  1782|              const heat = (fireFlow - 0.45) / 0.55;
  1783|              cr = 1.0; cg = 0.60 + heat * 0.35; cb = heat * 0.15;
  1784|              rough = 0.10 + microDetail * 0.15;
  1785|              er = 1.0; eg = 0.50 + heat * 0.40; eb = heat * 0.10;
  1786|            } else if (isLavaRiver) {
  1787|              // Flowing lava river — orange to deep red gradient
  1788|              const t = (fireFlow - 0.10) / 0.35; // 0=cool edge, 1=hot center
  1789|              const heat = Math.pow(t, 0.6) * (0.5 + microDetail * 0.5);
  1790|              cr = 0.85 + heat * 0.15; cg = 0.20 + heat * 0.35; cb = 0.00;
  1791|              rough = 0.20 + microDetail * 0.25;
  1792|              er = 0.80 + heat * 0.20; eg = 0.15 + heat * 0.30; eb = 0.00;
  1793|            } else if (landVal > 0.08) {
  1794|              // Volcanic rock — very dark basalt with micro-roughness
  1795|              cr = 0.08 + microDetail * 0.07 + detail * 0.05;
  1796|              cg = 0.04 + microDetail * 0.03 + detail * 0.03;
  1797|              cb = 0.02 + microDetail * 0.02 + detail * 0.01;
  1798|              rough = 0.92 + microDetail * 0.06;
  1799|              // Faint ember glow in rock crevices
  1800|              if (microDetail > 0.65) {
  1801|                er = (microDetail - 0.65) * 0.8; eg = (microDetail - 0.65) * 0.15; eb = 0.0;
  1802|              }
  1803|            } else {
  1804|              // Cooled lava crust — dark red-brown with ember veins
  1805|              cr = 0.30 + microDetail * 0.12 + detail * 0.08;
  1806|              cg = 0.04 + microDetail * 0.04 + detail * 0.03;
  1807|              cb = 0.00;
  1808|              rough = 0.88 + microDetail * 0.10;
  1809|              // Ember glow in surface cracks
  1810|              const emberN = smoothNoise(nx * 5.0, ny * 5.0, nz * 5.0, 35.0);
  1811|              if (emberN > 0.35) {
  1812|                const e = (emberN - 0.35) * 1.5;
  1813|                er = e * 0.90; eg = e * 0.20; eb = 0.0;
  1814|              }
  1815|            }
  1816|
  1817|          } else if (theme === 'storm') {
  1818|            // Dark surface with energy veins
  1819|            const veinN = smoothNoise(nx * 2.5, ny * 2.5, nz * 2.5, 14.0);
  1820|            const vein2 = smoothNoise(nx + 3.1, ny + 1.7, nz + 2.4, 28.0);
  1821|            const isVein = (veinN > 0.38 && veinN < 0.46) || (vein2 > 0.42 && vein2 < 0.48);
  1822|            if (isVein) {
  1823|              // Energy vein — bright purple-blue
  1824|              const intensity = 0.6 + microDetail * 0.4;
  1825|              cr = 0.30 + intensity * 0.40; cg = 0.20 + intensity * 0.30; cb = 0.60 + intensity * 0.35;
  1826|              rough = 0.20;
  1827|              er = intensity * 0.45; eg = intensity * 0.30; eb = intensity * 0.90;
  1828|            } else if (landVal > 0.05) {
  1829|              // Dark rock surface
  1830|              cr = 0.14 + microDetail * 0.10 + detail * 0.06;
  1831|              cg = 0.16 + microDetail * 0.10 + detail * 0.06;
  1832|              cb = 0.22 + microDetail * 0.10 + detail * 0.06;
  1833|              rough = 0.85 + microDetail * 0.10;
  1834|            } else {
  1835|              // Dark lowlands
  1836|              cr = 0.06 + microDetail * 0.06 + detail * 0.04;
  1837|              cg = 0.08 + microDetail * 0.06 + detail * 0.04;
  1838|              cb = 0.14 + microDetail * 0.08 + detail * 0.06;
  1839|              rough = 0.80 + microDetail * 0.12;
  1840|              // Faint energy glow in lowlands
  1841|              if (veinN > 0.30) {
  1842|                er = (veinN - 0.30) * 0.3; eg = (veinN - 0.30) * 0.2; eb = (veinN - 0.30) * 0.8;
  1843|              }
  1844|            }
  1845|
  1846|          } else if (theme === 'ocean') {
  1847|            if (landVal > 0.15) {
  1848|              // Small islands — dark rock
  1849|              cr = 0.10 + microDetail * 0.08 + detail * 0.06;
  1850|              cg = 0.32 + microDetail * 0.10 + detail * 0.08;
  1851|              cb = 0.50 + microDetail * 0.08 + detail * 0.06;
  1852|              rough = 0.80 + microDetail * 0.12;
  1853|            } else if (landVal > -0.02) {
  1854|              // Shallow water — vivid turquoise
  1855|              cr = 0.01 + microDetail * 0.04;
  1856|              cg = 0.50 + microDetail * 0.16 + detail * 0.10;
  1857|              cb = 0.76 + microDetail * 0.12 + detail * 0.08;
  1858|              rough = 0.06 + microDetail * 0.08;
  1859|            } else {
  1860|              // Deep ocean — intense blue with wave shimmer
  1861|              const waveN = smoothNoise(nx * 4, ny * 4, nz * 4, 32.0) * 0.5 + 0.5;
  1862|              cr = 0.00 + waveN * 0.04;
  1863|              cg = 0.10 + waveN * 0.10 + microDetail * 0.06;
  1864|              cb = 0.50 + waveN * 0.14 + microDetail * 0.10;
  1865|              rough = 0.04 + waveN * 0.08;
  1866|            }
  1867|
  1868|          } else if (theme === 'desert') {
  1869|            // Sandy dunes with rocky ridges and canyon shadows
  1870|            const duneN = smoothNoise(nx * 2.2, ny * 2.2, nz * 2.2, 9.0) * 0.5 + 0.5;
  1871|            if (landVal > 0.30) {
  1872|              // Rocky mesa / canyon walls — dark orange-brown
  1873|              cr = 0.62 + microDetail * 0.10 + detail * 0.08;
  1874|              cg = 0.34 + microDetail * 0.08 + detail * 0.06;
  1875|              cb = 0.10 + microDetail * 0.04 + detail * 0.04;
  1876|              rough = 0.88 + microDetail * 0.10;
  1877|            } else if (landVal > 0.05) {
  1878|              // Sand dunes — warm golden with ripple variation
  1879|              cr = 0.82 + duneN * 0.12 + microDetail * 0.06;
  1880|              cg = 0.60 + duneN * 0.10 + microDetail * 0.06;
  1881|              cb = 0.18 + duneN * 0.06 + microDetail * 0.04;
  1882|              rough = 0.70 + microDetail * 0.18;
  1883|            } else {
  1884|              // Flat desert floor — pale tan
  1885|              cr = 0.72 + microDetail * 0.10 + detail * 0.08;
  1886|              cg = 0.50 + microDetail * 0.08 + detail * 0.06;
  1887|              cb = 0.20 + microDetail * 0.06 + detail * 0.04;
  1888|              rough = 0.78 + microDetail * 0.14;
  1889|            }
  1890|
  1891|          } else if (theme === 'forest') {
  1892|            // Dense jungle canopy with rivers and snow peaks
  1893|            if (absLat > 0.72) {
  1894|              // Snow caps
  1895|              const sb = Math.min(1, (absLat - 0.72) / 0.12);
  1896|              cr = 0.80 + sb * 0.18; cg = 0.88 + sb * 0.10; cb = 0.80 + sb * 0.18;
  1897|              rough = 0.30 + microDetail * 0.15;
  1898|            } else if (landVal > 0.28) {
  1899|              // Mountain rock — dark grey-green
  1900|              cr = 0.20 + microDetail * 0.10 + detail * 0.08;
  1901|              cg = 0.28 + microDetail * 0.10 + detail * 0.08;
  1902|              cb = 0.14 + microDetail * 0.06 + detail * 0.04;
  1903|              rough = 0.85 + microDetail * 0.10;
  1904|            } else if (landVal > 0.02) {
  1905|              // Dense forest canopy — deep saturated greens
  1906|              const canopyN = smoothNoise(nx * 3, ny * 3, nz * 3, 20.0) * 0.5 + 0.5;
  1907|              cr = 0.04 + canopyN * 0.08 + microDetail * 0.06;
  1908|              cg = 0.38 + canopyN * 0.18 + microDetail * 0.14;
  1909|              cb = 0.04 + canopyN * 0.06 + microDetail * 0.04;
  1910|              rough = 0.80 + microDetail * 0.12;
  1911|            } else {
  1912|              // Rivers / lakes — deep teal-blue
  1913|              cr = 0.02 + microDetail * 0.04;
  1914|              cg = 0.28 + microDetail * 0.12 + detail * 0.08;
  1915|              cb = 0.55 + microDetail * 0.12 + detail * 0.08;
  1916|              rough = 0.06 + microDetail * 0.08;
  1917|            }
  1918|
  1919|          } else if (theme === 'cyber') {
  1920|            // Dark surface with glowing neon grid lines and city lights
  1921|            const gridX = Math.abs(Math.sin(nx * 28.0 + ny * 14.0));
  1922|            const gridZ = Math.abs(Math.sin(nz * 28.0 + ny * 14.0));
  1923|            const isGrid = gridX < 0.06 || gridZ < 0.06;
  1924|            const cityN = smoothNoise(nx * 4, ny * 4, nz * 4, 18.0);
  1925|            const isCity = cityN > 0.55;
  1926|            if (isGrid) {
  1927|              // Neon grid lines — bright cyan/magenta
  1928|              const hue = smoothNoise(nx, ny, nz, 2.0) > 0 ? 1.0 : 0.0;
  1929|              cr = 0.20 + hue * 0.60; cg = 0.10 + (1 - hue) * 0.20; cb = 0.80 + hue * 0.18;
  1930|              rough = 0.10;
  1931|              er = cr * 0.80; eg = cg * 0.40; eb = cb * 0.90;
  1932|            } else if (isCity) {
  1933|              // City blocks — dark purple with neon glow
  1934|              cr = 0.10 + microDetail * 0.06; cg = 0.00; cb = 0.18 + microDetail * 0.08;
  1935|              rough = 0.60 + microDetail * 0.20;
  1936|              // City light emission — scattered warm/cool points
  1937|              const lightN = smoothNoise(nx * 8, ny * 8, nz * 8, 40.0);
  1938|              if (lightN > 0.60) {
  1939|                er = (lightN - 0.60) * 1.5; eg = (lightN - 0.60) * 0.5; eb = (lightN - 0.60) * 2.0;
  1940|              }
  1941|            } else {
  1942|              // Dark terrain
  1943|              cr = 0.06 + microDetail * 0.04; cg = 0.00; cb = 0.10 + microDetail * 0.04;
  1944|              rough = 0.90 + microDetail * 0.08;
  1945|            }
  1946|
  1947|          } else { // asteroid
  1948|            // Grey rocky surface with craters and iron-rich veins
  1949|            const craterN = smoothNoise(nx * 1.8, ny * 1.8, nz * 1.8, 7.0);
  1950|            const isCrater = craterN > 0.52 && craterN < 0.60;
  1951|            const ironN = smoothNoise(nx * 3, ny * 3, nz * 3, 22.0);
  1952|            const isIron = ironN > 0.58 && ironN < 0.64;
  1953|            if (isCrater) {
  1954|              // Crater rim / shadow — very dark
  1955|              cr = 0.08 + microDetail * 0.06; cg = 0.06 + microDetail * 0.04; cb = 0.05 + microDetail * 0.04;
  1956|              rough = 0.95;
  1957|            } else if (isIron) {
  1958|              // Iron-rich vein — warm rust-brown
  1959|              cr = 0.45 + microDetail * 0.12; cg = 0.22 + microDetail * 0.08; cb = 0.10 + microDetail * 0.06;
  1960|              rough = 0.75 + microDetail * 0.15;
  1961|            } else if (landVal > 0.15) {
  1962|              // Rocky highland — medium grey
  1963|              cr = 0.36 + microDetail * 0.12 + detail * 0.08;
  1964|              cg = 0.30 + microDetail * 0.10 + detail * 0.06;
  1965|              cb = 0.24 + microDetail * 0.08 + detail * 0.06;
  1966|              rough = 0.88 + microDetail * 0.10;
  1967|            } else {
  1968|              // Flat regolith — dark grey dust
  1969|              cr = 0.18 + microDetail * 0.10 + detail * 0.06;
  1970|              cg = 0.15 + microDetail * 0.08 + detail * 0.04;
  1971|              cb = 0.12 + microDetail * 0.06 + detail * 0.04;
  1972|              rough = 0.82 + microDetail * 0.12;
  1973|            }
  1974|          }
  1975|
  1976|          // Clamp and write color
  1977|          cImg.data[idx]     = Math.min(255, Math.round(cr * 255));
  1978|          cImg.data[idx + 1] = Math.min(255, Math.round(cg * 255));
  1979|          cImg.data[idx + 2] = Math.min(255, Math.round(cb * 255));
  1980|          cImg.data[idx + 3] = 255;
  1981|
  1982|          // Roughness (R channel only, stored as greyscale)
  1983|          const rv = Math.min(255, Math.round(rough * 255));
  1984|          rImg.data[idx] = rv; rImg.data[idx + 1] = rv; rImg.data[idx + 2] = rv; rImg.data[idx + 3] = 255;
  1985|
  1986|          // Emissive
  1987|          eImg.data[idx]     = Math.min(255, Math.round(er * 255));
  1988|          eImg.data[idx + 1] = Math.min(255, Math.round(eg * 255));
  1989|          eImg.data[idx + 2] = Math.min(255, Math.round(eb * 255));
  1990|          eImg.data[idx + 3] = 255;
  1991|        }
  1992|      }
  1993|
  1994|      cc.putImageData(cImg, 0, 0);
  1995|      rc.putImageData(rImg, 0, 0);
  1996|      ec.putImageData(eImg, 0, 0);
  1997|
  1998|      const map = new THREE.CanvasTexture(colorCanvas);
  1999|      const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  2000|      const emissiveMap = new THREE.CanvasTexture(emitCanvas);
  2001|      map.colorSpace = THREE.SRGBColorSpace;
  2002|      return { map, roughnessMap, emissiveMap };
  2003|    }
  2004|
  2005|    // ── Pre-build ALL theme textures at startup (small res = fast) ────────────
  2006|    // Reduces TEX_W/TEX_H to 64×32 for the cache so all 9 themes build in <10ms total.
  2007|    // applyTheme() just swaps from this cache — zero mid-game computation.
  2008|    const PLANET_THEMES_LIST: PlanetTheme[] = ['earth', 'desert', 'ice', 'lava', 'asteroid', 'cyber', 'forest', 'ocean', 'storm', 'gas'];
  2009|    const planetTextureCache = new Map<PlanetTheme, { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }>();
  2010|    {
  2011|      const CW = 64, CH = 32; // tiny — no startup hang
  2012|      for (const th of PLANET_THEMES_LIST) {
  2013|        const colorCanvas = document.createElement('canvas');
  2014|        colorCanvas.width = CW; colorCanvas.height = CH;
  2015|        const roughCanvas = document.createElement('canvas');
  2016|        roughCanvas.width = CW; roughCanvas.height = CH;
  2017|        const cc = colorCanvas.getContext('2d')!;
  2018|        const rc = roughCanvas.getContext('2d')!;
  2019|        const cImg = cc.createImageData(CW, CH);
  2020|        const rImg = rc.createImageData(CW, CH);
  2021|        for (let py = 0; py < CH; py++) {
  2022|          for (let px = 0; px < CW; px++) {
  2023|            const lon = (px / CW) * Math.PI * 2 - Math.PI;
  2024|            const lat = (py / CH) * Math.PI - Math.PI / 2;
  2025|            const nx = Math.cos(lat) * Math.cos(lon);
  2026|            const ny = Math.sin(lat);
  2027|            const nz = Math.cos(lat) * Math.sin(lon);
  2028|            const absLat = Math.abs(ny);
  2029|            const n1 = smoothNoise(nx, ny, nz, 3.8);
  2030|            const n2 = smoothNoise(nx, ny, nz, 7.2) * 0.5;
  2031|            const n3 = smoothNoise(nx, ny, nz, 13.1) * 0.25;
  2032|            const n4 = smoothNoise(nx + 0.5, ny + 0.3, nz + 0.7, 5.5) * 0.4;
  2033|            const landVal = n1 * 0.45 + n2 * 0.25 + n3 * 0.15 + n4 * 0.15;
  2034|            const detail = hash(nx, ny, nz);
  2035|            const idx = (py * CW + px) * 4;
  2036|            let cr = 0, cg = 0, cb = 0, rough = 0.7;
  2037|            if (th === 'earth') {
  2038|              if (absLat > 0.76) { cr = 0.92; cg = 0.95; cb = 0.98; rough = 0.25; }
  2039|              else if (landVal > 0.06) { cr = 0.14 + detail * 0.10; cg = 0.46 + detail * 0.16; cb = 0.08 + detail * 0.06; rough = 0.75; }
  2040|              else if (landVal > -0.03) { cr = 0.02; cg = 0.42; cb = 0.58; rough = 0.15; }
  2041|              else { cr = 0.01; cg = 0.18 + detail * 0.06; cb = 0.62 + detail * 0.08; rough = 0.08; }
  2042|            } else if (th === 'desert') {
  2043|              if (landVal > 0.30) { cr = 0.72 + detail * 0.08; cg = 0.52 + detail * 0.06; cb = 0.22 + detail * 0.06; rough = 0.90; }
  2044|              else if (landVal > 0.05) { cr = 0.82 + detail * 0.08; cg = 0.58 + detail * 0.08; cb = 0.18 + detail * 0.06; rough = 0.85; }
  2045|              else { cr = 0.64 + detail * 0.10; cg = 0.38 + detail * 0.08; cb = 0.10 + detail * 0.04; rough = 0.80; }
  2046|            } else if (th === 'ice') {
  2047|              if (landVal > 0.05 || absLat > 0.35) { cr = 0.85 + detail * 0.10; cg = 0.90 + detail * 0.06; cb = 0.98; rough = 0.20; }
  2048|              else { cr = 0.28 + detail * 0.10; cg = 0.48 + detail * 0.12; cb = 0.72 + detail * 0.10; rough = 0.12; }
  2049|            } else if (th === 'lava') {
  2050|              const fireFlow = smoothNoise(nx * 1.8, ny * 1.8, nz * 1.8, 6.0);
  2051|              if (fireFlow > 0.20) { cr = 1.0; cg = 0.55 + detail * 0.20; cb = 0.0; rough = 0.30; }
  2052|              else if (fireFlow > -0.10) { cr = 0.80 + detail * 0.10; cg = 0.20 + detail * 0.10; cb = 0.0; rough = 0.50; }
  2053|              else { cr = 0.18 + detail * 0.08; cg = 0.08 + detail * 0.04; cb = 0.06 + detail * 0.02; rough = 0.95; }
  2054|            } else if (th === 'asteroid') {
  2055|              const rock = smoothNoise(nx * 2, ny * 2, nz * 2, 8.0);
  2056|              cr = 0.30 + rock * 0.12 + detail * 0.08; cg = 0.28 + rock * 0.10 + detail * 0.06; cb = 0.24 + rock * 0.08 + detail * 0.04; rough = 0.95;
  2057|            } else if (th === 'forest') {
  2058|              if (absLat > 0.70) { cr = 0.92; cg = 0.95; cb = 0.98; rough = 0.20; }
  2059|              else if (landVal > 0.10) { cr = 0.04 + detail * 0.04; cg = 0.28 + detail * 0.14; cb = 0.04 + detail * 0.04; rough = 0.85; }
  2060|              else if (landVal > -0.05) { cr = 0.12 + detail * 0.06; cg = 0.45 + detail * 0.12; cb = 0.08 + detail * 0.04; rough = 0.80; }
  2061|              else { cr = 0.02; cg = 0.30 + detail * 0.08; cb = 0.48 + detail * 0.10; rough = 0.12; }
  2062|            } else if (th === 'ocean') {
  2063|              if (absLat > 0.72) { cr = 0.90; cg = 0.94; cb = 0.98; rough = 0.15; }
  2064|              else if (landVal > 0.25) { cr = 0.08 + detail * 0.06; cg = 0.36 + detail * 0.10; cb = 0.56 + detail * 0.10; rough = 0.40; }
  2065|              else if (landVal > 0.00) { cr = 0.02; cg = 0.22 + detail * 0.08; cb = 0.68 + detail * 0.12; rough = 0.12; }
  2066|              else { cr = 0.00; cg = 0.10 + detail * 0.06; cb = 0.48 + detail * 0.10; rough = 0.08; }
  2067|            } else if (th === 'storm') {
  2068|              const swirl = smoothNoise(nx * 2.5, ny * 2.5, nz * 2.5, 9.0);
  2069|              if (swirl > 0.20) { cr = 0.60 + detail * 0.14; cg = 0.60 + detail * 0.12; cb = 0.72 + detail * 0.10; rough = 0.40; }
  2070|              else if (swirl > -0.10) { cr = 0.28 + detail * 0.08; cg = 0.28 + detail * 0.08; cb = 0.48 + detail * 0.10; rough = 0.55; }
  2071|              else { cr = 0.12 + detail * 0.06; cg = 0.12 + detail * 0.06; cb = 0.28 + detail * 0.08; rough = 0.70; }
  2072|            } else if (th === 'gas') {
  2073|              const band = Math.sin(landVal * 18.0) * 0.5 + 0.5;
  2074|              if (band > 0.70) { cr = 0.88 + detail * 0.10; cg = 0.52 + detail * 0.14; cb = 0.18 + detail * 0.08; rough = 0.35; }
  2075|              else if (band > 0.40) { cr = 0.72 + detail * 0.14; cg = 0.38 + detail * 0.12; cb = 0.10 + detail * 0.06; rough = 0.40; }
  2076|              else { cr = 0.56 + detail * 0.10; cg = 0.24 + detail * 0.10; cb = 0.06 + detail * 0.04; rough = 0.35; }
  2077|            } else { // cyber
  2078|              if (landVal > 0.08) { cr = 0.08 + detail * 0.04; cg = 0.00; cb = 0.14 + detail * 0.06; rough = 0.70; }
  2079|              else { cr = 0.04 + detail * 0.04; cg = 0.00; cb = 0.10 + detail * 0.06; rough = 0.60; }
  2080|            }
  2081|            cImg.data[idx]     = Math.min(255, Math.round(cr * 255));
  2082|            cImg.data[idx + 1] = Math.min(255, Math.round(cg * 255));
  2083|            cImg.data[idx + 2] = Math.min(255, Math.round(cb * 255));
  2084|            cImg.data[idx + 3] = 255;
  2085|            const rv = Math.min(255, Math.round(rough * 255));
  2086|            rImg.data[idx] = rv; rImg.data[idx + 1] = rv; rImg.data[idx + 2] = rv; rImg.data[idx + 3] = 255;
  2087|          }
  2088|        }
  2089|        cc.putImageData(cImg, 0, 0);
  2090|        rc.putImageData(rImg, 0, 0);
  2091|        const map = new THREE.CanvasTexture(colorCanvas);
  2092|        const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  2093|        map.colorSpace = THREE.SRGBColorSpace;
  2094|        planetTextureCache.set(th, { map, roughnessMap });
  2095|      }
  2096|    }
  2097|
  2098|    // Build initial Earth textures
  2099|    // Use pre-built cached Earth texture — instant, no computation
  2100|    const initTextures = planetTextureCache.get('earth')!;
  2101|
  2102|    // MeshStandardMaterial with procedural textures — full PBR lighting
  2103|    // No emissive: let the directional sun light reveal the terrain colors naturally
  2104|    const earthMat = new THREE.MeshStandardMaterial({
  2105|      map: initTextures.map,
  2106|      roughnessMap: initTextures.roughnessMap,
  2107|      roughness: 0.85,
  2108|      metalness: 0.0,
  2109|      vertexColors: false,
  2110|    });
  2111|
  2112|    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  2113|    // Earth center sits directly below the jet — follows jet XZ so curvature is always visible
  2114|    earthMesh.position.set(0, -(EARTH_RADIUS + FLIGHT_ALTITUDE), 0);
  2115|    const terrainGroup = new THREE.Group();
  2116|    terrainGroup.add(earthMesh);
  2117|    scene.add(terrainGroup);
  2118|    const terrainTiles: THREE.Mesh[] = []; // kept for reset compat (unused)
  2119|
  2120|    // Atmosphere glow — BackSide only so it doesn't cover the Earth surface
  2121|    const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS + 6, 48, 48);
  2122|    const atmoMat = new THREE.MeshPhongMaterial({
  2123|      color: 0x4488ff,
  2124|      transparent: true,
  2125|      opacity: 0.10,
  2126|      side: THREE.BackSide,
  2127|      depthWrite: false,
  2128|    });
  2129|    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
  2130|    atmoMesh.position.copy(earthMesh.position);
  2131|    scene.add(atmoMesh);
  2132|
  2133|    // ── Foreground: Planet Edge Glow Ring ─────────────────────────────────────
  2134|    // A bright rim-light torus that sits at the Earth's equator horizon line
  2135|    const rimGeo = new THREE.TorusGeometry(EARTH_RADIUS + 1.5, 1.2, 16, 120);
  2136|    const rimMat = new THREE.MeshBasicMaterial({
  2137|      color: 0x44aaff,
  2138|      transparent: true,
  2139|      opacity: 0.18,
  2140|      depthWrite: false,
  2141|    });
  2142|    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  2143|    rimMesh.position.copy(earthMesh.position);
  2144|    rimMesh.rotation.x = Math.PI / 2;
  2145|    scene.add(rimMesh);
  2146|
  2147|    // Second, brighter inner rim for the limb glow
  2148|    const rimInnerGeo = new THREE.TorusGeometry(EARTH_RADIUS + 0.4, 0.5, 12, 120);
  2149|    const rimInnerMat = new THREE.MeshBasicMaterial({
  2150|      color: 0x88ddff,
  2151|      transparent: true,
  2152|      opacity: 0.28,
  2153|      depthWrite: false,
  2154|    });
  2155|    const rimInnerMesh = new THREE.Mesh(rimInnerGeo, rimInnerMat);
  2156|    rimInnerMesh.position.copy(earthMesh.position);
  2157|    rimInnerMesh.rotation.x = Math.PI / 2;
  2158|    scene.add(rimInnerMesh);
  2159|
  2160|    // ── Foreground: Surface Detail Lines (cracks / glow veins) ───────────────
  2161|    // Procedural glowing line segments drawn on the Earth surface
  2162|    const crackGroup = new THREE.Group();
  2163|    scene.add(crackGroup);
  2164|
  2165|    function makeSurfaceCracks() {
  2166|      // Remove old cracks
  2167|      while (crackGroup.children.length) crackGroup.remove(crackGroup.children[0]);
  2168|
  2169|      const R = EARTH_RADIUS + 0.3;
  2170|      const crackCount = 28;
  2171|      for (let c = 0; c < crackCount; c++) {
  2172|        // Random start point on sphere surface (upper hemisphere visible from above)
  2173|        const theta = Math.random() * Math.PI * 2;
  2174|        const phi   = Math.random() * Math.PI * 0.5 + Math.PI * 0.25; // mid-latitudes
  2175|        const sx = R * Math.sin(phi) * Math.cos(theta);
  2176|        const sy = R * Math.cos(phi);
  2177|        const sz = R * Math.sin(phi) * Math.sin(theta);
  2178|
  2179|        // Build a short jagged crack as a LineSegments
  2180|        const pts: number[] = [sx, sy, sz];
  2181|        let cx = sx, cy = sy, cz = sz;
  2182|        const steps = 4 + Math.floor(Math.random() * 5);
  2183|        for (let s = 0; s < steps; s++) {
  2184|          // Step along the sphere surface
  2185|          const dTheta = (Math.random() - 0.5) * 0.18;
  2186|          const dPhi   = (Math.random() - 0.5) * 0.12;
  2187|          const newTheta = Math.atan2(cz, cx) + dTheta;
  2188|          const newPhi   = Math.acos(Math.max(-1, Math.min(1, cy / R))) + dPhi;
  2189|          cx = R * Math.sin(newPhi) * Math.cos(newTheta);
  2190|          cy = R * Math.cos(newPhi);
  2191|          cz = R * Math.sin(newPhi) * Math.sin(newTheta);
  2192|          pts.push(cx, cy, cz);
  2193|        }
  2194|
  2195|        const lineGeo = new THREE.BufferGeometry();
  2196|        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  2197|        // Color: theme crack hue in atmosphere, purple in space
  2198|        const hue = phase === 'space' ? 0.75 : THEMES[currentTheme].crackHue;
  2199|        const lineMat = new THREE.LineBasicMaterial({
  2200|          color: new THREE.Color().setHSL(hue, 1.0, 0.65),
  2201|          transparent: true,
  2202|          opacity: 0.35 + Math.random() * 0.25,
  2203|        });
  2204|        crackGroup.add(new THREE.Line(lineGeo, lineMat));
  2205|      }
  2206|    }
  2207|    makeSurfaceCracks();
  2208|
  2209|    // ── Planet Evolution System ───────────────────────────────────────────────
  2210|    // Stage 0 (Mission 1):  Desert Wasteland — dusty orange rock + craters (no emissive)
  2211|    // Stage 1 (Mission 2):  Ocean Blue       — deep ocean + green islands + rotating cloud ring
  2212|    // Stage 2 (Mission 4):  Tech Layer       — cyan city-grid lights on the dark side
  2213|    //
  2214|    // Smooth Lerp: planetEvolutionT ∈ [0,2] drives pixel-blended texture cross-fade.
  2215|    // evolveT  0.0 = pure Desert Wasteland
  2216|    //          1.0 = pure Ocean (cloud ring fully visible)
  2217|    //          2.0 = pure Tech Layer (cyan grid glows)
  2218|
  2219|    const EVO_W = 128, EVO_H = 64; // resolution for evolution canvases
  2220|
  2221|    // ── Build each stage's pixel arrays once at startup ──────────────────────
  2222|    function buildEvoStage(stageIndex: 0 | 1 | 2): { col: Uint8ClampedArray; emit: Uint8ClampedArray } {
  2223|      const col  = new Uint8ClampedArray(EVO_W * EVO_H * 4);
  2224|      const emit = new Uint8ClampedArray(EVO_W * EVO_H * 4);
  2225|      for (let py = 0; py < EVO_H; py++) {
  2226|        for (let px = 0; px < EVO_W; px++) {
  2227|          const lon = (px / EVO_W) * Math.PI * 2 - Math.PI;
  2228|          const lat = (py / EVO_H) * Math.PI - Math.PI / 2;
  2229|          const nx = Math.cos(lat) * Math.cos(lon);
  2230|          const ny = Math.sin(lat);
  2231|          const nz = Math.cos(lat) * Math.sin(lon);
  2232|          const absLat = Math.abs(ny);
  2233|
  2234|          const n1 = smoothNoise(nx, ny, nz, 3.8);
  2235|          const n2 = smoothNoise(nx, ny, nz, 7.2) * 0.5;
  2236|          const n3 = smoothNoise(nx, ny, nz, 13.1) * 0.25;
  2237|          const n4 = smoothNoise(nx + 0.5, ny + 0.3, nz + 0.7, 5.5) * 0.4;
  2238|          const landVal = n1 * 0.45 + n2 * 0.25 + n3 * 0.15 + n4 * 0.15;
  2239|          const micro = smoothNoise(nx * 5, ny * 5, nz * 5, 30.0) * 0.5 + 0.5;
  2240|          const detail = hash(nx, ny, nz);
  2241|          const idx = (py * EVO_W + px) * 4;
  2242|
  2243|          let cr = 0, cg = 0, cb = 0, er = 0, eg = 0, eb = 0;
  2244|
  2245|          if (stageIndex === 0) {
  2246|            // ── Desert Wasteland ── dusty orange rock with rocky craters
  2247|            // Crater pattern: use ring-shaped distance field around noise-placed centres
  2248|            const craterN1 = smoothNoise(nx * 2.1, ny * 2.1, nz * 2.1, 11.0);
  2249|            const craterN2 = smoothNoise(nx * 3.5 + 1.7, ny * 3.5 + 0.9, nz * 3.5 + 2.3, 18.0);
  2250|            const craterN3 = smoothNoise(nx * 5.0 + 0.3, ny * 5.0 + 1.5, nz * 5.0 + 0.7, 26.0);
  2251|            // Ring signature: crater = high value but also a sharp-edged hollow centre
  2252|            const ringA = Math.abs(Math.abs(craterN1) - 0.38) < 0.07 ? 1.0 : 0.0;
  2253|            const ringB = Math.abs(Math.abs(craterN2) - 0.42) < 0.05 ? 0.8 : 0.0;
  2254|            const ringC = Math.abs(Math.abs(craterN3) - 0.40) < 0.06 ? 0.9 : 0.0;
  2255|            const craterRim = Math.max(ringA, ringB, ringC);
  2256|            // Interior shadow of crater
  2257|            const craterFloor = (Math.abs(craterN1) < 0.30 && Math.abs(craterN1) > 0.20) ||
  2258|                                (Math.abs(craterN2) < 0.34 && Math.abs(craterN2) > 0.24) ? 1.0 : 0.0;
  2259|            // Dust and sand — warm orange base with noise variation
  2260|            const dust = smoothNoise(nx * 1.5, ny * 1.5, nz * 1.5, 8.0) * 0.5 + 0.5;
  2261|            const rockN = smoothNoise(nx * 6, ny * 6, nz * 6, 35.0) * 0.5 + 0.5;
  2262|            if (craterRim > 0.0) {
  2263|              // Bright rim highlight — pale tan
  2264|              cr = 0.82 + micro * 0.12; cg = 0.65 + micro * 0.10; cb = 0.32 + micro * 0.08;
  2265|            } else if (craterFloor > 0.0) {
  2266|              // Dark crater floor — shadowed grey-brown
  2267|              cr = 0.24 + rockN * 0.08; cg = 0.18 + rockN * 0.06; cb = 0.10 + rockN * 0.04;
  2268|            } else if (landVal > 0.12) {
  2269|              // Rocky outcrop / ridge — deeper red-brown
  2270|              cr = 0.52 + dust * 0.18 + rockN * 0.10; cg = 0.28 + dust * 0.10 + rockN * 0.06; cb = 0.10 + micro * 0.05;
  2271|            } else {
  2272|              // Sandy desert floor — warm orange-tan with subtle variation
  2273|              cr = 0.72 + dust * 0.14 + micro * 0.06; cg = 0.45 + dust * 0.12 + micro * 0.05; cb = 0.18 + micro * 0.04;
  2274|            }
  2275|            // No emissive on desert — inert rocky world
  2276|
  2277|          } else if (stageIndex === 1) {
  2278|            // ── Ocean Blue ── deep ocean with small vivid-green islands
  2279|            if (absLat > 0.80) {
  2280|              // Polar ice caps
  2281|              cr = 0.88 + detail * 0.10; cg = 0.92 + detail * 0.06; cb = 0.98;
  2282|            } else if (landVal > 0.20) {
  2283|              // Island interior — lush tropical green with subtle sand fringe
  2284|              const tropical = smoothNoise(nx * 4, ny * 4, nz * 4, 22.0) * 0.5 + 0.5;
  2285|              cr = 0.08 + tropical * 0.10 + micro * 0.05;
  2286|              cg = 0.52 + tropical * 0.20 + micro * 0.10;
  2287|              cb = 0.10 + tropical * 0.05 + micro * 0.03;
  2288|            } else if (landVal > 0.13) {
  2289|              // Sandy beach / coral fringe — warm tan
  2290|              cr = 0.78 + micro * 0.10; cg = 0.70 + micro * 0.08; cb = 0.42 + micro * 0.06;
  2291|            } else if (landVal > -0.04) {
  2292|              // Shallow coastal water — vivid cyan-turquoise
  2293|              cr = 0.01 + micro * 0.03;
  2294|              cg = 0.52 + micro * 0.14 + detail * 0.08;
  2295|              cb = 0.78 + micro * 0.10;
  2296|            } else {
  2297|              // Deep ocean — rich blue
  2298|              const waveN = smoothNoise(nx * 4, ny * 4, nz * 4, 32.0) * 0.5 + 0.5;
  2299|              cr = 0.01 + waveN * 0.03;
  2300|              cg = 0.12 + waveN * 0.08 + micro * 0.05;
  2301|              cb = 0.54 + waveN * 0.14 + micro * 0.08;
  2302|            }
  2303|
  2304|          } else {
  2305|            // ── Tech Layer ── green continents + glowing cyan grid city lights on dark side
  2306|            const sunDir = new THREE.Vector3(60, 120, 40).normalize();
  2307|            const surfaceNormal = new THREE.Vector3(nx, ny, nz);
  2308|            const dotSun = surfaceNormal.dot(sunDir);
  2309|            const isDarkSide = dotSun < -0.05;
  2310|
  2311|            if (absLat > 0.75) {
  2312|              // Snow / ice poles
  2313|              const sb = Math.min(1, (absLat - 0.75) / 0.12);
  2314|              cr = 0.82 + sb * 0.16; cg = 0.88 + sb * 0.10; cb = 0.82 + sb * 0.16;
  2315|            } else if (landVal > 0.22) {
  2316|              // Mountain rock
  2317|              cr = 0.22 + micro * 0.10 + detail * 0.08;
  2318|              cg = 0.28 + micro * 0.10 + detail * 0.08;
  2319|              cb = 0.16 + micro * 0.06;
  2320|            } else if (landVal > 0.04) {
  2321|              // Dense forest / grassland
  2322|              const canopy = smoothNoise(nx * 3, ny * 3, nz * 3, 20.0) * 0.5 + 0.5;
  2323|              cr = 0.05 + canopy * 0.08 + micro * 0.05;
  2324|              cg = 0.42 + canopy * 0.18 + micro * 0.12;
  2325|              cb = 0.05 + canopy * 0.04 + micro * 0.03;
  2326|              // ── Tech Grid city lights on dark side ──────────────────────────
  2327|              if (isDarkSide) {
  2328|                // Grid lines: frac(u*scale) near 0 or 1 = line
  2329|                const gridU = lon / (Math.PI * 2) + 0.5; // 0..1
  2330|                const gridV = lat / Math.PI + 0.5;        // 0..1
  2331|                const scaleH = 28.0, scaleV = 14.0;
  2332|                const fracH = Math.abs((gridU * scaleH) % 1.0 - 0.5) * 2; // 0=line centre, 1=midpoint
  2333|                const fracV = Math.abs((gridV * scaleV) % 1.0 - 0.5) * 2;
  2334|                const gridLine = Math.max(0, 1.0 - Math.min(fracH, fracV) * 12.0); // sharp line
  2335|                // Node glow at grid intersections
  2336|                const nodeGlow = Math.max(0, 1.0 - Math.sqrt(Math.pow((fracH - 1) * 0.5, 2) + Math.pow((fracV - 1) * 0.5, 2)) * 10.0);
  2337|                const cityN = smoothNoise(nx * 5, ny * 5, nz * 5, 25.0); // sparse cluster mask
  2338|                const inCity = cityN > 0.30 ? (cityN - 0.30) / 0.70 : 0.0;
  2339|                const techI = Math.max(gridLine, nodeGlow * 1.5) * inCity;
  2340|                if (techI > 0.02) {
  2341|                  // Cyan-blue grid lines + warm white node pulses
  2342|                  er = techI * 0.30; eg = techI * 0.85; eb = techI * 1.0;
  2343|                  // Node intersections glow warm white
  2344|                  const nodeBlend = Math.min(1, nodeGlow * inCity * 2.0);
  2345|                  er += nodeBlend * 0.65; eg += nodeBlend * 0.85; eb += nodeBlend * 0.50;
  2346|                }
  2347|              }
  2348|            } else {
  2349|              // Ocean / lakes
  2350|              const waveN = smoothNoise(nx * 4, ny * 4, nz * 4, 32.0) * 0.5 + 0.5;
  2351|              cr = 0.01 + waveN * 0.02;
  2352|              cg = 0.15 + waveN * 0.08 + micro * 0.05;
  2353|              cb = 0.56 + waveN * 0.12 + micro * 0.08;
  2354|              // Harbour grid lights along coast (dark side)
  2355|              if (isDarkSide && landVal > -0.04) {
  2356|                const coastGridU = lon / (Math.PI * 2) + 0.5;
  2357|                const coastGridV = lat / Math.PI + 0.5;
  2358|                const fracHc = Math.abs((coastGridU * 20.0) % 1.0 - 0.5) * 2;
  2359|                const fracVc = Math.abs((coastGridV * 10.0) % 1.0 - 0.5) * 2;
  2360|                const coastLine = Math.max(0, 1.0 - Math.min(fracHc, fracVc) * 14.0);
  2361|                const portN = smoothNoise(nx * 8, ny * 8, nz * 8, 40.0);
  2362|                const inPort = portN > 0.42 ? (portN - 0.42) / 0.58 : 0.0;
  2363|                const portI = coastLine * inPort * 0.7;
  2364|                if (portI > 0.02) { er = portI * 0.20; eg = portI * 0.70; eb = portI * 0.90; }
  2365|              }
  2366|            }
  2367|          }
  2368|
  2369|          col[idx]   = Math.min(255, Math.round(cr * 255));
  2370|          col[idx+1] = Math.min(255, Math.round(cg * 255));
  2371|          col[idx+2] = Math.min(255, Math.round(cb * 255));
  2372|          col[idx+3] = 255;
  2373|          emit[idx]   = Math.min(255, Math.round(er * 255));
  2374|          emit[idx+1] = Math.min(255, Math.round(eg * 255));
  2375|          emit[idx+2] = Math.min(255, Math.round(eb * 255));
  2376|          emit[idx+3] = 255;
  2377|        }
  2378|      }
  2379|      return { col, emit };
  2380|    }
  2381|
  2382|    const evoStages = [
  2383|      buildEvoStage(0),
  2384|      buildEvoStage(1),
  2385|      buildEvoStage(2),
  2386|    ] as { col: Uint8ClampedArray; emit: Uint8ClampedArray }[];
  2387|
  2388|    // Live canvases that get lerped into each frame (when evolving)
  2389|    const evoColorCanvas = document.createElement('canvas');
  2390|    evoColorCanvas.width = EVO_W; evoColorCanvas.height = EVO_H;
  2391|    const evoEmitCanvas  = document.createElement('canvas');
  2392|    evoEmitCanvas.width  = EVO_W; evoEmitCanvas.height = EVO_H;
  2393|    const evoCCtx = evoColorCanvas.getContext('2d')!;
  2394|    const evoECtx = evoEmitCanvas.getContext('2d')!;
  2395|
  2396|    // Initialise canvases with Stage 0 data
  2397|    {
  2398|      const ci = evoCCtx.createImageData(EVO_W, EVO_H);
  2399|      ci.data.set(evoStages[0].col);
  2400|      evoCCtx.putImageData(ci, 0, 0);
  2401|      const ei = evoECtx.createImageData(EVO_W, EVO_H);
  2402|      ei.data.set(evoStages[0].emit);
  2403|      evoECtx.putImageData(ei, 0, 0);
  2404|    }
  2405|
  2406|    const evoColorTex = new THREE.CanvasTexture(evoColorCanvas);
  2407|    const evoEmitTex  = new THREE.CanvasTexture(evoEmitCanvas);
  2408|    evoColorTex.colorSpace = THREE.SRGBColorSpace;
  2409|
  2410|    // Activate the evolution textures on the earth material
  2411|    earthMat.map          = evoColorTex;
  2412|    earthMat.emissiveMap  = evoEmitTex;
  2413|    earthMat.emissive     = new THREE.Color(1, 1, 1);
  2414|    earthMat.emissiveIntensity = 1.0;
  2415|    earthMat.needsUpdate  = true;
  2416|
  2417|    // ── Orbital Cloud Ring (Stage 2: Ocean+) ─────────────────────────────────
  2418|    // A semi-transparent sphere slightly larger than Earth — looks like cloud cover
  2419|    const orbCloudGeo = new THREE.SphereGeometry(EARTH_RADIUS + 1.8, 48, 48);
  2420|    const orbCloudMat = new THREE.MeshLambertMaterial({
  2421|      color: 0xffffff,
  2422|      transparent: true,
  2423|      opacity: 0.0,
  2424|      depthWrite: false,
  2425|      side: THREE.FrontSide,
  2426|    });
  2427|    // Build cloud-pattern canvas — white puffs on transparent
  2428|    {
  2429|      const cw = 256, ch = 128;
  2430|      const cc = document.createElement('canvas');
  2431|      cc.width = cw; cc.height = ch;
  2432|      const ctx = cc.getContext('2d')!;
  2433|      ctx.clearRect(0, 0, cw, ch);
  2434|      // Draw white cloud blobs procedurally
  2435|      const img = ctx.createImageData(cw, ch);
  2436|      for (let py = 0; py < ch; py++) {
  2437|        for (let px = 0; px < cw; px++) {
  2438|          const nx2 = Math.cos((py / ch) * Math.PI - Math.PI / 2) * Math.cos((px / cw) * Math.PI * 2 - Math.PI);
  2439|          const ny2 = Math.sin((py / ch) * Math.PI - Math.PI / 2);
  2440|          const nz2 = Math.cos((py / ch) * Math.PI - Math.PI / 2) * Math.sin((px / cw) * Math.PI * 2 - Math.PI);
  2441|          const cn = smoothNoise(nx2 * 2.5, ny2 * 2.5, nz2 * 2.5, 12.0);
  2442|          const cn2 = smoothNoise(nx2 * 5.0 + 1.1, ny2 * 5.0 + 0.7, nz2 * 5.0 + 1.4, 25.0) * 0.5;
  2443|          const cloudVal = cn * 0.65 + cn2 * 0.35;
  2444|          const alpha = Math.max(0, Math.min(1, (cloudVal - 0.05) * 3.5));
  2445|          const idx2 = (py * cw + px) * 4;
  2446|          img.data[idx2]   = 255;
  2447|          img.data[idx2+1] = 255;
  2448|          img.data[idx2+2] = 255;
  2449|          img.data[idx2+3] = Math.round(alpha * 200);
  2450|        }
  2451|      }
  2452|      ctx.putImageData(img, 0, 0);
  2453|      const cloudTex = new THREE.CanvasTexture(cc);
  2454|      orbCloudMat.alphaMap = cloudTex;
  2455|      orbCloudMat.transparent = true;
  2456|    }
  2457|    const orbCloudMesh = new THREE.Mesh(orbCloudGeo, orbCloudMat);
  2458|    orbCloudMesh.position.copy(earthMesh.position);
  2459|    scene.add(orbCloudMesh);
  2460|
  2461|    // ── Evolution state ───────────────────────────────────────────────────────
  2462|    let planetEvolutionT = 0;       // 0=volcanic, 1=ocean, 2=terran (lerped smoothly)
  2463|    let evoLastT = -1;              // last T we actually re-baked the texture (avoid per-frame bake)
  2464|    const EVO_LERP_SPEED = 0.25;   // units/sec — how fast the planet evolves
  2465|    let evoTextureUpdateTimer = 0; // only re-bake texture every N seconds (expensive)
  2466|
  2467|    function updatePlanetEvolution(dt: number) {
  2468|      // Target T from mission progress:
  2469|      //   Mission 0 (Mission 1) → Stage 0: Desert Wasteland
  2470|      //   Mission 1 (Mission 2) → lerp toward Stage 1: Ocean Blue + green islands
  2471|      //   Mission 3+ (Mission 4+) → lerp toward Stage 2: Tech Layer city grid
  2472|      let targetT = 0;
  2473|      if (missionIndex >= 3) targetT = 2;
  2474|      else if (missionIndex >= 1) targetT = 1 + (missionIndex - 1) / 2;
  2475|      else targetT = 0; // Mission 0 = full Desert Wasteland
  2476|
  2477|      // Smooth lerp toward target
  2478|      planetEvolutionT += (targetT - planetEvolutionT) * Math.min(1, EVO_LERP_SPEED * dt);
  2479|
  2480|      // Orbital cloud ring opacity — fade in from T=0.8 to T=1.2
  2481|      const cloudOpacity = Math.max(0, Math.min(0.55, (planetEvolutionT - 0.7) * 1.375));
  2482|      orbCloudMat.opacity = cloudOpacity;
  2483|      // Slowly rotate the cloud sphere for realism
  2484|      orbCloudMesh.rotation.y += 0.004 * dt;
  2485|      orbCloudMesh.rotation.x += 0.001 * dt;
  2486|
  2487|      // Only re-bake the canvas texture periodically (every 0.25s) to avoid GPU spam
  2488|      evoTextureUpdateTimer -= dt;
  2489|      const tChanged = Math.abs(planetEvolutionT - evoLastT) > 0.005;
  2490|      if (tChanged && evoTextureUpdateTimer <= 0) {
  2491|        evoTextureUpdateTimer = 0.25;
  2492|        evoLastT = planetEvolutionT;
  2493|
  2494|        // Determine which two stages to blend
  2495|        const stageF = Math.max(0, Math.min(1.9999, planetEvolutionT));
  2496|        const stageA = Math.floor(stageF) as 0 | 1 | 2;
  2497|        const stageB = Math.min(2, stageA + 1) as 0 | 1 | 2;
  2498|        const blend  = stageF - stageA; // 0..1
  2499|
  2500|        const sA = evoStages[stageA];
  2501|        const sB = evoStages[stageB];
  2502|
  2503|        // Blend pixel arrays
  2504|        const cImg = evoCCtx.createImageData(EVO_W, EVO_H);
  2505|        const eImg = evoECtx.createImageData(EVO_W, EVO_H);
  2506|        const totalPx = EVO_W * EVO_H * 4;
  2507|        for (let i = 0; i < totalPx; i++) {
  2508|          cImg.data[i] = Math.round(sA.col[i]  * (1 - blend) + sB.col[i]  * blend);
  2509|          eImg.data[i] = Math.round(sA.emit[i] * (1 - blend) + sB.emit[i] * blend);
  2510|        }
  2511|        evoCCtx.putImageData(cImg, 0, 0);
  2512|        evoECtx.putImageData(eImg, 0, 0);
  2513|
  2514|        evoColorTex.needsUpdate = true;
  2515|        evoEmitTex.needsUpdate  = true;
  2516|
  2517|        // Crack visibility — fade out as we leave Stage 0
  2518|        const crackOpacity = Math.max(0, 1 - planetEvolutionT * 1.5);
  2519|        crackGroup.children.forEach(child => {
  2520|          const line = child as THREE.Line;
  2521|          if (line.material instanceof THREE.LineBasicMaterial) {
  2522|            line.material.opacity = crackOpacity * (0.35 + Math.random() * 0.25);
  2523|            line.material.transparent = true;
  2524|          }
  2525|        });
  2526|      }
  2527|    }
  2528|
  2529|    // ── Endless Mode Planet Evolution ─────────────────────────────────────────
  2530|    // Theme is switched instantly via applyTheme() when kill milestones are hit.
  2531|    // This function just keeps the orbital cloud ring alive each frame.
  2532|    function updateEndlessPlanetEvolution(dt: number) {
  2533|      // Keep orbital cloud ring spinning
  2534|      orbCloudMesh.rotation.y += 0.004 * dt;
  2535|      orbCloudMesh.rotation.x += 0.001 * dt;
  2536|      // Fade in orbital clouds gradually as stage increases
  2537|      const targetOpacity = Math.min(0.55, endlessStage * 0.07);
  2538|      orbCloudMat.opacity += (targetOpacity - orbCloudMat.opacity) * Math.min(1, 1.5 * dt);
  2539|    }
  2540|
  2541|    // ── 3D Volumetric Clouds ──────────────────────────────────────────────────
  2542|    const cloudGroup = new THREE.Group();
  2543|    scene.add(cloudGroup);
  2544|
  2545|    interface Cloud3D {
  2546|      group: THREE.Group;
  2547|      speed: number;       // Z drift speed
  2548|      xDrift: number;      // X drift speed (gentle side-to-side)
  2549|      bobFreq: number;     // vertical bob frequency
  2550|      bobAmp: number;      // vertical bob amplitude
  2551|      bobOffset: number;   // phase offset so clouds don't all bob in sync
  2552|      baseY: number;       // base Y height
  2553|    }
  2554|    const clouds3D: Cloud3D[] = [];
  2555|
  2556|    function makeCloud3D(x: number, y: number, z: number): Cloud3D {
  2557|      const g = new THREE.Group();
  2558|      const puffCount = 5 + Math.floor(Math.random() * 5);
  2559|      for (let i = 0; i < puffCount; i++) {
  2560|        const radius = 1.8 + Math.random() * 2.2;
  2561|        const geo = new THREE.SphereGeometry(radius, 7, 7);
  2562|        const mat = new THREE.MeshLambertMaterial({
  2563|          color: 0xffffff,
  2564|          transparent: true,
  2565|          opacity: 0.72 + Math.random() * 0.20,
  2566|        });
  2567|        const puff = new THREE.Mesh(geo, mat);
  2568|        puff.position.set(
  2569|          (Math.random() - 0.5) * 7,
  2570|          (Math.random() - 0.5) * 1.5,
  2571|          (Math.random() - 0.5) * 5
  2572|        );
  2573|        puff.scale.y = 0.55 + Math.random() * 0.3;
  2574|        // Store per-puff rotation speed for gentle tumble
  2575|        (puff as THREE.Mesh & { rotSpeed?: number }).rotSpeed = (Math.random() - 0.5) * 0.004;
  2576|        g.add(puff);
  2577|      }
  2578|      g.position.set(x, y, z);
  2579|      cloudGroup.add(g);
  2580|      return {
  2581|        group: g,
  2582|        speed: 0.04 + Math.random() * 0.04,
  2583|        xDrift: (Math.random() - 0.5) * 0.018,
  2584|        bobFreq: 0.25 + Math.random() * 0.35,
  2585|        bobAmp: 0.3 + Math.random() * 0.5,
  2586|        bobOffset: Math.random() * Math.PI * 2,
  2587|        baseY: y,
  2588|      };
  2589|    }
  2590|
  2591|    // Spread clouds just above the jet — they drift past as you fly
  2592|    for (let i = 0; i < 22; i++) {
  2593|      makeCloud3D(
  2594|        (Math.random() - 0.5) * 120,
  2595|        1.5 + Math.random() * 3.5,  // Y=1.5–5 above jet (jet is at Y=0)
  2596|        -100 + Math.random() * 250
  2597|      );
  2598|    }
  2599|
  2600|    // ── Mid-Layer: Floating Atmosphere Particles (dust / light motes) ─────────
  2601|    const dustGroup = new THREE.Group();
  2602|    scene.add(dustGroup);
  2603|
  2604|    const DUST_COUNT = 180;
  2605|    const dustGeo = new THREE.BufferGeometry();
  2606|    const dustPos = new Float32Array(DUST_COUNT * 3);
  2607|    const dustVel = new Float32Array(DUST_COUNT * 3); // per-particle drift
  2608|    for (let i = 0; i < DUST_COUNT; i++) {
  2609|      dustPos[i * 3]     = (Math.random() - 0.5) * 80;
  2610|      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 20 + 4;
  2611|      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  2612|      dustVel[i * 3]     = (Math.random() - 0.5) * 0.012;
  2613|      dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.004;
  2614|      dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
  2615|    }
  2616|    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
  2617|    const dustMat = new THREE.PointsMaterial({
  2618|      color: 0xaaddff,
  2619|      size: 0.18,
  2620|      transparent: true,
  2621|      opacity: 0.55,
  2622|      depthWrite: false,
  2623|      sizeAttenuation: true,
  2624|    });
  2625|    const dustPoints = new THREE.Points(dustGeo, dustMat);
  2626|    dustGroup.add(dustPoints);
  2627|
  2628|    function updateDust(dt: number) {
  2629|      if (phase === 'space') { dustGroup.visible = false; return; }
  2630|      dustGroup.visible = true;
  2631|      const dp = dustGeo.attributes.position.array as Float32Array;
  2632|      const px = playerJet.position.x, pz = playerJet.position.z;
  2633|      const t = Date.now() * 0.001;
  2634|      for (let i = 0; i < DUST_COUNT; i++) {
  2635|        // Sinusoidal drift — each particle has a unique phase so they swirl independently
  2636|        const phase_i = i * 0.37;
  2637|        dp[i * 3]     += dustVel[i * 3]     * dt * 60 + Math.sin(t * 0.55 + phase_i) * 0.006;
  2638|        dp[i * 3 + 1] += dustVel[i * 3 + 1] * dt * 60 + Math.sin(t * 0.30 + phase_i * 1.7) * 0.004;
  2639|        dp[i * 3 + 2] += dustVel[i * 3 + 2] * dt * 60 + Math.cos(t * 0.45 + phase_i * 0.9) * 0.005;
  2640|        // Loop particles around the player
  2641|        if (dp[i * 3]     - px >  40) dp[i * 3]     -= 80;
  2642|        if (dp[i * 3]     - px < -40) dp[i * 3]     += 80;
  2643|        if (dp[i * 3 + 2] - pz >  40) dp[i * 3 + 2] -= 80;
  2644|        if (dp[i * 3 + 2] - pz < -40) dp[i * 3 + 2] += 80;
  2645|        if (dp[i * 3 + 1] > 12) dp[i * 3 + 1] -= 20;
  2646|        if (dp[i * 3 + 1] < -4) dp[i * 3 + 1] += 20;
  2647|      }
  2648|      dustGeo.attributes.position.needsUpdate = true;
  2649|      // Use theme dust color — breathe opacity gently
  2650|      dustMat.color.set(THEMES[currentTheme].dustColor);
  2651|      dustMat.opacity = 0.30 + Math.sin(t * 0.8) * 0.18;
  2652|    }
  2653|
  2654|    // ── Stars (space) ─────────────────────────────────────────────────────────
  2655|    const starGroup = new THREE.Group();
  2656|    scene.add(starGroup);
  2657|    starGroup.visible = false;
  2658|    const starGeo = new THREE.BufferGeometry();
  2659|    const starPos: number[] = [];
  2660|    for (let i = 0; i < 1200; i++) {
  2661|      starPos.push(
  2662|        (Math.random() - 0.5) * 300,
  2663|        (Math.random() - 0.5) * 100,
  2664|        (Math.random() - 0.5) * 400
  2665|      );
  2666|    }
  2667|    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  2668|    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 });
  2669|    starGroup.add(new THREE.Points(starGeo, starMat));
  2670|
  2671|    // ── Stealth Fighter Jet Builder — forward-swept wings, dark metallic grey ──
  2672|    // SR-72 / YF-23 inspired: forward-swept wings, flat chined fuselage,
  2673|    // twin canted V-tails, no vertical fins, blue afterburner trails.
  2674|    function buildJet(color: number, scale = 1): THREE.Group {
  2675|      const jet = new THREE.Group();
  2676|      const s = scale;
  2677|
  2678|      // Stealth grey palette — dark metallic with slight blue tint
  2679|      const isPlayer = color === 0x1a1a2e || color === 0x1166ff || scale > 1;
  2680|      const bodyColor  = isPlayer ? 0x1a1e28 : color; // near-black dark grey for player
  2681|      const accentColor = isPlayer ? 0x2a3a5a : 0x333344;
  2682|      const edgeColor   = isPlayer ? 0x0a1a3a : 0x222233;
  2683|
  2684|      const bodyMat  = new THREE.MeshPhongMaterial({ color: bodyColor, shininess: 180, specular: 0x334466 });
  2685|      const accentMat = new THREE.MeshPhongMaterial({ color: accentColor, shininess: 120, specular: 0x223355 });
  2686|      const edgeMat  = new THREE.MeshPhongMaterial({ color: edgeColor, shininess: 60 });
  2687|      const nozzMat  = new THREE.MeshPhongMaterial({ color: 0x111122, shininess: 40 });
  2688|      const dblBody  = new THREE.MeshPhongMaterial({ color: bodyColor, side: THREE.DoubleSide, shininess: 160, specular: 0x334466 });
  2689|      const dblAccent = new THREE.MeshPhongMaterial({ color: accentColor, side: THREE.DoubleSide, shininess: 100 });
  2690|
  2691|      // ── Fuselage: flat chined stealth cross-section ────────────────────────
  2692|      // Front section — narrow, blade-like nose
  2693|      const fuseAGeo = new THREE.CylinderGeometry(0.10*s, 0.30*s, 2.4*s, 6);
  2694|      const fuseA = new THREE.Mesh(fuseAGeo, bodyMat);
  2695|      fuseA.rotation.x = Math.PI / 2;
  2696|      fuseA.position.z = -1.5*s;
  2697|      jet.add(fuseA);
  2698|
  2699|      // Mid section — flat, wide chined body (stealth shaping)
  2700|      const fuseBGeo = new THREE.CylinderGeometry(0.30*s, 0.36*s, 1.8*s, 6);
  2701|      const fuseB = new THREE.Mesh(fuseBGeo, bodyMat);
  2702|      fuseB.rotation.x = Math.PI / 2;
  2703|      fuseB.scale.set(1.4, 0.7, 1); // flatten to stealth chine shape
  2704|      fuseB.position.z = 0.3*s;
  2705|      jet.add(fuseB);
  2706|
  2707|      // Rear section — engine block
  2708|      const fuseCGeo = new THREE.CylinderGeometry(0.36*s, 0.28*s, 1.6*s, 6);
  2709|      const fuseC = new THREE.Mesh(fuseCGeo, bodyMat);
  2710|      fuseC.rotation.x = Math.PI / 2;
  2711|      fuseC.scale.set(1.3, 0.75, 1);
  2712|      fuseC.position.z = 1.9*s;
  2713|      jet.add(fuseC);
  2714|
  2715|      // ── Nose — razor-sharp stealth blade ──────────────────────────────────
  2716|      const noseGeo = new THREE.ConeGeometry(0.10*s, 1.8*s, 6);
  2717|      const noseMat = new THREE.MeshPhongMaterial({ color: 0x0a0e18, shininess: 200, specular: 0x445566 });
  2718|      const nose = new THREE.Mesh(noseGeo, noseMat);
  2719|      nose.rotation.x = Math.PI / 2;
  2720|      nose.scale.set(1.3, 0.6, 1); // flatten nose to blade shape
  2721|      nose.position.z = -3.1*s;
  2722|      jet.add(nose);
  2723|
  2724|      // ── Cockpit canopy — low-profile bubble ───────────────────────────────
  2725|      const canopyGeo = new THREE.SphereGeometry(0.20*s, 10, 6, 0, Math.PI*2, 0, Math.PI*0.45);
  2726|      const canopyMat = new THREE.MeshPhongMaterial({
  2727|        color: 0x223344, transparent: true, opacity: 0.85, shininess: 300,
  2728|        side: THREE.DoubleSide, specular: 0x88ccff,
  2729|      });
  2730|      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  2731|      canopy.rotation.x = Math.PI / 2;
  2732|      canopy.scale.set(1.1, 0.8, 1.4);
  2733|      canopy.position.set(0, 0.26*s, -0.9*s);
  2734|      jet.add(canopy);
  2735|
  2736|      // ── FORWARD-SWEPT WINGS — the defining stealth feature ────────────────
  2737|      // Tips sweep FORWARD (toward nose) — opposite of conventional jets
  2738|      const makeFSW = (side: number) => {
  2739|        const geo = new THREE.BufferGeometry();
  2740|        const x = side;
  2741|        // Forward-swept: tip leading edge is AHEAD of root leading edge
  2742|        const verts = new Float32Array([
  2743|          // tri 1 — main wing panel
  2744|           0.32*s*x,  0,   0.4*s,   // root trailing (near engine)
  2745|           0.32*s*x,  0,  -0.5*s,   // root leading (mid fuselage)
  2746|           4.20*s*x, -0.06*s, -1.8*s, // tip leading (swept FORWARD)
  2747|          // tri 2
  2748|           0.32*s*x,  0,   0.4*s,   // root trailing
  2749|           4.20*s*x, -0.06*s, -1.8*s, // tip leading
  2750|           4.60*s*x, -0.07*s,  0.2*s, // tip trailing
  2751|        ]);
  2752|        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  2753|        geo.computeVertexNormals();
  2754|        return new THREE.Mesh(geo, dblBody);
  2755|      };
  2756|      jet.add(makeFSW(1));
  2757|      jet.add(makeFSW(-1));
  2758|
  2759|      // Wing root fillet — smooth blend into fuselage
  2760|      const makeFillet = (side: number) => {
  2761|        const geo = new THREE.BufferGeometry();
  2762|        const x = side;
  2763|        const verts = new Float32Array([
  2764|          0.10*s*x, 0.04*s, -2.8*s,
  2765|          0.32*s*x, 0,      -0.5*s,
  2766|          0.32*s*x, 0,       0.4*s,
  2767|          0.10*s*x, 0.04*s, -2.8*s,
  2768|          0.32*s*x, 0,       0.4*s,
  2769|          0.18*s*x, 0.04*s, -1.2*s,
  2770|        ]);
  2771|        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  2772|        geo.computeVertexNormals();
  2773|        return new THREE.Mesh(geo, dblBody);
  2774|      };
  2775|      jet.add(makeFillet(1));
  2776|      jet.add(makeFillet(-1));
  2777|
  2778|      // ── V-TAIL (no vertical fins — pure stealth) ──────────────────────────
  2779|      // Canted outward V-tail replaces conventional vertical + horizontal tails
  2780|      const makeVTail = (side: number) => {
  2781|        const geo = new THREE.BufferGeometry();
  2782|        const x = side;
  2783|        const cant = side * 0.55; // strong outward cant
  2784|        const verts = new Float32Array([
  2785|          // V-tail panel — sweeps back and outward
  2786|           0.30*s*x,  0,          1.2*s,
  2787|           0.30*s*x + cant*0.3*s,  0.8*s,  2.6*s,
  2788|           2.40*s*x + cant*0.6*s,  1.2*s,  2.8*s,
  2789|           0.30*s*x,  0,          1.2*s,
  2790|           2.40*s*x + cant*0.6*s,  1.2*s,  2.8*s,
  2791|           2.20*s*x + cant*0.4*s,  0.5*s,  1.4*s,
  2792|        ]);
  2793|        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  2794|        geo.computeVertexNormals();
  2795|        return new THREE.Mesh(geo, dblAccent);
  2796|      };
  2797|      jet.add(makeVTail(1));
  2798|      jet.add(makeVTail(-1));
  2799|
  2800|      // ── Chine edges — stealth faceting along fuselage sides ───────────────
  2801|      const makeChine = (side: number) => {
  2802|        const geo = new THREE.BufferGeometry();
  2803|        const x = side * 0.28*s;
  2804|        const verts = new Float32Array([
  2805|          x, -0.10*s, -3.0*s,
  2806|          x, -0.18*s, -0.5*s,
  2807|          x, -0.22*s,  1.8*s,
  2808|          x, -0.10*s, -3.0*s,
  2809|          x, -0.22*s,  1.8*s,
  2810|          x * 0.5, -0.08*s, -3.0*s,
  2811|        ]);
  2812|        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  2813|        geo.computeVertexNormals();
  2814|        return new THREE.Mesh(geo, dblAccent);
  2815|      };
  2816|      jet.add(makeChine(1));
  2817|      jet.add(makeChine(-1));
  2818|
  2819|      // ── Twin engine nacelles ───────────────────────────────────────────────
  2820|      const makeNacelle = (side: number) => {
  2821|        const x = side * 0.48*s;
  2822|        const nacGeo = new THREE.CylinderGeometry(0.16*s, 0.20*s, 1.6*s, 7);
  2823|        const nac = new THREE.Mesh(nacGeo, accentMat);
  2824|        nac.rotation.x = Math.PI / 2;
  2825|        nac.position.set(x, -0.08*s, 1.8*s);
  2826|        jet.add(nac);
  2827|        const nozGeo = new THREE.CylinderGeometry(0.20*s, 0.14*s, 0.28*s, 10);
  2828|        const noz = new THREE.Mesh(nozGeo, nozzMat);
  2829|        noz.rotation.x = Math.PI / 2;
  2830|        noz.position.set(x, -0.08*s, 2.70*s);
  2831|        jet.add(noz);
  2832|      };
  2833|      makeNacelle(1);
  2834|      makeNacelle(-1);
  2835|
  2836|      // ── Weapons bay (flush with belly — stealth) ───────────────────────────
  2837|      const bayGeo = new THREE.BoxGeometry(0.40*s, 0.08*s, 0.90*s);
  2838|      const bay = new THREE.Mesh(bayGeo, edgeMat);
  2839|      bay.position.set(0, -0.28*s, 0.3*s);
  2840|      jet.add(bay);
  2841|
  2842|      // ── Twin blue afterburner flame groups ────────────────────────────────
  2843|      const makeFlame = (side: number): THREE.Group => {
  2844|        const x = side * 0.48*s;
  2845|        const fg = new THREE.Group();
  2846|        fg.position.set(x, -0.08*s, 2.84*s);
  2847|
  2848|        // Outer glow — wide blue cone
  2849|        const outerGeo = new THREE.ConeGeometry(0.20*s, 1.1*s, 8, 1, true);
  2850|        const outerMat = new THREE.MeshBasicMaterial({ color: 0x0044ff, transparent: true, opacity: 0.45, side: THREE.BackSide });
  2851|        const outer = new THREE.Mesh(outerGeo, outerMat);
  2852|        outer.rotation.x = -Math.PI / 2; outer.position.z = 0.55*s;
  2853|        fg.add(outer);
  2854|
  2855|        // Mid flame — cyan-blue
  2856|        const midGeo = new THREE.ConeGeometry(0.12*s, 0.80*s, 8);
  2857|        const midMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.85 });
  2858|        const mid = new THREE.Mesh(midGeo, midMat);
  2859|        mid.rotation.x = -Math.PI / 2; mid.position.z = 0.40*s;
  2860|        fg.add(mid);
  2861|
  2862|        // Core — bright white-blue
  2863|        const coreGeo = new THREE.ConeGeometry(0.06*s, 0.55*s, 6);
  2864|        const coreMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 1.0 });
  2865|        const core = new THREE.Mesh(coreGeo, coreMat);
  2866|        core.rotation.x = -Math.PI / 2; core.position.z = 0.28*s;
  2867|        fg.add(core);
  2868|
  2869|        // Nozzle disc — bright blue ring
  2870|        const discGeo = new THREE.CircleGeometry(0.13*s, 10);
  2871|        const discMat = new THREE.MeshBasicMaterial({ color: 0x44ccff, transparent: true, opacity: 0.80 });
  2872|        const disc = new THREE.Mesh(discGeo, discMat);
  2873|        disc.rotation.x = Math.PI / 2;
  2874|        fg.add(disc);
  2875|
  2876|        return fg;
  2877|      };
  2878|      jet.add(makeFlame(1));
  2879|      jet.add(makeFlame(-1));
  2880|
  2881|      return jet;
  2882|    }
  2883|
  2884|    // ── Player Jet ────────────────────────────────────────────────────────────
  2885|    // Built at scale 1.4 — noticeably larger than enemy jets (scale 0.8)
  2886|    const playerJet = buildJet(0x1166ff, 1.4);
  2887|    playerJet.position.set(0, FLIGHT_ALTITUDE, 0);
  2888|    scene.add(playerJet);
  2889|
  2890|    // Glowing halo ring around the player — always visible, rotates slowly
  2891|    const haloGeo = new THREE.TorusGeometry(3.2, 0.18, 10, 48);
  2892|    const haloMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.75 });
  2893|    const haloRing = new THREE.Mesh(haloGeo, haloMat);
  2894|    haloRing.rotation.x = Math.PI / 2; // flat ring in XZ plane
  2895|    playerJet.add(haloRing); // attached to jet so it moves with it
  2896|
  2897|    // Second outer halo — slightly larger, dimmer, counter-rotates
  2898|    const halo2Geo = new THREE.TorusGeometry(4.2, 0.10, 8, 48);
  2899|    const halo2Mat = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.40 });
  2900|    const haloRing2 = new THREE.Mesh(halo2Geo, halo2Mat);
  2901|    haloRing2.rotation.x = Math.PI / 2;
  2902|    playerJet.add(haloRing2);
  2903|
  2904|    // Animated beacon on top of the jet — bright pulsing sphere
  2905|    const beaconGeo = new THREE.SphereGeometry(0.32, 10, 10);
  2906|    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 1.0 });
  2907|    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  2908|    beacon.position.set(0, 1.1, -0.5); // sits above the cockpit
  2909|    playerJet.add(beacon);
  2910|
  2911|    // Point light that follows the player — casts cyan glow on nearby surfaces
  2912|    const playerLight = new THREE.PointLight(0x00ccff, 2.5, 18);
  2913|    playerLight.position.set(0, 2, 0);
  2914|    playerJet.add(playerLight);
  2915|
  2916|    // ── Vibe Jam portal integration ─────────────────────────────────────────
  2917|    const exitPortal = new THREE.Group();
  2918|    exitPortal.position.set(portalExitPosition.x, portalExitPosition.y, portalExitPosition.z);
  2919|    const portalRingOuter = new THREE.Mesh(
  2920|      new THREE.TorusGeometry(10, 1.3, 18, 64),
  2921|      new THREE.MeshBasicMaterial({ color: 0x33ff88, transparent: true, opacity: 0.9 })
  2922|    );
  2923|    portalRingOuter.rotation.x = Math.PI / 2;
  2924|    exitPortal.add(portalRingOuter);
  2925|    const portalRingInner = new THREE.Mesh(
  2926|      new THREE.TorusGeometry(7.6, 0.65, 18, 64),
  2927|      new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.7 })
  2928|    );
  2929|    portalRingInner.rotation.x = Math.PI / 2;
  2930|    exitPortal.add(portalRingInner);
  2931|    const portalCore = new THREE.Mesh(
  2932|      new THREE.CircleGeometry(6.3, 40),
  2933|      new THREE.MeshBasicMaterial({ color: 0x33ffaa, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
  2934|    );
  2935|    portalCore.rotation.x = -Math.PI / 2;
  2936|    exitPortal.add(portalCore);
  2937|    const portalParticleGeo = new THREE.BufferGeometry();
  2938|    const portalParticleCount = 120;
  2939|    const portalParticles = new Float32Array(portalParticleCount * 3);
  2940|    for (let i = 0; i < portalParticleCount; i++) {
  2941|      const angle = Math.random() * Math.PI * 2;
  2942|      const radius = 7.2 + Math.random() * 3.6;
  2943|      portalParticles[i * 3] = Math.cos(angle) * radius;
  2944|      portalParticles[i * 3 + 1] = (Math.random() - 0.5) * 6;
  2945|      portalParticles[i * 3 + 2] = Math.sin(angle) * radius;
  2946|    }
  2947|    portalParticleGeo.setAttribute('position', new THREE.Float32BufferAttribute(portalParticles, 3));
  2948|    const portalParticleSystem = new THREE.Points(
  2949|      portalParticleGeo,
  2950|      new THREE.PointsMaterial({ color: 0xaaffcc, size: 0.7, transparent: true, opacity: 0.85, depthWrite: false })
  2951|    );
  2952|    exitPortal.add(portalParticleSystem);
  2953|    const portalLabelCanvas = document.createElement('canvas');
  2954|    portalLabelCanvas.width = 512;
  2955|    portalLabelCanvas.height = 128;
  2956|    const portalLabelCtx = portalLabelCanvas.getContext('2d');
  2957|    if (portalLabelCtx) {
  2958|      portalLabelCtx.clearRect(0, 0, portalLabelCanvas.width, portalLabelCanvas.height);
  2959|      portalLabelCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  2960|      portalLabelCtx.fillRect(12, 18, 488, 92);
  2961|      portalLabelCtx.strokeStyle = 'rgba(120,255,210,0.85)';
  2962|      portalLabelCtx.lineWidth = 4;
  2963|      portalLabelCtx.strokeRect(12, 18, 488, 92);
  2964|      portalLabelCtx.fillStyle = '#eaffff';
  2965|      portalLabelCtx.font = '700 42px Arial';
  2966|      portalLabelCtx.textAlign = 'center';
  2967|      portalLabelCtx.textBaseline = 'middle';
  2968|      portalLabelCtx.fillText('Next Game →', 256, 64);
  2969|    }
  2970|    const portalLabelTexture = new THREE.CanvasTexture(portalLabelCanvas);
  2971|    const portalLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: portalLabelTexture, transparent: true }));
  2972|    portalLabel.position.set(0, 16, 0);
  2973|    portalLabel.scale.set(26, 6.5, 1);
  2974|    exitPortal.add(portalLabel);
  2975|    scene.add(exitPortal);
  2976|    let portalRedirecting = false;
  2977|    const triggerPortalExit = () => {
  2978|      if (portalRedirecting) return;
  2979|      portalRedirecting = true;
  2980|      const nextUrl = new URL('https://vibejam.cc/portal/2026');
  2981|      const currentUrl = new URL(window.location.href);
  2982|      nextUrl.searchParams.set('ref', currentUrl.origin + currentUrl.pathname);
  2983|      currentUrl.searchParams.forEach((value, key) => {
  2984|        if (key !== 'portal') nextUrl.searchParams.set(key, value);
  2985|      });
  2986|      window.location.href = nextUrl.toString();
  2987|    };
  2988|    window.initVibeJamPortals?.({
  2989|      scene,
  2990|      getPlayer: () => playerJet,
  2991|      spawnPoint: portalSpawnPoint,
  2992|      exitPosition: portalExitPosition,
  2993|    });
  2994|
  2995|    // Flames are built into buildJet() as twin afterburners — no separate group needed.
  2996|
  2997|    // ── Bullets ───────────────────────────────────────────────────────────────
  2998|    interface Bullet { mesh: THREE.Group; vel: THREE.Vector3; age: number }
  2999|    const bullets: Bullet[] = [];
  3000|
  3001|    // Muzzle flash — brief bright sphere at the gun tip
  3002|    const muzzleFlashes: { mesh: THREE.Mesh; life: number }[] = [];
  3003|
  3004|    // ── Player laser geometries — long blue neon beams, allocated ONCE ─────────
  3005|    // Laser: long thin cylinder (the beam shaft) + fat glow sleeve + bright core
  3006|    const _laserShaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 6.0, 5);   // tight bright core
  3007|    const _laserGlowGeo  = new THREE.CylinderGeometry(0.14, 0.14, 5.6, 5);   // wide soft glow sleeve
  3008|    const _laserHaloGeo  = new THREE.CylinderGeometry(0.28, 0.28, 5.0, 5);   // outermost halo
  3009|    const _laserCapGeo   = new THREE.SphereGeometry(0.10, 5, 4);              // nose tip
  3010|    const _laserFlashGeo = new THREE.SphereGeometry(0.45, 6, 5);
  3011|
  3012|    // Trail segments — each laser leaves 3 fading ghost copies behind it
  3013|    const _trailGeo = new THREE.CylinderGeometry(0.08, 0.08, 4.0, 4);
  3014|
  3015|    const _laserShaftMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  3016|    const _laserGlowMat  = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.55 });
  3017|    const _laserHaloMat  = new THREE.MeshBasicMaterial({ color: 0x0033ff, transparent: true, opacity: 0.22 });
  3018|    const _laserCapMat   = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.95 });
  3019|    const _laserFlashMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.9 });
  3020|    const _trailMat      = new THREE.MeshBasicMaterial({ color: 0x0055ff, transparent: true, opacity: 0.30 });
  3021|
  3022|    // Hard cap — never have more than 14 player bullets alive at once
  3023|    const BULLET_CAP = 14;
  3024|
  3025|    // Trail ghost type
  3026|    interface LaserTrail { mesh: THREE.Mesh; life: number; maxLife: number }
  3027|    const laserTrails: LaserTrail[] = [];
  3028|
  3029|    function makeNeonLaser(): THREE.Group {
  3030|      const g = new THREE.Group();
  3031|
  3032|      // Outermost halo — widest, most transparent
  3033|      const halo = new THREE.Mesh(_laserHaloGeo, _laserHaloMat);
  3034|      halo.rotation.x = Math.PI / 2;
  3035|      g.add(halo);
  3036|
  3037|      // Mid glow sleeve
  3038|      const glow = new THREE.Mesh(_laserGlowGeo, _laserGlowMat);
  3039|      glow.rotation.x = Math.PI / 2;
  3040|      g.add(glow);
  3041|
  3042|      // Bright white core shaft
  3043|      const shaft = new THREE.Mesh(_laserShaftGeo, _laserShaftMat);
  3044|      shaft.rotation.x = Math.PI / 2;
  3045|      g.add(shaft);
  3046|
  3047|      // Nose cap
  3048|      const cap = new THREE.Mesh(_laserCapGeo, _laserCapMat);
  3049|      cap.position.z = -3.1;
  3050|      g.add(cap);
  3051|
  3052|      return g;
  3053|    }
  3054|
  3055|    function fireBullet() {
  3056|      if (bullets.length >= BULLET_CAP) return;
  3057|
  3058|      const dir = new THREE.Vector3(
  3059|        -Math.sin(jetHeading),
  3060|        0,
  3061|        -Math.cos(jetHeading)
  3062|      );
  3063|      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  3064|
  3065|      for (const side of [-0.9, 0.9]) {
  3066|        if (bullets.length >= BULLET_CAP) break;
  3067|        const b = makeNeonLaser();
  3068|        b.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jetHeading);
  3069|        const spawnPos = playerJet.position.clone()
  3070|          .addScaledVector(perp, side)
  3071|          .addScaledVector(dir, 2.2);
  3072|        b.position.copy(spawnPos);
  3073|        scene.add(b);
  3074|        // Lasers travel very fast — 55 units/sec
  3075|        bullets.push({ mesh: b, vel: dir.clone().multiplyScalar(55), age: 0 });
  3076|
  3077|        // Muzzle flash
  3078|        const flash = new THREE.Mesh(_laserFlashGeo, _laserFlashMat.clone());
  3079|        flash.position.copy(spawnPos);
  3080|        scene.add(flash);
  3081|        muzzleFlashes.push({ mesh: flash, life: 0.07 });
  3082|
  3083|        // Spawn a light trail ghost behind the laser
  3084|        const trail = new THREE.Mesh(_trailGeo, _trailMat.clone());
  3085|        trail.position.copy(spawnPos).addScaledVector(dir, -2.5);
  3086|        trail.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), jetHeading);
  3087|        trail.rotation.x = Math.PI / 2;
  3088|        scene.add(trail);
  3089|        laserTrails.push({ mesh: trail, life: 0.12, maxLife: 0.12 });
  3090|      }
  3091|      playShootSound();
  3092|    }
  3093|
  3094|    let shootCooldown = 0;
  3095|
  3096|    // ── Player Bombs — area-of-effect blast, B key ────────────────────────────
  3097|    interface Bomb { mesh: THREE.Group; vel: THREE.Vector3; age: number; armed: boolean }
  3098|    const bombs: Bomb[] = [];
  3099|    const BOMB_CAP = 4;
  3100|    let bombCooldown = 0;
  3101|
  3102|    // Shared bomb geometry (allocated once)
  3103|    const _bombBodyGeo  = new THREE.SphereGeometry(0.45, 10, 8);
  3104|    const _bombGlowGeo  = new THREE.SphereGeometry(0.80, 8, 6);
  3105|    const _bombBodyMat  = new THREE.MeshPhongMaterial({ color: 0x111111, emissive: 0x003366, shininess: 120 });
  3106|    const _bombGlowMat  = new THREE.MeshBasicMaterial({ color: 0x0044ff, transparent: true, opacity: 0.35 });
  3107|
  3108|    function makeBomb(): THREE.Group {
  3109|      const g = new THREE.Group();
  3110|      const body = new THREE.Mesh(_bombBodyGeo, _bombBodyMat.clone());
  3111|      g.add(body);
  3112|      const glow = new THREE.Mesh(_bombGlowGeo, _bombGlowMat.clone());
  3113|      g.add(glow);
  3114|      return g;
  3115|    }
  3116|
  3117|    function playBombSound() {
  3118|      try {
  3119|        const ctx = new AudioContext();
  3120|        const osc = ctx.createOscillator();
  3121|        const gain = ctx.createGain();
  3122|        osc.connect(gain); gain.connect(ctx.destination);
  3123|        osc.type = 'sawtooth';
  3124|        osc.frequency.setValueAtTime(180, ctx.currentTime);
  3125|        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
  3126|        gain.gain.setValueAtTime(0.55, ctx.currentTime);
  3127|        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  3128|        osc.start(); osc.stop(ctx.currentTime + 0.5);
  3129|      } catch { /* ignore */ }
  3130|    }
  3131|
  3132|    function dropBomb() {
  3133|      if (bombs.length >= BOMB_CAP) return;
  3134|      const dir = new THREE.Vector3(-Math.sin(jetHeading), 0, -Math.cos(jetHeading));
  3135|      const b = makeBomb();
  3136|      b.position.copy(playerJet.position).addScaledVector(dir, 2.5);
  3137|      scene.add(b);
  3138|      // Bombs arc forward then drop — slower than lasers
  3139|      bombs.push({ mesh: b, vel: dir.clone().multiplyScalar(18), age: 0, armed: false });
  3140|      playBombSound();
  3141|    }
  3142|
  3143|    // ── Enemies ───────────────────────────────────────────────────────────────
  3144|    interface Enemy { mesh: THREE.Group; hp: number; speed: number; type: 'jet' | 'alien'; angle: number; flashTimer: number }
  3145|    const enemies: Enemy[] = [];
  3146|
  3147|    function buildAlienShip(): THREE.Group {
  3148|      const g = new THREE.Group();
  3149|      const bodyGeo = new THREE.SphereGeometry(1.0, 12, 8);
  3150|      const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhongMaterial({ color: 0x882299, shininess: 100 }));
  3151|      body.scale.y = 0.38;
  3152|      g.add(body);
  3153|      const ringGeo = new THREE.TorusGeometry(1.5, 0.2, 8, 24);
  3154|      const ring = new THREE.Mesh(ringGeo, new THREE.MeshPhongMaterial({ color: 0xff44ff, emissive: 0x440044 }));
  3155|      ring.rotation.x = Math.PI / 2;
  3156|      g.add(ring);
  3157|      const domeGeo = new THREE.SphereGeometry(0.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  3158|      const dome = new THREE.Mesh(domeGeo, new THREE.MeshPhongMaterial({ color: 0x44ffff, transparent: true, opacity: 0.65 }));
  3159|      dome.position.y = 0.22;
  3160|      g.add(dome);
  3161|      return g;
  3162|    }
  3163|
  3164|    function spawnEnemy() {
  3165|      // Spawn in a ring around the player
  3166|      const angle = Math.random() * Math.PI * 2;
  3167|      const dist = 35 + Math.random() * 15;
  3168|      const x = playerJet.position.x + Math.cos(angle) * dist;
  3169|      const z = playerJet.position.z + Math.sin(angle) * dist;
  3170|      const type = phase === 'space' ? 'alien' : 'jet';
  3171|      const mesh = type === 'jet' ? buildJet(0xcc2222, 0.8) : buildAlienShip();
  3172|      mesh.position.set(x, FLIGHT_ALTITUDE, z);
  3173|      scene.add(mesh);
  3174|      const baseSpeed = (5 + missionIndex * 1.2) * THEMES[currentTheme].enemySpeedMult * DIFF[difficulty].enemySpeedMult;
  3175|      const baseHp = type === 'alien' ? 2 : 1;
  3176|      const hp = difficulty === 'hard' ? baseHp + 1 : baseHp;
  3177|      enemies.push({ mesh, hp, speed: baseSpeed, type, angle, flashTimer: 0 });
  3178|    }
  3179|
  3180|    // ── Explosions ────────────────────────────────────────────────────────────
  3181|    interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; spin: number; isRing: boolean }
  3182|    const particles: Particle[] = [];
  3183|
  3184|    // ── Shared particle geometries & materials (allocated once, reused) ────────
  3185|    const PARTICLE_CAP = 120; // hard cap — never allocate beyond this
  3186|    const _pSphereGeo  = new THREE.SphereGeometry(0.18, 4, 4);
  3187|    const _pBoxGeo     = new THREE.BoxGeometry(0.18, 0.12, 0.18);
  3188|    const _pRingGeo    = new THREE.TorusGeometry(0.3, 0.08, 6, 12);
  3189|    const _pMatWhite   = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  3190|    const _pMatYellow  = new THREE.MeshBasicMaterial({ color: 0xffee44, transparent: true });
  3191|    const _pMatDebris  = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true });
  3192|
  3193|    // Per-color material cache so we don't create a new material for every explosion color
  3194|    const _pMatCache = new Map<number, THREE.MeshBasicMaterial>();
  3195|    function getParticleMat(color: number): THREE.MeshBasicMaterial {
  3196|      if (!_pMatCache.has(color)) {
  3197|        _pMatCache.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
  3198|      }
  3199|      return _pMatCache.get(color)!;
  3200|    }
  3201|
  3202|    function explode(pos: THREE.Vector3, color: number, count = 14, big = false) {
  3203|      // Cap total live particles to avoid GPU overload
  3204|      const budget = Math.max(0, PARTICLE_CAP - particles.length);
  3205|      if (budget === 0) return;
  3206|
  3207|      const speed = big ? 0.55 : 0.35;
  3208|      // Clamp count to available budget (and reduce for small hits)
  3209|      const fireCount = Math.min(big ? Math.min(count, 14) : Math.min(count, 8), budget);
  3210|      const colorMat  = getParticleMat(color);
  3211|
  3212|      // Core fire particles — reuse shared sphere geo, clone only the material
  3213|      for (let i = 0; i < fireCount; i++) {
  3214|        if (particles.length >= PARTICLE_CAP) break;
  3215|        const c = i < fireCount * 0.3 ? _pMatWhite : (i < fireCount * 0.6 ? _pMatYellow : colorMat);
  3216|        const mat = c.clone(); // clone is cheap (just copies uniforms, no GPU upload)
  3217|        mat.opacity = 1;
  3218|        const m = new THREE.Mesh(_pSphereGeo, mat);
  3219|        const sc = (big ? 1.4 : 0.7) + Math.random() * (big ? 1.2 : 0.8);
  3220|        m.scale.setScalar(sc);
  3221|        m.position.copy(pos);
  3222|        scene.add(m);
  3223|        const vel = new THREE.Vector3(
  3224|          (Math.random() - 0.5) * speed * 2,
  3225|          (Math.random() * 0.5 + 0.1) * speed,
  3226|          (Math.random() - 0.5) * speed * 2
  3227|        );
  3228|        particles.push({ mesh: m, vel, life: 0.7 + Math.random() * 0.4, spin: (Math.random() - 0.5) * 0.15, isRing: false });
  3229|      }
  3230|
  3231|      // Debris chunks — only for big explosions, max 3
  3232|      if (big && particles.length < PARTICLE_CAP) {
  3233|        const debrisCount = Math.min(3, PARTICLE_CAP - particles.length);
  3234|        for (let i = 0; i < debrisCount; i++) {
  3235|          const mat = _pMatDebris.clone();
  3236|          mat.opacity = 1;
  3237|          const m = new THREE.Mesh(_pBoxGeo, mat);
  3238|          m.position.copy(pos);
  3239|          scene.add(m);
  3240|          const vel = new THREE.Vector3(
  3241|            (Math.random() - 0.5) * speed * 1.4,
  3242|            Math.random() * speed * 0.8,
  3243|            (Math.random() - 0.5) * speed * 1.4
  3244|          );
  3245|          particles.push({ mesh: m, vel, life: 1.0 + Math.random() * 0.3, spin: (Math.random() - 0.5) * 0.2, isRing: false });
  3246|        }
  3247|      }
  3248|
  3249|      // Shockwave ring — only one per explosion, only if budget allows
  3250|      if (particles.length < PARTICLE_CAP) {
  3251|        const ringMat = getParticleMat(color).clone();
  3252|        ringMat.opacity = 0.9;
  3253|        const ring = new THREE.Mesh(_pRingGeo, ringMat);
  3254|        ring.position.copy(pos);
  3255|        ring.rotation.x = Math.PI / 2;
  3256|        scene.add(ring);
  3257|        particles.push({ mesh: ring, vel: new THREE.Vector3(0, 0.02, 0), life: 0.45, spin: 0, isRing: true });
  3258|      }
  3259|    }
  3260|
  3261|    // ── Asteroids — jagged rocks that drift through space, shootable ──────────
  3262|    interface Asteroid {
  3263|      mesh: THREE.Mesh;
  3264|      vel: THREE.Vector3;
  3265|      rotVel: THREE.Vector3;
  3266|      radius: number;
  3267|      hp: number;
  3268|    }
  3269|    const asteroids: Asteroid[] = [];
  3270|    let asteroidSpawnTimer = 0;
  3271|
  3272|    // Build a jagged rock by displacing an icosahedron's vertices randomly
  3273|    // Per-planet asteroid style: color palette, jitter amount, size range, speed range
  3274|    const ASTEROID_STYLES: Record<PlanetTheme, {
  3275|      hue: number; hueRange: number; sat: number; satRange: number; lit: number; litRange: number;
  3276|      jitterMin: number; jitterMax: number;
  3277|      radiusMin: number; radiusMax: number;
  3278|      speedMin: number; speedMax: number;
  3279|      spinMult: number;
  3280|    }> = {
  3281|      earth:    { hue: 0.06, hueRange: 0.06, sat: 0.08, satRange: 0.12, lit: 0.28, litRange: 0.18, jitterMin: 0.55, jitterMax: 0.55, radiusMin: 1.4, radiusMax: 2.2, speedMin: 1.5, speedMax: 3.0, spinMult: 1.0 },
  3282|      // Lava planet — glowing orange-red rocks with dark crust, fast tumble
  3283|      lava:     { hue: 0.04, hueRange: 0.04, sat: 0.70, satRange: 0.20, lit: 0.22, litRange: 0.14, jitterMin: 0.45, jitterMax: 0.70, radiusMin: 1.0, radiusMax: 2.8, speedMin: 2.5, speedMax: 5.5, spinMult: 2.2 },
  3284|      // Storm planet — dark blue-grey chunks, medium speed, high spin
  3285|      storm:    { hue: 0.60, hueRange: 0.08, sat: 0.18, satRange: 0.12, lit: 0.18, litRange: 0.12, jitterMin: 0.50, jitterMax: 0.65, radiusMin: 1.2, radiusMax: 3.0, speedMin: 3.0, speedMax: 6.0, spinMult: 2.8 },
  3286|      // Ocean planet — teal-blue icy rocks, slow drift
  3287|      ocean:    { hue: 0.52, hueRange: 0.08, sat: 0.35, satRange: 0.20, lit: 0.38, litRange: 0.18, jitterMin: 0.60, jitterMax: 0.45, radiusMin: 1.6, radiusMax: 2.6, speedMin: 0.8, speedMax: 2.2, spinMult: 0.6 },
  3288|      // Desert planet — sandy orange-tan rocks, medium speed
  3289|      desert:   { hue: 0.08, hueRange: 0.06, sat: 0.45, satRange: 0.20, lit: 0.42, litRange: 0.16, jitterMin: 0.50, jitterMax: 0.60, radiusMin: 1.2, radiusMax: 3.2, speedMin: 1.8, speedMax: 4.0, spinMult: 1.4 },
  3290|      // Forest planet — mossy green-brown rocks, slow and large
  3291|      forest:   { hue: 0.28, hueRange: 0.10, sat: 0.30, satRange: 0.20, lit: 0.22, litRange: 0.14, jitterMin: 0.55, jitterMax: 0.50, radiusMin: 2.0, radiusMax: 3.5, speedMin: 0.8, speedMax: 2.0, spinMult: 0.5 },
  3292|      // Cyber planet — dark purple-magenta rocks with neon tint, fast
  3293|      cyber:    { hue: 0.78, hueRange: 0.10, sat: 0.55, satRange: 0.25, lit: 0.18, litRange: 0.12, jitterMin: 0.40, jitterMax: 0.75, radiusMin: 0.8, radiusMax: 2.0, speedMin: 3.5, speedMax: 7.0, spinMult: 3.0 },
  3294|      // Asteroid belt — classic grey-brown, medium everything
  3295|      asteroid: { hue: 0.06, hueRange: 0.06, sat: 0.08, satRange: 0.12, lit: 0.28, litRange: 0.18, jitterMin: 0.55, jitterMax: 0.55, radiusMin: 1.4, radiusMax: 2.2, speedMin: 1.5, speedMax: 3.0, spinMult: 1.0 },
  3296|      // Ice planet — pale blue-white crystals, slow and large
  3297|      ice:      { hue: 0.58, hueRange: 0.06, sat: 0.25, satRange: 0.15, lit: 0.65, litRange: 0.20, jitterMin: 0.35, jitterMax: 0.50, radiusMin: 1.8, radiusMax: 3.0, speedMin: 0.6, speedMax: 1.8, spinMult: 0.4 },
  3298|      // Gas giant — swirling amber-tan chunks, medium speed
  3299|      gas:      { hue: 0.10, hueRange: 0.08, sat: 0.50, satRange: 0.25, lit: 0.50, litRange: 0.20, jitterMin: 0.60, jitterMax: 0.40, radiusMin: 2.0, radiusMax: 4.0, speedMin: 1.0, speedMax: 2.5, spinMult: 0.8 },
  3300|    };
  3301|
  3302|    function buildRock(radius: number, theme: PlanetTheme = currentTheme): THREE.Mesh {
  3303|      const style = ASTEROID_STYLES[theme];
  3304|      const geo = new THREE.IcosahedronGeometry(radius, 1);
  3305|      const pos = geo.attributes.position.array as Float32Array;
  3306|      for (let i = 0; i < pos.length; i += 3) {
  3307|        const jitter = style.jitterMin + Math.random() * style.jitterMax;
  3308|        const len = Math.sqrt(pos[i]*pos[i] + pos[i+1]*pos[i+1] + pos[i+2]*pos[i+2]);
  3309|        if (len > 0) {
  3310|          pos[i]   = (pos[i]   / len) * radius * jitter;
  3311|          pos[i+1] = (pos[i+1] / len) * radius * jitter;
  3312|          pos[i+2] = (pos[i+2] / len) * radius * jitter;
  3313|        }
  3314|      }
  3315|      geo.attributes.position.needsUpdate = true;
  3316|      geo.computeVertexNormals();
  3317|      const hue = style.hue + Math.random() * style.hueRange;
  3318|      const sat = style.sat + Math.random() * style.satRange;
  3319|      const lit = style.lit + Math.random() * style.litRange;
  3320|      const col = new THREE.Color().setHSL(hue, sat, lit);
  3321|      // Lava rocks get emissive glow on the hot cracks
  3322|      if (theme === 'lava') {
  3323|        const mat = new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(0.4, 0.05, 0.0) });
  3324|        return new THREE.Mesh(geo, mat);
  3325|      }
  3326|      // Cyber rocks get a faint neon emissive
  3327|      if (theme === 'cyber') {
  3328|        const mat = new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(0.08, 0.0, 0.18) });
  3329|        return new THREE.Mesh(geo, mat);
  3330|      }
  3331|      const mat = new THREE.MeshLambertMaterial({ color: col });
  3332|      return new THREE.Mesh(geo, mat);
  3333|    }
  3334|
  3335|    function spawnAsteroid() {
  3336|      // In story mode only spawn in space; in endless mode spawn in any phase
  3337|      if (gameMode === 'story' && phase !== 'space') return;
  3338|      const style = ASTEROID_STYLES[currentTheme];
  3339|      const angle = Math.random() * Math.PI * 2;
  3340|      const dist  = 50 + Math.random() * 30;
  3341|      const x = playerJet.position.x + Math.cos(angle) * dist;
  3342|      const z = playerJet.position.z + Math.sin(angle) * dist;
  3343|      const radius = style.radiusMin + Math.random() * (style.radiusMax - style.radiusMin);
  3344|      const mesh = buildRock(radius, currentTheme);
  3345|      mesh.position.set(x, FLIGHT_ALTITUDE + (Math.random() - 0.5) * 4, z);
  3346|      scene.add(mesh);
  3347|      const speed = style.speedMin + Math.random() * (style.speedMax - style.speedMin);
  3348|      const driftAngle = Math.random() * Math.PI * 2;
  3349|      const vel = new THREE.Vector3(Math.cos(driftAngle) * speed, 0, Math.sin(driftAngle) * speed);
  3350|      const spinBase = 0.8 * style.spinMult;
  3351|      const rotVel = new THREE.Vector3(
  3352|        (Math.random() - 0.5) * spinBase * 1.5,
  3353|        (Math.random() - 0.5) * spinBase * 1.5,
  3354|        (Math.random() - 0.5) * spinBase * 1.5
  3355|      );
  3356|      const hp = radius > 2.5 ? 3 : radius > 1.8 ? 2 : 1;
  3357|      asteroids.push({ mesh, vel, rotVel, radius, hp });
  3358|    }
  3359|
  3360|    // ── Enemy bullets — short red laser bolts ─────────────────────────────────
  3361|    interface EBullet { mesh: THREE.Group; vel: THREE.Vector3; age: number }
  3362|    const enemyBullets: EBullet[] = [];
  3363|
  3364|    // Laser bolt geometry — a short elongated capsule, allocated once and shared
  3365|    // Core: thin bright rod; Glow: slightly wider transparent sleeve
  3366|    const _eLaserCoreGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6);
  3367|    const _eLaserGlowGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.2, 6);
  3368|    const _eLaserCoreMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  3369|    const _eLaserGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.55 });
  3370|
  3371|    let enemyShootTimer = 0;
  3372|
  3373|    function makeEnemyLaser(dir: THREE.Vector3): THREE.Group {
  3374|      const g = new THREE.Group();
  3375|      // Glow sleeve (wider, transparent)
  3376|      const glow = new THREE.Mesh(_eLaserGlowGeo, _eLaserGlowMat.clone());
  3377|      g.add(glow);
  3378|      // Bright core rod
  3379|      const core = new THREE.Mesh(_eLaserCoreGeo, _eLaserCoreMat.clone());
  3380|      g.add(core);
  3381|      // Rotate the capsule so its long axis aligns with the travel direction.
  3382|      // CylinderGeometry is Y-up; we rotate 90° around X so it points along Z,
  3383|      // then yaw to match the horizontal travel angle.
  3384|      // This avoids setFromUnitVectors which can produce NaN when dir ≈ (0,1,0).
  3385|      const flatDir = new THREE.Vector3(dir.x, 0, dir.z);
  3386|      if (flatDir.lengthSq() < 0.0001) flatDir.set(0, 0, 1); // fallback
  3387|      flatDir.normalize();
  3388|      const yaw = Math.atan2(flatDir.x, flatDir.z);
  3389|      g.rotation.set(Math.PI / 2, 0, yaw, 'YXZ');
  3390|      return g;
  3391|    }
  3392|
  3393|    function playEnemyShootSound() {
  3394|      try {
  3395|        const ctx = new AudioContext();
  3396|        const osc = ctx.createOscillator();
  3397|        const gain = ctx.createGain();
  3398|        osc.connect(gain); gain.connect(ctx.destination);
  3399|        osc.type = 'sawtooth';
  3400|        osc.frequency.setValueAtTime(320, ctx.currentTime);
  3401|        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);
  3402|        gain.gain.setValueAtTime(0.18, ctx.currentTime);
  3403|        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
  3404|        osc.start(); osc.stop(ctx.currentTime + 0.14);
  3405|      } catch { /* ignore */ }
  3406|    }
  3407|
  3408|    function enemyFire() {
  3409|      if (enemies.length === 0) return;
  3410|      // Pick ONE random enemy to fire — never all at once
  3411|      const e = enemies[Math.floor(Math.random() * enemies.length)];
  3412|      const rawDir = new THREE.Vector3().subVectors(playerJet.position, e.mesh.position);
  3413|      // Guard: if enemy is on top of player, fire forward instead
  3414|      if (rawDir.lengthSq() < 0.01) rawDir.set(0, 0, 1);
  3415|      // Flatten to XZ so bolt travels horizontally (matches makeEnemyLaser orientation)
  3416|      rawDir.y = 0;
  3417|      if (rawDir.lengthSq() < 0.0001) rawDir.set(0, 0, 1);
  3418|      const dir = rawDir.normalize();
  3419|      const bolt = makeEnemyLaser(dir);
  3420|      bolt.position.copy(e.mesh.position);
  3421|      scene.add(bolt);
  3422|      // Speed scales with mission difficulty — starts at 14 u/s, gets faster
  3423|      const boltSpeed = 14 + missionIndex * 0.8;
  3424|      enemyBullets.push({ mesh: bolt, vel: dir.multiplyScalar(boltSpeed), age: 0 });
  3425|      playEnemyShootSound();
  3426|    }
  3427|
  3428|    // ── Reset ─────────────────────────────────────────────────────────────────
  3429|    function resetGame() {
  3430|      score = 0; lives = DIFF[difficulty].lives; wave = 1; phase = 'atmosphere';
  3431|      invincible = 0; transitionTimer = 0; waveTimer = 0; spawnTimer = 0;
  3432|      jetHeading = 0; jetSpeed = 0;
  3433|      missionIndex = 0; missionKills = 0; missionCompleteTimer = 0;
  3434|      lastMissionKills = -1; lastLives = -1; lastScore = -1; lastPhase = '';
  3435|      // Endless mode state
  3436|      endlessKills = 0; endlessStage = 0; levelUpFlashTimer = 0;
  3437|      paused = false; pauseOverlay.style.display = 'none';
  3438|      gameState = 'playing';
  3439|      // Endless mode always stays in atmosphere phase
  3440|      if (gameMode === 'endless') phase = 'atmosphere';
  3441|      if (portalMode) {
  3442|        playerJet.position.set(portalSpawnPoint.x, portalSpawnPoint.y, portalSpawnPoint.z);
  3443|        playerJet.rotation.order = 'YXZ';
  3444|        playerJet.rotation.y = jetHeading;
  3445|        playerJet.rotation.x = 0;
  3446|        playerJet.rotation.z = 0;
  3447|        jetSpeed = Math.max(jetSpeed, JET_MAX_SPEED * 0.6);
  3448|        invincible = Math.max(invincible, 1.2);
  3449|      }
  3450|
  3451|      enemies.forEach(e => scene.remove(e.mesh));
  3452|      enemies.length = 0;
  3453|      bullets.forEach(b => scene.remove(b.mesh));
  3454|      bullets.length = 0;
  3455|      enemyBullets.forEach(b => scene.remove(b.mesh));
  3456|      enemyBullets.length = 0;
  3457|      particles.forEach(p => scene.remove(p.mesh));
  3458|      particles.length = 0;
  3459|      asteroids.forEach(a => scene.remove(a.mesh));
  3460|      asteroids.length = 0;
  3461|      asteroidSpawnTimer = 0;
  3462|
  3463|      playerJet.position.set(0, FLIGHT_ALTITUDE, 0);
  3464|      terrainGroup.visible = true;
  3465|      cloudGroup.visible = true;
  3466|      starGroup.visible = false;
  3467|      rimMesh.visible = true;
  3468|      rimInnerMesh.visible = true;
  3469|      crackGroup.visible = true;
  3470|      // Apply theme: endless mode starts on world 0 (lava), story mode uses selected theme
  3471|      if (gameMode === 'endless') {
  3472|        applyTheme(ENDLESS_WORLDS[0]);
  3473|      } else {
  3474|        sun.color.set(0xfff5cc);
  3475|        ambient.color.set(0xffffff);
  3476|        applyTheme(currentTheme);
  3477|      }
  3478|    }
  3479|
  3480|    scene.background = new THREE.Color(0x87ceeb);
  3481|
  3482|    if (portalMode) {
  3483|      gameMode = 'story';
  3484|      resetGame();
  3485|      startBgMusic();
  3486|      modal.style.display = 'none';
  3487|      lastGameState = 'playing';
  3488|    }
  3489|
  3490|    // ── Main Loop ─────────────────────────────────────────────────────────────
  3491|    const clock = new THREE.Clock();
  3492|
  3493|    let lastGameState = '';
  3494|
  3495|    function animate() {
  3496|      frameId = requestAnimationFrame(animate);
  3497|      const dt = Math.min(clock.getDelta(), 0.05);
  3498|
  3499|      if (gameState === 'start' || gameState === 'gameover') {
  3500|        // Only rebuild HUD when state actually changes — not every frame
  3501|        if (gameState !== lastGameState) { drawHUD(); lastGameState = gameState; }
  3502|        renderer.render(scene, camera);
  3503|        return;
  3504|      }
  3505|
  3506|      // Paused — render the frozen frame but don't tick game logic
  3507|      if (paused) {
  3508|        renderer.render(scene, camera);
  3509|        return;
  3510|      }
  3511|
  3512|      // Switched into playing — show the persistent HUD once
  3513|      if (lastGameState !== 'playing') {
  3514|        modal.style.display = 'none'; // hide start/gameover modal
  3515|        showPlayingHUD(true);
  3516|        updatePlanetPanel();
  3517|        // Planet toggle only shown in story mode — endless worlds change automatically
  3518|        planetToggle.style.display = gameMode === 'story' ? 'block' : 'none';
  3519|        lastGameState = 'playing';
  3520|      }
  3521|
  3522|      // Update playing HUD labels cheaply (textContent only, no innerHTML)
  3523|      updatePlayingHUD();
  3524|
  3525|      // ── Phase transition ────────────────────────────────────────────────────
  3526|      if (phase === 'transition') {
  3527|        transitionTimer += dt;
  3528|        if (transitionTimer > 3.5) {
  3529|          phase = 'space';
  3530|          terrainGroup.visible = false;
  3531|          cloudGroup.visible = false;
  3532|          starGroup.visible = true;
  3533|          scene.background = new THREE.Color(0x000011);
  3534|          scene.fog = new THREE.Fog(0x000011, 80, 300);
  3535|          sun.color.set(0xaaaaff);
  3536|          ambient.color.set(0x334466);
  3537|        }
  3538|      }
  3539|
  3540|      // ── Wave timer (story mode only) ─────────────────────────────────────────
  3541|      if (gameMode === 'story') {
  3542|        waveTimer += dt;
  3543|        if (waveTimer > 14) {
  3544|          waveTimer = 0;
  3545|          wave++;
  3546|          // Transition to space after wave 2 (≈28s into the game)
  3547|          if (wave === 3 && phase === 'atmosphere') {
  3548|            phase = 'transition';
  3549|            transitionTimer = 0;
  3550|          }
  3551|        }
  3552|      }
  3553|      // Endless mode: planet stays in atmosphere forever — world changes via applyTheme()
  3554|
  3555|      // ── Planet Evolution ───────────────────────────────────────────────────
  3556|      if (gameState === 'playing') {
  3557|        if (gameMode === 'endless') updateEndlessPlanetEvolution(dt);
  3558|        else updatePlanetEvolution(dt);
  3559|      }
  3560|
  3561|      // ── Level-Up Flash (endless mode) ─────────────────────────────────────
  3562|      if (levelUpFlashTimer > 0) {
  3563|        levelUpFlashTimer -= dt;
  3564|        const alpha = Math.min(0.85, levelUpFlashTimer * 0.6);
  3565|        levelUpFlashEl.style.opacity = String(Math.max(0, alpha));
  3566|        levelUpFlashEl.style.display = levelUpFlashTimer > 0 ? 'block' : 'none';
  3567|      } else if (levelUpFlashEl.style.display !== 'none') {
  3568|        levelUpFlashEl.style.display = 'none';
  3569|      }
  3570|
  3571|      // ── Player movement — stealth jet with pitch/roll/yaw + boost ───────────
  3572|      const isBoosting = keys['KeyF'];
  3573|      const topSpeed = isBoosting ? JET_BOOST_SPEED : JET_MAX_SPEED;
  3574|
  3575|      // Arrow LEFT/RIGHT → roll + yaw (turn the jet)
  3576|      // Arrow UP → throttle forward  |  Arrow DOWN → brake
  3577|      const turningLeft  = keys['ArrowLeft']  || keys['KeyA'];
  3578|      const turningRight = keys['ArrowRight'] || keys['KeyD'];
  3579|      const throttleOn   = keys['ArrowUp']    || keys['KeyW'];
  3580|      const braking      = keys['ArrowDown']  || keys['KeyS'];
  3581|      if (turningLeft)  jetHeading += JET_TURN_SPEED * dt;
  3582|      if (turningRight) jetHeading -= JET_TURN_SPEED * dt;
  3583|
  3584|      // Pitch only from mouse; keep nose level for arrow-key play
  3585|      const pitchingUp   = false;
  3586|      const pitchingDown = false;
  3587|
  3588|      // Mouse aiming — smoothly steer nose toward cursor
  3589|      const mouseYawDelta   = mouseAimX * JET_TURN_SPEED  * 0.4 * dt;
  3590|      const mousePitchDelta = mouseAimY * JET_PITCH_SPEED * 0.4 * dt;
  3591|      jetHeading -= mouseYawDelta;
  3592|      jetPitch = Math.max(-0.6, Math.min(0.6, jetPitch + mousePitchDelta));
  3593|
  3594|      // Auto-level pitch when no keys pressed
  3595|      if (!pitchingUp && !pitchingDown) {
  3596|        jetPitch += (0 - jetPitch) * Math.min(1, 1.5 * dt);
  3597|      }
  3598|
  3599|      // Roll — follows turn input
  3600|      const rollTarget = turningLeft ? 0.55 : turningRight ? -0.55 : 0;
  3601|      jetRoll += (rollTarget - jetRoll) * Math.min(1, 6 * dt);
  3602|
  3603|      // ArrowUp / W → throttle forward  |  ArrowDown / S → brake
  3604|      if (throttleOn) {
  3605|        jetSpeed = Math.min(jetSpeed + JET_ACCEL * dt, topSpeed);
  3606|      } else if (braking) {
  3607|        jetSpeed = Math.max(jetSpeed - JET_ACCEL * 2 * dt, 0);
  3608|      } else {
  3609|        // Idle — slowly bleed speed so the jet doesn't stop dead
  3610|        jetSpeed = Math.max(jetSpeed - JET_ACCEL * 0.3 * dt, JET_MAX_SPEED * 0.25);
  3611|      }
  3612|
  3613|      // Move in heading + pitch direction
  3614|      const moveDir = new THREE.Vector3(
  3615|        -Math.sin(jetHeading) * Math.cos(jetPitch),
  3616|        -Math.sin(jetPitch),
  3617|        -Math.cos(jetHeading) * Math.cos(jetPitch)
  3618|      );
  3619|      playerJet.position.addScaledVector(moveDir, jetSpeed * dt);
  3620|
  3621|      // ── Gravity lock — keep jet at FLIGHT_ALTITUDE above surface ─────────
  3622|      const targetY = FLIGHT_ALTITUDE;
  3623|      playerJet.position.y += (targetY - playerJet.position.y) * Math.min(1, 3 * dt);
  3624|
  3625|      // Apply rotation — yaw, pitch, roll
  3626|      playerJet.rotation.order = 'YXZ';
  3627|      playerJet.rotation.y = jetHeading;
  3628|      playerJet.rotation.x = jetPitch;
  3629|      playerJet.rotation.z = jetRoll;
  3630|
  3631|      // ── FOV zoom-out when boosting ────────────────────────────────────────
  3632|      const targetFOV = isBoosting ? 95 : 75;
  3633|      camera.fov += (targetFOV - camera.fov) * Math.min(1, 4 * dt);
  3634|      camera.updateProjectionMatrix();
  3635|
  3636|      // ── Camera — 3 views toggled with V key ──────────────────────────────
  3637|      if (cameraView === 0) {
  3638|        // View 0: Third-person chase camera — behind and above
  3639|        const camOffset = new THREE.Vector3(
  3640|          Math.sin(jetHeading) * CAM_BACK,
  3641|          CAM_HEIGHT,
  3642|          Math.cos(jetHeading) * CAM_BACK
  3643|        );
  3644|        const targetCamPos = playerJet.position.clone().add(camOffset);
  3645|        camera.position.lerp(targetCamPos, 0.08);
  3646|        const lookTarget = playerJet.position.clone().addScaledVector(moveDir, 20);
  3647|        lookTarget.y = FLIGHT_ALTITUDE - 10;
  3648|        camera.lookAt(lookTarget);
  3649|
  3650|      } else if (cameraView === 1) {
  3651|        // View 1: Cockpit — inside the jet looking forward
  3652|        const cockpitOffset = new THREE.Vector3(
  3653|          -Math.sin(jetHeading) * 1.5,
  3654|          0.5,
  3655|          -Math.cos(jetHeading) * 1.5
  3656|        );
  3657|        const cockpitPos = playerJet.position.clone().add(cockpitOffset);
  3658|        camera.position.lerp(cockpitPos, 0.25);
  3659|        const cockpitLook = playerJet.position.clone().addScaledVector(moveDir, -30);
  3660|        cockpitLook.y = playerJet.position.y + jetPitch * -10;
  3661|        camera.lookAt(cockpitLook);
  3662|
  3663|      } else {
  3664|        // View 2: Planet-center — stationary camera at planet center looking at jet
  3665|        camera.position.lerp(new THREE.Vector3(0, -60, 0), 0.04);
  3666|        camera.lookAt(playerJet.position);
  3667|      }
  3668|
  3669|      // ── Sky dome + fog phase transition ─────────────────────────────────────
  3670|      // Use theme sky in atmosphere, space sky in space phase
  3671|      skyTarget = (phase === 'space') ? SKY_SPACE : THEMES[currentTheme].sky;
  3672|      updateSkyDome(dt);
  3673|      skyDome.position.copy(camera.position); // sky dome always centered on camera
  3674|      // Slow continuous sky dome rotation — makes the background feel alive
  3675|      skyDome.rotation.y += 0.00015;
  3676|      // Atmosphere shimmer — gentle opacity breathing on the atmo shell
  3677|      if (phase !== 'space') {
  3678|        const shimT = Date.now() * 0.001;
  3679|        atmoMat.opacity = 0.08 + Math.sin(shimT * 0.4) * 0.03 + Math.sin(shimT * 1.1 + 0.7) * 0.015;
  3680|      }
  3681|
  3682|      // ── Earth follows jet XZ — curvature always visible below ──────────────
  3683|      if (phase !== 'space') {
  3684|        // Earth center tracks jet XZ so the curved surface is always below
  3685|        earthMesh.position.x = playerJet.position.x;
  3686|        earthMesh.position.z = playerJet.position.z;
  3687|        atmoMesh.position.x = playerJet.position.x;
  3688|        atmoMesh.position.z = playerJet.position.z;
  3689|        // Slowly rotate Earth to show it's a sphere
  3690|        earthMesh.rotation.y += 0.0008;
  3691|
  3692|        // Rim glow rings follow Earth
  3693|        rimMesh.position.x = earthMesh.position.x;
  3694|        rimMesh.position.z = earthMesh.position.z;
  3695|        rimInnerMesh.position.x = earthMesh.position.x;
  3696|        rimInnerMesh.position.z = earthMesh.position.z;
  3697|        // Animate rim glow pulse
  3698|        const rimT = Date.now() * 0.001;
  3699|        rimMat.opacity = 0.12 + Math.sin(rimT * 0.8) * 0.06;
  3700|        rimInnerMat.opacity = 0.22 + Math.sin(rimT * 1.2 + 1.0) * 0.08;
  3701|        // Tint rim to match theme color
  3702|        rimMat.color.set(THEMES[currentTheme].rimColor);
  3703|        rimInnerMat.color.set(THEMES[currentTheme].rimColor);
  3704|
  3705|        // Surface cracks follow Earth
  3706|        crackGroup.position.x = earthMesh.position.x;
  3707|        crackGroup.position.z = earthMesh.position.z;
  3708|        crackGroup.rotation.y = earthMesh.rotation.y;
  3709|        // Pulse crack opacity — only when in volcanic stage; evolution system fades them out above T=0.67
  3710|        if (planetEvolutionT < 0.67) {
  3711|          const crackBase = Math.max(0, 1 - planetEvolutionT * 1.5);
  3712|          crackGroup.children.forEach((line, idx) => {
  3713|            const lm = (line as THREE.Line).material as THREE.LineBasicMaterial;
  3714|            lm.opacity = crackBase * (0.20 + Math.sin(rimT * 1.5 + idx * 0.4) * 0.15);
  3715|          });
  3716|        }
  3717|
  3718|        // Orbital cloud sphere follows Earth
  3719|        orbCloudMesh.position.x = earthMesh.position.x;
  3720|        orbCloudMesh.position.z = earthMesh.position.z;
  3721|
  3722|        // ── Clouds — slow orbital drift around planet center + bob + puff tumble ──
  3723|        // The entire cloudGroup pivots around the Earth so clouds circle the planet
  3724|        // Individual clouds also drift and bob for organic variety
  3725|        cloudGroup.rotation.y += 0.012 * dt; // full orbit in ~8 min — visibly alive but not dizzy
  3726|
  3727|        const cloudNow = Date.now() * 0.001;
  3728|        clouds3D.forEach(c => {
  3729|          const speedMult = THEMES[currentTheme].cloudSpeedMult;
  3730|          // Vertical bob — smooth sine wave per cloud (orbit handles XZ movement)
  3731|          c.group.position.y = c.baseY + Math.sin(cloudNow * c.bobFreq + c.bobOffset) * c.bobAmp;
  3732|
  3733|          // Gentle individual XZ wander on top of the group orbit
  3734|          c.group.position.x += c.xDrift * speedMult * 0.3;
  3735|          c.group.position.z += c.speed  * speedMult * 0.3;
  3736|
  3737|          // Keep clouds from drifting too far from their spawn radius (orbit keeps them roughly centred)
  3738|          const dz = c.group.position.z - playerJet.position.z;
  3739|          const dx = c.group.position.x - playerJet.position.x;
  3740|          if (dz > 120)  c.group.position.z -= 240;
  3741|          if (dz < -120) c.group.position.z += 240;
  3742|          if (dx > 80)   c.group.position.x -= 160;
  3743|          if (dx < -80)  c.group.position.x += 160;
  3744|
  3745|          // Gently tumble each puff for organic feel
  3746|          c.group.children.forEach(puff => {
  3747|            const p = puff as THREE.Mesh & { rotSpeed?: number };
  3748|            if (p.rotSpeed) p.rotation.y += p.rotSpeed * speedMult;
  3749|          });
  3750|
  3751|          // Tint cloud puffs to match theme (white for earth/ice, warm for lava, dark for storm, cyan for ocean)
  3752|          const themeCloudColor = THEMES[currentTheme].cloudColor ?? 0xffffff;
  3753|          c.group.children.forEach(puff => {
  3754|            const m = (puff as THREE.Mesh).material as THREE.MeshLambertMaterial;
  3755|            if (m) m.color.set(themeCloudColor);
  3756|          });
  3757|        });
  3758|      } else {
  3759|        // Hide planet surface elements in space
  3760|        rimMesh.visible = false;
  3761|        rimInnerMesh.visible = false;
  3762|        crackGroup.visible = false;
  3763|      }
  3764|
  3765|      // Update floating dust particles
  3766|      updateDust(dt);
  3767|
  3768|      // ── Planet Evolution — story mode only; endless uses applyTheme per kill ──
  3769|      if (phase !== 'space' && gameMode === 'story') updatePlanetEvolution(dt);
  3770|
  3771|      // ── Theme-specific effects ───────────────────────────────────────────────
  3772|      if (currentTheme === 'storm' && phase !== 'space') {
  3773|        lightningTimer -= dt;
  3774|        if (lightningFlash > 0) {
  3775|          lightningFlash -= dt;
  3776|          // Bright white flash on sky + ambient
  3777|          const flashStr = Math.max(0, lightningFlash / 0.12);
  3778|          ambient.intensity = 1.0 + flashStr * 6.0;
  3779|          ambient.color.setRGB(1, 1, 1);
  3780|          if (lightningFlash <= 0) {
  3781|            ambient.intensity = 0.6;
  3782|            ambient.color.set(0x334466);
  3783|          }
  3784|        }
  3785|        if (lightningTimer <= 0) {
  3786|          lightningFlash = 0.12;
  3787|          lightningTimer = 3.5 + Math.random() * 6.0;
  3788|        }
  3789|      }
  3790|
  3791|      // Stars wrap around player in space — drift forward + gentle lateral sway
  3792|      if (phase === 'space' || phase === 'transition') {
  3793|        const sp = starGeo.attributes.position.array as Float32Array;
  3794|        for (let i = 0; i < sp.length; i += 3) {
  3795|          sp[i + 2] += 0.28;
  3796|          if (sp[i + 2] - playerJet.position.z > 200) sp[i + 2] -= 400;
  3797|          if (sp[i]     - playerJet.position.x > 150) sp[i]     -= 300;
  3798|          if (sp[i]     - playerJet.position.x < -150) sp[i]    += 300;
  3799|        }
  3800|        starGeo.attributes.position.needsUpdate = true;
  3801|        starGroup.rotation.y += 0.00008;
  3802|      }
  3803|
  3804|      // ── Shooting ────────────────────────────────────────────────────────────
  3805|      shootCooldown -= dt;
  3806|      if (keys['Space'] && shootCooldown <= 0) {
  3807|        fireBullet();
  3808|        shootCooldown = DIFF[difficulty].shootCooldown;
  3809|      }
  3810|
  3811|      // ── Bomb drop — B key, player only ──────────────────────────────────────
  3812|      bombCooldown -= dt;
  3813|      if (keys['KeyB'] && bombCooldown <= 0) {
  3814|        dropBomb();
  3815|        bombCooldown = 1.2;
  3816|      }
  3817|
  3818|      // ── Move + detonate bombs ────────────────────────────────────────────────
  3819|      for (let i = bombs.length - 1; i >= 0; i--) {
  3820|        const bm = bombs[i];
  3821|        bm.age += dt;
  3822|        bm.vel.y -= 12 * dt; // gravity arc
  3823|        bm.mesh.position.addScaledVector(bm.vel, dt);
  3824|        bm.mesh.rotation.x += dt * 4;
  3825|        bm.mesh.rotation.z += dt * 3;
  3826|        // Pulse glow
  3827|        const glowMesh = bm.mesh.children[1] as THREE.Mesh;
  3828|        const gm = glowMesh.material as THREE.MeshBasicMaterial;
  3829|        gm.opacity = 0.25 + Math.sin(bm.age * 18) * 0.18;
  3830|        // Arm after 0.15s so it doesn't self-detonate at launch
  3831|        if (bm.age > 0.15) bm.armed = true;
  3832|        // Detonate: hits ground level OR close to any enemy
  3833|        let detonated = false;
  3834|        if (bm.mesh.position.y < FLIGHT_ALTITUDE - 4) detonated = true;
  3835|        if (bm.armed) {
  3836|          for (const e of enemies) {
  3837|            if (bm.mesh.position.distanceTo(e.mesh.position) < 10) { detonated = true; break; }
  3838|          }
  3839|        }
  3840|        if (bm.age > 4.0) detonated = true; // timeout
  3841|        if (detonated) {
  3842|          // Area-of-effect blast — damage all enemies within radius 12
  3843|          const blastPos = bm.mesh.position.clone();
  3844|          explode(blastPos, 0x0055ff, 40, false);
  3845|          explode(blastPos, 0x00aaff, 20, false);
  3846|          for (let ei = enemies.length - 1; ei >= 0; ei--) {
  3847|            if (enemies[ei].mesh.position.distanceTo(blastPos) < 12) {
  3848|              enemies[ei].hp -= 3;
  3849|              enemies[ei].flashTimer = 0.2;
  3850|              if (enemies[ei].hp <= 0) {
  3851|                const isAlien = enemies[ei].type === 'alien';
  3852|                const pts = isAlien ? 25 : 10;
  3853|                explode(enemies[ei].mesh.position.clone(), isAlien ? 0xff44ff : 0xff8800, isAlien ? 36 : 28, isAlien);
  3854|                playExplosionSound(isAlien);
  3855|                const sp = worldToScreen(enemies[ei].mesh.position);
  3856|                if (sp) spawnFloatText(`+${pts}`, sp.x, sp.y, isAlien ? '#ff88ff' : '#ffdd44');
  3857|                score += pts;
  3858|                scene.remove(enemies[ei].mesh);
  3859|                enemies.splice(ei, 1);
  3860|                if (gameMode === 'endless') {
  3861|                  // ── Endless mode: track kills and advance through 9 worlds ───
  3862|                  endlessKills++;
  3863|                  let newStage = 0;
  3864|                  for (let wi = ENDLESS_THRESHOLDS.length - 1; wi >= 0; wi--) {
  3865|                    if (endlessKills >= ENDLESS_THRESHOLDS[wi]) { newStage = wi; break; }
  3866|                  }
  3867|                  if (newStage > endlessStage) {
  3868|                    endlessStage = newStage;
  3869|                    levelUpFlashTimer = 2.5;
  3870|                    applyTheme(ENDLESS_WORLDS[endlessStage]);
  3871|                    levelUpFlashEl.style.display = 'block';
  3872|                    levelUpFlashEl.style.opacity = '0.85';
  3873|                    levelUpFlashEl.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none"><div style="font-size:14px;letter-spacing:4px;color:#aaffff;text-transform:uppercase;margin-bottom:6px">WORLD ${endlessStage + 1}</div><div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#ffffff;text-shadow:0 0 30px #00ffff,0 0 60px #8800ff;text-transform:uppercase">${ENDLESS_WORLDS[endlessStage]}</div></div>`;
  3874|                    try {
  3875|                      const actx = getAudio(); const t2 = actx.currentTime;
  3876|                      const osc = actx.createOscillator(); const g = actx.createGain();
  3877|                      osc.type = 'sine'; osc.frequency.setValueAtTime(440, t2);
  3878|                      osc.frequency.linearRampToValueAtTime(1320, t2 + 0.4);
  3879|                      g.gain.setValueAtTime(0.30, t2); g.gain.exponentialRampToValueAtTime(0.001, t2 + 0.6);
  3880|                      osc.connect(g); g.connect(actx.destination);
  3881|                      osc.start(t2); osc.stop(t2 + 0.6);
  3882|                    } catch { /* ignore */ }
  3883|                  }
  3884|                } else {
  3885|                  // ── Story mode: mission advance ───────────────────────────
  3886|                  missionKills++;
  3887|                  const bCurMission = MISSIONS[Math.min(missionIndex, MISSIONS.length - 1)];
  3888|                  if (missionKills >= bCurMission.killTarget) {
  3889|                    score += bCurMission.bonusScore;
  3890|                    const bNextMission = missionIndex + 1 < MISSIONS.length ? MISSIONS[missionIndex + 1] : null;
  3891|                    showMissionCompleteFlash(bCurMission, bNextMission);
  3892|                    missionIndex++;
  3893|                    missionKills = 0;
  3894|                    lastMissionKills = -1;
  3895|                    if (missionIndex >= MISSIONS.length) {
  3896|                      setTimeout(() => { gameState = 'gameover'; }, 3500);
  3897|                    }
  3898|                  }
  3899|                }
  3900|              }
  3901|            }
  3902|          }
  3903|          scene.remove(bm.mesh);
  3904|          bombs.splice(i, 1);
  3905|        }
  3906|      }
  3907|
  3908|      // ── Asteroids — spawn, drift, rotate, collide ───────────────────────────
  3909|      if (phase === 'space') {
  3910|        asteroidSpawnTimer -= dt;
  3911|        if (asteroidSpawnTimer <= 0) {
  3912|          spawnAsteroid();
  3913|          asteroidSpawnTimer = 1.8 + Math.random() * 1.4; // new rock every ~2s
  3914|        }
  3915|
  3916|        // Move + rotate each rock
  3917|        for (let i = asteroids.length - 1; i >= 0; i--) {
  3918|          const a = asteroids[i];
  3919|          a.mesh.position.addScaledVector(a.vel, dt);
  3920|          a.mesh.rotation.x += a.rotVel.x * dt;
  3921|          a.mesh.rotation.y += a.rotVel.y * dt;
  3922|          a.mesh.rotation.z += a.rotVel.z * dt;
  3923|          // Remove if drifted too far from player
  3924|          if (a.mesh.position.distanceTo(playerJet.position) > 120) {
  3925|            scene.remove(a.mesh);
  3926|            asteroids.splice(i, 1);
  3927|          }
  3928|        }
  3929|
  3930|        // ── Bullet vs Asteroid ─────────────────────────────────────────────────
  3931|        for (let bi = bullets.length - 1; bi >= 0; bi--) {
  3932|          let hit = false;
  3933|          for (let ai = asteroids.length - 1; ai >= 0; ai--) {
  3934|            if (bullets[bi].mesh.position.distanceTo(asteroids[ai].mesh.position) < asteroids[ai].radius * 1.1) {
  3935|              asteroids[ai].hp--;
  3936|              explode(bullets[bi].mesh.position.clone(), 0xaa8855, 8, false);
  3937|              scene.remove(bullets[bi].mesh);
  3938|              bullets.splice(bi, 1);
  3939|              hit = true;
  3940|              if (asteroids[ai].hp <= 0) {
  3941|                // Big rock splits into 2 smaller ones
  3942|                if (asteroids[ai].radius > 2.0) {
  3943|                  for (let s = 0; s < 2; s++) {
  3944|                    const sAngle = Math.random() * Math.PI * 2;
  3945|                    const sSpeed = 2.5 + Math.random() * 2.0;
  3946|                    const sRadius = asteroids[ai].radius * 0.55;
  3947|                    const sMesh = buildRock(sRadius);
  3948|                    sMesh.position.copy(asteroids[ai].mesh.position);
  3949|                    scene.add(sMesh);
  3950|                    asteroids.push({
  3951|                      mesh: sMesh,
  3952|                      vel: new THREE.Vector3(Math.cos(sAngle) * sSpeed, 0, Math.sin(sAngle) * sSpeed),
  3953|                      rotVel: new THREE.Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2),
  3954|                      radius: sRadius,
  3955|                      hp: 1,
  3956|                    });
  3957|                  }
  3958|                }
  3959|                const pts = asteroids[ai].radius > 2.0 ? 15 : 8;
  3960|                explode(asteroids[ai].mesh.position.clone(), 0xcc9966, 22, false);
  3961|                const asp = worldToScreen(asteroids[ai].mesh.position);
  3962|                if (asp) spawnFloatText(`+${pts}`, asp.x, asp.y, '#ffcc88');
  3963|                score += pts;
  3964|                scene.remove(asteroids[ai].mesh);
  3965|                asteroids.splice(ai, 1);
  3966|              }
  3967|              break;
  3968|            }
  3969|          }
  3970|          if (hit) break;
  3971|        }
  3972|
  3973|        // ── Asteroid vs Player — costs a life ─────────────────────────────────
  3974|        if (invincible <= 0) {
  3975|          for (let ai = asteroids.length - 1; ai >= 0; ai--) {
  3976|            if (asteroids[ai].mesh.position.distanceTo(playerJet.position) < asteroids[ai].radius + 1.0) {
  3977|              explode(playerJet.position.clone(), 0xcc8844, 20, false);
  3978|              scene.remove(asteroids[ai].mesh);
  3979|              asteroids.splice(ai, 1);
  3980|              lives--;
  3981|              invincible = 2.5;
  3982|              shakeTimer = 0.4;
  3983|              shakeMag = 0.7;
  3984|              playExplosionSound(false);
  3985|              if (lives <= 0) gameState = 'gameover';
  3986|              break;
  3987|            }
  3988|          }
  3989|        }
  3990|      }
  3991|
  3992|      // ── Enemy shooting — ONE random enemy fires a laser bolt per interval ────
  3993|      enemyShootTimer -= dt;
  3994|      if (enemyShootTimer <= 0 && enemies.length > 0) {
  3995|        enemyFire(); // fires exactly one bolt from one random enemy
  3996|        const diffShootMult = DIFF[difficulty].enemyShootMult;
  3997|        if (gameMode === 'endless') {
  3998|          // Endless: fire faster each stage (stage 4 = max aggression)
  3999|          const stageBoost = (endlessStage - 1) * 0.2;
  4000|          enemyShootTimer = Math.max(0.35, (2.0 - stageBoost) * diffShootMult);
  4001|        } else {
  4002|          // Story: shrinks as missions progress — starts at 2.2s, min 0.7s
  4003|          enemyShootTimer = Math.max(0.35, (2.2 - missionIndex * 0.12) * diffShootMult);
  4004|        }
  4005|      }
  4006|
  4007|      // ── Spawn enemies ───────────────────────────────────────────────────────
  4008|      spawnTimer -= dt;
  4009|      if (spawnTimer <= 0) {
  4010|        spawnEnemy();
  4011|        const diffSpawnMult = DIFF[difficulty].spawnRateMult;
  4012|        if (gameMode === 'endless') {
  4013|          // Endless: spawn faster each stage; stage 4 adds 20% more speed
  4014|          const stageBoost = endlessStage >= 4 ? 0.8 : (endlessStage - 1) * 0.2;
  4015|          spawnTimer = Math.max(0.3, (2.0 - stageBoost) * diffSpawnMult);
  4016|        } else {
  4017|          // Story: spawn faster as missions progress
  4018|          spawnTimer = Math.max(0.3, (2.0 - missionIndex * 0.12) * diffSpawnMult);
  4019|        }
  4020|      }
  4021|
  4022|      // ── Move bullets ────────────────────────────────────────────────────────
  4023|      for (let i = bullets.length - 1; i >= 0; i--) {
  4024|        const b = bullets[i];
  4025|        b.age += dt;
  4026|        b.mesh.position.addScaledVector(b.vel, dt);
  4027|        // Pulse the outer glow opacity so the bolt shimmers as it flies
  4028|        const outerMesh = b.mesh.children[0] as THREE.Mesh;
  4029|        const midMesh   = b.mesh.children[1] as THREE.Mesh;
  4030|        const pulse = 0.28 + Math.sin(b.age * 28) * 0.12;
  4031|        (outerMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
  4032|        (midMesh.material as THREE.MeshBasicMaterial).opacity   = 0.60 + Math.sin(b.age * 28 + 1) * 0.18;
  4033|        if (b.mesh.position.distanceTo(playerJet.position) > 80) {
  4034|          scene.remove(b.mesh);
  4035|          bullets.splice(i, 1);
  4036|        }
  4037|      }
  4038|
  4039|      // ── Muzzle flash fade ────────────────────────────────────────────────────
  4040|      for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
  4041|        const f = muzzleFlashes[i];
  4042|        f.life -= dt;
  4043|        (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.08) * 0.9;
  4044|        f.mesh.scale.setScalar(1 + (1 - f.life / 0.08) * 1.4);
  4045|        if (f.life <= 0) {
  4046|          scene.remove(f.mesh);
  4047|          muzzleFlashes.splice(i, 1);
  4048|        }
  4049|      }
  4050|
  4051|      // ── Laser trail fade + cleanup ───────────────────────────────────────────
  4052|      for (let i = laserTrails.length - 1; i >= 0; i--) {
  4053|        const tr = laserTrails[i];
  4054|        tr.life -= dt;
  4055|        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (tr.life / tr.maxLife) * 0.30);
  4056|        if (tr.life <= 0) {
  4057|          scene.remove(tr.mesh);
  4058|          laserTrails.splice(i, 1);
  4059|        }
  4060|      }
  4061|
  4062|      // ── Move enemy bullets — short red laser bolts ───────────────────────────
  4063|      for (let i = enemyBullets.length - 1; i >= 0; i--) {
  4064|        const eb = enemyBullets[i];
  4065|        eb.age += dt;
  4066|        eb.mesh.position.addScaledVector(eb.vel, dt);
  4067|        // Subtle glow pulse on the sleeve (child[0] = translucent sleeve)
  4068|        const glowMesh = eb.mesh.children[0] as THREE.Mesh;
  4069|        if (glowMesh) {
  4070|          const pulse = 0.45 + Math.sin(eb.age * 20) * 0.15;
  4071|          (glowMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
  4072|        }
  4073|        if (eb.mesh.position.distanceTo(playerJet.position) > 60) {
  4074|          scene.remove(eb.mesh);
  4075|          enemyBullets.splice(i, 1);
  4076|        }
  4077|      }
  4078|
  4079|      // ── Move enemies toward player ──────────────────────────────────────────
  4080|      for (let i = enemies.length - 1; i >= 0; i--) {
  4081|        const e = enemies[i];
  4082|        const toPlayer = new THREE.Vector3().subVectors(playerJet.position, e.mesh.position);
  4083|        const dist = toPlayer.length();
  4084|        if (dist > 0.1) {
  4085|          toPlayer.normalize();
  4086|          e.mesh.position.addScaledVector(toPlayer, e.speed * dt);
  4087|          // Face player
  4088|          e.mesh.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
  4089|        }
  4090|        // Lock enemy Y to player flight altitude — same level as player
  4091|        e.mesh.position.y = FLIGHT_ALTITUDE;
  4092|        // Weave
  4093|        e.mesh.position.x += Math.sin(Date.now() * 0.002 + i * 1.3) * 0.03;
  4094|
  4095|        // Remove if too far
  4096|        if (e.mesh.position.distanceTo(playerJet.position) > 120) {
  4097|          scene.remove(e.mesh);
  4098|          enemies.splice(i, 1);
  4099|        }
  4100|      }
  4101|
  4102|      // ── Bullet vs Enemy ─────────────────────────────────────────────────────
  4103|      for (let bi = bullets.length - 1; bi >= 0; bi--) {
  4104|        for (let ei = enemies.length - 1; ei >= 0; ei--) {
  4105|          if (bullets[bi].mesh.position.distanceTo(enemies[ei].mesh.position) < 1.6) {
  4106|            enemies[ei].hp--;
  4107|            enemies[ei].flashTimer = 0.12; // hit flash
  4108|            // Blue electric spark burst at impact point
  4109|            explode(bullets[bi].mesh.position.clone(), 0x0088ff, 10, false);
  4110|            scene.remove(bullets[bi].mesh);
  4111|            bullets.splice(bi, 1);
  4112|            if (enemies[ei].hp <= 0) {
  4113|              const isAlien = enemies[ei].type === 'alien';
  4114|              const pts = isAlien ? 25 : 10;
  4115|              explode(enemies[ei].mesh.position.clone(), isAlien ? 0xff44ff : 0xff8800, isAlien ? 36 : 28, isAlien);
  4116|              playExplosionSound(isAlien);
  4117|              // Floating score text
  4118|              const sp = worldToScreen(enemies[ei].mesh.position);
  4119|              if (sp) spawnFloatText(`+${pts}`, sp.x, sp.y, isAlien ? '#ff88ff' : '#ffdd44');
  4120|              score += pts;
  4121|              missionKills++;
  4122|              scene.remove(enemies[ei].mesh);
  4123|              enemies.splice(ei, 1);
  4124|              if (gameMode === 'endless') {
  4125|                // ── Endless mode: track kills and advance through 9 worlds ───
  4126|                endlessKills++;
  4127|                // Find which world we should be on based on kill count
  4128|                let newStage = 0;
  4129|                for (let wi = ENDLESS_THRESHOLDS.length - 1; wi >= 0; wi--) {
  4130|                  if (endlessKills >= ENDLESS_THRESHOLDS[wi]) { newStage = wi; break; }
  4131|                }
  4132|                if (newStage > endlessStage) {
  4133|                  endlessStage = newStage;
  4134|                  levelUpFlashTimer = 2.5;
  4135|                  // Switch to the new world's theme — full visual transformation
  4136|                  applyTheme(ENDLESS_WORLDS[endlessStage]);
  4137|                  // Show world name in the flash overlay
  4138|                  levelUpFlashEl.style.display = 'block';
  4139|                  levelUpFlashEl.style.opacity = '0.85';
  4140|                  levelUpFlashEl.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none"><div style="font-size:14px;letter-spacing:4px;color:#aaffff;text-transform:uppercase;margin-bottom:6px">WORLD ${endlessStage + 1}</div><div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#ffffff;text-shadow:0 0 30px #00ffff,0 0 60px #8800ff;text-transform:uppercase">${ENDLESS_WORLDS[endlessStage]}</div></div>`;
  4141|                  // Play a rising level-up chime
  4142|                  try {
  4143|                    const actx = getAudio(); const t2 = actx.currentTime;
  4144|                    const osc = actx.createOscillator(); const g = actx.createGain();
  4145|                    osc.type = 'sine'; osc.frequency.setValueAtTime(440, t2);
  4146|                    osc.frequency.linearRampToValueAtTime(1320, t2 + 0.4);
  4147|                    g.gain.setValueAtTime(0.30, t2); g.gain.exponentialRampToValueAtTime(0.001, t2 + 0.6);
  4148|                    osc.connect(g); g.connect(actx.destination);
  4149|                    osc.start(t2); osc.stop(t2 + 0.6);
  4150|                  } catch { /* ignore */ }
  4151|                }
  4152|              } else {
  4153|                // ── Story mode: mission advance check ─────────────────────────
  4154|                const curMission = MISSIONS[Math.min(missionIndex, MISSIONS.length - 1)];
  4155|                if (missionKills >= curMission.killTarget) {
  4156|                  score += curMission.bonusScore;
  4157|                  missionIndex++;
  4158|                  missionKills = 0;
  4159|                  lastMissionKills = -1; // force HUD refresh
  4160|                  const nextMission = missionIndex < MISSIONS.length ? MISSIONS[missionIndex] : null;
  4161|                  showMissionCompleteFlash(curMission, nextMission);
  4162|                  if (missionIndex < MISSION_THEMES.length) {
  4163|                    planetTransitionTimer = 3.0;
  4164|                  }
  4165|                  if (missionIndex >= MISSIONS.length) {
  4166|                    setTimeout(() => { gameState = 'gameover'; }, 4000);
  4167|                  }
  4168|                }
  4169|              }
  4170|            }
  4171|            break;
  4172|          }
  4173|        }
  4174|      }
  4175|
  4176|      // ── Enemy bullet vs Player ──────────────────────────────────────────────
  4177|      if (invincible <= 0) {
  4178|        for (let i = enemyBullets.length - 1; i >= 0; i--) {
  4179|          if (enemyBullets[i].mesh.position.distanceTo(playerJet.position) < 1.4) {
  4180|            scene.remove(enemyBullets[i].mesh);
  4181|            enemyBullets.splice(i, 1);
  4182|            lives--;
  4183|            invincible = 2.5;
  4184|            shakeTimer = 0.35;
  4185|            shakeMag = 0.6;
  4186|            explode(playerJet.position.clone(), 0x00aaff, 18);
  4187|            playExplosionSound(false);
  4188|            if (lives <= 0) gameState = 'gameover';
  4189|            break;
  4190|          }
  4191|        }
  4192|      }
  4193|
  4194|      // ── Danger vignette — red screen-edge pulse when enemy bullet is close ───
  4195|      if (gameState === 'playing') {
  4196|        let closestBulletDist = Infinity;
  4197|        for (const eb of enemyBullets) {
  4198|          const d = eb.mesh.position.distanceTo(playerJet.position);
  4199|          if (d < closestBulletDist) closestBulletDist = d;
  4200|        }
  4201|        if (closestBulletDist < 10) {
  4202|          // Intensity ramps up as bullet closes in (10 → 0 units)
  4203|          const intensity = Math.pow(1 - closestBulletDist / 10, 1.5);
  4204|          const pulse = 0.5 + Math.sin(Date.now() * 0.018) * 0.5; // fast pulse
  4205|          dangerVignette.style.opacity = String(intensity * pulse * 0.9);
  4206|        } else {
  4207|          dangerVignette.style.opacity = '0';
  4208|        }
  4209|      }
  4210|
  4211|      // ── Enemy vs Player — collision pushes enemy back, no life lost ──────────
  4212|      // Lives are only lost from enemy bullets, not body contact
  4213|      for (let i = enemies.length - 1; i >= 0; i--) {
  4214|        if (enemies[i].mesh.position.distanceTo(playerJet.position) < 2.0) {
  4215|          // Push the enemy away from the player so it doesn't clip through
  4216|          const pushDir = new THREE.Vector3()
  4217|            .subVectors(enemies[i].mesh.position, playerJet.position)
  4218|            .normalize();
  4219|          enemies[i].mesh.position.addScaledVector(pushDir, 3.0);
  4220|          // Small collision spark — no life loss
  4221|          explode(enemies[i].mesh.position.clone(), 0xff8800, 8, false);
  4222|          shakeTimer = 0.12;
  4223|          shakeMag = 0.3;
  4224|        }
  4225|      }
  4226|
  4227|      // ── Invincibility flash ─────────────────────────────────────────────────
  4228|      if (invincible > 0) {
  4229|        invincible -= dt;
  4230|        playerJet.visible = Math.floor(invincible * 8) % 2 === 0;
  4231|      } else {
  4232|        playerJet.visible = true;
  4233|      }
  4234|
  4235|      // ── Particles ───────────────────────────────────────────────────────────
  4236|      for (let i = particles.length - 1; i >= 0; i--) {
  4237|        const p = particles[i];
  4238|        p.mesh.position.add(p.vel);
  4239|        p.vel.multiplyScalar(0.93); // drag
  4240|        p.vel.y -= 0.006;
  4241|        p.life -= dt * 1.4;
  4242|        const mat = p.mesh.material as THREE.MeshBasicMaterial;
  4243|        mat.opacity = Math.max(0, p.life);
  4244|        mat.transparent = true;
  4245|        // Spin debris
  4246|        if (p.spin) {
  4247|          p.mesh.rotation.x += p.spin;
  4248|          p.mesh.rotation.z += p.spin * 0.7;
  4249|        }
  4250|        // Shockwave ring: expand outward
  4251|        if (p.mesh.geometry instanceof THREE.TorusGeometry) {
  4252|          const s = 1 + (1 - p.life) * 8;
  4253|          p.mesh.scale.set(s, s, 1);
  4254|        }
  4255|        if (p.life <= 0) {
  4256|          scene.remove(p.mesh);
  4257|          particles.splice(i, 1);
  4258|        }
  4259|      }
  4260|
  4261|      // ── Hit flash on enemies ─────────────────────────────────────────────────
  4262|      for (const e of enemies) {
  4263|        if (e.flashTimer > 0) {
  4264|          e.flashTimer -= dt;
  4265|          e.mesh.traverse(child => {
  4266|            const m = child as THREE.Mesh;
  4267|            if (m.isMesh && m.material) {
  4268|              // Flash white while timer active, restore to red/purple when done
  4269|              const isAlien = e.type === 'alien';
  4270|              const restoreColor = isAlien ? 0x882299 : 0xcc2222;
  4271|              (m.material as THREE.MeshPhongMaterial).color.set(e.flashTimer > 0 ? 0xffffff : restoreColor);
  4272|              (m.material as THREE.MeshPhongMaterial).emissive?.set(e.flashTimer > 0 ? 0x888888 : 0x000000);
  4273|            }
  4274|          });
  4275|        }
  4276|      }
  4277|
  4278|      // ── Screen shake ─────────────────────────────────────────────────────────
  4279|      if (shakeTimer > 0) {
  4280|        shakeTimer -= dt;
  4281|        const s = shakeMag * (shakeTimer / 0.5);
  4282|        camera.position.x += (Math.random() - 0.5) * s;
  4283|        camera.position.y += (Math.random() - 0.5) * s * 0.5;
  4284|      } else {
  4285|        shakeMag = 0;
  4286|      }
  4287|
  4288|      // ── Engine flame animation (twin afterburners built into playerJet) ────────
  4289|      {
  4290|        const now = Date.now() * 0.001;
  4291|        const isBoosting = keys['KeyF'] || keys['ShiftLeft'] || keys['ShiftRight'];
  4292|        const throttle = jetSpeed / JET_MAX_SPEED;
  4293|        const trailLen = isBoosting ? 2.2 : 1.0;
  4294|        const flicker1 = 0.88 + Math.sin(now * 28.3) * 0.07 + Math.sin(now * 41.7) * 0.05;
  4295|        const flicker2 = 0.90 + Math.sin(now * 19.1) * 0.06 + Math.sin(now * 53.3) * 0.04;
  4296|        const baseLen = (0.35 + throttle * 0.65) * trailLen;
  4297|        const baseWid = 0.60 + throttle * 0.40;
  4298|
  4299|        // Animate each flame group (children 11 and 12 of playerJet — the two makeFlame groups)
  4300|        playerJet.children.forEach(child => {
  4301|          if (!(child instanceof THREE.Group)) return;
  4302|          // Flame groups are positioned at z≈2.8 (rear of jet)
  4303|          if (child.position.z < 2.0) return;
  4304|          const [outer, mid, core, disc] = child.children as THREE.Mesh[];
  4305|          if (!outer || !mid || !core) return;
  4306|          const outerMat = outer.material as THREE.MeshBasicMaterial;
  4307|          const midMat   = mid.material   as THREE.MeshBasicMaterial;
  4308|          const coreMat  = core.material  as THREE.MeshBasicMaterial;
  4309|          // Blue engine trail — cyan/blue instead of orange
  4310|          outer.scale.set(baseWid * flicker1, baseWid * flicker1, baseLen * flicker1 * 1.2);
  4311|          outerMat.opacity = 0.25 + throttle * 0.35;
  4312|          outerMat.color.setHSL(isBoosting ? 0.58 : 0.55, 1.0, 0.55); // bright cyan-blue
  4313|          mid.scale.set(baseWid * flicker2, baseWid * flicker2, baseLen * flicker2);
  4314|          midMat.opacity = 0.70 + throttle * 0.25;
  4315|          midMat.color.setHSL(isBoosting ? 0.60 : 0.57, 1.0, 0.65);
  4316|          core.scale.set(baseWid * flicker1 * 0.7, baseWid * flicker1 * 0.7, baseLen * flicker2 * 0.75);
  4317|          coreMat.color.setHSL(0.62, 1.0, 0.80 + throttle * 0.15);
  4318|          if (disc) {
  4319|            const discMat = disc.material as THREE.MeshBasicMaterial;
  4320|            discMat.opacity = 0.50 + throttle * 0.45 + Math.sin(now * 22) * 0.08;
  4321|            discMat.color.setHSL(0.60, 1.0, 0.90);
  4322|          }
  4323|        });
  4324|
  4325|        // FOV zoom-out when boosting
  4326|        const targetFov = isBoosting ? 95 : 75;
  4327|        camera.fov += (targetFov - camera.fov) * 0.08;
  4328|        camera.updateProjectionMatrix();
  4329|      }
  4330|
  4331|      // ── Player halo + beacon animation ──────────────────────────────────────
  4332|      const haloNow = Date.now() * 0.001;
  4333|      // Inner halo: rotate and pulse opacity
  4334|      haloRing.rotation.z += 0.018;
  4335|      haloMat.opacity = 0.55 + Math.sin(haloNow * 3.0) * 0.25;
  4336|      // Outer halo: counter-rotate, slower pulse
  4337|      haloRing2.rotation.z -= 0.010;
  4338|      halo2Mat.opacity = 0.25 + Math.sin(haloNow * 2.0 + 1.0) * 0.15;
  4339|      // Beacon: pulse size and brightness
  4340|      const beaconPulse = 0.7 + Math.sin(haloNow * 5.0) * 0.35;
  4341|      beacon.scale.setScalar(beaconPulse);
  4342|      beaconMat.color.setHSL(0.52 + Math.sin(haloNow * 2) * 0.04, 1.0, 0.55 + beaconPulse * 0.2);
  4343|      // Player point light: pulse intensity
  4344|      playerLight.intensity = 2.0 + Math.sin(haloNow * 4.0) * 0.8;
  4345|
  4346|      // ── Float text update ────────────────────────────────────────────────────
  4347|      for (let i = floatTexts.length - 1; i >= 0; i--) {
  4348|        const ft = floatTexts[i];
  4349|        ft.life -= dt;
  4350|        ft.el.style.top = `${parseFloat(ft.el.style.top) - 40 * dt}px`;
  4351|        ft.el.style.opacity = `${Math.max(0, ft.life / 0.9)}`;
  4352|        if (ft.life <= 0) {
  4353|          if (ft.el.parentNode) ft.el.parentNode.removeChild(ft.el);
  4354|          floatTexts.splice(i, 1);
  4355|        }
  4356|      }
  4357|
  4358|      const portalNow = Date.now() * 0.001;
  4359|      exitPortal.rotation.y += 0.01;
  4360|      portalRingOuter.rotation.z += 0.008;
  4361|      portalRingInner.rotation.z -= 0.012;
  4362|      portalCore.material.opacity = 0.12 + (Math.sin(portalNow * 2.8) * 0.08 + 0.08);
  4363|      (portalParticleSystem.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(portalNow * 3.4) * 0.25;
  4364|      portalLabel.lookAt(camera.position);
  4365|      const exitDistance = playerJet.position.distanceTo(exitPortal.position);
  4366|      if (exitDistance < 18) {
  4367|        triggerPortalExit();
  4368|      }
  4369|      window.animateVibeJamPortals?.();
  4370|
  4371|      renderer.render(scene, camera);
  4372|    }
  4373|
  4374|    // ── Pause overlay ─────────────────────────────────────────────────────────
  4375|    const pauseOverlay = document.createElement('div');
  4376|    pauseOverlay.style.cssText = `
  4377|      position:absolute;top:0;left:0;width:100%;height:100%;
  4378|      display:none;align-items:center;justify-content:center;
  4379|      z-index:20;pointer-events:auto;
  4380|      background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);
  4381|    `;
  4382|    pauseOverlay.innerHTML = `
  4383|      <div style="text-align:center;padding:36px 52px;
  4384|        background:rgba(4,8,28,0.92);border-radius:18px;
  4385|        border:1px solid rgba(0,200,255,0.35);
  4386|        box-shadow:0 0 60px rgba(0,100,220,0.25);">
  4387|        <div style="font-size:38px;color:#00ddff;font-weight:900;letter-spacing:6px;
  4388|          text-shadow:0 0 22px #00ddff,0 0 44px #0066ff;margin-bottom:10px;">⏸ PAUSED</div>
  4389|        <div style="font-size:13px;color:rgba(180,210,255,0.8);letter-spacing:2px;">
  4390|          PRESS <span style="color:#00ffcc;font-weight:bold;">P</span> TO RESUME
  4391|        </div>
  4392|      </div>
  4393|    `;
  4394|    hud.appendChild(pauseOverlay);
  4395|
  4396|    let paused = false;
  4397|
  4398|    const syncPauseUI = () => {
  4399|      pauseOverlay.style.display = paused ? 'flex' : 'none';
  4400|      if (pauseButton) pauseButton.textContent = paused ? '▶ PLAY' : '⏸ PAUSE';
  4401|    };
  4402|
  4403|    const togglePause = () => {
  4404|      if (gameState !== 'playing') return;
  4405|      paused = !paused;
  4406|      syncPauseUI();
  4407|      clock.getDelta(); // discard accumulated dt when resuming
  4408|    };
  4409|
  4410|    const pauseButton = document.createElement('button');
  4411|    pauseButton.type = 'button';
  4412|    pauseButton.textContent = '⏸ PAUSE';
  4413|    pauseButton.style.cssText = `
  4414|      position:absolute;
  4415|      top:12px;
  4416|      right:12px;
  4417|      z-index:25;
  4418|      display:${isAndroid ? 'flex' : 'none'};
  4419|      align-items:center;
  4420|      justify-content:center;
  4421|      min-width:110px;
  4422|      height:44px;
  4423|      padding:0 16px;
  4424|      border:none;
  4425|      border-radius:999px;
  4426|      background:rgba(3, 12, 28, 0.82);
  4427|      color:#dff8ff;
  4428|      font-size:14px;
  4429|      font-weight:800;
  4430|      letter-spacing:1px;
  4431|      box-shadow:0 0 24px rgba(0, 180, 255, 0.25);
  4432|      backdrop-filter:blur(8px);
  4433|      -webkit-backdrop-filter:blur(8px);
  4434|      pointer-events:auto;
  4435|      touch-action:manipulation;
  4436|    `;
  4437|    pauseButton.addEventListener('click', () => togglePause());
  4438|    hud.appendChild(pauseButton);
  4439|
  4440|    // ── Space key for start/restart — P key for pause ─────────────────────────
  4441|    function onSpaceStart(e: KeyboardEvent) {
  4442|      if (e.code === 'KeyP' && gameState === 'playing') {
  4443|        togglePause();
  4444|        return;
  4445|      }
  4446|      if (e.code === 'Space') {
  4447|        if (gameState === 'start') { resetGame(); startBgMusic(); }
  4448|        else if (gameState === 'gameover') resetGame();
  4449|      }
  4450|    }
  4451|    window.addEventListener('keydown', onSpaceStart);
  4452|
  4453|    // ── Resize ────────────────────────────────────────────────────────────────
  4454|    function onResize() {
  4455|      if (!mount) return;
  4456|      applyMountViewport();
  4457|      const { width, height } = getViewportSize();
  4458|      renderer.setSize(width, height);
  4459|      camera.aspect = width / height;
  4460|      camera.updateProjectionMatrix();
  4461|      updateDpadRect();
  4462|    }
  4463|    window.addEventListener('resize', onResize);
  4464|    window.visualViewport?.addEventListener('resize', onResize);
  4465|    window.visualViewport?.addEventListener('scroll', onResize);
  4466|
  4467|    animate();
  4468|
  4469|    return () => {
  4470|      cancelAnimationFrame(frameId);
  4471|      window.removeEventListener('keydown', onKeyDown);
  4472|      window.removeEventListener('keyup', onKeyUp);
  4473|      window.removeEventListener('keydown', onSpaceStart);
  4474|      window.removeEventListener('resize', onResize);
  4475|      window.visualViewport?.removeEventListener('resize', onResize);
  4476|      window.visualViewport?.removeEventListener('scroll', onResize);
  4477|      window.removeEventListener('resize', checkOrientation);
  4478|      window.removeEventListener('orientationchange', checkOrientation);
  4479|      mount.removeEventListener('mousemove', onMouseMove);
  4480|      renderer.dispose();
  4481|      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
  4482|      if (mount.contains(hud)) mount.removeChild(hud);
  4483|      if (mount.contains(modal)) mount.removeChild(modal);
  4484|      if (mount.contains(planetToggle)) mount.removeChild(planetToggle);
  4485|      if (mount.contains(planetDrawer)) mount.removeChild(planetDrawer);
  4486|      if (mount.contains(touchLayer)) mount.removeChild(touchLayer);
  4487|      if (document.body.contains(rotateOverlay)) document.body.removeChild(rotateOverlay);
  4488|    };
  4489|  }, []);
  4490|
  4491|  return (
  4492|    <div
  4493|      ref={mountRef}
  4494|      style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#000', display: 'block', position: 'fixed', inset: 0, overscrollBehavior: 'none', touchAction: 'none' }}
  4495|    />
  4496|  );
  4497|}
  4498|