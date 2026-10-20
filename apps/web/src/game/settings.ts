import {
  decodeRuleString,
  presetRules,
  RULE_PRESETS,
  type RuleSet,
} from "@mighty/engine";
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  CARD_BACKS,
  CARD_THEMES,
  type CardTheme,
  CLASSIC,
  DEFAULT_INDEX_FONT,
  FACE_STYLES,
  type FaceStyleId,
} from "@/components/card-art/themes";

import type { BotLevel } from "./bots";
import { setVolume as setSoundVolume } from "./sound";
import { setSlangTerms as applySlangTerms } from "./terms";

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
  /** 그림 카드(J·Q·K) 그리는 방법 */
  faceStyle: FaceStyleId;
  setFaceStyle(id: FaceStyleId): void;
  /** 카드 뒷면. "theme"이면 카드 테마의 뒷면 */
  cardBackId: string;
  setCardBack(id: string): void;
  /** 온라인 대전에서 쓰는 내 이름 */
  playerName: string;
  setPlayerName(name: string): void;
  /** 재생 속도 배율. 클수록 빠르다 */
  speed: number;
  setSpeed(speed: number): void;
  /** 효과음 */
  sound: boolean;
  setSound(on: boolean): void;
  /** 컴퓨터 이름(내 다음 차례가 1번). 비워 두면 기본 이름(`DEFAULT_BOT_NAMES`) */
  botNames: string[];
  setBotName(index: number, name: string): void;
  /** 카드 툴팁: 손패 카드에 그 무늬에서 아직 안 나온 더 높은 카드를 보여 준다(원작 `bCardTip`) */
  cardTip: boolean;
  setCardTip(on: boolean): void;
  /** 마이티 은어로 보기: 셋트·기아 프렌드·삽컴! (원작 "마이티 용어 사용", `bUseTerm`) */
  slangTerms: boolean;
  setSlangTerms(on: boolean): void;
  /** 효과음 크기 0~1 */
  volume: number;
  setVolume(volume: number): void;
  /** 컴퓨터 실력. 새 게임부터 적용된다 */
  botLevel: BotLevel;
  setBotLevel(level: BotLevel): void;
  /** 고른 규칙(원작 규칙 문자열). 나홀로·다함께 모두 이 규칙으로 시작한다 */
  ruleCode: string;
  setRuleCode(code: string): void;
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
      faceStyle: "traditional",
      setFaceStyle: (faceStyle) => set({ faceStyle }),
      cardBackId: "theme",
      setCardBack: (cardBackId) => set({ cardBackId }),
      playerName: "",
      setPlayerName: (playerName) => set({ playerName }),
      speed: 1,
      setSpeed: (speed) => set({ speed }),
      sound: true,
      setSound: (sound) => set({ sound }),
      botNames: [],
      setBotName: (index, name) =>
        set((s) => {
          const botNames = [...s.botNames];
          while (botNames.length < index) botNames.push("");
          botNames[index - 1] = name.slice(0, 8);
          return { botNames };
        }),
      cardTip: false,
      setCardTip: (cardTip) => set({ cardTip }),
      slangTerms: false,
      setSlangTerms: (slangTerms) => set({ slangTerms }),
      volume: 0.8,
      setVolume: (volume) => {
        setSoundVolume(volume);
        set({ volume });
      },
      botLevel: 2,
      setBotLevel: (botLevel) => set({ botLevel }),
      ruleCode: RULE_PRESETS[0]?.code ?? "",
      setRuleCode: (ruleCode) => set({ ruleCode }),
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
      // 미리 그려 둔 HTML과 첫 화면이 같아야 하므로 저장값은 첫 그리기 뒤에 읽는다(StoreHydration).
      skipHydration: true,
      // 저장해 둔 음량을 소리 출력에도 알려 준다.
      onRehydrateStorage: () => (state) => {
        if (state) setSoundVolume(state.volume);
      },
    },
  ),
);

// 화면 문구를 만드는 함수(terms.ts)가 설정을 따라가게 한다.
useSettings.subscribe((s) => applySlangTerms(s.slangTerms));

export function useCardTheme(): CardTheme {
  const id = useSettings((s) => s.cardThemeId);
  const backId = useSettings((s) => s.cardBackId);
  const faceStyle = useSettings((s) => s.faceStyle);
  // 카드 그림은 테마 객체로 캐시하므로 같은 선택이면 같은 객체를 돌려준다.
  return useMemo(() => {
    const theme = CARD_THEMES.find((t) => t.id === id) ?? CLASSIC;
    const back = CARD_BACKS.find((b) => b.id === backId);
    const faces = FACE_STYLES.find((f) => f.id === faceStyle)?.faces;
    return {
      ...theme,
      id: `${theme.id}+${back?.id ?? "theme"}+${faceStyle}`,
      ...(back ? { back } : {}),
      ...(faces ? { faces } : {}),
      indexFont: theme.indexFont ?? DEFAULT_INDEX_FONT,
    };
  }, [id, backId, faceStyle]);
}

/** 고른 규칙. 문자열이 깨졌으면 표준 5마 */
export function chosenRules(code: string): RuleSet {
  const decoded = decodeRuleString(code);
  return decoded.ok ? decoded.rules : presetRules("standard5");
}

/** 규칙 이름. 기본 규칙·내 규칙에 없으면 인원만 */
export function ruleLabel(code: string, custom: readonly CustomRule[]): string {
  const named = [...RULE_PRESETS, ...custom].find((r) => r.code === code);
  return named?.name ?? `직접 정한 ${chosenRules(code).playerCount}마`;
}

export { botName, DEFAULT_BOT_NAMES } from "./bot-names";
