import {
  decodeHeartsRules,
  type HeartsRules,
  WINDOWS_RULE_CODE,
  WINDOWS_RULES,
} from "@mighty/hearts-engine";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 0 입문, 1 중수, 2 고수 */
export type HeartsLevel = 0 | 1 | 2;

/**
 * 하트만의 설정. 카드 디자인·진행 속도·효과음·이름은 마이티 설정(`useSettings`)을 함께 쓴다.
 * 마이티 화면과 같이 첫 그리기 뒤에 저장값을 읽는다(StoreHydration).
 */
interface HeartsSettings {
  ruleCode: string;
  setRuleCode(code: string): void;
  level: HeartsLevel;
  setLevel(level: HeartsLevel): void;
}

export const useHeartsSettings = create<HeartsSettings>()(
  persist(
    (set) => ({
      ruleCode: WINDOWS_RULE_CODE,
      setRuleCode: (ruleCode) => set({ ruleCode }),
      level: 2,
      setLevel: (level) => set({ level }),
    }),
    {
      name: "hearts-settings",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);

/** 고른 규칙. 문자열이 깨졌으면 윈도우 하트 */
export function heartsRules(code: string): HeartsRules {
  const decoded = decodeHeartsRules(code);
  return decoded.ok ? decoded.rules : WINDOWS_RULES;
}

const UNLOCK_KEY = "hearts-unlocked";

/** 숨은 하트를 한 번 찾았으면 첫 화면에 ♥ 단추를 남긴다 */
export function heartsUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockHearts(): void {
  try {
    localStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // 저장하지 못해도 이번에는 들어간다.
  }
}
