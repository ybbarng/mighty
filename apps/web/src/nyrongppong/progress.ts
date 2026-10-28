import { createTutorialProgress } from "@/tutorial/progress";

/**
 * 나이롱뽕 튜토리얼 진행 기록. 다른 게임처럼 `tutorial/progress.ts`로 옮기고
 * `StoreHydration`에서 rehydrate한다(docs/30 9절 "합칠 때 할 일")
 */
export const useNyrongppongTutorialProgress = createTutorialProgress(
  "nyrongppong-tutorial",
);
