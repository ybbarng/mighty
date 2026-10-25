import type { Suit } from "@mighty/engine";

/**
 * 무늬 표기 방식. 문구 함수(terms.ts)는 무늬를 기호(♠◆♥♣)로 적고, 화면(`SuitText`)이 이 설정에 따라 바꿔 그린다.
 * 작은 글씨에서 ♠와 ♣, ♥와 ◆가 헷갈려서 기본은 ◆·♣를 테두리로 그린 그림이다.
 */
export type SuitStyle = "outline" | "filled" | "symbol" | "name" | "initial";

export const SUIT_STYLES: readonly {
  value: SuitStyle;
  label: string;
  description: string;
}[] = [
  {
    value: "outline",
    label: "그림",
    description:
      "♠·♥는 채우고 ◆·♣는 테두리만. 색이 같은 무늬끼리 바로 구별된다",
  },
  {
    value: "filled",
    label: "채운 그림",
    description: "카드에 그려진 모양 그대로",
  },
  {
    value: "symbol",
    label: "기호",
    description: "기기 글꼴의 무늬 글자. 그림처럼 ◆·♣는 속이 빈 글자(♢·♧)",
  },
  { value: "name", label: "이름", description: "스페이드 13, 클로버 A" },
  { value: "initial", label: "첫 글자", description: "스13, 클A" },
];

export const SUIT_GLYPH: Record<Suit, string> = {
  S: "♠",
  D: "◆",
  H: "♥",
  C: "♣",
};

const GLYPH_SUIT: Record<string, Suit> = {
  "♠": "S",
  "◆": "D",
  "♥": "H",
  "♣": "C",
};

export const SUIT_WORD: Record<Suit, string> = {
  S: "스페이드",
  D: "다이아몬드",
  H: "하트",
  C: "클로버",
};

const SUIT_INITIAL: Record<Suit, string> = {
  S: "스",
  D: "다",
  H: "하",
  C: "클",
};

export type SuitPiece = string | { suit: Suit };

/** 문구를 글자 조각과 무늬 조각으로 나눈다 */
export function splitSuits(text: string): SuitPiece[] {
  const pieces: SuitPiece[] = [];
  let buffer = "";
  for (const ch of text) {
    const suit = GLYPH_SUIT[ch];
    if (suit) {
      if (buffer) pieces.push(buffer);
      buffer = "";
      pieces.push({ suit });
    } else buffer += ch;
  }
  if (buffer) pieces.push(buffer);
  return pieces;
}

/** 이름 뒤에 숫자·영문이 바로 붙으면 띄운다: "♠13" → "스페이드 13" */
function needsSpace(next: SuitPiece | undefined): boolean {
  return typeof next === "string" && /^[0-9A-Za-z]/.test(next);
}

/** 기호 방식의 글자. 그림 방식과 같이 ◆·♣는 속이 빈 글자로 써서 ♠·♥와 구별한다 */
const SUIT_SYMBOL_TEXT: Record<Suit, string> = {
  S: "♠",
  D: "♢",
  H: "♥",
  C: "♧",
};

/** 무늬 하나를 글자로(이름·첫 글자·기호). 그림 방식은 문구에 쓰는 기호(♠◆♥♣)로 둔다 */
export function suitWord(suit: Suit, style: SuitStyle): string {
  if (style === "name") return SUIT_WORD[suit];
  if (style === "initial") return SUIT_INITIAL[suit];
  if (style === "symbol") return SUIT_SYMBOL_TEXT[suit];
  return SUIT_GLYPH[suit];
}

/**
 * 문구 속 무늬 기호를 글자 방식으로 바꾼다. 그림을 못 넣는 곳(툴팁, 알림 글)과 글자 방식 화면에 쓴다.
 * 그림 방식이면 기호를 그대로 둔다
 */
export function suitText(text: string, style: SuitStyle): string {
  const pieces = splitSuits(text);
  return pieces
    .map((piece, i) => {
      if (typeof piece === "string") return piece;
      const word = suitWord(piece.suit, style);
      return style === "name" && needsSpace(pieces[i + 1]) ? `${word} ` : word;
    })
    .join("");
}
