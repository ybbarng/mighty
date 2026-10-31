import { fromBase64Url } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";
import { astronautOf } from "./astronaut/identity";
import { TOUR_ANDROMEDA_PUB, TOUR_EARTH_PUB } from "./demo-tour";
import { originGreeting, originLines, originOf } from "./origin-greeting";

const at = (placeId: string, otherGalaxy = false) => ({ placeId, otherGalaxy });

describe("출신 판정(주소 id)", () => {
  it("지구(대륙 포함)·달·태양·블랙홀·안드로메다·다른 은하만 특별하다", () => {
    expect(originOf(at("earth/antarctica"))).toEqual({ kind: "earth" });
    expect(originOf(at("earth/moon"))).toEqual({ kind: "moon" });
    expect(originOf(at("sun"))).toEqual({ kind: "sun" });
    expect(originOf(at("m87/m87-bh", true))).toEqual({ kind: "blackhole" });
    expect(originOf(at("m31/m32", true))).toEqual({ kind: "andromeda" });
    expect(originOf(at("lmc/tarantula", true))).toEqual({
      kind: "far",
      galaxy: "대마젤란은하",
    });
    // 우리 은하의 보통 주소는 대상이 아니다
    expect(originOf(at("jupiter/europa"))).toBeNull();
    expect(originOf(at("trappist-1e"))).toBeNull();
  });

  it("둘러보기 견본 열쇠는 지구와 안드로메다 출신이다", () => {
    expect(originOf(astronautOf(fromBase64Url(TOUR_EARTH_PUB)))?.kind).toBe(
      "earth",
    );
    expect(originOf(astronautOf(fromBase64Url(TOUR_ANDROMEDA_PUB)))?.kind).toBe(
      "andromeda",
    );
  });
});

describe("출신 인사 고르기", () => {
  it("무작위를 넣으면 결정적이고, 블랙홀은 사용자가 정한 문장 하나", () => {
    expect(originGreeting(at("earth"), () => 0)).toBe(
      "지구인이시군요! 지구가 그렇게 아름답다는데 정말 그런가요? 저도 가 보고 싶네요.",
    );
    expect(originLines({ kind: "blackhole" })).toEqual([
      "세상에... 블랙홀에서 어떻게 빠져나오셨죠? 물리학 책을 새로 써야겠어요.",
    ]);
    expect(originGreeting(at("trappist-1e"), () => 0)).toBeNull();
  });

  it("다른 은하는 그 은하 이름을 넣고, 모든 말은 마침표·물음표로 끝난다", () => {
    expect(originGreeting(at("lmc", true), () => 0.5)).toContain(
      "대마젤란은하 출신은 처음 봬요!",
    );
    for (const o of [
      { kind: "earth" },
      { kind: "moon" },
      { kind: "sun" },
      { kind: "blackhole" },
      { kind: "andromeda" },
      { kind: "far", galaxy: "M87" },
    ] as const)
      for (const l of originLines(o)) expect(l).toMatch(/[.?]$/);
  });
});
