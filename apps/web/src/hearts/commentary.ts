import { evaluateHeartsPlays } from "@mighty/hearts-ai";
import {
  type Action,
  type MatchState,
  pointsOf,
  viewOf,
} from "@mighty/hearts-engine";

import type { Commentary, Verdict } from "@/game/kit";
import { cardLabel } from "@/game/terms";
import { signed, verdictOf } from "@/review/commentary";

import { directionLabel } from "./terms";

/** 해설에 쓰는 추측 판 수. 고수가 두는 것과 같다 */
const PLAY_WORLDS = 30;
/** 점수 손해로 평가하는 경계(다른 사람 평균 − 내 점수): 좋은·괜찮은·아쉬운 수 */
const STEPS = [0.5, 1.5, 4] as const;

/** 하트 다시 보기 걸음 해설: 카드 내기는 카드마다 평균 점수 차이 */
export function explainHearts(
  state: MatchState,
  next: { seat: number; action: unknown },
  after: MatchState | null,
  seed: number,
  name: (seat: number) => string,
): Commentary {
  const view = viewOf(state, next.seat);
  const action = next.action as Action;
  const decision = view.decision;
  const situation: string[] = [];
  const reasons: string[] = [];
  let verdict: Verdict | null = null;

  if (decision?.kind === "pass") {
    situation.push(
      `넘기기 단계 · ${directionLabel(view.direction)}으로 ${decision.count}장`,
    );
    reasons.push(
      "넘길 카드는 ♠Q·♠A·♠K와 높은 하트처럼 먹기 쉬운 카드가 먼저다. 낮은 스페이드가 많으면 ♠Q를 쥐고 버틸 수도 있다",
    );
    return { situation, verdict, reasons };
  }

  if (decision?.kind === "play" && action.type === "play") {
    const trick = view.trick;
    situation.push(
      `${view.trickIndex + 1}/13턴 · 하트 ${view.heartsBroken ? "깨짐" : "안 깨짐"} · ${
        trick && trick.plays.length > 0
          ? `나온 카드 ${trick.plays.map((p) => `${cardLabel(p.card)}(${name(p.seat)})`).join(" ")}`
          : `${name(next.seat)}이(가) 선`
      }`,
    );
    const values = evaluateHeartsPlays(view, { seed }, PLAY_WORLDS);
    if (values && values.length > 1) {
      const sorted = [...values].sort((x, y) => y.mean - x.mean);
      const best = sorted[0];
      const chosen = values.find((v) => v.card === action.card);
      if (best && chosen) {
        verdict = verdictOf(Math.max(0, best.mean - chosen.mean), STEPS);
        reasons.push(
          `남의 패를 ${PLAY_WORLDS}가지로 추측해 끝까지 둬 보면 ${cardLabel(action.card)}는 평균 ${signed(chosen.mean)}점(다른 사람 평균보다 덜 먹은 점수)`,
        );
        if (best.card === action.card) reasons.push("계산상 가장 좋은 카드다");
        else
          reasons.push(
            `가장 좋은 카드는 ${cardLabel(best.card)}(평균 ${signed(best.mean)}점)`,
          );
        reasons.push(
          `다른 후보: ${sorted
            .slice(0, 4)
            .filter((v) => v.card !== action.card)
            .map((v) => `${cardLabel(v.card)} ${signed(v.mean)}`)
            .join(", ")}`,
        );
      }
    } else if (values?.length === 1)
      reasons.push("낼 수 있는 카드가 하나뿐이다");
    const done = after?.round.tricks[state.round.tricks.length];
    if (done) {
      const points = pointsOf(
        done.plays.map((p) => p.card),
        state.rules,
      );
      reasons.push(
        `이 턴은 ${name(done.winner)}이(가) 먹었다${points > 0 ? ` · ${points}점` : ""}`,
      );
    }
  }
  return { situation, verdict, reasons };
}
