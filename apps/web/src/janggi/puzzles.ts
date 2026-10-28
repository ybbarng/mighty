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
 * - trade: 잡을 수 있는 기물이 여럿인데 이득인 잡기는 하나뿐. `trap`은 잡으면 손해인 잡기
 */
export type JanggiPuzzle = {
  id: string;
  /** 놓인 기물. 자리는 "95"처럼 쓴다 */
  pieces: Readonly<Record<string, Piece>>;
  /** 첫 정답 수 "출발-도착" */
  solution: string;
} & (
  | { kind: "mate"; mateIn: 1 | 2 }
  | { kind: "fork" }
  | { kind: "trade"; trap: string }
);

export interface JanggiPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly JanggiPuzzle[];
}

type Raw = { pieces: Record<string, Piece>; solution: string };
type RawTrade = Raw & { trap: string };

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

/** 잡을까 말까: 이득인 잡기 하나와, 지켜져서 손해인 잡기(함정) */
const TRADES: readonly RawTrade[] = [
  {
    pieces: {
      "18": "hR",
      "36": "hK",
      "37": "cN",
      "41": "cN",
      "51": "hE",
      "58": "hE",
      "84": "cK",
      "05": "cE",
    },
    solution: "37-18",
    trap: "37-58",
  },
  {
    pieces: {
      "16": "hK",
      "18": "hP",
      "39": "cN",
      "46": "cN",
      "64": "hP",
      "67": "hR",
      "75": "cE",
      "04": "cK",
    },
    solution: "46-67",
    trap: "39-18",
  },
  {
    pieces: {
      "24": "hA",
      "35": "hP",
      "36": "hK",
      "43": "hP",
      "47": "hP",
      "55": "cR",
      "65": "hN",
      "94": "cK",
    },
    solution: "55-65",
    trap: "55-35",
  },
  {
    pieces: {
      "17": "hP",
      "21": "hE",
      "25": "hK",
      "35": "hA",
      "39": "cR",
      "62": "hC",
      "94": "cE",
      "06": "cK",
    },
    solution: "94-62",
    trap: "39-35",
  },
  {
    pieces: {
      "25": "hA",
      "26": "hK",
      "29": "hP",
      "36": "hP",
      "66": "cR",
      "67": "hN",
      "87": "cN",
      "05": "cK",
    },
    solution: "66-67",
    trap: "66-36",
  },
  {
    pieces: {
      "26": "hK",
      "28": "hN",
      "36": "hA",
      "38": "cR",
      "43": "cP",
      "48": "hP",
      "56": "hP",
      "86": "cK",
    },
    solution: "38-28",
    trap: "38-36",
  },
  {
    pieces: {
      "14": "hA",
      "16": "hK",
      "21": "hP",
      "25": "hN",
      "32": "hE",
      "45": "cR",
      "49": "hC",
      "94": "cK",
      "97": "cN",
    },
    solution: "45-49",
    trap: "45-25",
  },
  {
    pieces: {
      "12": "hP",
      "25": "hA",
      "33": "hR",
      "35": "hK",
      "45": "cN",
      "46": "cN",
      "68": "hP",
      "74": "cP",
      "94": "cK",
    },
    solution: "45-33",
    trap: "46-25",
  },
  {
    pieces: {
      "15": "hK",
      "21": "hP",
      "24": "hA",
      "26": "hP",
      "36": "hC",
      "44": "cR",
      "53": "cE",
      "71": "hN",
      "96": "cK",
    },
    solution: "53-36",
    trap: "44-24",
  },
  {
    pieces: {
      "11": "hP",
      "26": "hK",
      "35": "hA",
      "52": "hR",
      "61": "cP",
      "62": "hE",
      "72": "cC",
      "93": "cP",
      "05": "cK",
    },
    solution: "72-52",
    trap: "61-62",
  },
  {
    pieces: {
      "24": "hK",
      "33": "hP",
      "36": "hA",
      "54": "cP",
      "62": "hP",
      "67": "hR",
      "82": "cR",
      "86": "cK",
      "99": "cE",
    },
    solution: "99-67",
    trap: "82-62",
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
    id: "trade",
    title: "잡을까 말까",
    summary:
      "잡을 수 있다고 다 잡지 않는다. 다시 잡히지 않는 이득인 잡기를 고른다",
    puzzles: TRADES.map((p, i) => ({
      id: `trade-${i + 1}`,
      kind: "trade",
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
