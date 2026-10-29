// 하늘의 별 따기 응모판(네모 하늘) 데이터를 한 번 만들어 고정한다(docs/36 11-3).
// 화면은 이 결과(src/stardraw/sky-data.json)만 읽는다. 별 목록이나 펴는 규칙을 바꿀 때만 다시 돌린다.
//
//   node apps/web/scripts/build-stardraw-sky.mjs ~/personal/projects/star.byb.kr
//   pnpm exec biome format --write apps/web/src/stardraw/sky-data.json
//
// 출처(star.byb.kr 저장소)
// - data/database/bsc5-short.json: Bright Star Catalogue 5판 요약(VizieR V/50)
// - src/search/utils/starNames.ts: 별의 한글 이름
// - build/database/vectors-constellations.json: 별자리 선(d3-celestial, BSD)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("star.byb.kr 저장소 경로를 넘겨라");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/stardraw/sky-data.json");
/** 별마다 한 줄 문구(번호 → 문장). 응모 정보 칸, 영수증, 설명 페이지에 쓴다 */
const facts = JSON.parse(
  readFileSync(join(here, "stardraw-star-facts.json"), "utf8"),
);

/** 별자리 약어 → 한글 이름(선 데이터의 이름과 같게) */
const CON = {
  CMa: "큰개자리",
  Boo: "목동자리",
  Lyr: "거문고자리",
  Aur: "마차부자리",
  Ori: "오리온자리",
  CMi: "작은개자리",
  Aql: "독수리자리",
  Tau: "황소자리",
  Sco: "전갈자리",
  Vir: "처녀자리",
  Gem: "쌍둥이자리",
  PsA: "남쪽물고기자리",
  Cyg: "백조자리",
  Leo: "사자자리",
  Sgr: "궁수자리",
  UMa: "큰곰자리",
  Per: "페르세우스자리",
  Hya: "바다뱀자리",
  Ari: "양자리",
  UMi: "작은곰자리",
  Cet: "고래자리",
  And: "안드로메다자리",
  Cen: "켄타우루스자리",
  Oph: "뱀주인자리",
};

// 1. 서울(북위 37.6°)에서 충분히 뜨는(적위 -45° 위) 가장 밝은 별 45개. 밝은 순서가 번호다.
//    이름·바이어 부호가 없는 별(폭발 밝기로 적힌 신성 HR 5958)은 뺀다
const catalog = JSON.parse(
  readFileSync(join(root, "data/database/bsc5-short.json"), "utf8"),
);
const namesSrc = readFileSync(
  join(root, "src/search/utils/starNames.ts"),
  "utf8",
);
const korean = {};
for (const m of namesSrc.matchAll(
  /^\s*(?:"([^"]+)"|([A-Za-z]+)):\s*"([^"]+)"/gm,
)) {
  korean[m[1] ?? m[2]] = m[3];
}
const sexagesimal = (text) => {
  const [a, b, c] = text.match(/[\d.]+/g).map(Number);
  return a + b / 60 + c / 3600;
};
const stars = catalog
  .filter((s) => s.V && s.RA && s.Dec && (s.B || s.N))
  .map((s) => ({
    name: s.N ?? null,
    ko: s.N ? (korean[s.N] ?? null) : null,
    con: s.C ?? null,
    bayer: s.B ?? null,
    ra: sexagesimal(s.RA) * 15,
    dec: (s.Dec.trim().startsWith("-") ? -1 : 1) * sexagesimal(s.Dec),
    mag: Number(s.V),
    k: Number(s.K) || 6000,
  }))
  .filter((s) => s.dec > -45)
  .sort((a, b) => a.mag - b.mag)
  .slice(0, 45)
  .map((s, i) => ({ n: i + 1, ...s }));
for (const s of stars) {
  if (!s.ko || !CON[s.con] || !facts[String(s.n)])
    throw new Error(`이름이나 문구가 없다: ${JSON.stringify(s)}`);
}

// 2. 네모 하늘: 적경을 가로(동쪽이 왼쪽, 올려다본 하늘), 적위를 세로로 편다.
//    별이 가장 듬성한 적경에서 가른다. 가로·세로 모두 실제 비율과 차례 순위를 섞어 몰린 곳은 넓히고 빈 곳은 채운다
const byRa = [...stars].sort((a, b) => a.ra - b.ra);
let cut = 0;
let gap = -1;
for (let i = 0; i < byRa.length; i++) {
  const a = byRa[i].ra;
  const b = i + 1 < byRa.length ? byRa[i + 1].ra : byRa[0].ra + 360;
  if (b - a > gap) {
    gap = b - a;
    cut = (a + gap / 2) % 360;
  }
}
const u = (ra) => 1 - ((((ra - cut) % 360) + 360) % 360) / 360;
const rankOf = (key) => {
  const r = {};
  [...stars]
    .sort((a, b) => key(a) - key(b))
    .forEach((s, i) => {
      r[s.n] = (i + 0.5) / stars.length;
    });
  return r;
};
const rx = rankOf((s) => u(s.ra));
const ry = rankOf((s) => -s.dec);
const anchor = {};
const pos = {};
for (const s of stars) {
  const x = 0.45 * u(s.ra) + 0.55 * rx[s.n];
  const y = 0.5 * ((90 - s.dec) / 135) + 0.5 * ry[s.n];
  anchor[s.n] = { x: 0.07 + x * 0.86, y: 0.07 + y * 0.84 };
  pos[s.n] = { ...anchor[s.n] };
}
const ids = stars.map((s) => s.n);
// 고르게 퍼뜨리기: 먼 거리까지 약하게 밀어내고(빈 곳을 채움), 제자리로 약하게 당기고(모양 유지), 가장자리에서 밀어낸다
const R = 0.2;
const M = 0.06;
for (let it = 0; it < 400; it++) {
  const f = {};
  for (const n of ids) f[n] = { x: 0, y: 0 };
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos[ids[i]];
      const q = pos[ids[j]];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      if (d < R) {
        const k = ((R - d) / R) ** 2 * 0.006;
        f[ids[i]].x -= (dx / d) * k;
        f[ids[i]].y -= (dy / d) * k;
        f[ids[j]].x += (dx / d) * k;
        f[ids[j]].y += (dy / d) * k;
      }
    }
  for (const n of ids) {
    const p = pos[n];
    const a = anchor[n];
    f[n].x += (a.x - p.x) * 0.012;
    f[n].y += (a.y - p.y) * 0.012;
    if (p.x < M) f[n].x += (M - p.x) * 0.2;
    if (p.x > 1 - M) f[n].x -= (p.x - (1 - M)) * 0.2;
    if (p.y < M) f[n].y += (M - p.y) * 0.2;
    if (p.y > 1 - M) f[n].y -= (p.y - (1 - M)) * 0.2;
    p.x += Math.max(-0.01, Math.min(0.01, f[n].x));
    p.y += Math.max(-0.01, Math.min(0.01, f[n].y));
  }
}
// 너무 가까운 쌍을 떼어 손가락 틈을 둔다
for (let it = 0; it < 60; it++) {
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos[ids[i]];
      const q = pos[ids[j]];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      if (d < 0.09) {
        const push = (0.09 - d) / 2;
        p.x -= (dx / d) * push;
        p.y -= (dy / d) * push;
        q.x += (dx / d) * push;
        q.y += (dy / d) * push;
      }
    }
  for (const n of ids) {
    pos[n].x = Math.min(0.95, Math.max(0.05, pos[n].x));
    pos[n].y = Math.min(0.92, Math.max(0.05, pos[n].y));
  }
}

// 3. 별자리 선: 어두운 별은 가까운 밝은 별이 움직인 만큼(거리 제곱에 반비례해 섞어) 따라 휜다.
//    네모 하늘을 가른 곳을 건너거나 남쪽 끝(-47°) 아래로 내려가는 곳에서 선을 끊는다
const lin = (ra, dec) => ({
  x: 0.07 + 0.86 * u(ra),
  y: 0.07 + 0.84 * ((90 - dec) / 135),
});
const moved = stars.map((s) => {
  const l = lin(s.ra, s.dec);
  return { l, dx: pos[s.n].x - l.x, dy: pos[s.n].y - l.y };
});
const warp = (ra, dec) => {
  const l = lin(ra, dec);
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const m of moved) {
    const w = 1 / ((m.l.x - l.x) ** 2 + (m.l.y - l.y) ** 2 + 0.0006);
    sw += w;
    sx += w * m.dx;
    sy += w * m.dy;
  }
  return [l.x + sx / sw, l.y + sy / sw];
};
const toRaDec = ([x, y, z]) => {
  const dec = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
  const ra = (Math.atan2(y, x) * 180) / Math.PI;
  return [ra < 0 ? ra + 360 : ra, dec];
};
const lineSrc = JSON.parse(
  readFileSync(
    join(root, "build/database/vectors-constellations.json"),
    "utf8",
  ),
);
const lines = [];
for (const c of lineSrc) {
  let run = [];
  let prevU = null;
  const flush = () => {
    if (run.length >= 2) lines.push({ con: c.label, pts: run });
    run = [];
  };
  for (const v of c.stars) {
    const [ra, dec] = toRaDec(v);
    if (dec <= -47) {
      flush();
      prevU = null;
      continue;
    }
    if (prevU !== null && Math.abs(u(ra) - prevU) > 0.5) flush();
    run.push(warp(ra, dec).map(round));
    prevU = u(ra);
  }
  flush();
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}

const data = {
  stars: stars.map((s) => ({
    n: s.n,
    ko: s.ko,
    name: s.name,
    con: CON[s.con],
    bayer: s.bayer,
    ra: Math.round(s.ra * 100) / 100,
    dec: Math.round(s.dec * 100) / 100,
    mag: s.mag,
    k: s.k,
    x: round(pos[s.n].x),
    y: round(pos[s.n].y),
    fact: facts[String(s.n)],
  })),
  lines,
};
writeFileSync(out, `${JSON.stringify(data)}\n`);
console.log(`별 ${data.stars.length}개, 별자리 선 ${lines.length}줄 → ${out}`);
