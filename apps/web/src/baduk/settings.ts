import type { BoardSize, Komi } from "@mighty/baduk-engine";
import type { TimePreset } from "@mighty/engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type BadukLevel = 0 | 1 | 2;

/** 나홀로 바둑에서 내 돌: 흑(먼저)·백·무작위 */
export type StonePick = "black" | "white" | "random";

/** 바둑만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface BadukSettings {
  size: BoardSize;
  komi: Komi;
  winsToFinish: number;
  level: BadukLevel;
  pick: StonePick;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  set(patch: Partial<Omit<BadukSettings, "set">>): void;
}

export const useBadukSettings = create<BadukSettings>()(
  persist(
    (set) => ({
      // 일반 바둑처럼 19줄이 기본이다. 작은 판은 배우기·문제 풀기에서 쓴다(2026-10-29 사용자)
      size: 19,
      komi: 7.5,
      winsToFinish: 1,
      level: 0,
      pick: "black",
      time: "none",
      set: (patch) => set(patch),
    }),
    {
      name: "baduk-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // 1: 기본 판을 9줄에서 19줄로. 예전 기본값(9줄)으로 남은 기기는 한 번 19줄로 옮긴다
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<BadukSettings>;
        if (version < 1 && state.size === 9) state.size = 19;
        return state as BadukSettings;
      },
    },
  ),
);

export const BADUK_LEVELS: readonly {
  value: BadukLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description:
      "따낼 돌은 따내고 단수에 걸린 돌은 달아나지만, 그 밖에는 아무 데나 둔다",
  },
  {
    value: 1,
    label: "중수",
    description:
      "둘 만한 수마다 끝까지 여러 번 둬 보고 승률이 높은 수를 고른다",
  },
  {
    value: 2,
    label: "고수",
    description:
      "몬테카를로 나무 탐색으로 수천 판을 둬 본다. 9줄에서 가장 세고, 큰 판에서는 조금 약하다",
  },
];

export const SIZE_INFO: readonly {
  value: BoardSize;
  label: string;
  description: string;
}[] = [
  {
    value: 9,
    label: "9줄",
    description: "처음 배우기 좋은 작은 판. 한 판이 짧다",
  },
  {
    value: 13,
    label: "13줄",
    description: "9줄과 19줄 사이. 포석이 조금 생긴다",
  },
  {
    value: 19,
    label: "19줄",
    description: "정식 판. 길고 넓다. 컴퓨터 고수는 9줄보다 약하다",
  },
];
