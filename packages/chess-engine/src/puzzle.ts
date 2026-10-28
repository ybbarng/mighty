import {
  applyMove,
  inCheck,
  legalMoves,
  type Move,
  type Position,
} from "./board";

/*
 * 메이트 문제를 풀고 검증하는 도우미(docs/23). 수 배우기의 문제 데이터를 단위 시험에서 엔진으로 확인하고,
 * 문제를 고를 때 "정답이 하나뿐인 장면"을 찾는 데 쓴다.
 */

/** 둘 차례인 편이 체크메이트인가(체크를 받았고 둘 수가 없다) */
export function isCheckmate(pos: Position): boolean {
  return inCheck(pos.board, pos.turn) && legalMoves(pos).length === 0;
}

/** 한 수 메이트가 되는 수들 */
export function mateInOneMoves(pos: Position): Move[] {
  return legalMoves(pos).filter((m) => isCheckmate(applyMove(pos, m)));
}

/**
 * 두 수 메이트의 첫 수들: 이 수 뒤 상대가 무엇을 두든 다음 수에 메이트가 있다.
 * 한 수 메이트인 수와, 상대가 둘 수가 없어 비기는(스테일메이트) 수는 뺀다
 */
export function mateInTwoMoves(pos: Position): Move[] {
  return legalMoves(pos).filter((first) => {
    const after = applyMove(pos, first);
    const replies = legalMoves(after);
    if (replies.length === 0) return false;
    return replies.every(
      (reply) => mateInOneMoves(applyMove(after, reply)).length > 0,
    );
  });
}
