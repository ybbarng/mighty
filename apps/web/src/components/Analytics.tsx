"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

import { BEFORE_SEND_NAME, UMAMI_WEBSITE_ID } from "@/stats/analytics";

/**
 * 사이트 통계 스크립트(umami, docs/33). ID가 없는 빌드(개발·시험)에서는 싣지 않는다.
 * game.byb.kr에서 연 방문만 세고, "추적하지 말라"(DNT)를 켠 브라우저는 스크립트가 스스로 보내지 않는다.
 * 주소의 쿼리·`#`은 지우고, 보내기 직전 `beforeSend`가 끔·GPC·남은 비밀을 다시 본다.
 * 하늘의 별 따기(/stardraw) 아래에서는 싣지 않는다: 바깥 스크립트는 화면 코드 해시(재현 빌드) 밖이라 바뀌어도
 * 알 수 없고, 같은 출처에서 돌면 기기에 저장된 소속 복구 코드를 읽고 패스키 서명을 띄울 수 있다(D7).
 * 게임 목록에서 별 따기로는 평범한 링크(페이지를 새로 연다)로 들어가므로 이전 페이지의 스크립트가 따라오지 않는다
 */
export function Analytics() {
  const path = usePathname() ?? "";
  if (!UMAMI_WEBSITE_ID) return null;
  if (path === "/stardraw" || path.startsWith("/stardraw/")) return null;
  return (
    <Script
      src="https://stats.byb.kr/script.js"
      data-website-id={UMAMI_WEBSITE_ID}
      data-domains="game.byb.kr"
      data-do-not-track="true"
      data-exclude-search="true"
      data-exclude-hash="true"
      data-before-send={BEFORE_SEND_NAME}
      strategy="afterInteractive"
    />
  );
}
