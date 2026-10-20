"use client";

import { type Card, maxGoal, type RuleSet } from "@mighty/engine";
import { type ReactNode, useState } from "react";

import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";

import { ActionButton, CardPicker } from "../panels/common";
import {
  BOOL_GROUPS,
  DEAL_MISS_FIELDS,
  LOSE_SCORING,
  REVERSE_RUN,
  WIN_SCORING,
} from "./rule-fields";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string | undefined;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
      />
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs opacity-55">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 p-3">
      <h3 className="mb-1 font-bold text-amber-200 text-sm">{title}</h3>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="accent-amber-400"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const CARD_FIELDS = [
  { key: "mighty", label: "마이티" },
  { key: "alterMighty", label: "기루다가 마이티 무늬일 때" },
  { key: "jokerCall", label: "조커콜" },
  { key: "alterJokerCall", label: "기루다가 조커콜 무늬일 때" },
] as const;

/** 원작 옵션 59개를 묶어서 고치는 화면 */
export function RuleEditor({
  initial,
  onApply,
  onClose,
}: {
  initial: RuleSet;
  onApply: (rules: RuleSet) => void;
  onClose: () => void;
}) {
  const [rules, setRules] = useState<RuleSet>({
    ...initial,
    dealMiss: { ...initial.dealMiss },
  });
  const [pickingCard, setPickingCard] = useState<
    (typeof CARD_FIELDS)[number]["key"] | null
  >(null);
  const set = <K extends keyof RuleSet>(key: K, value: RuleSet[K]) =>
    setRules((r) => ({ ...r, [key]: value }));
  const max = maxGoal(rules);

  return (
    <div className="fixed inset-0 z-[500] flex justify-center overflow-y-auto bg-felt-dark/95 p-3 backdrop-blur">
      <div className="flex w-full max-w-lg flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">규칙 자세히</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            닫기
          </button>
        </div>

        <Section title="기본">
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span>인원</span>
            <select
              value={rules.playerCount}
              onChange={(e) => set("playerCount", Number(e.target.value))}
              className="rounded-md bg-black/40 px-2 py-1"
            >
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}마
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between py-1.5 text-sm">
            <span>최소 공약</span>
            <input
              type="number"
              min={4}
              max={max}
              value={rules.minGoal}
              onChange={(e) =>
                set(
                  "minGoal",
                  Math.min(max, Math.max(4, Number(e.target.value) || 4)),
                )
              }
              className="w-20 rounded-md bg-black/40 px-2 py-1 text-right"
            />
          </div>
          {CARD_FIELDS.map((f) => (
            <div key={f.key} className="py-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span>{f.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPickingCard(pickingCard === f.key ? null : f.key)
                  }
                  className="rounded-md bg-white px-2 py-0.5 font-bold text-black"
                >
                  {cardLabel(rules[f.key])}
                </button>
              </div>
              {pickingCard === f.key && (
                <div className="mt-2">
                  <CardPicker
                    value={rules[f.key]}
                    available={(c: Card) => c !== "JK"}
                    allowJoker={false}
                    onChange={(c) => set(f.key, c)}
                  />
                </div>
              )}
            </div>
          ))}
        </Section>

        {BOOL_GROUPS.map((group) => (
          <Section key={group.title} title={group.title}>
            {group.fields.map((f) => (
              <Toggle
                key={f.key}
                checked={rules[f.key]}
                onChange={(v) => set(f.key, v)}
                label={f.label}
                hint={f.hint}
              />
            ))}
            {group.title === "점수 배수" && rules.doubleForReverseRun && (
              <div className="mt-1 pl-7">
                <p className="mb-1 text-xs opacity-60">백런 조건</p>
                <Choice
                  value={rules.reverseRunCondition}
                  options={REVERSE_RUN}
                  onChange={(v) => set("reverseRunCondition", v)}
                />
              </div>
            )}
          </Section>
        ))}

        <Section title="딜미스">
          {DEAL_MISS_FIELDS.map((f) => (
            <Toggle
              key={f.key}
              checked={rules.dealMiss[f.key]}
              onChange={(v) =>
                set("dealMiss", { ...rules.dealMiss, [f.key]: v })
              }
              label={f.label}
              hint={f.hint}
            />
          ))}
        </Section>

        <Section title="여당이 이겼을 때 점수">
          <Choice
            value={rules.winScoring}
            options={WIN_SCORING}
            onChange={(v) => set("winScoring", v)}
          />
        </Section>
        <Section title="야당이 이겼을 때 점수">
          <Choice
            value={rules.loseScoring}
            options={LOSE_SCORING}
            onChange={(v) => set("loseScoring", v)}
          />
        </Section>

        <div
          className={cn(
            "sticky bottom-0 flex gap-2 bg-gradient-to-t from-black/80 to-transparent pt-4 pb-2",
          )}
        >
          <ActionButton
            variant="secondary"
            className="flex-1"
            onClick={onClose}
          >
            취소
          </ActionButton>
          <ActionButton className="flex-1" onClick={() => onApply(rules)}>
            이 규칙으로
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
