import {
  anchorPath,
  genesisAnchorFile,
  ledgerId,
  parseAnchorFile,
  type RekorEntryProof,
  type RoundRecord,
  recordHash,
  rekorRootLogVerifier,
  type TsaProof,
  toHex,
  tsaRootLogVerifier,
  verifyLedger,
} from "@mighty/stardraw-core";
import { FakeTsa } from "@mighty/stardraw-core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { outsideConfig } from "./config";
import {
  GitHubAnchor,
  type LogResult,
  RekorRootLog,
  TsaRootLog,
} from "./outside";
import {
  FakeGitHub,
  FakeRekor,
  makeRig,
  type Rig,
  readLedger,
  readSealLog,
  SCHEDULE,
  TEST_POW,
} from "./testing";

let rig: Rig | undefined;
afterEach(() => {
  rig?.close();
  rig = undefined;
});

/** 주소로 가짜 기관을 고른다 */
const fetchBy =
  (...fakes: FakeTsa[]): typeof fetch =>
  (input, init) => {
    const fake = fakes.find((f) => String(input) === f.authority.url);
    return fake
      ? fake.fetch(input, init)
      : Promise.reject(new Error("모르는 주소"));
  };

const env = (values: Record<string, string>) => (name: string) => values[name];

describe("바깥 기록 설정(outsideConfig)", () => {
  it("시각 인증: 기본은 DigiCert·Sectigo 중 1곳 이상, 단계와 상관없이 켠다", () => {
    const tsa = outsideConfig(env({})).tsa;
    expect(tsa?.authorities.map((a) => a.name)).toEqual([
      "digicert",
      "sectigo",
    ]);
    expect(tsa?.minValid).toBe(1);
    const three = outsideConfig(
      env({ STARDRAW_TSA: "digicert,sectigo,freetsa", STARDRAW_TSA_MIN: "2" }),
    ).tsa;
    expect(three?.authorities.length).toBe(3);
    expect(three?.minValid).toBe(2);
    expect(outsideConfig(env({ STARDRAW_TSA: "off" })).tsa).toBeNull();
    expect(() =>
      outsideConfig(env({ STARDRAW_TSA: "digicert,example" })),
    ).toThrow(/example/);
    expect(() => outsideConfig(env({ STARDRAW_TSA_MIN: "3" }))).toThrow(
      /STARDRAW_TSA_MIN/,
    );
  });

  it("Rekor(꺼 둔 선택지): 시각 인증을 끈 때만, 열쇠를 고정한 로그만", () => {
    const off = { STARDRAW_TSA: "off" };
    expect(
      outsideConfig(
        env({ ...off, STARDRAW_REKOR_URL: "https://rekor.sigstage.dev" }),
      ).rekor,
    ).toEqual({ url: "https://rekor.sigstage.dev" });
    expect(() =>
      outsideConfig(
        env({ ...off, STARDRAW_REKOR_URL: "https://rekor.example" }),
      ),
    ).toThrow();
    expect(() =>
      outsideConfig(env({ STARDRAW_REKOR_URL: "https://rekor.sigstage.dev" })),
    ).toThrow(/STARDRAW_TSA=off/);
    expect(outsideConfig(env({})).rekor).toBeNull();
  });

  it("앵커: 저장소와 토큰이 둘 다 있을 때만", () => {
    expect(
      outsideConfig(
        env({
          STARDRAW_ANCHOR_REPO: "ybbarng/stardraw-ledger",
          STARDRAW_ANCHOR_TOKEN: "t",
        }),
      ).github,
    ).toEqual({ repo: "ybbarng/stardraw-ledger", token: "t" });
    expect(
      outsideConfig(env({ STARDRAW_ANCHOR_REPO: "ybbarng/stardraw-ledger" }))
        .github,
    ).toBeNull();
  });
});

describe("공개 시각 인증(가짜 기관)", () => {
  const authorities = (a: FakeTsa, b: FakeTsa) => [a.authority, b.authority];

  it("두 기관에 동시에 묻고, 장부의 증거를 검사기가 확인한다(가장 이른 시각이 봉인 시각)", async () => {
    let fakes: [FakeTsa, FakeTsa] | undefined;
    rig = await makeRig({
      rootLog: (_key, clock) => {
        const now = () => Math.floor(clock.now() / 1000);
        const a = new FakeTsa("tsa-a", now);
        const b = new FakeTsa("tsa-b", now);
        b.shift = 2;
        fakes = [a, b];
        return new TsaRootLog(authorities(a, b), 2, fetchBy(a, b));
      },
    });
    await rig.finish(1);
    const [a, b] = fakes as [FakeTsa, FakeTsa];
    const ledger = readLedger(rig.dir);
    const proof = readSealLog(rig.dir, 1) as TsaProof;
    expect(proof.tokens.map((t) => t.tsa)).toEqual(["tsa-a", "tsa-b"]);
    const record = ledger.records[0] as RoundRecord;
    expect(record.rootLoggedAt).toBe(proof.tokens[0]?.genTime);
    expect(record.void).toBe(false);

    const check = (p: TsaProof, minValid = 2) =>
      verifyLedger(
        ledger.genesis,
        ledger.records,
        ledger.tickets,
        ledger.registrations,
        {
          beaconVerifier: () => true,
          powParams: TEST_POW,
          rootLogVerifier: tsaRootLogVerifier(() => p, {
            minValid,
            authorities: authorities(a, b),
          }),
        },
      );
    expect((await check(proof)).problems).toEqual([]);
    // 늦은 쪽 토큰만 남기면 봉인 시각이 기록과 달라진다
    const later = { ...proof, tokens: proof.tokens.slice(1) };
    expect((await check(later, 1)).problems.map((p) => p.message)).toContain(
      "머클 루트의 투명성 로그 기록을 확인할 수 없다",
    );
  });

  it("한 곳이 실패하거나 틀린 토큰을 주면 최소 수에 따라 다시 시도한다", async () => {
    const t = 1793324472; // 2026-10-30
    const a = new FakeTsa("tsa-a", () => t);
    const b = new FakeTsa("tsa-b", () => t + 1);
    const digest = new Uint8Array(32).fill(7);
    const logs: string[] = [];
    const two = new TsaRootLog(authorities(a, b), 2, fetchBy(a, b), (m) =>
      logs.push(m),
    );
    b.status = 503;
    expect(await two.log(digest)).toBeNull();
    b.status = 200;
    b.wrongImprint = true;
    expect(await two.log(digest)).toBeNull();
    expect(logs.join("\n")).toMatch(/tsa-b 시각 인증 실패: HTTP 503/);
    expect(logs.join("\n")).toMatch(/tsa-b 시각 인증 토큰 확인 실패/);
    // 한 곳이면 되는 설정은 a만으로 성공
    const one = new TsaRootLog(authorities(a, b), 1, fetchBy(a, b));
    const got = (await one.log(digest)) as LogResult;
    expect(got.loggedAt).toBe(t);
    expect((got.proof as TsaProof).tokens.map((k) => k.tsa)).toEqual(["tsa-a"]);
    b.wrongImprint = false;
    expect((await two.log(digest))?.loggedAt).toBe(t);
    expect(() => new TsaRootLog(authorities(a, b), 3)).toThrow();
  });

  it("기한(마감 3분 뒤)까지 못 받으면 무효로 닫고, drand보다 늦은 시각이면 무효다", async () => {
    let fake: FakeTsa | undefined;
    rig = await makeRig({
      rootLog: (_key, clock) => {
        fake = new FakeTsa("tsa-a", () => Math.floor(clock.now() / 1000));
        fake.status = 503;
        return new TsaRootLog([fake.authority], 1, fake.fetch);
      },
    });
    await rig.finish(1);
    expect(readLedger(rig.dir).records[0]?.void).toBe(true);
    expect(rig.logs.join("\n")).toMatch(/무효로 닫는다/);
    // 토큰은 오지만 시각이 drand 뒤
    const f = fake as FakeTsa;
    f.status = 200;
    f.shift = 3600;
    await rig.finish(2);
    const r2 = readLedger(rig.dir).records[1] as RoundRecord;
    expect(r2.rootLoggedAt).toBeGreaterThan(0);
    expect(r2.void).toBe(true);
  });
});

describe("Rekor 투명성 로그(꺼 둔 선택지, 가짜 Rekor)", () => {
  it("봉인 값을 올리고, 장부의 증거로 검사기가 확인한다(시각을 바꾸면 드러난다)", async () => {
    let rekor: FakeRekor | undefined;
    rig = await makeRig({
      rootLog: (serverKey, clock) => {
        rekor ??= undefined;
        return {
          log: async (digest) => {
            rekor ??= await FakeRekor.create(() =>
              Math.floor(clock.now() / 1000),
            );
            return new RekorRootLog(rekor.log, serverKey, rekor.fetch).log(
              digest,
            );
          },
        };
      },
    });
    await rig.finish(1);
    const ledger = readLedger(rig.dir);
    const proof = readSealLog(rig.dir, 1) as RekorEntryProof;
    expect(proof.kind).toBe("rekor");
    expect(ledger.records[0]?.rootLoggedAt).toBe(proof.integratedTime);

    const check = (p: RekorEntryProof) =>
      verifyLedger(
        ledger.genesis,
        ledger.records,
        ledger.tickets,
        ledger.registrations,
        {
          beaconVerifier: () => true,
          powParams: TEST_POW,
          rootLogVerifier: rekorRootLogVerifier(() => p, {
            serverPublicKey: rig?.serverKey.publicKey as Uint8Array,
            logs: [(rekor as FakeRekor).log],
          }),
        },
      );
    expect((await check(proof)).problems).toEqual([]);
    const moved = { ...proof, integratedTime: proof.integratedTime - 1 };
    expect((await check(moved)).problems.map((p) => p.message)).toContain(
      "머클 루트의 투명성 로그 기록을 확인할 수 없다",
    );
  });

  it("Rekor가 실패하거나 응답이 틀리면 장부에 남기지 않고 다시 시도한다", async () => {
    const rekor = await FakeRekor.create(() => 1);
    rig = await makeRig();
    const log = new RekorRootLog(rekor.log, rig.serverKey, rekor.fetch);
    const digest = new Uint8Array(32).fill(7);
    rekor.status = 500;
    expect(await log.log(digest)).toBeNull();
    rekor.status = 201;
    rekor.tamperSet = true;
    expect(await log.log(digest)).toBeNull();
    rekor.tamperSet = false;
    expect((await log.log(digest))?.loggedAt).toBe(1);
  });

  it("공개 열쇠를 고정해 두지 않은 주소는 쓰지 않는다", async () => {
    rig = await makeRig();
    expect(
      () => new RekorRootLog("https://rekor.example", rig?.serverKey as never),
    ).toThrow();
  });
});

describe("GitHub 앵커(가짜 GitHub)", () => {
  const entry = {
    ledger: "0123456789abcdef",
    round: 3,
    record: "ab".repeat(32),
    seal: "-",
  };
  const anchorOf = (gh: FakeGitHub) =>
    new GitHubAnchor("ybbarng/stardraw-ledger", "test-token", gh.fetch);

  it("회차 파일을 그 브랜치에 커밋하고, 이미 같은 내용이 있으면 성공으로 본다", async () => {
    const gh = new FakeGitHub();
    const anchor = anchorOf(gh);
    await anchor.anchor(entry, "trial");
    const path = anchorPath(entry.ledger, 3);
    expect(parseAnchorFile(gh.text("trial", path) ?? "")).toEqual(entry);
    expect(gh.text("main", path)).toBeUndefined();
    expect(gh.sawAuth).toBe(true);
    await anchor.anchor(entry, "trial"); // 응답을 잃고 다시 보낸 경우
    await expect(
      anchor.anchor({ ...entry, record: "cd".repeat(32) }, "trial"),
    ).rejects.toThrow(/다른 내용/);
  });

  it("처음 일정표는 main의 genesis.txt에 한 번, 다른 장부가 있으면 거절(다시 시작하지 않는다)", async () => {
    const gh = new FakeGitHub();
    const anchor = anchorOf(gh);
    const genesis = {
      ...SCHEDULE,
      entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
    };
    await anchor.anchorGenesis(genesis);
    expect(gh.text("main", "genesis.txt")).toBe(genesisAnchorFile(genesis));
    await anchor.anchorGenesis(genesis);
    await expect(
      anchor.anchorGenesis({ ...genesis, epoch: genesis.epoch + 3600 }),
    ).rejects.toThrow(/다른 내용/);
  });

  it("서버는 처음 일정표와 닫힌 회차를 차례로 남기고, 실패하면 1분 뒤 그 회차부터 다시 보낸다(회차 진행은 막지 않는다)", async () => {
    const gh = new FakeGitHub();
    gh.failures = Number.POSITIVE_INFINITY; // GitHub가 멈춰 있다
    rig = await makeRig({ anchor: anchorOf(gh) });
    await rig.finish(1);
    await rig.engine.anchorIdle();
    expect(rig.store.genesisAnchored()).toBe(false);
    expect(rig.store.anchored()).toBe(0);
    await rig.finish(2); // 앵커 실패와 상관없이 다음 회차도 닫힌다
    expect(rig.engine.state().records).toBe(2);
    gh.failures = 0; // 되살아났다
    await rig.at(rig.engine.now() + 61);
    await rig.engine.anchorIdle();
    expect(rig.store.genesisAnchored()).toBe(true);
    expect(rig.store.anchored()).toBe(2);
    const id = ledgerId(rig.engine.genesis);
    const record2 = rig.store.record(2);
    // 단계가 없는 일정표의 회차는 main
    expect(
      parseAnchorFile(gh.text("main", anchorPath(id, 2)) ?? "")?.record,
    ).toBe(toHex(recordHash(record2 as never)));
  });
});
