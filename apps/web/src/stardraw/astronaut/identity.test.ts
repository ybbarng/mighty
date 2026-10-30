// @vitest-environment node
import {
  fromBase64Url,
  generateSigner,
  sha256,
  utf8,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";
import { TOUR_EARTH_PUB, TOUR_EGG_PUBS } from "../demo-tour";
import {
  type AstronautLists,
  astronautFromHash,
  astronautOf,
  COSMIC_PATH,
  crockford40,
  EGG_ROLL,
  FACE_PARTS,
  GALAXY_ROLL,
  rendezvous,
  residentPhrase,
} from "./identity";
import { NAMES } from "./names";
import {
  ARM_PLACES,
  EARTH_AREAS,
  OTHER_GALAXY_PLACES,
  type Place,
} from "./places";

/** 결정적 표본: i번째 가짜 씨앗 */
const sample = (i: number) => sha256(utf8(`astronaut-sample-${i}`));

/** 바이트 몇 개만 정해 둔 씨앗 */
function hashWith(set: Record<number, number>): Uint8Array {
  const h = new Uint8Array(32).fill(0xaa);
  for (const [i, v] of Object.entries(set)) h[Number(i)] = v;
  return h;
}

const TRAPPIST_E: Place = {
  id: "trappist-1e",
  path: ["트라피스트-1", "트라피스트-1 e"],
  ly: 41,
};
const EARTH: Place = {
  id: "earth",
  path: ["태양계", "지구"],
  areas: EARTH_AREAS,
};
const M32: Place = {
  id: "m31/m32",
  path: [
    "라니아케아 초은하단",
    "처녀자리 초은하단",
    "국부은하군",
    "안드로메다은하",
    "M32",
  ],
};
/** 항목이 하나뿐인 목록(계산이 가벼워 주사위 비율을 많은 표본으로 볼 수 있다) */
const ONE_FACE = {
  skin: [0],
  head: [0],
  eyes: [0],
  antenna: [0],
  mouth: [0],
  marks: [0],
};
const tiny = (arm: Place[]): AstronautLists => ({
  names: ["노을별"],
  arm,
  galaxies: [M32],
  face: ONE_FACE,
});

/** 시험용 목록: id "p0".."p{n-1}" */
const items = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${from + i}` }));
const pick = (seed: Uint8Array, list: readonly { id: string }[]) =>
  rendezvous(seed, "place", list, (p) => p.id).id;

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

describe("주소 모양", () => {
  it("우리 우주부터의 전체 경로, 카드는 우리 은하부터, 인사는 끝 천체 하나", () => {
    const a = astronautFromHash(hashWith({ 5: 0xff }), tiny([TRAPPIST_E]));
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
    expect(a.placeId).toBe("trappist-1e");
    expect(a.ly).toBe(41);
    expect(residentPhrase(a)).toBe("트라피스트-1 e에 거주하는 노을별");
  });

  it("지구는 대륙까지 가고, 인사는 '지구 남극'처럼 천체 이름을 앞에 붙인다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const a = astronautFromHash(sample(i), tiny([EARTH]));
      if (a.otherGalaxy) continue;
      const area = EARTH_AREAS.find((x) => x.id === a.placeId);
      expect(area).toBeDefined();
      seen.add(a.placeId);
      expect(a.address.slice(-3)).toEqual(["태양계", "지구", area?.name]);
      expect(a.home).toBe(`지구 ${area?.name}`);
      expect(residentPhrase(a)).toBe(`지구 ${area?.name}에 거주하는 노을별`);
    }
    expect(seen.size).toBe(EARTH_AREAS.length);
  });

  it("다른 은하는 65536분의 128(1/512): 경계값 그대로", () => {
    const at = (roll: number) =>
      astronautFromHash(
        hashWith({ 5: roll >> 8, 6: roll & 255 }),
        tiny([TRAPPIST_E]),
      );
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
    expect(far.home).toBe("M32");
    expect(far.ly).toBeUndefined();
  });

  it("드문 사진은 65536분의 32(1/2048): 경계값 그대로", () => {
    const at = (roll: number) =>
      astronautFromHash(
        hashWith({ 7: roll >> 8, 8: roll & 255 }),
        tiny([EARTH]),
      ).egg;
    expect(at(EGG_ROLL - 1)).not.toBeNull();
    expect(at(EGG_ROLL)).toBeNull();
  });
});

describe("랑데부 해싱: 목록을 바꿔도 기존 우주인은 그대로", () => {
  const N = 2000;
  const seeds = Array.from({ length: N }, (_, i) => sample(i));
  const n = 40;
  const base = items(n);
  const before = seeds.map((s) => pick(s, base));

  it("같은 씨앗이면 같은 결과, 목록 차례를 바꿔도 같은 결과", () => {
    const reversed = [...base].reverse();
    seeds.forEach((s, i) => {
      expect(pick(s, base)).toBe(before[i]);
      expect(pick(s, reversed)).toBe(before[i]);
    });
  });

  it("끝에 하나 더하면 약 1/(n+1)만 새 항목으로 옮기고 나머지는 그대로", () => {
    const after = seeds.map((s) => pick(s, [...base, { id: "new" }]));
    let moved = 0;
    after.forEach((id, i) => {
      if (id === before[i]) return;
      expect(id).toBe("new");
      moved++;
    });
    // 기댓값 2000/41 ≈ 49
    expect(moved).toBeGreaterThan(N / (n + 1) / 2);
    expect(moved).toBeLessThan((N / (n + 1)) * 2);
  });

  it("가운데에 하나 끼워 넣어도 같다(차례와 상관없다)", () => {
    const mid = [...base.slice(0, 20), { id: "new" }, ...base.slice(20)];
    const end = seeds.map((s) => pick(s, [...base, { id: "new" }]));
    seeds.forEach((s, i) => {
      expect(pick(s, mid)).toBe(end[i]);
    });
  });

  it("하나 빼면 그 항목 주민만 옮기고 나머지는 그대로", () => {
    const gone = "p7";
    const after = seeds.map((s) =>
      pick(
        s,
        base.filter((p) => p.id !== gone),
      ),
    );
    let movers = 0;
    after.forEach((id, i) => {
      if (before[i] === gone) {
        movers++;
        expect(id).not.toBe(gone);
      } else expect(id).toBe(before[i]);
    });
    expect(movers).toBeGreaterThan(0);
  });

  it("고르게 나온다: 항목마다 평균의 절반~두 배", () => {
    const counts = new Map<string, number>();
    for (const id of before) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.size).toBe(n);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(N / n / 2);
      expect(c).toBeLessThan((N / n) * 2);
    }
  });

  it("가중치: 무게 3인 항목은 무게 1인 항목보다 약 세 배 자주 뽑힌다", () => {
    const list = [
      { id: "heavy", w: 3 },
      ...items(9).map((p) => ({ ...p, w: 1 })),
    ];
    let heavy = 0;
    for (const s of seeds)
      if (
        rendezvous(
          s,
          "w",
          list,
          (p) => p.id,
          (p) => p.w,
        ).id === "heavy"
      )
        heavy++;
    // 기댓값 2000 × 3/12 = 500
    expect(heavy).toBeGreaterThan(420);
    expect(heavy).toBeLessThan(580);
  });

  it("실제 등록증: 화면 이름을 모두 고쳐도(id 그대로) 아무도 옮기지 않는다", () => {
    const rename = (p: Place): Place => ({
      ...p,
      path: p.path.map((x) => `${x}!`),
      ...(p.areas
        ? { areas: p.areas.map((a) => ({ ...a, name: `${a.name}!` })) }
        : {}),
    });
    const real: AstronautLists = {
      names: NAMES,
      arm: ARM_PLACES,
      galaxies: OTHER_GALAXY_PLACES,
      face: FACE_PARTS,
    };
    const renamed: AstronautLists = {
      ...real,
      arm: ARM_PLACES.map(rename),
      galaxies: OTHER_GALAXY_PLACES.map(rename),
    };
    for (let i = 0; i < 100; i++) {
      const a = astronautFromHash(sample(i), real);
      const b = astronautFromHash(sample(i), renamed);
      expect(b.placeId).toBe(a.placeId);
      expect(b.home.endsWith("!")).toBe(true);
      expect(b.name).toBe(a.name);
      expect(b.face).toEqual(a.face);
    }
  });

  it("이름·얼굴 부위도 더해도 기존 우주인은 그대로", () => {
    const lists = (names: string[], skin: number[]): AstronautLists => ({
      ...tiny([EARTH]),
      names,
      face: { ...ONE_FACE, skin },
    });
    const a = lists(["별하솔", "은하린", "미르온"], [0, 1, 2, 3]);
    const b = lists(["별하솔", "은하린", "미르온", "새이름"], [0, 1, 2, 3, 4]);
    let nameMoved = 0;
    let skinMoved = 0;
    for (let i = 0; i < 400; i++) {
      const x = astronautFromHash(sample(i), a);
      const y = astronautFromHash(sample(i), b);
      if (y.name !== x.name) {
        expect(y.name).toBe("새이름");
        nameMoved++;
      }
      if (y.face.skin !== x.face.skin) {
        expect(y.face.skin).toBe(4);
        skinMoved++;
      }
    }
    // 기댓값 각각 400/4 = 100, 400/5 = 80
    expect(nameMoved).toBeGreaterThan(50);
    expect(nameMoved).toBeLessThan(150);
    expect(skinMoved).toBeGreaterThan(40);
    expect(skinMoved).toBeLessThan(120);
  });
});

describe("주사위 비율", () => {
  it("표본 2만 명: 다른 은하·드문 사진 비율이 정한 값 근처, 사진 셋이 모두 나온다", () => {
    const N = 20_000;
    let galaxy = 0;
    const eggs = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const a = astronautFromHash(sample(i), tiny([EARTH]));
      if (a.otherGalaxy) galaxy++;
      if (a.egg) eggs.set(a.egg, (eggs.get(a.egg) ?? 0) + 1);
    }
    // 기댓값: 다른 은하 약 39명, 드문 사진 약 10명(표본이 고정이라 결과도 고정)
    expect(galaxy).toBeGreaterThan(15);
    expect(galaxy).toBeLessThan(80);
    const egg = [...eggs.values()].reduce((x, y) => x + y, 0);
    expect(egg).toBeGreaterThan(2);
    expect(egg).toBeLessThan(30);
  });

  it("드문 사진 종류는 셋이 고루 나온다", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 900; i++) {
      const e = astronautFromHash(
        hashWith({ 0: i >> 8, 1: i & 255, 7: 0, 8: 0 }),
        tiny([EARTH]),
      ).egg;
      counts.set(String(e), (counts.get(String(e)) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["laika", "prince", "rabbit"]);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(200);
      expect(c).toBeLessThan(400);
    }
  });

  it("화면 둘러보기에 둔 공개 열쇠 셋은 각각 그 사진이 나온다", () => {
    for (const [egg, pub] of Object.entries(TOUR_EGG_PUBS))
      expect(astronautOf(fromBase64Url(pub)).egg).toBe(egg);
  });

  it("화면 둘러보기의 지구 대륙 견본은 지구 남극에 산다", () => {
    const a = astronautOf(fromBase64Url(TOUR_EARTH_PUB));
    expect(a.placeId).toBe("earth/antarctica");
    expect(a.short).toEqual([
      "우리 은하",
      "오리온 팔",
      "태양계",
      "지구",
      "남극",
    ]);
    expect(residentPhrase(a)).toBe(`지구 남극에 거주하는 ${a.name}`);
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

  it("id는 모두 다르고 소문자 영어·숫자·-·/로만 쓴다", () => {
    const ids = [
      ...ARM_PLACES.map((p) => p.id),
      ...OTHER_GALAXY_PLACES.map((p) => p.id),
      ...EARTH_AREAS.map((a) => a.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9/-]*$/);
  });

  it("주소 끝은 천체다: 지명(충돌구·바다·분지 등)이 없고, 대륙은 지구에만 있다", () => {
    const keys = [...ARM_PLACES, ...OTHER_GALAXY_PLACES].map((p) =>
      p.path.join(" › "),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys)
      expect(k).not.toMatch(
        /충돌구|바다|대양|분지|평원|협곡|고원|화산|절벽|지형|영역|대적점|육각형|줄무늬| 산$/,
      );
    const withAreas = ARM_PLACES.filter((p) => p.areas);
    expect(withAreas.map((p) => p.id)).toEqual(["earth"]);
    expect(EARTH_AREAS.map((a) => a.name)).toEqual([
      "아시아",
      "유럽",
      "아프리카",
      "북아메리카",
      "남아메리카",
      "오세아니아",
      "남극",
    ]);
    expect(ARM_PLACES.length).toBeGreaterThanOrEqual(250);
    expect(OTHER_GALAXY_PLACES.length).toBeGreaterThan(0);
    for (const p of OTHER_GALAXY_PLACES)
      expect(
        p.path.includes("국부은하군") && p.path.includes("처녀자리 은하단"),
      ).toBe(false);
  });

  it("실제 목록 고정 표본: 이름이 모두 나오고 주소가 넓게 퍼진다", () => {
    const names = new Set<string>();
    for (let i = 0; i < 1500; i++)
      names.add(rendezvous(sample(i), "name", NAMES, (n) => n));
    // 이름 약 120개에서 1,500번 고르면 모두 나온다(하나가 빠질 확률이 약 0.0005%)
    expect(names.size).toBe(NAMES.length);
    const homes = new Set<string>();
    for (let i = 0; i < 1000; i++) homes.add(pick(sample(i), ARM_PLACES));
    // 290곳에서 1,000번 고르면 평균 약 281곳이 나온다
    expect(homes.size).toBeGreaterThan(ARM_PLACES.length * 0.9);
  });
});
