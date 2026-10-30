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
  toBase64Url,
  toHex,
} from "@mighty/stardraw-core";
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
  it("정직한 장부는 모든 항목이 통과하고, 바깥 증명(Rekor)만 건너뜀이다", async () => {
    const result = await checkServerLedger({
      base: "",
      fetch: files(),
      beaconVerifier: () => true,
    });
    expect(result.problems).toEqual([]);
    expect(result.mode).toBe("trial");
    const status = statusOf(result.items);
    expect(status.rekor).toBe("skip");
    expect(
      result.items.filter((i) => i.id !== "rekor").map((i) => i.status),
    ).toEqual(result.items.filter((i) => i.id !== "rekor").map(() => "pass"));
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
