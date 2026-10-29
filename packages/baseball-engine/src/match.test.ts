import { describe, expect, it } from "vitest";

import {
  answererOf,
  createMatch,
  type LoggedAction,
  pendingSeats,
  replay,
  step,
  viewOf,
} from "./match";
import { commitmentOf, score } from "./numbers";
import { type BaseballRules, STANDARD_RULES } from "./rules";
import { createBaseballScenario } from "./scenario";
import type { Action, BaseballState, GameEvent } from "./state";

const SALT = [`${"0".repeat(31)}a`, `${"0".repeat(31)}b`] as const;
/** 자리마다 비밀 수 */
const SECRETS = ["123", "456"] as const;

/** 게임과 기록. 걸음마다 기록에 남겨 다시 두기 시험에 쓴다 */
class Game {
  state: BaseballState;
  log: LoggedAction[] = [];
  events: GameEvent[] = [];
  constructor(
    readonly rules: BaseballRules,
    readonly seed: number,
  ) {
    this.state = createMatch(rules, seed).state;
  }
  act(seat: number, action: Action): void {
    const result = step(this.state, seat, action);
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    this.log.push({ seat, action });
    this.events.push(...result.events);
  }
  tryAct(seat: number, action: Action) {
    return step(this.state, seat, action);
  }
  commitAll(secrets: readonly string[] = SECRETS): void {
    for (const seat of pendingSeats(this.state))
      this.act(seat, {
        type: "commit",
        hash: commitmentOf(secrets[seat] as string, SALT[seat] as string),
      });
  }
  /** 차례인 사람이 묻고 상대가 정직하게 답한다 */
  ask(guess: string, secrets: readonly string[] = SECRETS): void {
    const seat = this.state.turn;
    this.act(seat, { type: "guess", guess });
    const answerer = answererOf(this.state) as number;
    this.act(answerer, {
      type: "answer",
      ...score(secrets[answerer] as string, guess),
    });
  }
  revealAll(secrets: readonly string[] = SECRETS): void {
    for (const seat of pendingSeats(this.state))
      this.act(seat, {
        type: "reveal",
        secret: secrets[seat] as string,
        salt: SALT[seat] as string,
      });
  }
}

/** 첫 판 선이 0번 자리인 시드 */
function seedWithStarter(rules: BaseballRules, starter: number): number {
  for (let seed = 1; ; seed++)
    if (createMatch(rules, seed).state.starter === starter) return seed;
}

const S0 = seedWithStarter(STANDARD_RULES, 0);

describe("판 흐름", () => {
  it("둘 다 약속을 낸 뒤에야 맞히기가 시작되고, 선부터 번갈아 묻는다", () => {
    const g = new Game(STANDARD_RULES, S0);
    expect(g.state.phase).toBe("setup");
    expect(pendingSeats(g.state)).toEqual([0, 1]);
    expect(g.tryAct(0, { type: "guess", guess: "456" }).ok).toBe(false);
    g.commitAll();
    expect(g.state.phase).toBe("play");
    expect(pendingSeats(g.state)).toEqual([0]);
    g.act(0, { type: "guess", guess: "457" });
    expect(g.state.phase).toBe("answer");
    expect(pendingSeats(g.state)).toEqual([1]);
    expect(viewOf(g.state, 1).decision).toEqual({
      kind: "answer",
      guess: "457",
    });
    g.act(1, { type: "answer", strikes: 2, balls: 0 });
    expect(g.state.turn).toBe(1);
    expect(g.state.guesses[0]).toEqual({
      seat: 0,
      guess: "457",
      strikes: 2,
      balls: 0,
    });
  });

  it("공정 규칙: 선이 맞히면 후공이 한 번 더 묻고, 못 맞히면 선이 이긴다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("456"); // 0번이 바로 맞힘
    expect(g.state.phase).toBe("play");
    expect(g.state.turn).toBe(1);
    g.ask("789");
    expect(g.state.phase).toBe("reveal");
    expect(g.state.outcome).toEqual({ kind: "hit", seat: 0 });
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "hit", seat: 0 });
    expect(g.state.phase).toBe("gameOver");
    expect(g.state.wins).toEqual([1, 0]);
  });

  it("공정 규칙: 후공도 마지막 기회에 맞히면 비긴다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    g.ask("789");
    g.ask("456");
    g.ask("123");
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "draw" });
    expect(g.state.wins).toEqual([0, 0]);
  });

  it("공정 규칙: 후공이 먼저 맞히면 바로 이긴다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    g.ask("123");
    expect(g.state.phase).toBe("reveal");
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "hit", seat: 1 });
  });

  it("공정 규칙을 끄면 먼저 맞힌 사람이 바로 이긴다", () => {
    const rules = { ...STANDARD_RULES, fair: false };
    const g = new Game(rules, seedWithStarter(rules, 0));
    g.commitAll();
    g.ask("456");
    expect(g.state.phase).toBe("reveal");
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "hit", seat: 0 });
  });

  it("여러 판이면 판마다 선을 바꾸고 먼저 정한 판 수를 이기면 끝난다", () => {
    const rules = { ...STANDARD_RULES, winsToFinish: 2 };
    const g = new Game(rules, seedWithStarter(rules, 0));
    g.commitAll();
    g.ask("456");
    g.ask("789");
    g.revealAll();
    expect(g.state.phase).toBe("roundEnd");
    g.act(0, { type: "continue" });
    g.act(1, { type: "continue" });
    expect(g.state.roundNumber).toBe(2);
    expect(g.state.starter).toBe(1);
    expect(g.state.commits).toEqual([null, null]);
    g.commitAll();
    g.ask("123"); // 1번이 바로 맞힘
    g.ask("789");
    g.revealAll();
    expect(g.state.wins).toEqual([1, 1]);
    expect(g.state.phase).toBe("roundEnd");
  });

  it("퍼즐: 컴퓨터(1번)만 약속하고 0번만 묻는다. 맞히면 0번 승", () => {
    const rules = { ...STANDARD_RULES, mode: "puzzle" as const };
    const g = new Game(rules, 7);
    expect(pendingSeats(g.state)).toEqual([1]);
    expect(viewOf(g.state, 0).decision).toBeNull();
    g.commitAll();
    g.ask("789");
    expect(g.state.turn).toBe(0);
    g.ask("456");
    expect(pendingSeats(g.state)).toEqual([1]);
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "hit", seat: 0 });
    expect(g.state.phase).toBe("gameOver");
  });

  it("기권하면 공개를 거쳐 상대가 이긴다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    g.act(0, { type: "resign" });
    expect(g.state.phase).toBe("reveal");
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "resign", seat: 1 });
  });

  it("비밀을 정하기 전에 기권하면 공개할 것이 없어 바로 끝난다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.act(1, { type: "resign" });
    expect(g.state.result).toEqual({ kind: "resign", seat: 0 });
    expect(g.state.phase).toBe("gameOver");
  });
});

describe("잘못된 행동 거절", () => {
  it("차례·형식·같은 수 다시 묻기", () => {
    const g = new Game(STANDARD_RULES, S0);
    expect(g.tryAct(2, { type: "resign" }).ok).toBe(false);
    expect(g.tryAct(0, { type: "commit", hash: "xyz" }).ok).toBe(false);
    g.commitAll();
    expect(
      g.tryAct(0, { type: "commit", hash: commitmentOf("123", SALT[0]) }).ok,
    ).toBe(false);
    expect(g.tryAct(1, { type: "guess", guess: "123" }).ok).toBe(false);
    for (const bad of ["12", "1234", "112", "012"])
      expect(g.tryAct(0, { type: "guess", guess: bad }).ok).toBe(false);
    g.ask("789");
    g.ask("789");
    const again = g.tryAct(0, { type: "guess", guess: "789" });
    expect(again).toEqual({ ok: false, error: "이미 물어본 수다" });
  });

  it("답할 사람만, 나올 수 있는 답만 받는다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.act(0, { type: "guess", guess: "457" });
    expect(g.tryAct(0, { type: "answer", strikes: 2, balls: 0 }).ok).toBe(
      false,
    );
    expect(g.tryAct(1, { type: "answer", strikes: 2, balls: 1 }).ok).toBe(
      false,
    );
    expect(g.tryAct(1, { type: "answer", strikes: 3, balls: 1 }).ok).toBe(
      false,
    );
  });

  it("앞의 답과 함께 맞는 수가 없는 답(뻔한 거짓)은 받지 않는다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.act(0, { type: "guess", guess: "457" });
    g.act(1, { type: "answer", strikes: 0, balls: 0 }); // 거짓이지만 아직 어긋나지 않는다
    g.ask("789"); // 1번 차례
    g.act(0, { type: "guess", guess: "456" });
    // 앞에서 4·5·7이 하나도 없다고 했으니 456에 스트라이크·볼이 나올 수 없다.
    expect(g.tryAct(1, { type: "answer", strikes: 3, balls: 0 })).toEqual({
      ok: false,
      error: "앞에서 한 답과 맞지 않는다",
    });
  });

  it("공개는 공개할 때, 규칙에 맞는 수와 소금으로만", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    expect(
      g.tryAct(0, { type: "reveal", secret: "123", salt: SALT[0] }).ok,
    ).toBe(false);
    g.ask("456");
    g.ask("789");
    expect(
      g.tryAct(0, { type: "reveal", secret: "11", salt: SALT[0] }).ok,
    ).toBe(false);
    expect(g.tryAct(0, { type: "reveal", secret: "123", salt: "zz" }).ok).toBe(
      false,
    );
    g.revealAll();
    expect(g.tryAct(0, { type: "guess", guess: "789" }).ok).toBe(false);
  });
});

describe("약속·공개 검증", () => {
  it("정직하면 공개한 비밀이 약속과 맞고 모든 답이 맞다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    g.ask("789");
    g.ask("456");
    g.ask("312");
    g.revealAll();
    expect(g.state.reveals).toEqual([
      { secret: "123", salt: SALT[0], matches: true, wrongAt: null },
      { secret: "456", salt: SALT[1], matches: true, wrongAt: null },
    ]);
  });

  it("약속과 다른 비밀을 공개하면 거짓으로 지고 상대가 이긴다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("456");
    g.ask("789");
    // 1번이 지지 않으려고 다른 수(맞힌 수와 다른)를 공개한다.
    g.act(0, { type: "reveal", secret: "123", salt: SALT[0] });
    g.act(1, { type: "reveal", secret: "457", salt: SALT[1] });
    expect(g.state.reveals[1]?.matches).toBe(false);
    expect(g.state.result).toEqual({ kind: "cheat", seat: 0, liars: [1] });
    expect(g.state.wins).toEqual([1, 0]);
  });

  it("앞뒤는 맞지만 비밀과 다른 답은 공개 때 그 자리를 짚는다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    // 1번(비밀 456)이 0번의 첫 추측 789에 거짓으로 1볼이라고 답한다.
    g.act(0, { type: "guess", guess: "789" });
    g.act(1, { type: "answer", strikes: 0, balls: 1 });
    g.ask("312"); // 1번 맞히기(정직한 0번 답)
    // 거짓 답과 앞뒤가 맞는 814에 1번이 "맞았다"고 답한다(정직하면 0S1B).
    g.act(0, { type: "guess", guess: "814" });
    g.act(1, { type: "answer", strikes: 3, balls: 0 });
    g.ask("231"); // 1번 마지막 기회, 못 맞힘
    expect(g.state.outcome).toEqual({ kind: "hit", seat: 0 });
    g.revealAll();
    expect(g.state.reveals[1]).toEqual({
      secret: "456",
      salt: SALT[1],
      matches: true,
      wrongAt: 0,
    });
    expect(g.state.result).toEqual({ kind: "cheat", seat: 0, liars: [1] });
    expect(g.events).toContainEqual({
      type: "revealed",
      seat: 1,
      secret: "456",
      matches: true,
      wrongAt: 0,
    });
  });

  it("거짓 답으로 이긴 것처럼 보여도 공개 때 뒤집힌다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    // 0번(비밀 123)이 1번의 맞힌 추측에 거짓 답을 한다.
    g.act(1, { type: "guess", guess: "123" });
    g.act(0, { type: "answer", strikes: 0, balls: 0 });
    g.ask("456"); // 0번이 맞힘
    g.ask("789"); // 1번 마지막 기회 → 0번이 이긴 것처럼 보인다
    expect(g.state.outcome).toEqual({ kind: "hit", seat: 0 });
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "cheat", seat: 1, liars: [0] });
  });

  it("둘 다 거짓이면 이긴 사람이 없다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("456");
    g.ask("789");
    g.act(0, { type: "reveal", secret: "124", salt: SALT[0] });
    g.act(1, { type: "reveal", secret: "457", salt: SALT[1] });
    expect(g.state.result).toEqual({
      kind: "cheat",
      seat: null,
      liars: [0, 1],
    });
    expect(g.state.wins).toEqual([0, 0]);
  });
});

describe("끝내기·시간", () => {
  it("답을 기다리던 사람이 하나면 끝내기로 그 사람이 진다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.act(0, { type: "guess", guess: "789" });
    g.act(0, { type: "retire" });
    expect(g.state.result).toEqual({ kind: "forfeit", seat: 0 });
    expect(g.state.retired).toBe(true);
    expect(g.state.phase).toBe("gameOver");
  });

  it("공개를 하지 않은 사람도 끝내기로 진다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("456");
    g.ask("789");
    g.act(0, { type: "reveal", secret: "123", salt: SALT[0] });
    g.act(0, { type: "retire" });
    expect(g.state.result).toEqual({ kind: "forfeit", seat: 0 });
  });

  it("맞힐 차례의 시계가 다 되면 시간패를 거쳐 공개한다", () => {
    const rules = { ...STANDARD_RULES, time: "fast" as const };
    const g = new Game(rules, seedWithStarter(rules, 0));
    g.commitAll();
    expect(g.tryAct(0, { type: "timeout", spent: 1_000 }).ok).toBe(false);
    g.act(0, { type: "timeout", spent: 3 * 60_000 + 90_000 + 1 });
    expect(g.state.phase).toBe("reveal");
    g.revealAll();
    expect(g.state.result).toEqual({ kind: "time", seat: 1 });
  });
});

describe("화면과 다시 두기", () => {
  it("화면에는 내 비밀 재료만 있고 남의 것은 없다", () => {
    const { state } = createMatch(STANDARD_RULES, 5);
    const view = viewOf(state, 0);
    expect(view.botKey).toBe(state.keys[0]);
    expect(JSON.stringify(view)).not.toContain(state.keys[1] as string);
    expect("keys" in view).toBe(false);
  });

  it("기록대로 다시 두면 같은 상태가 나온다", () => {
    const g = new Game(STANDARD_RULES, S0);
    g.commitAll();
    g.ask("789");
    g.ask("789");
    g.ask("456");
    g.ask("312");
    g.revealAll();
    const again = replay(STANDARD_RULES, S0, g.log);
    expect(again.ok && again.state).toEqual(g.state);
    // 기록 중간을 바꾸면 그 자리에서 멈춘다.
    const broken = [...g.log];
    broken[3] = { seat: 1, action: { type: "answer", strikes: 3, balls: 0 } };
    const result = replay(STANDARD_RULES, S0, broken);
    expect(result.ok).toBe(false);
  });

  it("튜토리얼 장면: 컴퓨터 비밀이 정해지고 앞 추측의 답이 채워져 있다", () => {
    const state = createBaseballScenario({
      rules: STANDARD_RULES,
      secret: "749",
      guesses: ["123", "456"],
    });
    expect(state.phase).toBe("play");
    expect(state.guesses.map((g) => [g.strikes, g.balls])).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(viewOf(state, 0).decision).toEqual({ kind: "guess" });
  });
});
