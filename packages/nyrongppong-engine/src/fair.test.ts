import type { PresetDeal } from "@mighty/hwatu";
import { describe, expect, it } from "vitest";

import { createMatch, dealerOf, step, viewOf } from "./match";
import { STANDARD_RULES } from "./rules";
import type { NyrongppongState } from "./state";

/*
 * 멘탈 포커 판 규칙(state.fair, docs/30 4절): 방장 엔진이 남의 손패를 모르고도 같은 갈림을 타게 한다.
 */

const RULES = { ...STANDARD_RULES, players: 3, rounds: 1 };

/** 정해진 패: 선(seed로 정함)이 여섯 장, 나머지 다섯 장, 남은 것은 더미 */
function preset(hands: string[][], deck: string[]): PresetDeal {
  return { hands, floor: [], deck };
}

function play(
  state: NyrongppongState,
  seat: number,
  action: Parameters<typeof step>[2],
): NyrongppongState {
  const r = step(state, seat, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe("나이롱뽕 멘탈 포커 판", () => {
  const seed = 7;
  const dealer = dealerOf(RULES, seed, 1);
  const order = [dealer, (dealer + 1) % 3, (dealer + 2) % 3] as const;
  // 선은 1월 한 장을 버린다. 다음 자리는 1월 두 장(뽕할 수 있다), 그다음 자리는 1월이 없다.
  const hands: string[][] = [[], [], []];
  hands[order[0]] = ["01g", "03p", "04p", "05p", "06p", "07p"];
  hands[order[1]] = ["01p", "01q", "08p", "09p", "10p"];
  hands[order[2]] = ["02p", "02q", "11p", "12d", "12a"];
  const deck = ["01r", "02a", "03g", "08g", "09a", "10a", "11g", "12g"];

  it("버릴 때마다 모두에게 응답 창을 열고, 뽕할 패가 있는 자리에만 뽕 단추를 보인다", () => {
    let state = createMatch(RULES, seed, preset(hands, deck)).state;
    expect(state.fair).toBe(true);
    state = play(state, order[0], { type: "discard", card: "03p" });
    expect(state.phase).toBe("call");
    expect(state.call?.responses.map((r) => r.seat)).toEqual([
      order[1],
      order[2],
    ]);
    // 3월은 아무도 없다: 단추는 아무에게도 없다.
    expect(viewOf(state, order[1]).decision).toBeNull();
    expect(viewOf(state, order[2]).decision).toBeNull();
    // 뽕할 패가 없는데 부르면 거절한다.
    expect(step(state, order[1], { type: "call" }).ok).toBe(false);
  });

  it("뽕할 패가 있으면 부르는 즉시 가져간다(앞 자리를 기다리지 않는다)", () => {
    let state = createMatch(RULES, seed, preset(hands, deck)).state;
    state = play(state, order[0], { type: "discard", card: "01g" });
    expect(viewOf(state, order[1]).decision).toEqual({ kind: "call" });
    state = play(state, order[1], { type: "call" });
    expect(state.phase).toBe("discard");
    expect(state.turn).toBe(order[1]);
    expect(state.melds[order[1]]).toEqual([["01g", "01p", "01q"]]);
  });

  it("뽕한 적이 있으면 손패 합과 상관없이 차례마다 스톱을 묻는다", () => {
    let state = createMatch(RULES, seed, preset(hands, deck)).state;
    state = play(state, order[0], { type: "discard", card: "01g" });
    state = play(state, order[1], { type: "call" });
    state = play(state, order[1], { type: "discard", card: "10p" });
    // 다음 자리들이 넘겨 창이 닫히면(시간 끝) 차례가 돈다.
    state = play(state, order[2], { type: "timeout", spent: 99_999 });
    // order[2]는 뽕한 적이 없어 바로 가져왔다. 버리고 돌아 order[1] 차례가 오면 스톱을 묻는다.
    expect(state.phase).toBe("discard");
    state = play(state, order[2], { type: "discard", card: "11p" });
    state = play(state, order[0], { type: "timeout", spent: 99_999 });
    state = play(state, order[0], { type: "discard", card: "04p" });
    state = play(state, order[1], { type: "timeout", spent: 99_999 });
    expect(state.turn).toBe(order[1]);
    expect(state.phase).toBe("draw");
    // 손패 합(8+9 = 17)이 스톱 한도(10)보다 커 스톱할 수 없다: 가져오기만 할 수 있다.
    expect(viewOf(state, order[1]).decision).toEqual({
      kind: "draw",
      canStop: false,
    });
    expect(step(state, order[1], { type: "stop" }).ok).toBe(false);
    expect(step(state, order[1], { type: "draw" }).ok).toBe(true);
  });
});
