"use client";

import {
  decodeRuleString,
  encodeRuleString,
  RULE_PRESETS,
  type RuleSet,
} from "@mighty/engine";
import { useState } from "react";

import { BOT_LEVELS } from "@/game/bots";
import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

import { Logo } from "./brand/Logo";
import { CARD_THEMES } from "./card-art/themes";

import { ActionButton } from "./panels/common";
import { RuleEditor } from "./rules/RuleEditor";

/** 게임 시작 화면: 기본 규칙 고르기, 원작 규칙 문자열 붙여넣기 */
export function StartScreen({
  onStart,
  onOnline,
  onTutorial,
  onResume,
}: {
  onStart: (rules: RuleSet) => void;
  /** 친구와 하기: 고른 규칙으로 방을 만든다 */
  onOnline: (rules: RuleSet) => void;
  /** 처음 하는 사람을 위한 단원별 배우기 */
  onTutorial: () => void;
  /** 저장한 대국이 있을 때만 */
  onResume?: () => void;
}) {
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const botLevel = useSettings((s) => s.botLevel);
  const setBotLevel = useSettings((s) => s.setBotLevel);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  const customRules = useSettings((s) => s.customRules);
  const saveCustomRule = useSettings((s) => s.saveCustomRule);
  const removeCustomRule = useSettings((s) => s.removeCustomRule);
  // 고른 규칙은 늘 규칙 문자열 하나로 들고 있다. 기본 규칙·내 규칙·자세히 고치기가 모두 이 문자열을 바꾼다.
  const [ruleText, setRuleText] = useState(RULE_PRESETS[0]?.code ?? "");
  const [editing, setEditing] = useState(false);
  const [saveName, setSaveName] = useState("");
  const decoded = ruleText.trim() ? decodeRuleString(ruleText) : null;
  const rules = decoded?.ok ? decoded.rules : null;
  const code = rules ? encodeRuleString(rules) : null;
  const chip = (selected: boolean) =>
    cn(
      "rounded-lg border px-2 py-1.5 text-xs",
      selected
        ? "border-amber-300 bg-white text-black"
        : "border-white/15 bg-white/5",
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
        <div className="text-center">
          <h1 className="flex justify-center">
            <Logo size={240} animated />
          </h1>
          <p className="mt-2 font-medium text-sm text-white/85">
            공약을 걸고, 프렌드를 찾고, 마이티로 뒤집어라
          </p>
        </div>

        <button
          type="button"
          onClick={onTutorial}
          className="flex items-center gap-3 rounded-2xl border border-amber-300/50 bg-amber-400/10 px-4 py-3 text-left transition hover:bg-amber-400/20"
        >
          <span className="text-2xl">🎓</span>
          <span className="flex flex-1 flex-col">
            <span className="font-bold">처음이라면? 마이티 배우기</span>
            <span className="text-xs opacity-70">
              용어부터 한 판까지, 단원별로 차근차근
            </span>
          </span>
          <span className="text-amber-300">→</span>
        </button>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">규칙</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {RULE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRuleText(p.code)}
                className={chip(p.code === code)}
              >
                {p.name}
              </button>
            ))}
            {customRules.map((r) => (
              <span
                key={r.name}
                className={cn(
                  chip(r.code === code),
                  "flex items-center justify-between gap-1",
                )}
              >
                <button
                  type="button"
                  onClick={() => setRuleText(r.code)}
                  className="truncate"
                >
                  {r.name}
                </button>
                <button
                  type="button"
                  aria-label={`${r.name} 지우기`}
                  onClick={() => removeCustomRule(r.name)}
                  className="opacity-50 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <ActionButton
              variant="secondary"
              className="flex-1 py-1.5 text-xs"
              disabled={!rules}
              onClick={() => setEditing(true)}
            >
              규칙 자세히 보기·고치기
            </ActionButton>
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <label htmlFor="rule-string" className="font-semibold text-sm">
            규칙 문자열 (원작 Mighty Network와 같은 형식)
          </label>
          <input
            id="rule-string"
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            spellCheck={false}
            className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-sm"
          />
          <p
            className={cn(
              "text-xs",
              decoded && !decoded.ok ? "text-red-300" : "opacity-60",
            )}
          >
            {decoded && !decoded.ok
              ? decoded.reason
              : "친구에게 이 문자열을 보내면 같은 규칙으로 할 수 있습니다."}
          </p>
          {rules &&
            ![...RULE_PRESETS, ...customRules].some((r) => r.code === code) && (
              <div className="flex gap-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="이 규칙의 이름 (예: 우리 학교 5마)"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs"
                />
                <ActionButton
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={!saveName.trim() || !code}
                  onClick={() => {
                    if (!code) return;
                    saveCustomRule({ name: saveName.trim(), code });
                    setSaveName("");
                  }}
                >
                  내 규칙으로 저장
                </ActionButton>
              </div>
            )}
        </section>

        <section className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">카드</h2>
          {CARD_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setCardTheme(t.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                t.id === cardThemeId
                  ? "border-amber-300 bg-white text-black"
                  : "border-white/15 bg-white/5",
              )}
            >
              {t.name}
            </button>
          ))}
          <a href="/cards" className="ml-auto text-xs underline opacity-70">
            모든 카드 보기
          </a>
        </section>

        <section className="flex items-center gap-2">
          <h2 className="font-semibold text-sm">컴퓨터 실력</h2>
          {BOT_LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => setBotLevel(level.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                level.value === botLevel
                  ? "border-amber-300 bg-white text-black"
                  : "border-white/15 bg-white/5",
              )}
            >
              {level.label}
            </button>
          ))}
          <span className="ml-auto text-xs opacity-60">
            {botLevel === 2
              ? "남의 패를 추측해 수를 읽는다"
              : "정해진 요령대로 둔다"}
          </span>
        </section>

        <ActionButton
          disabled={!rules}
          className="py-3 text-base"
          onClick={() => rules && onStart(rules)}
        >
          {rules ? `컴퓨터와 ${rules.playerCount}마` : "규칙을 고르세요"}
        </ActionButton>
        {rules && (
          <p className="-mt-3 text-center text-xs opacity-60">
            나와 컴퓨터 {rules.playerCount - 1}명이 함께합니다
          </p>
        )}
        <ActionButton
          variant="secondary"
          disabled={!rules}
          className="py-3 text-base"
          onClick={() => rules && onOnline(rules)}
        >
          친구와 하기
        </ActionButton>
        <p className="-mt-3 text-center text-xs opacity-60">
          방을 만들어 링크를 보내면 됩니다. 빈자리는 컴퓨터가 채웁니다
        </p>
        {onResume && (
          <ActionButton
            variant="secondary"
            className="py-3 text-base"
            onClick={onResume}
          >
            하던 게임 이어하기
          </ActionButton>
        )}
      </div>
      {editing && rules && (
        <RuleEditor
          initial={rules}
          onClose={() => setEditing(false)}
          onApply={(next) => {
            setRuleText(encodeRuleString(next));
            setEditing(false);
          }}
        />
      )}
    </main>
  );
}
