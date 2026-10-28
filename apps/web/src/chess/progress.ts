import { createStudyProgress } from "@/study/progress";
import { createTutorialProgress } from "@/tutorial/progress";

/*
 * 체스 배우기·수 배우기 진행 기록. 다른 게임은 공통 파일(tutorial/progress.ts, study/progress.ts)에 두지만,
 * 체스를 따로 만들며 공통 파일을 건드리지 않으려고 여기 둔다. 저장 이름은 다른 게임과 같은 규칙이다.
 * 저장값은 첫 그리기 뒤에 읽는다(`useChessHydration`).
 */

/** 체스 튜토리얼 진행 기록 */
export const useChessTutorialProgress =
  createTutorialProgress("chess-tutorial");

/** 체스 수 배우기 진행 기록 */
export const useChessStudyProgress = createStudyProgress("chess-study");
