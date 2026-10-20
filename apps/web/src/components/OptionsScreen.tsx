"use client";

import {
  decodeRuleString,
  encodeRuleString,
  RULE_PRESETS,
} from "@mighty/engine";
import { type ReactNode, useState } from "react";

import { BOT_LEVELS } from "@/game/bots";
import { SPEEDS, useSettings } from "@/game/settings";
import { play as playCue } from "@/game/sound";
import { cn } from "@/lib/cn";

import { CardArt } from "./card-art/CardArt";
import { CARD_BACKS, CARD_THEMES } from "./card-art/themes";
import { ActionButton } from "./panels/common";
import { RuleEditor } from "./rules/RuleEditor";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

const chip = (selected: boolean) =>
  cn(
    "rounded-lg border px-2 py-1.5 text-xs",
    selected
      ? "border-amber-300 bg-white text-black"
      : "border-white/15 bg-white/5",
  );

/** 옵션: 규칙, 카드 디자인, 컴퓨터 실력, 진행 속도, 효과음 */
export function OptionsScreen({ onBack }: { onBack: () => void }) {
  const settings = useSettings();
  // 입력 중인 규칙 문자열. 올바르면 바로 고른 규칙이 된다.
  const [ruleText, setRuleText] = useState(settings.ruleCode);
  const [editing, setEditing] = useState(false);
  const [saveName, setSaveName] = useState("");
  const decoded = ruleText.trim() ? decodeRuleString(ruleText) : null;
  const rules = decoded?.ok ? decoded.rules : null;
  const code = rules ? encodeRuleString(rules) : null;

  const chooseRule = (next: string) => {
    setRuleText(next);
    const result = decodeRuleString(next);
    if (result.ok) settings.setRuleCode(encodeRuleString(result.rules));
  };

  return (
    <main className="flex min-h-dvh justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-black text-2xl">옵션</h1>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            처음으로
          </button>
        </div>

        <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl backdrop-blur">
          <Section title="규칙">
            <div className="grid grid-cols-3 gap-1.5">
              {RULE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chooseRule(p.code)}
                  className={chip(p.code === code)}
                >
                  {p.name}
                </button>
              ))}
              {settings.customRules.map((r) => (
                <span
                  key={r.name}
                  className={cn(
                    chip(r.code === code),
                    "flex items-center justify-between gap-1",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => chooseRule(r.code)}
                    className="truncate"
                  >
                    {r.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`${r.name} 지우기`}
                    onClick={() => settings.removeCustomRule(r.name)}
                    className="opacity-50 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <ActionButton
              variant="secondary"
              className="py-1.5 text-xs"
              disabled={!rules}
              onClick={() => setEditing(true)}
            >
              규칙 자세히 보기·고치기
            </ActionButton>
            <label htmlFor="rule-string" className="mt-1 text-xs opacity-80">
              규칙 문자열 (원작 Mighty Network와 같은 형식)
            </label>
            <input
              id="rule-string"
              value={ruleText}
              onChange={(e) => chooseRule(e.target.value)}
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
              ![...RULE_PRESETS, ...settings.customRules].some(
                (r) => r.code === code,
              ) && (
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
                      settings.saveCustomRule({ name: saveName.trim(), code });
                      setSaveName("");
                    }}
                  >
                    내 규칙으로 저장
                  </ActionButton>
                </div>
              )}
          </Section>

          <Section title="카드 디자인">
            <div className="flex flex-wrap items-center gap-1.5">
              {CARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => settings.setCardTheme(t.id)}
                  className={chip(t.id === settings.cardThemeId)}
                >
                  {t.name}
                </button>
              ))}
              <a href="/cards" className="ml-auto text-xs underline opacity-70">
                모든 카드 보기
              </a>
            </div>
          </Section>

          <Section title="카드 뒷면">
            <div className="flex flex-wrap gap-2">
              {[{ id: "theme", name: "테마대로" }, ...CARD_BACKS].map((b) => {
                const theme =
                  CARD_THEMES.find((t) => t.id === settings.cardThemeId) ??
                  CARD_THEMES[0];
                const back = "base" in b ? b : theme?.back;
                const selected = settings.cardBackId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => settings.setCardBack(b.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg p-1 text-[11px]",
                      selected
                        ? "bg-white/20 ring-2 ring-amber-300"
                        : "bg-white/5",
                    )}
                  >
                    <span className="block aspect-[5/7] w-10">
                      {theme && back && (
                        <CardArt
                          card={null}
                          theme={{ ...theme, id: `preview-${b.id}`, back }}
                        />
                      )}
                    </span>
                    {b.name}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="카드 툴팁">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => settings.setCardTip(true)}
                className={chip(settings.cardTip)}
              >
                켜기
              </button>
              <button
                type="button"
                onClick={() => settings.setCardTip(false)}
                className={chip(!settings.cardTip)}
              >
                끄기
              </button>
            </div>
            <p className="text-xs opacity-60">
              손패 카드에 그 무늬에서 아직 안 나온 높은 카드를 보여 줍니다. 예:
              ♥9 (A K J). 친구와 할 때는 꺼집니다.
            </p>
          </Section>

          <Section title="컴퓨터 이름">
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <input
                  key={n}
                  aria-label={`컴퓨터 ${n} 이름`}
                  value={settings.botNames[n - 1] ?? ""}
                  onChange={(e) => settings.setBotName(n, e.target.value)}
                  placeholder={`컴퓨터 ${n}`}
                  maxLength={8}
                  className="min-w-0 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs"
                />
              ))}
            </div>
            <p className="text-xs opacity-60">
              내 다음 차례부터 1번. 친구와 할 때는 방장이 정한 이름이 빈자리에
              쓰입니다.
            </p>
          </Section>

          <Section title="컴퓨터 실력">
            <div className="flex items-center gap-1.5">
              {BOT_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => settings.setBotLevel(level.value)}
                  className={chip(level.value === settings.botLevel)}
                >
                  {level.label}
                </button>
              ))}
              <span className="ml-auto text-xs opacity-60">
                {settings.botLevel === 2
                  ? "남의 패를 추측해 수를 읽는다"
                  : "정해진 요령대로 둔다"}
              </span>
            </div>
          </Section>

          <Section title="진행 속도">
            <div className="flex gap-1.5">
              {SPEEDS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => settings.setSpeed(s.value)}
                  className={chip(s.value === settings.speed)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="효과음">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => settings.setSound(true)}
                className={chip(settings.sound)}
              >
                켜기
              </button>
              <button
                type="button"
                onClick={() => settings.setSound(false)}
                className={chip(!settings.sound)}
              >
                끄기
              </button>
              {settings.sound && (
                <input
                  type="range"
                  aria-label="효과음 크기"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(settings.volume * 100)}
                  onChange={(e) =>
                    settings.setVolume(Number(e.target.value) / 100)
                  }
                  onPointerUp={() => playCue("card")}
                  onKeyUp={() => playCue("card")}
                  className="ml-2 flex-1 accent-amber-400"
                />
              )}
            </div>
          </Section>
        </div>
      </div>
      {editing && rules && (
        <RuleEditor
          initial={rules}
          onClose={() => setEditing(false)}
          onApply={(next) => {
            chooseRule(encodeRuleString(next));
            setEditing(false);
          }}
        />
      )}
    </main>
  );
}
