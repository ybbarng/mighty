/*
 * 바둑 첫 수 배우기 문제(docs/23, docs/25). 9줄 판의 작은 장면이고, 늘 흑(나)이 둔다. 자리는 "D4"처럼 쓴다.
 * 장면은 엔진으로 무작위 판을 만들어 "정답이 하나뿐인 판"을 찾아 골랐고, study.test.ts가 모든 문제를 다시 확인한다.
 * - 잡기(단수·축·장문): `captureMoves`로 `within`수 안에 노리는 돌을 따내는 첫 수가 정답 하나뿐이고, 더 빨리는 못 따낸다
 * - 사활(두 눈 만들기·눈 빼앗기): `lifeKeyMoves`로 정한 빈 자리 안의 첫 수 가운데 정답이 하나뿐이고,
 *   다른 수는 반대 결과(사는 문제면 잡히고, 잡는 문제면 산다)가 된다(`lifeWrongMovesFail`)
 * 해설은 장면에서 만든다(study.ts).
 */

/** 잡기 문제의 모양: 단수 방향, 축, 장문 */
export type CaptureTheme = "atari" | "ladder" | "net";

/**
 * 문제 하나. 늘 흑이 둔다.
 * - capture: 노리는 백 돌(`target`)을 `within`수 안에 따낸다. 첫 수는 정답 하나, 그다음은 남은 수 안에 따내는 수면 맞다
 * - life: 사활. `goal`이 live면 흑 무리(`target`)를 살리고, kill이면 백 무리(`target`)를 잡는다. 첫 수 하나로 푼다
 */
export type BadukPuzzle = {
  id: string;
  black: readonly string[];
  white: readonly string[];
  /** 노리는(또는 살릴) 무리의 돌 하나 */
  target: string;
  /** 첫 정답 자리 */
  solution: string;
} & (
  | { kind: "capture"; theme: CaptureTheme; within: number }
  | {
      kind: "life";
      goal: "live" | "kill";
      /** 사활을 읽는 빈 자리(둘러싸인 안쪽) */
      area: readonly string[];
    }
);

export interface BadukPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly BadukPuzzle[];
}

type RawCapture = {
  black: string[];
  white: string[];
  target: string;
  solution: string;
  within: number;
};
type RawLife = {
  black: string[];
  white: string[];
  target: string;
  area: string[];
  solution: string;
};

const ATARI: readonly RawCapture[] = [
  {
    black: ["G3", "H2", "F1", "H1"],
    white: ["G2"],
    target: "G2",
    solution: "F2",
    within: 2,
  },
  {
    black: ["E9", "G9", "G8", "F7"],
    white: ["F8"],
    target: "F8",
    solution: "E8",
    within: 2,
  },
  {
    black: ["C8", "D7", "B6", "D6"],
    white: ["C7"],
    target: "C7",
    solution: "B7",
    within: 2,
  },
  {
    black: ["B6", "A5", "A4", "C4"],
    white: ["B5"],
    target: "B5",
    solution: "C5",
    within: 2,
  },
  {
    black: ["G6", "H6", "J6", "H4"],
    white: ["H5"],
    target: "H5",
    solution: "G5",
    within: 2,
  },
  {
    black: ["F5", "G5", "E4", "G3"],
    white: ["F4", "F2"],
    target: "F4",
    solution: "F3",
    within: 2,
  },
  {
    black: ["H3", "J3", "G2"],
    white: ["H2", "J2"],
    target: "H2",
    solution: "H1",
    within: 2,
  },
  {
    black: ["E2", "G2", "E1"],
    white: ["G3", "F2"],
    target: "F2",
    solution: "F3",
    within: 2,
  },
];

const NETS: readonly RawCapture[] = [
  {
    black: ["B9", "C9", "A8", "A7"],
    white: ["B8"],
    target: "B8",
    solution: "C7",
    within: 3,
  },
  {
    black: ["E9", "F9", "D8", "D7"],
    white: ["E8"],
    target: "E8",
    solution: "F7",
    within: 3,
  },
  {
    black: ["J4", "J3", "G2", "H2"],
    white: ["H3", "E1"],
    target: "H3",
    solution: "G4",
    within: 3,
  },
  {
    black: ["A4", "A3", "B2", "C2"],
    white: ["B3"],
    target: "B3",
    solution: "C4",
    within: 3,
  },
  {
    black: ["D9", "E9", "E8", "E7"],
    white: ["D8", "E5"],
    target: "D8",
    solution: "C7",
    within: 4,
  },
  {
    black: ["C3", "C2", "C1", "D1"],
    white: ["D2"],
    target: "D2",
    solution: "E3",
    within: 4,
  },
  {
    black: ["G8", "H7"],
    white: ["H8", "J7", "J5"],
    target: "H8",
    solution: "H6",
    within: 4,
  },
  {
    black: ["D3", "D2", "D1", "E1"],
    white: ["A6", "E2"],
    target: "E2",
    solution: "F3",
    within: 4,
  },
];

const LADDERS: readonly RawCapture[] = [
  {
    black: ["D5", "B4", "D4"],
    white: ["C4"],
    target: "C4",
    solution: "C3",
    within: 5,
  },
  {
    black: ["F8", "F6", "G6"],
    white: ["F7"],
    target: "F7",
    solution: "E7",
    within: 5,
  },
  {
    black: ["E5", "F4", "F3"],
    white: ["G7", "F5", "E4"],
    target: "E4",
    solution: "D4",
    within: 6,
  },
  {
    black: ["F6", "G6", "E5"],
    white: ["B6", "J6", "F5"],
    target: "F5",
    solution: "F4",
    within: 6,
  },
  {
    black: ["F4", "D3", "E2"],
    white: ["E3", "J2"],
    target: "E3",
    solution: "E4",
    within: 5,
  },
];

const LIVE: readonly RawLife[] = [
  {
    black: ["C9", "D9", "G9", "C8", "F8", "G8", "C7", "D7", "E7", "F7"],
    white: ["B9", "E9", "H9", "B8", "H8", "B7", "G7", "C6", "D6", "E6", "F6"],
    target: "D9",
    area: ["E9", "E8", "F9", "D8"],
    solution: "E8",
  },
  {
    black: ["A9", "D9", "A8", "C8", "D8", "A7", "B7", "C7"],
    white: ["E9", "E8", "D7", "A6", "B6", "C6"],
    target: "C8",
    area: ["C9", "B9", "B8"],
    solution: "B9",
  },
  {
    black: ["C9", "D9", "A8", "D8", "A7", "B7", "C7", "D7"],
    white: ["E9", "B8", "E8", "E7", "A6", "B6", "C6", "D6"],
    target: "C9",
    area: ["A9", "B9", "B8", "A8", "C8"],
    solution: "B9",
  },
  {
    black: ["C9", "C8", "A7", "C7", "A6", "B6", "C6"],
    white: ["B9", "D9", "D8", "B7", "D7", "D6", "A5", "B5", "C5"],
    target: "C9",
    area: ["A9", "B9", "B8", "B7", "A8"],
    solution: "B8",
  },
  {
    black: ["B9", "B8", "B7", "A6", "B6"],
    white: ["C9", "C8", "A7", "C7", "C6", "A5", "B5"],
    target: "B9",
    area: ["A9", "A8", "A7"],
    solution: "A8",
  },
  {
    black: ["D9", "G9", "D8", "F8", "G8", "D7", "E7", "F7"],
    white: ["C9", "F9", "H9", "C8", "H8", "C7", "G7", "D6", "E6", "F6"],
    target: "D9",
    area: ["E9", "F9", "E8"],
    solution: "E9",
  },
  {
    black: ["D9", "C8", "D8", "B7", "C7", "A6", "B6"],
    white: ["A9", "B9", "E9", "E8", "D7", "C6", "A5", "B5"],
    target: "C8",
    area: ["A9", "B9", "A8", "A7", "B8", "C9"],
    solution: "A8",
  },
  {
    black: ["A9", "B9", "D9", "E9", "A8", "E8", "A7", "B7", "C7", "D7", "E7"],
    white: ["F9", "B8", "F8", "F7", "A6", "B6", "C6", "D6", "E6"],
    target: "B9",
    area: ["C9", "D9", "C8", "D8", "B8"],
    solution: "C8",
  },
];

const KILL: readonly RawLife[] = [
  {
    black: ["C9", "C8", "C7", "C6", "A5", "B5"],
    white: ["B9", "B8", "B7", "A6", "B6"],
    target: "B9",
    area: ["A9", "A8", "A7"],
    solution: "A8",
  },
  {
    black: ["B9", "F9", "J9", "B8", "J8", "C7", "G7", "H7", "D6", "E6", "F6"],
    white: ["C9", "H9", "C8", "D8", "E8", "F8", "G8", "H8", "D7", "E7", "F7"],
    target: "C9",
    area: ["D9", "E9", "F9", "E8", "G9"],
    solution: "E9",
  },
  {
    black: ["B9", "G9", "B8", "G8", "C7", "G7", "D6", "E6", "F6"],
    white: ["C9", "F9", "C8", "D8", "F8", "D7", "E7", "F7"],
    target: "C9",
    area: ["D9", "E9", "E8"],
    solution: "E9",
  },
  {
    black: ["D9", "D8", "C7", "A6", "B6"],
    white: ["C9", "B8", "C8", "A7", "B7"],
    target: "B8",
    area: ["A9", "A8", "B9"],
    solution: "A9",
  },
  {
    black: ["B9", "E9", "E8", "E7", "A6", "B6", "C6", "D6"],
    white: ["D9", "B8", "D8", "A7", "B7", "C7", "D7"],
    target: "B8",
    area: ["A9", "B9", "C9", "C8", "A8"],
    solution: "C9",
  },
  {
    black: ["C9", "E9", "E8", "A7", "D7", "C6", "A5", "B5"],
    white: ["D9", "C8", "D8", "B7", "C7", "A6", "B6"],
    target: "B7",
    area: ["A9", "A8", "A7", "B8", "B9", "C9"],
    solution: "B8",
  },
  {
    black: [
      "B9",
      "G9",
      "B8",
      "E8",
      "G8",
      "B7",
      "D7",
      "G7",
      "B6",
      "F6",
      "C5",
      "D5",
      "E5",
    ],
    white: ["C9", "D9", "F9", "C8", "F8", "C7", "E7", "F7", "C6", "D6", "E6"],
    target: "D9",
    area: ["E9", "E8", "D8", "D7"],
    solution: "D8",
  },
  {
    black: ["D9", "D8", "A7", "D7", "D6", "A5", "B5", "C5"],
    white: ["C9", "C8", "B7", "C7", "A6", "B6", "C6"],
    target: "C9",
    area: ["A9", "A8", "B8", "A7", "B9", "B7"],
    solution: "A8",
  },
];

const captureSet = (
  id: CaptureTheme,
  title: string,
  summary: string,
  raws: readonly RawCapture[],
): BadukPuzzleSet => ({
  id,
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `${id}-${i + 1}`,
    kind: "capture",
    theme: id,
    ...p,
  })),
});

const lifeSet = (
  goal: "live" | "kill",
  title: string,
  summary: string,
  raws: readonly RawLife[],
): BadukPuzzleSet => ({
  id: goal,
  title,
  summary,
  puzzles: raws.map((p, i) => ({
    id: `${goal}-${i + 1}`,
    kind: "life",
    goal,
    ...p,
  })),
});

export const BADUK_PUZZLE_SETS: readonly BadukPuzzleSet[] = [
  captureSet(
    "atari",
    "단수 방향",
    "활로가 둘인 돌에 단수를 친다. 달아날 길을 막는 쪽에서 쳐야 따낸다",
    ATARI,
  ),
  captureSet(
    "ladder",
    "축",
    "계속 단수를 치며 몰아 판 끝이나 내 돌에 부딪히게 해 따낸다",
    LADDERS,
  ),
  captureSet(
    "net",
    "장문",
    "바로 단수 치지 않고 한 칸 떨어져 길을 막는다. 어느 쪽으로 나와도 잡힌다",
    NETS,
  ),
  lifeSet(
    "live",
    "두 눈 만들기",
    "눈이 둘이면 상대가 아무리 두어도 잡히지 않는다. 눈을 둘로 나누는 자리를 찾는다",
    LIVE,
  ),
  lifeSet(
    "kill",
    "눈 빼앗기",
    "상대 눈 자리 한가운데(급소)에 두어 두 눈을 못 만들게 한다",
    KILL,
  ),
];
