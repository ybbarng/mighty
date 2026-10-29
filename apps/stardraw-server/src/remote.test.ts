import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  generateSasKey,
  makeRegistration,
  makeTicket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

// 화면 코드(apps/web)를 그대로 불러 실제 서버와 맞물리는지 본다
import { checkAnswer, prepareAnswer } from "../../web/src/stardraw/confirm";
import type { ConfirmAnswer } from "../../web/src/stardraw/confirm-relay";
import { RemoteLedger } from "../../web/src/stardraw/remote-ledger";
import { RemoteConfirmRelay } from "../../web/src/stardraw/remote-relay";
import { createHttpServer } from "./http";
import {
  drawOf,
  EASY,
  EPOCH,
  makeRig,
  player,
  type Rig,
  TEST_POW,
} from "./testing";

/**
 * 화면의 서버 장부·서버 전달 ↔ 실제 HTTP 서버. 시계는 서버와 화면이 같은 ManualClock을 쓴다.
 */

let rig: Rig;
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  rig?.close();
});

const POLICY = { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] };

async function serve(): Promise<string> {
  rig = await makeRig();
  const server = createHttpServer(rig.engine, rig.relay, {
    basePath: "/stardraw-api",
    ledgerDir: join(rig.dir, "ledger"),
    devOrigins: [],
    trustProxy: false,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => new Promise((resolve) => server.close(() => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/stardraw-api`;
}

/** 조건이 맞을 때까지 기다린다(상한은 멈춘 시험을 잡는 안전장치) */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 20_000)
      throw new Error("조건을 기다리다 시간이 지났다");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("화면의 서버 장부 ↔ 실제 서버", () => {
  it("응모 → 추첨 → 장부 받기·검사 → 당첨자 확인(별 세 개)까지 화면 코드로 이어진다", async () => {
    const base = await serve();
    await rig.at(EPOCH + 10);
    const ledger = new RemoteLedger({
      base,
      clock: rig.clock,
      policy: POLICY,
      powParams: TEST_POW,
      verifyOptions: {
        beaconVerifier: () => true,
        powSample: Number.POSITIVE_INFINITY,
      },
    });
    await ledger.settle();
    expect(ledger.status()).toMatchObject({
      round: 1,
      phase: "open",
      entries: 0,
    });

    // 응모(처음이라 열쇠 등록도 함께)
    const me = await player();
    expect(await ledger.isRegistered(me.signer.publicKey)).toBe(false);
    const challenge = ledger.head();
    const registration = await makeRegistration(
      me.signer,
      "raw",
      new Uint8Array(),
      challenge,
      EASY,
      {
        params: ledger.powParams,
      },
    );
    const ticket = await makeTicket(
      me.signer,
      1,
      drawOf(1).numbers,
      challenge,
      EASY,
      {
        params: ledger.powParams,
      },
    );
    if (!ticket || !registration) throw new Error("응모권을 만들지 못했다");
    const { receivedAt } = await ledger.submit(ticket, registration);
    expect(receivedAt).toBe(EPOCH + 10);
    expect(ledger.status().entries).toBe(1);
    expect(await ledger.isRegistered(me.signer.publicKey)).toBe(true);
    // 같은 회차 두 번은 서버의 한국어 문구로 거절
    await expect(ledger.submit(ticket)).rejects.toThrow("이미 응모");

    // 추첨 뒤 장부 파일을 받아 처음부터 검사한다
    await rig.finish(1);
    await ledger.settle(true);
    expect(ledger.closed()).toHaveLength(1);
    expect(ledger.record(1)?.winners[1].map(toHex)).toEqual([
      toHex(ticketId(ticket)),
    ]);
    const report = await ledger.verify([ticketId(ticket)]);
    expect(report.problems).toEqual([]);

    // 당첨자 확인: 확인하는 분과 당첨자가 같은 서버 전달을 쓴다
    const tokens = new Map<string, string>();
    const relay = new RemoteConfirmRelay(base, rig.clock, {
      get: (id) => tokens.get(id) ?? null,
      set: (id, t) => tokens.set(id, t),
    });
    const checker = await generateSasKey();
    const open = await relay.create(
      1,
      ticketId(ticket),
      "Brice",
      checker.publicKey,
    );
    let answer: ConfirmAnswer | null = null;
    const stop = relay.onAnswer(open.id, (a) => {
      answer = a;
    });

    const found = await relay.openFor([ticketId(ticket)]);
    expect(found.map((o) => o.id)).toEqual([open.id]);
    const prepared = await prepareAnswer(
      me.signer,
      ticket,
      found[0] as (typeof found)[0],
    );
    await relay.answer(open.id, prepared.answer);

    // 확인하는 분은 3초마다 되묻는다(ManualClock으로 시간을 옮긴다)
    rig.clock.advance(3000);
    await until(() => answer !== null);
    stop();
    const checked = await checkAnswer(
      answer as unknown as ConfirmAnswer,
      open,
      checker.privateKey,
      ticket,
      POLICY,
    );
    expect(checked).toEqual({ ok: true, stars: prepared.stars });

    await relay.report(open.id, { ok: true });
    let outcome: unknown = null;
    relay.onOutcome(open.id, (o) => {
      outcome = o;
    });
    await until(() => outcome !== null);
    expect(outcome).toEqual({ ok: true });
  });
});
