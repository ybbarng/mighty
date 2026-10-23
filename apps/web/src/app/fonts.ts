import localFont from "next/font/local";

// 글꼴 파일은 @fontsource 패키지에서 가져온다. 빌드 중에 Google 글꼴 서버에 기대지 않아,
// 그 서버가 응답하지 않아도 빌드가 깨지지 않는다(next/font/google 은 받기에 실패하면 빌드가 멈춘다).

/** 카드 모서리 글씨 후보. 좁고 또렷한 고딕 */
export const cardCondensed = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff2",
      weight: "700",
    },
    {
      path: "../../node_modules/@fontsource/roboto-condensed/files/roboto-condensed-latin-800-normal.woff2",
      weight: "800",
    },
  ],
  variable: "--font-card-condensed",
  display: "swap",
});

/** 카드 모서리 글씨 후보. 전통 트럼프 같은 굵은 세리프 */
export const cardSerif = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff2",
      weight: "800",
    },
    {
      path: "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2",
      weight: "900",
    },
  ],
  variable: "--font-card-serif",
  display: "swap",
  // 기본 글씨가 아니고 하트 점수판·고른 사람만 쓰니 첫 화면에서 미리 받지 않는다
  preload: false,
});
