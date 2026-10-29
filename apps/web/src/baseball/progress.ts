import { createTutorialProgress } from "@/tutorial/progress";

/** 숫자야구 튜토리얼 진행 기록. `StoreHydration`에서 첫 그리기 뒤에 읽는다 */
export const useBaseballTutorialProgress =
  createTutorialProgress("baseball-tutorial");
