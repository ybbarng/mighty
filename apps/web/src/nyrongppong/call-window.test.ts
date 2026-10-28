import { ManualClock } from "@mighty/fair-play";
import { nyrongppongIntermediateBot } from "@mighty/nyrongppong-ai";
import {
  type Action,
  createNyrongppongScenario,
  type NyrongppongState,
  replay,
  STANDARD_RULES,
} from "@mighty/nyrongppong-engine";
import { describe, expect, it } from "vitest";

import { LocalMatch } from "@/game/local-match";

import { nyrongppongKit } from "./kit";

/** 2인: 컴퓨터(1)가 3월을 버리면 내(0) 손의 3월 두 장으로 뽕할 수 있다 */
const SCENE = () =>
  createNyrongppongScenario({
    hands: [
      ["03r", "03p", "06a", "08g", "11g"],
      ["03g", "02a", "04a", "05a", "07a", "10a"],
    ],
    deck: ["12g", "12a", "01r", "09a", "04r", "05r", "06r", "07r"],
    turn: 1,
  });

/** 혼자 하기: 컴퓨터가 바로 버리고, 응답 창은 시험이 옮기는 시계로 잰다 */
function solo() {
  const clock = new ManualClock();
  // 중수 컴퓨터는 짝이 아닌 가장 큰 달(10월)을 버린다. 3월을 버리게 버릴 카드를 정해 둔다.
  const bot = {
    name: "버리기 정해 둔 컴퓨터",
    decide: (
      view: Parameters<typeof nyrongppongIntermediateBot.decide>[0],
      rng: Parameters<typeof nyrongppongIntermediateBot.decide>[1],
    ): Action =>
      view.decision?.kind === "discard" && view.hand.includes("03g")
        ? { type: "discard", card: "03g" }
        : nyrongppongIntermediateBot.decide(view, rng),
  };
  const initial = SCENE();
  const match = new LocalMatch({
    kit: nyrongppongKit,
    rules: initial.rules,
    seed: 1,
    humanSeat: 0,
    bot,
    clock,
    initialState: initial,
  });
  const state = () => JSON.parse(match.serialize()) as NyrongppongState;
  return { clock, match, state };
}

describe("뽕 응답 창(혼자 하기)", () => {
  it("컴퓨터가 버린 패에 내가 뽕할 수 있으면 창이 열리고 나를 기다린다", () => {
    const { match, state } = solo();
    expect(state().phase).toBe("call");
    expect(match.current().decision).toEqual({ kind: "call" });
    expect(match.current().call?.left).toBe(5000);
  });

  it("시간 안에 뽕하면 받는다. 응답에는 쓴 시간을 싣는다(창의 남은 시간이 이어지게)", () => {
    const { clock, match, state } = solo();
    clock.advance(1200);
    expect(match.submit({ type: "call" })).toEqual({ ok: true });
    expect(match.actionLog().at(-1)).toEqual({
      seat: 0,
      action: { type: "call", spent: 1200 },
    });
    expect(state().melds[0]).toEqual([["03g", "03r", "03p"]]);
    expect(match.current().decision).toEqual({ kind: "discard", yak: null });
  });

  it("시간이 다 되면 대국을 돌리는 기기가 응답 시간 끝을 기록하고 넘어간다", () => {
    const { clock, match, state } = solo();
    clock.advance(5000);
    expect(state().phase).toBe("call");
    clock.advance(1);
    expect(state().phase).not.toBe("call");
    expect(match.actionLog().at(-1)).toEqual({
      seat: 0,
      action: { type: "timeout", spent: 5001 },
    });
    expect(state().melds[0]).toEqual([]);
    // 늦게 누른 뽕은 받지 않는다.
    expect(match.submit({ type: "call" }).ok).toBe(false);
  });

  it("기록에 실은 시간 그대로 다시 하면 같은 상태다(복기·검증)", () => {
    const { clock, match, state } = solo();
    clock.advance(5001);
    const saved = match.save();
    let s = SCENE();
    for (const entry of saved.log) {
      const r = nyrongppongKit.step(s, entry.seat, entry.action);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(s).toEqual(state());
  });

  it("참가자가 보낸 그대로로 되돌릴 때 쓴 시간을 빼고, 응답 시간 끝은 버린다", () => {
    const timing = nyrongppongKit.timing;
    expect(timing?.strip({ type: "call", spent: 300 })).toEqual({
      type: "call",
    });
    expect(timing?.strip({ type: "timeout", spent: 5001 })).toBeNull();
    expect(timing?.strip({ type: "discard", card: "01g" })).toEqual({
      type: "discard",
      card: "01g",
    });
    expect(timing?.stamp({ type: "discard", card: "01g" }, 10)).toEqual({
      type: "discard",
      card: "01g",
    });
  });

  it("처음부터 한 게임도 엔진 다시 하기와 같다", () => {
    const clock = new ManualClock();
    const rules = { ...STANDARD_RULES, players: 3, rounds: 1 };
    const match = new LocalMatch({
      kit: nyrongppongKit,
      rules,
      seed: 21,
      humanSeat: 0,
      bot: nyrongppongIntermediateBot,
      clock,
    });
    for (let i = 0; i < 500; i++) {
      const view = match.current();
      if (view.phase === "gameOver") break;
      if (view.decision?.kind === "call") clock.advance(5001);
      else if (view.decision)
        match.submit(nyrongppongIntermediateBot.decide(view, { seed: i }));
    }
    expect(match.current().phase).toBe("gameOver");
    const again = replay(rules, 21, match.save().log);
    expect(again.ok && again.state).toEqual(JSON.parse(match.serialize()));
  });
});
