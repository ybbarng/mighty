import {
  drandRoundForClose,
  emptyWinners,
  type RoundRecord,
  roundTimes,
  type Schedule,
  type ScheduleEntry,
  type Ticket,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  type MyRecordsInput,
  myRecords,
  newestRecord,
  recordKeys,
} from "./my-records";

/** 2026-11-01 0시(한국 시각). n회차 추첨은 이 시각 + n시간 */
const MIDNIGHT = Date.UTC(2026, 9, 31, 15, 0) / 1000;

function entry(fromRound: number, phase?: "trial" | "live"): ScheduleEntry {
  return {
    fromRound,
    length: 3600,
    closeMargin: 300,
    powTarget: 0,
    registerPowTarget: 0,
    ...(phase ? { phase } : {}),
  } as ScheduleEntry;
}
const schedule: Schedule = { epoch: MIDNIGHT - 300, entries: [entry(1)] };
const phased: Schedule = {
  epoch: MIDNIGHT - 300,
  entries: [entry(1, "trial"), entry(10, "live")],
};

const ME = new Uint8Array([1]);
const OTHER = new Uint8Array([2]);
const WIN = [1, 2, 3, 4, 5, 6];
const BONUS = 7;

let serial = 0;
function ticket(round: number, numbers: number[], pub = ME): Ticket {
  serial++;
  return { v: 1, round, numbers, pub, nonce: serial } as unknown as Ticket;
}

function record(round: number, s: Schedule = schedule, ok = true): RoundRecord {
  const closesAt = roundTimes(s, round).closesAt;
  return {
    v: 1,
    round,
    prev: new Uint8Array(32),
    count: 0,
    merkleRoot: new Uint8Array(32),
    registrationCount: 0,
    registrationRoot: new Uint8Array(32),
    rootLoggedAt: 0,
    void: !ok,
    drandRound: ok ? drandRoundForClose(closesAt) : 0,
    drandSignature: new Uint8Array(ok ? 48 : 0),
    numbers: ok ? WIN : [],
    bonus: ok ? BONUS : 0,
    winners: emptyWinners(),
    scheduleChanges: [],
    nicknames: [],
  };
}

function input(
  rounds: { round: number; tickets: Ticket[]; ok?: boolean }[],
  extra: Partial<MyRecordsInput> = {},
): MyRecordsInput {
  const s = extra.schedule ?? schedule;
  return {
    schedule: s,
    closed: rounds.map((r) => ({
      record: record(r.round, s, r.ok ?? true),
      tickets: r.tickets,
    })),
    myPubs: [ME],
    registeredRound: null,
    now: MIDNIGHT + 30 * 86400,
    idOf: (t) => `${t.round}-${(t as unknown as { nonce: number }).nonce}`,
    ...extra,
  };
}

describe("내 기록", () => {
  it("내 응모권의 당첨만 모으고, 4등은 별 도장·1~3등은 당첨증, 맞은 별을 적는다", () => {
    const r = myRecords(
      input([
        { round: 1, tickets: [ticket(1, [1, 2, 3, 4, 40, 41])] }, // 4등
        { round: 2, tickets: [ticket(2, [1, 2, 3, 4, 5, 7])] }, // 2등
        { round: 3, tickets: [ticket(3, [1, 2, 3, 40, 41, 42])] }, // 5등
        { round: 4, tickets: [ticket(4, WIN, OTHER)] }, // 남의 1등
        { round: 5, tickets: [ticket(5, [1, 2, 3, 4, 42, 43])] }, // 4등
      ]),
    );
    expect(r.counts).toEqual({ 1: 0, 2: 1, 3: 0, 4: 2, 5: 1 });
    expect(r.wins.map((w) => w.round)).toEqual([5, 3, 2, 1]);
    // 수첩은 첫 장부터 차서 오래된 도장이 앞
    expect(r.stamps.map((w) => w.round)).toEqual([1, 5]);
    expect(r.stamps[0]?.hits).toEqual([1, 2, 3, 4]);
    expect(r.certificates.map((w) => [w.round, w.rank])).toEqual([[2, 2]]);
    // 2등이면 훈장(은장) 서류도 받는다
    expect(r.awards.some((a) => a.id === "medal-silver")).toBe(true);
  });

  it("추첨을 아직 열어 보지 않은 회차와 무효 회차는 세지 않는다", () => {
    const rounds = [
      { round: 1, tickets: [ticket(1, WIN)] },
      { round: 2, tickets: [ticket(2, [1, 2, 3, 4, 40, 41])], ok: false },
    ];
    const hidden = myRecords(input(rounds, { sealed: (n) => n === 1 }));
    expect(hidden.wins).toEqual([]);
    expect(hidden.awards.some((a) => a.id === "medal-gold")).toBe(false);
    const shown = myRecords(input(rounds));
    expect(shown.wins.map((w) => [w.round, w.rank])).toEqual([[1, 1]]);
  });

  it("단계가 있는 장부는 정식 회차만 센다(기념 서류와 같은 규칙)", () => {
    const r = myRecords(
      input(
        [
          { round: 3, tickets: [ticket(3, [1, 2, 3, 4, 40, 41])] }, // 시험
          { round: 12, tickets: [ticket(12, [1, 2, 3, 4, 40, 41])] }, // 정식
        ],
        { schedule: phased },
      ),
    );
    expect(r.stamps.map((w) => w.round)).toEqual([12]);
  });

  it("처음 받은 알림: 기념 서류와 당첨증만(별 도장은 알리지 않는다), 건넬 하나는 훈장부터", () => {
    const r = myRecords(
      input([
        { round: 1, tickets: [ticket(1, [1, 2, 3, 4, 40, 41])] },
        { round: 2, tickets: [ticket(2, WIN)] },
      ]),
    );
    const keys = recordKeys(r);
    expect(keys.some((k) => k.startsWith("c:2-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("c:1-"))).toBe(false);
    const pick = newestRecord(r, keys);
    expect(pick.award?.id).toBe("medal-gold");
    // 훈장을 이미 봤으면 당첨증
    const rest = keys.filter((k) => !k.startsWith("a:medal-gold"));
    expect(newestRecord(r, rest).win?.round).toBe(2);
  });
});
