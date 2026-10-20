import type { Suit } from "@mighty/engine";

/** 카드 디자인 테마. 그림을 그리는 코드는 같고 색과 장식만 바꾼다 */
export interface CardTheme {
  id: string;
  name: string;
  suitColor: Record<Suit, string>;
  /** 그림 카드(J·Q·K) 안쪽 바탕 */
  faceTint: Record<Suit, string>;
  paper: string;
  edge: string;
  back: { base: string; stripe: string; accent: string };
  joker: { field: string; disc: string; star: string };
  /** 모서리 숫자·무늬를 크게. 손패가 겹쳐 왼쪽 띠만 보일 때 읽기 쉽다 */
  largeIndex?: boolean;
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
