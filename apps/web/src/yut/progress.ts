import { createTutorialProgress } from "@/tutorial/progress";

/** 윷놀이 튜토리얼 진행 기록. `StoreHydration`에서 첫 그리기 뒤에 읽는다 */
export const useYutTutorialProgress = createTutorialProgress("yut-tutorial");
