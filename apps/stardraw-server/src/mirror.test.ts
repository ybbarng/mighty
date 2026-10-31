import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anchorCommitMessage,
  anchorPath,
  earlySealPath,
  githubLedgerBase,
  ledgerId,
  ledgerMirrorPath,
  loadPublicLedger,
  recordHash,
  roundTimes,
  toHex,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubAnchor } from "./outside";
import { pad } from "./publish";
import { drawTimeOf, EPOCH, FakeGitHub, makeRig, type Rig } from "./testing";

/**
 * 장부 JSON 사본(docs/36 11-16): 회차 앵커 커밋에 서버가 공개한 장부 파일을 같은 바이트로 함께 올리고,
 * 빠진 지난 회차는 몇 커밋으로 묶어 채운다. 사본을 못 올려도 회차 진행과 앵커 파일은 막히지 않는다
 */

let rigs: Rig[] = [];
afterEach(() => {
  const open = rigs;
  rigs = [];
  for (const r of open) r.close();
});

const REPO = "ybbarng/stardraw-ledger";

async function rigWith(
  gh: FakeGitHub,
  rounds: number,
  options: { mirrorCommitBytes?: number } = {},
): Promise<Rig> {
  const rig = await makeRig({
    anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
    ...options,
  });
  rigs.push(rig);
  await rig.at(EPOCH + 10);
  for (let round = 1; round <= rounds; round++) await rig.finish(round);
  await rig.engine.anchorIdle();
  return rig;
}

/** 회차 앵커·사본 커밋(추첨 전 봉인 사본 커밋은 빼고 센다, docs/36 11-20) */
const anchorCommits = (gh: FakeGitHub) =>
  gh.commits.filter((c) => !c.paths.some((p) => p.includes("/early-seals/")));

/** 서버가 공개한 파일(장부 폴더 안 상대 경로) */
const served = (rig: Rig, path: string) =>
  readFileSync(join(rig.dir, "ledger", path), "utf8");

/** 가짜 GitHub의 브랜치를 raw 주소로 내준다 */
const rawFetch = (gh: FakeGitHub, branch: string, ledger: string) =>
  (async (input: string | URL | Request) => {
    const base = githubLedgerBase(REPO, branch, ledger);
    const url = String(input);
    const text = url.startsWith(base)
      ? gh.text(branch, `ledgers/${ledger}${url.slice(base.length)}`)
      : undefined;
    return text === undefined
      ? new Response("없음", { status: 404 })
      : new Response(text);
  }) as typeof fetch;

/** 서버의 장부 폴더를 /ledger/… 주소로 내준다 */
const servedFetch = (rig: Rig) =>
  (async (input: string | URL | Request) => {
    try {
      return new Response(served(rig, String(input).slice("/ledger/".length)));
    } catch {
      return new Response("없음", { status: 404 });
    }
  }) as typeof fetch;

describe("장부 JSON 사본", () => {
  it("회차마다 앵커 파일과 그 회차의 회차·봉인·묶음 파일, head를 커밋 하나에 같은 바이트로 올린다", async () => {
    const gh = new FakeGitHub();
    const rig = await rigWith(gh, 10);
    const id = ledgerId(rig.engine.genesis);
    const at = (path: string) => gh.text("main", ledgerMirrorPath(id, path));

    expect(at("genesis.json")).toBe(served(rig, "genesis.json"));
    for (let n = 1; n <= 10; n++) {
      expect(at(`rounds/${pad(n)}.json`)).toBe(
        served(rig, `rounds/${pad(n)}.json`),
      );
      expect(at(`seals/${pad(n)}.json`)).toBe(
        served(rig, `seals/${pad(n)}.json`),
      );
    }
    expect(at("bundles/10/000001.json")).toBe(
      served(rig, "bundles/10/000001.json"),
    );
    const record = rig.store.record(10);
    expect(JSON.parse(at("head.json") ?? "")).toEqual({
      v: 1,
      rounds: 10,
      head: toHex(recordHash(record as never)),
      sealed: 10,
      serverKey: JSON.parse(served(rig, "head.json")).serverKey,
    });

    // 처음 일정표(Contents API) 다음은 회차마다 커밋 하나
    const rounds = anchorCommits(gh).slice(1);
    expect(rounds).toHaveLength(10);
    expect(rounds[0]?.paths.sort()).toEqual(
      [
        anchorPath(id, 1),
        ...[
          "genesis.json",
          "rounds/000001.json",
          "seals/000001.json",
          "head.json",
        ].map((p) => ledgerMirrorPath(id, p)),
      ].sort(),
    );
    expect(rounds[9]?.message).toBe(
      anchorCommitMessage({
        ledger: id,
        round: 10,
        record: toHex(recordHash(record as never)),
        seal: "-",
      }),
    );
    expect(rounds[9]?.paths).toContain(
      ledgerMirrorPath(id, "bundles/10/000001.json"),
    );
    expect(rig.store.mirrored("main")).toBe(10);

    // 받는 쪽은 기준 주소만 바꾸면 서버와 같은 장부를 얻는다
    const fromGitHub = await loadPublicLedger(
      githubLedgerBase(REPO, "main", id),
      rawFetch(gh, "main", id),
    );
    const fromServer = await loadPublicLedger("", servedFetch(rig));
    expect(fromGitHub.records).toEqual(fromServer.records);
    expect(fromGitHub.seals).toEqual(fromServer.seals);
    expect(fromGitHub.genesis).toEqual(fromServer.genesis);
  });

  it("사본을 올리지 못해도 회차는 닫히고 앵커 파일은 남는다. 다시 띄우면 빠진 사본을 몇 커밋으로 묶어 채운다", async () => {
    const gh = new FakeGitHub();
    gh.treeFailures = Number.POSITIVE_INFINITY; // 트리 API가 막혀 있다(사본을 올리기 전 판과 같은 상태)
    const first = await rigWith(gh, 12);
    const id = ledgerId(first.engine.genesis);
    expect(first.engine.state().records).toBe(12);
    expect(first.store.anchored()).toBe(12);
    expect(first.store.mirrored("main")).toBe(0);
    expect(gh.text("main", anchorPath(id, 12))).toBeDefined();
    expect(gh.text("main", ledgerMirrorPath(id, "head.json"))).toBeUndefined();
    expect(first.logs.some((l) => l.includes("장부 사본을 올리지 못해"))).toBe(
      true,
    );

    // 고친 판으로 같은 데이터 폴더를 다시 띄운다(커밋 하나에 약 5회차)
    gh.treeFailures = 0;
    first.store.close();
    rigs = rigs.filter((r) => r !== first);
    const bytes = served(first, "seals/000001.json").length * 5;
    const again = await makeRig({
      dir: first.dir,
      at: first.clock.now() / 1000,
      anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
      mirrorCommitBytes: bytes,
    });
    rigs.push(again);
    const before = anchorCommits(gh).length;
    await again.at(again.clock.now() / 1000 + 1);
    await again.engine.anchorIdle();
    expect(again.store.mirrored("main")).toBe(12);
    const fills = anchorCommits(gh).slice(before);
    expect(fills.length).toBeGreaterThan(1);
    expect(fills.length).toBeLessThan(12);
    // 빈틈없이 이어지는 구간
    const ranges = fills.map((c) => {
      const m = /장부 파일 (\d+)(?:~(\d+))?회/.exec(c.message);
      return [Number(m?.[1]), Number(m?.[2] ?? m?.[1])];
    });
    expect(ranges[0]?.[0]).toBe(1);
    expect(ranges.at(-1)?.[1]).toBe(12);
    for (let i = 1; i < ranges.length; i++)
      expect(ranges[i]?.[0]).toBe((ranges[i - 1]?.[1] ?? 0) + 1);
    for (let n = 1; n <= 12; n++)
      expect(
        gh.text("main", ledgerMirrorPath(id, `rounds/${pad(n)}.json`)),
      ).toBe(served(again, `rounds/${pad(n)}.json`));
    expect(
      JSON.parse(gh.text("main", ledgerMirrorPath(id, "head.json")) ?? "")
        .rounds,
    ).toBe(12);

    // 다음 회차는 다시 앵커와 같은 커밋에
    await again.finish(13);
    await again.engine.anchorIdle();
    expect(anchorCommits(gh).at(-1)?.paths).toContain(anchorPath(id, 13));
    expect(anchorCommits(gh).at(-1)?.paths).toContain(
      ledgerMirrorPath(id, "rounds/000013.json"),
    );
    expect(again.store.mirrored("main")).toBe(13);
  });
});

describe("추첨 전 봉인 사본(docs/36 11-20)", () => {
  it("봉인하자마자 drand 전에 봉인 파일을 같은 바이트로 올리고, 회차가 닫혀도 고치지 않는다", async () => {
    const gh = new FakeGitHub();
    const rig = await makeRig({
      anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
    });
    rigs.push(rig);
    const id = ledgerId(rig.engine.genesis);
    const { closesAt } = roundTimes(rig.engine.schedule(), 1);
    await rig.at(closesAt);
    await rig.engine.earlySealIdle();
    await rig.engine.anchorIdle();
    const early = gh.text("main", earlySealPath(id, 1));
    expect(early).toBe(served(rig, "seals/000001.json"));
    await rig.finish(1);
    await rig.engine.anchorIdle();
    expect(gh.text("main", earlySealPath(id, 1))).toBe(early);
    expect(rig.store.earlySealed()).toBe(1);
  });

  it("추첨 시각이 지난 뒤에야 봉인한 회차는 올리지 않는다(올려도 증거가 못 된다)", async () => {
    const gh = new FakeGitHub();
    const rig = await makeRig({
      anchor: new GitHubAnchor(REPO, "test-token", gh.fetch),
    });
    rigs.push(rig);
    const id = ledgerId(rig.engine.genesis);
    await rig.at(drawTimeOf(1));
    await rig.engine.earlySealIdle();
    await rig.engine.anchorIdle();
    expect(gh.text("main", earlySealPath(id, 1))).toBeUndefined();
    expect(rig.store.earlySealed()).toBe(1);
  });
});
