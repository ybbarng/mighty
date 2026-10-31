// @vitest-environment node
import { ManualClock } from "@mighty/fair-play";
import {
  blindStampRequest,
  DEFAULT_WEBAUTHN_POLICY,
  directorKeyConfig,
  type EntrantSigner,
  fromHex,
  generateSigner,
  genesisHash,
  makeRegistration,
  makeTicket,
  newQualSeed,
  OP_VERSION,
  type OpBody,
  type QualHolding,
  qualKeyFromSeed,
  rankOf,
  roundTimes,
  signAsDirector,
  softCredentialId,
  softPasskeySigner,
  type Ticket,
  ticketId,
  toHex,
  unblindStamp,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import {
  type LedgerStore,
  LocalLedger,
  PRACTICE_POW,
  randomPick,
} from "./local-ledger";
import { qualMarks } from "./qual-judge";

/** 흉내 패스키(UP·UV 켬). 장부는 패스키 모양 서명만 받는다 */
const passkey = async () => softPasskeySigner(await generateSigner());

// 2026-10-29 14:55 KST. 1회차 마감 15:55, 추첨 16:00(매시 정각 추첨 · 55분 마감)
const START = 1793253300;
const HOUR = 3600;
/** 마감 5분 뒤에 drand 값이 나오고, quicknet은 3초마다라 넉넉히 */
const DRAW_AFTER = 5 * 60 + 3;

function memoryStore(): LedgerStore & { text: string | null } {
  return {
    text: null,
    load() {
      return this.text;
    },
    save(t) {
      this.text = t;
    },
  };
}

function setup(store: LedgerStore = memoryStore()) {
  const clock = new ManualClock();
  clock.advance(START * 1000);
  let seed = 1;
  const random = (n: number) =>
    Uint8Array.from({ length: n }, () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed & 255;
    });
  const ledger = new LocalLedger({
    clock,
    store,
    policy: DEFAULT_WEBAUTHN_POLICY,
    random,
    bots: 2,
  });
  return { clock, ledger, store };
}

async function enter(
  ledger: LocalLedger,
  signer: EntrantSigner,
  numbers: number[],
  register = true,
  qual: QualHolding | null = null,
) {
  const round = ledger.status().round;
  const entry = ledger.schedule.entries[0];
  if (!entry) throw new Error("일정표가 비었다");
  const challenge = ledger.head();
  const ticket = await makeTicket(
    signer,
    round,
    numbers,
    challenge,
    entry.powTarget,
    { params: PRACTICE_POW },
    qual,
  );
  const reg = register
    ? await makeRegistration(
        signer,
        softCredentialId(signer.publicKey),
        challenge,
        entry.registerPowTarget,
        { params: PRACTICE_POW },
      )
    : undefined;
  if (!ticket || reg === null) throw new Error("응모권을 만들지 못했다");
  await ledger.submit(ticket, reg);
  return ticket;
}

describe("연습 장부: 회차 진행", () => {
  it("처음 열면 다음 x:55가 1회차 마감이고, 문제 값은 처음 일정표 해시다", () => {
    const { ledger } = setup();
    const s = ledger.status();
    expect(s.round).toBe(1);
    expect(s.phase).toBe("open");
    expect(s.times.opensAt).toBe(START);
    expect(s.times.closesAt).toBe(START + HOUR);
    expect(toHex(ledger.head())).toBe(toHex(genesisHash(ledger.schedule)));
  });

  it("마감 5초 전부터는 화면 마감, 다음 회차는 앞 회차 추첨 뒤에 열린다", async () => {
    const { clock, ledger } = setup();
    clock.advance((HOUR - 6) * 1000);
    expect(ledger.status().phase).toBe("open");
    clock.advance(1000);
    expect(ledger.status().phase).toBe("closing");
    clock.advance(5 * 1000);
    await ledger.settle();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "waiting" });
    clock.advance(DRAW_AFTER * 1000);
    await ledger.settle();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "open" });
    expect(ledger.record(1)?.round).toBe(1);
  });

  it("drand 시각 전에는 추첨하지 않고, 지나면 규칙대로 등수를 정한다", async () => {
    const { clock, ledger } = setup();
    const me = await passkey();
    const ticket = await enter(ledger, me, [3, 11, 19, 27, 38, 44]);
    clock.advance(HOUR * 1000);
    await ledger.settle();
    expect(ledger.record(1)).toBeUndefined();
    clock.advance(DRAW_AFTER * 1000);
    await ledger.settle();
    const record = ledger.record(1);
    if (!record) throw new Error("1회차 기록이 없다");
    expect(record.void).toBe(false);
    expect(record.count).toBe(3); // 나 + 연습 참가자 2명
    const rank = rankOf(record, ticket.numbers);
    const id = toHex(ticketId(ticket));
    for (const r of [1, 2, 3, 4, 5] as const)
      expect(record.winners[r].map(toHex).includes(id)).toBe(rank === r);
    const report = await ledger.verify([ticketId(ticket)]);
    expect(report.problems).toEqual([]);
  });

  it("빈 회차도 기록 사슬로 이어 닫는다", async () => {
    const { clock, ledger } = setup();
    clock.advance((3 * HOUR + DRAW_AFTER) * 1000);
    await ledger.settle();
    expect(ledger.closed()).toHaveLength(3);
    expect((await ledger.verify()).problems).toEqual([]);
  });
});

describe("연습 장부: 응모 받기", () => {
  it("같은 열쇠는 회차마다 한 장, 다음 회차에는 등록 없이 낸다", async () => {
    const { clock, ledger } = setup();
    const me = await passkey();
    await enter(ledger, me, [1, 2, 3, 4, 5, 6]);
    await expect(
      enter(ledger, me, [7, 8, 9, 10, 11, 12], false),
    ).rejects.toThrow("이미 응모");
    clock.advance((HOUR + DRAW_AFTER) * 1000);
    await ledger.settle();
    expect(ledger.isRegistered(me.publicKey)).toBe(true);
    await enter(ledger, me, [7, 8, 9, 10, 11, 12], false);
    expect(ledger.status().entries).toBe(1);
  });

  it("등록 회차: 첫 응모 회차이고, 닫힌 뒤에도 같다. 응모 전이면 없다", async () => {
    const { clock, ledger } = setup();
    const me = await passkey();
    expect(await ledger.registeredRound(me.publicKey)).toBeNull();
    await enter(ledger, me, [1, 2, 3, 4, 5, 6]);
    expect(await ledger.registeredRound(me.publicKey)).toBe(1);
    clock.advance((HOUR + DRAW_AFTER) * 1000);
    await ledger.settle();
    await enter(ledger, me, [7, 8, 9, 10, 11, 12], false);
    expect(await ledger.registeredRound(me.publicKey)).toBe(1);
  });

  it("등록하지 않은 열쇠, 앞 회차 추첨 전, 마감 뒤 응모는 받지 않는다", async () => {
    const { clock, ledger } = setup();
    const me = await passkey();
    await expect(enter(ledger, me, [1, 2, 3, 4, 5, 6], false)).rejects.toThrow(
      "등록되지 않은",
    );
    clock.advance(HOUR * 1000);
    await expect(enter(ledger, me, [1, 2, 3, 4, 5, 6])).rejects.toThrow(
      "앞 회차 추첨",
    );
  });

  it("마감 시각을 넘긴 1회차 응모권은 받지 않는다", async () => {
    const { clock, ledger } = setup();
    const me = await passkey();
    const entry = ledger.schedule.entries[0];
    if (!entry) throw new Error("일정표가 비었다");
    const ticket = await makeTicket(
      me,
      1,
      [1, 2, 3, 4, 5, 6],
      ledger.head(),
      entry.powTarget,
      { params: PRACTICE_POW },
    );
    if (!ticket) throw new Error("응모권을 만들지 못했다");
    clock.advance(HOUR * 1000);
    await expect(ledger.submit(ticket)).rejects.toThrow(
      "마감됐어요(서버 시각 15:55:00)",
    );
  });
});

describe("연습 장부: 저장과 건너뛰기", () => {
  it("다시 열어도 같은 장부다", async () => {
    const store = memoryStore();
    const { clock, ledger } = setup(store);
    const me = await passkey();
    await enter(ledger, me, [5, 10, 15, 20, 25, 30]);
    clock.advance((HOUR + DRAW_AFTER) * 1000);
    await ledger.settle();
    const again = new LocalLedger({
      clock,
      store,
      policy: DEFAULT_WEBAUTHN_POLICY,
      bots: 2,
    });
    expect(toHex(again.head())).toBe(toHex(ledger.head()));
    expect(again.isRegistered(me.publicKey)).toBe(true);
    expect((await again.verify()).problems).toEqual([]);
  });

  it("판 1로 저장된 장부(컴퓨터 참가자가 원시 열쇠로 등록했다)는 읽지 않고 새로 시작한다(docs/36 11-11)", async () => {
    const store = memoryStore();
    const { clock, ledger } = setup(store);
    await ledger.skipToNextDraw();
    const saved = JSON.parse(store.text ?? "{}");
    // 예전 판: 1회차 마감이 한 시간 이른 장부, 기록 하나와 원시 열쇠 등록(종류 01)
    store.save(
      JSON.stringify({
        ...saved,
        v: 1,
        epoch: saved.epoch - HOUR,
        registrations: [[`AQEAAA${"A".repeat(90)}`]],
      }),
    );
    const fresh = new LocalLedger({
      clock,
      store,
      policy: DEFAULT_WEBAUTHN_POLICY,
      bots: 2,
    });
    expect(fresh.schedule.epoch).not.toBe(saved.epoch - HOUR);
    expect(fresh.record(1)).toBeUndefined();
  });

  it("건너뛰기는 다음 추첨 시각까지 시간을 옮겨 추첨한다", async () => {
    const { ledger } = setup();
    await ledger.skipToNextDraw();
    expect(ledger.record(1)).toBeDefined();
    expect(ledger.status()).toMatchObject({ round: 2, phase: "open" });
  });
});

describe("무작위 번호", () => {
  it("1~45에서 서로 다른 6개를 오름차순으로", () => {
    let i = 0;
    const pick = randomPick((n) => Uint8Array.from({ length: n }, () => i++));
    expect(pick).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("225 이상은 버린다(치우침 없음)", () => {
    // 230·240은 버리고, 45→1·46→2는 겹쳐 건너뛴다
    const bytes = [230, 0, 240, 45, 1, 46, 2, 3, 4, 5];
    let i = 0;
    const pick = randomPick((n) =>
      Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length] as number),
    );
    expect(pick).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("데모 국장 모드(운영 기록, docs/36 11-12)", () => {
  it("서버 설정에 넣기 → 3회차 예고 뒤 국장 → 시험 소속 추가 → 예고 뒤 적용, 국장 아닌 패스키는 거절, 장부 검사 통과", async () => {
    const store = memoryStore();
    const { ledger } = setup(store);
    const director = await passkey();
    ledger.designateDirector(
      directorKeyConfig(director.credentialId, director.publicKey),
    );
    await ledger.skipToNextDraw();
    let state = await ledger.directorState();
    expect(state.view.operations).toMatchObject([
      {
        kind: "director-add",
        signer: "seal",
        status: "pending",
        round: 1,
        effectiveRound: 5,
      },
    ]);
    const body = (s: typeof state, effectiveRound: number): OpBody => ({
      v: OP_VERSION,
      kind: "affiliation-add",
      after: fromHex(s.view.next.after),
      effectiveRound,
      fields: {
        name: "시험 성단",
        badge: 2,
        method: "초대 코드",
        issuerKey: new Uint8Array(),
        issued: 0,
      },
    });
    // 아직 국장이 아니다
    await expect(
      ledger.submitOperation(
        await signAsDirector(
          body(state, state.view.next.earliestEffectiveRound),
          director,
        ),
      ),
    ).rejects.toThrow(/국장 열쇠가 아닙니다/);
    await ledger.skipRounds(5);
    state = await ledger.directorState();
    expect(state.view.directors).toHaveLength(1);
    const stranger = await passkey();
    await expect(
      ledger.submitOperation(
        await signAsDirector(
          body(state, state.view.next.earliestEffectiveRound),
          stranger,
        ),
      ),
    ).rejects.toThrow(/국장 열쇠가 아닙니다/);
    await ledger.submitOperation(
      await signAsDirector(
        body(state, state.view.next.earliestEffectiveRound),
        director,
      ),
    );
    await ledger.skipToNextDraw();
    expect((await ledger.directorState()).view.affiliations).toEqual([]);
    await ledger.skipRounds(5);
    state = await ledger.directorState();
    expect(state.view.affiliations).toMatchObject([
      { name: "시험 성단", badgeName: "성단" },
    ]);
    // 저장했다가 다시 열어도 같다
    const reopened = setup(store).ledger;
    expect((await reopened.directorState()).view.affiliations).toHaveLength(1);
    const report = await ledger.verify();
    expect(report.problems).toEqual([]);
  }, 20_000);
});

describe("연습 장부: 데모 상품 자격(docs/36 11-13)", () => {
  it("데모 국장·소속·기간을 차리고, 데모 기관 계정으로 받은 증서를 붙여 응모하면 상품 대상이 된다", async () => {
    const { ledger, store } = setup();
    await ledger.prepareDemoQualification();
    const info = await ledger.qualInfo();
    expect(info.periods).toMatchObject([
      {
        affiliationName: "벌집 성단",
        method: "데모 기관 계정",
        open: true,
        verify: "demo",
      },
    ]);
    const period = info.periods[0];
    if (!period) throw new Error("기간이 없다");
    // 기기: 자격 열쇠를 만들어 가리고, 받은 도장을 벗긴다
    const seed = newQualSeed();
    const periodId = fromHex(period.id);
    const request = blindStampRequest(
      periodId,
      qualKeyFromSeed(seed).publicKey,
    );
    const blindStamp = await ledger.issueStamp(
      period.id,
      "demo",
      request.blinded,
    );
    const holding = {
      periodId,
      seed,
      stamp: unblindStamp(blindStamp, request.factor),
    };
    const mine = await enter(
      ledger,
      await passkey(),
      [1, 2, 3, 4, 5, 6],
      true,
      holding,
    );
    expect(mine.v).toBe(2);
    await ledger.skipToNextDraw();
    const report = await ledger.verify();
    expect(report.problems).toEqual([]);
    const judged = report.qualification.rounds.find(
      (r) => r.round === mine.round,
    );
    expect(judged?.eligible.map(toHex)).toEqual([toHex(ticketId(mine))]);
    expect((await ledger.qualInfo()).periods[0]?.issued).toBe(1);
    // 다시 불러도 그대로(이미 받을 수 있는 기간이 있으면 아무것도 하지 않는다)
    const records = ledger.closed().length;
    await setup(store).ledger.prepareDemoQualification();
    expect(setup(store).ledger.closed().length).toBe(records);
  }, 60_000);
});

describe("당첨 확인 화면의 소속 표시(2026-10-31 보안 검토 B1)", () => {
  it("유효한 증서는 있음, 같은 증서 두 장은 둘 다 중복, 증서 없는 응모권은 없음", async () => {
    const { ledger } = setup();
    await ledger.prepareDemoQualification();
    const period = (await ledger.qualInfo()).periods[0];
    if (!period) throw new Error("기간이 없다");
    const issue = async () => {
      const seed = newQualSeed();
      const periodId = fromHex(period.id);
      const request = blindStampRequest(
        periodId,
        qualKeyFromSeed(seed).publicKey,
      );
      const blind = await ledger.issueStamp(period.id, "demo", request.blinded);
      return { periodId, seed, stamp: unblindStamp(blind, request.factor) };
    };
    const solo = await issue();
    const shared = await issue();
    const a = await enter(
      ledger,
      await passkey(),
      [1, 2, 3, 4, 5, 6],
      true,
      solo,
    );
    const b = await enter(
      ledger,
      await passkey(),
      [7, 8, 9, 10, 11, 12],
      true,
      shared,
    );
    const c = await enter(
      ledger,
      await passkey(),
      [13, 14, 15, 16, 17, 18],
      true,
      shared,
    );
    const d = await enter(ledger, await passkey(), [19, 20, 21, 22, 23, 24]);
    await ledger.skipToNextDraw();
    const round = a.round;
    const marks = qualMarks(
      ledger.schedule,
      await ledger.qualInfo(),
      round,
      roundTimes(ledger.schedule, round).closesAt,
      ledger.ticketsOf(round),
    );
    const of = (t: Ticket) => marks.get(toHex(ticketId(t)))?.kind;
    expect(of(a)).toBe("yes");
    expect(of(b)).toBe("dup");
    expect(of(c)).toBe("dup");
    expect(of(d)).toBe("none");
  }, 60_000);
});
