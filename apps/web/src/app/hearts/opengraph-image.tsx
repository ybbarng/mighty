import {
  gameShareImage,
  SHARE_SIZE,
} from "@/components/brand/game-share-image";

export const dynamic = "force-static";

/** 정적 호스팅에서 이미지로 전송되도록 이름에 확장자를 붙인다 */
export function generateImageMetadata() {
  return [
    {
      id: "share.png",
      alt: "Hearts — 하트",
      size: SHARE_SIZE,
      contentType: "image/png",
    },
  ];
}

/** 하트 링크를 공유할 때 보이는 미리보기 */
export default function OpenGraphImage() {
  return gameShareImage({
    game: "hearts",
    title: "HEARTS",
    background: "radial-gradient(circle at 50% 30%, #7f1d1d, #3b0a0a)",
  });
}
