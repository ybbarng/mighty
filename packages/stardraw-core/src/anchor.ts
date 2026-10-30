import { toHex } from "./bytes";
import type { RoundRecord } from "./record";
import { genesisHash, recordHash } from "./record";
import { phaseOf, type Schedule } from "./schedule";

/**
 * GitHub 앵커(docs/36 8-1 O3·O6, 11-6, 11-7).
 *
 * 서버는 회차 기록을 닫을 때마다 앵커 저장소에 작은 파일 하나를 커밋한다. 파일에는 그 회차 기록 해시(= 장부 끝 해시)와
 * 봉인 시각 증거 요약이 들어간다. 운영자가 나중에 장부를 고치면 앵커와 어긋나고, 사람마다 다른 장부를
 * 보여 주면 같은 앵커와 비교해 드러난다. 앵커 저장소는 운영자가 강제 push로 고칠 수 있으므로 보조 수단이고,
 * 시각 증명은 공개 시각 인증 기관(tsa.ts)이 맡는다.
 *
 * - 회차 파일: `ledgers/{장부 id}/{회차 6자리}.txt`. 장부 id는 처음 일정표 해시(genesisHash) 앞 16자리다.
 *   브랜치는 그 회차의 단계로: 시험 단계 `trial`, 정식 단계 `main`.
 * - 처음 일정표 파일: main 브랜치의 `genesis.txt`. 장부를 처음 만들 때 한 번 커밋한다.
 *   장부는 다시 시작하지 않는다는 규칙을 남이 확인할 수 있게 한다(다시 시작하면 이 파일과 어긋난다).
 */

export const ANCHOR_VERSION = "stardraw-anchor v1";

export interface AnchorEntry {
  /** 장부 id(처음 일정표 해시 앞 16자리 hex) */
  ledger: string;
  round: number;
  /** 그 회차 기록 해시(hex) */
  record: string;
  /** 봉인 시각 증거 요약(`sealLogId`). 없으면 "-" */
  seal: string;
}

/**
 * 장부 seals/N의 log를 한 줄로 줄인다(앵커 파일의 seal 줄).
 * 시각 인증 "tsa:digicert@1793324472,sectigo@1793324474", Rekor "rekor:<uuid>", 그 밖에는 "-"
 */
export function sealLogId(log: unknown): string {
  const l = log as {
    kind?: unknown;
    uuid?: unknown;
    tokens?: { tsa?: unknown; genTime?: unknown }[];
  } | null;
  if (l?.kind === "rekor" && typeof l.uuid === "string")
    return `rekor:${l.uuid}`;
  if (l?.kind === "tsa" && Array.isArray(l.tokens) && l.tokens.length > 0)
    return `tsa:${l.tokens.map((t) => `${String(t.tsa)}@${String(t.genTime)}`).join(",")}`;
  return "-";
}

/** 장부 id: 처음 일정표 해시 앞 16자리 */
export function ledgerId(genesis: Schedule): string {
  return toHex(genesisHash(genesis)).slice(0, 16);
}

export function anchorPath(ledger: string, round: number): string {
  return `ledgers/${ledger}/${String(round).padStart(6, "0")}.txt`;
}

/** 앵커 파일 본문(사람도 읽는 줄 형식) */
export function anchorFile(e: AnchorEntry): string {
  return `${ANCHOR_VERSION}\nledger ${e.ledger}\nround ${e.round}\nrecord ${e.record}\nseal ${e.seal}\n`;
}

/** 커밋 메시지: "하늘의 별 따기 {회차}회 기록 {기록 해시 앞 12자리} (장부 {id})" */
export function anchorCommitMessage(e: AnchorEntry): string {
  return `하늘의 별 따기 ${e.round}회 기록 ${e.record.slice(0, 12)} (장부 ${e.ledger})`;
}

export function parseAnchorFile(text: string): AnchorEntry | null {
  const lines = text.trim().split("\n");
  if (lines[0] !== ANCHOR_VERSION) return null;
  const field = (name: string) => {
    const line = lines.find((l) => l.startsWith(`${name} `));
    return line ? line.slice(name.length + 1).trim() : undefined;
  };
  const ledger = field("ledger");
  const round = Number(field("round"));
  const record = field("record");
  const seal = field("seal");
  if (!ledger || !Number.isInteger(round) || !record || !seal) return null;
  return { ledger, round, record, seal };
}

/**
 * 장부 검사(`verifyLedger`의 `anchorVerifier`)에 넣는 GitHub 앵커 확인 함수.
 * raw.githubusercontent.com에서 회차 파일을 읽어(브라우저에서도 된다) 기록 해시를 비교한다.
 * - 같으면 true, 다르면 false, 파일이 없으면 null(아직 못 남겼거나 앵커를 쓰지 않는 회차 — 검사는 건너뜀)
 */
/** 회차 파일을 남기는 브랜치: 시험 단계 trial, 그 밖(정식, 단계 없음) main */
export function anchorBranch(schedule: Schedule, round: number): string {
  return phaseOf(schedule, round) === "trial" ? "trial" : "main";
}

/**
 * 장부 검사(`verifyLedger`의 `anchorVerifier`)에 넣는 GitHub 앵커 확인 함수.
 * raw.githubusercontent.com에서 회차 파일을 읽어(브라우저에서도 된다) 기록 해시를 비교한다.
 * 브랜치는 그 회차의 단계로 정한다(`anchorBranch`). `branch`를 주면 그것만 본다.
 * - 같으면 true, 다르면 false, 파일이 없으면 null(아직 못 남겼거나 앵커를 쓰지 않는 회차 — 검사는 건너뜀)
 */
export function githubAnchorVerifier(opts: {
  repo: string;
  genesis: Schedule;
  branch?: string;
  fetchFn?: typeof fetch;
}): (record: RoundRecord, schedule?: Schedule) => Promise<boolean | null> {
  const ledger = ledgerId(opts.genesis);
  const fetchFn = opts.fetchFn ?? fetch;
  return async (record, schedule = opts.genesis) => {
    const branch = opts.branch ?? anchorBranch(schedule, record.round);
    const text = await rawText(
      fetchFn,
      opts.repo,
      branch,
      anchorPath(ledger, record.round),
    );
    if (text === null) return null;
    const entry = parseAnchorFile(text);
    if (!entry) return false;
    return (
      entry.ledger === ledger &&
      entry.round === record.round &&
      entry.record === toHex(recordHash(record))
    );
  };
}

// ── 처음 일정표 ──

export const GENESIS_ANCHOR_VERSION = "stardraw-genesis v1";
export const GENESIS_ANCHOR_PATH = "genesis.txt";
export const GENESIS_ANCHOR_BRANCH = "main";

/** main 브랜치 genesis.txt 본문 */
export function genesisAnchorFile(genesis: Schedule): string {
  return `${GENESIS_ANCHOR_VERSION}\nledger ${ledgerId(genesis)}\ngenesis ${toHex(genesisHash(genesis))}\nepoch ${genesis.epoch}\n`;
}

/** 커밋 메시지: "하늘의 별 따기 장부 시작 {장부 id}" */
export function genesisAnchorCommitMessage(genesis: Schedule): string {
  return `하늘의 별 따기 장부 시작 ${ledgerId(genesis)}`;
}

/** genesis.txt에서 genesis 해시(hex)를 꺼낸다. 모양이 틀리면 null */
export function parseGenesisAnchorFile(text: string): string | null {
  const lines = text.trim().split("\n");
  if (lines[0] !== GENESIS_ANCHOR_VERSION) return null;
  const line = lines.find((l) => l.startsWith("genesis "));
  return line ? line.slice("genesis ".length).trim() : null;
}

/**
 * 장부 검사(`verifyLedger`의 `genesisAnchorVerifier`)에 넣는 확인 함수.
 * main 브랜치의 genesis.txt가 이 장부의 처음 일정표 해시와 같은지 본다.
 * 같으면 true, 다르면 false(장부를 다시 시작했다), 없으면 null
 */
export function githubGenesisVerifier(opts: {
  repo: string;
  fetchFn?: typeof fetch;
}): (genesis: Schedule) => Promise<boolean | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  return async (genesis) => {
    const text = await rawText(
      fetchFn,
      opts.repo,
      GENESIS_ANCHOR_BRANCH,
      GENESIS_ANCHOR_PATH,
    );
    if (text === null) return null;
    return parseGenesisAnchorFile(text) === toHex(genesisHash(genesis));
  };
}

/** raw.githubusercontent.com에서 파일을 읽는다. 없거나 받지 못하면 null */
async function rawText(
  fetchFn: typeof fetch,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await fetchFn(
      `https://raw.githubusercontent.com/${repo}/${branch}/${path}`,
      { cache: "no-store" },
    );
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
