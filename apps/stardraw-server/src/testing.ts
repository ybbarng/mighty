import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManualClock } from "@mighty/fair-play";
import {
  ByteWriter,
  concat,
  type DrandBeacon,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  drandRandomness,
  drandRoundForClose,
  drandTime,
  drawNumbers,
  drawSeed,
  type EntrantSigner,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  generateSigner,
  type KeyRegistration,
  makeRegistration,
  makeTicket,
  type PowParams,
  type RoundRecord,
  roundTimes,
  type Schedule,
  type Ticket,
  taggedHash,
} from "@mighty/stardraw-core";

import { StardrawServer } from "./engine";
import {
  type DrandSource,
  LocalRootLog,
  type LogResult,
  noAnchor,
  type RootLog,
} from "./outside";
import {
  type GenesisFile,
  type HeadFile,
  Publisher,
  pad,
  type RoundFile,
} from "./publish";
import { Relay } from "./relay";
import {
  newServerKeyPkcs8,
  type ServerKey,
  serverKeyFromPkcs8,
} from "./server-key";
import { Store } from "./store";

/**
 * 시험 도구. 작업 증명은 가장 작은 메모리와 넉넉한 목표값으로 몇 번 만에 풀린다.
 * drand는 회차마다 정해진 가짜 서명(검사기는 서명 확인을 바꿔 끼운다), 로그는 지금 시각을 적는다.
 */

export const TEST_POW: PowParams = { memorySize: 8, iterations: 1 };
export const EASY = 2 ** 31;
// 2026-10-29 14:55 KST. 1회차 마감 15:55, 추첨 16:00(매시 정각 추첨 · 55분 마감)
export const EPOCH = 1793253300;

export const SCHEDULE: Schedule = {
  epoch: EPOCH,
  entries: [
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 5,
      powTarget: EASY,
      registerPowTarget: EASY,
    },
  ],
};

export function fakeBeacon(round: number): DrandBeacon {
  const tag = (i: number) =>
    taggedHash("test/beacon", new ByteWriter().u64(round).u8(i).done());
  return { round, signature: concat(tag(0), tag(1).slice(0, 16)) };
}

/** 정해진 가짜 drand. `missing`에 든 회차는 아직 안 나온 것처럼 null */
export class FakeDrand implements DrandSource {
  missing = new Set<number>();
  async get(round: number): Promise<DrandBeacon | null> {
    return this.missing.has(round) ? null : fakeBeacon(round);
  }
}

/** 실패를 흉내 내는 로그 */
export class SwitchLog implements RootLog {
  failing = false;
  constructor(private readonly inner: RootLog) {}
  async log(digest: Uint8Array): Promise<LogResult | null> {
    return this.failing ? null : this.inner.log(digest);
  }
}

/** 회차 k에 나올 당첨 번호(가짜 drand라 미리 안다) */
export function drawOf(round: number) {
  const { closesAt } = roundTimes(SCHEDULE, round);
  return drawNumbers(
    drawSeed(round, drandRandomness(fakeBeacon(drandRoundForClose(closesAt)))),
  );
}

export interface Rig {
  dir: string;
  clock: ManualClock;
  store: Store;
  engine: StardrawServer;
  relay: Relay;
  drand: FakeDrand;
  log: SwitchLog;
  serverKey: ServerKey;
  logs: string[];
  /** 시계를 초 단위 시각으로 옮기고 할 일을 한다 */
  at(seconds: number): Promise<void>;
  /** 회차를 정상으로 끝낸다: 마감 때 봉인하고, drand 시각에 추첨한다 */
  finish(round: number): Promise<void>;
  close(): void;
}

export async function makeRig(
  limits: {
    entriesPerPrefixPerRound?: number;
    registrationsPerPrefixPerDay?: number;
    /** 처음 일정표(기본 SCHEDULE). 데이터 폴더에 장부가 있으면 그것이 우선이다 */
    schedule?: Schedule;
    /** 이미 있는 데이터 폴더(start-live로 만든 정식 장부 등). 없으면 새 임시 폴더 */
    dir?: string;
    /** 시계를 놓을 시각(초, 기본 EPOCH) */
    at?: number;
  } = {},
): Promise<Rig> {
  const dir = limits.dir ?? mkdtempSync(join(tmpdir(), "stardraw-"));
  const clock = new ManualClock();
  clock.advance((limits.at ?? EPOCH) * 1000);
  const store = new Store(join(dir, "stardraw.sqlite"));
  const drand = new FakeDrand();
  const log = new SwitchLog(
    new LocalRootLog(() => Math.floor(clock.now() / 1000)),
  );
  const serverKey = await serverKeyFromPkcs8(await newServerKeyPkcs8());
  const logs: string[] = [];
  const engine = new StardrawServer({
    store,
    publisher: new Publisher(join(dir, "ledger")),
    clock,
    schedule: limits.schedule ?? SCHEDULE,
    pow: TEST_POW,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    serverKey,
    drand,
    rootLog: log,
    anchor: noAnchor,
    limits: {
      entriesPerPrefixPerRound: limits.entriesPerPrefixPerRound ?? 20,
      registrationsPerPrefixPerDay: limits.registrationsPerPrefixPerDay ?? 10,
      argonConcurrency: 2,
      argonQueue: 32,
    },
    sealDeadline: 180,
    log: (m) => logs.push(m),
  });
  const relay = new Relay(store, clock, {
    rpId: "game.byb.kr",
    origins: ["https://game.byb.kr"],
  });
  const at = async (seconds: number) => {
    const now = clock.now();
    if (seconds * 1000 > now) clock.advance(seconds * 1000 - now);
    await engine.tick();
  };
  return {
    dir,
    clock,
    store,
    engine,
    relay,
    drand,
    log,
    serverKey,
    logs,
    at,
    async finish(round) {
      const { closesAt } = roundTimes(engine.schedule(), round);
      await at(closesAt);
      await at(drandTime(drandRoundForClose(closesAt)));
    },
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 회차 k의 drand 시각(추첨이 되는 때) */
export function drawTimeOf(round: number): number {
  return drandTime(drandRoundForClose(roundTimes(SCHEDULE, round).closesAt));
}

export interface Player {
  signer: EntrantSigner & { publicKey: Uint8Array };
  registered: boolean;
}

export async function player(): Promise<Player> {
  return { signer: await generateSigner(), registered: false };
}

/** 응모권(과 처음이면 열쇠 등록)을 만든다 */
export async function entryFor(
  p: Player,
  round: number,
  numbers: number[],
  challenge: Uint8Array,
): Promise<{ ticket: Ticket; registration?: KeyRegistration }> {
  const ticket = await makeTicket(p.signer, round, numbers, challenge, EASY, {
    params: TEST_POW,
  });
  if (!ticket) throw new Error("응모권을 만들지 못했다");
  if (p.registered) return { ticket };
  const registration = await makeRegistration(
    p.signer,
    "raw",
    new Uint8Array(),
    challenge,
    EASY,
    { params: TEST_POW },
  );
  if (!registration) throw new Error("등록을 만들지 못했다");
  return { ticket, registration };
}

/** 엔진에 낸다(성공하면 그 사람은 등록된 것으로 친다) */
export async function enter(
  rig: Rig,
  p: Player,
  numbers: number[],
  ip = "203.0.113.7",
) {
  const round = rig.engine.state().round;
  const { ticket, registration } = await entryFor(
    p,
    round,
    numbers,
    rig.engine.head(),
  );
  const receipt = await rig.engine.submit({
    ticket: encodeTicket(ticket),
    ...(registration ? { registration: encodeRegistration(registration) } : {}),
    ip,
  });
  p.registered = true;
  return { ticket, receipt };
}

/** 서버가 쓴 공개 장부 파일만 읽는다(검사기가 내려받는 것과 같다) */
export function readLedger(dir: string) {
  const ledger = join(dir, "ledger");
  const genesisFile = JSON.parse(
    readFileSync(join(ledger, "genesis.json"), "utf8"),
  ) as GenesisFile;
  const genesis = genesisFile.schedule;
  const carried = genesisFile.carried.map((x) =>
    decodeRegistration(fromBase64Url(x)),
  );
  const head = JSON.parse(
    readFileSync(join(ledger, "head.json"), "utf8"),
  ) as HeadFile;
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  const registrations: KeyRegistration[][] = [];
  for (let r = 1; r <= head.rounds; r++) {
    const file = JSON.parse(
      readFileSync(join(ledger, "rounds", `${pad(r)}.json`), "utf8"),
    ) as RoundFile;
    records.push(decodeRecord(fromBase64Url(file.record)));
    tickets.push(file.tickets.map((t) => decodeTicket(fromBase64Url(t))));
    registrations.push(
      file.registrations.map((x) => decodeRegistration(fromBase64Url(x))),
    );
  }
  const seals = readdirSync(join(ledger, "seals")).length;
  return { genesis, carried, head, records, tickets, registrations, seals };
}
