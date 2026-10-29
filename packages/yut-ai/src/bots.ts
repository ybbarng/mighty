import { nextInt, type RngState } from "@mighty/engine";
import {
  type Action,
  BACK_MO,
  CENTER,
  chainCommit,
  chainLink,
  derivedSeed,
  legalMoves,
  MO,
  type MoveOption,
  sideOf,
  step,
  throwOdds,
  type YutState,
  type YutView,
} from "@mighty/yut-engine";

import { evaluate, hitChance, pieceProgress } from "./evaluate";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다 */
export interface YutBot {
  readonly name: string;
  decide(view: YutView, rng: RngState): Action;
}

/** 이 자리 재료로 만든 이번 세대 씨앗(컴퓨터·혼자 하기 사슬) */
export function botSeedOf(
  view: Pick<YutView, "botKey" | "generation">,
): string {
  return derivedSeed(view.botKey, view.generation);
}

/**
 * 컴퓨터가 이 자리의 사슬을 아는가. 사람이 만든 씨앗(끊긴 사람 대신 둘 때)은 모르므로 공개는 그 사람을 기다린다.
 * 약속하기·던지기·움직이기는 언제든 할 수 있다
 */
export function botKnowsChain(view: YutView): boolean {
  if (view.decision?.kind !== "reveal") return true;
  return view.chains[view.mySeat]?.commit === chainCommit(botSeedOf(view));
}

/** 재료로 만든 사슬로 약속·공개한다(컴퓨터·혼자 하기의 내 자리) */
export function derivedChainAction(view: YutView): Action | null {
  const kind = view.decision?.kind;
  if (kind === "commit")
    return { type: "commit", hash: chainCommit(botSeedOf(view)) };
  if (kind === "reveal") {
    const used = view.chains[view.mySeat]?.used ?? 0;
    return { type: "reveal", link: chainLink(botSeedOf(view), used + 1) };
  }
  return null;
}

/** 화면으로 수를 따져 보는 상태(사슬 재료는 움직이기에 쓰지 않는다) */
function asState(view: YutView): YutState {
  const { mySeat: _seat, decision: _decision, botKey: _key, ...rest } = view;
  return { ...rest, keys: view.chains.map(() => "") };
}

function moveAction(option: MoveOption): Action {
  return { type: "move", value: option.value, from: option.from };
}

function apply(state: YutState, option: MoveOption): YutState {
  const result = step(state, state.turn, moveAction(option));
  return result.ok ? result.state : state;
}

function makeBot(
  name: string,
  chooseMove: (
    view: YutView,
    options: MoveOption[],
    rng: RngState,
  ) => MoveOption,
): YutBot {
  return {
    name,
    decide(view, rng) {
      const decision = view.decision;
      if (!decision) throw new Error("둘 차례가 아니다");
      const chain = derivedChainAction(view);
      if (chain) return chain;
      if (decision.kind === "throw") return { type: "throw" };
      if (decision.kind !== "move") throw new Error("모르는 결정이다");
      return moveAction(chooseMove(view, decision.options, rng));
    },
  };
}

/** 입문: 쓸 수 있는 수 가운데 아무거나 */
export const yutBeginnerBot = makeBot("입문", (_view, options, rng) => {
  return options[nextInt(rng, options.length)] as MoveOption;
});

/**
 * 중수: 규칙 순서로 점수를 매긴다. 잡기 > 내기 > 지름길 자리에 멈추기 > 업기 > 잡힐 자리 피하기 > 많이 나아가기
 */
export function intermediateScore(view: YutView, option: MoveOption): number {
  const state = asState(view);
  const side = sideOf(view.rules, view.turn);
  const after = apply(state, option);
  let score = 0;
  if (option.captures > 0) score += 100 + 10 * option.captures;
  if (option.finished) score += 60;
  if (
    !option.finished &&
    (option.to === MO || option.to === BACK_MO || option.to === CENTER)
  )
    score += 25;
  if (option.stacks > 0) score += 15;
  if (!option.finished) {
    let risk = 0;
    const sides = view.rules.mode === "team" ? 2 : view.rules.players;
    for (let s = 0; s < sides; s++)
      if (s !== side) risk += hitChance(after.pieces, s, option.to, view.rules);
    score -= 40 * risk;
  }
  const fromProgress =
    option.from < 0 ? 0 : pieceProgress({ point: option.from }, view.rules);
  const toProgress = option.finished
    ? pieceProgress({ point: -2 }, view.rules)
    : pieceProgress({ point: option.to }, view.rules);
  score += toProgress - fromProgress;
  return score;
}

function argmax<T>(items: readonly T[], value: (item: T) => number): T {
  let best = items[0] as T;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const v = value(item);
    if (v > bestValue) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

export const yutIntermediateBot = makeBot("중수", (view, options) =>
  argmax(options, (o) => intermediateScore(view, o)),
);

/** 같은 차례에 남은 결과를 평가가 가장 좋은 수로 마저 쓴다 */
function finishTurn(state: YutState, side: number, seat: number): YutState {
  let current = state;
  for (let guard = 0; guard < 12; guard++) {
    if (current.phase !== "move" || current.turn !== seat) return current;
    const options = legalMoves(current);
    if (options.length === 0) return current;
    const pick = argmax(options, (o) => evaluate(apply(current, o), side));
    current = apply(current, pick);
  }
  return current;
}

/**
 * 차례가 넘어간 뒤의 기댓값. 다음에 던질 사람의 한 번 던지기를 확률대로 펼친다:
 * 상대면 상대가 자기 평가로 가장 좋은 수를 두고, 나(잡아서 한 번 더)면 내가 가장 좋은 수를 둔다
 */
function chanceValue(state: YutState, side: number, mySeat: number): number {
  if (state.phase === "gameOver")
    return state.result?.side === side ? 1e6 : -1e6;
  const seat = state.turn;
  const moverSide = sideOf(state.rules, seat);
  let total = 0;
  for (const { value, p } of throwOdds(state.rules)) {
    const rolled: YutState = {
      ...state,
      phase: "move",
      pending: [...state.pending, value],
      throwsLeft: 0,
    };
    const options = legalMoves(rolled);
    let after: YutState = state;
    if (options.length > 0) {
      const pick = argmax(options, (o) =>
        evaluate(apply(rolled, o), moverSide),
      );
      after = apply(rolled, pick);
      if (moverSide === side) after = finishTurn(after, side, mySeat);
    }
    total += p * evaluate(after, side);
  }
  return total;
}

/** 고수가 보는 수마다의 기댓값(다시 보기 해설에도 쓴다). 단위는 던지기 수 */
export function expertValues(
  view: YutView,
  options: readonly MoveOption[],
): number[] {
  const state = asState(view);
  const side = sideOf(view.rules, view.turn);
  return options.map((option) => {
    const after = finishTurn(apply(state, option), side, view.turn);
    return chanceValue(after, side, view.turn);
  });
}

/** 고수: 수를 둔 뒤 다음 던지기를 확률대로 펼쳐 기댓값이 가장 큰 수(2수 expectimax) */
export const yutExpertBot = makeBot("고수", (view, options) => {
  const values = expertValues(view, options);
  return argmax(
    options.map((option, i) => ({ option, value: values[i] as number })),
    (o) => o.value,
  ).option;
});

export const YUT_BOTS = [
  yutBeginnerBot,
  yutIntermediateBot,
  yutExpertBot,
] as const;

/** 0 입문, 1 중수, 2 고수 */
export function yutBotFor(level: number): YutBot {
  return YUT_BOTS[Math.max(0, Math.min(2, level))] as YutBot;
}
