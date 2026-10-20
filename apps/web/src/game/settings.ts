import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CARD_THEMES,
  type CardTheme,
  CLASSIC,
} from "@/components/card-art/themes";

/** 원작의 rule.txt처럼 이름을 붙여 둔 내 규칙 */
export interface CustomRule {
  name: string;
  /** 원작 규칙 문자열 */
  code: string;
}

interface Settings {
  cardThemeId: string;
  customRules: CustomRule[];
  setCardTheme(id: string): void;
  saveCustomRule(rule: CustomRule): void;
  removeCustomRule(name: string): void;
}

/** 이 브라우저에만 남는 개인 설정. 저장이 안 되는 환경(사생활 보호 창 등)에서도 기본값으로 동작한다 */
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      cardThemeId: CLASSIC.id,
      customRules: [],
      setCardTheme: (id) => set({ cardThemeId: id }),
      // 같은 이름이면 덮어쓴다.
      saveCustomRule: (rule) =>
        set((s) => ({
          customRules: [
            ...s.customRules.filter((r) => r.name !== rule.name),
            rule,
          ],
        })),
      removeCustomRule: (name) =>
        set((s) => ({
          customRules: s.customRules.filter((r) => r.name !== name),
        })),
    }),
    { name: "mighty-settings", storage: createJSONStorage(() => localStorage) },
  ),
);

export function useCardTheme(): CardTheme {
  const id = useSettings((s) => s.cardThemeId);
  return CARD_THEMES.find((t) => t.id === id) ?? CLASSIC;
}
