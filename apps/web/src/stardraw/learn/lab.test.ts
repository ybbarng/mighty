// @vitest-environment node
import {
  drawNumbers,
  drawSeed,
  fromHex,
  generateSigner,
  inclusionProof,
  merkleRoot,
  passkeySigner,
  signTicket,
  sortLeaves,
  toHex,
  unsignedTicket,
  verifyInclusion,
  verifyTicketSignature,
  verifyTimestampToken,
} from "@mighty/stardraw-core";
import {
  FIXTURE_IMPRINT,
  FIXTURE_TOKENS,
} from "@mighty/stardraw-core/tsa-fixtures";
import { describe, expect, it } from "vitest";

import { ATTACKS, buildWorld, honestCheck } from "./attacks";
import {
  anchorRepoFor,
  buildChain,
  buildTree,
  CHAIN_EPOCH,
  chainSchedule,
  checkChain,
  createDemoPasskey,
  demoAssertion,
  entryTicketId,
  fromBase64,
  MERKLE_ENTRIES,
  proofNodes,
  readAssertion,
  relink,
  rpIdAllowed,
  SITE,
  SITE_ORIGIN,
  shiftTokenTime,
  tamperRecord,
  traceDraw,
  tryExportPrivateKey,
  writeRoundAnchors,
} from "./lab";

describe("흉내 패스키", () => {
  it("비밀 열쇠는 꺼낼 수 없고, 진짜 주소에서 한 서명만 통과한다", async () => {
    const pk = await createDemoPasskey();
    expect(await tryExportPrivateKey(pk.privateKey)).toBe("InvalidAccessError");
    const signer = (where: { origin: string; rpId: string }) =>
      passkeySigner(pk.publicKey, (c) => demoAssertion(pk, c, where));
    const unsigned = unsignedTicket(pk, 3, [1, 2, 3, 4, 5, 6]);

    const real = await signTicket(
      signer({ origin: SITE_ORIGIN, rpId: SITE }),
      unsigned,
      0,
    );
    expect(await verifyTicketSignature(real)).toBe(true);

    const phish = await signTicket(
      signer({ origin: "https://game-byb.kr", rpId: "game-byb.kr" }),
      unsigned,
      0,
    );
    expect(await verifyTicketSignature(phish)).toBe(false);
    if (phish.sig.kind !== "webauthn")
      throw new Error("패스키 서명이어야 한다");
    expect(readAssertion(phish.sig)).toMatchObject({
      origin: "https://game-byb.kr",
      rpIdMatches: false,
    });

    expect(rpIdAllowed(SITE_ORIGIN, SITE)).toBe(true);
    expect(rpIdAllowed("https://game-byb.kr", SITE)).toBe(false);
    expect(rpIdAllowed("https://game.byb.kr.example.net", SITE)).toBe(false);
  });
});

describe("머클 나무 그림", () => {
  it("그림의 뿌리와 형제 마디가 core의 루트·증명과 같다", () => {
    const ids = sortLeaves(
      MERKLE_ENTRIES.slice(0, 7).map((e) => entryTicketId(e)),
    );
    const tree = buildTree(ids);
    expect(toHex(tree?.hash ?? new Uint8Array())).toBe(toHex(merkleRoot(ids)));
    for (let i = 0; i < ids.length; i++) {
      const proof = inclusionProof(ids, i);
      const { siblings } = proofNodes(tree, i);
      expect(siblings.map((s) => toHex(s.hash)).reverse()).toEqual(
        proof.map(toHex),
      );
      expect(
        verifyInclusion(
          ids[i] as Uint8Array,
          i,
          ids.length,
          proof,
          merkleRoot(ids),
        ),
      ).toBe(true);
    }
  });
});

describe("뽑기 따라가기", () => {
  it("drawNumbers와 같은 차례가 나온다(시험 벡터)", () => {
    const seed = drawSeed(
      1,
      fromHex(
        "b22aad4794f7451896f7a371aa46106fd84d919f3f569acd5b2fddf1d1440af3",
      ),
    );
    const picks = traceDraw(seed)
      .filter((s) => s.result === "pick")
      .map((s) => s.n);
    expect(picks).toEqual(drawNumbers(seed).order);
    expect(picks).toEqual([45, 29, 5, 38, 37, 41, 4]);
  });
});

describe("사슬과 앵커", () => {
  it("고친 회차 뒤가 끊기고, 다시 이으면 앵커와 어긋난다", async () => {
    const genesis = chainSchedule(CHAIN_EPOCH);
    const records = buildChain(genesis, 4);
    const repo = anchorRepoFor(genesis, records);
    const honest = await checkChain(genesis, records, repo);
    expect(honest.genesisAnchored).toBe(true);
    expect(honest.rounds.every((r) => r.linked && r.anchored)).toBe(true);

    const edited = records.map((r, i) => (i === 1 ? tamperRecord(r) : r));
    const broken = await checkChain(genesis, edited, repo);
    expect(broken.rounds.map((r) => r.linked)).toEqual([
      true,
      true,
      false,
      true,
    ]);
    expect(broken.rounds.map((r) => r.anchored)).toEqual([
      true,
      false,
      true,
      true,
    ]);

    const relinked = relink(genesis, edited);
    const covered = await checkChain(genesis, relinked, repo);
    expect(covered.rounds.every((r) => r.linked)).toBe(true);
    expect(covered.rounds.map((r) => r.anchored)).toEqual([
      true,
      false,
      false,
      false,
    ]);

    // 앵커까지 고쳐 쓰면 앵커는 맞지만 끝 해시가 기기가 기억한 값과 다르다
    const forced = new Map(repo);
    writeRoundAnchors(genesis, relinked, forced);
    const all = await checkChain(genesis, relinked, forced);
    expect(all.rounds.every((r) => r.linked && r.anchored)).toBe(true);
    expect(toHex(all.head)).not.toBe(toHex(honest.head));

    // 처음부터 다시 시작하면 genesis.txt와 다르다
    const restarted = chainSchedule(CHAIN_EPOCH + 86400);
    const again = await checkChain(restarted, buildChain(restarted, 2), repo);
    expect(again.genesisAnchored).toBe(false);
  });
});

describe("TSA 토큰", () => {
  it("받아 둔 토큰은 맞고, 시각 글자를 고치면 서명된 해시가 어긋난다", async () => {
    const token = fromBase64(FIXTURE_TOKENS.digicert);
    const imprint = fromHex(FIXTURE_IMPRINT);
    const ok = await verifyTimestampToken(token, { imprint });
    expect(ok.ok).toBe(true);
    const shifted = shiftTokenTime(token, ok.genTime);
    expect(shifted).not.toBeNull();
    const bad = await verifyTimestampToken(shifted as Uint8Array, { imprint });
    expect(bad.ok).toBe(false);
    expect(bad.problems.join()).toMatch(/해시/);
  });
});

describe("공격해 보기", () => {
  it("정직한 장부는 통과하고, 공격은 모두 어딘가에서 걸린다", async () => {
    const world = await buildWorld();
    const honest = await honestCheck(world);
    expect(honest.problems).toEqual([]);
    expect(honest.headKept).toBe(true);
    for (const attack of ATTACKS) {
      const result = await attack.run(world);
      expect(result.caught.length, attack.id).toBeGreaterThan(0);
    }
  });

  it("끼워 넣기는 사슬·앵커를 감춰도 봉인 토큰에서 걸린다", async () => {
    const world = await buildWorld();
    const attack = ATTACKS.find((a) => a.id === "op-insert");
    const result = await attack?.run(world);
    expect(result?.caught.join("\n")).toMatch(/투명성 로그|봉인/);
    expect(result?.caught.join("\n")).not.toMatch(/이어지지 않는다/);
  });
});

it("서명: 번호를 바꾸면 확인이 실패한다", async () => {
  const signer = await generateSigner();
  const t = await signTicket(
    signer,
    unsignedTicket(signer, 7, [3, 11, 19, 27, 38, 44]),
    0,
  );
  expect(await verifyTicketSignature(t)).toBe(true);
  expect(
    await verifyTicketSignature({ ...t, numbers: [3, 11, 19, 27, 38, 45] }),
  ).toBe(false);
});
