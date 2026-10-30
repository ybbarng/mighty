import { sha256, taggedHash, utf8 } from "@mighty/stardraw-core";

import {
  ASTRONAUT_TAG,
  rendezvous,
  rendezvousScore,
} from "../astronaut/identity";

/**
 * 보안 배우기 "등록증은 어떻게 정해지나"(랑데부 해싱)의 계산.
 * 고르기는 실제 등록증과 같은 `rendezvous`·`rendezvousScore`(종류 "place")를 쓰고,
 * 여기는 견본 우주인·짧은 주소 목록·이사 세기와 비교용 "해시 % 목록 길이"만 둔다.
 */

export interface Addr {
  /** 바뀌지 않는 고유 값(고르기용) */
  id: string;
  /** 화면 이름(고쳐도 아무도 옮기지 않는다) */
  name: string;
  weight: number;
}

/** 실제 주소 목록(places.ts)에 있는 id와 이름 일부. 앞 다섯 곳으로 시작하고 더하기는 차례로 꺼낸다 */
export const ADDRESS_POOL: readonly Addr[] = [
  { id: "mars", name: "화성", weight: 1 },
  { id: "jupiter/europa", name: "유로파", weight: 1 },
  { id: "earth/moon", name: "달", weight: 1 },
  { id: "saturn/titan", name: "타이탄", weight: 1 },
  { id: "trappist-1e", name: "트라피스트-1 e", weight: 1 },
  { id: "venus", name: "금성", weight: 1 },
  { id: "ceres", name: "세레스", weight: 1 },
  { id: "pluto", name: "명왕성", weight: 1 },
  { id: "jupiter/io", name: "이오", weight: 1 },
  { id: "proxima-cen-b", name: "프록시마 b", weight: 1 },
];

export const START_COUNT = 5;

/** 주소 id → 색(id에 묶여 있어 목록이 바뀌어도 같은 주소는 같은 색) */
const COLORS = [
  "#f87171",
  "#60a5fa",
  "#e5e7eb",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#22d3ee",
];
export function colorOf(id: string): string {
  const i = ADDRESS_POOL.findIndex((a) => a.id === id);
  return COLORS[i >= 0 ? i % COLORS.length : hashIndex(id)] as string;
}
function hashIndex(id: string): number {
  return (sha256(utf8(id))[0] ?? 0) % COLORS.length;
}

/**
 * 견본 우주인의 씨앗. 실제 등록증처럼 taggedHash(ASTRONAUT_TAG, ·)이지만 공개 열쇠 대신 가짜 바이트를 넣는다.
 * 이름·사진은 그리지 않고 번호로만 보인다(남의 등록증은 그리지 않는다)
 */
export function sampleSeeds(n: number): Uint8Array[] {
  return Array.from({ length: n }, (_, i) =>
    taggedHash(ASTRONAUT_TAG, utf8(`stardraw/learn/sample/${i}`)),
  );
}

/** 공개 열쇠(65바이트) → 등록증 씨앗(identity.ts `astronautOf`와 같은 식) */
export function seedOfKey(pub: Uint8Array): Uint8Array {
  return taggedHash(ASTRONAUT_TAG, pub);
}

export const KIND = "place";

/** 랑데부 해싱(실제 등록증과 같은 함수) */
export function pickHrw(seed: Uint8Array, list: readonly Addr[]): string {
  return rendezvous(
    seed,
    KIND,
    list,
    (a) => a.id,
    (a) => a.weight,
  ).id;
}

/** 비교용: 씨앗 해시 앞 4바이트 % 목록 길이. 목록 길이가 바뀌면 거의 모두 다른 칸으로 간다 */
export function pickMod(seed: Uint8Array, list: readonly Addr[]): string {
  const h = sha256(seed, utf8("mod"));
  const v =
    (((h[0] ?? 0) << 24) >>> 0) +
    ((h[1] ?? 0) << 16) +
    ((h[2] ?? 0) << 8) +
    (h[3] ?? 0);
  return (list[v % list.length] as Addr).id;
}

export type Method = "mod" | "hrw";

export function assign(
  seeds: readonly Uint8Array[],
  list: readonly Addr[],
  method: Method,
): string[] {
  const pick = method === "mod" ? pickMod : pickHrw;
  return seeds.map((s) => pick(s, list));
}

/** 앞뒤 배정에서 주소가 바뀐 사람의 차례 */
export function movedIndices(
  before: readonly string[],
  after: readonly string[],
): number[] {
  const out: number[] = [];
  for (let i = 0; i < after.length; i++)
    if (before[i] !== after[i]) out.push(i);
  return out;
}

/**
 * 랑데부 해싱에서 이사 비율의 기댓값(가중치가 모두 같을 때). 더하면 새 주소가 이길 1/(새 길이),
 * 빼면 뺀 주소 주민 1/(옛 길이). 둘 다 1/(더 긴 쪽 길이)다
 */
export function expectedMoveShare(beforeLen: number, afterLen: number): number {
  return 1 / Math.max(beforeLen, afterLen);
}

export interface ScoreRow {
  id: string;
  name: string;
  score: number;
}

/** 주소마다 점수(목록 차례 그대로). 1등이 내 주소다 */
export function scoreTable(
  seed: Uint8Array,
  list: readonly Addr[],
): ScoreRow[] {
  return list.map((a) => ({
    id: a.id,
    name: a.name,
    score: rendezvousScore(seed, KIND, a.id, a.weight),
  }));
}

/** 주소마다 주민 수 */
export function residents(
  homes: readonly string[],
  list: readonly Addr[],
): Map<string, number> {
  const m = new Map(list.map((a) => [a.id, 0]));
  for (const h of homes) m.set(h, (m.get(h) ?? 0) + 1);
  return m;
}
