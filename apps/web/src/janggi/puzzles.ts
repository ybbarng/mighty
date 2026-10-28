import type { Piece } from "@mighty/janggi-engine";

/*
 * 장기 외통 문제(docs/23). 늘 초가 둘 차례다. 장면은 엔진으로 "외통 수가 하나뿐인 장면"을 찾아 골랐고,
 * study.test.ts가 모든 문제를 다시 확인한다(정답 뒤 외통인지, 정답 말고 같은 수 안의 외통이 없는지).
 * 해설은 엔진이 장면에서 만든다(어느 기물이 장군을 부르고 궁이 갈 곳을 누가 지키나).
 */

/**
 * 문제 하나. 늘 초가 둘 차례다.
 * - mate: `mateIn`수 만에 외통(마지막 수는 외통이면 어느 수든 정답)
 * - fork: 한 수로 두 곳을 함께 노려(양수겸장) 기물을 얻는다. 정답 수 하나뿐
 */
export type JanggiPuzzle = {
  id: string;
  /** 놓인 기물. 자리는 "95"처럼 쓴다 */
  pieces: Readonly<Record<string, Piece>>;
  /** 첫 정답 수 "출발-도착" */
  solution: string;
} & ({ kind: "mate"; mateIn: 1 | 2 } | { kind: "fork" });

export interface JanggiPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly JanggiPuzzle[];
}

type Raw = { pieces: Record<string, Piece>; solution: string };

const MATE_IN_ONE: readonly Raw[] = [
  {
    pieces: { "15": "cR", "24": "hK", "48": "cR", "96": "cK" },
    solution: "48-44",
  },
  {
    pieces: { "14": "hK", "32": "cR", "34": "cP", "95": "cK" },
    solution: "32-12",
  },
  {
    pieces: { "19": "cR", "35": "hK", "44": "cN", "96": "cK" },
    solution: "19-39",
  },
  {
    pieces: { "15": "hK", "24": "cP", "37": "cN", "94": "cK" },
    solution: "24-25",
  },
  {
    pieces: { "16": "cN", "34": "hK", "45": "cP", "96": "cK" },
    solution: "45-35",
  },
  {
    pieces: { "24": "hK", "26": "cP", "33": "cN", "35": "cP", "95": "cK" },
    solution: "26-25",
  },
  {
    pieces: { "15": "hK", "47": "cN", "65": "cC", "96": "cK" },
    solution: "47-35",
  },
  {
    pieces: { "16": "cN", "34": "hK", "54": "cN", "95": "cK" },
    solution: "54-46",
  },
  {
    pieces: { "14": "cN", "15": "hK", "75": "cC", "05": "cK" },
    solution: "14-35",
  },
  {
    pieces: {
      "24": "hA",
      "26": "hK",
      "27": "cC",
      "28": "cN",
      "36": "hC",
      "04": "cK",
    },
    solution: "27-29",
  },
  {
    pieces: {
      "16": "hA",
      "25": "cP",
      "34": "hK",
      "45": "cC",
      "46": "cN",
      "06": "cK",
    },
    solution: "45-15",
  },
  {
    pieces: {
      "13": "hC",
      "15": "cR",
      "26": "hK",
      "46": "cC",
      "48": "cP",
      "96": "cK",
    },
    solution: "46-06",
  },
  {
    pieces: {
      "11": "hN",
      "16": "hA",
      "26": "hK",
      "44": "cN",
      "55": "hP",
      "66": "cE",
      "06": "cK",
    },
    solution: "66-49",
  },
];

/** 양수겸장: 마·차·상·졸 하나가 큰 기물 둘(또는 궁과 큰 기물)을 함께 노린다 */
const FORKS: readonly Raw[] = [
  {
    pieces: {
      "22": "hE",
      "35": "hK",
      "48": "hR",
      "77": "cN",
      "94": "cK",
      "96": "cR",
    },
    solution: "77-56",
  },
  {
    pieces: {
      "12": "hR",
      "25": "hK",
      "36": "hA",
      "45": "cN",
      "96": "cK",
      "09": "cC",
    },
    solution: "45-33",
  },
  {
    pieces: {
      "14": "hK",
      "38": "cN",
      "47": "hC",
      "58": "hC",
      "86": "cK",
      "05": "cP",
    },
    solution: "38-26",
  },
  {
    pieces: {
      "13": "hC",
      "14": "hA",
      "15": "hK",
      "55": "cN",
      "77": "cE",
      "94": "cK",
      "97": "cR",
    },
    solution: "55-34",
  },
  {
    pieces: {
      "11": "hC",
      "24": "hC",
      "36": "hK",
      "42": "hP",
      "49": "hN",
      "53": "cN",
      "04": "cK",
    },
    solution: "53-32",
  },
  {
    pieces: {
      "24": "hA",
      "26": "hK",
      "35": "hP",
      "58": "cN",
      "66": "cN",
      "68": "hN",
      "85": "cK",
      "02": "cN",
    },
    solution: "66-47",
  },
  {
    pieces: {
      "12": "hC",
      "16": "hK",
      "21": "hC",
      "24": "hA",
      "45": "cR",
      "59": "cR",
      "86": "cC",
      "05": "cK",
    },
    solution: "45-15",
  },
  {
    pieces: {
      "13": "hR",
      "25": "hA",
      "34": "hK",
      "51": "cR",
      "64": "hN",
      "95": "cN",
      "96": "cK",
    },
    solution: "51-54",
  },
  {
    pieces: {
      "35": "hK",
      "36": "hA",
      "48": "cR",
      "51": "hC",
      "59": "hN",
      "86": "cK",
      "97": "cE",
    },
    solution: "48-58",
  },
  {
    pieces: {
      "15": "hK",
      "19": "hC",
      "24": "hA",
      "57": "hN",
      "61": "hR",
      "75": "cN",
      "79": "cE",
      "95": "cK",
    },
    solution: "79-47",
  },
  {
    pieces: {
      "24": "hK",
      "26": "hA",
      "33": "cE",
      "37": "hC",
      "42": "hN",
      "51": "hC",
      "86": "cK",
      "89": "cP",
    },
    solution: "33-65",
  },
  {
    pieces: {
      "14": "hA",
      "29": "hR",
      "32": "cN",
      "34": "hK",
      "43": "hC",
      "45": "cP",
      "06": "cK",
    },
    solution: "45-44",
  },
];

const MATE_IN_TWO: readonly Raw[] = [
  {
    pieces: { "16": "hK", "62": "cR", "68": "cR", "05": "cK" },
    solution: "62-65",
  },
  {
    pieces: { "26": "cP", "36": "hK", "51": "cR", "94": "cK" },
    solution: "51-21",
  },
  {
    pieces: { "19": "cR", "36": "hK", "55": "cC", "85": "cK" },
    solution: "19-16",
  },
  {
    pieces: { "16": "hK", "23": "cN", "35": "cP", "95": "cK" },
    solution: "23-44",
  },
  {
    pieces: { "15": "hK", "28": "cR", "45": "cN", "04": "cK" },
    solution: "45-33",
  },
  {
    pieces: { "15": "hK", "17": "cN", "31": "cP", "44": "cP", "94": "cK" },
    solution: "44-34",
  },
  {
    pieces: { "16": "hK", "37": "cR", "46": "cP", "51": "hC", "06": "cK" },
    solution: "46-36",
  },
  {
    pieces: { "11": "cR", "17": "cC", "34": "hK", "72": "cR", "85": "cK" },
    solution: "11-15",
  },
];

export const JANGGI_PUZZLE_SETS: readonly JanggiPuzzleSet[] = [
  {
    id: "mate1",
    title: "한 수 외통",
    summary: "한 수로 장군을 불러 궁이 피할 곳을 없앤다",
    puzzles: MATE_IN_ONE.map((p, i) => ({
      id: `mate1-${i + 1}`,
      kind: "mate",
      mateIn: 1,
      ...p,
    })),
  },
  {
    id: "fork",
    title: "양수겸장",
    summary: "한 수로 두 곳을 함께 노린다. 하나를 지키면 다른 하나를 잡는다",
    puzzles: FORKS.map((p, i) => ({
      id: `fork-${i + 1}`,
      kind: "fork",
      ...p,
    })),
  },
  {
    id: "mate2",
    title: "두 수 외통",
    summary: "상대가 어떻게 받아도 다음 수에 외통이 되는 첫 수를 찾는다",
    puzzles: MATE_IN_TWO.map((p, i) => ({
      id: `mate2-${i + 1}`,
      kind: "mate",
      mateIn: 2,
      ...p,
    })),
  },
];
