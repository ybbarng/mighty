import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 문제 하나의 기록 */
export interface PuzzleRecord {
  /** 마지막으로 푼 때(ms). 안 풀었으면 없다 */
  solvedAt?: number;
  /** 틀린 횟수 */
  misses: number;
}

export interface StudyProgress {
  records: Record<string, PuzzleRecord>;
  solve(id: string): void;
  miss(id: string): void;
  reset(): void;
}

/** 수 배우기 진행 기록(docs/23). 이 브라우저에만 남는다. 게임마다 저장 이름을 달리 한다 */
export function createStudyProgress(name: string) {
  return create<StudyProgress>()(
    persist(
      (set) => ({
        records: {},
        solve: (id) =>
          set((s) => ({
            records: {
              ...s.records,
              [id]: {
                misses: s.records[id]?.misses ?? 0,
                solvedAt: Date.now(),
              },
            },
          })),
        miss: (id) =>
          set((s) => ({
            records: {
              ...s.records,
              [id]: {
                ...s.records[id],
                misses: (s.records[id]?.misses ?? 0) + 1,
              },
            },
          })),
        reset: () => set({ records: {} }),
      }),
      {
        name,
        storage: createJSONStorage(() => localStorage),
        // 미리 그려 둔 HTML과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다(StoreHydration).
        skipHydration: true,
      },
    ),
  );
}

export type StudyProgressStore = ReturnType<typeof createStudyProgress>;

/** 장기 수 배우기 진행 기록 */
export const useJanggiStudyProgress = createStudyProgress("janggi-study");

/** 묶음에서 다음에 풀 문제: 안 푼 것 먼저, 다 풀었으면 틀린 적이 많은 것 */
export function nextPuzzle(
  ids: readonly string[],
  records: Record<string, PuzzleRecord>,
): string | null {
  const unsolved = ids.find((id) => !records[id]?.solvedAt);
  if (unsolved) return unsolved;
  const sorted = [...ids].sort(
    (a, b) => (records[b]?.misses ?? 0) - (records[a]?.misses ?? 0),
  );
  return sorted[0] ?? null;
}
