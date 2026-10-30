// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import {
  DEFAULT_WEBAUTHN_POLICY,
  generateSigner,
  makeRegistration,
  roundTimes,
  type SignatureData,
  softCredentialId,
  softPasskeySigner,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { LocalLedger } from "./local-ledger";
import { ensureRegistered, signProof } from "./registrar";
import type { Services } from "./services";
import type { KeyInfo, Wallet } from "./wallet";

/**
 * 우주인 등록 직후 장부에 등록 올리기(docs/36 11-14). 연습 장부가 서버 `POST /api/register`와 같은 확인을 한다
 */

// 2026-10-29 14:55 KST. 1회차 마감 15:55, 추첨 16:00
const START = 1793253300;

async function setup() {
  const clock = new ManualClock();
  clock.advance(START * 1000);
  const ledger = new LocalLedger({
    clock,
    policy: DEFAULT_WEBAUTHN_POLICY,
    bots: 0,
  });
  const signer = softPasskeySigner(await generateSigner());
  const key: KeyInfo = {
    kind: "demo",
    credentialId: softCredentialId(signer.publicKey),
    pub: signer.publicKey,
  };
  let proof: SignatureData | null = null;
  const wallet = {
    signerFor: async () => signer,
    saveProof: (_pub: Uint8Array, p: SignatureData) => {
      proof = p;
    },
    loadProof: () => proof,
  } as unknown as Wallet;
  const services = {
    ns: "stardraw-test",
    ledger,
    practice: ledger,
    wallet,
    clock,
  } as unknown as Services;
  return { clock, ledger, key, services };
}

describe("우주인 등록 직후 등록 올리기", () => {
  it("증명에 서명하면 응모 전에 등록 회차가 정해지고, 다시 불러도 같다", async () => {
    const { ledger, key, services } = await setup();
    await signProof(services, key);
    expect(await ensureRegistered(services, key)).toBe(1);
    expect(await ledger.registeredRound(key.pub)).toBe(1);
    expect(ledger.isRegistered(key.pub)).toBe(true);
    expect(await ensureRegistered(services, key)).toBe(1);
  });

  it("증명이 없는 열쇠(예전 열쇠)는 올리지 않는다(첫 응모 때 응모권과 함께)", async () => {
    const { key, services } = await setup();
    expect(await ensureRegistered(services, key)).toBeNull();
  });

  it("마감 뒤에 시작하면 기다렸다가 다음 회차가 열린 뒤 그 회차에 등록한다", async () => {
    const { clock, ledger, key, services } = await setup();
    await signProof(services, key);
    clock.advance((roundTimes(ledger.schedule, 1).closesAt - START) * 1000);
    let done: number | null | undefined;
    const job = ensureRegistered(services, key).then((r) => {
      done = r;
    });
    // 추첨 시각을 지날 때까지 2초씩 옮긴다(등록은 기다리는 동안 다시 묻는다)
    for (let i = 0; i < 400 && done === undefined; i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (clock.pending() > 0) clock.advance(2000);
    }
    await job;
    expect(done).toBe(2);
  });

  it("다른 열쇠의 증명은 장부가 받지 않는다", async () => {
    const { ledger, key, services } = await setup();
    const other = softPasskeySigner(await generateSigner());
    const wrong = await signProof(
      {
        ...services,
        wallet: {
          ...services.wallet,
          signerFor: async () => other,
          saveProof: () => {},
        },
      } as Services,
      key,
    );
    const status = ledger.status();
    const registration = await makeRegistration(
      { publicKey: key.pub },
      key.credentialId,
      ledger.head(),
      status.times.entry.registerPowTarget,
      { params: ledger.powParams },
    );
    if (!registration) throw new Error("등록을 만들지 못했다");
    await expect(
      ledger.register(registration, wrong, ledger.head()),
    ).rejects.toThrow("등록 서명이 맞지 않습니다");
  });
});
