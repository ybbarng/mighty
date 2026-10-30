/**
 * 등록증 뒷면의 열쇠 그림(docs/36 11-9). 공개 열쇠 바이트에서 그대로 정해지는 별 무늬라
 * 같은 열쇠면 어느 기기에서든 같은 그림이다. 꾸밈일 뿐 무엇을 판정하는 데 쓰지 않는다.
 * 원시 P-256 공개 열쇠(65바이트, 04 ‖ x ‖ y)의 x·y는 고르게 퍼진 값이라 해시 없이 바로 쓴다.
 */

/** 그림 판(가로:세로 = 카드 비율 1.586) */
export const ART_W = 158.6;
export const ART_H = 100;

export type ArtStar = { x: number; y: number; r: number; o: number };

export type KeyArt = {
  stars: ArtStar[];
  /** 별자리 선: 별 번호 둘 */
  lines: [number, number][];
  /** 무늬 색(0~359) */
  hue: number;
};

/** 별 수 */
const STARS = 20;
/** 선으로 잇는 밝은 별 수 */
const LINKED = 7;

export function keyArt(pub: Uint8Array): KeyArt {
  if (pub.length < 65) throw new Error("공개 열쇠는 65바이트여야 한다");
  const b = (i: number) => pub[1 + (i % 64)] as number;
  const stars: ArtStar[] = [];
  for (let i = 0; i < STARS; i++) {
    stars.push({
      x: 8 + (b(2 * i) / 255) * (ART_W - 16),
      y: 8 + (b(2 * i + 1) / 255) * (ART_H - 16),
      r:
        i < LINKED ? 1.6 + (b(40 + i) % 4) * 0.35 : 0.5 + (b(40 + i) % 4) * 0.2,
      o: i < LINKED ? 1 : 0.45 + (b(50 + i) % 5) * 0.1,
    });
  }
  // 밝은 별을 왼쪽에서 오른쪽 차례로 이어 별자리 하나를 만든다
  const order = [...Array(LINKED).keys()].sort(
    (p, q) => (stars[p] as ArtStar).x - (stars[q] as ArtStar).x,
  );
  const lines: [number, number][] = [];
  for (let k = 1; k < order.length; k++)
    lines.push([order[k - 1] as number, order[k] as number]);
  return { stars, lines, hue: Math.round((b(63) / 255) * 359) };
}
