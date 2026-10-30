import { toHex } from "./bytes";
import type { RoundRecord } from "./record";
import { genesisHash, recordHash } from "./record";
import type { Schedule } from "./schedule";

/**
 * GitHub 앵커(docs/36 8-1 O3·O6, 11-6).
 *
 * 서버는 회차 기록을 닫을 때마다 앵커 저장소에 작은 파일 하나를 커밋한다. 파일에는 그 회차 기록 해시(= 장부 끝 해시)와
 * 봉인의 Rekor 항목 번호가 들어간다. 운영자가 나중에 장부를 고치면 앵커와 어긋나고, 사람마다 다른 장부를
 * 보여 주면 같은 앵커와 비교해 드러난다. 앵커 저장소의 주 기록은 운영자가 강제 push로 고칠 수 있으므로 보조 수단이고,
 * 시각 증명은 Rekor가 맡는다.
 *
 * 경로: `ledgers/{장부 id}/{회차 6자리}.txt`. 장부 id는 처음 일정표 해시(genesisHash) 앞 16자리다.
 * 시험 장부를 새로 시작하면 회차 번호가 다시 1부터라 장부마다 폴더를 나눈다.
 * 브랜치: 시험 운영 `trial`, 정식 `main`.
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
export function githubAnchorVerifier(opts: {
  repo: string;
  branch: string;
  genesis: Schedule;
  fetchFn?: typeof fetch;
}): (record: RoundRecord) => Promise<boolean | null> {
  const ledger = ledgerId(opts.genesis);
  const fetchFn = opts.fetchFn ?? fetch;
  return async (record) => {
    const url = `https://raw.githubusercontent.com/${opts.repo}/${opts.branch}/${anchorPath(ledger, record.round)}`;
    let res: Response;
    try {
      res = await fetchFn(url, { cache: "no-store" });
    } catch {
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const entry = parseAnchorFile(await res.text());
    if (!entry) return false;
    return (
      entry.ledger === ledger &&
      entry.round === record.round &&
      entry.record === toHex(recordHash(record))
    );
  };
}
