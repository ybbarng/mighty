/** 브랜드 색과 문구. 아이콘·스플래시·manifest·메타데이터가 같은 값을 쓴다 */
export const BRAND = {
  name: "마이티",
  englishName: "Mighty",
  tagline: "대학가 카드게임 마이티. 혼자서도, 친구와도.",
  /** 앱 설명(검색·공유·홈 화면 추가에 쓰인다) */
  description:
    "윈도우용 마이티 네트워크(Mighty Network) 4.0을 이어받아 만든 웹 마이티. 혼자서도, 친구와도.",
  felt: "#0f5132",
  feltDark: "#0a3622",
  gold: "#f2c14e",
  ink: "#1c1f24",
} as const;

/** ♠ 모양 (100×100 상자). 카드 그림의 무늬와 같다 */
export const SPADE_PATH =
  "M50 2 C40 20 2 40 2 62 C2 76 13 86 27 86 C36 86 43 82 47 75 C46 86 40 93 30 98 L70 98 C60 93 54 86 53 75 C57 82 64 86 73 86 C87 86 98 76 98 62 C98 40 60 20 50 2 Z";

/** 마이티 네트워크를 만들고 이어 온 사람들 */
export const CREDITS: readonly { years: string; name: string }[] = [
  { years: "1999", name: "장문성" },
  { years: "2006–2011", name: "UPnL" },
  { years: "2006", name: "puzzlet" },
  { years: "2011", name: "Yoshi-TS4" },
  { years: "2026", name: "ybbarng" },
];

/** ♥ 모양 (100×100 상자). 카드 그림의 무늬와 같다 */
export const HEART_PATH =
  "M50 92 C22 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 78 70 50 92 Z";
