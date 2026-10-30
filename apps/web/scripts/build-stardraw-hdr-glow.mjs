// 하늘의 별 따기 HDR 별빛 그림(docs/36 화면 절). 가운데가 보통 흰색보다 밝은 작은 원형 빛 번짐 하나를 만든다.
//
//   node apps/web/scripts/build-stardraw-hdr-glow.mjs
//
// 형식: AVIF, BT.2020 색역 + PQ 전송 함수(CICP 9/16/9), 10비트, 알파 포함.
// - PQ는 밝기를 절대값(nit)으로 적는다. 보통 흰색(HDR 기준 흰색)은 203 nit(ITU-R BT.2408),
//   가운데는 PEAK_NITS라 HDR 화면에서는 흰색보다 밝게 빛난다. 화면이 낼 수 있는 만큼만 보이고 나머지는 브라우저가 줄인다.
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

/** 그림 한 변(px). 화면에서는 판 너비의 15~20%(휴대폰 2배 화면에서 120px 안팎)로 그린다 */
const SIZE = 160;
/** 가운데 밝기(nit). 203이 보통 흰색이다. 약 5배 */
const PEAK_NITS = 1000;
/** 바깥 빛무리 밝기(nit). 보통 흰색보다 조금 어둡게 둬서 흰색을 넘는 곳은 가운데뿐이다 */
const HALO_NITS = 160;
/** 따뜻한 흰빛(선형 RGB 비율). 금빛 당첨 별과 어울리게 아주 조금 노랗다 */
const TINT = [1, 0.95, 0.85];

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

/** 한 점(가운데에서 거리 r, 0~1)의 [밝기 nit, 알파] */
function profile(r) {
  const core = Math.exp(-((r / 0.11) ** 2));
  const halo = Math.exp(-((r / 0.38) ** 2));
  const edge = 1 - smoothstep(0.78, 1, r);
  // 검은 하늘 위에 겹쳤을 때의 밝기(밝기 × 알파)가 core·halo의 합이 되게 한다
  const alpha = Math.min(1, Math.max(core, 0.9 * halo)) * edge;
  const shown = PEAK_NITS * core + HALO_NITS * halo;
  const nits =
    alpha > 1e-4 ? Math.min(PEAK_NITS, shown / Math.max(alpha, 1e-4)) : 0;
  return [nits, alpha];
}

function rgba16() {
  const stride = 1 + SIZE * 8;
  const raw = Buffer.alloc(stride * SIZE);
  const c = (SIZE - 1) / 2;
  for (let y = 0; y < SIZE; y++) {
    raw[y * stride] = 0; // 줄 필터 없음
    for (let x = 0; x < SIZE; x++) {
      const r = Math.hypot(x - c, y - c) / (SIZE / 2);
      const [nits, alpha] = profile(r);
      const o = y * stride + 1 + x * 8;
      for (let ch = 0; ch < 3; ch++)
        raw.writeUInt16BE(Math.round(pq(nits * TINT[ch]) * 65535), o + ch * 2);
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
