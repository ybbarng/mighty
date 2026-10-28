import {
  type MinhwatuRules,
  type PlayerCount,
  STANDARD_RULES,
} from "@mighty/minhwatu-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type MinhwatuLevel = 0 | 1 | 2;

/** 민화투만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface MinhwatuSettings {
  players: PlayerCount;
  rounds: number;
  yakScore: 10 | 20;
  chodan: boolean;
  saodong: boolean;
  level: MinhwatuLevel;
  set(patch: Partial<Omit<MinhwatuSettings, "set">>): void;
}

export const useMinhwatuSettings = create<MinhwatuSettings>()(
  persist(
    (set) => ({
      ...STANDARD_RULES,
      level: 0,
      set: (patch) => set(patch),
    }),
    {
      name: "minhwatu-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 고른 설정으로 만든 규칙 */
export function rulesOf(s: {
  players: PlayerCount;
  rounds: number;
  yakScore: 10 | 20;
  chodan: boolean;
  saodong: boolean;
}): MinhwatuRules {
  return {
    players: s.players,
    rounds: s.rounds,
    yakScore: s.yakScore,
    chodan: s.chodan,
    saodong: s.saodong,
  };
}

export const MINHWATU_LEVELS: readonly {
  value: MinhwatuLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "먹을 수 있으면 아무거나 먹는다. 점수·약은 따지지 않는다",
  },
  {
    value: 1,
    label: "중수",
    description:
      "광·열끗을 먼저 먹고 약을 모으며, 남의 약을 막고 내줄 패를 아낀다",
  },
  {
    value: 2,
    label: "고수",
    description:
      "남의 손패와 더미를 여러 번 짐작해 판 끝까지 둬 보고 가장 좋은 수를 고른다",
  },
];

export const PLAYER_OPTIONS: readonly { value: PlayerCount; label: string }[] =
  [
    { value: 2, label: "2명" },
    { value: 3, label: "3명" },
    { value: 4, label: "4명" },
  ];

export const ROUND_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 3, label: "3판" },
  { value: 5, label: "5판" },
] as const;
