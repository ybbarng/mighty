"use client";

import type { Action, Card, Decision, Goal, Kiruda } from "@mighty/engine";
import { useState } from "react";

import { goalLabel } from "@/game/terms";

import { ActionButton, KirudaPicker, Panel, ScoreStepper } from "./common";

type ExchangeDecision = Extract<Decision, { kind: "exchange" }>;

/** 주공: 바닥 카드를 받은 뒤 버릴 카드 고르기(손패에서 누른다)와 공약 바꾸기 */
export function ExchangePanel({
  decision,
  discards,
  onSubmit,
}: {
  decision: ExchangeDecision;
  discards: Card[];
  onSubmit: (action: Action) => void;
}) {
  const elected = decision.electedGoal;
  const [changing, setChanging] = useState(false);
  const [goal, setGoal] = useState<Goal>(elected);
  const has = (k: Kiruda) => decision.goals.some((g) => g.kiruda === k);
  const scores = decision.goals
    .filter((g) => g.kiruda === goal.kiruda)
    .map((g) => g.score);
  const ready = discards.length === decision.discardCount;

  return (
    <Panel title="당선을 축하합니다" term="kitty">
      <p className="text-center text-sm">
        손패에서 버릴 카드 <b>{decision.discardCount}장</b>을 누르세요 (
        {discards.length}/{decision.discardCount})
      </p>
      {changing ? (
        <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-2">
          <KirudaPicker
            value={goal.kiruda}
            enabled={has}
            onChange={(kiruda) => {
              const first = decision.goals.find((g) => g.kiruda === kiruda);
              if (first) setGoal(first);
            }}
          />
          <ScoreStepper
            value={goal.score}
            options={scores}
            onChange={(score) => setGoal({ ...goal, score })}
          />
          <p className="text-center text-xs opacity-60">
            기루다를 바꾸려면 공약을 더 올려야 합니다. 같은 기루다면 올리기만 할
            수 있습니다.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="text-center text-xs underline opacity-70"
          onClick={() => setChanging(true)}
        >
          공약 바꾸기 (지금 {goalLabel(elected)})
        </button>
      )}
      <div className="flex justify-center">
        <ActionButton
          disabled={!ready}
          onClick={() =>
            onSubmit({ type: "exchange", goal, discard: discards })
          }
        >
          {goalLabel(goal)}로 확정
        </ActionButton>
      </div>
    </Panel>
  );
}
