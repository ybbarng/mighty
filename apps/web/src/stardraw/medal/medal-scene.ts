import * as THREE from "three";

/**
 * 카노푸스 별 훈장 3D 장면(「내 기록」, docs/36 11-23). 「내 기록」에서 훈장을 그릴 때만 늦게 불러(동적 import)
 * 첫 화면 묶음에는 three.js가 실리지 않는다. 모든 모양·결·환경 반사는 코드로 만든다(바깥 이미지 없음).
 *
 * 구조(앞에서 본 순서): 리본(남색 실크 + 금빛 줄) → 고리 → 빛살판(긴 빛살 8 + 짧은 빛살 8, 깎은 면) →
 * 법랑 고리(짙은 남색 유리질, 금빛 글자 "CANOPUS SPACE AGENCY") 양쪽 구슬 테 → 가운데 메달(햇살 무늬 결) 위에
 * 돋을새김한 카노푸스 별. 빛은 스튜디오처럼 꾸민 환경 반사(PMREM)에서 오고, 기울이면 깎은 면마다 빛이 미끄러진다.
 */

export type MedalKind = "gold" | "silver";

interface Palette {
  metal: THREE.ColorRepresentation;
  metalDeep: THREE.ColorRepresentation;
  enamel: THREE.ColorRepresentation;
  ribbon: string;
  ribbonStripe: string;
}

const PALETTES: Record<MedalKind, Palette> = {
  gold: {
    metal: 0xffc766,
    metalDeep: 0xd9963a,
    enamel: 0x0b1f5c,
    ribbon: "#101c45",
    ribbonStripe: "#e3b04b",
  },
  silver: {
    metal: 0xeef2f7,
    metalDeep: 0xb8c1cf,
    enamel: 0x0d1a44,
    ribbon: "#141d3d",
    ribbonStripe: "#d9dee8",
  },
};

export interface MedalSceneOptions {
  kind: MedalKind;
  /** 움직임 줄이기: 한 장만 그리고 멈춘다 */
  still: boolean;
}

export interface MedalScene {
  /** 끌기·마우스·기울기에서 온 기울임(-1~1) */
  setTilt(x: number, y: number): void;
  /** 화면에 보일 때만 움직인다 */
  setActive(active: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------- 결(텍스처)

function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
  color = false,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 가운데 메달의 햇살 무늬(기요셰) 거칠기: 가는 빛줄기가 번갈아 거울·결 면이 된다 */
function sunburstRoughness(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g) => {
    g.fillStyle = "rgb(70,70,70)";
    g.fillRect(0, 0, 1024, 1024);
    g.translate(512, 512);
    const rays = 180;
    for (let i = 0; i < rays; i++) {
      g.rotate((Math.PI * 2) / rays);
      g.fillStyle = i % 2 ? "rgb(18,18,18)" : "rgb(95,95,95)";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(560, -5);
      g.lineTo(560, 5);
      g.closePath();
      g.fill();
    }
    // 가운데로 갈수록 결이 모인다
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 120);
    r.addColorStop(0, "rgba(20,20,20,1)");
    r.addColorStop(1, "rgba(20,20,20,0)");
    g.fillStyle = r;
    g.beginPath();
    g.arc(0, 0, 120, 0, Math.PI * 2);
    g.fill();
  });
}

/** 빛살판의 결: 빛살 방향으로 가는 줄(브러시드) */
function brushedRoughness(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = "rgb(40,40,40)";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * 512;
      const v = 20 + Math.random() * 70;
      g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
      g.lineWidth = Math.random() * 1.2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(512, y + (Math.random() - 0.5) * 2);
      g.stroke();
    }
  });
}

/** 법랑 고리 글자: 색·금속·거칠기 세 장(글자는 금속, 바탕은 유리질 법랑) */
function enamelMaps(p: Palette): {
  map: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
} {
  const W = 2048;
  const H = 128;
  const text = "CANOPUS SPACE AGENCY  ✦  ";
  const enamelCss = `#${new THREE.Color(p.enamel).getHexString()}`;
  const metalCss = `#${new THREE.Color(p.metal).getHexString()}`;
  const drawText = (g: CanvasRenderingContext2D, fill: string) => {
    g.font = "600 64px Georgia, 'Times New Roman', serif";
    g.textBaseline = "middle";
    g.fillStyle = fill;
    const w = g.measureText(text).width;
    // 원을 한 바퀴 돌며 같은 글을 되풀이(이음매가 보이지 않게 정수 번)
    const n = Math.max(1, Math.round(W / w));
    const scale = W / (w * n);
    g.save();
    g.scale(scale, 1);
    for (let i = 0; i < n; i++) g.fillText(text, i * w, H / 2 + 2);
    g.restore();
  };
  const map = canvasTexture(
    W,
    H,
    (g) => {
      g.fillStyle = enamelCss;
      g.fillRect(0, 0, W, H);
      // 법랑 속 깊이: 아래위로 살짝 어둡게
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, "rgba(0,0,0,0.35)");
      lg.addColorStop(0.5, "rgba(80,120,255,0.12)");
      lg.addColorStop(1, "rgba(0,0,0,0.35)");
      g.fillStyle = lg;
      g.fillRect(0, 0, W, H);
      drawText(g, metalCss);
    },
    true,
  );
  const metal = canvasTexture(W, H, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    drawText(g, "#fff");
  });
  const rough = canvasTexture(W, H, (g) => {
    g.fillStyle = "rgb(10,10,10)";
    g.fillRect(0, 0, W, H);
    drawText(g, "rgb(70,70,70)");
  });
  for (const t of [map, metal, rough]) {
    t.wrapS = THREE.RepeatWrapping;
    // 글자 윗부분이 바깥을 보고 시계 방향으로 읽히게
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
  }
  return { map, metal, rough };
}

/** 리본: 남색 실크에 금빛 줄, 가로 골(그로그랭) */
function ribbonMaps(p: Palette): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const map = canvasTexture(
    512,
    512,
    (g) => {
      g.fillStyle = p.ribbon;
      g.fillRect(0, 0, 512, 512);
      g.fillStyle = p.ribbonStripe;
      // 가장자리 두 줄과 가운데 줄
      g.fillRect(24, 0, 18, 512);
      g.fillRect(470, 0, 18, 512);
      g.fillRect(232, 0, 48, 512);
      g.fillStyle = p.ribbon;
      g.fillRect(252, 0, 8, 512);
    },
    true,
  );
  const bump = canvasTexture(512, 512, (g) => {
    for (let y = 0; y < 512; y += 4) {
      g.fillStyle = "rgb(200,200,200)";
      g.fillRect(0, y, 512, 2);
      g.fillStyle = "rgb(60,60,60)";
      g.fillRect(0, y + 2, 512, 2);
    }
  });
  return { map, bump };
}

/** 반짝임 하나(네 갈래 빛) */
function glintTexture(): THREE.CanvasTexture {
  return canvasTexture(
    128,
    128,
    (g) => {
      g.translate(64, 64);
      const core = g.createRadialGradient(0, 0, 0, 0, 0, 22);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(0.3, "rgba(255,245,220,0.7)");
      core.addColorStop(1, "rgba(255,240,200,0)");
      g.fillStyle = core;
      g.beginPath();
      g.arc(0, 0, 22, 0, Math.PI * 2);
      g.fill();
      for (let k = 0; k < 4; k++) {
        g.rotate(Math.PI / 4);
        const len = k % 2 ? 40 : 62;
        const lg = g.createLinearGradient(-len, 0, len, 0);
        lg.addColorStop(0, "rgba(255,250,235,0)");
        lg.addColorStop(0.5, "rgba(255,250,235,0.9)");
        lg.addColorStop(1, "rgba(255,250,235,0)");
        g.fillStyle = lg;
        g.fillRect(-len, -1.2, len * 2, 2.4);
      }
    },
    true,
  );
}

// ---------------------------------------------------------------- 환경(스튜디오 빛)

/**
 * 금속은 비추는 것이 있어야 금속처럼 보인다. 밤하늘 결의 어두운 방에 크고 작은 빛 판을 띄운 장면을 PMREM으로
 * 구워 환경 반사로 쓴다: 위 왼쪽 큰 흰 빛(주광), 오른쪽 따뜻한 빛, 아래 푸른 빛(밤하늘), 가는 띠 빛 몇 줄(반짝임)
 */
function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x1d2647, side: THREE.BackSide }),
  );
  env.add(room);
  const panel = (
    w: number,
    h: number,
    color: number,
    intensity: number,
    pos: [number, number, number],
  ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(14, 10, 0xffffff, 6, [-8, 9, 10]);
  panel(10, 10, 0xfff4e0, 3, [0, 2, 16]);
  panel(4, 9, 0xffd29a, 4, [12, 2, 6]);
  panel(16, 4, 0x4f74ff, 2.2, [0, -12, 4]);
  panel(1.2, 12, 0xffffff, 8, [5, 4, 14]);
  panel(12, 0.8, 0xffffff, 7, [-2, 13, 2]);
  panel(6, 6, 0xffe2b8, 2.5, [-10, -4, 8]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

// ---------------------------------------------------------------- 모양

/** 깎은 빛살 하나: 가운데 등성이가 솟은 두 면(각 면이 평평해 기울이면 빛이 한 번에 번쩍인다) */
function rayGeometry(
  inner: number,
  length: number,
  halfWidth: number,
  ridge: number,
): THREE.BufferGeometry {
  const il = [inner, -halfWidth, 0];
  const ir = [inner, halfWidth, 0];
  const ic = [inner, 0, ridge];
  const tip = [length, 0, ridge * 0.15];
  // 아래 면(뒤에서 보이는 곳)은 생략: 앞에서만 본다
  const pos = [...il, ...tip, ...ic, ...ic, ...tip, ...ir];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // 결 방향: u는 빛살 길이를 따라
  g.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0.5, 0, 0.5, 0, 0.5, 1, 0.5, 0, 1],
      2,
    ),
  );
  g.computeVertexNormals();
  return g;
}

/** 축을 따라 돌린 단면(LatheGeometry)을 화면 쪽(z)으로 눕힌다 */
function lathe(
  points: [number, number][],
  segments = 160,
): THREE.BufferGeometry {
  // 바깥에서 안쪽 순서로 돌려야 면이 화면(+z) 쪽을 본다
  const g = new THREE.LatheGeometry(
    [...points].reverse().map(([r, z]) => new THREE.Vector2(r, z)),
    segments,
  );
  g.rotateX(Math.PI / 2);
  return g;
}

/** 리본: 아래가 V로 접힌 오각형, 살짝 휘어 실크처럼 */
function ribbonGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.42, 2.45);
  s.lineTo(0.42, 2.45);
  s.lineTo(0.42, 1.42);
  s.lineTo(0, 1.2);
  s.lineTo(-0.42, 1.42);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // 가로로 둥글게, 세로로 살짝 앞으로 휘게
    p.setZ(i, -0.05 * Math.cos((x / 0.42) * (Math.PI / 2)) - 0.04 * (y - 1.2));
    uv.setXY(i, (x + 0.42) / 0.84, (y - 1.2) / 1.25);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- 장면

export function createMedalScene(
  canvas: HTMLCanvasElement,
  { kind, still }: MedalSceneOptions,
): MedalScene {
  const p = PALETTES[kind];
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: still,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(26, 1 / 1.45, 0.1, 50);
  camera.position.set(0, 0.62, 8.6);
  camera.lookAt(0, 0.62, 0);

  const rough = brushedRoughness();
  const sun = sunburstRoughness();
  const metal = new THREE.MeshPhysicalMaterial({
    color: p.metal,
    metalness: 1,
    roughness: 0.32,
    roughnessMap: rough,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.25,
  });
  const polished = new THREE.MeshPhysicalMaterial({
    color: p.metal,
    metalness: 1,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4,
  });
  const deep = new THREE.MeshPhysicalMaterial({
    color: p.metalDeep,
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 1.1,
  });
  const guilloche = new THREE.MeshPhysicalMaterial({
    color: p.metal,
    metalness: 1,
    roughness: 1,
    roughnessMap: sun,
    clearcoat: 0.4,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.3,
  });
  const en = enamelMaps(p);
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: en.map,
    metalness: 1,
    metalnessMap: en.metal,
    roughness: 1,
    roughnessMap: en.rough,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.2,
  });
  const rb = ribbonMaps(p);
  const silk = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: rb.map,
    bumpMap: rb.bump,
    bumpScale: 0.25,
    roughness: 0.55,
    sheen: 0.7,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0x3a4f9a),
    side: THREE.DoubleSide,
    envMapIntensity: 0.35,
  });

  const medal = new THREE.Group();
  scene.add(medal);
  const body = new THREE.Group();
  medal.add(body);

  // 빛살판: 여덟 꼭짓점마다 깎은 빛살 다발(가운데가 가장 길고 바깥으로 갈수록 짧다). 빛살이 촘촘해
  // 기울이면 등성이마다 빛이 차례로 번쩍인다(실제 훈장의 "빛살 별")
  const PER = 7;
  const step = (Math.PI * 2) / (8 * PER);
  const rays: Record<string, THREE.BufferGeometry> = {};
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + Math.PI / 2;
    for (let k = -(PER - 1) / 2; k <= (PER - 1) / 2; k++) {
      const off = Math.abs(k);
      const length = 1.06 - off * 0.075;
      const key = String(off);
      // 받침판 가장자리(0.62)에서 이웃 빛살과 맞닿을 만큼 넓게, 등성이는 낮게(면이 앞쪽 빛을 받도록)
      const half = 0.62 * Math.tan(step / 2) * 2.4;
      rays[key] ??= rayGeometry(0.3, length, half, half * 0.38);
      const r = new THREE.Mesh(rays[key], off === 0 ? polished : metal);
      r.rotation.z = a0 + k * step;
      body.add(r);
    }
  }
  // 빛살 뒤 받침판(빛살 사이로 비치는 어두운 금속)
  body.add(
    new THREE.Mesh(
      lathe([
        [0.0, -0.02],
        [0.62, -0.02],
      ]),
      deep,
    ),
  );

  // 법랑 고리(바깥 0.56 ~ 안쪽 0.4, 볼록하게)
  const ring = new THREE.Mesh(
    lathe([
      [0.4, 0.15],
      [0.43, 0.185],
      [0.48, 0.2],
      [0.53, 0.185],
      [0.56, 0.15],
    ]),
    enamel,
  );
  body.add(ring);
  // 고리 받침(금속 테두리)
  body.add(
    new THREE.Mesh(
      lathe([
        [0.36, 0.0],
        [0.36, 0.16],
        [0.4, 0.16],
        [0.56, 0.155],
        [0.6, 0.12],
        [0.6, 0.0],
      ]),
      deep,
    ),
  );
  // 구슬 테 두 줄
  const bead = new THREE.SphereGeometry(0.013, 10, 8);
  for (const [r, n] of [
    [0.585, 110],
    [0.38, 72],
  ] as const) {
    const beads = new THREE.InstancedMesh(bead, polished, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, 0.17);
      beads.setMatrixAt(i, m);
    }
    body.add(beads);
  }
  // 가운데 메달(햇살 무늬, 살짝 볼록)
  const disc = new THREE.Mesh(
    lathe([
      [0.0, 0.205],
      [0.15, 0.2],
      [0.3, 0.185],
      [0.37, 0.17],
    ]),
    guilloche,
  );
  body.add(disc);
  // 돋을새김 카노푸스 별과 가운데 보석
  // 팔마다 가운데 등성이로 깎은 두 면: 기울이면 한쪽 면이 번쩍이고 다른 면이 어두워진다
  const star = new THREE.Group();
  const bigArm = rayGeometry(0, 0.31, 0.07, 0.07);
  const smallArm = rayGeometry(0, 0.16, 0.045, 0.045);
  for (let i = 0; i < 4; i++) {
    const big = new THREE.Mesh(bigArm, polished);
    big.rotation.z = (i / 4) * Math.PI * 2 + Math.PI / 2;
    star.add(big);
    const small = new THREE.Mesh(smallArm, polished);
    small.rotation.z = (i / 4) * Math.PI * 2 + Math.PI / 4 + Math.PI / 2;
    small.position.z = -0.005;
    star.add(small);
  }
  star.position.z = 0.205;
  body.add(star);
  const gem = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.045, 1),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      clearcoat: 1,
      iridescence: 1,
      iridescenceIOR: 1.6,
      envMapIntensity: 2.2,
      flatShading: true,
    }),
  );
  gem.position.z = 0.27;
  gem.scale.set(1, 1, 0.6);
  body.add(gem);

  // 고리와 리본
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.08, 0.022, 16, 40),
    polished,
  );
  hook.position.set(0, 1.12, 0.03);
  medal.add(hook);
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.86, 20),
    polished,
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.21, 0.0);
  medal.add(bar);
  const ribbon = new THREE.Mesh(ribbonGeometry(), silk);
  ribbon.position.z = -0.04;
  medal.add(ribbon);

  // 반짝임: 긴 빛살 끝과 별 끝. 각 점의 면 방향이 주광 쪽으로 반사할 때만 켜진다
  const glintTex = glintTexture();
  const glints: {
    sprite: THREE.Sprite;
    normal: THREE.Vector3;
    phase: number;
  }[] = [];
  const addGlint = (x: number, y: number, z: number, n: THREE.Vector3) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glintTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    sp.position.set(x, y, z);
    sp.scale.setScalar(0.32);
    body.add(sp);
    glints.push({
      sprite: sp,
      normal: n.normalize(),
      phase: Math.random() * 6,
    });
  };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    addGlint(
      Math.cos(a) * 1.02,
      Math.sin(a) * 1.02,
      0.08,
      new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 1),
    );
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 2;
    addGlint(
      Math.cos(a) * 0.3,
      Math.sin(a) * 0.3,
      0.24,
      new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 1),
    );
  }
  addGlint(0, 0, 0.3, new THREE.Vector3(0, 0, 1));

  // ---------------------------------------------------------- 움직임
  const target = { x: 0, y: 0 };
  const now = { x: 0, y: 0 };
  let active = false;
  let raf = 0;
  const start = performance.now();
  const keyLight = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();
  const tmpN = new THREE.Vector3();
  const view = new THREE.Vector3(0, 0, 1);
  const half = new THREE.Vector3();

  const frame = (t: number) => {
    const s = (t - start) / 1000;
    const swayX = still ? 0 : Math.sin(s * 0.5) * 0.05;
    const swayY = still ? 0 : Math.sin(s * 0.37) * 0.16;
    now.x += (target.x - now.x) * 0.08;
    now.y += (target.y - now.y) * 0.08;
    medal.rotation.x = -0.08 + swayX + now.x * 0.5;
    medal.rotation.y = 0.18 + swayY + now.y * 0.7;
    medal.updateMatrixWorld();
    half.copy(keyLight).add(view).normalize();
    for (const gl of glints) {
      tmpN.copy(gl.normal).transformDirection(body.matrixWorld);
      const d = Math.max(0, tmpN.dot(half));
      const twinkle = still ? 1 : 0.75 + 0.25 * Math.sin(s * 3 + gl.phase);
      const o = d ** 40 * twinkle;
      (gl.sprite.material as THREE.SpriteMaterial).opacity = Math.min(
        1,
        o * 1.6,
      );
      gl.sprite.scale.setScalar(0.18 + 0.28 * o);
    }
    renderer.render(scene, camera);
  };

  const loop = (t: number) => {
    frame(t);
    if (active && !still) raf = requestAnimationFrame(loop);
  };

  return {
    setTilt(x, y) {
      target.x = Math.max(-1, Math.min(1, x));
      target.y = Math.max(-1, Math.min(1, y));
      if (still) {
        now.x = target.x;
        now.y = target.y;
        frame(performance.now());
      }
    },
    setActive(a) {
      if (a === active) return;
      active = a;
      cancelAnimationFrame(raf);
      if (still) frame(performance.now());
      else if (active) raf = requestAnimationFrame(loop);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      frame(performance.now());
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(x))
            if (v instanceof THREE.Texture) v.dispose();
          x.dispose();
        }
      });
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
