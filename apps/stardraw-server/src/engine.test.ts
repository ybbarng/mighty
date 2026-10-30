import {
  concat,
  decodeReceipt,
  drandRoundForClose,
  encodeReceipt,
  encodeRegistration,
  encodeTicket,
  generateSigner,
  genesisHash,
  type KeyRegistration,
  type RoundRecord,
  receiptInTime,
  roundTimes,
  softPasskeySigner,
  type Ticket,
  ticketBody,
  ticketId,
  toHex,
  utf8,
  verifyLedger,
  verifyReceipt,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { EntryError } from "./engine";
import {
  drawOf,
  drawTimeOf,
  EPOCH,
  enter,
  entryFor,
  makeRig,
  player,
  type Rig,
  readLedger,
  SCHEDULE,
  TEST_POW,
} from "./testing";

let rig: Rig;
afterEach(() => rig?.close());

const check = (
  l: ReturnType<typeof readLedger>,
  records = l.records,
  tickets = l.tickets,
) =>
  verifyLedger(l.genesis, records, tickets, l.registrations, {
    beaconVerifier: () => true,
    powParams: TEST_POW,
    powSample: Infinity,
  });

const messages = (report: Awaited<ReturnType<typeof check>>) =>
  report.problems.map((p) => p.message);

describe("회차 진행: 응모 → 마감·봉인 → drand 추첨 → 공개 장부", () => {
  it("두 회차를 돌린 뒤 장부 파일만으로 처음부터 검사하면 문제가 없다", async () => {
    rig = await makeRig();
    const [a, b, c] = await Promise.all([player(), player(), player()]);
    await rig.at(EPOCH + 10);
    expect(rig.engine.state()).toMatchObject({
      round: 1,
      records: 0,
      entries: 0,
      behind: 0,
    });
    // 1회차: c는 당첨 번호 그대로(1등)
    await enter(rig, a, [1, 2, 3, 4, 5, 6]);
    await enter(rig, b, [7, 8, 9, 10, 11, 12]);
    await enter(rig, c, drawOf(1).numbers);
    expect(rig.engine.state().entries).toBe(3);

    // 마감하면 봉인하고, drand 시각 전에는 기록을 닫지 않는다
    const close1 = roundTimes(SCHEDULE, 1).closesAt;
    await rig.at(close1);
    // 마감부터 추첨까지는 1회 밀린 것이 정상이다(서버 감시는 2부터 알린다)
    expect(rig.engine.state()).toMatchObject({
      sealed: 1,
      records: 0,
      behind: 1,
    });
    await rig.at(drawTimeOf(1));
    expect(rig.engine.state()).toMatchObject({
      records: 1,
      round: 2,
      behind: 0,
    });
    const record1 = rig.store.record(1) as RoundRecord;
    expect(record1.numbers).toEqual(drawOf(1).numbers);
    expect(record1.winners[1]).toHaveLength(1);

    // 2회차: 등록된 열쇠는 등록 없이 낸다
    await enter(rig, a, [11, 12, 13, 14, 15, 16]);
    await rig.finish(2);
    expect(rig.engine.state()).toMatchObject({ records: 2, sealed: 2 });

    const ledger = readLedger(rig.dir);
    expect(ledger.records.map((r) => r.void)).toEqual([false, false]);
    expect(ledger.seals).toBe(2);
    expect(ledger.records.map((r) => r.count)).toEqual([3, 1]);
    expect(ledger.registrations.map((r) => r.length)).toEqual([3, 0]);
    const report = await check(ledger);
    expect(messages(report)).toEqual([]);
    expect(toHex(report.head)).toBe(ledger.head.head);
  });

  it("아무도 응모하지 않아도 회차가 스스로 닫히고 이어지며, 그 뒤 응모도 받는다", async () => {
    rig = await makeRig();
    // 응모 없이 세 회차를 그냥 보낸다(실제 서버처럼 회차마다 차례로 시각을 지난다.
    // 한 번에 건너뛰면 지난 회차는 봉인 기한을 놓쳐 무효가 된다 — 서버가 꺼져 있던 때와 같다)
    for (const round of [1, 2, 3]) await rig.finish(round);
    expect(rig.engine.state()).toMatchObject({
      round: 4,
      records: 3,
      sealed: 3,
    });
    const empty = readLedger(rig.dir);
    expect(empty.records.map((r) => [r.count, r.void])).toEqual([
      [0, false],
      [0, false],
      [0, false],
    ]);
    expect(messages(await check(empty))).toEqual([]);

    // 빈 회차 뒤에도 응모·추첨이 그대로 된다
    const a = await player();
    await enter(rig, a, drawOf(4).numbers);
    await rig.finish(4);
    const ledger = readLedger(rig.dir);
    expect(ledger.records.map((r) => r.count)).toEqual([0, 0, 0, 1]);
    expect(rig.store.record(4)?.winners[1]).toHaveLength(1);
    expect(messages(await check(ledger))).toEqual([]);
  });

  it("재배포로 서버가 마감 직후나 추첨 전에 다시 떠도, 밀린 봉인·추첨을 이어서 해 회차가 무효가 되지 않는다", async () => {
    const first = await makeRig();
    const dir = first.dir;
    const [a, b] = await Promise.all([player(), player()]);
    await first.at(EPOCH + 10);
    await enter(first, a, [1, 2, 3, 4, 5, 6]);
    await enter(first, b, drawOf(1).numbers);
    const { closesAt } = roundTimes(SCHEDULE, 1);
    // 마감 1초 전에 내려간다(데이터 폴더는 그대로)
    await first.at(closesAt - 1);
    first.store.close();

    // ① 마감 60초 뒤 다시 뜬다: 봉인 기한(180초) 안이라 봉인한다
    const second = await makeRig({ dir, at: closesAt + 60 });
    await second.at(closesAt + 60);
    expect(second.engine.state()).toMatchObject({ sealed: 1, records: 0 });
    second.store.close();

    // ② 봉인 뒤, drand 시각 전에 또 내려갔다가 drand 시각 뒤에 다시 뜬다: 이어서 추첨한다
    const drawAt = drawTimeOf(1);
    rig = await makeRig({ dir, at: drawAt + 30 });
    await rig.at(drawAt + 30);
    expect(rig.engine.state()).toMatchObject({ sealed: 1, records: 1 });
    const record1 = rig.store.record(1) as RoundRecord;
    expect(record1.void).toBe(false);
    expect(record1.count).toBe(2);
    expect(record1.winners[1]).toHaveLength(1);
    expect(messages(await check(readLedger(dir)))).toEqual([]);
  });

  it("장부를 고치면 검사에서 드러난다(응모권 끼워 넣기·빼기, 번호 바꾸기)", async () => {
    rig = await makeRig();
    const [a, b] = await Promise.all([player(), player()]);
    await rig.at(EPOCH + 10);
    await enter(rig, a, [1, 2, 3, 4, 5, 6]);
    await enter(rig, b, drawOf(1).numbers);
    await rig.finish(1);
    const ledger = readLedger(rig.dir);
    expect(ledger.records[0]?.void).toBe(false);
    expect(messages(await check(ledger))).toEqual([]);

    const round1 = ledger.tickets[0] as Ticket[];

    // 결과를 본 뒤 당첨 번호 응모권을 끼워 넣기(1회차 문제 값은 처음 일정표 해시)
    const { ticket: forged } = await entryFor(
      { ...(await player()), registered: true },
      1,
      drawOf(1).numbers,
      genesisHash(SCHEDULE),
    );
    expect(
      (await check(ledger, ledger.records, [[...round1, forged]])).problems
        .length,
    ).toBeGreaterThan(0);

    // 응모권 하나 빼기
    expect(
      (await check(ledger, ledger.records, [round1.slice(1)])).problems.length,
    ).toBeGreaterThan(0);

    // 당첨 번호 바꾸기
    const changed = [
      { ...(ledger.records[0] as RoundRecord), numbers: [1, 2, 3, 4, 5, 6] },
    ];
    expect((await check(ledger, changed)).problems.length).toBeGreaterThan(0);
  });

  it("봉인 값을 기한 안에 로그에 못 올리면 그 회차는 당첨 없이 무효로 닫히고, 장부 검사는 통과한다", async () => {
    rig = await makeRig();
    const a = await player();
    await rig.at(EPOCH + 10);
    await enter(rig, a, drawOf(1).numbers);
    rig.log.failing = true;
    const close1 = roundTimes(SCHEDULE, 1).closesAt;
    await rig.at(close1 + 60);
    expect(rig.engine.state().sealed).toBe(0); // 기한 안이면 다시 시도한다
    await rig.at(close1 + 180);
    expect(rig.engine.state().sealed).toBe(1);
    await rig.at(close1 + 181);
    const record = rig.store.record(1) as RoundRecord;
    expect(record.void).toBe(true);
    expect(record.winners[1]).toEqual([]);
    expect(messages(await check(readLedger(rig.dir)))).toEqual([]);
  });

  it("drand 값이 늦으면 다른 난수를 쓰지 않고 기다렸다가 닫는다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    rig.drand.missing.add(drandRoundForClose(roundTimes(SCHEDULE, 1).closesAt));
    await rig.finish(1);
    await rig.at(drawTimeOf(1) + 60);
    expect(rig.engine.state()).toMatchObject({ sealed: 1, records: 0 });
    rig.drand.missing.clear();
    await rig.at(drawTimeOf(1) + 120);
    expect(rig.engine.state().records).toBe(1);
    expect(rig.store.record(1)?.void).toBe(false);
  });
});

describe("응모 받기: 싼 확인부터, 규칙에 어긋나면 거절", () => {
  const rejects = async (p: Promise<unknown>, text: string) => {
    const err = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EntryError);
    expect((err as Error).message).toContain(text);
  };

  it("영수증은 서버 열쇠로 서명되고 받은 시각이 회차 안이다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const { ticket, receipt } = await enter(
      rig,
      await player(),
      [1, 2, 3, 4, 5, 6],
    );
    const decoded = decodeReceipt(encodeReceipt(receipt));
    expect(toHex(decoded.ticketId)).toBe(toHex(ticketId(ticket)));
    expect(await verifyReceipt(rig.serverKey.publicKey, decoded)).toBe(true);
    expect(receiptInTime(SCHEDULE, decoded)).toBe(true);
  });

  it("등록 없는 새 열쇠, 같은 회차 두 번, 다른 회차 응모권, 마감 뒤를 거절한다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const a = await player();
    const { ticket } = await entryFor(
      a,
      1,
      [1, 2, 3, 4, 5, 6],
      rig.engine.head(),
    );
    await rejects(
      rig.engine.submit({ ticket: encodeTicket(ticket), ip: "1.2.3.4" }),
      "등록되지 않은",
    );

    await enter(rig, a, [1, 2, 3, 4, 5, 6]);
    await rejects(enter(rig, a, [2, 3, 4, 5, 6, 7]), "이미 응모");

    const b = await player();
    const wrong = await entryFor(b, 2, [1, 2, 3, 4, 5, 6], rig.engine.head());
    await rejects(
      rig.engine.submit({ ticket: encodeTicket(wrong.ticket), ip: "1.2.3.4" }),
      "이번 회차 응모권이 아닙니다",
    );

    // 마감 시각에 막 닿은 1회차 응모권(서버가 받은 시각으로 정한다)
    const late = await entryFor(b, 1, [1, 2, 3, 4, 5, 6], rig.engine.head());
    await rig.at(roundTimes(SCHEDULE, 1).closesAt);
    await rejects(
      rig.engine.submit({ ticket: encodeTicket(late.ticket), ip: "1.2.3.4" }),
      "마감됐어요(서버 시각 15:55:00)",
    );
  });

  it("원시 열쇠(직접 만든 열쇠 쌍)의 등록·서명은 쉬운 말로 거절한다(docs/36 11-11)", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const key = await generateSigner();
    const p = { signer: softPasskeySigner(key), registered: false };
    const { ticket, registration } = await entryFor(
      p,
      1,
      [1, 2, 3, 4, 5, 6],
      rig.engine.head(),
    );
    const body = ticketBody(ticket);
    // 예전 원시 서명: 서명 종류 01 ‖ 같은 열쇠의 r‖s 64바이트
    const rawSig = await key.sign(
      concat(utf8("stardraw/ticket-sig/v1"), new Uint8Array([0]), body),
    );
    const rawTicket = concat(body, new Uint8Array([1]), rawSig);
    // 예전 원시 열쇠 등록: 종류 01 ‖ 패스키 번호 없음(0000)
    const rawRegistration = concat(
      new Uint8Array([1, 1, 0, 0]),
      ticket.pub,
      new Uint8Array(4),
    );
    const message = "패스키로만 응모할 수 있습니다";
    await rejects(
      rig.engine.submit({
        ticket: rawTicket,
        registration: encodeRegistration(registration as KeyRegistration),
        ip: "1.2.3.4",
      }),
      message,
    );
    await rejects(
      rig.engine.submit({
        ticket: encodeTicket(ticket),
        registration: rawRegistration,
        ip: "1.2.3.4",
      }),
      message,
    );
    // 같은 열쇠라도 패스키 모양이면 받는다
    await enter(rig, p, [1, 2, 3, 4, 5, 6]);
    expect(rig.engine.state().entries).toBe(1);
  });

  it("서명한 뒤 번호를 바꾼 응모권은 서명이 맞지 않는다", async () => {
    rig = await makeRig();
    await rig.at(EPOCH + 10);
    const a = await player();
    await enter(rig, a, [1, 2, 3, 4, 5, 6]);
    const b = await player();
    await enter(rig, b, [7, 8, 9, 10, 11, 12]);
    // b는 등록된 열쇠다. 새 회차로 넘긴 뒤 번호를 바꾼 응모권을 낸다
    await rig.finish(1);
    const { ticket } = await entryFor(
      b,
      2,
      [1, 2, 3, 4, 5, 6],
      rig.engine.head(),
    );
    const forged: Ticket = { ...ticket, numbers: [1, 2, 3, 4, 5, 7] };
    await rejects(
      rig.engine.submit({ ticket: encodeTicket(forged), ip: "1.2.3.4" }),
      "서명",
    );
  });

  it("같은 곳(IP 앞부분)에서 회차 상한을 넘으면 거절한다", async () => {
    rig = await makeRig({ entriesPerPrefixPerRound: 2 });
    await rig.at(EPOCH + 10);
    await enter(rig, await player(), [1, 2, 3, 4, 5, 6], "198.51.100.1");
    await enter(rig, await player(), [1, 2, 3, 4, 5, 6], "198.51.100.2");
    await rejects(
      enter(rig, await player(), [1, 2, 3, 4, 5, 6], "198.51.100.3"),
      "너무 많습니다",
    );
    // 다른 곳은 받는다
    await enter(rig, await player(), [1, 2, 3, 4, 5, 6], "192.0.2.1");
  });

  it("앞 회차 추첨이 끝나기 전에는 다음 회차 응모를 받지 않는다", async () => {
    rig = await makeRig();
    const close1 = roundTimes(SCHEDULE, 1).closesAt;
    await rig.at(close1 + 1);
    expect(rig.engine.state()).toMatchObject({ round: 2, records: 0 });
    const a = await player();
    await rejects(enter(rig, a, [1, 2, 3, 4, 5, 6]), "앞 회차 추첨");
  });
});
