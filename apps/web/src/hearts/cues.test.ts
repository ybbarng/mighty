import type { PlayerView } from "@mighty/hearts-engine";
import { describe, expect, it } from "vitest";

import { heartsCuesFor } from "./cues";

const view = { seat: 0 } as PlayerView;

describe("하트 효과음 고르기", () => {
  it("스페이드 Q는 따로 불길한 소리", () => {
    expect(
      heartsCuesFor(view, [
        { type: "played", seat: 1, card: "SQ", slot: null },
      ]),
    ).toEqual([{ cue: "queenOfSpades" }]);
    expect(
      heartsCuesFor(view, [
        { type: "played", seat: 1, card: "S5", slot: null },
      ]),
    ).toEqual([{ cue: "card" }]);
  });

  it("하트가 깨지면 카드 소리 뒤에 깨지는 소리", () => {
    expect(
      heartsCuesFor(view, [
        { type: "played", seat: 1, card: "H5", slot: null },
        { type: "heartsBroken" },
      ]),
    ).toEqual([{ cue: "card" }, { cue: "heartsBroken", delay: 0.3 }]);
  });

  it("게임이 끝나면 이긴 사람에 따라 승리·패배", () => {
    expect(heartsCuesFor(view, [{ type: "gameOver", winners: [0] }])).toEqual([
      { cue: "win" },
    ]);
    expect(heartsCuesFor(view, [{ type: "gameOver", winners: [2] }])).toEqual([
      { cue: "lose" },
    ]);
  });
});
