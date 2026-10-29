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
    void useSettings.persist.rehydrate();
    void useTutorialProgress.persist.rehydrate();
    void useHeartsSettings.persist.rehydrate();
    void useHeartsTutorialProgress.persist.rehydrate();
    void useOmokSettings.persist.rehydrate();
    void useOmokTutorialProgress.persist.rehydrate();
    void useJanggiSettings.persist.rehydrate();
    void useJanggiTutorialProgress.persist.rehydrate();
    void useJanggiStudyProgress.persist.rehydrate();
    void useNyrongppongSettings.persist.rehydrate();
    void useNyrongppongTutorialProgress.persist.rehydrate();
    void useGostopSettings.persist.rehydrate();
    void useGostopTutorialProgress.persist.rehydrate();
    void useMinhwatuSettings.persist.rehydrate();
    void useMinhwatuTutorialProgress.persist.rehydrate();
    void useBaseballSettings.persist.rehydrate();
    void useBaseballTutorialProgress.persist.rehydrate();
    void useYutSettings.persist.rehydrate();
    void useYutTutorialProgress.persist.rehydrate();
  }, []);
  return null;
}
