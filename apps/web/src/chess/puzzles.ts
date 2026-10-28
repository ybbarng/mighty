/*
 * 체스 메이트 문제(docs/23, docs/26). 늘 백이 둘 차례다. 판 모양은 FEN, 정답은 기보(SAN)로 쓴다.
 * 장면은 엔진으로 "메이트 수가 하나뿐인 장면"을 찾아 골랐고(`mateInOneMoves`·`mateInTwoMoves`),
 * study.test.ts가 모든 문제를 다시 확인한다(정답 뒤 메이트인지, 정답 말고 같은 수 안의 메이트가 없는지).
 * 해설은 엔진이 장면에서 만든다.
 */

/** 문제 하나. 늘 백이 둘 차례다. 마지막 수는 메이트면 어느 수든 정답이다 */
export interface ChessPuzzle {
  id: string;
  kind: "mate";
  mateIn: 1 | 2;
  fen: string;
  /** 첫 정답 수(SAN) */
  solution: string;
}

export interface ChessPuzzleSet {
  id: string;
  title: string;
  summary: string;
  puzzles: readonly ChessPuzzle[];
}

type Raw = { fen: string; solution: string };

const MATE_IN_ONE: readonly Raw[] = [
  // 끝줄(백랭크): 자기 폰에 갇힌 킹
  { fen: "6k1/5ppp/6r1/1R6/8/6P1/K3P3/8 w - - 0 30", solution: "Rb8#" },
  { fen: "7k/6pp/8/8/8/R7/P1P1K1B1/8 w - - 0 30", solution: "Ra8#" },
  { fen: "k7/pp6/8/N7/8/5P2/1N6/2R2K2 w - - 0 30", solution: "Rc8#" },
  { fen: "7k/2r3pp/8/8/8/5Q2/2P1KP2/8 w - - 0 30", solution: "Qf8#" },
  { fen: "6k1/5ppp/5R2/8/8/4Q3/1K5P/8 w - - 0 30", solution: "Qe8#" },
  // 지키는 기물을 잡으며 메이트
  { fen: "1r4k1/1B3ppp/8/8/4N3/7P/1K3P1Q/8 w - - 0 30", solution: "Qxb8#" },
  { fen: "1k6/Rp3prR/2Q5/8/8/5P2/4P3/1K6 w - - 0 30", solution: "Qxb7#" },
  // 다른 기물이 도망칠 칸을 막아 준다
  { fen: "7k/1n4pp/2n2N2/8/4R3/3P4/K7/8 w - - 0 30", solution: "Re8#" },
  { fen: "4k3/2Q5/4bp2/8/3R4/5P1P/5K2/8 w - - 0 30", solution: "Rd8#" },
  { fen: "k7/p7/1Q6/8/8/N7/2R1P1P1/1K6 w - - 0 30", solution: "Rc8#" },
  { fen: "2k5/1pp2N2/3p4/4Q3/8/5P2/7R/6K1 w - - 0 30", solution: "Qe8#" },
  { fen: "4k3/3ppp1r/7B/8/8/2R4R/PPP1K3/8 w - - 0 30", solution: "Rc8#" },
];

const MATE_IN_TWO: readonly Raw[] = [
  // 체크로 몰아 막는 기물을 떼어 낸다
  { fen: "1k6/ppp5/8/3q4/4R3/8/1K6/8 w - - 0 30", solution: "Re8+" },
  { fen: "6k1/5p2/8/6N1/8/7Q/6P1/3N2K1 w - - 0 30", solution: "Qh7+" },
  { fen: "2k5/1p1p4/R7/3Q4/8/2P5/2P2P2/2K5 w - - 0 30", solution: "Ra8+" },
  // 핀: g7 폰은 비숍에 묶여 퀸을 잡지 못한다
  { fen: "q6k/6p1/3p4/4B3/8/8/3Q2PP/1K6 w - - 0 30", solution: "Qh6+" },
  // 조용한 첫 수: 체크 없이 킹이 갈 곳을 먼저 막는다
  { fen: "k7/1p6/p7/1Q6/3R4/3P4/P7/K7 w - - 0 30", solution: "Qb6" },
  { fen: "3k4/8/8/5Q2/1R6/8/3BK2P/8 w - - 0 30", solution: "Rb7" },
  { fen: "7k/7p/5Np1/R5p1/8/3P4/P1KQ4/8 w - - 0 30", solution: "Ra7" },
];

export const CHESS_PUZZLE_SETS: readonly ChessPuzzleSet[] = [
  {
    id: "mate1",
    title: "한 수 메이트",
    summary: "한 수로 체크를 불러 킹이 피할 곳을 없앤다",
    puzzles: MATE_IN_ONE.map((p, i) => ({
      id: `mate1-${i + 1}`,
      kind: "mate",
      mateIn: 1,
      ...p,
    })),
  },
  {
    id: "mate2",
    title: "두 수 메이트",
    summary: "상대가 어떻게 받아도 다음 수에 메이트가 되는 첫 수를 찾는다",
    puzzles: MATE_IN_TWO.map((p, i) => ({
      id: `mate2-${i + 1}`,
      kind: "mate",
      mateIn: 2,
      ...p,
    })),
  },
];
