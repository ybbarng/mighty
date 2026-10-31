// 카노푸스 우주국 소개의 실제 성도·제주 하늘 데이터를 한 번 만들어 고정한다(카노푸스 둘레 별과 별자리 선).
// 화면은 이 결과(src/stardraw/canopus-sky.json)만 읽는다. 범위나 밝기 한계를 바꿀 때만 다시 돌린다.
//
//   node apps/web/scripts/build-stardraw-canopus.mjs ~/personal/projects/star.byb.kr
//   pnpm exec biome format --write apps/web/src/stardraw/canopus-sky.json
//
// 출처(star.byb.kr 저장소, 응모판 데이터 build-stardraw-sky.mjs와 같다)
// - data/database/bsc5-short.json: Bright Star Catalogue 5판 요약(Hoffleit & Warren, VizieR V/50, 공개 자료)
// - build/database/vectors-constellations.json: 별자리 선(d3-celestial, Copyright (c) 2015 Olaf Frohn, BSD 3-Clause)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("star.byb.kr 저장소 경로를 넘겨라");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/stardraw/canopus-sky.json");

/** 카노푸스(BSC HR 2326, J2000) */
const CANOPUS = { ra: (6 + 23 / 60 + 57.1 / 3600) * 15, dec: -(52 + 41 / 60 + 45 / 3600) };
/** 카노푸스에서 이만큼(도) 안의 별과 선만 넣는다. 제주에서 남쪽을 본 시야(고도 0~40°, 방위 120~240°)를 다 덮는다 */
const RADIUS = 62;
/** 이보다 어두운 별은 뺀다(맨눈으로 시골 하늘에서 보이는 정도) */
const MAG_LIMIT = 5.0;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
function sep(a, b) {
  const c =
    Math.sin(rad(a.dec)) * Math.sin(rad(b.dec)) +
    Math.cos(rad(a.dec)) * Math.cos(rad(b.dec)) * Math.cos(rad(a.ra - b.ra));
  return deg(Math.acos(Math.min(1, Math.max(-1, c))));
}
const parseRa = (s) => {
  const m = /(\d+)h (\d+)m ([\d.]+)s/.exec(s);
  return (Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 15;
};
const parseDec = (s) => {
  const m = /([+-])(\d+)° (\d+)′ (\d+)″/.exec(s);
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === "-" ? -v : v;
};
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const bsc = JSON.parse(
  readFileSync(join(root, "data/database/bsc5-short.json"), "utf8"),
);
const stars = bsc
  .filter((s) => s.RA && s.Dec && s.V !== undefined && Number(s.V) <= MAG_LIMIT)
  .map((s) => ({
    hr: Number(s.HR),
    ra: round(parseRa(s.RA), 3),
    dec: round(parseDec(s.Dec), 3),
    mag: Number(s.V),
    k: Number(s.K || 6000),
    ...(s.N ? { name: s.N } : {}),
  }))
  .filter((s) => sep(s, CANOPUS) <= RADIUS)
  .sort((a, b) => a.mag - b.mag);

const vectors = JSON.parse(
  readFileSync(join(root, "build/database/vectors-constellations.json"), "utf8"),
);
const lines = vectors
  .map((l) => ({
    con: l.label,
    pts: l.stars.map(([x, y, z]) => {
      const ra = (deg(Math.atan2(y, x)) + 360) % 360;
      return [round(ra, 3), round(deg(Math.asin(z)), 3)];
    }),
  }))
  .filter((l) => l.pts.some(([ra, dec]) => sep({ ra, dec }, CANOPUS) <= RADIUS));

writeFileSync(
  out,
  `${JSON.stringify({
    source:
      "별: Bright Star Catalogue 5판(Hoffleit & Warren, VizieR V/50). 별자리 선: d3-celestial, Copyright (c) 2015 Olaf Frohn, BSD 3-Clause License(https://github.com/ofrohn/d3-celestial).",
    canopus: { ra: round(CANOPUS.ra, 4), dec: round(CANOPUS.dec, 4) },
    stars,
    lines,
  })}\n`,
);
console.log(`별 ${stars.length}개, 선 ${lines.length}개 → ${out}`);
