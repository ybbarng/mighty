// @vitest-environment node
import {
  fromBase64Url,
  generateSigner,
  sha256,
  utf8,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";
import { TOUR_EGG_PUBS } from "../demo-tour";
import {
  type AstronautLists,
  astronautFromHash,
  astronautOf,
  COSMIC_PATH,
  crockford40,
  EGG_ROLL,
  GALAXY_ROLL,
  residentPhrase,
} from "./identity";
import { NAMES } from "./names";
import { ARM_PLACES, OTHER_GALAXY_PLACES } from "./places";

/** 결정적 표본: i번째 가짜 해시 */
const sample = (i: number) => sha256(utf8(`astronaut-sample-${i}`));

/** 바이트 몇 개만 정해 둔 해시 */
function hashWith(set: Record<number, number>): Uint8Array {
  const h = new Uint8Array(32).fill(0xaa);
  for (const [i, v] of Object.entries(set)) h[Number(i)] = v;
  return h;
}

const LISTS: AstronautLists = {
  names: ["별하솔", "노을빛"],
  arm: [
    { path: ["태양계", "지구"] },
    { path: ["트라피스트-1", "트라피스트-1 e"], ly: 41 },
  ],
  galaxies: [
    {
      path: [
        "라니아케아 초은하단",
        "처녀자리 초은하단",
        "국부은하군",
        "안드로메다은하",
        "M32",
      ],
    },
  ],
};

describe("등록번호", () => {
  it("40비트를 Crockford base32 8자로(헷갈리는 I·L·O·U 없음)", () => {
    expect(crockford40(new Uint8Array(5))).toBe("00000000");
    expect(crockford40(new Uint8Array(5).fill(0xff))).toBe("ZZZZZZZZ");
    expect(crockford40(Uint8Array.from([0, 0, 0, 0, 33]))).toBe("00000011");
    for (let i = 0; i < 200; i++)
      expect(crockford40(sample(i))).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("SD-XXXX-XXXX 꼴이고 같은 공개 열쇠면 늘 같은 등록증", async () => {
    const { publicKey } = await generateSigner();
    const a = astronautOf(publicKey);
    expect(a.number).toMatch(/^SD-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(astronautOf(Uint8Array.from(publicKey))).toEqual(a);
    const other = await generateSigner();
    expect(astronautOf(other.publicKey).number).not.toBe(a.number);
  });
});

describe("이름과 주소", () => {
  it("주소는 우리 우주부터의 전체 경로, 카드는 우리 은하부터, 인사는 끝 천체 하나", () => {
    const a = astronautFromHash(
      hashWith({ 9: 0xff, 11: 0, 12: 0, 13: 0, 14: 1 }),
      LISTS,
    );
    expect(a.otherGalaxy).toBe(false);
    expect(a.address).toEqual([
      ...COSMIC_PATH,
      "우리 은하",
      "오리온 팔",
      "트라피스트-1",
      "트라피스트-1 e",
    ]);
    expect(a.short).toEqual([
      "우리 은하",
      "오리온 팔",
      "트라피스트-1",
      "트라피스트-1 e",
    ]);
    expect(a.home).toBe("트라피스트-1 e");
    expect(a.ly).toBe(41);
    expect(residentPhrase(a)).toBe(`트라피스트-1 e에 거주하는 ${a.name}`);
  });

  it("다른 은하는 65536분의 128(1/512): 경계값 그대로", () => {
    const at = (roll: number) =>
      astronautFromHash(hashWith({ 9: roll >> 8, 10: roll & 255 }), LISTS);
    expect(at(GALAXY_ROLL - 1).otherGalaxy).toBe(true);
    expect(at(GALAXY_ROLL).otherGalaxy).toBe(false);
    const far = at(0);
    expect(far.address).toEqual([
      "우리 우주",
      "라니아케아 초은하단",
      "처녀자리 초은하단",
      "국부은하군",
      "안드로메다은하",
      "M32",
    ]);
    expect(far.short).toEqual(["국부은하군", "안드로메다은하", "M32"]);
    expect(far.ly).toBeUndefined();
  });
});

describe("드문 사진", () => {
  it("65536분의 32(1/2048), 셋 중 하나", () => {
    const at = (roll: number, kind = 0) =>
      astronautFromHash(
        hashWith({ 15: roll >> 8, 16: roll & 255, 17: kind }),
        LISTS,
      ).egg;
    expect(at(EGG_ROLL - 1, 0)).toBe("laika");
    expect(at(0, 1)).toBe("prince");
    expect(at(0, 2)).toBe("rabbit");
    expect(at(EGG_ROLL)).toBeNull();
  });

  it("화면 둘러보기에 둔 공개 열쇠 셋은 각각 그 사진이 나온다", () => {
    for (const [egg, pub] of Object.entries(TOUR_EGG_PUBS))
      expect(astronautOf(fromBase64Url(pub)).egg).toBe(egg);
  });
});

describe("실제 목록", () => {
  it("이름은 3음절, 겹치지 않고, 같은 음절이 붙어 나오지 않는다", () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
    for (const n of NAMES) {
      expect([...n]).toHaveLength(3);
      expect(/(.)\1/u.test(n), n).toBe(false);
    }
  });

  it("주소는 겹치지 않고, 다른 은하 주소에는 처녀자리 은하단과 국부은하군이 함께 있지 않다", () => {
    const keys = [...ARM_PLACES, ...OTHER_GALAXY_PLACES].map((p) =>
      p.path.join(" › "),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(ARM_PLACES.length).toBeGreaterThanOrEqual(200);
    expect(OTHER_GALAXY_PLACES.length).toBeGreaterThan(0);
    expect(ARM_PLACES).toContainEqual({ path: ["태양계", "지구"] });
    for (const p of OTHER_GALAXY_PLACES)
      expect(
        p.path.includes("국부은하군") && p.path.includes("처녀자리 은하단"),
      ).toBe(false);
  });

  it("표본 2만 명: 이름·주소가 고루 나오고, 다른 은하·드문 사진 비율이 정한 값 근처", () => {
    const N = 20_000;
    const names = new Map<string, number>();
    const homes = new Set<string>();
    let galaxy = 0;
    let eggs = 0;
    for (let i = 0; i < N; i++) {
      const a = astronautFromHash(sample(i));
      names.set(a.name, (names.get(a.name) ?? 0) + 1);
      homes.add(a.address.join(" › "));
      if (a.otherGalaxy) galaxy++;
      if (a.egg) eggs++;
    }
    expect(names.size).toBe(NAMES.length);
    // 이름 하나는 평균의 절반~두 배 사이
    const mean = N / NAMES.length;
    for (const c of names.values()) {
      expect(c).toBeGreaterThan(mean / 2);
      expect(c).toBeLessThan(mean * 2);
    }
    expect(homes.size).toBeGreaterThan(ARM_PLACES.length * 0.95);
    // 기댓값: 다른 은하 약 39명, 드문 사진 약 10명(표본이 고정이라 결과도 고정)
    expect(galaxy).toBeGreaterThan(15);
    expect(galaxy).toBeLessThan(80);
    expect(eggs).toBeGreaterThan(2);
    expect(eggs).toBeLessThan(30);
  });
});
