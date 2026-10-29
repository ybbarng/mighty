import {
  type Action,
  allNumbers,
  type BaseballView,
  candidatesFor,
  cluesOf,
  commitmentOf,
  derivedSecret,
  score,
} from "@mighty/baseball-engine";
import { nextFloat, nextInt, type RngState } from "@mighty/engine";

/** 컴퓨터 플레이어. 자기 자리 화면만 받는다(마이티·오목과 같은 모양) */
export interface BaseballBot {
  readonly name: string;
  decide(view: BaseballView, rng: RngState): Action;
}

/** 이 자리 비밀 재료로 만든 이번 판 비밀(컴퓨터가 쓰는 비밀) */
export function botSecretOf(view: BaseballView): {
  secret: string;
  salt: string;
} {
  return derivedSecret(view.botKey, view.roundNumber, view.rules);
}

/**
 * 컴퓨터가 이 자리의 비밀을 아는가. 사람이 정한 비밀(끊긴 사람 대신 둘 때)은 모르므로
 * 답하기·공개는 그 사람을 기다린다. 비밀 정하기와 맞히기는 언제든 할 수 있다
 */
export function botKnowsSecret(view: BaseballView): boolean {
  const kind = view.decision?.kind;
  if (kind !== "answer" && kind !== "reveal") return true;
  const { secret, salt } = botSecretOf(view);
  return view.commits[view.mySeat] === commitmentOf(secret, salt);
}

/** 이 자리가 지금까지 받은 답과 어긋나지 않는 후보 */
export function myCandidates(view: BaseballView): string[] {
  return candidatesFor(view.rules, cluesOf(view, view.mySeat));
}

/** 아직 물어보지 않은 수 */
function unasked(view: BaseballView, numbers: readonly string[]): string[] {
  const asked = new Set(
    view.guesses.filter((g) => g.seat === view.mySeat).map((g) => g.guess),
  );
  return numbers.filter((n) => !asked.has(n));
}

function pick<T>(items: readonly T[], rng: RngState): T {
  return items[nextInt(rng, items.length)] as T;
}

/**
 * 고수의 추측: 답의 갈래가 가장 고르게 나뉘는 수(엔트로피가 가장 큰 수 = Σ nᵢ·ln nᵢ가 가장 작은 수).
 * 값이 같으면 후보인 수(바로 맞힐 수도 있다)를 고른다. 계산량을 휴대폰에서도 0.3초 안쪽에 두려고
 * 후보 수 × 따져 볼 수가 정한 양을 넘으면 따져 볼 수를 난수로 줄인다(같은 시드면 같은 수)
 */
export function bestGuess(
  view: BaseballView,
  candidates: readonly string[],
  rng: RngState,
  budget = 3_000_000,
): string {
  if (candidates.length <= 2) return candidates[0] as string;
  const digits = view.rules.digits;
  const all = unasked(view, allNumbers(view.rules));
  // 처음 수는 모두 같은 값이라 아무거나 둔다.
  if (candidates.length === allNumbers(view.rules).length)
    return pick(candidates, rng);
  const isCandidate = new Set(candidates);
  let pool: string[] = [
    ...candidates,
    ...all.filter((n) => !isCandidate.has(n)),
  ];
  const limit = Math.max(
    candidates.length,
    Math.floor(budget / candidates.length),
  );
  if (pool.length > limit) {
    // 후보는 모두 두고, 나머지는 난수로 골라 채운다.
    const rest = pool.slice(candidates.length);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = nextInt(rng, i + 1);
      [rest[i], rest[j]] = [rest[j] as string, rest[i] as string];
    }
    pool = [...candidates, ...rest.slice(0, limit - candidates.length)];
  }
  // 후보마다 숫자 → 자리 표(없으면 -1)를 미리 만들어 판정을 빠르게 한다.
  const positions = new Int8Array(candidates.length * 10).fill(-1);
  candidates.forEach((c, k) => {
    for (let i = 0; i < c.length; i++)
      positions[k * 10 + c.charCodeAt(i) - 48] = i;
  });
  const width = digits + 1;
  const buckets = new Int32Array(width * width);
  const guessDigits = new Int8Array(digits);
  let best = pool[0] as string;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const guess of pool) {
    for (let i = 0; i < digits; i++) guessDigits[i] = guess.charCodeAt(i) - 48;
    buckets.fill(0);
    for (let k = 0; k < candidates.length; k++) {
      let strikes = 0;
      let balls = 0;
      for (let i = 0; i < digits; i++) {
        const at = positions[k * 10 + (guessDigits[i] as number)] as number;
        if (at === i) strikes++;
        else if (at >= 0) balls++;
      }
      const at = strikes * width + balls;
      buckets[at] = (buckets[at] as number) + 1;
    }
    // 남는 정보의 기댓값 Σ n·ln n(작을수록 고르게 나뉜다). 맞히는 갈래는 끝나므로 조금 덜 센다.
    const hit = buckets[digits * width] ?? 0;
    let sum = -hit * HIT_BONUS;
    for (const n of buckets) sum += NLOGN[n] ?? 0;
    if (sum < bestScore) {
      bestScore = sum;
      best = guess;
    }
  }
  return best;
}

/**
 * n·ln n 표(정수, 만 배). 기기마다 `Math.log` 끝자리가 달라도 같은 수를 고르게 반올림해 둔다
 * (참가자가 판 끝 검증에서 컴퓨터 수를 다시 계산한다)
 */
const NLOGN: Int32Array = (() => {
  const table = new Int32Array(5041);
  for (let n = 2; n < table.length; n++)
    table[n] = Math.round(n * Math.log(n) * 10_000);
  return table;
})();
const HIT_BONUS = 5_000;

function makeBot(
  name: string,
  guess: (view: BaseballView, rng: RngState) => string,
): BaseballBot {
  return {
    name,
    decide(view, rng): Action {
      const decision = view.decision;
      if (!decision) throw new Error("할 일이 없다");
      switch (decision.kind) {
        case "commit": {
          const { secret, salt } = botSecretOf(view);
          return { type: "commit", hash: commitmentOf(secret, salt) };
        }
        case "answer":
          return {
            type: "answer",
            ...score(botSecretOf(view).secret, decision.guess),
          };
        case "reveal":
          return { type: "reveal", ...botSecretOf(view) };
        case "continue":
          return { type: "continue" };
        case "guess":
          return { type: "guess", guess: guess(view, rng) };
      }
    },
  };
}

/** 입문: 어긋나지 않는 후보 가운데 아무거나. 넷에 하나는 앞 답을 잊은 듯 아무 수나 묻는다 */
export const baseballBeginnerBot = makeBot("입문", (view, rng) => {
  const candidates = myCandidates(view);
  if (nextFloat(rng) < 0.25 || candidates.length === 0) {
    const free = unasked(view, allNumbers(view.rules));
    return pick(free, rng);
  }
  return pick(candidates, rng);
});

/** 중수: 늘 어긋나지 않는 후보 가운데 하나를 고른다 */
export const baseballIntermediateBot = makeBot("중수", (view, rng) =>
  pick(myCandidates(view), rng),
);

/** 고수: 답의 갈래가 가장 고르게 나뉘는 수를 고른다 */
export const baseballExpertBot = makeBot("고수", (view, rng) =>
  bestGuess(view, myCandidates(view), rng),
);

export const BASEBALL_BOTS = [
  baseballBeginnerBot,
  baseballIntermediateBot,
  baseballExpertBot,
] as const;

/** 0 입문, 1 중수, 2 고수 */
export function baseballBotFor(level: number): BaseballBot {
  return BASEBALL_BOTS[Math.max(0, Math.min(2, level))] as BaseballBot;
}
