import { afterEach, describe, expect, it } from "vitest";

import { buildTour } from "./demo-tour";
import { myRank } from "./results";

afterEach(() => localStorage.clear());

describe("데모 화면 둘러보기의 가짜 상태", () => {
  it("1회 등수별 응모권이 그 등수가 되고, 2회 내 응모권은 추첨 전, 1등 확인 요청이 열려 있다", async () => {
    const s = await buildTour();
    const record = s.services.ledger.record(1);
    if (!record) throw new Error("1회가 추첨되지 않았다");
    for (const [rank, ticket] of s.byRank)
      expect(myRank(record, ticket)).toBe(rank);
    expect(s.pending.ticket.round).toBe(2);
    expect(s.services.ledger.record(2)).toBeUndefined();
    expect(s.services.wallet.loadTickets().map((m) => m.ticket.round)).toEqual([
      1, 2,
    ]);
    expect(await s.services.checker.openBatch(1, 1)).not.toBeNull();
    expect(s.confirmed.tickets[0]?.status).toBe("confirmed");
    expect(s.failed.tickets[0]?.status).toBe("failed");
  });
});
