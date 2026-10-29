import type { GuessEntry, Phase } from "@mighty/baseball-engine";

/**
 * 숫자야구 화면을 야구 경기처럼 보이게 하는 순수 계산. 엔진·규칙과 상관없는 화면 말이다.
 * - 답 하나를 심판 콜로: 다 맞히면 홈런, 스트라이크가 있으면 스트라이크, 볼만 있으면 볼, 하나도 없으면 아웃
 * - 지금이 몇 회 초·말인지: 선(먼저 묻는 쪽)이 원정이라 초에 공격한다
 */

export type CallKind = "homerun" | "strike" | "ball" | "out";

export const CALL_TEXT: Record<CallKind, string> = {
  homerun: "홈런!",
  strike: "스트라이크!",
  ball: "볼!",
  out: "아웃!",
};

export function callOf(
  strikes: number,
  balls: number,
  digits: number,
): CallKind {
  if (strikes === digits) return "homerun";
  if (strikes > 0) return "strike";
  if (balls > 0) return "ball";
  return "out";
}

export interface Inning {
  /** 몇 회(1부터) */
  number: number;
  /** 초(선이 공격)인가 말인가. 퍼즐은 초·말이 없다(null) */
  half: "top" | "bottom" | null;
  /** 공격하는(묻는) 자리 */
  batter: number;
}

/**
 * 지금 회. 묻는 차례(play)면 곧 물을 회, 답을 기다리면(answer) 방금 물은 회다.
 * 비밀을 정하는 중이나 판이 끝난 뒤에는 null
 */
export function inningOf(view: {
  phase: Phase;
  turn: number;
  starter: number;
  guesses: readonly GuessEntry[];
  rules: { mode: "duel" | "puzzle" };
}): Inning | null {
  if (view.phase !== "play" && view.phase !== "answer") return null;
  const batter = view.turn;
  const asked = view.guesses.filter((g) => g.seat === batter).length;
  const number = view.phase === "play" ? asked + 1 : Math.max(asked, 1);
  const half =
    view.rules.mode === "puzzle"
      ? null
      : batter === view.starter
        ? "top"
        : "bottom";
  return { number, half, batter };
}

export function inningText(inning: Inning): string {
  if (inning.half === null) return `${inning.number}회`;
  return `${inning.number}회 ${inning.half === "top" ? "초" : "말"}`;
}
