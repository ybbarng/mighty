// @vitest-environment node
import {
  type Card,
  createMatch,
  type GameEvent,
  type PlayerView,
  presetRules,
  type Suit,
  viewOf,
} from "@mighty/engine";
import { describe, expect, it } from "vitest";

import { cuesFor } from "./cues";

const rules = {
  ...presetRules("standard5"),
  mighty: "SA" as const,
  jokerCall: "C3" as const,
  calledJokerKeepsEffect: false,
};
const base = viewOf(createMatch({ rules, seed: 1 }).state, 0);
/** 기루다 하트, 주공은 0번, 네 번째 트릭 진행 중 */
const view: PlayerView = {
  ...base,
  rules,
  goal: { kiruda: "H", score: 14 },
  declarer: 0,
  trickIndex: 3,
};

/** 1번부터 차례로 `before`를 낸 트릭에 `card`를 마지막으로 낸 장면 */
function playOn(
  before: Card[],
  card: Card,
  {
    jokerSuit = null,
    jokerCall = false,
  }: { jokerSuit?: Suit | null; jokerCall?: boolean } = {},
) {
  const plays = [...before, card].map((c, i) => ({ seat: i + 1, card: c }));
  const seat = plays.length;
  const scene: PlayerView = {
    ...view,
    trick: {
      leader: 1,
      plays,
      jokerSuit,
      jokerCalled: before[0] === "C3" && jokerCall,
    },
  };
  return cuesFor(scene, [
    {
      type: "played",
      seat,
      card,
      jokerSuit: before.length === 0 ? jokerSuit : null,
      jokerCall: before.length === 0 && jokerCall,
      slot: null,
    },
  ]).map((c) => c.cue);
}

describe("카드 낼 때 소리(원작 PlayTurnSound)", () => {
  it("마이티·조커·조커콜·일반 카드", () => {
    expect(playOn(["C5"], "SA")).toEqual(["mighty"]);
    expect(playOn(["C5"], "JK")).toEqual(["joker"]);
    expect(playOn([], "C3", { jokerCall: true })).toEqual(["jokerCall"]);
    expect(playOn(["C5"], "C7")).toEqual(["card"]);
  });

  it("선 무늬가 없어 기루다로 자르면 찍기", () => {
    expect(playOn(["C5", "C9"], "H7")).toEqual(["gan"]);
  });

  it("선이 기루다면 찍기가 아니다", () => {
    expect(playOn(["H5"], "H7")).toEqual(["card"]);
    expect(playOn(["JK"], "H7", { jokerSuit: "H" })).toEqual(["card"]);
  });

  it("힘 있는 마이티나 조커가 깔려 있으면 찍기가 아니다", () => {
    expect(playOn(["C5", "SA"], "H7")).toEqual(["card"]);
    expect(playOn(["C5", "JK"], "H7")).toEqual(["card"]);
  });

  it("조커콜에 걸린 조커는 죽은 조커", () => {
    expect(playOn(["C3"], "JK", { jokerCall: true })).toEqual(["deadJoker"]);
    expect(playOn(["C3"], "JK")).toEqual(["joker"]);
  });

  it("힘 있는 마이티 뒤에 낸 조커는 평범한 카드 소리", () => {
    expect(playOn(["C5", "SA"], "JK")).toEqual(["card"]);
  });

  it("트릭이 끝난 장면에서도 낸 카드를 찾는다", () => {
    const plays = ["C5", "C9", "CK", "C2", "H7"].map((card, i) => ({
      seat: (i + 1) % 5,
      card: card as Card,
    }));
    const scene: PlayerView = {
      ...view,
      trickIndex: 4,
      trick: { leader: 3, plays: [], jokerSuit: null, jokerCalled: false },
      tricks: [0, 1, 2, 3].map(() => ({
        leader: 1,
        plays,
        jokerSuit: null,
        jokerCalled: false,
        winner: 0,
      })),
    };
    const cues = cuesFor(scene, [
      {
        type: "played",
        seat: 0,
        card: "H7",
        jokerSuit: null,
        jokerCall: false,
        slot: null,
      },
      { type: "trickWon", seat: 0, trickIndex: 3, points: 1 },
    ]);
    expect(cues.map((c) => c.cue)).toEqual(["gan"]);
  });
});

describe("판 흐름 소리", () => {
  const cues = (events: GameEvent[], scene: PlayerView = view) =>
    cuesFor(scene, events);

  it("섞는 연출에 맞춰 섞고, 묶음마다 나눠 주는 소리, 다 나눈 뒤 판 시작 소리", () => {
    const dealt: GameEvent[] = [
      { type: "roundStarted", roundNumber: 1, beginner: 0 },
      { type: "dealt", handSize: 10 },
    ];
    const result = cuesFor(view, dealt, { startDelay: 0, shuffleMs: 1600 });
    expect(result[0]).toEqual({ cue: "shuffle", delay: 0 });
    // 5명에게 2·3·3·2장 묶음 네 바퀴
    const deals = result.filter((c) => c.cue === "deal");
    expect(deals).toHaveLength(20);
    expect(deals[0]?.delay).toBe(1.6);
    const start = result.at(-1);
    expect(start?.cue).toBe("gameStart");
    expect(start?.delay).toBeGreaterThan(deals.at(-1)?.delay ?? 0);
  });

  it("섞는 연출을 이미 보였으면 섞는 소리 없이 나눠 주기부터", () => {
    const result = cuesFor(view, [{ type: "dealt", handSize: 10 }], {
      startDelay: 0,
      shuffleMs: 300,
    });
    expect(result.some((c) => c.cue === "shuffle")).toBe(false);
    expect(result.find((c) => c.cue === "deal")?.delay).toBe(0.3);
  });

  it("연출을 하지 않으면(움직임 줄이기) 판 시작 소리만", () => {
    expect(cues([{ type: "dealt", handSize: 10 }])).toEqual([
      { cue: "gameStart" },
    ]);
  });

  it("야당이 점수 카드를 가져가면 장수만큼 득점 소리, 주공이 가져가면 없다", () => {
    expect(
      cues([{ type: "trickWon", seat: 2, trickIndex: 3, points: 3 }]),
    ).toEqual([{ cue: "scored", times: 3, delay: 1.1 }]);
    expect(
      cues([{ type: "trickWon", seat: 0, trickIndex: 3, points: 3 }]),
    ).toEqual([]);
    expect(
      cues([{ type: "trickWon", seat: 2, trickIndex: 3, points: 0 }]),
    ).toEqual([]);
  });

  it("공개된 프렌드가 가져가면 득점 소리가 없다", () => {
    const scene = { ...view, friend: 2, friendRevealed: true };
    expect(
      cues([{ type: "trickWon", seat: 2, trickIndex: 3, points: 2 }], scene),
    ).toEqual([]);
  });

  it("카드를 내며 프렌드가 드러나면 카드 소리 뒤에 프렌드 소리", () => {
    const result = cues([
      {
        type: "played",
        seat: 2,
        card: "DA",
        jokerSuit: null,
        jokerCall: false,
        slot: null,
      },
      { type: "friendRevealed", seat: 2 },
    ]);
    expect(result).toEqual([{ cue: "card" }, { cue: "friend", delay: 0.6 }]);
  });

  it("죽이기 헛다리면 잠시 뒤 포기 소리", () => {
    expect(
      cues([{ type: "killAttempt", seat: 0, card: "DK", killed: null }]),
    ).toEqual([{ cue: "kill" }, { cue: "pass", delay: 0.75 }]);
  });

  it("키티는 장수만큼, 손패 정리는 내가 주공일 때만", () => {
    expect(cues([{ type: "kittyTaken", seat: 0, count: 3 }])).toEqual([
      { cue: "pickCard", times: 3 },
    ]);
    const goal = { kiruda: "H" as const, score: 14 };
    expect(cues([{ type: "exchanged", seat: 0, goal }])).toEqual([
      { cue: "cardSet" },
    ]);
    expect(cues([{ type: "exchanged", seat: 1, goal }])).toEqual([]);
  });

  it("당선과 선거 끝은 공지 소리", () => {
    expect(
      cues([{ type: "elected", seat: 0, goal: { kiruda: "H", score: 14 } }]),
    ).toEqual([{ cue: "announce" }]);
  });

  it("내가 이긴 편이면 승리, 진 편이면 패배 소리", () => {
    const scored = (rulingWon: boolean) =>
      cues([
        {
          type: "roundScored",
          result: {
            rulingWon,
            rulingPoints: 0,
            oppositionPoints: 0,
            base: 0,
            staticRun: false,
            multipliers: [],
            moved: 0,
            money: [],
          },
        },
      ]).map((c) => c.cue);
    expect(scored(true)).toEqual(["win"]);
    expect(scored(false)).toEqual(["lose"]);
  });

  it("같은 소리는 한 번만", () => {
    expect(
      cues([
        { type: "passed", seat: 1 },
        { type: "passed", seat: 2 },
      ]),
    ).toEqual([{ cue: "pass" }]);
  });
});

describe("판 끝 소리 시점", () => {
  const result = {
    rulingWon: true,
    rulingPoints: 0,
    oppositionPoints: 0,
    base: 0,
    staticRun: false,
    multipliers: [],
    moved: 0,
    money: [],
  };

  it("마지막 트릭과 함께 오면 카드를 다 모은 뒤 승패 소리를 낸다", () => {
    const cues = cuesFor(view, [
      { type: "trickWon", seat: 0, trickIndex: 9, points: 0 },
      { type: "roundScored", result },
    ]);
    expect(cues).toEqual([{ cue: "win", delay: 1.48 }]);
  });
});
