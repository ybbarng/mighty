import {
  makeRegistration,
  registrationProofMessage,
  type SignatureData,
} from "@mighty/stardraw-core";

import { RegisterLater } from "./ledger";
import type { Services } from "./services";
import type { KeyInfo } from "./wallet";

/**
 * 우주인 등록 직후 장부에 등록을 올린다(docs/36 11-14). 등록 회차가 곧 등록증 발급일이다.
 * 1. 패스키를 만든 직후 그 패스키로 등록 증명에 서명한다(`signProof`, 확인 한 번 더). 증명은 지갑에 둔다
 * 2. 응모를 받는 동안 등록 작업 증명을 풀어 올린다. 회차가 바뀌었거나 마감 뒤면 다음 회차가 열린 뒤 다시 푼다
 *    (증명은 nonce를 뺀 등록에 한 서명이라 다시 서명하지 않는다)
 * 증명이 없는 예전 열쇠는 여기서 올리지 않고, 첫 응모 때 응모권과 함께 등록한다.
 * 같은 열쇠의 등록은 한 번에 하나만 돈다(첫 화면·응모 화면이 같은 일을 기다린다).
 */

const running = new Map<string, Promise<number | null>>();

const keyOf = (services: Services, key: KeyInfo) =>
  `${services.ns}:${Array.from(key.pub.slice(1, 17)).join(",")}`;

/** 새 패스키로 등록 증명에 서명해 지갑에 둔다 */
export async function signProof(
  services: Services,
  key: KeyInfo,
): Promise<SignatureData> {
  const signer = await services.wallet.signerFor(key);
  const proof = await signer.sign(
    registrationProofMessage({
      v: 1,
      credentialId: key.credentialId,
      pub: key.pub,
    }),
  );
  services.wallet.saveProof(key.pub, proof);
  return proof;
}

/** 지금 돌고 있는 이 열쇠의 등록(없으면 null) */
export function registering(
  services: Services,
  key: KeyInfo,
): Promise<number | null> | null {
  return running.get(keyOf(services, key)) ?? null;
}

/**
 * 장부에 등록돼 있게 한다. 등록 회차를 돌려주고, 증명이 없어 올릴 수 없으면 null.
 * 이미 돌고 있으면 그 일을 같이 기다린다
 */
export function ensureRegistered(
  services: Services,
  key: KeyInfo,
): Promise<number | null> {
  const id = keyOf(services, key);
  const found = running.get(id);
  if (found) return found;
  const job = run(services, key).finally(() => running.delete(id));
  running.set(id, job);
  return job;
}

const wait = (services: Services, ms: number) =>
  new Promise<void>((resolve) => services.clock.after(ms, resolve));

async function run(services: Services, key: KeyInfo): Promise<number | null> {
  const { ledger, wallet } = services;
  for (;;) {
    await ledger.settle();
    const known = await ledger.registeredRound(key.pub);
    if (known !== null) return known;
    const proof = wallet.loadProof(key.pub);
    if (!proof) return null;
    const status = ledger.status();
    if (status.phase !== "open") {
      await wait(services, 2000);
      continue;
    }
    const challenge = ledger.head();
    const registration = await makeRegistration(
      { publicKey: key.pub },
      key.credentialId,
      challenge,
      status.times.entry.registerPowTarget,
      { params: ledger.powParams },
    );
    if (!registration) return null;
    try {
      return (await ledger.register(registration, proof, challenge)).round;
    } catch (err) {
      if (!(err instanceof RegisterLater)) throw err;
      await wait(services, 1000);
    }
  }
}
