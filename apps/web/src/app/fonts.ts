import { Playfair_Display, Roboto_Condensed } from "next/font/google";

/** 카드 모서리 글씨 후보. 좁고 또렷한 고딕 */
export const cardCondensed = Roboto_Condensed({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-card-condensed",
  display: "swap",
});

/** 카드 모서리 글씨 후보. 전통 트럼프 같은 굵은 세리프 */
export const cardSerif = Playfair_Display({
  subsets: ["latin"],
  weight: ["800", "900"],
  variable: "--font-card-serif",
  display: "swap",
});
