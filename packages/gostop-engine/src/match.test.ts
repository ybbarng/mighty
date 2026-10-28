import { createRng, nextInt, type RngState } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import {
  createMatch,
  pendingSeats,
  replay,
  settlementFor,
  step,
  viewOf,
} from "./match";
import { GOSTOP3_RULES, type GostopRules, MATGO_RULES } from "./rules";
import { createGostopScenario, type GostopScenarioOptions } from "./scenario";
import type { Action, GameEvent, GostopState, LoggedAction } from "./state";

const ONE: GostopRules = { ...MATGO_RULES, rounds: 1 };

function scene(
  o: Partial<GostopScenarioOptions> &
    Pick<GostopScenarioOptions, "hands" | "floor" | "deck">,
) {
  return createGostopScenario({ rules: ONE, ...o });
}

function act(state: GostopState, seat: number, action: Action) {
  const r = step(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const kinds = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === "special" ? [e.kind] : []));

describe("판 나누기", () => {
  it("맞고는 10장씩·바닥 8장·더미 20장, 3명은 7장씩·바닥 6장·더미 21장", () => {
    const two = createMatch(MATGO_RULES, 7).state;
    expect(two.hands.map((h) => h.length)).toEqual([10, 10]);
    expect(two.floor).toHaveLength(8);
    expect(two.deck).toHaveLength(20);
    const three = createMatch(GOSTOP3_RULES, 7).state;
    expect(three.hands.map((h) => h.length)).toEqual([7, 7, 7]);
    expect(three.floor).toHaveLength(6);
    expect(three.deck).toHaveLength(21);
  });

  it("같은 시드면 같은 패, 다른 시드면 다른 패", () => {
    expect(createMatch(MATGO_RULES, 3).state).toEqual(
      createMatch(MATGO_RULES, 3).state,
    );
    expect(createMatch(MATGO_RULES, 3).state.hands).not.toEqual(
      createMatch(MATGO_RULES, 4).state.hands,
    );
  });

  it("바닥에 같은 달 넉 장이 깔리지 않는다", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { floor } = createMatch(MATGO_RULES, seed).state;
      const months = floor.map((id) => id.slice(0, 2));
      for (const m of months)
        expect(months.filter((x) => x === m).length).toBeLessThan(4);
    }
  });

  it("총통(같은 달 넉 장)을 받으면 바로 10점으로 이긴다", () => {
    let found: GostopState | null = null;
    for (let seed = 1; seed <= 5000 && !found; seed++) {
      const { state } = createMatch(ONE, seed);
      if (state.result?.kind === "chongtong") found = state;
    }
    expect(found).not.toBeNull();
    const s = found as GostopState;
    expect(s.result?.points).toBe(10);
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.scores[s.result?.winner as number]).toBe(10);
  });
});

describe("짝 맞추기", () => {
  const opp = {
    hands: [
      ["01g", "05p", "06p"],
      ["10p", "10q", "11p"],
    ],
  };

  it("같은 달이 하나면 먹고, 뒤집은 카드가 맞지 않으면 바닥에 둔다", () => {
    const s = scene({ ...opp, floor: ["01p", "07p"], deck: ["09p", "12r"] });
    const r = act(s, 0, { type: "play", card: "01g" });
    expect(r.state.captured[0]).toEqual(["01g", "01p"]);
    expect(r.state.floor.sort()).toEqual(["07p", "09p"]);
    expect(r.state.turn).toBe(1);
    expect(r.state.hands[0]).toEqual(["05p", "06p"]);
  });

  it("같은 달이 없으면 바닥에 둔다", () => {
    const s = scene({ ...opp, floor: ["01p"], deck: ["09p", "12r"] });
    const r = act(s, 0, { type: "play", card: "05p" });
    expect(r.state.captured[0]).toEqual([]);
    expect(r.state.floor.sort()).toEqual(["01p", "05p", "09p"]);
  });

  it("같은 달 둘이 다르면 고르고, 값이 같은 피 둘이면 묻지 않는다", () => {
    const s = scene({ ...opp, floor: ["01p", "01r"], deck: ["09p", "12r"] });
    const r = act(s, 0, { type: "play", card: "01g" });
    expect(r.state.stage).toBe("chooseHand");
    expect(viewOf(r.state, 0).decision).toEqual({
      kind: "choose",
      options: ["01p", "01r"],
      source: "hand",
    });
    expect(step(r.state, 0, { type: "choose", card: "07p" }).ok).toBe(false);
    const c = act(r.state, 0, { type: "choose", card: "01r" });
    expect(c.state.captured[0]?.sort()).toEqual(["01g", "01r"]);
    expect(c.state.floor.sort()).toEqual(["01p", "09p"]);

    const same = scene({ ...opp, floor: ["01p", "01q"], deck: ["09p", "12r"] });
    const auto = act(same, 0, { type: "play", card: "01g" });
    expect(auto.state.stage).toBe("play");
    expect(auto.state.captured[0]).toHaveLength(2);
  });

  it("뒤집은 카드와 같은 달이 둘이면 그것도 고른다", () => {
    const s = scene({ ...opp, floor: ["03g", "03r"], deck: ["03p", "12r"] });
    const r = act(s, 0, { type: "play", card: "05p" });
    expect(r.state.stage).toBe("chooseFlip");
    const c = act(r.state, 0, { type: "choose", card: "03g" });
    expect(c.state.captured[0]?.sort()).toEqual(["03g", "03p"]);
  });
});

describe("뻑·쪽·따닥·싹쓸이", () => {
  it("뻑: 먹으려던 달이 뒤집혀 나오면 석 장이 바닥에 쌓이고, 남이 먹으면 피 한 장을 준다", () => {
    const s = scene({
      hands: [
        ["01g", "05p", "06p"],
        ["01r", "10q", "11p"],
      ],
      floor: ["01p", "07p"],
      deck: ["01q", "12r", "12a"],
      captured: [["08p"], []],
    });
    const r = act(s, 0, { type: "play", card: "01g" });
    expect(kinds(r.events)).toEqual(["ppeok"]);
    expect(r.state.captured[0]).toEqual(["08p"]);
    expect(r.state.stacks).toEqual([{ month: 1, owner: 0 }]);
    expect(r.state.ppeok[0]).toBe(1);
    const t = act(r.state, 1, { type: "play", card: "01r" });
    expect(kinds(t.events)).toEqual(["stack"]);
    expect(t.state.captured[1]?.sort()).toEqual(
      ["01g", "01p", "01q", "01r", "08p"].sort(),
    );
    expect(t.state.captured[0]).toEqual([]);
    expect(t.state.stacks).toEqual([]);
  });

  it("자뻑: 내 뻑을 내가 먹으면 피를 두 장씩 받는다", () => {
    const s = scene({
      hands: [
        ["01g", "01r", "06p"],
        ["10p", "10q", "11p"],
      ],
      floor: ["01p", "07p"],
      deck: ["01q", "12r", "12a", "09p"],
      captured: [[], ["08p", "08q", "11d"]],
    });
    const a = act(s, 0, { type: "play", card: "01g" });
    const b = act(a.state, 1, { type: "play", card: "10p" });
    const c = act(b.state, 0, { type: "play", card: "01r" });
    expect(kinds(c.events)).toEqual(["selfStack"]);
    expect(c.state.captured[1]).toEqual(["11d"]);
  });

  it("쪽: 둔 카드를 뒤집은 카드가 바로 먹으면 피 한 장을 받는다", () => {
    const s = scene({
      hands: [
        ["05p", "06p"],
        ["10p", "11p"],
      ],
      floor: ["01p"],
      deck: ["05q", "12r"],
      captured: [[], ["07p", "07q"]],
    });
    const r = act(s, 0, { type: "play", card: "05p" });
    expect(kinds(r.events)).toEqual(["jjok"]);
    expect(r.state.captured[0]?.sort()).toEqual(["05p", "05q", "07p"]);
    expect(r.state.captured[1]).toEqual(["07q"]);
  });

  it("따닥: 바닥 둘과 같은 달을 내고 넷째가 뒤집혀 나오면 넉 장을 먹고 피를 받는다", () => {
    const s = scene({
      hands: [
        ["01g", "06p"],
        ["10p", "11p"],
      ],
      floor: ["01p", "01r", "07p"],
      deck: ["01q", "12r"],
      captured: [[], ["08p"]],
    });
    const r = act(s, 0, { type: "play", card: "01g" });
    const c = act(r.state, 0, { type: "choose", card: "01r" });
    expect(kinds(c.events)).toEqual(["ttadak"]);
    expect(c.state.captured[0]?.sort()).toEqual(
      ["01g", "01p", "01q", "01r", "08p"].sort(),
    );
  });

  it("싹쓸이: 바닥을 다 쓸면 피를 받는다(판 마지막 차례는 빼고)", () => {
    const s = scene({
      hands: [
        ["01g", "06p"],
        ["10p", "11p"],
      ],
      floor: ["01p", "03q"],
      deck: ["03p", "12r", "12a", "09p"],
      captured: [[], ["08p"]],
    });
    const r = act(s, 0, { type: "play", card: "01g" });
    expect(kinds(r.events)).toEqual(["sweep"]);
    expect(r.state.floor).toEqual([]);
    expect(r.state.captured[0]).toContain("08p");

    const last = scene({
      hands: [["01g"], []],
      floor: ["01p", "03q"],
      deck: ["03p"],
      captured: [[], ["08p"]],
    });
    expect(kinds(act(last, 0, { type: "play", card: "01g" }).events)).toEqual(
      [],
    );
  });
});

describe("흔들기·폭탄", () => {
  it("흔들기: 같은 달 석 장을 들고 바닥에 없으면 보여 주고 두 배", () => {
    const s = scene({
      hands: [
        ["02p", "02q", "02r", "05p"],
        ["10p", "10q", "11p", "11q"],
      ],
      floor: ["07p"],
      deck: ["09p", "12r", "12a", "09q"],
    });
    const view = viewOf(s, 0);
    expect(view.decision?.kind === "play" && view.decision.shakeable).toEqual([
      "02p",
      "02q",
      "02r",
    ]);
    const r = act(s, 0, { type: "play", card: "02p", shake: true });
    expect(r.state.shakes[0]).toBe(1);
    expect(r.state.revealed[0]).toEqual(["02q", "02r"]);
    expect(step(s, 0, { type: "play", card: "05p", shake: true }).ok).toBe(
      false,
    );
  });

  it("폭탄: 석 장과 바닥 한 장을 한꺼번에 먹고, 뒤집기만 하는 차례 둘을 얻는다", () => {
    const s = scene({
      hands: [
        ["02p", "02q", "02r", "05p"],
        ["10p", "10q", "11p", "11q"],
      ],
      floor: ["02a", "07p"],
      deck: ["09p", "12r", "12a", "09q", "06p", "06q"],
      captured: [[], ["08p"]],
    });
    const view = viewOf(s, 0);
    expect(view.decision?.kind === "play" && view.decision.bombs).toEqual([2]);
    const r = act(s, 0, { type: "bomb", month: 2 });
    expect(kinds(r.events)).toEqual(["bomb"]);
    expect(r.state.captured[0]?.sort()).toEqual(
      ["02a", "02p", "02q", "02r", "08p"].sort(),
    );
    expect(r.state.hands[0]).toEqual(["05p"]);
    expect(r.state.flipOwed[0]).toBe(2);
    expect(r.state.shakes[0]).toBe(1);
    const b = act(r.state, 1, { type: "play", card: "10p" });
    const f = act(b.state, 0, { type: "flip" });
    expect(f.events.some((e) => e.type === "flipOnly")).toBe(true);
    expect(f.state.flipOwed[0]).toBe(1);
  });
});

describe("고·스톱과 정산", () => {
  /** 8점이 나는 장면: 홍단 3 + 고도리 5 */
  const ready = () =>
    scene({
      hands: [
        ["08a", "05p", "06p"],
        ["10p", "10q", "11p"],
      ],
      floor: ["08p", "07p"],
      deck: ["09p", "12r", "12a", "09q", "04q", "03q"],
      captured: [["01r", "02r", "03r", "02a", "04a"], ["01p"]],
    });

  it("기준 점수가 나면 고·스톱을 묻고, 스톱하면 이긴다", () => {
    const r = act(ready(), 0, { type: "play", card: "08a" });
    expect(r.state.stage).toBe("goStop");
    expect(viewOf(r.state, 0).decision).toEqual({
      kind: "goStop",
      score: 8,
      goCount: 0,
    });
    expect(step(r.state, 0, { type: "play", card: "05p" }).ok).toBe(false);
    const stop = act(r.state, 0, { type: "stop" });
    expect(stop.state.phase).toBe("gameOver");
    expect(stop.state.result?.points).toBe(8);
    // 상대는 광을 안 먹었지만 이긴 사람도 광 점수가 없어 광박이 아니다. 피박은 피 점수가 있을 때만
    expect(stop.state.result?.baks[1]).toEqual([]);
    expect(stop.state.scores).toEqual([8, -8]);
  });

  it("고를 부르면 1점 덤, 점수가 더 나야 다시 묻는다", () => {
    const r = act(ready(), 0, { type: "play", card: "08a" });
    const go = act(r.state, 0, { type: "go" });
    expect(go.state.goCount[0]).toBe(1);
    expect(go.state.turn).toBe(1);
    // 같은 점수에서는 묻지 않는다
    const b = act(go.state, 1, { type: "play", card: "10p" });
    const c = act(b.state, 0, { type: "play", card: "05p" });
    expect(c.state.stage).toBe("play");
    const settled = settlementFor(c.state, 0);
    expect(settled.goBonus).toBe(1);
    expect(settled.points).toBe(9);
  });

  it("박: 피박·광박·멍박·고박은 진 사람마다 두 배씩", () => {
    const s = scene({
      hands: [["05p"], ["06p"]],
      floor: [],
      deck: [],
      captured: [
        [
          "01g",
          "03g",
          "08g",
          "02a",
          "05a",
          "06a",
          "07a",
          "10a",
          "12a",
          "04a",
          "01p",
          "01q",
          "02p",
          "02q",
          "03p",
          "03q",
          "04p",
          "04q",
          "05q",
          "11d",
        ],
        ["06q", "07p"],
      ],
      goCount: [0, 1],
    });
    const result = settlementFor(s, 0);
    expect(result.baks[1]).toEqual(["pi", "gwang", "meong", "go"]);
    // 광 3 + 열끗 7장 3 + 피 11장 2 = 8점, 박 넷 → ×16
    expect(result.breakdown?.total).toBe(8);
    expect(result.deltas).toEqual([128, -128]);
  });

  it("3명: 고를 부르고 진 사람이 진 사람 몫을 모두 낸다", () => {
    const s = createGostopScenario({
      rules: { ...GOSTOP3_RULES, rounds: 1 },
      hands: [["05p"], ["06p"], ["07p"]],
      floor: [],
      deck: [],
      captured: [["01g", "03g", "08g"], ["01r"], []],
      goCount: [0, 0, 1],
    });
    const result = settlementFor(s, 0);
    expect(result.payer).toBe(2);
    // 광 3점: 자리 1은 광박 ×2 = 6, 자리 2는 광박·고박 ×4 = 12, 모두 자리 2가 낸다
    expect(result.deltas).toEqual([18, 0, -18]);
  });

  it("아무도 못 나면 나가리, 다음 판은 두 배", () => {
    const s = createGostopScenario({
      rules: { ...MATGO_RULES, rounds: 2 },
      hands: [["05p"], ["06p"]],
      floor: [],
      deck: ["07p", "09p"],
    });
    const a = act(s, 0, { type: "play", card: "05p" });
    const b = act(a.state, 1, { type: "play", card: "06p" });
    expect(b.state.result?.kind).toBe("nagari");
    expect(b.state.phase).toBe("roundEnd");
    expect(b.state.nagari).toBe(1);
    const c = act(b.state, 0, { type: "continue" });
    expect(pendingSeats(c.state)).toEqual([1]);
    const d = act(c.state, 1, { type: "continue" });
    expect(d.state.roundNumber).toBe(2);
    expect(d.state.hands[0]).toHaveLength(10);
    expect(d.events[0]).toMatchObject({ type: "roundStarted", nagari: 1 });
  });
});

describe("잘못된 행동", () => {
  it("차례가 아니거나, 없는 카드거나, 단계에 맞지 않으면 거절한다", () => {
    const { state } = createMatch(MATGO_RULES, 11);
    if (state.phase !== "play") return;
    const other = 1 - state.turn;
    const mine = state.hands[state.turn]?.[0] as string;
    expect(step(state, other, { type: "play", card: mine }).ok).toBe(false);
    const theirs = state.hands[other]?.[0] as string;
    expect(step(state, state.turn, { type: "play", card: theirs }).ok).toBe(
      false,
    );
    expect(step(state, state.turn, { type: "go" }).ok).toBe(false);
    expect(step(state, state.turn, { type: "continue" }).ok).toBe(false);
    expect(step(state, state.turn, { type: "flip" }).ok).toBe(false);
    expect(step(state, 5, { type: "go" }).ok).toBe(false);
  });
});

describe("화면", () => {
  it("남의 손패·더미 순서·시드는 보이지 않는다", () => {
    const { state } = createMatch(GOSTOP3_RULES, 5);
    const view = viewOf(state, 1);
    expect(view).not.toHaveProperty("hands");
    expect(view).not.toHaveProperty("deck");
    expect(view).not.toHaveProperty("seed");
    expect(view.hand).toEqual(state.hands[1]);
    expect(view.handCounts).toEqual([7, 7, 7]);
    expect(view.deckCount).toBe(21);
    const text = JSON.stringify(view);
    for (const id of [...(state.hands[0] ?? []), ...state.deck])
      expect(text).not.toContain(`"${id}"`);
  });
});

/** 아무 행동이나 고른다(시험용) */
function randomAction(state: GostopState, seat: number, rng: RngState): Action {
  const d = viewOf(state, seat).decision;
  if (!d) throw new Error("할 일이 없다");
  switch (d.kind) {
    case "continue":
      return { type: "continue" };
    case "goStop":
      return nextInt(rng, 2) === 0 ? { type: "go" } : { type: "stop" };
    case "choose":
      return {
        type: "choose",
        card: d.options[nextInt(rng, d.options.length)] as string,
      };
    case "play": {
      if (d.bombs.length > 0 && nextInt(rng, 2) === 0)
        return { type: "bomb", month: d.bombs[0] as never };
      if (d.flip && (d.cards.length === 0 || nextInt(rng, 3) === 0))
        return { type: "flip" };
      const card = d.cards[nextInt(rng, d.cards.length)] as string;
      return d.shakeable.includes(card) && nextInt(rng, 2) === 0
        ? { type: "play", card, shake: true }
        : { type: "play", card };
    }
  }
}

function cardsInPlay(s: GostopState): number {
  return (
    s.hands.flat().length +
    s.floor.length +
    s.deck.length +
    s.captured.flat().length
  );
}

describe("아무렇게나 끝까지", () => {
  it.each([
    ["맞고", { ...MATGO_RULES, rounds: 5 }],
    ["3명", { ...GOSTOP3_RULES, rounds: 5 }],
  ] as const)(
    "%s: 카드 48장이 그대로고, 점수 합은 0, 다시 돌리면 같다",
    (_n, rules) => {
      for (let seed = 1; seed <= 30; seed++) {
        let { state } = createMatch(rules, seed);
        const rng = createRng(seed * 31);
        const log: LoggedAction[] = [];
        for (let guard = 0; state.phase !== "gameOver"; guard++) {
          if (guard > 5000) throw new Error("끝나지 않는다");
          const seat = pendingSeats(state)[0] as number;
          const action = randomAction(state, seat, rng);
          state = act(state, seat, action).state;
          log.push({ seat, action });
          if (state.pending === null) expect(cardsInPlay(state)).toBe(48);
        }
        expect(state.history).toHaveLength(rules.rounds);
        expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);
        const again = replay(rules, seed, log);
        expect(again.ok && again.state).toEqual(state);
      }
    },
  );
});
