import { createStudyProgress } from "@/study/progress";
import { createTutorialProgress } from "@/tutorial/progress";

/** 바둑 튜토리얼 진행 기록 */
export const useBadukTutorialProgress =
  createTutorialProgress("baduk-tutorial");

/** 바둑 수 배우기 진행 기록 */
export const useBadukStudyProgress = createStudyProgress("baduk-study");
