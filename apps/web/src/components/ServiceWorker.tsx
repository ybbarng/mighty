"use client";

import { useEffect } from "react";

/** 배포 빌드에서만 서비스 워커를 등록한다. 개발 중에는 저장해 둔 옛 파일 때문에 헷갈리지 않게 등록하지 않는다 */
export function ServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 등록하지 못해도 온라인에서는 그대로 할 수 있다.
    });
  }, []);
  return null;
}
