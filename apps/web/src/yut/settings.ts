import type { YutRules } from "@mighty/yut-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type YutLevel = 0 | 1 | 2;

/** 판 짜기: 1:1, 2:2 편, 3인, 4인 */
export type YutLineup = "duel" | "team" | "three" | "four";

/** 윷놀이만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface YutSettings {
  lineup: YutLineup;
  pieces: number;
  backDo: boolean;
  flatPercent: 50 | 60;
  landOnHome: boolean;
  level: YutLevel;
  set(patch: Partial<Omit<YutSettings, "set">>): void;
}

export const useYutSettings = create<YutSettings>()(
  persist(
    (set) => ({
      lineup: "duel",
      pieces: 4,
      backDo: true,
      flatPercent: 60,
      landOnHome: false,
      level: 0,
      set: (patch) => set(patch),
    }),
    {
      name: "yut-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 지금 설정으로 만든 규칙 */
export function rulesFromSettings(
  s: Pick<
    YutSettings,
    "lineup" | "pieces" | "backDo" | "flatPercent" | "landOnHome"
  >,
): YutRules {
  return {
    players: s.lineup === "duel" ? 2 : s.lineup === "three" ? 3 : 4,
    mode: s.lineup === "team" ? "team" : "solo",
    pieces: s.pieces,
    backDo: s.backDo,
    flatPercent: s.flatPercent,
    landOnHome: s.landOnHome,
  };
}

export const YUT_LINEUPS: readonly {
  value: YutLineup;
  label: string;
  description: string;
}[] = [
  { value: "duel", label: "1:1", description: "둘이서 각자 말로" },
  {
    value: "team",
    label: "2:2 편",
    description: "넷이 두 편으로. 편끼리 말을 함께 쓰고 번갈아 던진다",
  },
  {
    value: "three",
    label: "3인",
    description: "셋이서 각자. 먼저 다 낸 사람이 이긴다",
  },
  {
    value: "four",
    label: "4인",
    description: "넷이서 각자. 먼저 다 낸 사람이 이긴다",
  },
];

export const YUT_LEVELS: readonly {
  value: YutLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "쓸 수 있는 수 가운데 아무거나 둔다",
  },
  {
    value: 1,
    label: "중수",
    description: "잡기·내기·지름길·업기를 먼저 보고, 잡힐 자리는 피한다",
  },
  {
    value: 2,
    label: "고수",
    description:
      "상대의 다음 던지기를 확률대로 따져 기댓값이 가장 큰 수를 둔다",
  },
];
