// @vitest-environment node
import { generateSigner } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { astronautFromHash, astronautOf } from "../astronaut/identity";
import {
  ADDRESS_POOL,
  type Addr,
  assign,
  expectedMoveShare,
  movedIndices,
  pickHrw,
  residents,
  START_COUNT,
  sampleSeeds,
  scoreTable,
  seedOfKey,
} from "./rendezvous";

// 화면과 같은 견본 48명(고정이라 결과도 고정)
const SEEDS = sampleSeeds(48);
const START = ADDRESS_POOL.slice(0, START_COUNT);
const NEXT = ADDRESS_POOL[START_COUNT] as Addr;

describe("나머지 방식과 랑데부 해싱", () => {
  it("주소를 하나 더하면 나머지 방식은 대부분 이사하고, 랑데부 해싱은 새 주소로 가는 몇 명만 이사한다", () => {
    const grown = [...START, NEXT];
    const modMoved = movedIndices(
      assign(SEEDS, START, "mod"),
      assign(SEEDS, grown, "mod"),
    );
    const before = assign(SEEDS, START, "hrw");
    const after = assign(SEEDS, grown, "hrw");
    const hrwMoved = movedIndices(before, after);
    expect(modMoved.length).toBeGreaterThan(SEEDS.length * 0.6);
    expect(hrwMoved.length).toBeGreaterThan(0);
    expect(hrwMoved.length).toBeLessThan(SEEDS.length * 0.35);
    // 이사한 사람은 모두 새 주소로 갔다
    for (const i of hrwMoved) expect(after[i]).toBe(NEXT.id);
    expect(expectedMoveShare(START.length, grown.length)).toBeCloseTo(1 / 6);
  });

  it("주소를 빼면 그 주소 주민만 이사한다", () => {
    const gone = START[1] as Addr;
    const before = assign(SEEDS, START, "hrw");
    const after = assign(
      SEEDS,
      START.filter((a) => a !== gone),
      "hrw",
    );
    const moved = movedIndices(before, after);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved).toEqual(before.flatMap((h, i) => (h === gone.id ? [i] : [])));
  });

  it("화면 이름을 고쳐도 아무도 이사하지 않고, id를 바꾸면 그 주소 주민이 흩어진다", () => {
    const before = assign(SEEDS, START, "hrw");
    const renamed = START.map((a, i) =>
      i === 0 ? { ...a, name: "붉은 행성" } : a,
    );
    expect(movedIndices(before, assign(SEEDS, renamed, "hrw"))).toEqual([]);

    const reId = START.map((a, i) => (i === 0 ? { ...a, id: "mars-2" } : a));
    const after = assign(SEEDS, reId, "hrw");
    const oldResidents = before.flatMap((h, i) => (h === "mars" ? [i] : []));
    expect(oldResidents.length).toBeGreaterThan(0);
    // 옛 화성 주민은 모두 이사했다(새 id로 다시 간 사람은 다른 사람처럼 새로 뽑힌 것)
    for (const i of oldResidents) expect(after[i]).not.toBe("mars");
    const scattered = new Set(
      oldResidents.map((i) => after[i]).filter((h) => h !== "mars-2"),
    );
    expect(scattered.size).toBeGreaterThan(1);
  });

  it("가중치를 2배로 하면 그 주소 주민이 약 2배가 된다", () => {
    const many = sampleSeeds(600);
    const base = residents(assign(many, START, "hrw"), START).get("mars") ?? 0;
    const heavy = START.map((a) => (a.id === "mars" ? { ...a, weight: 2 } : a));
    const doubled =
      residents(assign(many, heavy, "hrw"), heavy).get("mars") ?? 0;
    // 기댓값: 1/5 → 2/6. 600명이면 120명 → 200명
    expect(base).toBeGreaterThan(90);
    expect(base).toBeLessThan(150);
    expect(doubled).toBeGreaterThan(165);
    expect(doubled).toBeLessThan(235);
  });
});

describe("점수표", () => {
  it("점수 1등이 고른 주소이고, 주소를 더해도 기존 주소의 점수는 그대로다", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const rows = scoreTable(seed, START);
      const top = rows.reduce((a, b) => (b.score > a.score ? b : a));
      expect(top.id).toBe(pickHrw(seed, START));
      const grown = scoreTable(seed, [...START, NEXT]);
      expect(grown.slice(0, START.length)).toEqual(rows);
      // 새 주소가 1등보다 높을 때만 이사한다
      const newScore = (grown[START.length] as { score: number }).score;
      expect(pickHrw(seed, [...START, NEXT]) === NEXT.id).toBe(
        newScore > top.score,
      );
    }
  });

  it("공개 열쇠의 씨앗은 실제 등록증과 같은 씨앗이다", async () => {
    const { publicKey } = await generateSigner();
    expect(astronautFromHash(seedOfKey(publicKey))).toEqual(
      astronautOf(publicKey),
    );
  });
});
