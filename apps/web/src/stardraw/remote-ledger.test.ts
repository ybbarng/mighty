import { ManualClock } from "@mighty/fair-play";
import {
  closeRound,
  drandRoundForClose,
  encodeRecord,
  genesisAnchorFile,
  genesisHash,
  githubLedgerBase,
  ledgerId,
  type RoundRecord,
  recordHash,
  roundTimes,
  type Schedule,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { RemoteLedger } from "./remote-ledger";

/**
 * 서버 장부의 대비책(docs/36 11-16): 우리 서버가 응답하지 않으면(네트워크 오류·5xx)
 * 지난 회차를 앵커 저장소 사본(GitHub raw)에서 받고, 서버가 돌아오면 서버로 돌아온다
 */

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

/** 응모 없이 닫힌 n회차(가짜 drand 서명, 모양만 쓴다) */
function records(n: number): RoundRecord[] {
  const out: RoundRecord[] = [];
  let prev = genesisHash(SCHEDULE);
  for (let round = 1; round <= n; round++) {
    const { closesAt } = roundTimes(SCHEDULE, round);
    const record = closeRound({
      schedule: SCHEDULE,
      round,
      prev,
      tickets: [],
      rootLoggedAt: closesAt + 10,
      beacon: {
        round: drandRoundForClose(closesAt),
        signature: new Uint8Array(48).fill(7),
      },
    });
    out.push(record);
    prev = recordHash(record);
  }
  return out;
}

const SERVER = "https://game.byb.kr/stardraw-api";
const REPO = "ybbarng/stardraw-ledger";
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const ID = ledgerId(SCHEDULE);

/** 장부 파일(서버 /ledger/… 와 사본이 같다). 회차 파일만 쓴다 */
function ledgerFiles(base: string, recs: RoundRecord[]) {
  const files: Record<string, unknown> = {
    [`${base}/ledger/genesis.json`]: { v: 1, schedule: SCHEDULE },
    [`${base}/ledger/head.json`]: {
      v: 1,
      rounds: recs.length,
      head: toHex(recordHash(recs.at(-1) as RoundRecord)),
      sealed: recs.length,
    },
  };
  for (const r of recs)
    files[`${base}/ledger/rounds/${String(r.round).padStart(6, "0")}.json`] = {
      v: 1,
      record: toBase64Url(encodeRecord(r)),
      tickets: [],
      registrations: [],
    };
  return files;
}

/**
 * 서버(3회차까지 닫힘)와 앵커 저장소 trial 사본(2회차까지).
 * server: "up"(응답), "down"(네트워크 오류), "502"(앞단이 서버에 닿지 못함)
 */
function world(clock: ManualClock) {
  const all = records(3);
  const files: Record<string, unknown> = {
    ...ledgerFiles(SERVER, all),
    ...ledgerFiles(githubLedgerBase(REPO, "trial", ID), all.slice(0, 2)),
    [`${RAW}/main/genesis.txt`]: genesisAnchorFile(SCHEDULE),
  };
  const { closesAt } = roundTimes(SCHEDULE, 4);
  const w = {
    server: "up" as "up" | "down" | "502",
    /** 서버 상태는 되지만 장부 파일만 502 */
    filesBroken: false,
    asked: [] as string[],
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      w.asked.push(url);
      if (url.startsWith(SERVER)) {
        if (w.server === "down") throw new TypeError("Failed to fetch");
        if (w.server === "502" || (w.filesBroken && url.includes("/ledger/")))
          return new Response("", { status: 502 });
        if (url === `${SERVER}/api/state`)
          return Response.json({
            now: Math.floor(clock.now() / 1000),
            round: 4,
            records: 3,
            sealed: 3,
            head: toHex(recordHash(all[2] as RoundRecord)),
            entries: 0,
            serverKey: "",
            mode: "trial",
          });
      }
      const body = files[url];
      if (body === undefined) return new Response("없음", { status: 404 });
      return typeof body === "string"
        ? new Response(body)
        : Response.json(body);
    }) as typeof fetch,
  };
  clock.advance((closesAt - 600) * 1000);
  return w;
}

function ledgerIn(w: ReturnType<typeof world>, clock: ManualClock) {
  return new RemoteLedger({
    base: SERVER,
    clock,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    fetch: w.fetch,
  });
}

const githubAsked = (w: ReturnType<typeof world>) =>
  w.asked.filter((u) => u.startsWith(RAW));

describe("서버 장부: 앵커 저장소 대비책", () => {
  it("서버가 응답하면 서버만 쓴다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    expect(ledger.closed()).toHaveLength(3);
    expect(githubAsked(w)).toEqual([]);
  });

  it("서버에 닿지 못하면 처음 일정표와 지난 회차를 사본에서 받고, 서버가 돌아오면 서버로 이어 받는다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    w.server = "down";
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    expect(ledger.closed().map((c) => c.record.round)).toEqual([1, 2]);
    expect(ledger.id()).toBe(`server:${toHex(genesisHash(SCHEDULE))}`);
    expect(ledger.status().round).toBe(4);
    // main에 사본이 없어 trial을 쓴다
    expect(githubAsked(w)).toContain(
      `${githubLedgerBase(REPO, "trial", ID)}/ledger/head.json`,
    );

    // 1초 뒤에는 서버를 다시 두드리지 않는다
    const before = w.asked.filter((u) => u.startsWith(SERVER)).length;
    clock.advance(1000);
    await ledger.settle();
    expect(w.asked.filter((u) => u.startsWith(SERVER))).toHaveLength(before);

    w.server = "up";
    clock.advance(10_000);
    await ledger.settle();
    expect(ledger.closed().map((c) => c.record.round)).toEqual([1, 2, 3]);
  });

  it("앞단이 5xx를 내도(서버 멈춤) 사본으로, 상태는 되는데 장부 파일만 5xx여도 사본에 있는 회차까지", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    w.server = "502";
    const ledger = ledgerIn(w, clock);
    await ledger.settle();
    expect(ledger.closed()).toHaveLength(2);

    const clock2 = new ManualClock();
    const w2 = world(clock2);
    w2.filesBroken = true;
    w2.fetch = ((orig) =>
      (async (input: string | URL | Request) => {
        // 처음 일정표는 받아 둔 것으로 치고 회차 파일만 깨진다
        if (String(input) === `${SERVER}/ledger/genesis.json`)
          return Response.json({ v: 1, schedule: SCHEDULE });
        return orig(input);
      }) as typeof fetch)(w2.fetch);
    const other = ledgerIn(w2, clock2);
    await other.settle();
    expect(other.closed()).toHaveLength(2);
    expect(other.status().round).toBe(4);
  });

  it("사본도 받지 못하면 서버 오류를 그대로 던지고, 서버가 틀린 응답(4xx)이면 사본으로 넘어가지 않는다", async () => {
    const clock = new ManualClock();
    const w = world(clock);
    w.server = "down";
    const ledger = new RemoteLedger({
      base: SERVER,
      clock,
      policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
      fetch: w.fetch,
      anchorRepo: "someone/elsewhere",
    });
    await expect(ledger.settle()).rejects.toThrow("Failed to fetch");

    const clock2 = new ManualClock();
    const w2 = world(clock2);
    const notFound = ledgerIn(
      {
        ...w2,
        fetch: (async (input: string | URL | Request) =>
          String(input).startsWith(SERVER)
            ? new Response("", { status: 404 })
            : w2.fetch(input)) as typeof fetch,
      },
      clock2,
    );
    await expect(notFound.settle()).rejects.toThrow("(404)");
    expect(githubAsked(w2)).toEqual([]);
  });
});
