import { describe, expect, it } from "vitest";

import {
  anchorCommitMessage,
  anchorFile,
  anchorPath,
  githubAnchorVerifier,
  ledgerId,
  parseAnchorFile,
} from "./anchor";
import { toHex } from "./bytes";
import { genesisHash, recordHash } from "./record";
import { closeRound } from "./round";
import type { Schedule } from "./schedule";
import { HOURLY } from "./testing";
import { verifyLedger } from "./verify";

const TRIAL: Schedule = { ...HOURLY, ledger: "trial" };

/** 응모 없는 무효 회차 하나(로그 시각 0) — 앵커 비교에는 기록 해시만 필요하다 */
const record = closeRound({
  schedule: TRIAL,
  round: 1,
  prev: genesisHash(TRIAL),
  tickets: [],
  rootLoggedAt: 0,
  beacon: null,
});

/** raw.githubusercontent.com 흉내: 경로 → 본문 */
function fakeRaw(files: Record<string, string>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const prefix =
      "https://raw.githubusercontent.com/ybbarng/stardraw-ledger/trial/";
    const path = url.startsWith(prefix) ? url.slice(prefix.length) : "";
    const body = files[path];
    return body === undefined
      ? new Response("404: Not Found", { status: 404 })
      : new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("앵커 파일 형식", () => {
  it("장부 id는 처음 일정표 해시 앞 16자리이고, 경로는 장부마다 나뉜다", () => {
    const id = ledgerId(TRIAL);
    expect(id).toBe(toHex(genesisHash(TRIAL)).slice(0, 16));
    expect(anchorPath(id, 12)).toBe(`ledgers/${id}/000012.txt`);
    expect(ledgerId(HOURLY)).not.toBe(id);
  });

  it("본문을 쓰고 다시 읽으면 같다", () => {
    const entry = {
      ledger: ledgerId(TRIAL),
      round: 3,
      record: "ab".repeat(32),
      rekor: "71d4…",
    };
    expect(parseAnchorFile(anchorFile(entry))).toEqual(entry);
    expect(anchorCommitMessage(entry)).toBe(
      `하늘의 별 따기 3회 기록 abababababab (장부 ${entry.ledger})`,
    );
    expect(parseAnchorFile("다른 파일")).toBeNull();
  });
});

describe("앵커 확인(githubAnchorVerifier)", () => {
  const id = ledgerId(TRIAL);
  const path = anchorPath(id, 1);
  const good = anchorFile({
    ledger: id,
    round: 1,
    record: toHex(recordHash(record)),
    rekor: "-",
  });
  const verifierWith = (files: Record<string, string>) =>
    githubAnchorVerifier({
      repo: "ybbarng/stardraw-ledger",
      branch: "trial",
      genesis: TRIAL,
      fetchFn: fakeRaw(files),
    });

  it("같으면 통과, 다르면 문제, 없으면 건너뜀", async () => {
    expect(await verifierWith({ [path]: good })(record)).toBe(true);
    expect(
      await verifierWith({
        [path]: good.replace(/record \w+/, `record ${"00".repeat(32)}`),
      })(record),
    ).toBe(false);
    expect(await verifierWith({})(record)).toBeNull();
  });

  it("장부 검사에 넣으면 어긋남은 문제로, 없음은 건너뜀으로 남는다", async () => {
    const run = (files: Record<string, string>) =>
      verifyLedger(TRIAL, [record], [[]], [[]], {
        anchorVerifier: verifierWith(files),
      });
    expect((await run({ [path]: good })).problems).toEqual([]);
    const bad = await run({
      [path]: good.replace(/record \w+/, `record ${"00".repeat(32)}`),
    });
    expect(bad.problems.map((p) => p.message)).toContain(
      "기록 해시가 앵커 저장소의 기록과 다르다",
    );
    expect((await run({})).skipped).toContain("1회차: 앵커(기록 없음)");
  });
});
