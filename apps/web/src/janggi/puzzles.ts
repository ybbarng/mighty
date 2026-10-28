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
 * - cannon: 다리를 놓아 포 길을 연다. 정답 수 하나뿐
 * - block: 상대 마·상의 멱을 막아 내 기물을 지킨다. 정답 수 하나뿐
 */
export type JanggiPuzzle = {
  id: string;
  /** 놓인 기물. 자리는 "95"처럼 쓴다 */
  pieces: Readonly<Record<string, Piece>>;
  /** 첫 정답 수 "출발-도착" */
  solution: string;
} & (
  | { kind: "mate"; mateIn: 1 | 2 | 3 }
  | { kind: "fork" }
  | { kind: "trade"; trap: string }
  | { kind: "cannon" }
  | { kind: "block" }
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

/*
 * 포 길 열기: 내 기물 하나를 옮겨 포가 넘을 다리를 놓거나, 비켜서 다리를 하나만 남겨 포가 상대 큰 기물을 노리게 한다.
 * 시험이 두 수 앞을 읽어 정답이 다른 수보다 졸 하나 반 이상 낫고, 정말 포 길이 열리는지 본다.
 */
const CANNONS: readonly Raw[] = [
  {
    pieces: {
      "19": "cP",
      "25": "hK",
      "43": "hR",
      "52": "hP",
      "68": "cE",
      "72": "cP",
      "76": "cC",
      "93": "cC",
      "96": "cK",
      "04": "cA",
      "09": "hP",
    },
    solution: "72-73",
  },
  {
    pieces: {
      "26": "hK",
      "44": "cN",
      "45": "cC",
      "49": "hR",
      "53": "hP",
      "55": "cE",
      "61": "cR",
      "76": "cC",
      "88": "hR",
      "94": "cK",
      "95": "cA",
    },
    solution: "61-66",
  },
  {
    pieces: {
      "36": "hK",
      "39": "cE",
      "49": "hN",
      "56": "cC",
      "63": "hR",
      "69": "cE",
      "79": "cP",
      "86": "cK",
      "92": "hP",
      "96": "cA",
      "04": "cA",
    },
    solution: "69-46",
  },
  {
    pieces: {
      "23": "cC",
      "32": "cP",
      "34": "hK",
      "46": "cC",
      "58": "hP",
      "59": "hN",
      "85": "cA",
      "91": "hE",
      "93": "hN",
      "96": "cK",
    },
    solution: "32-33",
  },
  {
    pieces: {
      "25": "hK",
      "33": "cP",
      "35": "hA",
      "42": "cR",
      "73": "hP",
      "76": "hC",
      "81": "hN",
      "88": "cC",
      "96": "cK",
      "04": "hP",
    },
    solution: "42-82",
  },
  {
    pieces: {
      "25": "hA",
      "36": "hK",
      "58": "hP",
      "66": "cC",
      "79": "hR",
      "84": "cE",
      "89": "hN",
      "95": "cA",
      "96": "cA",
      "05": "cK",
      "06": "cC",
    },
    solution: "84-56",
  },
  {
    pieces: {
      "22": "hN",
      "24": "cE",
      "25": "hK",
      "45": "cP",
      "56": "hN",
      "59": "cP",
      "62": "cC",
      "77": "cP",
      "85": "cK",
      "86": "cA",
    },
    solution: "24-52",
  },
  {
    pieces: {
      "24": "hA",
      "26": "hK",
      "35": "hA",
      "36": "cE",
      "39": "cP",
      "43": "hE",
      "66": "hP",
      "75": "cC",
      "89": "hP",
      "95": "cK",
      "96": "cC",
    },
    solution: "36-64",
  },
  {
    pieces: {
      "25": "hK",
      "45": "hN",
      "49": "cC",
      "58": "cP",
      "71": "hP",
      "77": "hP",
      "84": "cK",
      "96": "cA",
      "08": "cC",
    },
    solution: "58-48",
  },
  {
    pieces: {
      "21": "cP",
      "26": "hA",
      "36": "hK",
      "43": "cC",
      "54": "cN",
      "64": "cP",
      "78": "hE",
      "81": "cC",
      "85": "cK",
      "93": "hR",
      "06": "cA",
    },
    solution: "64-63",
  },
];

/*
 * 멱 막기: 상대 마·상이 내 큰 기물을 노릴 때 그 길목(멱)에 기물을 놓아 막는다. 비키는 것보다 막는 것이 나은 판이다.
 * 시험이 두 수 앞을 읽어 정답이 다른 수보다 졸 하나 반 이상 낫고, 정말 멱을 막아 지키는지 본다.
 */
const BLOCKS: readonly Raw[] = [
  {
    pieces: {
      "12": "cN",
      "25": "hK",
      "27": "cC",
      "44": "hE",
      "53": "hP",
      "65": "hP",
      "81": "cN",
      "84": "cK",
      "99": "hN",
      "05": "cA",
      "06": "cA",
    },
    solution: "27-23",
  },
  {
    pieces: {
      "15": "hA",
      "16": "hR",
      "36": "hK",
      "55": "cC",
      "68": "cR",
      "75": "cE",
      "76": "hN",
      "05": "hN",
      "06": "cK",
    },
    solution: "68-66",
  },
  {
    pieces: {
      "15": "hE",
      "35": "hK",
      "64": "hN",
      "71": "cC",
      "75": "cP",
      "85": "cR",
      "94": "cK",
      "03": "hP",
      "05": "cA",
      "06": "cA",
    },
    solution: "75-74",
  },
  {
    pieces: {
      "25": "hA",
      "35": "hK",
      "38": "hE",
      "43": "hN",
      "51": "cP",
      "52": "cC",
      "73": "cE",
      "75": "hN",
      "84": "cA",
      "94": "cN",
      "95": "cK",
    },
    solution: "84-85",
  },
  {
    pieces: {
      "26": "hK",
      "58": "hC",
      "63": "cP",
      "68": "hN",
      "73": "cR",
      "86": "cN",
      "94": "cK",
      "98": "cR",
      "04": "cA",
      "05": "hN",
      "07": "hP",
    },
    solution: "98-95",
  },
  {
    pieces: {
      "35": "hK",
      "36": "hA",
      "38": "hE",
      "42": "cC",
      "54": "hN",
      "57": "cC",
      "65": "hP",
      "04": "cK",
    },
    solution: "57-53",
  },
  {
    pieces: {
      "27": "cC",
      "32": "hN",
      "35": "hK",
      "44": "hE",
      "56": "cP",
      "62": "hP",
      "73": "cE",
      "86": "cK",
      "94": "cA",
      "07": "cN",
      "08": "hC",
    },
    solution: "73-45",
  },
  {
    pieces: {
      "16": "hA",
      "17": "hE",
      "21": "cC",
      "25": "hK",
      "26": "hC",
      "36": "hA",
      "44": "hE",
      "68": "cP",
      "92": "cR",
      "94": "cN",
      "04": "cK",
    },
    solution: "92-32",
  },
  {
    pieces: {
      "15": "hE",
      "34": "hK",
      "45": "hN",
      "49": "cC",
      "53": "cC",
      "94": "hP",
      "96": "cK",
    },
    solution: "49-44",
  },
  {
    pieces: {
      "24": "hA",
      "26": "hK",
      "35": "hN",
      "46": "cC",
      "53": "cP",
      "65": "hE",
      "67": "hN",
      "78": "cN",
      "95": "cA",
      "05": "cK",
    },
    solution: "78-57",
  },
];

/*
 * 세 수 외통: 한 수·두 수 외통이 없고, 세 수 외통의 첫 수가 하나뿐인 판을 엔진으로 골랐다(`mateInThreeMoves`).
 * 둘째 수부터는 남은 수 안에 외통이 되는 수면 어느 수든 정답이다.
 */
const MATE_IN_THREE: readonly Raw[] = [
  {
    pieces: { "19": "cR", "26": "hK", "56": "cP", "95": "cK" },
    solution: "19-14",
  },
  {
    pieces: { "25": "cP", "34": "hK", "73": "cR", "95": "cK" },
    solution: "73-75",
  },
  {
    pieces: { "23": "cN", "24": "hK", "42": "cR", "05": "cK" },
    solution: "42-45",
  },
  {
    pieces: { "15": "hK", "38": "cR", "78": "cN", "96": "cK" },
    solution: "38-34",
  },
  {
    pieces: { "14": "hK", "52": "cN", "58": "cN", "67": "cR", "95": "cK" },
    solution: "67-65",
  },
  {
    pieces: {
      "19": "cN",
      "34": "hK",
      "36": "hA",
      "37": "cR",
      "43": "cP",
      "05": "cK",
    },
    solution: "37-36",
  },
  {
    pieces: { "16": "hK", "24": "cC", "32": "cC", "37": "cR", "94": "cK" },
    solution: "37-36",
  },
  {
    pieces: {
      "15": "hN",
      "18": "cR",
      "25": "hK",
      "63": "cN",
      "76": "cN",
      "86": "cK",
    },
    solution: "63-44",
  },
  {
    pieces: {
      "19": "hE",
      "23": "cN",
      "36": "hK",
      "41": "cC",
      "43": "cR",
      "95": "cK",
    },
    solution: "43-45",
  },
  {
    pieces: {
      "25": "hK",
      "26": "hA",
      "27": "cR",
      "58": "cR",
      "72": "cN",
      "86": "cK",
    },
    solution: "58-56",
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
    id: "cannon",
    title: "포 길 열기",
    summary:
      "포는 하나를 넘어야 간다. 다리를 놓거나 치워 포가 큰 기물을 노리게 한다",
    puzzles: CANNONS.map((p, i) => ({
      id: `cannon-${i + 1}`,
      kind: "cannon",
      ...p,
    })),
  },
  {
    id: "block",
    title: "멱 막기",
    summary: "상대 마·상이 지나는 칸(멱)을 막아 노림을 받는 기물을 지킨다",
    puzzles: BLOCKS.map((p, i) => ({
      id: `block-${i + 1}`,
      kind: "block",
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
  {
    id: "mate3",
    title: "세 수 외통",
    summary: "상대가 어떻게 받아도 세 수째에 외통이 되는 첫 수를 찾는다",
    puzzles: MATE_IN_THREE.map((p, i) => ({
      id: `mate3-${i + 1}`,
      kind: "mate",
      mateIn: 3,
      ...p,
    })),
  },
];
