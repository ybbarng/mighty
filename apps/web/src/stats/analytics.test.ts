import { afterEach, describe, expect, it } from "vitest";

import { createTutorialProgress } from "@/tutorial/progress";

import { beforeSend, setAnalyticsOff, shouldSend } from "./analytics";
import { track } from "./track";

const ON = { off: false, gpc: false, search: "" };

describe("사이트 통계: 보내기 직전 확인(docs/33 3절 ②)", () => {
  it("주소에 쿼리·#·방 코드가 남아 있으면 보내지 않는다", () => {
    expect(shouldSend({ url: "/omok" }, ON)).toBe(true);
    expect(
      shouldSend({ url: "/omok", referrer: "https://www.google.com/" }, ON),
    ).toBe(true);
    for (const url of [
      "/omok?room=abcd1234",
      "/chess?seed=7",
      "/hearts#k=secret",
      "/review/room=x",
    ])
      expect(shouldSend({ url }, ON), url).toBe(false);
    expect(
      shouldSend(
        { url: "/omok", referrer: "https://game.byb.kr/omok?room=a" },
        ON,
      ),
    ).toBe(false);
  });

  it("이 기기에서 껐거나 GPC를 켰거나 같은 탭 시험(?net=local)이면 보내지 않는다", () => {
    expect(shouldSend({ url: "/" }, { ...ON, off: true })).toBe(false);
    expect(shouldSend({ url: "/" }, { ...ON, gpc: true })).toBe(false);
    expect(shouldSend({ url: "/" }, { ...ON, search: "?net=local" })).toBe(
      false,
    );
    expect(shouldSend(null, ON)).toBe(false);
  });
});

describe("사이트 통계: 끄기 스위치와 이벤트", () => {
  const events: { name: string; data: unknown }[] = [];
  const umami = {
    track: (name: string, data: unknown) => events.push({ name, data }),
  };

  afterEach(() => {
    setAnalyticsOff(false);
    events.length = 0;
    delete (globalThis as { umami?: unknown }).umami;
  });

  it("끄기를 저장하면 보내기 직전 함수가 막고, 켜면 그대로 보낸다", () => {
    const payload = { url: "/janggi" };
    expect(beforeSend("event", payload)).toBe(payload);
    setAnalyticsOff(true);
    expect(beforeSend("event", payload)).toBe(false);
    setAnalyticsOff(false);
    expect(beforeSend("event", payload)).toBe(payload);
  });

  it("통계 스크립트가 없으면(개발·시험 빌드, 광고 차단기) 아무 일도 하지 않는다", () => {
    expect(() =>
      track("game-start", { game: "omok", mode: "solo", level: 1 }),
    ).not.toThrow();
    (globalThis as { umami?: unknown }).umami = {
      track: () => {
        throw new Error("막힘");
      },
    };
    expect(() => track("learn-open", { game: "omok" })).not.toThrow();
  });

  it("배우기 단원을 마치면 게임 이름·단원 id·처음인지만 보낸다", () => {
    (globalThis as { umami?: unknown }).umami = umami;
    const progress = createTutorialProgress("baduk-tutorial");
    expect(progress.game).toBe("baduk");
    progress.getState().complete("liberties");
    progress.getState().complete("liberties");
    expect(events).toEqual([
      {
        name: "lesson-finish",
        data: { game: "baduk", lesson: "liberties", first: true },
      },
      {
        name: "lesson-finish",
        data: { game: "baduk", lesson: "liberties", first: false },
      },
    ]);
  });
});
