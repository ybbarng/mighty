import { describe, expect, it } from "vitest";

import { pointAt, pointName } from "./board";
import { seatToMove, step } from "./match";
import { createOmokScenario } from "./scenario";

describe("자리 이름", () => {
  it("pointName과 pointAt은 서로 반대다", () => {
    for (const at of [0, 14, 112, 224]) expect(pointAt(pointName(at))).toBe(at);
    expect(pointAt("H8")).toBe(112);
  });

  it("판 밖 이름은 받지 않는다", () => {
    expect(() => pointAt("P1")).toThrow();
    expect(() => pointAt("A16")).toThrow();
    expect(() => pointAt("A0")).toThrow();
  });
});

describe("튜토리얼 장면", () => {
  it("흑백 수가 같으면 내가 흑으로 둘 차례다", () => {
    const state = createOmokScenario({ black: ["H8"], white: ["I9"] });
    expect(state.blackSeat).toBe(0);
    expect(seatToMove(state)).toBe(0);
    expect(state.board[pointAt("H8")]).toBe(1);
    expect(state.board[pointAt("I9")]).toBe(2);
  });

  it("흑이 하나 많으면 내가 백으로 둘 차례다", () => {
    const state = createOmokScenario({ black: ["H8", "H9"], white: ["I9"] });
    expect(state.blackSeat).toBe(1);
    expect(seatToMove(state)).toBe(0);
  });

  it("넷 옆에 두면 다섯으로 이긴다", () => {
    const state = createOmokScenario({
      black: ["H8", "I8", "J8", "K8"],
      white: ["G8", "H7", "I7", "J9"],
    });
    const result = step(state, 0, { type: "place", at: pointAt("L8") });
    expect(result.ok && result.state.result?.kind).toBe("five");
  });

  it("수가 맞지 않거나 겹치면 만들지 않는다", () => {
    expect(() => createOmokScenario({ black: [], white: ["H8"] })).toThrow();
    expect(() =>
      createOmokScenario({ black: ["H8", "H8"], white: ["A1"] }),
    ).toThrow();
  });
});
