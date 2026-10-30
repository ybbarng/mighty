import {
  type BeaconVerifier,
  DEFAULT_TSA_MIN,
  DEFAULT_WEBAUTHN_POLICY,
  decodeRecord,
  decodeRegistration,
  decodeTicket,
  fromBase64Url,
  githubAnchorVerifier,
  githubGenesisVerifier,
  type KeyRegistration,
  type Problem,
  phaseOf,
  type RoundRecord,
  type Schedule,
  sealDigest,
  type Ticket,
  type TsaAuthority,
  type TsaProof,
  toHex,
  type VerifyReport,
  verifyLedger,
  verifyTsaProof,
} from "@mighty/stardraw-core";

/**
 * 「장부 전체 검사」(검증하기 페이지·콘솔 `stardraw.verify()`).
 * 서버 장부면 공개 장부 파일만 받아 화면의 장부 코드를 거치지 않고 처음부터 다시 계산한다.
 * drand 서명(quicknet BLS)도 확인하고, 작업 증명은 회차마다 표본(기본 8장)만 계산한다.
 * 서버 주소가 없는 빌드(연습 장부)는 이 기기의 연습 장부를 같은 함수로 검사한다.
 */

/** 서버 주소(빌드할 때 들어간다, services.ts와 같은 값). 비어 있으면 연습 장부 */
export const SERVER_API = process.env.NEXT_PUBLIC_STARDRAW_API ?? "";

/** GitHub 앵커 저장소(docs/36 11-7). 시험 단계 회차는 trial, 정식 단계 회차와 처음 일정표는 main 브랜치 */
export const ANCHOR_REPO =
  process.env.NEXT_PUBLIC_STARDRAW_ANCHOR_REPO ?? "ybbarng/stardraw-ledger";

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

interface GenesisFile {
  schedule: Schedule;
}
interface HeadFile {
  rounds: number;
  head: string;
  sealed: number;
}
interface SealFile {
  round: number;
  digest: string;
  loggedAt: number;
  /** 봉인 시각 증거(공개 시각 인증 토큰 등) */
  log?: unknown;
}
interface RoundFile {
  record: string;
  tickets: string[];
  registrations: string[];
}

export interface CheckOptions {
  /** 회차마다 작업 증명을 계산할 표본 수(내 것·당첨 제외). 기본 8, 전부는 Infinity */
  powSample?: number;
  fetch?: typeof fetch;
  base?: string;
  /** 시험만 바꿔 끼운다(기본은 quicknet BLS 확인) */
  beaconVerifier?: BeaconVerifier;
  /** 앵커 저장소(기본 ANCHOR_REPO). null이면 앵커를 보지 않는다 */
  anchorRepo?: string | null;
  /** 시험만 바꿔 끼운다(기본은 core에 열쇠를 고정한 기관 `TSA_AUTHORITIES`) */
  tsaAuthorities?: readonly TsaAuthority[];
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

function itemsFrom(
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
        detail: found.map(where).join(" / "),
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
      detail: other.map(where).join(" / "),
    });
  return items;
}

const where = (p: Problem) =>
  p.round === 0 ? p.message : `${p.round}회차: ${p.message}`;

/** 서버의 공개 장부 파일을 처음부터 받아 검사한다 */
export async function checkServerLedger(
  options: CheckOptions = {},
): Promise<CheckResult> {
  const base = options.base ?? SERVER_API;
  const f = options.fetch ?? ((...args) => fetch(...args));
  const get = async <T>(path: string): Promise<T> => {
    const res = await f(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path}를 받지 못했습니다(${res.status})`);
    return (await res.json()) as T;
  };
  const pad = (n: number) => String(n).padStart(6, "0");

  const anchorRepo =
    options.anchorRepo === undefined ? ANCHOR_REPO : options.anchorRepo;
  const genesis = await get<GenesisFile>("/ledger/genesis.json");
  const head = await get<HeadFile>("/ledger/head.json");
  const records: RoundRecord[] = [];
  const tickets: Ticket[][] = [];
  const registrations: KeyRegistration[][] = [];
  for (let round = 1; round <= head.rounds; round++) {
    const file = await get<RoundFile>(`/ledger/rounds/${pad(round)}.json`);
    records.push(decodeRecord(fromBase64Url(file.record)));
    tickets.push(file.tickets.map((t) => decodeTicket(fromBase64Url(t))));
    registrations.push(
      file.registrations.map((r) => decodeRegistration(fromBase64Url(r))),
    );
  }

  const report = await verifyLedger(
    genesis.schedule,
    records,
    tickets,
    registrations,
    {
      powSample: options.powSample ?? 8,
      webauthnPolicy: DEFAULT_WEBAUTHN_POLICY,
      // 바깥 앵커(GitHub): 장부를 다시 시작하지 않았는지(main의 genesis.txt), 회차 기록 해시가 같은지
      ...(anchorRepo
        ? {
            genesisAnchorVerifier: githubGenesisVerifier({
              repo: anchorRepo,
              fetchFn: f,
            }),
            anchorVerifier: githubAnchorVerifier({
              repo: anchorRepo,
              genesis: genesis.schedule,
              fetchFn: f,
            }),
          }
        : {}),
      ...(options.beaconVerifier
        ? { beaconVerifier: options.beaconVerifier }
        : {}),
    },
  );

  // 봉인 파일: 마감 직후 공개한 봉인 값이 닫힌 회차 기록과 같은지
  const sealProblems: string[] = [];
  const seals: SealFile[] = [];
  for (const record of records) {
    const seal = await get<SealFile>(`/ledger/seals/${pad(record.round)}.json`);
    seals.push(seal);
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
  if (!anchorRepo) skips.anchor = "앵커 저장소를 정하지 않은 빌드입니다";
  else if (anchorSkips === records.length + 1)
    skips.anchor = "앵커 저장소에 이 장부의 기록이 아직 없습니다";
  const nowRound = Math.max(1, records.length);
  return result(
    "server",
    phaseOf(report.schedule, nowRound) === "trial" ? "trial" : "live",
    report,
    records,
    tickets,
    registrations,
    withPowDetail(itemsFrom(report.problems, extra, skips), report),
  );
}

const TIMESTAMP_LABEL = "봉인이 drand보다 먼저였다는 바깥 증명(공개 시각 인증)";

/**
 * 봉인 시각 증명(docs/36 11-1, core tsa.ts): 회차마다 seals/N의 시각 인증 토큰을 확인한다.
 * 통과 규칙: 실린 토큰이 모두 맞고 서로 다른 기관 DEFAULT_TSA_MIN곳 이상이며, 가장 이른 시각이 기록의 rootLoggedAt과 같다.
 * 그 시각이 drand 시각보다 앞서는지는 「무효 회차 규칙」 항목이 본다. 무효 회차(rootLoggedAt 0)는 볼 것이 없다.
 * 시험 단계에서 증거가 없는 회차(서버 시계로 봉인)는 건너뜀, 정식 단계면 실패다
 */
async function timestampItem(
  records: readonly RoundRecord[],
  seals: readonly SealFile[],
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

/** 이 기기의 연습 장부를 검사한다(서버 주소가 없는 빌드) */
export async function checkPracticeLedger(ledger: {
  settle(): Promise<void>;
  verify(mine?: readonly Uint8Array[]): Promise<VerifyReport>;
  closed(): { record: RoundRecord; tickets: readonly Ticket[] }[];
}): Promise<CheckResult> {
  await ledger.settle();
  const report = await ledger.verify();
  const closed = ledger.closed();
  const items = withPowDetail(
    itemsFrom(
      report.problems,
      [
        {
          id: "timestamp",
          label: TIMESTAMP_LABEL,
          status: "skip",
          detail: "연습 장부는 이 기기 안에서만 돕니다",
        },
      ],
      {
        drand: "연습 장부는 기기 안에서 만든 가짜 난수라 drand 서명이 없습니다",
        anchor: "연습 장부는 이 기기 안에서만 돌아 앵커를 남기지 않습니다",
      },
    ),
    report,
  );
  return {
    source: "practice",
    mode: "practice",
    rounds: closed.length,
    tickets: closed.reduce((n, c) => n + c.tickets.length, 0),
    registrations: report.keys.length,
    powChecked: report.powChecked,
    head: toHex(report.head),
    items,
    problems: report.problems,
    skipped: report.skipped,
  };
}

/** 작업 증명 항목에 실제로 계산한 수와 표본 밖 수를 적는다 */
function withPowDetail(items: CheckItem[], report: VerifyReport): CheckItem[] {
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

function result(
  source: "server",
  mode: "trial" | "live",
  report: VerifyReport,
  records: RoundRecord[],
  tickets: Ticket[][],
  registrations: KeyRegistration[][],
  items: CheckItem[],
): CheckResult {
  return {
    source,
    mode,
    rounds: records.length,
    tickets: tickets.reduce((n, t) => n + t.length, 0),
    registrations: registrations.reduce((n, r) => n + r.length, 0),
    powChecked: report.powChecked,
    head: toHex(report.head),
    items,
    problems: report.problems,
    skipped: report.skipped,
  };
}
