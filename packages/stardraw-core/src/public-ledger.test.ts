import { describe, expect, it } from "vitest";

import { anchorFile, anchorPath, genesisAnchorFile, ledgerId } from "./anchor";
import { toBase64Url, toHex } from "./bytes";
import { drandRoundForClose } from "./drand";
import {
  checkPublicLedger,
  findTicket,
  type PublicLedger,
  parseTicketQuery,
} from "./public-ledger";
import { encodeRecord, genesisHash, recordHash } from "./record";
import { closeRound, sealDigest, sortTickets } from "./round";
import { roundTimes, type Schedule } from "./schedule";
import { FakeTsa, registerRaw, signers, ticketFor } from "./testing";
import { ticketId } from "./ticket";
import { sealImprint, type TsaProof } from "./tsa";

const checkServerLedger = checkPublicLedger;

// 시험 장부 하나: 1회차는 응모 없이 정상으로 닫혔다(가짜 drand 서명, 확인은 바꿔 끼운다)
const SCHEDULE: Schedule = {
  epoch: 1793321700,
  entries: [
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 5,
      powTarget: 2 ** 31,
      registerPowTarget: 2 ** 31,
      phase: "trial",
    },
  ],
};
const { closesAt } = roundTimes(SCHEDULE, 1);
const RECORD = closeRound({
  schedule: SCHEDULE,
  round: 1,
  prev: genesisHash(SCHEDULE),
  tickets: [],
  rootLoggedAt: closesAt + 10,
  beacon: {
    round: drandRoundForClose(closesAt),
    signature: new Uint8Array(48).fill(7),
  },
});

function files(change: (f: Record<string, unknown>) => void = () => {}) {
  const f: Record<string, unknown> = {
    "/ledger/genesis.json": { v: 1, schedule: SCHEDULE },
    "/ledger/head.json": {
      v: 1,
      rounds: 1,
      head: toHex(recordHash(RECORD)),
      sealed: 1,
    },
    "/ledger/seals/000001.json": {
      v: 1,
      round: 1,
      digest: toHex(sealDigest(RECORD)),
      loggedAt: RECORD.rootLoggedAt,
    },
    "/ledger/rounds/000001.json": {
      v: 1,
      record: toBase64Url(encodeRecord(RECORD)),
      tickets: [],
      registrations: [],
    },
  };
  change(f);
  return (async (url: string) => {
    const body = f[url];
    if (body === undefined) return new Response("없음", { status: 404 });
    return typeof body === "string" ? new Response(body) : Response.json(body);
  }) as unknown as typeof fetch;
}

const statusOf = (items: { id: string; status: string }[]) =>
  Object.fromEntries(items.map((i) => [i.id, i.status]));

describe("장부 전체 검사(서버 공개 파일)", () => {
  it("정직한 장부는 모든 항목이 통과하고, 바깥 증명(시각 인증·앵커)만 건너뜀이다", async () => {
    const result = await checkServerLedger({
      base: "",
      fetch: files(),
      beaconVerifier: () => true,
    });
    expect(result.problems).toEqual([]);
    expect(result.mode).toBe("trial");
    const status = statusOf(result.items);
    expect(status.timestamp).toBe("skip");
    expect(status.anchor).toBe("skip");
    const inside = result.items.filter(
      (i) => i.id !== "timestamp" && i.id !== "anchor",
    );
    expect(inside.map((i) => i.status)).toEqual(inside.map(() => "pass"));
  });

  it("drand 서명이 맞지 않으면 그 항목이 실패한다", async () => {
    const result = await checkServerLedger({
      base: "",
      fetch: files(),
      beaconVerifier: () => false,
    });
    expect(statusOf(result.items).drand).toBe("fail");
  });

  it("봉인 파일이나 장부 끝 해시가 기록과 다르면 드러난다", async () => {
    const result = await checkServerLedger({
      base: "",
      beaconVerifier: () => true,
      fetch: files((f) => {
        f["/ledger/seals/000001.json"] = {
          v: 1,
          round: 1,
          digest: "00".repeat(32),
          loggedAt: RECORD.rootLoggedAt,
        };
        f["/ledger/head.json"] = {
          v: 1,
          rounds: 1,
          head: "11".repeat(32),
          sealed: 1,
        };
      }),
    });
    const status = statusOf(result.items);
    expect(status.seal).toBe("fail");
    expect(status.head).toBe("fail");
  });
});

describe("봉인 시각 증명(공개 시각 인증 토큰)", () => {
  const tsa = new FakeTsa("tsa-a", () => RECORD.rootLoggedAt);
  const tokenFor = (digest: Uint8Array, genTime: number) =>
    btoa(String.fromCharCode(...tsa.stamp(sealImprint(digest), genTime)));
  const withLog = (log: unknown, mode: "trial" | "live" = "trial") =>
    files((f) => {
      const seal = f["/ledger/seals/000001.json"] as Record<string, unknown>;
      seal.log = log;
      if (mode === "live") {
        const live: Schedule = {
          ...SCHEDULE,
          entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "live" })),
        };
        f["/ledger/genesis.json"] = { v: 1, schedule: live };
      }
    });
  const proof = (token: string, genTime = RECORD.rootLoggedAt): TsaProof => ({
    kind: "tsa",
    tokens: [{ tsa: "tsa-a", genTime, token }],
  });
  const check = (fetch: typeof globalThis.fetch) =>
    checkServerLedger({
      base: "",
      fetch,
      beaconVerifier: () => true,
      tsaAuthorities: [tsa.authority],
    });
  const timestamp = async (fetch: typeof globalThis.fetch) =>
    (await check(fetch)).items.find((i) => i.id === "timestamp");

  it("토큰이 봉인 값을 담고 가장 이른 시각이 기록과 같으면 통과한다", async () => {
    const token = tokenFor(sealDigest(RECORD), RECORD.rootLoggedAt);
    expect(await timestamp(withLog(proof(token)))).toMatchObject({
      status: "pass",
      detail: "1회차 확인(tsa-a)",
    });
  });

  it("다른 값을 담은 토큰, 기록과 다른 시각의 토큰은 실패한다", async () => {
    const other = tokenFor(new Uint8Array(32), RECORD.rootLoggedAt);
    expect((await timestamp(withLog(proof(other))))?.status).toBe("fail");
    const earlier = tokenFor(sealDigest(RECORD), RECORD.rootLoggedAt - 5);
    expect(
      await timestamp(withLog(proof(earlier, RECORD.rootLoggedAt - 5))),
    ).toMatchObject({
      status: "fail",
      detail: "1회차: 봉인 시각이 가장 이른 토큰 시각과 다르다",
    });
  });

  it("증거가 없는 회차는 시험 단계면 건너뜀, 정식 단계면 실패", async () => {
    expect((await timestamp(withLog({ kind: "local" })))?.status).toBe("skip");
    expect((await timestamp(withLog({ kind: "local" }, "live")))?.status).toBe(
      "fail",
    );
  });
});

describe("앵커 저장소(GitHub raw)", () => {
  const RAW = "https://raw.githubusercontent.com/ybbarng/stardraw-ledger";
  const withAnchor = (genesis: Schedule, recordFile?: string) =>
    files((f) => {
      f[`${RAW}/main/genesis.txt`] = genesisAnchorFile(genesis);
      if (recordFile)
        f[`${RAW}/trial/${anchorPath(ledgerId(SCHEDULE), 1)}`] = recordFile;
    });
  const run = (fetch: typeof globalThis.fetch) =>
    checkServerLedger({ base: "", fetch, beaconVerifier: () => true });
  const good = anchorFile({
    ledger: ledgerId(SCHEDULE),
    round: 1,
    record: toHex(recordHash(RECORD)),
    seal: "-",
  });

  it("처음 일정표와 회차 기록 해시가 앵커와 같으면 통과한다(시험 회차는 trial 브랜치)", async () => {
    const result = await run(withAnchor(SCHEDULE, good));
    expect(statusOf(result.items).anchor).toBe("pass");
    expect(result.problems).toEqual([]);
  });

  it("앵커의 처음 일정표와 다르면(장부를 다시 시작했다) 실패한다", async () => {
    const other: Schedule = { ...SCHEDULE, epoch: SCHEDULE.epoch + 3600 };
    const result = await run(withAnchor(other, good));
    expect(result.items.find((i) => i.id === "anchor")).toMatchObject({
      status: "fail",
      detail: "처음 일정표: 앵커 저장소의 장부와 다르다(장부를 다시 시작했다)",
    });
  });
});

describe("내 응모권 찾기", () => {
  it("공유 주소·영수증 앞자리·회차-일련번호를 읽는다", () => {
    const id = "ab".repeat(32);
    expect(
      parseTicketQuery(`https://game.byb.kr/stardraw/ticket#12-${id}`),
    ).toEqual({ round: 12, id });
    expect(parseTicketQuery("3 ABCD ef01 2345")).toEqual({
      round: 3,
      id: "abcdef012345",
    });
    expect(parseTicketQuery("3-abc")).toBeNull();
    expect(parseTicketQuery("0-abcdef012345")).toBeNull();
    expect(parseTicketQuery("abcdef012345")).toBeNull();
  });

  // 응모권 둘이 든 1회차(가짜 drand 서명)
  async function ledgerWithTickets(): Promise<{
    ledger: PublicLedger;
    ids: string[];
  }> {
    const keys = await signers(2);
    const prev = genesisHash(SCHEDULE);
    const registrations = await registerRaw(keys, prev);
    const tickets = await Promise.all(
      keys.map((k, i) => ticketFor(k, 1, [1, 2, 3, 4, 5, 6 + i], prev)),
    );
    const record = closeRound({
      schedule: SCHEDULE,
      round: 1,
      prev,
      tickets,
      registrations,
      rootLoggedAt: closesAt + 10,
      beacon: {
        round: drandRoundForClose(closesAt),
        signature: new Uint8Array(48).fill(7),
      },
    });
    return {
      ledger: {
        genesis: SCHEDULE,
        head: { rounds: 1, head: toHex(recordHash(record)), sealed: 1 },
        records: [record],
        tickets: [sortTickets(tickets)],
        registrations: [registrations],
        seals: [],
      },
      ids: tickets.map((t) => toHex(ticketId(t))),
    };
  }

  it("일련번호 앞자리로 찾아 머클 증명과 등수를 확인한다", async () => {
    const { ledger, ids } = await ledgerWithTickets();
    const id = ids[0] as string;
    const found = findTicket(ledger, { round: 1, id: id.slice(0, 12) });
    expect(found).toMatchObject({ found: true, id, included: true });
    if (found.found) {
      const record = ledger.records[0];
      const expected =
        ([1, 2, 3, 4, 5] as const).find((r) =>
          record?.winners[r].some((w) => toHex(w) === id),
        ) ?? null;
      expect(found.rank).toBe(expected);
    }
  });

  it("없는 일련번호, 닫히지 않은 회차는 이유와 함께 못 찾는다", async () => {
    const { ledger } = await ledgerWithTickets();
    expect(findTicket(ledger, { round: 1, id: "00000000" })).toMatchObject({
      found: false,
      reason: "1회차 응모권 2장 가운데 이 일련번호가 없습니다",
    });
    expect(findTicket(ledger, { round: 2, id: "00000000" })).toMatchObject({
      found: false,
    });
  });
});
