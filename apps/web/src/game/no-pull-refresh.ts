"use client";

import { useEffect } from "react";

/**
 * 판을 두는 화면에서만 당겨서 새로고침을 막는다(globals.css의 `html[data-no-pull]`).
 * 판 밖(게임 목록, 시작 화면, 기록, 설명)에서는 당겨서 새로고침이 된다.
 * 카드를 끌거나 판을 훑다가 화면이 당겨져 새로고침되면 대국이 끊기기 때문이다.
 */
export function useNoPullRefresh(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.dataset.noPull = "";
    return () => {
      delete root.dataset.noPull;
    };
  }, [active]);
}
