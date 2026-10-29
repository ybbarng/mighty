"use client";

import Script from "next/script";

import { BEFORE_SEND_NAME, UMAMI_WEBSITE_ID } from "@/stats/analytics";

/**
 * 사이트 통계 스크립트(umami, docs/33). ID가 없는 빌드(개발·시험)에서는 싣지 않는다.
 * game.byb.kr에서 연 방문만 세고, "추적하지 말라"(DNT)를 켠 브라우저는 스크립트가 스스로 보내지 않는다.
 * 주소의 쿼리·`#`은 지우고, 보내기 직전 `beforeSend`가 끔·GPC·남은 비밀을 다시 본다
 */
export function Analytics() {
  if (!UMAMI_WEBSITE_ID) return null;
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
