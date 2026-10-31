import { createHash } from "node:crypto";
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
  encodeRegistration,
  encodeRegistrationProof,
  encodeTicket,
  fromBase64Url,
  fromHex,
  generateSigner,
  type KeyRegistration,
  leafHash,
  makeRegistration,
  makeTicket,
  type PowParams,
  p1363ToDer,
  type QualHolding,
  type RekorLog,
  type RoundRecord,
  roundTimes,
  type Schedule,
  type SoftPasskey,
  sha256,
  signRegistrationProof,
  softPasskeySigner,
  type Ticket,
  taggedHash,
  toHex,
} from "@mighty/stardraw-core";

import { DEFAULT_PREFIX_LIMITS } from "./config";
import { type QualificationOptions, StardrawServer } from "./engine";
import {
  type Anchor,
  type DrandSource,
  LocalRootLog,
  type LogResult,
  noAnchor,
  type RootLog,
} from "./outside";
import type { PowChecker } from "./pow-pool";
import {
  type GenesisFile,
  type HeadFile,
  Publisher,
  pad,
  type RoundFile,
} from "./publish";
import { DEFAULT_RELAY_LIMITS, Relay, type RelayLimits } from "./relay";
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
    /** 당첨자 확인 요청 상한(기본 DEFAULT_RELAY_LIMITS) */
    relay?: Partial<RelayLimits>;
    /** 처음 일정표(기본 SCHEDULE). 데이터 폴더에 장부가 있으면 그것이 우선이다 */
    schedule?: Schedule;
    /** 이미 있는 데이터 폴더(서버를 다시 띄우는 시험). 없으면 새 임시 폴더 */
    dir?: string;
    /** 시계를 놓을 시각(초, 기본 EPOCH) */
    at?: number;
    /** 투명성 로그(기본: 지금 시각을 적는 가짜). 서버 열쇠·시계를 받아 만든다 */
    rootLog?: (serverKey: ServerKey, clock: ManualClock) => RootLog;
    /** 앵커(기본: 남기지 않음) */
    anchor?: Anchor;
    /** 지난 회차 사본 커밋 하나의 글 크기 상한(기본 엔진 값) */
    mirrorCommitBytes?: number;
    /** 서버 열쇠(기본: 새로 만듦) */
    serverKey?: ServerKey;
    /** 서버 설정의 국장 열쇠(STARDRAW_DIRECTOR_KEYS) */
    directorKeys?: { credentialId: Uint8Array; pub: Uint8Array }[];
    /** 상품 자격 발급 설정 */
    qualification?: QualificationOptions;
    /** 작업 증명 확인(기본: 같은 스레드에서 실제 계산) */
    powChecker?: PowChecker;
  } = {},
): Promise<Rig> {
  const dir = limits.dir ?? mkdtempSync(join(tmpdir(), "stardraw-"));
  const clock = new ManualClock();
  clock.advance((limits.at ?? EPOCH) * 1000);
  const store = new Store(join(dir, "stardraw.sqlite"));
  const drand = new FakeDrand();
  const serverKey =
    limits.serverKey ?? (await serverKeyFromPkcs8(await newServerKeyPkcs8()));
  const log = new SwitchLog(
    limits.rootLog
      ? limits.rootLog(serverKey, clock)
      : new LocalRootLog(() => Math.floor(clock.now() / 1000)),
  );
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
    anchor: limits.anchor ?? noAnchor,
    ...(limits.mirrorCommitBytes
      ? { mirrorCommitBytes: limits.mirrorCommitBytes }
      : {}),
    limits: {
      entriesPerPrefixPerRound:
        limits.entriesPerPrefixPerRound ??
        DEFAULT_PREFIX_LIMITS.entriesPerPrefixPerRound,
      registrationsPerPrefixPerDay:
        limits.registrationsPerPrefixPerDay ??
        DEFAULT_PREFIX_LIMITS.registrationsPerPrefixPerDay,
      argonConcurrency: 2,
      argonQueue: 32,
    },
    sealDeadline: 180,
    ...(limits.directorKeys ? { directorKeys: limits.directorKeys } : {}),
    ...(limits.qualification ? { qualification: limits.qualification } : {}),
    ...(limits.powChecker ? { powChecker: limits.powChecker } : {}),
    log: (m) => logs.push(m),
  });
  await engine.ready();
  const relay = new Relay(
    store,
    clock,
    { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    { ...DEFAULT_RELAY_LIMITS, ...limits.relay },
    (pub) => engine.isActiveDirector(pub),
  );
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
  signer: SoftPasskey;
  registered: boolean;
}

export async function player(): Promise<Player> {
  return {
    signer: softPasskeySigner(await generateSigner()),
    registered: false,
  };
}

/** 응모권(과 처음이면 열쇠 등록)을 만든다 */
export async function entryFor(
  p: Player,
  round: number,
  numbers: number[],
  challenge: Uint8Array,
  qual?: QualHolding | null,
): Promise<{ ticket: Ticket; registration?: KeyRegistration }> {
  const ticket = await makeTicket(
    p.signer,
    round,
    numbers,
    challenge,
    EASY,
    { params: TEST_POW },
    qual,
  );
  if (!ticket) throw new Error("응모권을 만들지 못했다");
  if (p.registered) return { ticket };
  const registration = await makeRegistration(
    p.signer,
    p.signer.credentialId,
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
  qual?: QualHolding | null,
) {
  const round = rig.engine.state().round;
  const { ticket, registration } = await entryFor(
    p,
    round,
    numbers,
    rig.engine.head(),
    qual,
  );
  const receipt = await rig.engine.submit({
    ticket: encodeTicket(ticket),
    ...(registration ? { registration: encodeRegistration(registration) } : {}),
    ip,
  });
  p.registered = true;
  return { ticket, receipt };
}

/** 응모 없이 등록만 올린다(우주인 등록 직후, 패스키 서명으로 증명) */
export async function registerOnly(
  rig: Rig,
  p: Player,
  ip = "203.0.113.7",
  head: Uint8Array = rig.engine.head(),
) {
  const registration = await makeRegistration(
    p.signer,
    p.signer.credentialId,
    head,
    EASY,
    { params: TEST_POW },
  );
  if (!registration) throw new Error("등록을 만들지 못했다");
  const proof = await signRegistrationProof(p.signer, registration);
  const out = await rig.engine.register({
    registration: encodeRegistration(registration),
    proof: encodeRegistrationProof(proof),
    head: toHex(head),
    ip,
  });
  p.registered = true;
  return out;
}

/** 서버가 쓴 공개 장부 파일만 읽는다(검사기가 내려받는 것과 같다) */
export function readLedger(dir: string) {
  const ledger = join(dir, "ledger");
  const genesisFile = JSON.parse(
    readFileSync(join(ledger, "genesis.json"), "utf8"),
  ) as GenesisFile;
  const genesis = genesisFile.schedule;
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
  return { genesis, head, records, tickets, registrations, seals };
}

/** 장부 seals/N 파일의 로그 증거(Rekor 항목 등) */
export function readSealLog(dir: string, round: number): unknown {
  const file = JSON.parse(
    readFileSync(join(dir, "ledger", "seals", `${pad(round)}.json`), "utf8"),
  ) as { log: unknown };
  return file.log;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/**
 * 가짜 Rekor: 자기 로그 열쇠(P-256)로 진짜와 같은 모양의 응답을 만든다(SET·체크포인트 서명, 잎 하나짜리 트리).
 * 검사기는 이 로그 정의(`log`)를 받아 진짜와 같은 규칙으로 확인한다.
 */
export class FakeRekor {
  /** 다음 응답 상태(201이 정상) */
  status = 201;
  /** SET을 일부러 틀리게 */
  tamperSet = false;
  posts = 0;

  private constructor(
    readonly log: RekorLog,
    private readonly key: CryptoKeyPair,
    private readonly nowSeconds: () => number,
  ) {}

  static async create(nowSeconds: () => number): Promise<FakeRekor> {
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const spki = new Uint8Array(
      await crypto.subtle.exportKey("spki", key.publicKey),
    );
    return new FakeRekor(
      {
        name: "fake.rekor.test",
        url: "https://fake.rekor.test",
        publicKeySpki: b64(spki),
        logID: toHex(sha256(spki)),
      },
      key,
      nowSeconds,
    );
  }

  private async signDer(message: Uint8Array): Promise<Uint8Array> {
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        this.key.privateKey,
        new Uint8Array(message),
      ),
    );
    return p1363ToDer(raw);
  }

  fetch: typeof fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    if (!url.endsWith("/api/v1/log/entries") || init?.method !== "POST")
      return new Response("not found", { status: 404 });
    this.posts++;
    if (this.status !== 201)
      return new Response("오류", { status: this.status });
    const body = new TextEncoder().encode(String(init.body));
    const bodyB64 = b64(body);
    const integratedTime = this.nowSeconds();
    const logIndex = this.posts;
    const root = leafHash(body);
    const text = `${this.log.name} - 1\n1\n${b64(root)}\n`;
    const cpSig = concat(
      fromHex(this.log.logID).slice(0, 4),
      await this.signDer(new TextEncoder().encode(text)),
    );
    const checkpoint = `${text}\n— ${this.log.name} ${b64(cpSig)}\n`;
    const setPayload = `{"body":${JSON.stringify(bodyB64)},"integratedTime":${integratedTime + (this.tamperSet ? 1 : 0)},"logID":${JSON.stringify(this.log.logID)},"logIndex":${logIndex}}`;
    const set = await this.signDer(new TextEncoder().encode(setPayload));
    const uuid = toHex(sha256(body));
    return new Response(
      JSON.stringify({
        [uuid]: {
          body: bodyB64,
          integratedTime,
          logID: this.log.logID,
          logIndex,
          verification: {
            inclusionProof: {
              checkpoint,
              hashes: [],
              logIndex: 0,
              rootHash: toHex(root),
              treeSize: 1,
            },
            signedEntryTimestamp: b64(set),
          },
        },
      }),
      { status: 201 },
    );
  }) as typeof fetch;
}

/**
 * 가짜 GitHub(앵커): Contents API(파일 하나 읽기·쓰기)와 git tree/commit API(여러 파일을 커밋 하나로).
 * 브랜치마다 끝 커밋과 그 파일들(경로 → 글)을 둔다. 쓰기(PUT·POST·PATCH)는 `failures`번 500으로,
 * 트리 만들기는 `treeFailures`번 500으로 실패한다. 실제처럼 Contents API는 없는 브랜치(main 말고)에 쓰지 못한다
 */
export class FakeGitHub {
  /** 브랜치 → 끝 커밋 */
  private refs = new Map<string, string>();
  private commitsBySha = new Map<
    string,
    { tree: string; parents: string[]; message: string }
  >();
  private trees = new Map<string, Map<string, string>>();
  failures = 0;
  treeFailures = 0;
  /** 브랜치에 들어간 커밋(차례대로): 메시지와 바꾼 경로 */
  commits: { branch: string; message: string; paths: string[] }[] = [];
  /** 받은 API 요청 수 */
  calls = 0;
  /** 마지막 요청에 토큰 머리글이 있었는지(값은 보지 않는다) */
  sawAuth = false;

  constructor() {
    this.trees.set(this.treeSha(new Map()), new Map());
  }

  private treeSha(files: Map<string, string>): string {
    const sorted = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    return createHash("sha1").update(JSON.stringify(sorted)).digest("hex");
  }

  private filesOf(branch: string): Map<string, string> | undefined {
    const sha = this.refs.get(branch);
    if (!sha) return undefined;
    const c = this.commitsBySha.get(sha);
    return c ? this.trees.get(c.tree) : undefined;
  }

  /** 브랜치에 커밋 하나를 더한다(바뀐 경로를 commits에 남긴다) */
  private addCommit(tree: string, parents: string[], message: string): string {
    const sha = createHash("sha1")
      .update(
        `${tree} ${parents.join(",")} ${message} ${this.commitsBySha.size}`,
      )
      .digest("hex");
    this.commitsBySha.set(sha, { tree, parents, message });
    return sha;
  }

  /** 브랜치를 커밋으로 옮기고, 부모 커밋과 달라진 경로를 남긴다 */
  private moveRef(branch: string, sha: string): void {
    this.refs.set(branch, sha);
    const c = this.commitsBySha.get(sha);
    const parent = c?.parents[0] ? this.commitsBySha.get(c.parents[0]) : null;
    const before = (parent && this.trees.get(parent.tree)) || new Map();
    const after = (c && this.trees.get(c.tree)) || new Map<string, string>();
    const paths = [...after.keys()].filter(
      (k) => before.get(k) !== after.get(k),
    );
    this.commits.push({ branch, message: c?.message ?? "", paths });
  }

  fetch: typeof fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    this.calls++;
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    this.sawAuth = (headers.get("authorization") ?? "").startsWith("Bearer ");
    const method = init?.method ?? "GET";
    const rest = /^\/repos\/[^/]+\/[^/]+\/(.+)$/.exec(url.pathname)?.[1];
    if (!rest) return new Response("not found", { status: 404 });
    if (method !== "GET" && this.failures > 0) {
      this.failures--;
      return new Response("오류", { status: 500 });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status });

    const contents = /^contents\/(.+)$/.exec(rest);
    if (contents) {
      const path = decodeURIComponent(contents[1] as string);
      if (method === "PUT") {
        const { branch, content, message } = body as {
          branch: string;
          content: string;
          message: string;
        };
        const files = this.filesOf(branch);
        if (!files && branch !== "main")
          return json({ message: "Branch not found" }, 404);
        if (files?.has(path)) return json({ message: "sha" }, 422);
        const next = new Map(files ?? []);
        next.set(path, Buffer.from(content, "base64").toString());
        const tree = this.treeSha(next);
        this.trees.set(tree, next);
        const parent = this.refs.get(branch);
        this.moveRef(
          branch,
          this.addCommit(tree, parent ? [parent] : [], message),
        );
        return json({}, 201);
      }
      const text = this.filesOf(url.searchParams.get("ref") ?? "main")?.get(
        path,
      );
      return text === undefined
        ? json({ message: "Not Found" }, 404)
        : json({ content: Buffer.from(text).toString("base64") });
    }
    const branch = /^branches\/(.+)$/.exec(rest);
    if (branch && method === "GET") {
      const sha = this.refs.get(decodeURIComponent(branch[1] as string));
      const c = sha ? this.commitsBySha.get(sha) : undefined;
      return c
        ? json({ commit: { sha, commit: { tree: { sha: c.tree } } } })
        : json({ message: "Branch not found" }, 404);
    }
    if (rest === "git/trees" && method === "POST") {
      if (this.treeFailures > 0) {
        this.treeFailures--;
        return json({ message: "오류" }, 500);
      }
      const { base_tree, tree } = body as {
        base_tree: string;
        tree: { path: string; content: string }[];
      };
      const base = this.trees.get(base_tree);
      if (!base) return json({ message: "base_tree" }, 422);
      const next = new Map(base);
      for (const t of tree) next.set(t.path, t.content);
      const sha = this.treeSha(next);
      this.trees.set(sha, next);
      return json({ sha }, 201);
    }
    if (rest === "git/commits" && method === "POST") {
      const { tree, parents, message } = body as {
        tree: string;
        parents: string[];
        message: string;
      };
      return json({ sha: this.addCommit(tree, parents, message) }, 201);
    }
    if (rest === "git/refs" && method === "POST") {
      const { ref, sha } = body as { ref: string; sha: string };
      const name = ref.replace(/^refs\/heads\//, "");
      if (this.refs.has(name)) return json({ message: "exists" }, 422);
      this.moveRef(name, sha);
      return json({}, 201);
    }
    const ref = /^git\/refs\/heads\/(.+)$/.exec(rest);
    if (ref && method === "PATCH") {
      const name = ref[1] as string;
      const { sha } = body as { sha: string };
      const current = this.refs.get(name);
      // 빨리 감기만(끝 커밋이 새 커밋의 부모일 때)
      if (!current || !this.commitsBySha.get(sha)?.parents.includes(current))
        return json({ message: "not fast forward" }, 422);
      this.moveRef(name, sha);
      return json({});
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  text(branch: string, path: string): string | undefined {
    return this.filesOf(branch)?.get(path);
  }
}
