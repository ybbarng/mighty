import type { GostopRules, GukjinRule } from "@mighty/gostop-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type GostopLevel = 0 | 1 | 2;

/** 고스톱만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface GostopSettings {
  players: 2 | 3;
  rounds: number;
  gukjin: GukjinRule;
  level: GostopLevel;
  set(patch: Partial<Omit<GostopSettings, "set">>): void;
}

export const useGostopSettings = create<GostopSettings>()(
  persist(
    (set) => ({
      players: 2,
      rounds: 3,
      gukjin: "best",
      level: 0,
      set: (patch) => set(patch),
    }),
    {
      name: "gostop-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 지금 설정으로 만든 규칙 */
export function gostopRulesOf(s: {
  players: 2 | 3;
  rounds: number;
  gukjin: GukjinRule;
}): GostopRules {
  return { players: s.players, rounds: s.rounds, gukjin: s.gukjin };
}

export const GOSTOP_LEVELS: readonly {
  value: GostopLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "짝 맞는 카드를 자주 내지만 무엇을 먹을지는 따지지 않는다",
  },
  {
    value: 1,
    label: "중수",
    description: "약을 채우고 상대 약을 막는다. 상대 점수가 가까우면 스톱한다",
  },
  {
    value: 2,
    label: "고수",
    description: "박을 피하고, 남은 패를 여러 번 굴려 보고 고·스톱을 고른다",
  },
];

export const PLAYER_OPTIONS = [
  { value: 2, label: "맞고(2명)" },
  { value: 3, label: "고스톱(3명)" },
] as const;

export const ROUND_OPTIONS = [1, 3, 5, 10] as const;

export const GUKJIN_INFO: readonly {
  value: GukjinRule;
  label: string;
  description: string;
}[] = [
  {
    value: "best",
    label: "국진은 유리하게",
    description:
      "9월 국진(술잔)을 열끗과 쌍피 가운데 점수가 더 나는 쪽으로 센다. 졌을 때는 피박을 피하는 쪽으로 센다",
  },
  {
    value: "animal",
    label: "국진은 열끗만",
    description: "9월 국진은 늘 열끗으로 센다",
  },
];
