import { createRng, nextInt } from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { CENTER, DONE, HOME, MO } from "./board";
import { CHAIN_LENGTH, chainCommit, chainLink, derivedSeed } from "./chain";
import {
  createMatch,
  legalMoves,
  pendingSeats,
  replay,
  step,
  viewOf,
} from "./match";
import { STANDARD_RULES, TEAM_RULES, type YutRules } from "./rules";
import { createYutScenario } from "./scenario";
import type { Action, GameEvent, YutState } from "./state";

/** 그 자리 기기가 낼 사슬 행동(재료로 만든 씨앗, 실제 기기·컴퓨터와 같은 방식) */
function chainAction(state: YutState, seat: number): Action {
  const seed = derivedSeed(state.keys[seat] as string, state.generation);
  if (state.phase === "commit")
    return { type: "commit", hash: chainCommit(seed) };
  const used = state.chains[seat]?.used ?? 0;
  return { type: "reveal", link: chainLink(seed, used + 1) };
}

function must(state: YutState, seat: number, action: Action) {
  const result = step(state, seat, action);
  if (!result.ok) throw new Error(`${result.error}: ${JSON.stringify(action)}`);
  return result;
}

/** 약속·공개는 기기처럼 자동으로, 던지기는 바로, 움직이기는 rng로 아무 수나 */
function playOut(
  rules: YutRules,
  seed: number,
): {
  state: YutState;
  log: { seat: number; action: Action }[];
  events: GameEvent[];
} {
  let { state, events } = createMatch(rules, seed);
  const rng = createRng(seed + 1);
  const log: { seat: number; action: Action }[] = [];
  for (let guard = 0; state.phase !== "gameOver"; guard++) {
    if (guard > 20000) throw new Error("게임이 끝나지 않는다");
    const seat = pendingSeats(state)[0] as number;
    let action: Action;
    if (state.phase === "commit" || state.phase === "reveal")
      action = chainAction(state, seat);
    else if (state.phase === "throw") action = { type: "throw" };
    else {
      const options = legalMoves(state);
      const pick = options[nextInt(rng, options.length)];
      if (!pick) throw new Error("움직일 수가 없는데 움직일 차례다");
      action = { type: "move", value: pick.value, from: pick.from };
    }
    const result = must(state, seat, action);
    log.push({ seat, action });
    state = result.state;
    events = events.concat(result.events);
  }
  return { state, log, events };
}

/** 시작해서 모두 약속하고 첫 던지기 차례까지 */
function started(rules: YutRules = STANDARD_RULES, seed = 3): YutState {
  let { state } = createMatch(rules, seed);
  for (let s = 0; s < rules.players; s++)
    state = must(state, s, chainAction(state, s)).state;
  return state;
}

describe("게임 진행", () => {
  it("모두 약속하면 첫 차례가 던진다", () => {
    const state = started();
    expect(state.phase).toBe("throw");
    expect(pendingSeats(state)).toEqual([state.turn]);
  });

  it("던지면 모든 자리가 공개하고, 결과가 모인다", () => {
    let state = started();
    const thrower = state.turn;
    state = must(state, thrower, { type: "throw" }).state;
    expect(state.phase).toBe("reveal");
    expect(pendingSeats(state)).toEqual([0, 1]);
    state = must(state, 0, chainAction(state, 0)).state;
    const last = must(state, 1, chainAction(state, 1));
    const result = last.events.find((e) => e.type === "result");
    expect(result).toBeDefined();
    expect(last.state.throwCount).toBe(1);
    expect(last.state.lastThrow?.seat).toBe(thrower);
  });

  // 편 놀이·3인은 편과 차례가 도는 길을 보므로 말 2개로 짧게 둔다(말 수만큼 판이 길어질 뿐이다)
  for (const [label, rules] of [
    ["1:1 기본", STANDARD_RULES],
    ["2:2 편 놀이(말 2개)", { ...TEAM_RULES, pieces: 2 }],
    ["3인 각자(말 2개)", { ...STANDARD_RULES, players: 3, pieces: 2 }],
    [
      "말 2개, 빽도 없음, 고른 확률, 서면 남",
      {
        ...STANDARD_RULES,
        pieces: 2,
        backDo: false,
        flatPercent: 50,
        landOnHome: true,
      },
    ],
  ] as [string, YutRules][]) {
    it(`${label}: 끝까지 두면 한 편이 말을 모두 낸다`, () => {
      for (const seed of [1, 2, 3]) {
        const { state } = playOut(rules, seed);
        expect(state.result?.kind).toBe("finish");
        const side = state.result?.side as number;
        expect(
          state.pieces
            .filter((p) => p.side === side)
            .every((p) => p.point === DONE),
        ).toBe(true);
      }
    });
  }

  it("기록대로 다시 두면 같은 상태가 된다", () => {
    const { state, log } = playOut(STANDARD_RULES, 11);
    const again = replay(STANDARD_RULES, 11, log);
    expect(again.ok && again.state).toEqual(state);
  });

  it("화면에는 내 사슬 재료만 보인다", () => {
    const { state } = createMatch(STANDARD_RULES, 5);
    const view = viewOf(state, 1);
    expect(view.botKey).toBe(state.keys[1]);
    expect(JSON.stringify(view)).not.toContain(state.keys[0] as string);
  });
});

describe("잘못된 행동 거절", () => {
  it("차례가 아닌 사람은 던질 수 없다", () => {
    const state = started();
    const other = 1 - state.turn;
    expect(step(state, other, { type: "throw" }).ok).toBe(false);
  });

  it("약속한 사슬의 다음 고리가 아니면 받지 않는다", () => {
    let state = started();
    state = must(state, state.turn, { type: "throw" }).state;
    const seed = derivedSeed(state.keys[0] as string, 0);
    // 한 칸 건너뛴 고리, 다른 씨앗의 고리
    expect(
      step(state, 0, { type: "reveal", link: chainLink(seed, 2) }).ok,
    ).toBe(false);
    expect(
      step(state, 0, {
        type: "reveal",
        link: chainLink(derivedSeed("other", 0), 1),
      }).ok,
    ).toBe(false);
  });

  it("두 번 약속할 수 없고, 모아 두지 않은 결과로는 움직일 수 없다", () => {
    let { state } = createMatch(STANDARD_RULES, 3);
    state = must(state, 0, chainAction(state, 0)).state;
    expect(
      step(state, 0, chainAction({ ...state, phase: "commit" }, 0)).ok,
    ).toBe(false);
    const scene = createYutScenario({ pieces: [], pending: [2] });
    expect(step(scene, 0, { type: "move", value: 3, from: HOME }).ok).toBe(
      false,
    );
    expect(step(scene, 0, { type: "move", value: 2, from: HOME }).ok).toBe(
      true,
    );
  });
});

describe("업기·잡기·버리기", () => {
  it("상대 말을 잡으면 처음으로 보내고 한 번 더 던진다", () => {
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: 2 },
        { side: 1, point: 5 },
        { side: 1, point: 5 },
      ],
      pending: [3],
    });
    const { state, events } = must(scene, 0, {
      type: "move",
      value: 3,
      from: 2,
    });
    const moved = events.find((e) => e.type === "moved");
    expect(moved?.type === "moved" && moved.captured).toBe(2);
    expect(
      state.pieces.filter((p) => p.side === 1 && p.point === HOME),
    ).toHaveLength(4);
    expect(state.phase).toBe("throw");
    expect(state.turn).toBe(0);
  });

  it("내 말에 도착하면 업고, 다음에는 함께 움직인다", () => {
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: 1 },
        { side: 0, point: 3 },
      ],
      pending: [2, 4],
    });
    let { state } = must(scene, 0, { type: "move", value: 2, from: 1 });
    expect(
      state.pieces.filter((p) => p.side === 0 && p.point === 3),
    ).toHaveLength(2);
    const option = legalMoves(state).find((o) => o.from === 3 && o.value === 4);
    expect(option?.to).toBe(7);
    state = must(state, 0, { type: "move", value: 4, from: 3 }).state;
    expect(
      state.pieces.filter((p) => p.side === 0 && p.point === 7),
    ).toHaveLength(2);
  });

  it("업힌 말이 함께 지름길을 타고, 방에서 나간다", () => {
    const scene = createYutScenario({
      pieces: [
        { side: 0, point: MO },
        { side: 0, point: MO },
      ],
      pending: [3, 4],
    });
    let { state } = must(scene, 0, { type: "move", value: 3, from: MO });
    expect(state.pieces.filter((p) => p.point === CENTER)).toHaveLength(2);
    const result = must(state, 0, { type: "move", value: 4, from: CENTER });
    state = result.state;
    const moved = result.events.find((e) => e.type === "moved");
    expect(moved?.type === "moved" && moved.finished).toBe(true);
    expect(
      state.pieces.filter((p) => p.side === 0 && p.point === DONE),
    ).toHaveLength(2);
  });

  it("판에 말이 없으면 빽도를 버리고 차례가 넘어간다", () => {
    const scene = createYutScenario({
      pieces: [{ side: 0, point: 19 }],
      pending: [2, -1],
    });
    const { state, events } = must(scene, 0, {
      type: "move",
      value: 2,
      from: 19,
    });
    expect(events.some((e) => e.type === "discarded")).toBe(true);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe("throw");
  });

  it("새 말을 내보낸 뒤라면 같은 차례의 빽도를 그 말에 쓸 수 있다", () => {
    const scene = createYutScenario({ pieces: [], pending: [3, -1] });
    const { state } = must(scene, 0, { type: "move", value: 3, from: HOME });
    expect(state.phase).toBe("move");
    const back = legalMoves(state).find((o) => o.value === -1);
    expect(back?.to).toBe(2);
  });

  it("마지막 말이 나면 이긴다", () => {
    const scene = createYutScenario({
      rules: { ...STANDARD_RULES, pieces: 2 },
      pieces: [
        { side: 0, point: DONE },
        { side: 0, point: 18 },
      ],
      pending: [3],
    });
    const { state } = must(scene, 0, { type: "move", value: 3, from: 18 });
    expect(state.phase).toBe("gameOver");
    expect(state.result).toEqual({ kind: "finish", side: 0 });
  });
});

describe("끝내기·기권·사슬 다시 약속", () => {
  it("공개를 기다리던 사람이 하나뿐이면 그 사람의 편이 진다", () => {
    let state = started();
    state = must(state, state.turn, { type: "throw" }).state;
    state = must(state, 0, chainAction(state, 0)).state;
    const { state: ended } = must(state, 0, { type: "retire" });
    expect(ended.result).toEqual({ kind: "forfeit", seat: 1, side: 0 });
    expect(ended.retired).toBe(true);
  });

  it("기권하면 상대 편이 이긴다", () => {
    const state = started();
    const { state: ended } = must(state, 1, { type: "resign" });
    expect(ended.result).toEqual({ kind: "resign", seat: 1, side: 0 });
  });

  it("사슬을 다 쓰면 다음 던지기 전에 모두 다시 약속한다", () => {
    const scene = createYutScenario({ pieces: [], pending: [2] });
    const worn: YutState = {
      ...scene,
      chains: scene.chains.map((c) => ({ ...c, used: CHAIN_LENGTH })),
    };
    let { state, events } = must(worn, 0, {
      type: "move",
      value: 2,
      from: HOME,
    });
    expect(events.some((e) => e.type === "recommit")).toBe(true);
    expect(state.phase).toBe("commit");
    expect(state.generation).toBe(1);
    state = must(state, 0, chainAction(state, 0)).state;
    state = must(state, 1, chainAction(state, 1)).state;
    expect(state.phase).toBe("throw");
  });
});
