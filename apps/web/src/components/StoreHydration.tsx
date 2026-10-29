"use client";

import { useEffect } from "react";

import { useBaseballTutorialProgress } from "@/baseball/progress";
import { useBaseballSettings } from "@/baseball/settings";
import { useSettings } from "@/game/settings";
import { useGostopTutorialProgress } from "@/gostop/progress";
import { useGostopSettings } from "@/gostop/settings";
import { useHeartsSettings } from "@/hearts/settings";
import { useJanggiSettings } from "@/janggi/settings";
import { useMinhwatuTutorialProgress } from "@/minhwatu/progress";
import { useMinhwatuSettings } from "@/minhwatu/settings";
import { useNyrongppongTutorialProgress } from "@/nyrongppong/progress";
import { useNyrongppongSettings } from "@/nyrongppong/settings";
import { useOmokSettings } from "@/omok/settings";
import { useJanggiStudyProgress } from "@/study/progress";
import {
  useHeartsTutorialProgress,
  useJanggiTutorialProgress,
  useOmokTutorialProgress,
  useTutorialProgress,
} from "@/tutorial/progress";
import { useYutTutorialProgress } from "@/yut/progress";
import { useYutSettings } from "@/yut/settings";

/**
 * 브라우저에 저장해 둔 설정과 튜토리얼 진행을 첫 그리기 뒤에 불러온다.
 * 처음부터 읽으면 미리 그려 둔 HTML(기본값)과 첫 화면이 달라 React가 화면을 버리고 다시 그린다.
 */
export function StoreHydration() {
  useEffect(() => {
    void Promise.all([
      useSettings.persist.rehydrate(),
      useTutorialProgress.persist.rehydrate(),
      useHeartsSettings.persist.rehydrate(),
      useHeartsTutorialProgress.persist.rehydrate(),
      useOmokSettings.persist.rehydrate(),
      useOmokTutorialProgress.persist.rehydrate(),
      useJanggiSettings.persist.rehydrate(),
      useJanggiTutorialProgress.persist.rehydrate(),
      useJanggiStudyProgress.persist.rehydrate(),
      useNyrongppongSettings.persist.rehydrate(),
      useNyrongppongTutorialProgress.persist.rehydrate(),
      useGostopSettings.persist.rehydrate(),
      useGostopTutorialProgress.persist.rehydrate(),
      useMinhwatuSettings.persist.rehydrate(),
      useMinhwatuTutorialProgress.persist.rehydrate(),
      useBaseballSettings.persist.rehydrate(),
      useBaseballTutorialProgress.persist.rehydrate(),
      useYutSettings.persist.rehydrate(),
      useYutTutorialProgress.persist.rehydrate(),
    ]).then(() => {
      // 화면이 단추에 동작을 붙이고 저장값까지 읽었다는 표시. 화면 시험이 누르기 전에 기다린다
      // (그 전에 누르면 누름이 사라지거나, 늦게 읽힌 저장값이 고른 것을 덮어쓴다)
      document.documentElement.dataset.hydrated = "";
    });
  }, []);
  return null;
}
