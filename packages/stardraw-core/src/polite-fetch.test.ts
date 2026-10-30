import { describe, expect, it } from "vitest";

import { type FetchClock, politeFetch, retryAfterMs } from "./polite-fetch";

/** 손으로 옮기는 시계. `drain`은 걸린 일이 없을 때까지 다음 일의 시각으로 건너뛴다 */
class StepClock implements FetchClock {
  time = 0;
  private timers: { at: number; fn: () => void }[] = [];
  now() {
    return this.time;
  }
  after(ms: number, fn: () => void) {
    const t = { at: this.time + ms, fn };
    this.timers.push(t);
    return () => {
      this.timers = this.timers.filter((x) => x !== t);
    };
  }
  /** 약속이 끝날 때까지: 할 일(마이크로태스크)을 비우고, 그래도 안 끝났으면 다음 일 시각으로 */
  async drain<T>(p: Promise<T>): Promise<T> {
    let done = false;
    const out = p.finally(() => {
      done = true;
    });
    for (let guard = 0; guard < 1000; guard++) {
      await new Promise((r) => setTimeout(r, 0));
      if (done) return out;
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers.shift();
      if (!next) continue;
      this.time = Math.max(this.time, next.at);
      next.fn();
    }
    throw new Error("끝나지 않았다");
  }
}

/** 차례로 정한 응답을 내주고, 부른 시각을 적는 가짜 fetch */
function scripted(clock: StepClock, replies: (() => Response)[]) {
  const calls: number[] = [];
  const f = (async () => {
    calls.push(clock.now());
    const next = replies.shift();
    return next ? next() : new Response("ok");
  }) as unknown as typeof fetch;
  return { f, calls };
}

const tooMany =
  (headers: Record<string, string> = {}) =>
  () =>
    new Response("많음", { status: 429, headers });

describe("politeFetch — 서버가 막으면 기다렸다 다시", () => {
  it("Retry-After(초)만큼 기다렸다 다시 받는다", async () => {
    const clock = new StepClock();
    const { f, calls } = scripted(clock, [tooMany({ "retry-after": "3" })]);
    const res = await clock.drain(politeFetch(f, { clock })("/x"));
    expect(res.status).toBe(200);
    expect(calls).toEqual([0, 3000]);
  });

  it("Retry-After가 없으면 두 배씩 늘어나는 간격에 흔들림을 더한다(503도)", async () => {
    const clock = new StepClock();
    const unavailable = () => new Response("", { status: 503 });
    const { f, calls } = scripted(clock, [tooMany(), unavailable, tooMany()]);
    // random 0 → 간격의 절반: 500, 1000, 2000
    const polite = politeFetch(f, { clock, random: () => 0 });
    const res = await clock.drain(polite("/x"));
    expect(res.status).toBe(200);
    expect(calls).toEqual([0, 500, 1500, 3500]);
  });

  it("횟수 상한에 닿으면 마지막 응답(429)을 그대로 돌려준다", async () => {
    const clock = new StepClock();
    const { f, calls } = scripted(
      clock,
      Array.from({ length: 10 }, () => tooMany({ "retry-after": "1" })),
    );
    const res = await clock.drain(
      politeFetch(f, { clock, maxAttempts: 3 })("/x"),
    );
    expect(res.status).toBe(429);
    expect(calls).toEqual([0, 1000, 2000]);
  });

  it("기다림이 전체 시간 상한을 넘으면 기다리지 않고 바로 돌려준다", async () => {
    const clock = new StepClock();
    const { f, calls } = scripted(clock, [tooMany({ "retry-after": "600" })]);
    const res = await clock.drain(
      politeFetch(f, { clock, maxWaitMs: 60_000 })("/x"),
    );
    expect(res.status).toBe(429);
    expect(calls).toEqual([0]);
  });

  it("다른 상태(404·500)는 다시 받지 않는다", async () => {
    const clock = new StepClock();
    const { f, calls } = scripted(clock, [
      () => new Response("", { status: 500 }),
    ]);
    const res = await clock.drain(politeFetch(f, { clock })("/x"));
    expect(res.status).toBe(500);
    expect(calls).toEqual([0]);
  });

  it("한꺼번에 보내는 수를 묶고, 하나가 막히면 나머지도 그때까지 기다린다", async () => {
    const clock = new StepClock();
    let inFlight = 0;
    let most = 0;
    const calls: [string, number][] = [];
    let first = true;
    const f = (async (url: string) => {
      calls.push([url, clock.now()]);
      inFlight++;
      most = Math.max(most, inFlight);
      // 응답이 시간이 걸리게(시계로 100ms)
      await new Promise<void>((r) => clock.after(100, r));
      inFlight--;
      if (first) {
        first = false;
        return new Response("", {
          status: 429,
          headers: { "retry-after": "5" },
        });
      }
      return new Response("ok");
    }) as unknown as typeof fetch;
    const polite = politeFetch(f, { clock, concurrency: 2 });
    const all = Promise.all(
      Array.from({ length: 6 }, (_, i) => polite(`/${i}`)),
    );
    const res = await clock.drain(all);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(most).toBe(2);
    // /0이 100ms에 429(5초) → 그 뒤 보낸 요청은 모두 5100ms 이후
    const after = calls.filter(([, t]) => t >= 100 && t < 5100);
    expect(after).toEqual([]);
    expect(calls.filter(([u]) => u === "/0").map(([, t]) => t)).toEqual([
      0, 5100,
    ]);
  });

  it("겹쳐 감싸지 않는다", () => {
    const f = politeFetch(fetch);
    expect(politeFetch(f)).toBe(f);
  });
});

describe("retryAfterMs", () => {
  it("초와 HTTP 날짜를 읽는다", () => {
    expect(retryAfterMs("2", 0)).toBe(2000);
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("곧", 0)).toBeNull();
    const now = Date.parse("2026-10-30T00:00:00Z");
    expect(retryAfterMs("Fri, 30 Oct 2026 00:00:07 GMT", now)).toBe(7000);
    expect(retryAfterMs("Fri, 30 Oct 2026 00:00:00 GMT", now + 5)).toBe(0);
  });
});
