// 장기 아이콘에 쓸 楚·漢 글자 모양을 장기판과 같은 부분 글꼴에서 뽑아 경로 상수로 고정한다.
// 아이콘(next/og)은 글꼴로 글자를 쓰지 못해서, 글자 윤곽을 SVG 경로로 넣는다(화투 아이콘의 光과 같은 방식).
// 아이콘은 이 결과(src/janggi/icon-glyphs.ts)만 읽는다. 글꼴이나 글자를 바꿀 때만 다시 돌린다.
//
//   node apps/web/scripts/build-janggi-glyphs.mjs
//   pnpm exec biome format --write apps/web/src/janggi/icon-glyphs.ts
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";

const here = dirname(fileURLToPath(import.meta.url));
const fonts = join(here, "../public/fonts");
const out = join(here, "../src/janggi/icon-glyphs.ts");

/** 글자 하나의 윤곽을 "가운데가 0, 글자 칸 높이(1em)가 1, y가 아래로 커지는" 좌표로 바꾼다 */
function glyph(file, char) {
  const font = fontkit.openSync(join(fonts, file));
  const [g] = font.glyphsForString(char);
  if (!g || g.id === 0) throw new Error(`${file}에 ${char}가 없다`);
  const em = font.unitsPerEm;
  const box = g.bbox;
  // 글자 윤곽의 가운데를 원점으로 옮긴다(장기판 글자처럼 알 한가운데에 놓으려고)
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const round = (v) => Math.round(v * 10000) / 10000;
  const path = g.path
    .scale(1 / em, -1 / em)
    .translate(round(-cx / em), round(cy / em))
    .toSVG()
    .replace(/-?\d+\.\d+/g, (n) => String(round(Number(n))));
  return {
    path,
    /** 윤곽의 너비·높이(em 비율) */
    width: round((box.maxX - box.minX) / em),
    height: round((box.maxY - box.minY) / em),
  };
}

const cho = glyph("janggi-cho.woff2", "楚");
const han = glyph("janggi-han.woff2", "漢");

writeFileSync(
  out,
  `// 자동 생성: apps/web/scripts/build-janggi-glyphs.mjs. 손으로 고치지 말고 스크립트를 다시 돌린다.
// 장기판과 같은 부분 글꼴의 윤곽이다: 초 楚는 Liu Jian Mao Cao(초서), 한 漢은 LXGW WenKai TC Bold(해서), 둘 다 OFL.
// 좌표는 가운데가 0, 글자 칸 높이(1em)가 1, y가 아래로 커진다.

/** 초 楚(초서) */
export const CHO_GLYPH = ${JSON.stringify(cho)} as const;

/** 한 漢(해서) */
export const HAN_GLYPH = ${JSON.stringify(han)} as const;
`,
);
console.log(
  `楚 ${cho.width}×${cho.height}, 漢 ${han.width}×${han.height} → ${out}`,
);
