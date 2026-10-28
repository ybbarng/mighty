import { createTutorialProgress } from "@/tutorial/progress";

/**
 * 민화투 튜토리얼 진행 기록. 다른 게임과 같은 틀(`createTutorialProgress`)이다.
 * 합칠 때 `tutorial/progress.ts`로 옮기고 `StoreHydration`에서 불러오게 한다(docs/29 9절).
 * 그 전까지는 민화투 화면이 처음 그려진 뒤 직접 불러온다(MinhwatuApp)
 */
export const useMinhwatuTutorialProgress =
  createTutorialProgress("minhwatu-tutorial");
