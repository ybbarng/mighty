import type { Suit } from "@mighty/engine";

export type BackPattern = "diamond" | "stripe" | "dots" | "spades";

/** 카드 뒷면. 무늬와 색, 가운데 문장 */
export interface CardBack {
  base: string;
  stripe: string;
  accent: string;
  pattern?: BackPattern;
}

/** 고를 수 있는 뒷면. 원작의 "카드 뒷그림" 고르기 */
export const CARD_BACKS: readonly (CardBack & { id: string; name: string })[] =
  [
    {
      id: "navy",
      name: "남색",
      base: "#1d3557",
      stripe: "#24426b",
      accent: "#e9c46a",
    },
    {
      id: "wine",
      name: "자주",
      base: "#5a1426",
      stripe: "#6d1a30",
      accent: "#f0c987",
      pattern: "diamond",
    },
    {
      id: "felt",
      name: "초록",
      base: "#0f4d33",
      stripe: "#13603f",
      accent: "#e8d9a8",
      pattern: "stripe",
    },
    {
      id: "night",
      name: "검정",
      base: "#15171c",
      stripe: "#2a2e37",
      accent: "#d4af37",
      pattern: "dots",
    },
    {
      id: "spade",
      name: "스페이드",
      base: "#f4ede0",
      stripe: "#d9cdb4",
      accent: "#1c1f24",
      pattern: "spades",
    },
  ];

/** 카드 디자인 테마. 그림을 그리는 코드는 같고 색과 장식만 바꾼다 */
export interface CardTheme {
  id: string;
  name: string;
  suitColor: Record<Suit, string>;
  /** 그림 카드(J·Q·K) 안쪽 바탕 */
  faceTint: Record<Suit, string>;
  paper: string;
  edge: string;
  back: CardBack;
  joker: { field: string; disc: string; star: string };
  /** 모서리 숫자·무늬를 크게. 손패가 겹쳐 왼쪽 띠만 보일 때 읽기 쉽다 */
  largeIndex?: boolean;
  /**
   * 그림 카드(J·Q·K) 그리는 방법. 없으면 큰 글자와 장식.
   * `court`는 직접 그린 전통풍 인물, `traditional`은 공개 저작물 전통 그림의 인물만 떼어 쓴다.
   */
  faces?: { kind: "court" } | { kind: "traditional"; bold?: boolean };
  /** 모서리 숫자 글씨 폰트(CSS font-family). 없으면 시스템 고딕 */
  indexFont?: string;
}

const RED = "#d42a2a";
const BLACK = "#1c1f24";

export const CLASSIC: CardTheme = {
  id: "classic",
  name: "기본",
  suitColor: { S: BLACK, C: BLACK, H: RED, D: RED },
  faceTint: { S: "#eef1f6", C: "#eef1f6", H: "#fdecec", D: "#fdecec" },
  paper: "#ffffff",
  edge: "#d6d3d1",
  back: { base: "#1d3557", stripe: "#24426b", accent: "#e9c46a" },
  joker: { field: "#fbf6ff", disc: "#5b2a86", star: "#f2b705" },
};

/** 무늬마다 색이 달라 작은 화면에서도 무늬를 빨리 구분한다 */
export const FOUR_COLOR: CardTheme = {
  ...CLASSIC,
  id: "four-color",
  name: "4색",
  suitColor: { S: BLACK, H: RED, D: "#1d5fd1", C: "#14823b" },
  faceTint: { S: "#eef1f6", H: "#fdecec", D: "#e8f0fd", C: "#e7f6ec" },
};

/** 모서리 글자를 키운 4색. 작은 화면이나 눈이 침침할 때 */
export const LARGE_PRINT: CardTheme = {
  ...FOUR_COLOR,
  id: "large-print",
  name: "큰 글자",
  largeIndex: true,
};

/** 어두운 종이. 밤에 눈부시지 않다 */
export const DARK: CardTheme = {
  id: "dark",
  name: "어두운",
  suitColor: { S: "#e6e8eb", C: "#7ee2a0", H: "#ff7b7b", D: "#7db3ff" },
  faceTint: { S: "#2c313a", C: "#24352c", H: "#3a2a2c", D: "#26303f" },
  paper: "#1b1f26",
  edge: "#3b4250",
  back: { base: "#0f1a2b", stripe: "#16243a", accent: "#c9a648" },
  joker: { field: "#221d2b", disc: "#7b4bb0", star: "#f2c230" },
};

export const CARD_THEMES: readonly CardTheme[] = [
  CLASSIC,
  FOUR_COLOR,
  LARGE_PRINT,
  DARK,
];

/** 카드 모서리 글씨 폰트 후보 */
export const INDEX_FONTS = [
  { id: "system", name: "시스템 고딕", value: undefined },
  {
    id: "condensed",
    name: "좁은 고딕(Roboto Condensed)",
    value: "var(--font-card-condensed), ui-sans-serif, sans-serif",
  },
  {
    id: "serif",
    name: "굵은 세리프(Playfair Display)",
    value: "var(--font-card-serif), ui-serif, Georgia, serif",
  },
] as const;

/** 그림 카드 시안. 고르면 설정에 넣는다 */
export const FACE_DEMO_THEMES: readonly CardTheme[] = [
  {
    ...CLASSIC,
    id: "demo-a",
    name: "시안 A · 전통 인물 + 우리 틀",
    faces: { kind: "traditional" },
  },
  {
    ...CLASSIC,
    id: "demo-b",
    name: "시안 B · 직접 그림(크게)",
    faces: { kind: "court" },
  },
  {
    ...CLASSIC,
    id: "demo-c",
    name: "시안 C · 전통 인물, 굵은 선",
    faces: { kind: "traditional", bold: true },
  },
];
