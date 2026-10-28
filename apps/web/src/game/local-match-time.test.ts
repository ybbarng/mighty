import {
  type ChessRules,
  type ChessView,
  createMatch as createChessMatch,
} from "@mighty/chess-engine";
import { ManualClock } from "@mighty/fair-play";
import { omokBeginnerBot } from "@mighty/omok-ai";
import {
  createMatch,
  type OmokRules,
  type OmokState,
  type OmokView,
  pointAt,
  replay,
} from "@mighty/omok-engine";
import { describe, expect, it } from "vitest";

import { chessKit } from "@/chess/kit";
import { omokKit } from "@/omok/kit";

import { LocalMatch } from "./local-match";

const FAST: OmokRules = { variant: "standard", winsToFinish: 1, time: "fast" };
const SEED = 3;

/** 내가 흑(먼저)인 혼자 하기. 시계는 시험이 옮긴다 */
function solo() {
  const clock = new ManualClock();
  const black = createMatch(FAST, SEED).state.blackSeat;
  const match = new LocalMatch({
    kit: omokKit,
    rules: FAST,
    seed: SEED,
    humanSeat: black,
    bot: omokBeginnerBot,
    clock,
  });
  const state = () => JSON.parse(match.serialize()) as OmokState;
  const view = () => match.current() as OmokView;
  return { clock, match, me: black, state, view };
}

describe("혼자 하기의 개인 시간", () => {
  it("내 수에 쓴 시간을 기록에 싣고 그만큼 시계가 준다", () => {
    const { clock, match, me, view } = solo();
    clock.advance(40_000);
    expect(match.submit({ type: "place", at: pointAt("H8") })).toEqual({
      ok: true,
    });
    const mine = match.actionLog().find((e) => e.seat === me);
    expect(mine?.action).toEqual({
      type: "place",
      at: pointAt("H8"),
      spent: 40_000,
    });
    expect(view().clocks?.[me]).toEqual({ main: 140_000, periods: 3 });
  });

  it("남은 시간(기본 3분 + 초읽기 30초×3)이 다 지나면 시간패가 기록된다", () => {
    const { clock, match, me, view } = solo();
    clock.advance(270_000);
    expect(view().phase).toBe("play");
    clock.advance(1);
    expect(view().result).toEqual({ kind: "time", seat: 1 - me });
    expect(match.actionLog().at(-1)).toEqual({
      seat: me,
      action: { type: "timeout", spent: 270_001 },
    });
  });

  it("수를 두면 시계가 다시 걸려, 남은 시간 전체가 다시 지나야 시간패다", () => {
    const { clock, match, me, view } = solo();
    clock.advance(100_000);
    match.submit({ type: "place", at: pointAt("H8") });
    // 컴퓨터가 바로 둬서 다시 내 차례. 남은 시간은 80초 + 초읽기 90초
    clock.advance(170_000);
    expect(view().phase).toBe("play");
    clock.advance(1);
    expect(view().result).toEqual({ kind: "time", seat: 1 - me });
  });

  it("기록대로 다시 두면 시계까지 같은 판이 나온다(판 끝 검증)", () => {
    const { clock, match, state } = solo();
    clock.advance(12_000);
    match.submit({ type: "place", at: pointAt("H8") });
    clock.advance(270_001);
    const again = replay(FAST, SEED, match.actionLog());
    expect(again.ok && again.state).toEqual(state());
  });
});

describe("차례를 끝내지 않는 행동(체스 무승부 제안)", () => {
  it("상대 차례에 무승부를 제안·거절해도 그 사람의 생각 시간은 처음부터 다시 재지 않는다", () => {
    const clock = new ManualClock();
    const rules: ChessRules = { winsToFinish: 1, time: "fast" };
    const white = createChessMatch(rules, SEED).state.whiteSeat;
    const black = 1 - white;
    const match = new LocalMatch({
      kit: chessKit,
      rules,
      seed: SEED,
      humanSeat: white,
      humanSeats: [white, black],
      clock,
    });
    const view = () => match.current() as ChessView;
    const e4 = { type: "move" as const, from: 52, to: 36 };
    expect(match.submitAs(white, e4)).toEqual({ ok: true });
    // 흑이 20초 생각하는 사이 백이 무승부를 제안하고, 흑이 30초 뒤 거절한다.
    clock.advance(20_000);
    expect(match.submitAs(white, { type: "offerDraw" })).toEqual({ ok: true });
    clock.advance(30_000);
    expect(match.submitAs(black, { type: "declineDraw" })).toEqual({
      ok: true,
    });
    clock.advance(10_000);
    expect(match.submitAs(black, { type: "move", from: 12, to: 28 })).toEqual({
      ok: true,
    });
    // 흑의 수에는 제안·거절과 상관없이 처음부터 쓴 60초가 실린다.
    expect(match.actionLog().at(-1)?.action).toEqual({
      type: "move",
      from: 12,
      to: 28,
      spent: 60_000,
    });
    expect(view().clocks?.[black]).toEqual({ main: 120_000, periods: 3 });
  });

  it("제안·거절이 끼어도 시간패는 그 차례에 남은 시간이 다 지나는 순간이다", () => {
    const clock = new ManualClock();
    const rules: ChessRules = { winsToFinish: 1, time: "fast" };
    const white = createChessMatch(rules, SEED).state.whiteSeat;
    const black = 1 - white;
    const match = new LocalMatch({
      kit: chessKit,
      rules,
      seed: SEED,
      humanSeat: white,
      humanSeats: [white, black],
      clock,
    });
    const view = () => match.current() as ChessView;
    match.submitAs(white, { type: "move", from: 52, to: 36 });
    clock.advance(200_000);
    match.submitAs(white, { type: "offerDraw" });
    match.submitAs(black, { type: "declineDraw" });
    // 흑은 기본 3분 + 초읽기 30초×3 = 270초. 거절로 시계가 다시 걸려도 남은 70초 뒤에 끝난다.
    clock.advance(70_000);
    expect(view().result).toBeNull();
    clock.advance(1);
    expect(view().result).toEqual({ kind: "time", seat: white });
  });
});
