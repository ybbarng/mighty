import { describe, expect, it } from "vitest";

import { astronautFromHash } from "./identity";
import { addressFacts, factKeys, placeFact, stageFact } from "./place-facts";

describe("등록증 주소 안내", () => {
  const { ids, stages } = factKeys();

  it("모든 주소(끝 천체와 지구 대륙)에 설명이 있다", () => {
    const missing = ids.filter((id) => !placeFact(id));
    expect(missing).toEqual([]);
  });

  it("주소 경로의 모든 중간 단계에 설명이 있다", () => {
    const missing = stages.filter((n) => !stageFact(n));
    expect(missing).toEqual([]);
  });

  it("외계 행성은 NASA 값으로 발견 연도와 1년 길이를 말한다", () => {
    const e = placeFact("55-cnc-e") ?? "";
    expect(e).toContain("2004년");
    expect(e).toContain("1년은 약 18시간");
    // 시선 속도로만 안 행성은 크기 대신 최소 질량
    expect(placeFact("55-cnc-d")).toContain("질량은 적어도 목성의");
  });

  it("주소 전체를 단계마다 설명하고, 마지막은 그 천체(지구면 대륙)다", () => {
    for (let i = 0; i < 300; i++) {
      const seed = new Uint8Array(32);
      seed[0] = i;
      seed[1] = i >> 3;
      seed[5] = i * 7;
      seed[6] = i * 13;
      const a = astronautFromHash(seed);
      const facts = addressFacts(a.address, a.placeId);
      expect(facts.map((f) => f.name)).toEqual([...a.address]);
      expect(facts.every((f) => f.text)).toBe(true);
      expect(facts.at(-1)?.text).toBe(placeFact(a.placeId));
    }
  });
});
