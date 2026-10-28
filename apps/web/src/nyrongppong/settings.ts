import {
  type NyrongppongRules,
  STANDARD_RULES,
} from "@mighty/nyrongppong-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type NyrongppongLevel = 0 | 1 | 2;

/** 나이롱뽕만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface NyrongppongSettings extends NyrongppongRules {
  level: NyrongppongLevel;
  set(patch: Partial<Omit<NyrongppongSettings, "set">>): void;
}

export const useNyrongppongSettings = create<NyrongppongSettings>()(
  persist(
    (set) => ({
      ...STANDARD_RULES,
      level: 0,
      set: (patch) => set(patch),
    }),
    {
      name: "nyrongppong-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 지금 고른 규칙 */
export function rulesOf(s: NyrongppongRules): NyrongppongRules {
  return {
    players: s.players,
    rounds: s.rounds,
    stopLimit: s.stopLimit,
    bagaji: s.bagaji,
    callSeconds: s.callSeconds,
  };
}

/** 온라인 뽕 응답 창(초). 버릴 때마다 모두 기다리므로 혼자 하기보다 짧게 둔다 */
export const ONLINE_CALL_SECONDS = 3;

/**
 * 온라인 방 규칙: 버릴 때마다 모두에게 같은 응답 창을 연다(docs/30 2절).
 * 창이 열리는 것만 보고 누가 같은 달 두 장을 들었는지 알아채지 못하게 한다
 */
export function onlineRules(rules: NyrongppongRules): NyrongppongRules {
  return {
    ...rulesOf(rules),
    callSeconds: ONLINE_CALL_SECONDS,
    everyDiscard: true,
  };
}

export const NYRONGPPONG_LEVELS: readonly {
  value: NyrongppongLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "아무 카드나 버리고, 뽕할 수 있어도 자주 넘긴다",
  },
  {
    value: 1,
    label: "중수",
    description:
      "짝은 남기고 큰 카드부터 버린다. 뽕은 늘 부르고 손이 작으면 스톱",
  },
  {
    value: 2,
    label: "고수",
    description:
      "보이지 않는 패를 여러 번 짐작해 스톱 바가지를 피하고, 뽕한 뒤에는 낮은 두 장을 남긴다",
  },
];
