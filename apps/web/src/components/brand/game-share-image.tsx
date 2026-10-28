import { ImageResponse } from "next/og";

import { IconArt } from "./icon-art";

export const SHARE_SIZE = { width: 1200, height: 630 };

/**
 * 게임 링크를 공유할 때 보이는 미리보기: 게임 아이콘을 크게, 아래에 영문 이름.
 * 한글 글꼴을 빌드에 넣지 않으려고 글자는 영문만 쓴다(사이트 공유 그림과 같은 모양)
 */
export function gameShareImage({
  game,
  title,
  background,
  color = "#ffffff",
}: {
  game: NonNullable<Parameters<typeof IconArt>[0]["game"]>;
  title: string;
  background: string;
  color?: string;
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 36,
        background,
      }}
    >
      <div
        style={{
          display: "flex",
          width: 350,
          height: 350,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          borderRadius: 63,
        }}
      >
        <IconArt game={game} />
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: 16,
          color,
        }}
      >
        {title}
      </div>
    </div>,
    SHARE_SIZE,
  );
}
