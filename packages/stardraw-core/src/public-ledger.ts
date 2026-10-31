import {
  GENESIS_ANCHOR_BRANCH,
  GENESIS_ANCHOR_PATH,
  githubAnchorVerifier,
  githubGenesisVerifier,
  githubLedgerBase,
  parseGenesisAnchorFile,
  rawText,
} from "./anchor";
import {
  equalBytes,
  fromBase64Url,
  fromHex,
  taggedHash,
  toBase64Url,
  toHex,
} from "./bytes";
import type { BeaconVerifier } from "./drand";
import { RANKS, type Rank } from "./draw";
import {
  type DirectorHistoryLine,
  directorHistory,
  type OperationsView,
  operationsView,
  type QualPeriodView,
} from "./operations";
import {
  fetchFailure,
  type PoliteFetchOptions,
  politeFetch,
} from "./polite-fetch";
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

/**
 * 검사 항목 상태. warn(주의)은 규칙에 어긋나지 않지만 사람이 꼭 보아야 하는 것(예: 무효 회차).
 * 장부가 통과했는지는 fail만으로 정한다(warn은 통과를 바꾸지 않는다)
 */
export type CheckStatus = "pass" | "fail" | "skip" | "warn";

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
  /** 국장 열쇠 내력(지정·빼기·취소, docs/36 11-12). 서버 설정으로 몰래 바꿔도 여기 드러난다 */
  directors: DirectorHistoryLine[];
  /** 운영 기록·소속·국장 열쇠 */
  operations: OperationsView;
  /** 자격 기간마다 발급 수와 응모권에 쓰인 서로 다른 자격 수(docs/36 11-13) */
  qualification: QualificationSummary[];
}

export interface QualificationSummary extends QualPeriodView {
  /** 응모권에 쓰인 서로 다른 자격 수 */
  used: number;
  /** 도장 열쇠 지문(사람이 대조하는 보조 표시) */
  fingerprint: string;
}

/** 검사 결과의 자격 기간 요약: 장부의 기간(효력이 생긴 것)과 쓰인 자격 수 */
export function qualificationSummary(
  report: VerifyReport,
  records: number,
): QualificationSummary[] {
  const view = operationsView(report.operations, records, report.head);
  return view.periods.map((p) => ({
    ...p,
    used: report.qualification.used[p.id] ?? 0,
    fingerprint: toHex(
      taggedHash("stardraw/issuer-fp/v1", fromBase64Url(p.issuerKey)),
    ).slice(0, 16),
  }));
}

/** 「소속과 상품 자격」 항목의 덧말: 기간마다 발급 수와 쓰인 자격 수 */
export function qualificationDetail(
  summary: readonly QualificationSummary[],
): string {
  return summary.length === 0
    ? "열린 자격 기간이 없습니다"
    : summary
        .map(
          (p) =>
            `${p.affiliationName} ${p.number}기 · 발급 ${p.issued} · 쓰인 자격 ${p.used}`,
        )
        .join(" / ");
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
  /** 이미 받아 둔 장부(`loadPublicLedger`). 주면 다시 받지 않는다 */
  ledger?: PublicLedger;
  /** 한꺼번에 받는 수·다시 받기(시험은 손으로 옮기는 시계를 넣는다) */
  polite?: PoliteFetchOptions;
}

const pad = (n: number) => String(n).padStart(6, "0");

/**
 * 묶음 파일(docs/36 7절 「장부 받기」). 서버는 10회차·100회차가 다 닫히면 그 구간의 회차·봉인 파일을
 * 한 파일로 묶어 함께 낸다(낱개 파일은 그대로 둔다). 끝난 묶음은 바뀌지 않아 오래 캐시된다.
 * 받는 쪽은 맞는 묶음이 있으면 묶음으로, 없으면(옛 서버, 아직 덜 찬 구간) 낱개로 받는다.
 */
export const BUNDLE_SIZES = [100, 10] as const;

export interface PublicBundleFile {
  v: 1;
  /** 묶음의 첫 회차(1, 11, 21… 또는 1, 101…) */
  first: number;
  size: number;
  rounds: PublicRoundFile[];
  seals: PublicSealFile[];
}

export const roundFilePath = (round: number) =>
  `/ledger/rounds/${pad(round)}.json`;
export const sealFilePath = (round: number) =>
  `/ledger/seals/${pad(round)}.json`;
export const bundleFilePath = (size: number, first: number) =>
  `/ledger/bundles/${size}/${pad(first)}.json`;

/** from~to 회차를 받을 조각: 큰 묶음부터, 맞지 않는 곳은 낱개(size 1) */
export function ledgerPieces(
  from: number,
  to: number,
): { first: number; size: number }[] {
  const pieces: { first: number; size: number }[] = [];
  let round = from;
  while (round <= to) {
    const size =
      BUNDLE_SIZES.find((s) => (round - 1) % s === 0 && round + s - 1 <= to) ??
      1;
    pieces.push({ first: round, size });
    round += size;
  }
  return pieces;
}

export interface LoadedRoundFile {
  round: PublicRoundFile;
  /** `seals: true`로 받았을 때만 */
  seal?: PublicSealFile;
}

export interface LoadRoundsOptions {
  /** 봉인 파일도 받는다(공개 장부 검사). 화면은 회차 파일만 쓴다 */
  seals?: boolean;
  onProgress?: ((done: number, total: number) => void) | undefined;
  polite?: PoliteFetchOptions;
}

/**
 * from~to 회차 파일을 받는다. 한꺼번에 몇 개만, 서버가 막으면 기다렸다 다시(`politeFetch`).
 * 닫힌 회차 파일과 묶음은 바뀌지 않으므로 브라우저 캐시를 쓴다
 */
export async function loadRoundFiles(
  base: string,
  fetchFn: typeof fetch,
  from: number,
  to: number,
  options: LoadRoundsOptions = {},
): Promise<LoadedRoundFile[]> {
  const f = politeFetch(fetchFn, options.polite);
  const total = Math.max(0, to - from + 1);
  const out: LoadedRoundFile[] = new Array(total);
  let done = 0;
  const finished = (n: number) => {
    done += n;
    options.onProgress?.(done, total);
  };
  const json = async <T>(path: string, what = path): Promise<T | null> => {
    const res = await f(`${base}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(fetchFailure(what, res.status));
    return (await res.json()) as T;
  };
  const need = async <T>(path: string): Promise<T> => {
    const body = await json<T>(path);
    if (body === null) throw new Error(fetchFailure(path, 404));
    return body;
  };
  const single = async (round: number) => {
    const [file, seal] = await Promise.all([
      need<PublicRoundFile>(roundFilePath(round)),
      options.seals ? need<PublicSealFile>(sealFilePath(round)) : undefined,
    ]);
    out[round - from] = seal ? { round: file, seal } : { round: file };
    finished(1);
  };
  const bundle = async (first: number, size: number) => {
    const path = bundleFilePath(size, first);
    const body = await json<PublicBundleFile>(path);
    // 묶음을 내지 않는 서버(옛 판)면 낱개로
    if (body === null) {
      await Promise.all(
        Array.from({ length: size }, (_, i) => single(first + i)),
      );
      return;
    }
    if (
      body.first !== first ||
      body.size !== size ||
      body.rounds?.length !== size ||
      body.seals?.length !== size ||
      body.seals.some((s, i) => s.round !== first + i)
    )
      throw new Error(`${path}의 모양이 맞지 않습니다`);
    for (let i = 0; i < size; i++) {
      const round = body.rounds[i] as PublicRoundFile;
      const seal = body.seals[i] as PublicSealFile;
      out[first + i - from] = options.seals ? { round, seal } : { round };
    }
    finished(size);
  };
  await Promise.all(
    ledgerPieces(from, to).map((p) =>
      p.size === 1 ? single(p.first) : bundle(p.first, p.size),
    ),
  );
  return out;
}

/** 앵커 저장소에 올라간 장부 사본(docs/36 11-16) */
export interface GitHubLedgerSource {
  repo: string;
  /** 사본이 있는 브랜치: 정식 단계가 시작됐으면 main(지난 시험 회차까지 모두), 아니면 trial */
  branch: string;
  ledger: string;
  /** `loadPublicLedger`·`loadRoundFiles`에 넘기는 기준 주소 */
  base: string;
  /** 그 브랜치의 head.json(앵커에 오른 마지막 회차까지). raw 주소는 약 5분 캐시된다 */
  head: PublicHeadFile;
}

/**
 * 앵커 저장소에서 장부 사본을 찾는다. 장부 id는 주지 않으면 main의 genesis.txt에서 읽고,
 * 브랜치는 main → trial 순으로 head.json이 있는 곳을 쓴다. 없으면 던진다
 */
export async function findGitHubLedger(
  options: { repo?: string; ledger?: string; fetch?: typeof fetch } = {},
): Promise<GitHubLedgerSource> {
  const repo = options.repo ?? STARDRAW_ANCHOR_REPO;
  const fetchFn = options.fetch ?? ((...args) => fetch(...args));
  let ledger = options.ledger;
  if (!ledger) {
    const text = await rawText(
      fetchFn,
      repo,
      GENESIS_ANCHOR_BRANCH,
      GENESIS_ANCHOR_PATH,
    );
    const hash = text === null ? null : parseGenesisAnchorFile(text);
    if (!hash)
      throw new Error(
        `앵커 저장소(${repo})의 ${GENESIS_ANCHOR_PATH}를 받지 못했습니다`,
      );
    ledger = hash.slice(0, 16);
  }
  for (const branch of ["main", "trial"]) {
    const base = githubLedgerBase(repo, branch, ledger);
    const res = await fetchFn(`${base}/ledger/head.json`, {
      cache: "no-store",
    });
    if (res.status === 404) continue;
    if (!res.ok)
      throw new Error(fetchFailure(`${branch}의 head.json`, res.status));
    const head = (await res.json()) as PublicHeadFile;
    return { repo, branch, ledger, base, head };
  }
  throw new Error(
    `앵커 저장소(${repo})에 장부 ${ledger}의 JSON 사본이 아직 없습니다`,
  );
}

/** 공개 장부 파일을 처음부터 받아 푼다 */
export async function loadPublicLedger(
  base: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
  onProgress?: (done: number, total: number) => void,
  polite?: PoliteFetchOptions,
): Promise<PublicLedger> {
  const f = politeFetch(fetchFn, polite);
  const get = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await f(`${base}${path}`, init);
    if (!res.ok) throw new Error(fetchFailure(path, res.status));
    return (await res.json()) as T;
  };
  const genesis = await get<PublicGenesisFile>("/ledger/genesis.json");
  const head = await get<PublicHeadFile>("/ledger/head.json", {
    cache: "no-store",
  });
  const files = await loadRoundFiles(base, f, 1, head.rounds, {
    seals: true,
    onProgress,
  });
  return {
    genesis: genesis.schedule,
    head,
    records: files.map((x) => decodeRecord(fromBase64Url(x.round.record))),
    tickets: files.map((x) =>
      x.round.tickets.map((t) => decodeTicket(fromBase64Url(t))),
    ),
    registrations: files.map((x) =>
      x.round.registrations.map((r) => decodeRegistration(fromBase64Url(r))),
    ),
    seals: files.map((x) => x.seal as PublicSealFile),
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
    id: "qualification",
    label: "소속(증서·도장·발급 수)",
    test: /^소속 증서/,
  },
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
  {
    id: "operations",
    label: "운영 기록(국장·관인 서명, 3회차 예고)",
    test: /^운영 기록/,
  },
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
  const f = politeFetch(
    options.fetch ?? ((...args) => fetch(...args)),
    options.polite,
  );
  const anchorRepo =
    options.anchorRepo === undefined
      ? STARDRAW_ANCHOR_REPO
      : options.anchorRepo;
  const ledger =
    options.ledger ??
    (await loadPublicLedger(options.base, f, options.onProgress));
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
    sealKeyItem(report, head),
    voidRoundsItem(records, report.schedule),
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
    items: withQualDetail(
      withPowDetail(checkItemsFrom(report.problems, extra, skips), report),
      qualificationSummary(report, records.length),
    ),
    problems: report.problems,
    // 봉인 시각은 아래 「바깥 증명」 항목(timestampItem)이 seals의 토큰으로 따로 본다
    skipped: report.skipped.filter((s) => !s.includes("머클 루트 로그 시각")),
    directors: directorHistory(report.operations),
    operations: operationsView(report.operations, records.length, report.head),
    qualification: qualificationSummary(report, records.length),
    ledger,
  };
}

/**
 * 관인(서버 서명 열쇠): 장부에 처음 실린 관인 운영 기록의 열쇠가 head.json의 서버 공개 열쇠(영수증 확인용)와 같은지.
 * 관인 기록이 없으면 건너뜀(docs/36 11-12)
 */
function sealKeyItem(report: VerifyReport, head: PublicHeadFile): CheckItem {
  const label = "관인 열쇠(운영 기록과 영수증이 같은 우주국)";
  const seal = report.operations.sealKey;
  if (!seal)
    return {
      id: "seal-key",
      label,
      status: "skip",
      detail: "관인 운영 기록이 아직 없습니다",
    };
  if (head.serverKey !== toBase64Url(seal))
    return {
      id: "seal-key",
      label,
      status: "fail",
      detail: "장부의 관인 열쇠가 head.json의 서버 공개 열쇠와 다르다",
    };
  return { id: "seal-key", label, status: "pass" };
}

export const VOID_ROUNDS_LABEL =
  "무효 회차(봉인 증명 없이 닫혀 당첨이 없는 회차)";

/**
 * 무효 회차를 "통과"에 묻히지 않게 따로 보인다(2026-10-31 보안 검토). 무효 회차는 규칙상 허용되지만
 * 운영자가 결과를 본 뒤 봉인 증명을 싣지 않아 회차를 지우는 데 쓰일 수 있으므로, 수와 목록을 주의로 남긴다.
 * 정식 단계 회차가 있으면 따로 적는다. 통과 여부는 바꾸지 않는다
 */
export function voidRoundsItem(
  records: readonly RoundRecord[],
  schedule: Schedule,
): CheckItem {
  const voids = records.filter((r) => r.void).map((r) => r.round);
  if (voids.length === 0)
    return {
      id: "void-rounds",
      label: VOID_ROUNDS_LABEL,
      status: "pass",
      detail: "없음",
    };
  const live = voids.filter((n) => phaseOf(schedule, n) !== "trial");
  return {
    id: "void-rounds",
    label: VOID_ROUNDS_LABEL,
    status: "warn",
    detail: `${voids.length}회: ${voids.join(", ")}${live.length > 0 ? ` · 정식 단계 ${live.length}회: ${live.join(", ")}` : ""}`,
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

/** 「소속과 상품 자격」 항목이 통과면 기간마다 발급 수와 쓰인 자격 수를 적는다 */
export function withQualDetail(
  items: CheckItem[],
  summary: readonly QualificationSummary[],
): CheckItem[] {
  return items.map((item) =>
    item.id === "qualification" && item.status === "pass"
      ? { ...item, detail: qualificationDetail(summary) }
      : item,
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
