import type { TimePreset } from "@mighty/engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type ChessLevel = 0 | 1 | 2;

/** 나홀로 체스에서 내 색: 백(먼저)·흑·무작위 */
export type ColorPick = "white" | "black" | "random";

/** 체스만의 설정. 첫 그리기 뒤에 저장값을 읽는다(ChessApp이 rehydrate) */
interface ChessSettings {
  winsToFinish: number;
  level: ChessLevel;
  pick: ColorPick;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  /** 판 위에 a~h·1~8 칸 이름을 보인다 */
  coordinates: boolean;
  set(patch: Partial<Omit<ChessSettings, "set">>): void;
}

export const useChessSettings = create<ChessSettings>()(
  persist(
    (set) => ({
      winsToFinish: 1,
      level: 0,
      pick: "white",
      time: "none",
      coordinates: true,
      set: (patch) => set(patch),
    }),
    {
      name: "chess-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

export const CHESS_LEVELS: readonly {
  value: ChessLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "한 수만 본다. 공짜 기물은 잡지만 자기 기물을 자주 내준다",
  },
  {
    value: 1,
    label: "중수",
    description: "두 수 앞과 주고받기를 따진다. 기물을 공짜로 주지 않는다",
  },
  {
    value: 2,
    label: "고수",
    description: "네 수 앞까지 읽는다. 메이트를 놓치지 않는다",
  },
];
