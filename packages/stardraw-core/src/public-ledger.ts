import { githubAnchorVerifier, githubGenesisVerifier } from "./anchor";
import { equalBytes, fromBase64Url, fromHex, toHex } from "./bytes";
import type { BeaconVerifier } from "./drand";
import { RANKS, type Rank } from "./draw";
import { decodeRecord, type RoundRecord } from "./record";
import { decodeRegistration, type KeyRegistration } from "./registration";
import { sealDigest } from "./round";
import { phaseOf, type Schedule } from "./schedule";
import { DEFAULT_WEBAUTHN_POLICY } from "./signature";
import { decodeTicket, type Ticket, ticketId } from "./ticket";
import {
  DEFAULT_TSA_MIN,
  type TsaAuthority,
  type TsaProof,
  verifyTsaProof,
} from "./tsa";
import {
  type Problem,
  proveMembership,
  type VerifyReport,
  verifyLedger,
  verifyMembership,
} from "./verify";

/**
 * 공개 장부 파일 검사(docs/36 7절). 검증하기 페이지(`/stardraw/verify`)의 「장부 전체 검사」와
 * 터미널 검사기(`packages/stardraw-cli`)가 같이 쓴다.
 *
 * 서버의 공개 장부 파일(`/ledger/genesis.json`, `head.json`, `seals/N.json`, `rounds/N.json`)만 받아
 * 처음부터 다시 계산한다(`verifyLedger`). drand 서명(quicknet BLS), 봉인 시각 인증 토큰(TSA),
 * 앵커 저장소(GitHub raw)의 처음 일정표와 회차 기록 해시도 본다. 작업 증명은 회차마다 표본만 계산한다.
 */

/** 앵커 저장소(docs/36 11-7). 시험 단계 회차는 trial, 정식 단계 회차와 처음 일정표는 main 브랜치 */
export const STARDRAW_ANCHOR_REPO = "ybbarng/stardraw-ledger";

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface CheckResult {
  source: "server" | "practice";
  /** 서버 장부의 종류(시험/정식). 연습 장부는 practice */
  mode: "trial" | "live" | "practice";
  rounds: number;
  tickets: number;
  registrations: number;
  powChecked: number;
  head: string;
  items: CheckItem[];
  problems: Problem[];
  skipped: string[];
}

export interface PublicGenesisFile {
  schedule: Schedule;
}
export interface PublicHeadFile {
  rounds: number;
  head: string;
  sealed: number;
  serverKey?: string;
}
export interface PublicSealFile {
  round: number;
  digest: string;
  loggedAt: number;
  /** 봉인 시각 증거(공개 시각 인증 토큰 등) */
  log?: unknown;
}
export interface PublicRoundFile {
  record: string;
  tickets: string[];
  registrations: string[];
}

/** 받아서 풀어 둔 공개 장부 */
export interface PublicLedger {
  genesis: Schedule;
  head: PublicHeadFile;
  records: RoundRecord[];
  tickets: Ticket[][];
  registrations: KeyRegistration[][];
  seals: PublicSealFile[];
}

export interface PublicCheckOptions {
  /** 서버 주소(예: https://game.byb.kr/stardraw-api). 그 아래 /ledger/… 를 받는다 */
  base: string;
  /** 회차마다 작업 증명을 계산할 표본 수(내 것·당첨 제외). 기본 8, 전부는 Infinity */
  powSample?: number;
  fetch?: typeof fetch;
  /** 시험만 바꿔 끼운다(기본은 quicknet BLS 확인) */
  beaconVerifier?: BeaconVerifier;
  /** 앵커 저장소(기본 STARDRAW_ANCHOR_REPO). null이면 앵커를 보지 않는다 */
  anchorRepo?: string | null;
  /** 시험만 바꿔 끼운다(기본은 core에 열쇠를 고정한 기관 `TSA_AUTHORITIES`) */
  tsaAuthorities?: readonly TsaAuthority[];
  /** 작업 증명까지 늘 전부 검사할 내 응모권 id */
  mine?: readonly Uint8Array[];
  /** 회차 파일을 받을 때마다 부른다(터미널 진행 표시) */
  onProgress?: (done: number, total: number) => void;
}

const pad = (n: number) => String(n).padStart(6, "0");

/** 공개 장부 파일을 처음부터 받아 푼다 */
export async function loadPublicLedger(
  base: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
  onProgress?: (done: number, total: number) => void,
): Promise<PublicLedger> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchFn(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}를 받지 못했습니다(${res.status})`);
    return (await res.json()) as T;
  };
  const genesis = await get<PublicGenesisFile>("/ledger/genesis.json");
  const head = await get<PublicHeadFile>("/ledger/head.json");
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  const registrations: KeyRegistration[][] = [];
  const seals: PublicSealFile[] = [];
  for (let round = 1; round <= head.rounds; round++) {
    const file = await get<PublicRoundFile>(
      `/ledger/rounds/${pad(round)}.json`,
    );
    records.push(decodeRecord(fromBase64Url(file.record)));
    tickets.push(file.tickets.map((t) => decodeTicket(fromBase64Url(t))));
    registrations.push(
      file.registrations.map((r) => decodeRegistration(fromBase64Url(r))),
    );
    seals.push(await get<PublicSealFile>(`/ledger/seals/${pad(round)}.json`));
    onProgress?.(round, head.rounds);
  }
  return {
    genesis: genesis.schedule,
    head,
    records,
    tickets,
    registrations,
    seals,
  };
}

/** 문제 문장을 항목으로 나누는 규칙(verify.ts의 문장 기준, 위에서부터 처음 맞는 것) */
const RULES: { id: string; label: string; test: RegExp }[] = [
  {
    id: "anchor",
    label: "앵커 저장소(다시 시작하지 않음·기록 해시)",
    test: /앵커/,
  },
  { id: "genesis", label: "처음 일정표", test: /^처음 일정표/ },
  {
    id: "chain",
    label: "기록 사슬",
    test: /이어지지 않는다|회차 번호가|기록 판/,
  },
  {
    id: "registration",
    label: "열쇠 등록",
    test: /^등록 |등록 수가|등록 목록/,
  },
  { id: "pow", label: "작업 증명", test: /작업 증명/ },
  { id: "nickname", label: "별명", test: /^별명/ },
  {
    id: "ticket",
    label: "응모권 서명·한 사람 한 장",
    test: /^응모권|응모권 목록/,
  },
  { id: "merkle", label: "응모 수·머클 루트", test: /응모 수가|머클 루트/ },
  { id: "drand", label: "drand 회차·서명", test: /drand/ },
  { id: "void", label: "무효 회차 규칙", test: /무효/ },
  { id: "draw", label: "당첨 번호·등수", test: /당첨/ },
  { id: "schedule", label: "일정 변경", test: /^일정 변경/ },
];

/** 장부 검사의 문제 목록을 항목별 통과·실패·건너뜀으로 묶는다 */
export function checkItemsFrom(
  problems: Problem[],
  extra: CheckItem[],
  skips: Record<string, string>,
): CheckItem[] {
  const byId = new Map<string, Problem[]>();
  const other: Problem[] = [];
  for (const p of problems) {
    const rule = RULES.find((r) => r.test.test(p.message));
    if (!rule) other.push(p);
    else byId.set(rule.id, [...(byId.get(rule.id) ?? []), p]);
  }
  const items: CheckItem[] = RULES.map((r) => {
    const found = byId.get(r.id);
    if (found)
      return {
        id: r.id,
        label: r.label,
        status: "fail",
        detail: found.map(problemText).join(" / "),
      };
    const skip = skips[r.id];
    if (skip) return { id: r.id, label: r.label, status: "skip", detail: skip };
    return { id: r.id, label: r.label, status: "pass" };
  });
  items.push(...extra);
  if (other.length > 0)
    items.push({
      id: "other",
      label: "그 밖의 규칙",
      status: "fail",
      detail: other.map(problemText).join(" / "),
    });
  return items;
}

/** "3회차: 서명이 맞지 않는다"처럼 회차를 붙인 문장 */
export const problemText = (p: Problem) =>
  p.round === 0 ? p.message : `${p.round}회차: ${p.message}`;

/** 서버의 공개 장부 파일을 처음부터 받아 검사한다 */
export async function checkPublicLedger(
  options: PublicCheckOptions,
): Promise<CheckResult & { ledger: PublicLedger }> {
  const f = options.fetch ?? ((...args) => fetch(...args));
  const anchorRepo =
    options.anchorRepo === undefined
      ? STARDRAW_ANCHOR_REPO
      : options.anchorRepo;
  const ledger = await loadPublicLedger(options.base, f, options.onProgress);
  const { genesis, head, records, tickets, registrations, seals } = ledger;

  const report = await verifyLedger(genesis, records, tickets, registrations, {
    powSample: options.powSample ?? 8,
    webauthnPolicy: DEFAULT_WEBAUTHN_POLICY,
    ...(options.mine ? { mine: options.mine } : {}),
    // 바깥 앵커(GitHub): 장부를 다시 시작하지 않았는지(main의 genesis.txt), 회차 기록 해시가 같은지
    ...(anchorRepo
      ? {
          genesisAnchorVerifier: githubGenesisVerifier({
            repo: anchorRepo,
            fetchFn: f,
          }),
          anchorVerifier: githubAnchorVerifier({
            repo: anchorRepo,
            genesis,
            fetchFn: f,
          }),
        }
      : {}),
    ...(options.beaconVerifier
      ? { beaconVerifier: options.beaconVerifier }
      : {}),
  });

  // 봉인 파일: 마감 직후 공개한 봉인 값이 닫힌 회차 기록과 같은지
  const sealProblems: string[] = [];
  for (const [i, record] of records.entries()) {
    const seal = seals[i] as PublicSealFile;
    if (seal.digest !== toHex(sealDigest(record)))
      sealProblems.push(`${record.round}회차: 봉인 값이 기록과 다르다`);
    if (seal.loggedAt !== record.rootLoggedAt)
      sealProblems.push(`${record.round}회차: 봉인 시각이 기록과 다르다`);
  }
  const headOk = head.head === toHex(report.head);
  const extra: CheckItem[] = [
    sealProblems.length > 0
      ? {
          id: "seal",
          label: "봉인 파일(seals)",
          status: "fail",
          detail: sealProblems.join(" / "),
        }
      : { id: "seal", label: "봉인 파일(seals)", status: "pass" },
    headOk
      ? { id: "head", label: "장부 끝 해시(head.json)", status: "pass" }
      : {
          id: "head",
          label: "장부 끝 해시(head.json)",
          status: "fail",
          detail: `계산 ${toHex(report.head)}, 파일 ${head.head}`,
        },
    await timestampItem(
      records,
      seals,
      report.schedule,
      options.tsaAuthorities,
    ),
  ];
  const anchorSkips = report.skipped.filter((s) => s.includes("앵커")).length;
  const skips: Record<string, string> = {};
  if (!anchorRepo) skips.anchor = "앵커 저장소를 정하지 않았습니다";
  else if (anchorSkips === records.length + 1)
    skips.anchor = "앵커 저장소에 이 장부의 기록이 아직 없습니다";
  const nowRound = Math.max(1, records.length);
  return {
    source: "server",
    mode: phaseOf(report.schedule, nowRound) === "trial" ? "trial" : "live",
    rounds: records.length,
    tickets: tickets.reduce((n, t) => n + t.length, 0),
    registrations: registrations.reduce((n, r) => n + r.length, 0),
    powChecked: report.powChecked,
    head: toHex(report.head),
    items: withPowDetail(checkItemsFrom(report.problems, extra, skips), report),
    problems: report.problems,
    skipped: report.skipped,
    ledger,
  };
}

export const TIMESTAMP_LABEL =
  "봉인이 drand보다 먼저였다는 바깥 증명(공개 시각 인증)";

/**
 * 봉인 시각 증명(docs/36 11-1, tsa.ts): 회차마다 seals/N의 시각 인증 토큰을 확인한다.
 * 통과 규칙: 실린 토큰이 모두 맞고 서로 다른 기관 DEFAULT_TSA_MIN곳 이상이며, 가장 이른 시각이 기록의 rootLoggedAt과 같다.
 * 그 시각이 drand 시각보다 앞서는지는 「무효 회차 규칙」 항목이 본다. 무효 회차(rootLoggedAt 0)는 볼 것이 없다.
 * 시험 단계에서 증거가 없는 회차(서버 시계로 봉인)는 건너뜀, 정식 단계면 실패다
 */
async function timestampItem(
  records: readonly RoundRecord[],
  seals: readonly PublicSealFile[],
  schedule: Schedule,
  authorities?: readonly TsaAuthority[],
): Promise<CheckItem> {
  const failed: string[] = [];
  const missing: number[] = [];
  let missingLive = false;
  const names = new Set<string>();
  let proved = 0;
  let voided = 0;
  for (const [i, record] of records.entries()) {
    if (record.rootLoggedAt === 0) {
      voided++;
      continue;
    }
    const log = seals[i]?.log as TsaProof | null | undefined;
    if (log?.kind !== "tsa") {
      missing.push(record.round);
      if (phaseOf(schedule, record.round) !== "trial") missingLive = true;
      continue;
    }
    const check = await verifyTsaProof(log, {
      digest: sealDigest(record),
      minValid: DEFAULT_TSA_MIN,
      ...(authorities ? { authorities } : {}),
    });
    if (!check.ok)
      failed.push(`${record.round}회차: ${check.problems.join(", ")}`);
    else if (check.loggedAt !== record.rootLoggedAt)
      failed.push(
        `${record.round}회차: 봉인 시각이 가장 이른 토큰 시각과 다르다`,
      );
    else {
      proved++;
      for (const s of check.stamps) names.add(s.tsa);
    }
  }
  const item = (status: CheckStatus, detail: string): CheckItem => ({
    id: "timestamp",
    label: TIMESTAMP_LABEL,
    status,
    detail,
  });
  if (failed.length > 0) return item("fail", failed.join(" / "));
  const noProof = `시각 인증 없이 서버 시계로 봉인한 회차: ${missing.join(", ")}`;
  if (missing.length > 0)
    return missingLive ? item("fail", noProof) : item("skip", noProof);
  if (proved === 0)
    return item(
      "skip",
      voided > 0
        ? "모든 회차가 무효라 볼 토큰이 없습니다"
        : "닫힌 회차가 없습니다",
    );
  return item(
    "pass",
    `${proved}회차 확인(${[...names].join(", ")})${voided > 0 ? `, 무효 ${voided}회차` : ""}`,
  );
}

/** 작업 증명 항목에 실제로 계산한 수와 표본 밖 수를 적는다 */
export function withPowDetail(
  items: CheckItem[],
  report: VerifyReport,
): CheckItem[] {
  const outside = report.skipped
    .filter((s) => s.includes("작업 증명"))
    .reduce((n, s) => n + Number(/(\d+)장/.exec(s)?.[1] ?? 0), 0);
  return items.map((item) =>
    item.id === "pow" && item.status === "pass"
      ? {
          ...item,
          detail: `${report.powChecked}장 계산${outside > 0 ? `, ${outside}장은 표본 밖` : ""}`,
        }
      : item,
  );
}

// ── 내 응모권 찾기 ──

/** 응모권을 가리키는 말: 회차와 일련번호(응모권 id hex 64자리, 또는 영수증의 앞자리) */
export interface TicketQuery {
  round: number;
  /** 소문자 hex. 64자리면 정확히, 짧으면 앞자리로 찾는다 */
  id: string;
}

/**
 * "12-abcd…", "12 abcd ef01 2345", 공유 주소 "https://game.byb.kr/stardraw/ticket#12-abcd…"를 읽는다.
 * 일련번호는 영수증에 보이는 앞 12자리처럼 8자리 이상이면 된다. 모양이 틀리면 null
 */
export function parseTicketQuery(text: string): TicketQuery | null {
  const tail = text.includes("#") ? text.slice(text.indexOf("#") + 1) : text;
  const m = /^\s*(\d+)\s*[-: ]\s*([0-9a-fA-F][0-9a-fA-F\s]*)$/.exec(tail);
  if (!m) return null;
  const id = (m[2] as string).replace(/\s+/g, "").toLowerCase();
  const round = Number(m[1]);
  if (round < 1 || id.length < 8 || id.length > 64) return null;
  return { round, id };
}

export type TicketFinding =
  | { found: false; reason: string }
  | {
      found: true;
      round: number;
      id: string;
      ticket: Ticket;
      /** 머클 증명으로 그 회차 기록의 응모권 루트에 들어 있는지 */
      included: boolean;
      /** 당첨 등수(없으면 null). 무효 회차도 null */
      rank: Rank | null;
      void: boolean;
      numbers: readonly number[];
      bonus: number;
    };

/** 공개 장부에서 내 응모권을 찾고, 머클 증명과 등수를 확인한다 */
export function findTicket(
  ledger: PublicLedger,
  query: TicketQuery,
): TicketFinding {
  const record = ledger.records[query.round - 1];
  if (!record)
    return {
      found: false,
      reason: `${query.round}회차는 아직 닫히지 않았습니다(닫힌 회차 ${ledger.records.length}개)`,
    };
  const list = ledger.tickets[query.round - 1] ?? [];
  const matches = list.filter((t) => toHex(ticketId(t)).startsWith(query.id));
  if (matches.length === 0)
    return {
      found: false,
      reason: `${query.round}회차 응모권 ${list.length}장 가운데 이 일련번호가 없습니다`,
    };
  if (matches.length > 1)
    return {
      found: false,
      reason: `일련번호 앞자리가 ${matches.length}장과 겹칩니다. 더 길게 적어 주세요`,
    };
  const ticket = matches[0] as Ticket;
  const id = ticketId(ticket);
  const membership = proveMembership(list, id);
  const included =
    membership !== null && verifyMembership(id, membership, record.merkleRoot);
  const rank =
    RANKS.find((r) => record.winners[r].some((w) => equalBytes(w, id))) ?? null;
  return {
    found: true,
    round: query.round,
    id: toHex(id),
    ticket,
    included,
    rank,
    void: record.void,
    numbers: record.numbers,
    bonus: record.bonus,
  };
}

/** 64자리 hex 일련번호를 응모권 id 바이트로(검사기 `mine`에 넣는다) */
export function ticketIdFromHex(hex: string): Uint8Array | null {
  return /^[0-9a-f]{64}$/.test(hex) ? fromHex(hex) : null;
}
