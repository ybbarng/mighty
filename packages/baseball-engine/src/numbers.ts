import { type BaseballRules, digitPool } from "./rules";
import { sha256Hex } from "./sha256";

/** 판정: 스트라이크(자리와 숫자가 맞음)·볼(숫자만 맞음). 둘 다 0이면 아웃 */
export interface Score {
  strikes: number;
  balls: number;
}

/** 이 규칙에 맞는 수인가: 자릿수만큼, 쓸 수 있는 숫자로, 겹치지 않게 */
export function isValidNumber(
  text: unknown,
  rules: Pick<BaseballRules, "digits" | "zero">,
): text is string {
  if (typeof text !== "string" || text.length !== rules.digits) return false;
  const pool = digitPool(rules);
  const seen = new Set<string>();
  for (const ch of text) {
    if (!pool.includes(ch) || seen.has(ch)) return false;
    seen.add(ch);
  }
  return true;
}

/** 비밀 수에 이 추측을 물었을 때의 답 */
export function score(secret: string, guess: string): Score {
  let strikes = 0;
  let balls = 0;
  for (let i = 0; i < guess.length; i++) {
    const ch = guess[i] as string;
    if (secret[i] === ch) strikes++;
    else if (secret.includes(ch)) balls++;
  }
  return { strikes, balls };
}

/** 나올 수 있는 답인가(세 자리 2S 1B처럼 자리 하나만 바꾼 답은 없다) */
export function isPossibleScore(score: Score, digits: number): boolean {
  const { strikes, balls } = score;
  if (!Number.isInteger(strikes) || !Number.isInteger(balls)) return false;
  if (strikes < 0 || balls < 0 || strikes + balls > digits) return false;
  return !(strikes === digits - 1 && balls === 1);
}

const ALL_CACHE = new Map<string, readonly string[]>();

/** 이 규칙에서 나올 수 있는 모든 수(세 자리·1~9는 504개, 네 자리·0 씀은 5040개). 작은 수부터 */
export function allNumbers(
  rules: Pick<BaseballRules, "digits" | "zero">,
): readonly string[] {
  const key = `${rules.digits}${rules.zero ? "z" : "n"}`;
  const cached = ALL_CACHE.get(key);
  if (cached) return cached;
  const pool = digitPool(rules);
  const out: string[] = [];
  const build = (prefix: string) => {
    if (prefix.length === rules.digits) {
      out.push(prefix);
      return;
    }
    for (const d of pool) if (!prefix.includes(d)) build(prefix + d);
  };
  build("");
  ALL_CACHE.set(key, out);
  return out;
}

/** 물어본 수와 받은 답 */
export interface Clue {
  guess: string;
  strikes: number;
  balls: number;
}

/** 이 단서들과 어긋나지 않는 수들(남은 후보) */
export function candidatesFor(
  rules: Pick<BaseballRules, "digits" | "zero">,
  clues: readonly Clue[],
): string[] {
  return allNumbers(rules).filter((n) =>
    clues.every((c) => {
      const s = score(n, c.guess);
      return s.strikes === c.strikes && s.balls === c.balls;
    }),
  );
}

/** 단서들과 어긋나지 않는 수가 하나라도 있나(없으면 답 가운데 거짓이 있다) */
export function hasCandidate(
  rules: Pick<BaseballRules, "digits" | "zero">,
  clues: readonly Clue[],
): boolean {
  return allNumbers(rules).some((n) =>
    clues.every((c) => {
      const s = score(n, c.guess);
      return s.strikes === c.strikes && s.balls === c.balls;
    }),
  );
}

/** 소금: 16바이트를 16진수 32자로 */
export const SALT_PATTERN = /^[0-9a-f]{32}$/;
export const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * 약속(commit): 비밀 수와 소금을 이어 붙인 SHA-256. 처음에 이것만 알리고 판 끝에 비밀과 소금을 공개한다.
 * 소금이 있어 약속만 보고 504~5040개 후보를 모두 대 보는 것으로는 비밀을 알 수 없다
 */
export function commitmentOf(secret: string, salt: string): string {
  return sha256Hex(`nb1|${secret}|${salt}`);
}

/** 컴퓨터 자리의 비밀 재료(자리마다). 시드에서 만들고 그 자리 화면에만 보인다(docs/34 4절) */
export function seatKey(seed: number, seat: number): string {
  return sha256Hex(`nb-key|${seed >>> 0}|${seat}`);
}

/** 튜토리얼 장면처럼 컴퓨터 비밀을 정해 둘 때 쓰는 재료 */
export function fixedKey(secret: string): string {
  return `fixed:${secret}`;
}

/**
 * 비밀 재료로 그 판의 비밀 수와 소금을 만든다. 컴퓨터가 쓰고, 끊긴 사이 컴퓨터가 대신 정한 내 수를
 * 다시 알아낼 때도 쓴다. 같은 재료·같은 판이면 늘 같은 수가 나온다
 */
export function derivedSecret(
  key: string,
  roundNumber: number,
  rules: Pick<BaseballRules, "digits" | "zero">,
): { secret: string; salt: string } {
  const salt = sha256Hex(`nb-salt|${key}|${roundNumber}`).slice(0, 32);
  if (key.startsWith("fixed:")) return { secret: key.slice(6), salt };
  const hex = sha256Hex(`nb-secret|${key}|${roundNumber}`);
  const pool = digitPool(rules);
  let secret = "";
  for (let i = 0; secret.length < rules.digits; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    const at = byte % pool.length;
    secret += pool[at];
    pool.splice(at, 1);
  }
  return { secret, salt };
}
