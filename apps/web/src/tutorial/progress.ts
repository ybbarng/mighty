import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { LESSONS } from "./lessons";

interface TutorialProgress {
  /** 끝낸 단원 id */
  completed: string[];
  complete(id: string): void;
  reset(): void;
}

/** 튜토리얼 진행 기록. 이 브라우저에만 남는다 */
export const useTutorialProgress = create<TutorialProgress>()(
  persist(
    (set) => ({
      completed: [],
      complete: (id) =>
        set((s) => ({
          completed: s.completed.includes(id)
            ? s.completed
            : [...s.completed, id],
        })),
      reset: () => set({ completed: [] }),
    }),
    {
      name: "mighty-tutorial",
      storage: createJSONStorage(() => localStorage),
      // 미리 그려 둔 HTML과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다(StoreHydration).
      skipHydration: true,
    },
  ),
);

export type LessonState = "done" | "next" | "locked";

/** 단원은 순서대로 열린다. 끝낸 단원은 다시 할 수 있다 */
export function lessonStates(completed: readonly string[]): LessonState[] {
  let nextGiven = false;
  return LESSONS.map((lesson) => {
    if (completed.includes(lesson.id)) return "done";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "locked";
  });
}
