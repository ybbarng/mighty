import type { GameEvent, PlayerView } from "@mighty/hearts-engine";
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
      { cue: "win", delay: 0 },
    ]);
    expect(heartsCuesFor(view, [{ type: "gameOver", winners: [2] }])).toEqual([
      { cue: "lose", delay: 0 },
    ]);
  });

  it("내가 벌점 카드를 먹으면 아쉬운 소리, 점수를 깎는 카드를 먹으면 반가운 소리", () => {
    const won = (seat: number, points: number) =>
      heartsCuesFor(view, [{ type: "trickWon", seat, trickIndex: 3, points }]);
    expect(won(0, 2)).toEqual([{ cue: "penalty", delay: 1 }]);
    expect(won(0, -10)).toEqual([{ cue: "scored", delay: 1 }]);
    expect(won(0, 0)).toEqual([]);
    // 남이 먹을 때는 조용히 둔다.
    expect(won(1, 13)).toEqual([]);
  });

  const scored = (moonShooter: number | null): GameEvent => ({
    type: "roundScored",
    points: [0, 0, 0, 0],
    moonShooter,
    scores: [0, 0, 0, 0],
  });

  it("판이 끝나면 점수표 소리, 마지막 트릭과 함께 오면 카드를 모은 뒤", () => {
    expect(heartsCuesFor(view, [scored(null)])).toEqual([
      { cue: "roundEnd", delay: 0 },
    ]);
    expect(
      heartsCuesFor(view, [
        { type: "trickWon", seat: 1, trickIndex: 12, points: 1 },
        scored(null),
      ]),
    ).toEqual([{ cue: "roundEnd", delay: 1.5 }]);
  });

  it("문은 내가 먹으면 팡파르, 남이 먹으면 불길한 소리", () => {
    expect(heartsCuesFor(view, [scored(0)])).toEqual([
      { cue: "mighty", delay: 0 },
    ]);
    expect(heartsCuesFor(view, [scored(2)])).toEqual([
      { cue: "queenOfSpades", delay: 0 },
    ]);
  });

  it("마지막 판이면 점수표 소리 없이 승리·패배만", () => {
    expect(
      heartsCuesFor(view, [scored(null), { type: "gameOver", winners: [0] }]),
    ).toEqual([{ cue: "win", delay: 0 }]);
  });
});
