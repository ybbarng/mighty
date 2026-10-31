import { describe, expect, it } from "vitest";

import {
  anchorFile,
  anchorPath,
  genesisAnchorFile,
  githubLedgerBase,
  ledgerId,
} from "./anchor";
import { toBase64Url, toHex } from "./bytes";
import { drandRandomness, drandRoundForClose, drandTime } from "./drand";
import { drawNumbers, drawSeed } from "./draw";
import { generateSigner } from "./keys";
import { directorFingerprint, OP_VERSION, signAsSeal } from "./operations";
import {
  BUNDLE_SIZES,
  bundleFilePath,
  checkPublicLedger,
  findGitHubLedger,
  findTicket,
  ledgerPieces,
  loadPublicLedger,
  loadRoundFiles,
  type PublicLedger,
  parseTicketQuery,
  roundFilePath,
  sealFilePath,
  voidRoundsItem,
} from "./public-ledger";
import type { RoundRecord } from "./record";
import { encodeRecord, genesisHash, recordHash } from "./record";
import { closeRound, sealDigest, sortTickets } from "./round";
import { roundTimes, type Schedule } from "./schedule";
import { FakeTsa, registerKeys, signers, ticketFor } from "./testing";
import { type Ticket, ticketId } from "./ticket";
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
    // 운영 기록이 없는 장부라 관인 열쇠는 볼 것이 없다
    expect(status["seal-key"]).toBe("skip");
    const inside = result.items.filter(
      (i) => !["timestamp", "anchor", "seal-key"].includes(i.id),
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

  it("토큰이 봉인 값을 담고 가장 이른 시각이 기록과 같으면 통과한다. 기관이 한 곳뿐이면 주의(docs/36 11-20)", async () => {
    const token = tokenFor(sealDigest(RECORD), RECORD.rootLoggedAt);
    expect(await timestamp(withLog(proof(token)))).toMatchObject({
      status: "warn",
      detail: "1회차 확인(tsa-a) / 시각 인증 기관이 한 곳뿐인 회차: 1",
    });
    const second = new FakeTsa("tsa-b", () => RECORD.rootLoggedAt);
    const both: TsaProof = {
      kind: "tsa",
      tokens: [
        ...proof(token).tokens,
        {
          tsa: "tsa-b",
          genTime: RECORD.rootLoggedAt,
          token: btoa(
            String.fromCharCode(
              ...second.stamp(
                sealImprint(sealDigest(RECORD)),
                RECORD.rootLoggedAt,
              ),
            ),
          ),
        },
      ],
    };
    const result = await checkServerLedger({
      base: "",
      fetch: withLog(both),
      beaconVerifier: () => true,
      tsaAuthorities: [tsa.authority, second.authority],
    });
    expect(result.items.find((i) => i.id === "timestamp")).toMatchObject({
      status: "pass",
      detail: "1회차 확인(tsa-a, tsa-b)",
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

  describe("장부 사본(findGitHubLedger)", () => {
    const id = ledgerId(SCHEDULE);
    /** 서버 파일을 그 브랜치의 ledgers/{id} 아래로 옮긴 가짜 raw */
    const mirrored = (branches: string[], withGenesis = true) =>
      files((f) => {
        for (const path of Object.keys(f)) {
          for (const b of branches)
            f[`${githubLedgerBase("ybbarng/stardraw-ledger", b, id)}${path}`] =
              f[path];
          delete f[path];
        }
        if (withGenesis)
          f[`${RAW}/main/genesis.txt`] = genesisAnchorFile(SCHEDULE);
        f[`${RAW}/trial/${anchorPath(id, 1)}`] = good;
      });

    it("main의 genesis.txt로 장부 id를 찾고, 정식 전에는 trial 사본을 쓴다. 기준 주소만 바꾸면 서버와 같게 검사된다", async () => {
      const fetch = mirrored(["trial"]);
      const source = await findGitHubLedger({ fetch });
      expect(source).toMatchObject({ branch: "trial", ledger: id });
      expect(source.head.rounds).toBe(1);
      const result = await checkPublicLedger({
        base: source.base,
        fetch,
        beaconVerifier: () => true,
      });
      expect(result.problems).toEqual([]);
      expect(statusOf(result.items).anchor).toBe("pass");
    });

    it("main에 사본이 있으면 main(정식 시작 뒤에는 지난 시험 회차도 main에 있다)", async () => {
      const source = await findGitHubLedger({
        fetch: mirrored(["trial", "main"]),
      });
      expect(source.branch).toBe("main");
    });

    it("genesis.txt나 사본이 없으면 알린다", async () => {
      await expect(
        findGitHubLedger({ fetch: mirrored(["trial"], false) }),
      ).rejects.toThrow("genesis.txt를 받지 못했습니다");
      await expect(findGitHubLedger({ fetch: mirrored([]) })).rejects.toThrow(
        `장부 ${id}의 JSON 사본이 아직 없습니다`,
      );
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
    const registrations = await registerKeys(keys, prev);
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

describe("운영 기록이 실린 공개 장부(docs/36 11-12)", () => {
  async function opsLedger(serverKeyOf: (seal: Uint8Array) => Uint8Array) {
    const seal = await generateSigner();
    const [director] = await signers(1);
    const d = director as NonNullable<typeof director>;
    const op = await signAsSeal(
      {
        v: OP_VERSION,
        kind: "director-add",
        after: genesisHash(SCHEDULE),
        effectiveRound: 26,
        credentialId: d.credentialId,
        pub: d.publicKey,
      },
      seal,
    );
    const record = closeRound({
      schedule: SCHEDULE,
      round: 1,
      prev: genesisHash(SCHEDULE),
      tickets: [],
      rootLoggedAt: closesAt + 10,
      beacon: {
        round: drandRoundForClose(closesAt),
        signature: new Uint8Array(48).fill(7),
      },
      operations: [op],
    });
    const result = await checkServerLedger({
      base: "",
      anchorRepo: null,
      beaconVerifier: () => true,
      fetch: files((f) => {
        f["/ledger/head.json"] = {
          v: 1,
          rounds: 1,
          head: toHex(recordHash(record)),
          sealed: 1,
          serverKey: toBase64Url(serverKeyOf(seal.publicKey)),
        };
        f["/ledger/seals/000001.json"] = {
          v: 1,
          round: 1,
          digest: toHex(sealDigest(record)),
          loggedAt: record.rootLoggedAt,
        };
        f["/ledger/rounds/000001.json"] = {
          v: 1,
          record: toBase64Url(encodeRecord(record)),
          tickets: [],
          registrations: [],
        };
      }),
    });
    return { result, director: d };
  }

  it("관인 지정 기록은 국장 열쇠 내력에 지문과 함께 보이고, 관인이 head.json 서버 열쇠와 같으면 통과", async () => {
    const { result, director } = await opsLedger((k) => k);
    expect(result.problems).toEqual([]);
    expect(statusOf(result.items)["seal-key"]).toBe("pass");
    expect(statusOf(result.items).operations).toBe("pass");
    expect(result.directors).toEqual([
      {
        round: 1,
        action: "지정",
        fingerprint: directorFingerprint(director.publicKey),
        signedBy: "관인",
        effectiveRound: 26,
        status: "pending",
        cancelledIn: null,
      },
    ]);
  });

  it("장부의 관인이 head.json의 서버 열쇠와 다르면 실패", async () => {
    const other = (await generateSigner()).publicKey;
    const { result } = await opsLedger(() => other);
    expect(statusOf(result.items)["seal-key"]).toBe("fail");
  });
});

describe("장부 받기 — 묶음 파일과 낱개", () => {
  // 회차 n의 파일(모양만 본다: 받는 순서·조각 나누기 시험)
  const roundFile = (n: number) => ({
    v: 1,
    record: `r${n}`,
    tickets: [],
    registrations: [],
  });
  const sealFile = (n: number) => ({
    v: 1,
    round: n,
    digest: `d${n}`,
    loggedAt: n,
  });
  const bundle = (size: number, first: number) => ({
    v: 1,
    first,
    size,
    rounds: Array.from({ length: size }, (_, i) => roundFile(first + i)),
    seals: Array.from({ length: size }, (_, i) => sealFile(first + i)),
  });
  /** rounds개 회차가 닫힌 서버. withBundles면 다 찬 묶음을 함께 낸다 */
  function server(rounds: number, withBundles: boolean) {
    const files = new Map<string, unknown>();
    for (let n = 1; n <= rounds; n++) {
      files.set(roundFilePath(n), roundFile(n));
      files.set(sealFilePath(n), sealFile(n));
    }
    if (withBundles)
      for (const size of BUNDLE_SIZES)
        for (let first = 1; first + size - 1 <= rounds; first += size)
          files.set(bundleFilePath(size, first), bundle(size, first));
    const asked: string[] = [];
    const f = (async (url: string) => {
      asked.push(url);
      const body = files.get(url);
      return body === undefined
        ? new Response("없음", { status: 404 })
        : Response.json(body);
    }) as unknown as typeof fetch;
    return { f, asked, files };
  }

  it("큰 묶음부터 나누고, 맞지 않는 끝은 낱개로", () => {
    expect(ledgerPieces(1, 123)).toEqual([
      { first: 1, size: 100 },
      { first: 101, size: 10 },
      { first: 111, size: 10 },
      { first: 121, size: 1 },
      { first: 122, size: 1 },
      { first: 123, size: 1 },
    ]);
    // 중간부터(화면이 새로 닫힌 회차만 받을 때)는 경계가 맞는 곳만 묶음
    expect(ledgerPieces(5, 21).map((p) => p.size)).toEqual([
      1, 1, 1, 1, 1, 1, 10, 1,
    ]);
    expect(ledgerPieces(3, 2)).toEqual([]);
  });

  it("묶음이 있으면 묶음으로 받아 요청 수가 줄고, 결과는 낱개와 같다", async () => {
    const bundled = server(123, true);
    const single = server(123, false);
    const a = await loadRoundFiles("", bundled.f, 1, 123, { seals: true });
    const b = await loadRoundFiles("", single.f, 1, 123, { seals: true });
    expect(a).toEqual(b);
    expect(a.map((x) => x.seal?.round)).toEqual(
      Array.from({ length: 123 }, (_, i) => i + 1),
    );
    // 묶음 3개 + 낱개 3회차(회차·봉인 2개씩)
    expect(bundled.asked).toHaveLength(9);
    // 묶음을 내지 않는 서버: 묶음을 한 번씩 물어보고(404) 낱개로
    expect(single.asked).toHaveLength(3 + 123 * 2);
  });

  it("화면처럼 봉인 없이 받으면 낱개는 회차 파일만 받는다", async () => {
    const s = server(12, true);
    const out = await loadRoundFiles("", s.f, 1, 12);
    expect(out.map((x) => x.round.record)).toEqual(
      Array.from({ length: 12 }, (_, i) => `r${i + 1}`),
    );
    expect(out.every((x) => x.seal === undefined)).toBe(true);
    expect(s.asked.sort()).toEqual(
      [bundleFilePath(10, 1), roundFilePath(11), roundFilePath(12)].sort(),
    );
  });

  it("묶음의 모양이 틀리면(다른 구간) 멈춘다", async () => {
    const s = server(10, true);
    s.files.set(bundleFilePath(10, 1), bundle(10, 11));
    await expect(loadRoundFiles("", s.f, 1, 10)).rejects.toThrow(
      "모양이 맞지 않습니다",
    );
  });

  it("서버가 계속 막으면 쉬운 말로 알린다", async () => {
    const f = (async () =>
      new Response("", {
        status: 429,
        headers: { "retry-after": "0" },
      })) as unknown as typeof fetch;
    await expect(loadPublicLedger("", f)).rejects.toThrow(
      "/ledger/genesis.json를 받지 못했습니다. 서버가 요청이 많다며 잠시 막았습니다(429)",
    );
  });
});

describe("무효 회차를 따로 보인다(통과에 묻히지 않게)", () => {
  const rec = (round: number, isVoid: boolean) =>
    ({ round, void: isVoid }) as unknown as RoundRecord;
  const withLive: Schedule = {
    ...SCHEDULE,
    entries: [
      ...SCHEDULE.entries,
      {
        ...(SCHEDULE.entries[0] as Schedule["entries"][number]),
        fromRound: 3,
        phase: "live",
      },
    ],
  };

  it("무효 회차가 없으면 통과, 있으면 주의로 회차 목록과 정식 단계 회차를 적는다", async () => {
    expect(await voidRoundsItem([rec(1, false)], [[]], SCHEDULE)).toMatchObject(
      {
        status: "pass",
      },
    );
    expect(
      await voidRoundsItem(
        [rec(1, true), rec(2, false), rec(3, true)],
        [[], [], []],
        withLive,
      ),
    ).toMatchObject({
      status: "warn",
      detail: "2회: 1, 3 · 정식 단계 1회: 3",
    });
  });
});

describe("무효 회차를 결과보다 먼저 정하기(docs/36 11-20, 보안 표 O10)", () => {
  // 1회차를 운영자가 "봉인 증거를 못 받았다"며 무효로 닫은 장면
  const voided = { ...RECORD, void: true, rootLoggedAt: 0 } as RoundRecord;
  const drandRound = drandRoundForClose(closesAt);
  const tsa = new FakeTsa("tsa-a", () => RECORD.rootLoggedAt);
  const earlyFile = (genTime: number) => ({
    round: 1,
    digest: toHex(sealDigest(RECORD)),
    loggedAt: genTime,
    log: {
      kind: "tsa",
      tokens: [
        {
          tsa: "tsa-a",
          genTime,
          token: btoa(
            String.fromCharCode(
              ...tsa.stamp(sealImprint(sealDigest(RECORD)), genTime),
            ),
          ),
        },
      ],
    } satisfies TsaProof,
  });
  const check = (files: ReturnType<typeof earlyFile>[]) =>
    voidRoundsItem([voided], [[]], SCHEDULE, {
      earlySeals: async (round) => (round === 1 ? files : []),
      tsaAuthorities: [tsa.authority],
    });

  it("추첨 전에 받은 봉인 증거가 나오면 무효로 닫은 장부는 실패다(증거를 숨기고 결과를 본 뒤 무효)", async () => {
    expect(await check([earlyFile(closesAt + 10)])).toMatchObject({
      status: "fail",
      detail: "1회: 추첨 전에 봉인 증거(시각 인증)가 있었는데 무효로 닫혔다",
    });
  });

  it("drand 뒤에 찍힌 토큰이나 다른 봉인 값의 증거는 무효를 뒤집지 않는다(주의)", async () => {
    const late = drandTime(drandRound) + 1;
    expect((await check([earlyFile(late)])).status).toBe("warn");
    expect(
      (await check([{ ...earlyFile(closesAt + 10), digest: "00".repeat(32) }]))
        .status,
    ).toBe("warn");
  });

  it("무효가 아니었다면 나왔을 결과를 계산해, 1~3등이 있었으면 맨 앞에 적는다", async () => {
    const beacon = { round: drandRound, signature: new Uint8Array(48).fill(7) };
    const draw = drawNumbers(drawSeed(1, drandRandomness(beacon)));
    const winner = { numbers: draw.numbers } as Ticket;
    const item = await voidRoundsItem([voided], [[winner]], SCHEDULE, {
      beacon: async (r) => (r === drandRound ? beacon : null),
    });
    expect(item).toMatchObject({
      status: "warn",
      detail: "1회: 무효가 아니었다면 1등 1장 / 1회: 1",
    });
    const unknown = await voidRoundsItem([voided], [[winner]], SCHEDULE, {
      beacon: async () => null,
    });
    expect(unknown.detail).toContain(
      "있었을 결과를 계산하지 못한 회차(drand를 받지 못함): 1",
    );
  });
});
