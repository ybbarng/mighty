// 하늘의 별 따기 HDR 별빛 그림(docs/36 화면 절). 캔버스의 별과 같은 모양(작은 원판 + 가는 십자 빛줄기 + 흐린 빛 번짐)을
// 보통 흰색보다 밝게 그린 그림 하나를 만든다.
//
//   node apps/web/scripts/build-stardraw-hdr-glow.mjs
//
// 형식: AVIF, BT.2020 색역 + PQ 전송 함수(CICP 9/16/9), 10비트, 알파 포함.
// - PQ는 밝기를 절대값(nit)으로 적는다. 보통 흰색(HDR 기준 흰색)은 203 nit(ITU-R BT.2408).
// - 색은 모든 화소를 NITS(흰색의 약 5배)로 두고 모양은 알파로만 만든다. 빛 번짐을 흰색보다 낮은 nit로 두면
//   아래 캔버스의 별빛을 가려 회색 테두리가 된다(star.byb.kr 시험, 2026-10-30). 알파로 겹치면 늘 아래보다 밝다.
// - 밝은 원판은 캔버스의 켜진 별 가운데(작은 점 + 흰빛 번짐)와 같은 크기로 둔다. 몇 px짜리 핵만 밝으면 눈은 넓이까지 합쳐
//   밝기를 느껴서 오히려 SDR보다 어둡게 보였다(star.byb.kr 시험).
// - 화면에서는 판 너비의 18%로 그린다(SkyBoard GLOW_SIZE). 판 360px이면 그림 반지름 1이 32.4 CSS px다.
// - 게인 맵 JPEG는 Safari 26.0에서 position·transform이 걸린 img를 SDR로 그리는 버그가 있었다(WebKit 301398).
//   별빛은 하늘 위에 절대 위치로 겹치므로 게인 맵 대신 PQ를 쓴다. Chrome(macOS)과 Safari 26은 PQ AVIF를 HDR로 보여 준다.
//
// 도구: libavif의 avifenc(Homebrew 공식 포뮬러 `libavif`). 16비트 PNG는 이 스크립트가 직접 쓴다(의존성 없음).
// avifenc는 PNG 값을 바꾸지 않고 --cicp로 "이 값은 BT.2020 PQ"라고 표시만 한다.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

/** 그림 한 변(px). 가는 빛줄기가 2·3배 화면에서도 뭉개지지 않게 */
const SIZE = 256;
/** 모든 화소의 밝기(nit). 203이 보통 흰색이다. 약 5배 */
const NITS = 1000;
/** 따뜻한 흰빛(선형 RGB 비율). 금빛 당첨 별과 어울리게 아주 조금 노랗다 */
const TINT = [1, 0.95, 0.85];

/** 모양(그림 반지름 1 기준). 판 360px에서 1 = 32.4 CSS px */
/** 밝은 원판 반지름(약 2.2 CSS px, 캔버스의 켜진 별 가운데와 같다) */
const DISC = 0.068;
/** 흐린 빛 번짐: 가우스 폭과 멱함수 꼬리 */
const GLOW_SIGMA = 0.14;
const GLOW_A = 0.4;
const TAIL_R = 0.1;
const TAIL_A = 0.1;
/** 십자 빛줄기: 가로 길이(세로는 1.15배, 캔버스와 같다), 반폭, 세기 */
const SPIKE_LEN = 0.62;
const SPIKE_HALF = 0.016;
const SPIKE_A = 0.85;

const OUT = fileURLToPath(
  new URL("../public/stardraw/star-glow-hdr.avif", import.meta.url),
);

/** SMPTE ST 2084(PQ): 밝기(nit) → 0~1 신호 */
function pq(nits) {
  const m1 = 2610 / 16384;
  const m2 = (2523 / 4096) * 128;
  const c1 = 3424 / 4096;
  const c2 = (2413 / 4096) * 32;
  const c3 = (2392 / 4096) * 32;
  const y = Math.max(0, nits) / 10000;
  const p = y ** m1;
  return ((c1 + c2 * p) / (1 + c3 * p)) ** m2;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 한 갈래 빛줄기의 알파(along: 줄기 방향 거리, perp: 옆 거리) */
function spike(along, perp, len) {
  if (along < 0 || along > len) return 0;
  const fade = (1 - along / len) ** 2;
  return SPIKE_A * fade * Math.exp(-((perp / SPIKE_HALF) ** 2));
}

/** 한 점(가운데에서 dx, dy, 그림 반지름 1 기준)의 알파. 색은 늘 NITS다 */
function alphaAt(dx, dy) {
  const r = Math.hypot(dx, dy);
  const disc = 1 - smoothstep(DISC * 0.7, DISC * 1.25, r);
  const glow =
    GLOW_A * Math.exp(-((r / GLOW_SIGMA) ** 2)) +
    TAIL_A / (1 + (r / TAIL_R) ** 2);
  const spikes = Math.max(
    spike(Math.abs(dx), dy, SPIKE_LEN),
    spike(Math.abs(dy), dx, SPIKE_LEN * 1.15),
  );
  // 겹친 빛은 "덮어 칠하기"로 합친다. 가장자리는 그림 끝에서 0이 되게
  const a = 1 - (1 - disc) * (1 - glow) * (1 - spikes);
  return a * (1 - smoothstep(0.85, 1, r));
}

function rgba16() {
  const stride = 1 + SIZE * 8;
  const raw = Buffer.alloc(stride * SIZE);
  const c = (SIZE - 1) / 2;
  const signal = TINT.map((t) => Math.round(pq(NITS * t) * 65535));
  for (let y = 0; y < SIZE; y++) {
    raw[y * stride] = 0; // 줄 필터 없음
    for (let x = 0; x < SIZE; x++) {
      const alpha = alphaAt((x - c) / (SIZE / 2), (y - c) / (SIZE / 2));
      const o = y * stride + 1 + x * 8;
      for (let ch = 0; ch < 3; ch++) raw.writeUInt16BE(signal[ch], o + ch * 2);
      raw.writeUInt16BE(Math.round(alpha * 65535), o + 6);
    }
  }
  return raw;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png16() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 16; // 비트 깊이
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rgba16(), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  const dir = mkdtempSync(join(tmpdir(), "stardraw-hdr-"));
  try {
    const png = join(dir, "glow.png");
    writeFileSync(png, png16());
    execFileSync(
      "avifenc",
      [
        "--cicp",
        "9/16/9", // BT.2020 · PQ · BT.2020 비상수 휘도
        "--range",
        "full",
        "--depth",
        "10",
        "--yuv",
        "444",
        "--qcolor",
        "92",
        "--qalpha",
        "92",
        "--speed",
        "0",
        "--jobs",
        "1",
        "--ignore-icc",
        png,
        OUT,
      ],
      { stdio: "inherit" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`썼다: ${OUT}`);
}

main();
