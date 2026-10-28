import { createTutorialProgress } from "@/tutorial/progress";

/**
 * 고스톱 튜토리얼 진행 기록.
 * 다른 게임은 `tutorial/progress.ts`에 두고 `StoreHydration`에서 읽는다. 고스톱은 합칠 때 그리로 옮긴다(docs/28 7절).
 * 그 전까지는 고스톱 화면이 처음 그려진 뒤 직접 읽는다(`rehydrateGostop`)
 */
export const useGostopTutorialProgress =
  createTutorialProgress("gostop-tutorial");
