"use client";

import { useEffect } from "react";

import { useSettings } from "@/game/settings";
import { useHeartsSettings } from "@/hearts/settings";
import { useOmokSettings } from "@/omok/settings";
import {
  useHeartsTutorialProgress,
  useTutorialProgress,
} from "@/tutorial/progress";

/**
 * 브라우저에 저장해 둔 설정과 튜토리얼 진행을 첫 그리기 뒤에 불러온다.
 * 처음부터 읽으면 미리 그려 둔 HTML(기본값)과 첫 화면이 달라 React가 화면을 버리고 다시 그린다.
 */
export function StoreHydration() {
  useEffect(() => {
    void useSettings.persist.rehydrate();
    void useTutorialProgress.persist.rehydrate();
    void useHeartsSettings.persist.rehydrate();
    void useHeartsTutorialProgress.persist.rehydrate();
    void useOmokSettings.persist.rehydrate();
  }, []);
  return null;
}
