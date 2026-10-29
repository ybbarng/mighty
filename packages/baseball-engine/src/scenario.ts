import { createMatch } from "./match";
import {
  commitmentOf,
  derivedSecret,
  fixedKey,
  isValidNumber,
  score,
} from "./numbers";
import type { BaseballRules } from "./rules";
import type { BaseballState } from "./state";

export interface BaseballScenarioOptions {
  /** 퍼즐 규칙(자릿수·0 쓰기). 방식은 퍼즐로 바꾼다 */
  rules: BaseballRules;
  /** 컴퓨터(1번 자리)의 비밀 수 */
  secret: string;
  /** 이미 물어본 수들(답은 비밀로 계산해 채운다) */
  guesses?: string[];
}

/**
 * 튜토리얼 장면: 컴퓨터 비밀이 정해진 퍼즐 판. 이미 물어본 수와 답이 있고 0번 자리(나)가 맞힐 차례다.
 * 컴퓨터는 정해 둔 비밀 재료(`fixedKey`)로 같은 비밀을 알고 정직하게 답한다
 */
export function createBaseballScenario(
  options: BaseballScenarioOptions,
): BaseballState {
  const rules: BaseballRules = {
    ...options.rules,
    mode: "puzzle",
    winsToFinish: 1,
  };
  if (!isValidNumber(options.secret, rules))
    throw new Error(`규칙에 맞지 않는 비밀: ${options.secret}`);
  const { state } = createMatch(rules, 1);
  const key = fixedKey(options.secret);
  const { salt } = derivedSecret(key, 1, rules);
  state.keys = [state.keys[0] as string, key];
  state.commits = [null, commitmentOf(options.secret, salt)];
  state.guesses = (options.guesses ?? []).map((guess) => {
    if (!isValidNumber(guess, rules))
      throw new Error(`규칙에 맞지 않는 추측: ${guess}`);
    return { seat: 0, guess, ...score(options.secret, guess) };
  });
  state.phase = "play";
  state.turn = 0;
  return state;
}
