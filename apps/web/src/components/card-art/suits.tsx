import type { Suit } from "@mighty/engine";

/**
 * 무늬 모양. 글꼴의 ♠♥◆♣ 글자는 기기마다 모양이 다르고 이모지로 바뀌기도 해서 경로로 그린다.
 * 모두 100×100 상자 안에 들어간다.
 */
export const SUIT_PATHS: Record<Suit, string> = {
  H: "M50 92 C22 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 78 70 50 92 Z",
  D: "M50 2 C60 20 74 36 92 50 C74 64 60 80 50 98 C40 80 26 64 8 50 C26 36 40 20 50 2 Z",
  S: "M50 2 C40 20 2 40 2 62 C2 76 13 86 27 86 C36 86 43 82 47 75 C46 86 40 93 30 98 L70 98 C60 93 54 86 53 75 C57 82 64 86 73 86 C87 86 98 76 98 62 C98 40 60 20 50 2 Z",
  C: "M50 4 C37 4 28 14 28 27 C28 34 31 40 35 44 C32 42 28 41 24 41 C11 41 2 51 2 63 C2 76 12 85 24 85 C34 85 42 79 46 71 C45 84 40 92 30 98 L70 98 C60 92 55 84 54 71 C58 79 66 85 76 85 C88 85 98 76 98 63 C98 51 89 41 76 41 C72 41 68 42 65 44 C69 40 72 34 72 27 C72 14 63 4 50 4 Z",
};

/**
 * 테두리만 그리는 ♣(무늬 표기 "그림"). 채운 모양을 그대로 테두리로 그리면 좁은 줄기 안쪽이
 * 따로 떨어져 아래가 복잡해 보여서, 잎 세 개는 한 바깥선으로 긋고 줄기는 작게 채운다
 */
export const HOLLOW_CLUB = {
  lobes:
    "M30.24 36.12 A21 21 0 1 1 69.76 36.12 A21 21 0 1 1 61.5 75.19 L38.5 75.19 A21 21 0 1 1 30.24 36.12 Z",
  stem: "M50 70 C51 84 55 92 64 97 L36 97 C45 92 49 84 50 70 Z",
};

export function SuitShape({
  suit,
  x,
  y,
  size,
  flip = false,
  fill,
}: {
  suit: Suit;
  /** 가운데 좌표 */
  x: number;
  y: number;
  size: number;
  flip?: boolean;
  fill: string;
}) {
  const s = size / 100;
  const rotate = flip ? ` rotate(180 50 50)` : "";
  return (
    <path
      d={SUIT_PATHS[suit]}
      fill={fill}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})${rotate}`}
    />
  );
}
