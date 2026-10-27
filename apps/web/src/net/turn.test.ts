import { afterEach, describe, expect, it, vi } from "vitest";

import { resetTurnCache, turnConfig } from "./turn";

const credentials = {
  username: "1793100000:mighty",
  credential: "c2VjcmV0",
  urls: ["turns:turn.byb.kr:443?transport=tcp"],
  ttl: 21600,
};

function stubFetch(response: () => Promise<Response>) {
  const fetch = vi.fn(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetTurnCache();
});

describe("TURN 계정 받기", () => {
  it("받은 계정을 iceServers 모양으로 돌려주고, 끝나기 한 시간 전까지는 다시 쓴다", async () => {
    vi.useFakeTimers({ now: 0, toFake: ["Date"] });
    const fetch = stubFetch(async () => Response.json(credentials));
    const expected = [
      {
        urls: credentials.urls,
        username: credentials.username,
        credential: credentials.credential,
      },
    ];
    expect(await turnConfig()).toEqual(expected);
    vi.setSystemTime(4.9 * 60 * 60 * 1000);
    expect(await turnConfig()).toEqual(expected);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(5.1 * 60 * 60 * 1000);
    await turnConfig();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("계정 주소가 없거나(개발 서버) 서버가 실패하면 TURN 없이 잇는다", async () => {
    stubFetch(async () => new Response("Not Found", { status: 404 }));
    expect(await turnConfig()).toBeNull();
    stubFetch(async () => {
      throw new TypeError("network");
    });
    expect(await turnConfig()).toBeNull();
  });

  it("모양이 다른 응답(예: HTML)은 쓰지 않는다", async () => {
    stubFetch(async () => new Response("<!doctype html>", { status: 200 }));
    expect(await turnConfig()).toBeNull();
    stubFetch(async () => Response.json({ ...credentials, urls: [] }));
    expect(await turnConfig()).toBeNull();
  });
});
