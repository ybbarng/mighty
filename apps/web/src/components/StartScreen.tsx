"use client";

import {
  decodeRuleString,
  encodeRuleString,
  RULE_PRESETS,
  type RuleSet,
} from "@mighty/engine";
import { useState } from "react";

import { useSettings } from "@/game/settings";
import { cn } from "@/lib/cn";

import { CARD_THEMES } from "./card-art/themes";

import { ActionButton } from "./panels/common";

/** 게임 시작 화면: 기본 규칙 고르기, 원작 규칙 문자열 붙여넣기 */
export function StartScreen({
  onStart,
}: {
  onStart: (rules: RuleSet) => void;
}) {
  const cardThemeId = useSettings((s) => s.cardThemeId);
  const setCardTheme = useSettings((s) => s.setCardTheme);
  const [presetId, setPresetId] = useState<string>("standard5");
  const [ruleText, setRuleText] = useState("");
  const decoded = ruleText.trim() ? decodeRuleString(ruleText) : null;
  const preset = RULE_PRESETS.find((p) => p.id === presetId) ?? RULE_PRESETS[0];
  const rules = decoded?.ok ? decoded.rules : preset?.rules;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
        <div className="text-center">
          <h1 className="font-black text-4xl tracking-tight">Mighty</h1>
          <p className="mt-1 text-sm opacity-70">빈자리는 컴퓨터가 채웁니다</p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-sm">규칙</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {RULE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPresetId(p.id);
                  setRuleText("");
                }}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-xs",
                  p.id === presetId && !decoded?.ok
                    ? "border-amber-300 bg-white text-black"
                    : "border-white/15 bg-white/5",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <label htmlFor="rule-string" className="font-semibold text-sm">
            규칙 문자열 (원작 Mighty Network와 같은 형식)
          </label>
          <input
            id="rule-string"
            value={ruleText || (rules ? encodeRuleString(rules) : "")}
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

        <ActionButton
          disabled={!rules}
          className="py-3 text-base"
          onClick={() => rules && onStart(rules)}
        >
          {rules ? `${rules.playerCount}마로 시작` : "규칙을 고르세요"}
        </ActionButton>
      </div>
    </main>
  );
}
