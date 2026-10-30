import { describe, expect, it } from "vitest";

import {
  anchorBranch,
  anchorCommitMessage,
  anchorFile,
  anchorPath,
  genesisAnchorFile,
  githubAnchorVerifier,
  githubGenesisVerifier,
  ledgerId,
  parseAnchorFile,
  sealLogId,
} from "./anchor";
import { toHex } from "./bytes";
import { genesisHash, recordHash } from "./record";
import { closeRound } from "./round";
import { type Schedule, type ScheduleEntry, withChange } from "./schedule";
import { HOURLY } from "./testing";
import { verifyLedger } from "./verify";

const TRIAL: Schedule = {
  ...HOURLY,
  entries: HOURLY.entries.map((e) => ({ ...e, phase: "trial" as const })),
};

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
    // 키: "브랜치/경로"
    const prefix = "https://raw.githubusercontent.com/ybbarng/stardraw-ledger/";
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
      seal: "tsa:digicert@1793324472",
    };
    expect(parseAnchorFile(anchorFile(entry))).toEqual(entry);
    expect(anchorCommitMessage(entry)).toBe(
      `하늘의 별 따기 3회 기록 abababababab (장부 ${entry.ledger})`,
    );
    expect(parseAnchorFile("다른 파일")).toBeNull();
  });

  it("seal 줄은 봉인 증거를 한 줄로 줄인 것", () => {
    expect(
      sealLogId({
        kind: "tsa",
        tokens: [
          { tsa: "digicert", genTime: 1793324472, token: "…" },
          { tsa: "sectigo", genTime: 1793324474, token: "…" },
        ],
      }),
    ).toBe("tsa:digicert@1793324472,sectigo@1793324474");
    expect(sealLogId({ kind: "rekor", uuid: "71d4" })).toBe("rekor:71d4");
    expect(sealLogId({ kind: "local", digest: "00" })).toBe("-");
    expect(sealLogId(null)).toBe("-");
  });
});

describe("앵커 확인(githubAnchorVerifier)", () => {
  const id = ledgerId(TRIAL);
  const path = `trial/${anchorPath(id, 1)}`;
  const good = anchorFile({
    ledger: id,
    round: 1,
    record: toHex(recordHash(record)),
    seal: "-",
  });
  const verifierWith = (files: Record<string, string>) =>
    githubAnchorVerifier({
      repo: "ybbarng/stardraw-ledger",
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

  it("브랜치는 회차의 단계로 정한다: 시험 trial, 정식 main", async () => {
    const live = withChange(TRIAL, {
      ...(TRIAL.entries[0] as ScheduleEntry),
      fromRound: 30,
      phase: "live",
    });
    expect(anchorBranch(live, 29)).toBe("trial");
    expect(anchorBranch(live, 30)).toBe("main");
    expect(anchorBranch(HOURLY, 1)).toBe("main");
    // 시험 회차 파일을 main에 두면 찾지 못한다
    expect(
      await verifierWith({ [`main/${anchorPath(id, 1)}`]: good })(record),
    ).toBeNull();
  });
});

describe("처음 일정표 앵커(githubGenesisVerifier)", () => {
  const verifier = (files: Record<string, string>) =>
    githubGenesisVerifier({
      repo: "ybbarng/stardraw-ledger",
      fetchFn: fakeRaw(files),
    });
  const file = { "main/genesis.txt": genesisAnchorFile(TRIAL) };

  it("main의 genesis.txt와 같으면 통과, 다시 시작한 장부는 문제, 없으면 건너뜀", async () => {
    expect(genesisAnchorFile(TRIAL)).toBe(
      `stardraw-genesis v1\nledger ${ledgerId(TRIAL)}\ngenesis ${toHex(genesisHash(TRIAL))}\nepoch ${TRIAL.epoch}\n`,
    );
    const restarted: Schedule = { ...TRIAL, epoch: TRIAL.epoch + 3600 };
    const run = (g: Schedule, files: Record<string, string>) =>
      verifyLedger(g, [], [], [], { genesisAnchorVerifier: verifier(files) });
    expect((await run(TRIAL, file)).problems).toEqual([]);
    expect((await run(restarted, file)).problems.map((p) => p.message)).toEqual(
      ["처음 일정표: 앵커 저장소의 장부와 다르다(장부를 다시 시작했다)"],
    );
    expect((await run(TRIAL, {})).skipped).toEqual([
      "앵커의 처음 일정표(기록 없음)",
    ]);
  });
});
