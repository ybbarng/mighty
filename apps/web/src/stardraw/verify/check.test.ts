// @vitest-environment node
import {
  closeRound,
  drandRoundForClose,
  encodeRecord,
  genesisHash,
  recordHash,
  roundTimes,
  type Schedule,
  sealDigest,
  sealImprint,
  type TsaProof,
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";
import { FakeTsa } from "@mighty/stardraw-core/testing";
import { describe, expect, it } from "vitest";

import { checkServerLedger } from "./check";

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
    },
  ],
  ledger: "trial",
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
    "/ledger/genesis.json": { v: 1, schedule: SCHEDULE, carried: [] },
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
    return body === undefined
      ? new Response("없음", { status: 404 })
      : Response.json(body);
  }) as unknown as typeof fetch;
}

const statusOf = (items: { id: string; status: string }[]) =>
  Object.fromEntries(items.map((i) => [i.id, i.status]));

describe("장부 전체 검사(서버 공개 파일)", () => {
  it("정직한 장부는 모든 항목이 통과하고, 바깥 시각 증명만 건너뜀이다", async () => {
    const result = await checkServerLedger({
      base: "",
      fetch: files(),
      beaconVerifier: () => true,
    });
    expect(result.problems).toEqual([]);
    expect(result.mode).toBe("trial");
    const status = statusOf(result.items);
    expect(status.timestamp).toBe("skip");
    expect(
      result.items.filter((i) => i.id !== "timestamp").map((i) => i.status),
    ).toEqual(
      result.items.filter((i) => i.id !== "timestamp").map(() => "pass"),
    );
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
    Buffer.from(tsa.stamp(sealImprint(digest), genTime)).toString("base64");
  const withLog = (log: unknown, mode: "trial" | "live" = "trial") =>
    files((f) => {
      const seal = f["/ledger/seals/000001.json"] as Record<string, unknown>;
      seal.log = log;
      if (mode === "live") {
        const { ledger: _, ...live } = SCHEDULE;
        f["/ledger/genesis.json"] = { v: 1, schedule: live, carried: [] };
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

  it("증거가 없는 회차는 시험 운영이면 건너뜀, 정식이면 실패", async () => {
    expect((await timestamp(withLog({ kind: "local" })))?.status).toBe("skip");
    expect((await timestamp(withLog({ kind: "local" }, "live")))?.status).toBe(
      "fail",
    );
  });
});
