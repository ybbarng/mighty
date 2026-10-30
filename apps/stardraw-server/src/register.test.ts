import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  encodeRegistration,
  encodeRegistrationProof,
  generateSigner,
  makeRegistration,
  roundTimes,
  signRegistrationProof,
  softPasskeySigner,
  toBase64Url,
  toHex,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import {
  drawOf,
  EASY,
  EPOCH,
  enter,
  makeRig,
  player,
  type Rig,
  readLedger,
  registerOnly,
  SCHEDULE,
  TEST_POW,
} from "./testing";

/**
 * 우주인 등록 직후 등록만 올리기(`POST /api/register`, docs/36 11-14).
 * 응모와 같은 확인(IP 상한·패스키 서명 UV·국장 열쇠 거절·작업 증명)을 하고, 장부 등록 형식은 그대로다
 */

let rig: Rig;
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  rig?.close();
});

describe("등록만 올리기", () => {
  it("응모 전에 등록 회차가 정해지고, 그 회차 장부에 실리며, 첫 응모는 등록 없이 받는다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const p = await player();
    expect(await registerOnly(rig, p)).toEqual({ round: 1 });
    expect(rig.engine.registrationRound(p.signer.publicKey)).toBe(1);
    // 다시 보내도 같은 회차(작업 증명을 다시 풀지 않아도 된다)
    expect(await registerOnly(rig, p)).toEqual({ round: 1 });
    // 등록 다음 회차에 첫 응모: 응모권만 낸다
    await rig.finish(1);
    await enter(rig, p, drawOf(2).numbers);
    await rig.finish(2);
    const l = readLedger(rig.dir);
    expect(l.registrations[0]).toHaveLength(1);
    expect(l.registrations[1]).toHaveLength(0);
    const report = await verifyLedger(
      l.genesis,
      l.records,
      l.tickets,
      l.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW, powSample: Infinity },
    );
    expect(report.problems).toEqual([]);
  });

  it("다른 열쇠의 서명, 본인 확인 없는 서명, 바뀐 문제 값, 마감 뒤는 받지 않는다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const head = rig.engine.head();
    const send = async (
      signer: ReturnType<typeof softPasskeySigner>,
      proofSigner = signer,
      at = head,
    ) => {
      const registration = await makeRegistration(
        signer,
        signer.credentialId,
        at,
        EASY,
        { params: TEST_POW },
      );
      if (!registration) throw new Error("등록을 만들지 못했다");
      return rig.engine.register({
        registration: encodeRegistration(registration),
        proof: encodeRegistrationProof(
          await signRegistrationProof(proofSigner, registration),
        ),
        head: toHex(at),
        ip: "203.0.113.7",
      });
    };
    const me = softPasskeySigner(await generateSigner());
    const other = softPasskeySigner(await generateSigner());
    await expect(send(me, other)).rejects.toThrow("등록 서명이 맞지 않습니다");
    const noUv = softPasskeySigner(await generateSigner(), { flags: 0x01 });
    await expect(send(noUv)).rejects.toThrow("등록 서명이 맞지 않습니다");
    await expect(send(me, me, new Uint8Array(32))).rejects.toMatchObject({
      status: 409,
    });
    // 마감 뒤 ~ 추첨 전: 다음 회차가 열리면 다시
    await rig.at(roundTimes(SCHEDULE, 1).closesAt);
    await expect(send(me)).rejects.toMatchObject({
      status: 409,
      message: "다음 회차가 열리면 등록됩니다",
    });
    expect(rig.engine.registrationRound(me.publicKey)).toBeNull();
  });

  it("같은 곳(IP 앞부분)에서 하루 등록 상한을 넘으면 거절한다", async () => {
    rig = await makeRig({ registrationsPerPrefixPerDay: 1 });
    await rig.at(EPOCH + 10);
    await registerOnly(rig, await player(), "198.51.100.1");
    await expect(
      registerOnly(rig, await player(), "198.51.100.2"),
    ).rejects.toMatchObject({ status: 429 });
    // 다른 곳은 받는다
    await registerOnly(rig, await player(), "192.0.2.1");
  });

  it("HTTP: POST /api/register 뒤 GET /api/keys/:pub가 등록 회차를 알려 준다", async () => {
    rig = await makeRig();
    const server = createHttpServer(rig.engine, rig.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(rig.dir, "ledger"),
      devOrigins: [],
      trustProxy: true,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    close = () => new Promise((resolve) => server.close(() => resolve()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/stardraw-api`;
    await rig.at(EPOCH + 10);
    const p = await player();
    const head = rig.engine.head();
    const registration = await makeRegistration(
      p.signer,
      p.signer.credentialId,
      head,
      EASY,
      { params: TEST_POW },
    );
    if (!registration) throw new Error("등록을 만들지 못했다");
    const res = await fetch(`${base}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        registration: toBase64Url(encodeRegistration(registration)),
        proof: toBase64Url(
          encodeRegistrationProof(
            await signRegistrationProof(p.signer, registration),
          ),
        ),
        head: toHex(head),
      }),
    });
    expect(await res.json()).toEqual({ round: 1 });
    expect(res.status).toBe(200);
    const key = await fetch(
      `${base}/api/keys/${toBase64Url(p.signer.publicKey)}`,
    );
    expect(await key.json()).toEqual({ registered: true, round: 1 });
    // 장부에 없는 패스키 번호는 404
    const missing = await fetch(`${base}/api/passkeys/AAAA`);
    expect(missing.status).toBe(404);
  });
});
