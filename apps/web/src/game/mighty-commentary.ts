import { analyzeElection, evaluatePlays, SEARCH_TUNING } from "@mighty/ai";
import {
  type Action,
  isPointCard,
  type MatchState,
  viewOf,
} from "@mighty/engine";

import { mean, signed, verdictOf } from "@/review/commentary";

import type { Commentary, Verdict } from "./kit";
import { cardLabel, goalLabel, kirudaName } from "./terms";

/** 해설에 쓰는 추측 판 수. 고수가 두는 것과 같다 */
const PLAY_WORLDS = 64;
const PLAN_WORLDS = 24;
/** 돈 손해로 평가하는 경계(판당 돈, 화면 돈의 1/10): 좋은·괜찮은·아쉬운 수 */
const STEPS = [0.15, 0.5, 1.5] as const;

/** 화면에 보이는 돈 단위(×10)로 */
function money(value: number): string {
  return `돈 ${signed(value * 10, 0)}`;
}

function playLabel(action: Action): string {
  if (action.type !== "play") return "";
  return `${cardLabel(action.card)}${action.jokerCall ? " 조커콜" : ""}`;
}

function samePlay(a: Action, b: Action): boolean {
  return (
    a.type === "play" &&
    b.type === "play" &&
    a.card === b.card &&
    Boolean(a.jokerCall) === Boolean(b.jokerCall) &&
    (a.jokerSuit ?? null) === (b.jokerSuit ?? null)
  );
}

/** 마이티 다시 보기 걸음 해설: 공약은 출마·포기 비교, 카드 내기는 수마다 평균 돈 */
export function explainMighty(
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

  if (decision?.kind === "election") {
    const { goal, bidder } = view.election;
    situation.push(
      goal && bidder !== null
        ? `공약 단계 · 지금 최고 ${goalLabel(goal)} (${name(bidder)})`
        : "공약 단계 · 아직 아무도 출마하지 않았다",
    );
    if (decision.canDealMiss || decision.bids.length === 0)
      return { situation, verdict, reasons };
    const a = analyzeElection(view, decision, PLAN_WORLDS, { seed });
    situation.push(
      `패 어림: ${kirudaName(a.estimate.kiruda)}로 약 ${a.estimate.estimate.toFixed(1)}장 · 지금 부를 수 있는 가장 낮은 공약 ${a.floor}장`,
    );
    const bid = action.type === "bid";
    if (a.hopeless) {
      reasons.push(
        `어림값이 가장 낮은 공약보다 ${SEARCH_TUNING.hopelessGap}장 넘게 모자란다. 마이티·조커·높은 기루다가 모자라 출마할 패가 아니다`,
      );
      verdict = bid ? "bad" : "good";
    } else if (a.bid) {
      const bidMean = mean(a.bid.samples);
      const stayMean = mean(a.stay);
      reasons.push(
        `남의 패를 ${a.stay.length}가지로 추측해 둬 보면 출마(${goalLabel(a.bid.goal)}) 평균 ${money(bidMean)}, 포기 평균 ${money(stayMean)}`,
      );
      const chosen = bid ? bidMean : stayMean;
      const other = bid ? stayMean : bidMean;
      reasons.push(
        chosen >= other
          ? `${bid ? "출마" : "포기"} 쪽이 낫다`
          : `${bid ? "포기" : "출마"} 쪽이 평균 돈 ${((other - chosen) * 10).toFixed(0)}만큼 낫다`,
      );
      verdict = verdictOf(Math.max(0, other - chosen), STEPS);
    }
    return { situation, verdict, reasons };
  }

  if (decision?.kind === "play" && view.goal) {
    const trick = view.trick;
    situation.push(
      `${view.trickIndex + 1}턴 · 기루다 ${kirudaName(view.goal.kiruda)} · ${
        trick && trick.plays.length > 0
          ? `나온 카드 ${trick.plays.map((p) => `${cardLabel(p.card)}(${name(p.seat)})`).join(" ")}`
          : `${name(next.seat)}이(가) 선`
      }`,
    );
    const values = evaluatePlays(view, { seed }, PLAY_WORLDS);
    if (values && values.length > 1) {
      const sorted = [...values].sort((x, y) => y.mean - x.mean);
      const best = sorted[0];
      const chosen = values.find((v) => samePlay(v.action, action));
      if (best && chosen) {
        const loss = Math.max(0, best.mean - chosen.mean);
        verdict = verdictOf(loss, STEPS);
        reasons.push(
          `남의 패를 ${PLAY_WORLDS}가지로 추측해 끝까지 둬 보면 이 수(${playLabel(action)})는 평균 ${money(chosen.mean)}`,
        );
        if (samePlay(best.action, action))
          reasons.push("계산상 가장 좋은 수다");
        else
          reasons.push(
            `가장 좋은 수는 ${playLabel(best.action)}(평균 ${money(best.mean)})`,
          );
        reasons.push(
          `다른 후보: ${sorted
            .slice(0, 4)
            .filter((v) => !samePlay(v.action, action))
            .map((v) => `${playLabel(v.action)} ${money(v.mean)}`)
            .join(", ")}`,
        );
      }
    } else if (values?.length === 1)
      reasons.push("낼 수 있는 카드가 하나뿐이다");
    const done = after?.round.tricks[state.round.tricks.length];
    if (done) {
      const points = done.plays.filter((p) => isPointCard(p.card)).length;
      const ruling =
        done.winner === after.round.declarer ||
        done.winner === after.round.friend;
      reasons.push(
        `이 턴은 ${name(done.winner)}이(가) 먹었다${points > 0 ? ` · 점수 카드 ${points}장이 ${ruling ? "여당" : "야당"}으로` : ""}`,
      );
    }
    return { situation, verdict, reasons };
  }

  return { situation, verdict, reasons };
}
