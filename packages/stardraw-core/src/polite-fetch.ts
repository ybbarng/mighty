/**
 * 서버를 두드리지 않고 받기(docs/36 7절 「장부 받기」). 공개 장부 검사와 화면의 서버 장부가 같이 쓴다.
 * - 한꺼번에 보내는 요청 수를 `concurrency`개로 묶는다
 * - 429(요청이 너무 많음)·503(잠시 못 받음)이면 Retry-After만큼(없으면 늘어나는 간격에 흔들림을 더해) 기다렸다 다시 받는다.
 *   하나가 막히면 같은 묶음의 다른 요청도 그때까지 기다린다(막힌 동안 계속 두드리지 않게)
 * - 다시 받기는 `maxAttempts`번, 처음 보낸 때부터 `maxWaitMs`까지. 넘으면 마지막 응답을 그대로 돌려준다
 * 시각과 기다림은 `clock`으로 잰다(시험은 손으로 옮기는 시계를 넣는다).
 */

/** fair-play의 `Clock`과 같은 모양(규칙 패키지는 그 패키지에 기대지 않는다) */
export interface FetchClock {
  now(): number;
  after(ms: number, fn: () => void): () => void;
}

export const realFetchClock: FetchClock = {
  now: () => Date.now(),
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

export interface PoliteFetchOptions {
  /** 한꺼번에 보내는 요청 수(기본 4) */
  concurrency?: number;
  /** 한 요청을 보내는 최대 횟수(처음 포함, 기본 6) */
  maxAttempts?: number;
  /** 한 요청이 기다릴 수 있는 전체 시간(ms, 기본 2분) */
  maxWaitMs?: number;
  /** 첫 기다림(ms, 기본 1초). 다시 할 때마다 두 배, `maxDelayMs`까지 */
  baseDelayMs?: number;
  maxDelayMs?: number;
  clock?: FetchClock;
  /** 0 이상 1 미만(기본 Math.random). 기다림을 0.5~1배로 흔든다(여럿이 같은 순간에 몰리지 않게) */
  random?: () => number;
}

const RETRY_STATUS = new Set([429, 503]);
const POLITE = Symbol("polite-fetch");

/**
 * Retry-After 머리글(초 또는 HTTP 날짜)을 기다릴 ms로. 읽지 못하면 null
 */
export function retryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000);
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - now);
}

/** 이미 감싼 fetch면 그대로 돌려준다(겹쳐 감싸 다시 받기가 곱절로 늘지 않게) */
export function politeFetch(
  fetchFn: typeof fetch,
  options: PoliteFetchOptions = {},
): typeof fetch {
  if ((fetchFn as unknown as Record<symbol, unknown>)[POLITE]) return fetchFn;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 6);
  const maxWaitMs = options.maxWaitMs ?? 120_000;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const clock = options.clock ?? realFetchClock;
  const random = options.random ?? Math.random;

  let active = 0;
  const waiting: (() => void)[] = [];
  /** 이 시각까지는 아무 요청도 보내지 않는다(서버가 막았다고 알려 온 때) */
  let blockedUntil = 0;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      clock.after(ms, resolve);
    });
  const acquire = async () => {
    if (active < concurrency) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  const wrapped = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const started = clock.now();
    await acquire();
    try {
      for (let attempt = 1; ; attempt++) {
        const gap = blockedUntil - clock.now();
        if (gap > 0) await sleep(gap);
        const res = await fetchFn(input, init);
        if (!RETRY_STATUS.has(res.status) || attempt >= maxAttempts) return res;
        const now = clock.now();
        const told = retryAfterMs(res.headers.get("retry-after"), now);
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const delay = told ?? Math.ceil(backoff * (0.5 + random() / 2));
        if (now + delay - started > maxWaitMs) return res;
        blockedUntil = Math.max(blockedUntil, now + delay);
        // 다시 받기 전에 본문을 비워 연결을 돌려준다
        await res.body?.cancel().catch(() => undefined);
      }
    } finally {
      release();
    }
  };
  Object.defineProperty(wrapped, POLITE, { value: true });
  return wrapped as typeof fetch;
}

/** 받지 못한 까닭을 쉬운 말로(검사기·화면의 오류 문장) */
export function fetchFailure(what: string, status: number): string {
  if (status === 429)
    return `${what}를 받지 못했습니다. 서버가 요청이 많다며 잠시 막았습니다(429). 1~2분 뒤 다시 해 보세요`;
  if (status === 503)
    return `${what}를 받지 못했습니다. 서버가 잠시 응답하지 못합니다(503). 조금 뒤 다시 해 보세요`;
  return `${what}를 받지 못했습니다(${status})`;
}
