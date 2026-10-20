import { decodeRuleString } from "./rule-string";
import type { RuleSet } from "./rules";

export interface RulePreset {
  id: string;
  name: string;
  /** 원작 규칙 문자열 */
  code: string;
  rules: RuleSet;
}

/** 원작 Mighty Network 4.0의 기본 규칙(`asPreset`, Rule.cpp) 14종과, 만든 사람의 학교 규칙. */
const PRESET_CODES = [
  ["standard5", "표준 5마", "(0$1M&))2O%,C5%"],
  ["standard4", "표준 4마", "'1$1M&%)2K%,C5%"],
  ["standard3", "표준 3마", "&/$1M&#)2K%,C5%"],
  ["standard6", "표준 6마", ")0$1M&))2K%,C5%"],
  ["standard7", "표준 7마", "*0$1M&))2K%,C5%"],
  ["standard2", "표준 2마", "%*$1M&#)2K%,C5%"],
  ["gwanak6", "관악 6마", ")0$1M@I7BKU&D=%"],
  ["sinchon5", "신촌 5마", "(1$1M&Z8B+].C]%"],
  ["gyeonggi5", "경기 5마", "(/$1M@1%bb&+C]%"],
  ["busan4", "부산 4마", "'0$1M&E7BKE.C=%"],
  ["daegu5", "대구 5마", "(/$1M&I8@K%,C=%"],
  ["daejeon6", "대전 6마", ")0$1M&I7BKU.C=%"],
  ["gwangju5", "광주 5마", "(/$1M&*9P-%,C=%"],
  ["jeju3", "제주 3마", "&/$1M&#%BK].C=%"],
  // 만든 사람이 학창 시절에 하던 규칙(2026-10-20 확인). 기루다가 ♣이면 조커콜은 ♥3,
  // 첫·막 트릭 조커는 효력 없음, 조커콜에 마이티로 대신 내기, 노기루다 1 적게, 다음 판 선은 프렌드.
  ["school5", "우리 학교 5마", "(0$1M@IYb]5,C55"],
] as const;

export const RULE_PRESETS: readonly RulePreset[] = PRESET_CODES.map(
  ([id, name, code]) => {
    const result = decodeRuleString(code);
    if (!result.ok) throw new Error(`기본 규칙 ${name}: ${result.reason}`);
    return { id, name, code, rules: result.rules };
  },
);

export type RulePresetId = (typeof PRESET_CODES)[number][0];

export function presetRules(id: RulePresetId): RuleSet {
  const preset = RULE_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`없는 기본 규칙: ${id}`);
  return { ...preset.rules, dealMiss: { ...preset.rules.dealMiss } };
}
