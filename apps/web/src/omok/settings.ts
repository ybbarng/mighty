import type { TimePreset } from "@mighty/engine";
import type { Variant } from "@mighty/omok-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { StonePick } from "./store";

/** 0 입문, 1 중수, 2 고수 */
export type OmokLevel = 0 | 1 | 2;

/** 오목만의 설정. 첫 그리기 뒤에 저장값을 읽는다(StoreHydration) */
interface OmokSettings {
  variant: Variant;
  winsToFinish: number;
  level: OmokLevel;
  pick: StonePick;
  /** 내 차례에 금지 자리를 ×로 보인다 */
  showForbidden: boolean;
  /** 개인 시간(기본 시간 + 초읽기) */
  time: TimePreset;
  set(patch: Partial<Omit<OmokSettings, "set">>): void;
}

export const useOmokSettings = create<OmokSettings>()(
  persist(
    (set) => ({
      // 국제 공식 규칙인 렌주가 기본이다(흑만 3·3·4·4·장목 금지, 2026-10-29 사용자)
      variant: "renju",
      winsToFinish: 1,
      level: 0,
      pick: "black",
      showForbidden: true,
      time: "none",
      set: (patch) => set(patch),
    }),
    {
      name: "omok-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // 1: 기본 규칙을 일반에서 렌주로. 예전 기본값(일반)으로 남은 기기는 한 번 렌주로 옮긴다
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<OmokSettings>;
        if (version < 1 && state.variant === "standard")
          state.variant = "renju";
        return state as OmokSettings;
      },
    },
  ),
);

export const OMOK_LEVELS: readonly {
  value: OmokLevel;
  label: string;
  description: string;
}[] = [
  {
    value: 0,
    label: "입문",
    description: "다섯은 막지만 열린 삼을 자주 놓친다",
  },
  {
    value: 1,
    label: "중수",
    description: "공격과 막기를 고루 보고 가장 좋은 자리에 둔다",
  },
  {
    value: 2,
    label: "고수",
    description: "네 수 앞까지 읽는다. 쉽게 지지 않는다",
  },
];

export const VARIANT_INFO: readonly {
  value: Variant;
  label: string;
  description: string;
}[] = [
  {
    value: "standard",
    label: "일반",
    description: "정확히 다섯이 이긴다. 흑·백 모두 3·3 금지",
  },
  {
    value: "free",
    label: "자유",
    description: "다섯 이상이면 이긴다. 금지 없음",
  },
  {
    value: "renju",
    label: "렌주",
    description: "흑만 3·3·4·4·여섯 이상 금지. 백은 다섯 이상이면 이긴다",
  },
];
