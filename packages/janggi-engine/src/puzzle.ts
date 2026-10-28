import {
  applyMove,
  type Board,
  inCheck,
  kingsFacing,
  legalMoves,
  type Move,
  other,
  type Side,
} from "./board";

/*
 * 외통 문제를 풀고 검증하는 도우미(docs/23). 수 배우기의 문제 데이터를 단위 시험에서 엔진으로 확인하고,
 * 문제를 고를 때 "정답이 하나뿐인 장면"을 찾는 데 쓴다.
 * 빅장은 기본 규칙(점수로 가리기)으로 본다: 빅장이 되면 그 자리에서 판이 끝나 외통이 아니다.
 */

/** `side` 궁이 외통인가(장군을 받았고 피할 수가 없다) */
export function isCheckmate(board: Board, side: Side): boolean {
  return inCheck(board, side) && legalMoves(board, side).length === 0;
}

/** 이 수를 두면 바로 외통인가 */
function matesNow(board: Board, side: Side, move: Move): boolean {
  return isCheckmate(applyMove(board, move), other(side));
}

/** 한 수 외통이 되는 수들 */
export function mateInOneMoves(board: Board, side: Side): Move[] {
  return legalMoves(board, side).filter((m) => matesNow(board, side, m));
}

/** 상대가 이 판에서 할 수 있는 응수: 둘 수 있는 수와(장군이 아니면) 쉬기 */
function replies(board: Board, side: Side): (Move | null)[] {
  const moves: (Move | null)[] = legalMoves(board, side);
  if (!inCheck(board, side)) moves.push(null);
  return moves;
}

/**
 * `side`가 이 판에서 `n`수 안에 외통을 만들 수 있나(상대가 무엇을 두든, 쉬기 포함)
 */
export function forcesMate(board: Board, side: Side, n: number): boolean {
  if (n <= 0) return false;
  return legalMoves(board, side).some((m) =>
    forcesMateAfter(applyMove(board, m), side, n - 1),
  );
}

/**
 * `side`가 방금 두어 이 판이 됐을 때, 남은 `n`수 안에 외통이 되나(지금 외통이면 참).
 * 상대가 빅장을 만들면 그 자리에서 점수로 끝나 외통을 막은 것으로 본다
 */
export function forcesMateAfter(after: Board, side: Side, n: number): boolean {
  const opponent = other(side);
  if (isCheckmate(after, opponent)) return true;
  if (n <= 0 || kingsFacing(after)) return false;
  const answers = replies(after, opponent);
  if (answers.length === 0) return false;
  return answers.every((reply) => {
    const next = reply ? applyMove(after, reply) : after;
    if (kingsFacing(next)) return false;
    return n === 1
      ? mateInOneMoves(next, side).length > 0
      : forcesMate(next, side, n);
  });
}

/**
 * `n`수 안 외통의 첫 수들: 이 수 뒤 상대가 무엇을 두든(쉬기 포함) 남은 수 안에 외통이 된다.
 * 더 빠른 외통이 있으면 그 수도 함께 나온다(문제는 더 빠른 외통이 없는 판만 고른다)
 */
export function mateInMoves(board: Board, side: Side, n: number): Move[] {
  return legalMoves(board, side).filter((first) =>
    forcesMateAfter(applyMove(board, first), side, n - 1),
  );
}

/**
 * 두 수 외통의 첫 수들: 이 수 뒤 상대가 무엇을 두든(쉬기 포함) 다음 수에 외통이 있다.
 * 한 수 외통인 수는 뺀다(더 빠른 답이 있으면 두 수 문제가 아니다)
 */
export function mateInTwoMoves(board: Board, side: Side): Move[] {
  return mateInMoves(board, side, 2).filter((m) => !matesNow(board, side, m));
}

/**
 * 세 수 외통의 첫 수들. 한 수·두 수 외통이 되는 수는 뺀다.
 * 판에 기물이 많으면 무거우니 문제처럼 기물이 적은 판에서 쓴다
 */
export function mateInThreeMoves(board: Board, side: Side): Move[] {
  return mateInMoves(board, side, 3).filter(
    (m) => !forcesMateAfter(applyMove(board, m), side, 1),
  );
}
