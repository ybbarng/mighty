import { describe, expect, it } from "vitest";

import { DEFAULT_PREFIX_LIMITS } from "./config";
import { BusyError, Counters, Gate, ipPrefix } from "./limits";
import { DEFAULT_RELAY_LIMITS } from "./relay";

describe("IP 앞부분", () => {
  it("IPv4는 /24, IPv6는 /48, IPv4가 섞인 IPv6는 IPv4로 본다", () => {
    expect(ipPrefix("203.0.113.7")).toBe("203.0.113");
    expect(ipPrefix("::ffff:203.0.113.7")).toBe("203.0.113");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd");
    expect(ipPrefix("2001:0db8:0abc::")).toBe("2001:db8:abc");
    expect(ipPrefix("2001:db8::1")).toBe("2001:db8:0");
  });
});

describe("계수기", () => {
  it("구간이 바뀌면 지난 구간을 지운다", () => {
    const c = new Counters();
    c.add("entry", "1", "a");
    c.add("entry", "1", "a");
    expect(c.count("entry", "1", "a")).toBe(2);
    expect(c.count("entry", "2", "a")).toBe(0);
    expect(c.count("entry", "1", "a")).toBe(0);
  });
});

describe("동시 실행 제한", () => {
  it("한도만큼만 동시에 돌리고, 줄이 꽉 차면 곧바로 거절한다", async () => {
    const gate = new Gate(1, 1);
    let running = 0;
    let most = 0;
    const releases: (() => void)[] = [];
    const job = () =>
      gate.run(async () => {
        running++;
        most = Math.max(most, running);
        await new Promise<void>((resolve) => releases.push(resolve));
        running--;
      });
    const first = job();
    const second = job();
    await expect(job()).rejects.toBeInstanceOf(BusyError);
    // 조건이 맞을 때까지(첫 일이 돌기 시작) 기다린다
    while (releases.length === 0) await Promise.resolve();
    releases.shift()?.();
    while (releases.length === 0) await Promise.resolve();
    releases.shift()?.();
    await Promise.all([first, second]);
    expect(most).toBe(1);
  });
});

describe("IP 앞부분 상한 기본값(공유 IP 기준)", () => {
  it("회사·학교 NAT처럼 외부 IP 하나에 100명이 넘어도 막히지 않게 넉넉하다", () => {
    expect(DEFAULT_PREFIX_LIMITS).toEqual({
      registrationsPerPrefixPerDay: 200,
      entriesPerPrefixPerRound: 200,
      invitesPerPrefixPerDay: 100,
    });
    // 전달 서버 기본값도 같은 값을 쓴다
    expect(DEFAULT_RELAY_LIMITS.invitesPerPrefixPerDay).toBe(
      DEFAULT_PREFIX_LIMITS.invitesPerPrefixPerDay,
    );
  });
});
