import {
  anchorPath,
  ledgerId,
  parseAnchorFile,
  type RekorEntryProof,
  recordHash,
  rekorRootLogVerifier,
  toHex,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { outsideConfig } from "./config";
import { GitHubAnchor, RekorRootLog } from "./outside";
import {
  FakeGitHub,
  FakeRekor,
  makeRig,
  type Rig,
  readLedger,
  readSealLog,
  TEST_POW,
} from "./testing";

let rig: Rig | undefined;
afterEach(() => {
  rig?.close();
  rig = undefined;
});

const env = (values: Record<string, string>) => (name: string) => values[name];

describe("바깥 기록 설정(outsideConfig)", () => {
  it("Rekor: 시험 운영은 시험용 로그만, 정식은 실제 로그만", () => {
    expect(
      outsideConfig(
        "trial",
        env({ STARDRAW_REKOR_URL: "https://rekor.sigstage.dev" }),
      ).rekor,
    ).toEqual({ url: "https://rekor.sigstage.dev" });
    expect(() =>
      outsideConfig(
        "trial",
        env({ STARDRAW_REKOR_URL: "https://rekor.sigstore.dev" }),
      ),
    ).toThrow();
    expect(() =>
      outsideConfig(
        "live",
        env({ STARDRAW_REKOR_URL: "https://rekor.sigstage.dev" }),
      ),
    ).toThrow();
    expect(() =>
      outsideConfig(
        "live",
        env({ STARDRAW_REKOR_URL: "https://rekor.example" }),
      ),
    ).toThrow();
    expect(outsideConfig("live", env({})).rekor).toBeNull();
  });

  it("앵커: 저장소와 토큰이 둘 다 있을 때만, 브랜치 기본은 시험 trial·정식 main", () => {
    const both = {
      STARDRAW_ANCHOR_REPO: "ybbarng/stardraw-ledger",
      STARDRAW_ANCHOR_TOKEN: "t",
    };
    expect(outsideConfig("trial", env(both)).github?.branch).toBe("trial");
    expect(outsideConfig("live", env(both)).github?.branch).toBe("main");
    expect(
      outsideConfig("live", env({ ...both, STARDRAW_ANCHOR_BRANCH: "x" }))
        .github?.branch,
    ).toBe("x");
    expect(
      outsideConfig(
        "trial",
        env({ STARDRAW_ANCHOR_REPO: "ybbarng/stardraw-ledger" }),
      ).github,
    ).toBeNull();
  });
});

describe("Rekor 투명성 로그(가짜 Rekor)", () => {
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
    rekor: "-",
  };

  it("회차 파일을 커밋하고, 이미 같은 내용이 있으면 성공으로 본다", async () => {
    const gh = new FakeGitHub();
    const anchor = new GitHubAnchor(
      "ybbarng/stardraw-ledger",
      "trial",
      "test-token",
      gh.fetch,
    );
    await anchor.anchor(entry);
    expect(parseAnchorFile(gh.text(anchorPath(entry.ledger, 3)) ?? "")).toEqual(
      entry,
    );
    expect(gh.sawAuth).toBe(true);
    await anchor.anchor(entry); // 응답을 잃고 다시 보낸 경우
    await expect(
      anchor.anchor({ ...entry, record: "cd".repeat(32) }),
    ).rejects.toThrow(/다른 내용/);
  });

  it("서버는 닫힌 회차를 차례로 남기고, 실패하면 1분 뒤 그 회차부터 다시 보낸다(회차 진행은 막지 않는다)", async () => {
    const gh = new FakeGitHub();
    gh.failures = 1;
    rig = await makeRig({
      anchor: new GitHubAnchor(
        "ybbarng/stardraw-ledger",
        "trial",
        "test-token",
        gh.fetch,
      ),
    });
    await rig.finish(1);
    await rig.engine.anchorIdle();
    expect(rig.store.anchored()).toBe(0);
    await rig.finish(2); // 앵커 실패와 상관없이 다음 회차도 닫힌다
    expect(rig.engine.state().records).toBe(2);
    await rig.at(rig.engine.now() + 61);
    await rig.engine.anchorIdle();
    expect(rig.store.anchored()).toBe(2);
    const id = ledgerId(rig.engine.genesis);
    const record2 = rig.store.record(2);
    expect(parseAnchorFile(gh.text(anchorPath(id, 2)) ?? "")?.record).toBe(
      toHex(recordHash(record2 as never)),
    );
  });
});
