import type { BaseballRules, Mode } from "@mighty/baseball-engine";
import type { TimePreset } from "@mighty/engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type BaseballLevel = 0 | 1 | 2;

/** 숫자야구만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface BaseballSettings {
  digits: 3 | 4;
  zero: boolean;
  /** 혼자 하기 방식: 서로 맞히기·컴퓨터 수만 맞히기(퍼즐) */
  soloMode: Mode;
  fair: boolean;
  winsToFinish: number;
  level: BaseballLevel;
  /** 개인 시간(맞힐 차례에만 간다) */
  time: TimePreset;
  /** 남은 후보 수를 보인다 */
  showHints: boolean;
  set(patch: Partial<Omit<BaseballSettings, "set">>): void;
}

export const useBaseballSettings = create<BaseballSettings>()(
  persist(
    (set) => ({
      digits: 3,
      zero: false,
      soloMode: "duel",
      fair: true,
      winsToFinish: 1,
      level: 0,
      time: "none",
      showHints: true,
      set: (patch) => set(patch),
    }),
    {
      name: "baseball-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 지금 설정으로 만든 규칙. 온라인은 늘 서로 맞히기다 */
export function rulesFromSettings(
  s: Pick<
    BaseballSettings,
    "digits" | "zero" | "soloMode" | "fair" | "winsToFinish" | "time"
  >,
  online = false,
): BaseballRules {
  const mode: Mode = online ? "duel" : s.soloMode;
  return {
    digits: s.digits,
    zero: s.zero,
    mode,
    fair: s.fair,
    winsToFinish: mode === "puzzle" ? 1 : s.winsToFinish,
    ...(s.time !== "none" ? { time: s.time } : {}),
  };
}

export const BASEBALL_LEVELS: readonly {
  value: BaseballLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "앞 답과 맞는 수를 아무거나 묻고, 가끔 앞 답을 잊는다",
  },
  {
    value: 1,
    label: "중수",
    description: "늘 앞 답과 맞는 수만 묻는다",
  },
  {
    value: 2,
    label: "고수",
    description: "답이 가장 고르게 나뉘는 수를 골라 빨리 좁힌다",
  },
];

export const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;
