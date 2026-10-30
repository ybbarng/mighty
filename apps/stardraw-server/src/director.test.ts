import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  type AffiliationFields,
  directorFingerprint,
  encodeOperation,
  generateSigner,
  OP_VERSION,
  type OpBody,
  type Operation,
  opId,
  type Schedule,
  type SoftPasskey,
  signAsDirector,
  signAsSeal,
  softPasskeySigner,
  toBase64Url,
  toHex,
  verifyLedger,
} from "@mighty/stardraw-core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { scheduleEntry } from "./config";
import { createHttpServer } from "./http";
import { scheduleLive } from "./schedule-live";
import {
  enter,
  makeRig,
  type Rig,
  readLedger,
  registerOnly,
  SCHEDULE,
  TEST_POW,
} from "./testing";

/**
 * 국장 요청(docs/36 11-12). 시험 장부는 1시간 회차라 회차 k 기록의 가장 이른 효력 회차는 k + 25다.
 * 설정의 국장 열쇠는 1회차 기록에 관인 지정으로 실려 26회차부터 쓴다
 */

const TRIAL: Schedule = {
  ...SCHEDULE,
  entries: SCHEDULE.entries.map((e) => ({ ...e, phase: "trial" as const })),
};

const FIELDS: AffiliationFields = {
  name: "시험 성단",
  badge: 2,
  method: "초대 코드",
  issuerKey: new Uint8Array(),
  issued: 0,
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

let rig: Rig | undefined;
let director: SoftPasskey;
let stranger: SoftPasskey;
beforeAll(async () => {
  director = softPasskeySigner(await generateSigner());
  stranger = softPasskeySigner(await generateSigner());
});
afterEach(() => {
  rig?.close();
  rig = undefined;
});

async function directorRig(): Promise<Rig> {
  rig = await makeRig({
    schedule: TRIAL,
    directorKeys: [
      { credentialId: director.credentialId, pub: director.publicKey },
    ],
  });
  return rig;
}

function body(r: Rig, b: DistributiveOmit<OpBody, "v" | "after">): OpBody {
  return { v: OP_VERSION, after: r.engine.head(), ...b } as OpBody;
}

const next = (r: Rig) => r.store.recordCount() + 1;
const submit = (r: Rig, op: Operation) =>
  r.engine.submitDirectorOp(encodeOperation(op), "203.0.113.9");
const affiliation = (r: Rig, who: SoftPasskey, effectiveRound = next(r) + 25) =>
  signAsDirector(
    body(r, { kind: "affiliation-add", effectiveRound, fields: FIELDS }),
    who,
  );

async function finishThrough(r: Rig, round: number): Promise<void> {
  for (let k = r.store.recordCount() + 1; k <= round; k++) await r.finish(k);
}

describe("국장 열쇠 지정(서버 설정 → 관인 기록)", () => {
  it("설정의 국장 열쇠는 지문을 기록에 찍고, 다음 기록에 관인 지정(24시간 예고)으로 싣는다. 그 전에는 국장 요청을 거절한다", async () => {
    const r = await directorRig();
    const fp = directorFingerprint(director.publicKey);
    expect(r.logs).toContain(
      `국장 열쇠(설정) ${fp}: 다음 기록에 지정을 싣는다`,
    );
    await r.finish(1);
    const op = r.store.record(1)?.operations?.[0];
    expect(op).toMatchObject({
      kind: "director-add",
      effectiveRound: 26,
      signer: { role: "seal" },
    });
    expect(r.logs.join("\n")).toContain(
      `국장 열쇠 지정 ${fp}(서명 관인, 26회차부터)`,
    );
    // 아직 효력 전: 국장 요청은 403
    await expect(
      submit(r, await affiliation(r, director)),
    ).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/국장 열쇠가 아닙니다/),
    });
    // 지정된(예고 중) 국장 열쇠로는 우주인 등록을 할 수 없다
    await expect(
      enter(r, { signer: director, registered: false }, [1, 2, 3, 4, 5, 6]),
    ).rejects.toThrow("이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다");
    // 등록만 올리기도, 다른 기기에서 패스키 찾기도 같은 말로 거절한다
    await expect(
      registerOnly(r, { signer: director, registered: false }),
    ).rejects.toMatchObject({
      status: 403,
      message: "이 패스키는 국장 열쇠라 응모에 쓸 수 없습니다",
    });
    await expect(
      r.engine.passkeyPub(director.credentialId),
    ).rejects.toMatchObject({ status: 403 });
    // 같은 열쇠를 두 번 싣지 않는다
    await r.finish(2);
    expect(r.store.record(2)?.operations).toBeUndefined();
  });
});

describe("국장 열쇠를 설정에서 빼기", () => {
  it("예고 중인 관인 지정은 서버를 다시 띄울 때 설정에서 빠졌으면 관인이 취소한다(바꿔치기 대비)", async () => {
    const first = await directorRig();
    await first.finish(1);
    first.store.close();
    rig = await makeRig({
      schedule: TRIAL,
      dir: first.dir,
      serverKey: first.serverKey,
      at: Math.floor(first.clock.now() / 1000),
    });
    await rig.finish(2);
    expect(rig.store.record(2)?.operations?.[0]).toMatchObject({
      kind: "cancel",
      signer: { role: "seal" },
    });
    const state = await rig.engine.directorState();
    expect(state.view.operations[0]).toMatchObject({
      kind: "director-add",
      status: "cancelled",
      cancelledIn: 2,
    });
  });
});

describe("국장 요청", () => {
  it("소속 추가 → 다음 기록에 실림 → 24시간 뒤 적용, 장부 검사를 통과한다", async () => {
    const r = await directorRig();
    await finishThrough(r, 25);
    const op = await affiliation(r, director);
    expect(await submit(r, op)).toEqual({
      id: toHex(opId(op)),
      round: 26,
      effectiveRound: 51,
    });
    let state = await r.engine.directorState();
    expect(state.submitted).toMatchObject([{ id: toHex(opId(op)) }]);
    await r.finish(26);
    state = await r.engine.directorState();
    expect(state.submitted).toEqual([]);
    expect(state.view.operations.at(-1)).toMatchObject({
      kind: "affiliation-add",
      status: "pending",
      round: 26,
      effectiveRound: 51,
    });
    await finishThrough(r, 51);
    state = await r.engine.directorState();
    expect(state.view.affiliations).toMatchObject([
      { name: "시험 성단", from: 51, until: null },
    ]);
    // 이미 적용된 기록은 취소할 수 없다
    await expect(
      submit(
        r,
        await signAsDirector(
          body(r, { kind: "cancel", effectiveRound: 0, target: opId(op) }),
          director,
        ),
      ),
    ).rejects.toThrow(/이미 효력이 생긴/);

    const ledger = readLedger(r.dir);
    const report = await verifyLedger(
      ledger.genesis,
      ledger.records,
      ledger.tickets,
      ledger.registrations,
      { beaconVerifier: () => true, powParams: TEST_POW },
    );
    expect(report.problems).toEqual([]);
  }, 20_000);

  it("공격: 다른 패스키, 예전 서명 재사용, 서명 뒤 내용 바꾸기, 예고 없이 바로 적용, 관인인 척 → 모두 거절", async () => {
    const r = await directorRig();
    await finishThrough(r, 25);
    await expect(
      submit(r, await affiliation(r, stranger)),
    ).rejects.toMatchObject({
      status: 403,
    });
    const old = await affiliation(r, director);
    await r.finish(26);
    await expect(submit(r, old)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/다시 서명해 주세요/),
    });
    const good = await affiliation(r, director);
    const tampered = {
      ...good,
      fields: { ...FIELDS, name: "가짜 성단" },
    } as Operation;
    await expect(submit(r, tampered)).rejects.toThrow(/서명이 맞지 않는다/);
    await expect(
      submit(r, await affiliation(r, director, next(r) + 1)),
    ).rejects.toThrow(/24시간 예고가 모자란다/);
    // 관인 열쇠인 척 원시 서명으로 보내도 국장 요청 길로는 받지 않는다
    const asSeal = await signAsSeal(good, await generateSigner());
    await expect(submit(r, asSeal)).rejects.toMatchObject({ status: 403 });
    await expect(submit(r, good)).resolves.toMatchObject({ round: 27 });
    await expect(submit(r, good)).rejects.toThrow(/이미 받은 요청/);
  }, 20_000);

  it("정식 시작 예약(일정 바꾸기)을 국장이 하고 취소한다. 예고 중에는 schedule-live 명령도 거절한다", async () => {
    const r = await directorRig();
    await finishThrough(r, 25);
    const from = next(r) + 30;
    const op = await signAsDirector(
      body(r, {
        kind: "schedule",
        effectiveRound: from,
        entry: scheduleEntry(from, "live"),
      }),
      director,
    );
    await submit(r, op);
    expect(() => scheduleLive(r.store, r.engine.schedule().epoch)).toThrow(
      /국장이 보낸 일정 바꾸기/,
    );
    await r.finish(26);
    expect(r.engine.state().liveFrom).toBe(from);
    await submit(
      r,
      await signAsDirector(
        body(r, { kind: "cancel", effectiveRound: 0, target: opId(op) }),
        director,
      ),
    );
    await r.finish(27);
    expect(r.engine.state().liveFrom).toBeNull();
    const state = await r.engine.directorState();
    expect(
      state.view.operations.find((o) => o.kind === "schedule"),
    ).toMatchObject({
      status: "cancelled",
      cancelledIn: 27,
    });
  }, 20_000);
});

describe("HTTP 국장 경로", () => {
  it("상태를 주고, 국장이 아닌 패스키의 요청은 403으로 거절한다", async () => {
    const r = await directorRig();
    const server = createHttpServer(r.engine, r.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(r.dir, "ledger"),
      devOrigins: [],
      trustProxy: false,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}/stardraw-api`;
      const state = await (await fetch(`${base}/api/director/state`)).json();
      expect(state.view.next).toMatchObject({
        round: 1,
        earliestEffectiveRound: 26,
      });
      const op = await affiliation(r, stranger);
      const res = await fetch(`${base}/api/director/ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: toBase64Url(encodeOperation(op)) }),
      });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/국장 열쇠가 아닙니다/);
      const broken = await fetch(`${base}/api/director/ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "AAAA" }),
      });
      expect(broken.status).toBe(400);
    } finally {
      await new Promise((resolve) => server.close(() => resolve(null)));
    }
  });
});
