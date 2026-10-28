import { describe, expect, it } from "vitest";

import {
  applyMove,
  canMate,
  inCheck,
  insufficientMaterial,
  legalMoves,
  moveToSan,
  type Position,
  parseFen,
  playSan,
  positionKey,
  START_FEN,
  sanToMove,
  squareAt,
  squareName,
  startPosition,
  toFen,
} from "./board";

/** 깊이 `depth`까지 둘 수 있는 수를 모두 세어 본다(perft). 수 생성이 맞는지 알려진 값과 견준다 */
function perft(pos: Position, depth: number): number {
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(applyMove(pos, m), depth - 1);
  return n;
}

const KIWIPETE =
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

describe("수 세기(perft): 알려진 값과 같다", () => {
  it("처음 판: 깊이 1~4가 20·400·8902·197281", () => {
    const pos = startPosition();
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
    expect(perft(pos, 4)).toBe(197281);
  });

  it("Kiwipete(캐슬링·앙파상·승급이 얽힌 판): 48·2039·97862", () => {
    const pos = parseFen(KIWIPETE);
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });

  it("끝판 판(앙파상 핀): 14·191·2812·43238", () => {
    const pos = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });

  it("승급·캐슬링 판: 6·264·9467", () => {
    const pos = parseFen(
      "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    );
    expect(perft(pos, 1)).toBe(6);
    expect(perft(pos, 2)).toBe(264);
    expect(perft(pos, 3)).toBe(9467);
  });

  it("승급으로 체크하는 판: 44·1486·62379", () => {
    const pos = parseFen(
      "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    );
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1486);
    expect(perft(pos, 3)).toBe(62379);
  });
});

describe("칸 이름과 FEN", () => {
  it("a8은 0, h1은 63, e4는 그 사이", () => {
    expect(squareAt("a8")).toBe(0);
    expect(squareAt("h1")).toBe(63);
    expect(squareName(squareAt("e4"))).toBe("e4");
    expect(() => squareAt("i9")).toThrow();
  });

  it("FEN을 읽고 다시 쓰면 같다", () => {
    for (const fen of [START_FEN, KIWIPETE, "8/8/8/8/8/8/8/K6k b - - 12 40"])
      expect(toFen(parseFen(fen))).toBe(fen);
    expect(() => parseFen("rnbqkbnr/8 w")).toThrow();
  });
});

describe("기보(SAN)", () => {
  it("처음 수들과 잡기·캐슬링을 쓴다", () => {
    const pos = startPosition();
    const san = (p: Position, text: string) => {
      const m = sanToMove(p, text);
      if (!m) throw new Error(text);
      return moveToSan(p, m);
    };
    expect(san(pos, "e4")).toBe("e4");
    expect(san(pos, "Nf3")).toBe("Nf3");
    const open = playSan(pos, ["e4", "d5"]);
    expect(san(open, "exd5")).toBe("exd5");
    const castle = playSan(pos, ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]);
    expect(san(castle, "O-O")).toBe("O-O");
    expect(sanToMove(castle, "0-0")).toEqual(sanToMove(castle, "O-O"));
  });

  it("같은 칸으로 가는 기물이 둘이면 출발 줄로 가린다", () => {
    const pos = parseFen("4k3/8/8/8/8/8/4K3/R6R w - - 0 1");
    expect(moveToSan(pos, { from: squareAt("a1"), to: squareAt("d1") })).toBe(
      "Rad1",
    );
    const ranks = parseFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
    expect(moveToSan(ranks, { from: squareAt("a1"), to: squareAt("a3") })).toBe(
      "R1a3",
    );
  });

  it("승급과 체크·메이트 표시", () => {
    const promo = parseFen("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1");
    expect(
      moveToSan(promo, {
        from: squareAt("e7"),
        to: squareAt("e8"),
        promotion: "Q",
      }),
    ).toBe("e8=Q");
    const mate = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    expect(moveToSan(mate, { from: squareAt("a1"), to: squareAt("a8") })).toBe(
      "Ra8#",
    );
    const check = parseFen("6k1/5p1p/8/8/8/8/8/R5K1 w - - 0 1");
    expect(moveToSan(check, { from: squareAt("a1"), to: squareAt("a8") })).toBe(
      "Ra8+",
    );
  });
});

describe("특별한 수", () => {
  it("앙파상: 두 칸 나간 폰을 바로 다음 수에만 잡는다", () => {
    const pos = playSan(startPosition(), ["e4", "a6", "e5", "d5"]);
    const ep = sanToMove(pos, "exd6");
    expect(ep).not.toBeNull();
    const after = applyMove(pos, ep as NonNullable<typeof ep>);
    expect(after.board[squareAt("d5")]).toBe("");
    expect(after.board[squareAt("d6")]).toBe("wP");
    // 한 수 미루면 못 잡는다.
    const late = playSan(pos, ["Nf3", "a5"]);
    expect(sanToMove(late, "exd6")).toBeNull();
  });

  it("캐슬링: 체크 중이거나 지나는 칸이 공격받으면 못 한다", () => {
    const free = parseFen("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(sanToMove(free, "O-O")).not.toBeNull();
    expect(sanToMove(free, "O-O-O")).not.toBeNull();
    const checked = parseFen("4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(sanToMove(checked, "O-O")).toBeNull();
    const through = parseFen("4k3/5r2/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(sanToMove(through, "O-O")).toBeNull();
    expect(sanToMove(through, "O-O-O")).not.toBeNull();
    // 퀸 쪽은 b1이 공격받아도 된다(킹이 지나지 않는다).
    const b1 = parseFen("4k3/1r6/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(sanToMove(b1, "O-O-O")).not.toBeNull();
  });

  it("캐슬링하면 룩도 옮겨지고, 킹·룩을 움직이면 권리를 잃는다", () => {
    const pos = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const after = playSan(pos, ["O-O"]);
    expect(after.board[squareAt("g1")]).toBe("wK");
    expect(after.board[squareAt("f1")]).toBe("wR");
    expect(after.castling).toBe("kq");
    const rook = playSan(pos, ["Ra2"]);
    expect(rook.castling).toBe("Kkq");
    // 룩이 잡혀도 그쪽 권리가 없어진다.
    const taken = playSan(pos, ["Rxa8+"]);
    expect(taken.castling).toBe("Kk");
  });

  it("폰이 끝줄에 닿으면 넷 가운데 하나로 바뀐다", () => {
    const pos = parseFen("8/4P1k1/8/8/8/8/8/4K3 w - - 0 1");
    const promos = legalMoves(pos).filter((m) => m.promotion);
    expect(promos.map((m) => m.promotion).sort()).toEqual(["B", "N", "Q", "R"]);
    const after = playSan(pos, ["e8=N"]);
    expect(after.board[squareAt("e8")]).toBe("wN");
  });

  it("핀된 기물은 킹 앞을 비울 수 없다", () => {
    const pos = parseFen("4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1");
    expect(legalMoves(pos).filter((m) => m.from === squareAt("e2"))).toEqual(
      [],
    );
    expect(inCheck(pos.board, "w")).toBe(false);
  });
});

describe("기물 부족과 되풀이 열쇠", () => {
  it("킹만, 킹 + 나이트 하나, 같은 색 비숍은 메이트할 수 없다", () => {
    expect(
      insufficientMaterial(parseFen("8/8/8/4k3/8/8/8/4K3 w - - 0 1").board),
    ).toBe(true);
    expect(
      insufficientMaterial(parseFen("8/8/8/4k3/8/8/8/3NK3 w - - 0 1").board),
    ).toBe(true);
    expect(
      insufficientMaterial(parseFen("8/8/8/2b1k3/8/8/8/2B1K3 w - - 0 1").board),
    ).toBe(true);
    expect(
      insufficientMaterial(parseFen("8/8/8/3bk3/8/8/8/2B1K3 w - - 0 1").board),
    ).toBe(false);
    expect(
      insufficientMaterial(parseFen("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1").board),
    ).toBe(false);
  });

  it("시간패에서 이길 기물: 킹만이면 못 이기고, 나이트 하나는 상대 기물이 있을 때만", () => {
    expect(canMate(parseFen("8/8/8/4k3/8/8/8/Q3K3 w - - 0 1").board, "b")).toBe(
      false,
    );
    expect(canMate(parseFen("8/8/8/4k3/8/8/8/Q3K3 w - - 0 1").board, "w")).toBe(
      true,
    );
    expect(canMate(parseFen("8/8/8/3nk3/8/8/8/4K3 w - - 0 1").board, "b")).toBe(
      false,
    );
    expect(
      canMate(parseFen("8/8/8/3nk3/8/8/4P3/4K3 w - - 0 1").board, "b"),
    ).toBe(true);
  });

  it("앙파상 칸은 실제로 잡을 수 있을 때만 열쇠에 들어간다", () => {
    const plain = playSan(startPosition(), ["e4"]);
    expect(positionKey(plain).endsWith("|-")).toBe(true);
    const capturable = playSan(startPosition(), ["e4", "a6", "e5", "d5"]);
    expect(positionKey(capturable).endsWith("|d6")).toBe(true);
  });
});
