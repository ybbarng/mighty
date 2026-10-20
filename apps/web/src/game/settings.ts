import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CARD_THEMES,
  type CardTheme,
  CLASSIC,
} from "@/components/card-art/themes";

import type { BotLevel } from "./bots";
import { setVolume as setSoundVolume } from "./sound";

/** 원작의 rule.txt처럼 이름을 붙여 둔 내 규칙 */
export interface CustomRule {
  name: string;
  /** 원작 규칙 문자열 */
  code: string;
}

export const SPEEDS = [
  { value: 0.7, label: "느리게" },
  { value: 1, label: "보통" },
  { value: 1.6, label: "빠르게" },
] as const;

interface Settings {
  cardThemeId: string;
  /** 온라인 대전에서 쓰는 내 이름 */
  playerName: string;
  setPlayerName(name: string): void;
  /** 재생 속도 배율. 클수록 빠르다 */
  speed: number;
  setSpeed(speed: number): void;
  /** 효과음 */
  sound: boolean;
  setSound(on: boolean): void;
  /** 효과음 크기 0~1 */
  volume: number;
  setVolume(volume: number): void;
  /** 컴퓨터 실력. 새 게임부터 적용된다 */
  botLevel: BotLevel;
  setBotLevel(level: BotLevel): void;
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
      playerName: "",
      setPlayerName: (playerName) => set({ playerName }),
      speed: 1,
      setSpeed: (speed) => set({ speed }),
      sound: true,
      setSound: (sound) => set({ sound }),
      volume: 0.8,
      setVolume: (volume) => {
        setSoundVolume(volume);
        set({ volume });
      },
      botLevel: 2,
      setBotLevel: (botLevel) => set({ botLevel }),
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
    {
      name: "mighty-settings",
      storage: createJSONStorage(() => localStorage),
      // 저장해 둔 음량을 소리 출력에도 알려 준다.
      onRehydrateStorage: () => (state) => {
        if (state) setSoundVolume(state.volume);
      },
    },
  ),
);

export function useCardTheme(): CardTheme {
  const id = useSettings((s) => s.cardThemeId);
  return CARD_THEMES.find((t) => t.id === id) ?? CLASSIC;
}
