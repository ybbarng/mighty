import {
  CHECK_LINK_REQUESTER,
  checkPow,
  closeRound,
  drandTime,
  type EntrantSigner,
  equalBytes,
  fromHex,
  generateSigner,
  genesisHash,
  githubAnchorVerifier,
  githubGenesisVerifier,
  type KeyRegistration,
  makeChallengeClaim,
  makeRegistration,
  makeTicket,
  newInviteToken,
  type PowParams,
  powTargetForTries,
  type RoundRecord,
  recordHash,
  type Schedule,
  type Signer,
  sealDigest,
  sealImprint,
  signInvite,
  signTicket,
  sortRegistrations,
  sortTickets,
  type Ticket,
  type TsaAuthority,
  type TsaProof,
  ticketContent,
  ticketId,
  tsaRootLogVerifier,
  unsignedTicket,
  verifyClaim,
  verifyInvite,
  verifyLedger,
} from "@mighty/stardraw-core";
import { FakeTsa } from "@mighty/stardraw-core/testing";

import {
  ANCHOR_REPO,
  type AnchorRepo,
  anchorRepoFor,
  repoFetch,
  toBase64,
  writeRoundAnchors,
} from "./lab";

/**
 * 공격해 보기: 브라우저 안에서 작은 실제 장부(2회차)를 만들고, 공격마다 장부를 고친 뒤
 * core의 장부 전체 검사(`verifyLedger`)와 당첨자 확인 검사(`verifyClaim`)가 어디서 잡는지 본다.
 *
 * - 1회차 마감은 drand quicknet 1000000회차(실제 값)가 추첨에 쓰이도록 맞췄다. 그래서 BLS 서명 확인도 실제로 돈다.
 *   당첨 번호는 5·29·37·38·41·45, 보너스 4(시험 벡터와 같다).
 * - 2회차는 시각 인증을 받지 못한 무효 회차라 drand 값이 필요 없다(사슬 잇기를 보려고 둔다).
 * - 작업 증명은 Argon2id 메모리를 8KiB로 낮췄다(규칙은 16MB). 시각 인증 기관은 연습용 가짜 기관(`FakeTsa`)이다.
 */

export const ATTACK_POW: PowParams = { memorySize: 8, iterations: 1 };
const POW_TARGET = powTargetForTries(2);

/** quicknet 1000000회차(api.drand.sh에서 받은 실제 값, core 시험 벡터와 같다) */
const BEACON_1M = {
  round: 1000000,
  signature: fromHex(
    "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
  ),
};

/** 1회차 마감 + 5분 뒤 첫 drand 회차가 1000000회차가 되는 마감 시각 */
const CLOSE_1 = drandTime(BEACON_1M.round) - 300;

export const ATTACK_SCHEDULE: Schedule = {
  epoch: CLOSE_1 - 3600,
  entries: [
    {
      fromRound: 1,
      length: 3600,
      closeMargin: 5,
      powTarget: POW_TARGET,
      registerPowTarget: POW_TARGET,
    },
  ],
};

export const WINNING = [5, 29, 37, 38, 41, 45];

export interface Person {
  name: string;
  signer: Signer;
  numbers: number[];
}

export interface MiniLedger {
  genesis: Schedule;
  records: RoundRecord[];
  tickets: Ticket[][];
  registrations: KeyRegistration[][];
  /** 회차 → 봉인 증거(seals/N.json의 log) */
  seals: Map<number, TsaProof>;
  anchors: AnchorRepo;
  /** 기기가 기억한 장부 끝 해시 */
  rememberedHead: Uint8Array;
  /** 봉인 토큰을 낸 연습용 시각 인증 기관(검사기가 믿는 기관) */
  authority: TsaAuthority;
}

export interface World {
  people: Person[];
  /** 운영자의 열쇠(공격에 쓴다) */
  operator: Signer;
  tsa: FakeTsa;
  ledger: MiniLedger;
}

async function register(signer: Signer, challenge: Uint8Array) {
  const r = await makeRegistration(
    signer,
    "raw",
    new Uint8Array(),
    challenge,
    POW_TARGET,
    { params: ATTACK_POW },
  );
  if (!r) throw new Error("등록을 만들지 못했다");
  return r;
}

async function ticket(
  signer: EntrantSigner,
  round: number,
  numbers: number[],
  challenge: Uint8Array,
): Promise<Ticket> {
  const t = await makeTicket(signer, round, numbers, challenge, POW_TARGET, {
    params: ATTACK_POW,
  });
  if (!t) throw new Error("응모권을 만들지 못했다");
  return t;
}

function stamp(tsa: FakeTsa, record: RoundRecord): TsaProof {
  const genTime = record.rootLoggedAt;
  return {
    kind: "tsa",
    tokens: [
      {
        tsa: tsa.authority.name,
        genTime,
        token: toBase64(tsa.stamp(sealImprint(sealDigest(record)), genTime)),
      },
    ],
  };
}

/** 정직한 서버가 만드는 2회차 장부 */
export async function buildWorld(): Promise<World> {
  const genesis = ATTACK_SCHEDULE;
  const challenge = genesisHash(genesis);
  const names: [string, number[]][] = [
    ["나", WINNING],
    ["민지", [1, 8, 15, 22, 29, 36]],
    ["준호", [5, 29, 37, 2, 9, 17].sort((a, b) => a - b)],
  ];
  const people: Person[] = await Promise.all(
    names.map(async ([name, numbers]) => ({
      name,
      numbers,
      signer: await generateSigner(),
    })),
  );
  const operator = await generateSigner();
  const tsa = new FakeTsa("practice-tsa", () => CLOSE_1);

  const regs = sortRegistrations(
    await Promise.all(people.map((p) => register(p.signer, challenge))),
  );
  const tickets1 = sortTickets(
    await Promise.all(
      people.map((p) => ticket(p.signer, 1, p.numbers, challenge)),
    ),
  );
  const record1 = closeRound({
    schedule: genesis,
    round: 1,
    prev: challenge,
    tickets: tickets1,
    registrations: regs,
    rootLoggedAt: CLOSE_1 + 30,
    beacon: BEACON_1M,
  });
  const record2 = closeRound({
    schedule: genesis,
    round: 2,
    prev: recordHash(record1),
    tickets: [],
    rootLoggedAt: 0,
    beacon: null,
  });
  const records = [record1, record2];
  const seals = new Map([[1, stamp(tsa, record1)]]);
  const anchors = anchorRepoFor(genesis, records);
  const ledger: MiniLedger = {
    genesis,
    records,
    tickets: [tickets1, []],
    registrations: [regs, []],
    seals,
    anchors,
    rememberedHead: recordHash(record2),
    authority: tsa.authority,
  };
  return { people, operator, tsa, ledger };
}

export interface CheckOutcome {
  /** 장부 전체 검사의 문제(회차와 문장) */
  problems: string[];
  /** 기기가 기억한 끝 해시를 새 장부가 이어받는지 */
  headKept: boolean;
}

/** core의 장부 전체 검사: 사슬, 등록, 서명, 1인 1장, 머클 루트, 봉인 시각 증거, drand, 당첨 번호·등수, 작업 증명, 앵커 */
export async function checkLedger(l: MiniLedger): Promise<CheckOutcome> {
  const fetchFn = repoFetch(l.anchors);
  const report = await verifyLedger(
    l.genesis,
    l.records,
    l.tickets,
    l.registrations,
    {
      powParams: ATTACK_POW,
      powSample: Number.POSITIVE_INFINITY,
      rootLogVerifier: tsaRootLogVerifier((round) => l.seals.get(round), {
        // 연습용 가짜 기관만 믿는다(실제 기관 토큰 확인은 5단계)
        authorities: [l.authority],
      }),
      anchorVerifier: githubAnchorVerifier({
        repo: ANCHOR_REPO,
        genesis: l.genesis,
        fetchFn,
      }),
      genesisAnchorVerifier: githubGenesisVerifier({
        repo: ANCHOR_REPO,
        fetchFn,
      }),
    },
  );
  // 기기는 마지막으로 본 끝 해시가 새 장부의 사슬 위에 있는지 본다
  let head = genesisHash(l.genesis);
  let kept = equalBytes(head, l.rememberedHead);
  for (const r of l.records) {
    head = recordHash(r);
    if (equalBytes(head, l.rememberedHead)) kept = true;
  }
  return {
    problems: report.problems.map((p) =>
      p.round === 0 ? p.message : `${p.round}회차: ${p.message}`,
    ),
    headKept: kept,
  };
}

/** 장부를 고칠 수 있게 복사한다 */
export function cloneLedger(w: World): MiniLedger {
  const l = w.ledger;
  return {
    ...l,
    records: l.records.map((r) => ({ ...r, numbers: [...r.numbers] })),
    tickets: l.tickets.map((t) => [...t]),
    registrations: l.registrations.map((r) => [...r]),
    seals: new Map(l.seals),
    anchors: new Map(l.anchors),
  };
}

/** 1회차 응모권 목록을 바꾼 뒤 서버가 하듯 기록을 다시 닫는다(봉인 증거는 그대로: 운영자가 기관 서명을 새로 받을 수 없다) */
function recloseRound1(
  l: MiniLedger,
  tickets: Ticket[],
  regs = l.registrations[0] ?? [],
) {
  const old = l.records[0] as RoundRecord;
  const sorted = sortTickets(tickets);
  l.tickets[0] = sorted;
  l.registrations[0] = sortRegistrations(regs);
  l.records[0] = closeRound({
    schedule: l.genesis,
    round: 1,
    prev: old.prev,
    tickets: sorted,
    registrations: l.registrations[0],
    rootLoggedAt: old.rootLoggedAt,
    beacon: BEACON_1M,
  });
}

/** 고친 회차 뒤 사슬을 다시 잇고 앵커 저장소도 강제 push로 고쳐 쓴다(운영자가 할 수 있는 만큼 감춘다) */
function coverUp(l: MiniLedger) {
  let prev = genesisHash(l.genesis);
  l.records = l.records.map((r) => {
    const next = { ...r, prev };
    prev = recordHash(next);
    return next;
  });
  writeRoundAnchors(l.genesis, l.records, l.anchors);
}

export type Role = "operator" | "entrant" | "middle";

export interface Attack {
  id: string;
  role: Role;
  title: string;
  /** 무엇을 하는지 한 줄 */
  how: string;
  run(w: World): Promise<AttackResult>;
}

export interface AttackResult {
  /** 어디서 걸렸나(검사가 낸 문장 그대로) */
  caught: string[];
  /** 걸린 까닭 한 줄 */
  why: string;
}

async function ledgerAttack(l: MiniLedger, why: string): Promise<AttackResult> {
  const outcome = await checkLedger(l);
  const caught = [...outcome.problems];
  if (!outcome.headKept)
    caught.push("기기: 마지막으로 본 장부 끝 해시를 새 장부가 이어받지 않는다");
  return { caught, why };
}

/** 확인 문구 증명(당첨자 확인) 흉내: 확인 링크로 붙은 요청의 문구 */
const REQUEST = { challenge: "K7Q2MX9PRA", requester: CHECK_LINK_REQUESTER };

function myTicket(w: World): Ticket {
  const me = w.people[0] as Person;
  const t = (w.ledger.tickets[0] ?? []).find((x) =>
    equalBytes(x.pub, me.signer.publicKey),
  );
  if (!t) throw new Error("내 응모권이 없다");
  return t;
}

export const ATTACKS: readonly Attack[] = [
  {
    id: "op-numbers",
    role: "operator",
    title: "당첨 번호 바꾸기",
    how: "1회차 당첨 번호를 바꾸고, 뒤 기록과 앵커까지 고쳐 쓴다",
    run: async (w) => {
      const l = cloneLedger(w);
      const r = l.records[0] as RoundRecord;
      l.records[0] = { ...r, numbers: [1, 2, 3, 4, 5, 6] };
      coverUp(l);
      return ledgerAttack(
        l,
        "번호는 drand 값에서 정해진다. 누구든 다시 계산하면 다르다",
      );
    },
  },
  {
    id: "op-insert",
    role: "operator",
    title: "결과를 보고 내 응모권 끼워 넣기",
    how: "drand 값이 나온 뒤 당첨 번호로 응모권을 만들어 넣고, 뒤 기록과 앵커까지 고쳐 쓴다",
    run: async (w) => {
      const l = cloneLedger(w);
      const challenge = genesisHash(l.genesis);
      const reg = await register(w.operator, challenge);
      const mine = await ticket(w.operator, 1, WINNING, challenge);
      recloseRound1(
        l,
        [...(l.tickets[0] ?? []), mine],
        [...(l.registrations[0] ?? []), reg],
      );
      coverUp(l);
      return ledgerAttack(
        l,
        "응모권 목록이 바뀌면 봉인 값이 바뀐다. 마감 직후 기관이 서명한 토큰은 옛 봉인 값을 담고 있다",
      );
    },
  },
  {
    id: "op-remove",
    role: "operator",
    title: "남의 당첨 응모권 빼기",
    how: "1회차 1등 응모권(나)을 목록에서 빼고, 뒤 기록과 앵커까지 고쳐 쓴다",
    run: async (w) => {
      const l = cloneLedger(w);
      const mine = ticketId(myTicket(w));
      recloseRound1(
        l,
        (l.tickets[0] ?? []).filter((t) => !equalBytes(ticketId(t), mine)),
      );
      coverUp(l);
      const result = await ledgerAttack(
        l,
        "봉인 값이 기관 토큰과 어긋난다. 나는 응모 영수증(서버 서명)으로 빠진 것을 누구에게나 보일 수 있다",
      );
      result.caught.push(
        "나: 내 응모권이 들어 있다는 증명(머클 증명)이 나오지 않는다",
      );
      return result;
    },
  },
  {
    id: "op-history",
    role: "operator",
    title: "지난 회차 기록 고치기",
    how: "1회차 기록의 응모 수를 고치고, 사슬은 다시 잇지 않는다",
    run: async (w) => {
      const l = cloneLedger(w);
      const r = l.records[0] as RoundRecord;
      l.records[0] = { ...r, count: r.count + 1 };
      return ledgerAttack(
        l,
        "기록 해시가 바뀌어 다음 회차의 앞 기록 해시와 이어지지 않는다",
      );
    },
  },
  {
    id: "op-drand",
    role: "operator",
    title: "다른 drand 회차 쓰기",
    how: "1회차가 쓸 drand 회차를 하나 뒤로 바꾼다(번호를 고르려고)",
    run: async (w) => {
      const l = cloneLedger(w);
      const r = l.records[0] as RoundRecord;
      l.records[0] = { ...r, drandRound: r.drandRound + 1 };
      coverUp(l);
      return ledgerAttack(
        l,
        "drand 회차는 마감 시각에서 계산식으로 정해진다. 서명도 그 회차 것이 아니다",
      );
    },
  },
  {
    id: "op-restart",
    role: "operator",
    title: "장부를 처음부터 다시 만들기",
    how: "마음에 들지 않는 장부를 버리고 처음 일정표를 바꿔 새로 시작한다",
    run: async (w) => {
      const l = cloneLedger(w);
      const genesis = { ...l.genesis, epoch: l.genesis.epoch + 86400 };
      l.genesis = genesis;
      const prev = genesisHash(genesis);
      const r = l.records[0] as RoundRecord;
      l.records = [{ ...r, prev }];
      l.tickets = [l.tickets[0] ?? []];
      l.registrations = [l.registrations[0] ?? []];
      writeRoundAnchors(genesis, l.records, l.anchors);
      return ledgerAttack(
        l,
        "앵커 저장소의 genesis.txt는 장부를 처음 만들 때 한 번 남겼다. 새 처음 일정표와 다르다",
      );
    },
  },
  {
    id: "op-steal",
    role: "operator",
    title: "1등 당첨 가로채기",
    how: "확인하는 분에게 운영자 열쇠로 서명한 당첨자 확인 응답을 보낸다",
    run: async (w) => {
      const t = myTicket(w);
      const claim = await makeChallengeClaim(
        w.operator,
        t,
        REQUEST.challenge,
        REQUEST.requester,
      );
      const problems = await verifyClaim(claim, {
        ticket: t,
        request: REQUEST,
      });
      return {
        caught: problems.map((p) => `확인하는 분 기기: ${p}`),
        why: "확인하는 분 기기는 장부에 있는 그 응모권의 공개 열쇠로만 서명을 받는다",
      };
    },
  },
  {
    id: "en-impersonate",
    role: "entrant",
    title: "남의 이름으로 응모",
    how: "민지의 공개 열쇠를 넣은 응모권을 내 열쇠로 서명해 낸다",
    run: async (w) => {
      const l = cloneLedger(w);
      const minji = w.people[1] as Person;
      const challenge = genesisHash(l.genesis);
      // 공개 열쇠는 민지 것, 서명은 내 비밀 열쇠로(민지의 비밀 열쇠는 없다). 작업 증명은 정직하게 푼다
      const unsigned = unsignedTicket(minji.signer, 1, [2, 4, 6, 8, 10, 12]);
      const forged = await signTicket(
        { publicKey: minji.signer.publicKey, sign: w.operator.sign },
        unsigned,
        await findNonce(challenge, unsigned),
      );
      // 민지의 진짜 응모권 대신 들어갔다고 친다(1인 1장 검사를 피하려고)
      recloseRound1(l, [
        ...(l.tickets[0] ?? []).filter(
          (t) => !equalBytes(t.pub, minji.signer.publicKey),
        ),
        forged,
      ]);
      coverUp(l);
      return ledgerAttack(
        l,
        "응모권 서명은 그 공개 열쇠의 비밀 열쇠로만 만들 수 있다",
      );
    },
  },
  {
    id: "en-double",
    role: "entrant",
    title: "한 열쇠로 두 장 내기",
    how: "준호가 같은 열쇠로 번호만 다른 응모권을 한 장 더 낸다",
    run: async (w) => {
      const l = cloneLedger(w);
      const junho = w.people[2] as Person;
      const extra = await ticket(
        junho.signer,
        1,
        [3, 6, 9, 12, 15, 18],
        genesisHash(l.genesis),
      );
      recloseRound1(l, [...(l.tickets[0] ?? []), extra]);
      coverUp(l);
      return ledgerAttack(
        l,
        "응모자 id(공개 열쇠의 해시)는 회차마다 한 장만 된다. 서버가 받아 줘도 검사에서 드러난다",
      );
    },
  },
  {
    id: "en-nopow",
    role: "entrant",
    title: "작업 증명 건너뛰기",
    how: "Argon2 계산 없이 아무 n이나 넣고 서명한다",
    run: async (w) => {
      const l = cloneLedger(w);
      const minji = w.people[1] as Person;
      const challenge = genesisHash(l.genesis);
      const unsigned = unsignedTicket(minji.signer, 1, minji.numbers);
      const nonce = await findNonce(challenge, unsigned, false);
      const lazy = await signTicket(minji.signer, unsigned, nonce);
      recloseRound1(l, [
        ...(l.tickets[0] ?? []).filter(
          (t) => !equalBytes(t.pub, minji.signer.publicKey),
        ),
        lazy,
      ]);
      coverUp(l);
      return ledgerAttack(
        l,
        "검사기가 Argon2를 한 번 계산하면 n이 목표값을 넘지 못한 것이 드러난다",
      );
    },
  },
  {
    id: "en-replay",
    role: "entrant",
    title: "지난 당첨 증명 다시 쓰기",
    how: "남이 예전에 받은 당첨자 확인 응답을 새 확인 요청에 그대로 낸다",
    run: async (w) => {
      const t = myTicket(w);
      const me = w.people[0] as Person;
      const old = await makeChallengeClaim(
        me.signer,
        t,
        "OLD3REQ4ST",
        REQUEST.requester,
      );
      const problems = await verifyClaim(old, { ticket: t, request: REQUEST });
      return {
        caught: problems.map((p) => `확인하는 분 기기: ${p}`),
        why: "확인 문구가 요청마다 달라 지난 서명은 새 요청에 맞지 않는다",
      };
    },
  },
  {
    id: "en-fake-link",
    role: "entrant",
    title: "남의 당첨으로 확인 링크 만들기",
    how: "민지가 내 1등 응모권의 확인 링크를 자기 열쇠로 서명해 서버에 올린다",
    run: async (w) => {
      const t = myTicket(w);
      const minji = w.people[1] as Person;
      const forged = await signInvite(minji.signer, t, newInviteToken());
      const problems = await verifyInvite(forged, t);
      return {
        caught: problems.map((p) => `서버: ${p}`),
        why: "서버는 장부에 있는 그 응모권의 공개 열쇠로 서명이 맞아야 링크를 받는다. 그래서 응모권 주인만 링크를 만든다",
      };
    },
  },
  {
    id: "mid-numbers",
    role: "middle",
    title: "전달 중에 번호 바꾸기",
    how: "내 응모권이 서버로 가는 길에 번호 하나를 바꿔 전달한다",
    run: async (w) => {
      const l = cloneLedger(w);
      const t = myTicket(w);
      const changed = { ...t, numbers: [5, 29, 37, 38, 41, 44] };
      recloseRound1(l, [
        ...(l.tickets[0] ?? []).filter((x) => !equalBytes(x.pub, t.pub)),
        changed,
      ]);
      coverUp(l);
      return ledgerAttack(
        l,
        "서명이 번호까지 덮는다. 한 바이트만 바뀌어도 서명이 맞지 않는다",
      );
    },
  },
  {
    id: "mid-ledger",
    role: "middle",
    title: "나에게만 다른 장부 보여 주기",
    how: "내 기기로 오는 장부 파일을 가로채 1회차를 고친 장부로 바꿔 보낸다",
    run: async (w) => {
      const l = cloneLedger(w);
      const r = l.records[0] as RoundRecord;
      l.records[0] = { ...r, numbers: [...WINNING.slice(0, 5), 44] };
      // 앵커 저장소(GitHub)는 가로챌 수 없다
      let prev = genesisHash(l.genesis);
      l.records = l.records.map((x) => {
        const next = { ...x, prev };
        prev = recordHash(next);
        return next;
      });
      return ledgerAttack(
        l,
        "모두가 같은 GitHub 앵커와 비교하고, 내 기기는 전에 본 끝 해시를 기억한다",
      );
    },
  },
];

/**
 * 작업 증명 n 찾기. pass=true면 목표값을 넘는 n(정직하게 계산), false면 넘지 못하는 n(계산을 건너뛴 응모권)
 */
async function findNonce(
  challenge: Uint8Array,
  t: Pick<Ticket, "v" | "round" | "numbers" | "pub">,
  pass = true,
): Promise<number> {
  const content = ticketContent(t);
  for (let n = 0; n < 1000; n++) {
    const ok = await checkPow(challenge, content, n, POW_TARGET, ATTACK_POW);
    if (ok === pass) return n;
  }
  throw new Error("n을 찾지 못했다");
}

/** 정직한 장부가 검사를 모두 통과하는지(화면 처음에 보인다) */
export async function honestCheck(w: World): Promise<CheckOutcome> {
  return checkLedger(cloneLedger(w));
}
