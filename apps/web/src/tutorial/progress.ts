import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type GameId, track } from "@/stats/track";

export interface TutorialProgress {
  /** 끝낸 단원 id */
  completed: string[];
  complete(id: string): void;
  reset(): void;
}

/** 튜토리얼 진행 기록. 이 브라우저에만 남는다. 게임마다 저장 이름을 달리 한다 */
export function createTutorialProgress(name: string) {
  // 저장 이름이 `<게임>-tutorial`이다. 통계에 게임 이름으로 쓴다.
  const game = name.replace(/-tutorial$/, "") as GameId;
  const store = create<TutorialProgress>()(
    persist(
      (set) => ({
        completed: [],
        complete: (id) =>
          set((s) => {
            const first = !s.completed.includes(id);
            track("lesson-finish", { game, lesson: id, first });
            return {
              completed: first ? [...s.completed, id] : s.completed,
            };
          }),
        reset: () => set({ completed: [] }),
      }),
      {
        name,
        storage: createJSONStorage(() => localStorage),
        // 미리 그려 둔 HTML과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다(StoreHydration).
        skipHydration: true,
      },
    ),
  );
  return Object.assign(store, { game });
}

export type TutorialProgressStore = ReturnType<typeof createTutorialProgress>;

/** 마이티 튜토리얼 진행 기록 */
export const useTutorialProgress = createTutorialProgress("mighty-tutorial");

/** 하트 튜토리얼 진행 기록 */
export const useHeartsTutorialProgress =
  createTutorialProgress("hearts-tutorial");

export type LessonState = "done" | "next" | "locked";

/** 단원은 순서대로 열린다. 끝낸 단원은 다시 할 수 있다 */
export function lessonStates(
  lessons: readonly { id: string }[],
  completed: readonly string[],
): LessonState[] {
  let nextGiven = false;
  return lessons.map((lesson) => {
    if (completed.includes(lesson.id)) return "done";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "locked";
  });
}

/** 오목 튜토리얼 진행 기록 */
export const useOmokTutorialProgress = createTutorialProgress("omok-tutorial");

/** 장기 튜토리얼 진행 기록 */
export const useJanggiTutorialProgress =
  createTutorialProgress("janggi-tutorial");
