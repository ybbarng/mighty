"use client";

import { bestKiruda } from "@mighty/ai";
import type { Action, Decision, Kiruda, PlayerView } from "@mighty/engine";
import { useState } from "react";

import { goalLabel } from "@/game/terms";

import { ActionButton, KirudaPicker, Panel, ScoreStepper } from "./common";

type ElectionDecision = Extract<Decision, { kind: "election" }>;

export function ElectionPanel({
  view,
  decision,
  seatName,
  onSubmit,
}: {
  view: PlayerView;
  decision: ElectionDecision;
  seatName: (seat: number) => string;
  onSubmit: (action: Action) => void;
}) {
  const suggestion = bestKiruda(view.rules, view.hand);
  const hasBid = (k: Kiruda) => decision.bids.some((g) => g.kiruda === k);
  const [kiruda, setKiruda] = useState<Kiruda>(
    hasBid(suggestion.kiruda)
      ? suggestion.kiruda
      : (decision.bids[0]?.kiruda ?? "S"),
  );
  const scores = decision.bids
    .filter((g) => g.kiruda === kiruda)
    .map((g) => g.score);
  const [score, setScore] = useState<number>(scores[0] ?? 0);
  const validScore = scores.includes(score) ? score : (scores[0] ?? 0);

  const current = decision.current;
  const target = Math.floor(suggestion.estimate);
  const reachable = decision.bids.some(
    (g) => g.kiruda === suggestion.kiruda && g.score <= target,
  );
  return (
    <Panel title="공약을 정하세요" term="goal">
      <p className="text-center text-sm opacity-80">
        {current && view.election.bidder !== null
          ? `지금 최고: ${seatName(view.election.bidder)} ${goalLabel(current)}`
          : "아직 아무도 출마하지 않았습니다"}
      </p>
      <div className="panel-pair flex flex-col gap-3">
        <KirudaPicker
          value={kiruda}
          enabled={hasBid}
          onChange={(k) => {
            setKiruda(k);
            setScore(decision.bids.find((g) => g.kiruda === k)?.score ?? 0);
          }}
        />
        {scores.length > 0 && (
          <ScoreStepper
            value={validScore}
            options={scores}
            onChange={setScore}
          />
        )}
      </div>
      <p className="panel-aside text-center text-xs opacity-60">
        {reachable
          ? `도움말: 이 패라면 ${goalLabel({ kiruda: suggestion.kiruda, score: target })} 정도까지 노려볼 만합니다`
          : "도움말: 지금 공약을 넘기기엔 패가 약해 보입니다. 포기를 고려해 보세요"}
      </p>
      <div className="flex justify-center gap-2">
        <ActionButton
          disabled={scores.length === 0}
          onClick={() =>
            onSubmit({ type: "bid", goal: { kiruda, score: validScore } })
          }
        >
          출마 {goalLabel({ kiruda, score: validScore })}
        </ActionButton>
        {decision.canPass && (
          <ActionButton
            variant="secondary"
            className="ml-4"
            onClick={() => onSubmit({ type: "pass" })}
          >
            포기
          </ActionButton>
        )}
        {decision.canDealMiss && (
          <ActionButton
            variant="danger"
            onClick={() => onSubmit({ type: "dealMiss" })}
          >
            딜미스
          </ActionButton>
        )}
      </div>
    </Panel>
  );
}
