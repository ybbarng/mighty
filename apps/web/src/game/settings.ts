import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CARD_THEMES,
  type CardTheme,
  CLASSIC,
} from "@/components/card-art/themes";

interface Settings {
  cardThemeId: string;
  setCardTheme(id: string): void;
}

/** 이 브라우저에만 남는 개인 설정. 저장이 안 되는 환경(사생활 보호 창 등)에서도 기본값으로 동작한다 */
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      cardThemeId: CLASSIC.id,
      setCardTheme: (id) => set({ cardThemeId: id }),
    }),
    { name: "mighty-settings", storage: createJSONStorage(() => localStorage) },
  ),
);

export function useCardTheme(): CardTheme {
  const id = useSettings((s) => s.cardThemeId);
  return CARD_THEMES.find((t) => t.id === id) ?? CLASSIC;
}
