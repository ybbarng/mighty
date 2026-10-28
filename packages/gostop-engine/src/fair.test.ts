import { HWATU_DECK, isHiddenId, type PresetDeal } from "@mighty/hwatu";
import { describe, expect, it } from "vitest";

import { createMatch, step, viewOf } from "./match";
import { MATGO_RULES } from "./rules";

/*
 * 멘탈 포커 판(state.fair): 시드 대신 함께 섞어 나눈 패(preset)로 나눈다(docs/27 3절).
 * 방장 엔진은 아직 열리지 않은 카드를 자리 표(?_12)로 든다.
 */

const ids = HWATU_DECK.map((c) => c.id);

/** 맞고: 손패 10장씩, 바닥 8장, 더미 20장 */
function realPreset(order: readonly string[]): PresetDeal {
  return {
    hands: [order.slice(0, 10), order.slice(10, 20)],
    floor: order.slice(20, 28),
    deck: order.slice(28),
    redeals: 1,
  };
}

describe("고스톱 멘탈 포커 판", () => {
  it("미리 정한 패로 나누고 다시 섞은 횟수를 그대로 보인다", () => {
    // 1월 넉 장이 손패에 몰리지 않게 섞은 순서(달마다 한 장씩 돌아가며)
    const order = [0, 1, 2, 3].flatMap((k) =>
      Array.from({ length: 12 }, (_, m) => ids[m * 4 + k] as string),
    );
    const { state, events } = createMatch(
      { ...MATGO_RULES, rounds: 1 },
      5,
      realPreset(order),
    );
    expect(state.fair).toBe(true);
    expect(state.preset).toBeUndefined();
    expect(state.hands[0]).toEqual(order.slice(0, 10));
    expect(state.floor).toEqual(order.slice(20, 28));
    expect(state.redeals).toBe(1);
    expect(events[0]).toMatchObject({ type: "roundStarted", redeals: 1 });
  });

  it("자리 표는 어느 달과도 맞지 않는다: 남의 손패가 자리 표여도 진행하고, 화면에 남의 패가 없다", () => {
    const order = [0, 1, 2, 3].flatMap((k) =>
      Array.from({ length: 12 }, (_, m) => ids[m * 4 + k] as string),
    );
    const real = realPreset(order);
    const tokens = (n: number, base: number) =>
      Array.from({ length: n }, (_, i) => `?_${base + i}`);
    // 0번 자리 손패만 진짜(낼 카드가 열린 것처럼), 1번 손패와 더미는 자리 표
    const preset: PresetDeal = {
      hands: [real.hands[0] as string[], tokens(10, 10)],
      floor: real.floor,
      deck: tokens(20, 28),
    };
    // 시드 4: 첫 판 선은 0번 자리(seed % 2)
    const { state } = createMatch({ ...MATGO_RULES, rounds: 1 }, 4, preset);
    expect(state.turn).toBe(0);
    const view = viewOf(state, 0);
    expect(view.decision?.kind).toBe("play");
    expect(JSON.stringify(viewOf(state, 0))).not.toContain('"?_10"');
    // 더미 맨 위가 자리 표면 뒤집은 카드는 바닥 어느 달과도 맞지 않아 바닥에 놓인다.
    const card = (state.hands[0] ?? []).find((c) => !isHiddenId(c)) as string;
    const r = step(state, 0, { type: "play", card });
    expect(r.ok).toBe(true);
  });

  it("총통: 미리 정한 패의 한 손에 같은 달 넉 장이면 판을 바로 끝낸다", () => {
    const four = ids.slice(0, 4); // 1월 넉 장
    // 나머지는 달마다 한 장씩 돌아가며(다른 손에 넉 장이 몰리지 않게)
    const rest = [0, 1, 2, 3].flatMap((k) =>
      Array.from({ length: 11 }, (_, m) => ids[(m + 1) * 4 + k] as string),
    );
    const order = [...four, ...rest];
    const { state } = createMatch(
      { ...MATGO_RULES, rounds: 1 },
      5,
      realPreset(order),
    );
    expect(state.phase).toBe("gameOver");
    expect(state.result?.kind).toBe("chongtong");
    expect(state.result?.winner).toBe(0);
  });
});
