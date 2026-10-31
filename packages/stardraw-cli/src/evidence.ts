import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type EarlySealSource,
  fetchFailure,
  type PublicSealFile,
  parseSealFile,
  sealFilePath,
} from "@mighty/stardraw-core";

/**
 * 추첨 전 봉인 증거 모으기(docs/36 11-20, 보안 표 O10). 서버는 봉인하자마자(drand 전에) 봉인 파일을 공개한다.
 * 누구든 그 파일을 나오는 대로 받아 두면, 운영자가 나중에 그 회차를 "봉인 증거를 못 받았다"며 무효로 닫았을 때
 * 받아 둔 파일의 시각 인증 토큰이 그 거짓을 드러낸다(`stardraw-verify --evidence <폴더>`).
 * 운영자는 누가 받아 두는지 모르므로, 결과를 보고 무효를 고르는 순간 들킬 수 있다.
 */

/** 폴더 안 파일 이름: 회차 6자리. 같은 회차를 다른 내용으로 또 받으면 뒤에 .1, .2 … 를 붙인다 */
const FILE = /^(\d{6})(?:\.\d+)?\.json$/;

/** `--evidence` 폴더를 증거 원천으로 */
export function folderEarlySealSource(dir: string): EarlySealSource {
  const byRound = new Map<number, PublicSealFile[]>();
  for (const name of readdirSync(dir)) {
    const m = FILE.exec(name);
    if (!m) continue;
    const round = Number(m[1]);
    const file = parseSealFile(readFileSync(join(dir, name), "utf8"), round);
    if (file) byRound.set(round, [...(byRound.get(round) ?? []), file]);
  }
  return async (round) => byRound.get(round) ?? [];
}

const pad = (n: number) => String(n).padStart(6, "0");

/** 한 번 묻기: 서버가 새로 봉인한 회차의 봉인 파일을 받아 둔다. 알릴 줄을 돌려준다 */
export async function watchOnce(
  base: string,
  out: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  mkdirSync(out, { recursive: true });
  const res = await fetchFn(`${base}/ledger/head.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(fetchFailure("head.json", res.status));
  const { sealed } = (await res.json()) as { sealed: number };
  const have = readdirSync(out)
    .map((n) => FILE.exec(n)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  // 처음이면 막 봉인한 회차부터(지난 회차는 이미 추첨이 끝났다). 그 뒤로는 받아 둔 끝 세 회차도 다시 받아,
  // 추첨 뒤에 서버가 봉인 파일을 바꾸면(예: 토큰을 빼고 무효로) 그 차이를 따로 남긴다
  const last = have.length > 0 ? Math.max(...have) : 0;
  const from = last > 0 ? Math.max(1, last - 2) : Math.max(1, sealed);
  const lines: string[] = [];
  for (let round = from; round <= sealed; round++) {
    if (round <= last && !have.includes(round)) continue;
    const r = await fetchFn(`${base}${sealFilePath(round)}`, {
      cache: "no-store",
    });
    if (!r.ok) {
      lines.push(`${round}회 봉인 파일을 받지 못했습니다(HTTP ${r.status})`);
      break;
    }
    const text = await r.text();
    const file = parseSealFile(text, round);
    if (!file) {
      lines.push(`${round}회 봉인 파일 모양이 맞지 않습니다`);
      break;
    }
    const saved = save(out, round, text);
    if (saved === "same") continue;
    if (saved !== "new") {
      lines.push(saved);
      continue;
    }
    const tokens = (file.log as { tokens?: { tsa: string }[] } | null)?.tokens;
    lines.push(
      tokens && tokens.length > 0
        ? `${round}회 봉인 받음(시각 인증 ${tokens.map((t) => t.tsa).join(", ")})`
        : `${round}회 봉인 받음(시각 인증 없음 — 이 회차는 무효로 닫힙니다)`,
    );
  }
  return lines;
}

/** 처음이면 "new", 같은 내용이 있으면 "same", 다른 내용이면 새 이름으로 두고 알릴 줄(서버가 봉인 파일을 바꿨다는 증거) */
function save(out: string, round: number, text: string): string {
  const first = join(out, `${pad(round)}.json`);
  if (!existsSync(first)) {
    writeFileSync(first, text);
    return "new";
  }
  if (readFileSync(first, "utf8") === text) return "same";
  for (let n = 1; ; n++) {
    const next = join(out, `${pad(round)}.${n}.json`);
    if (!existsSync(next)) {
      writeFileSync(next, text);
      return `주의: ${round}회 봉인 파일이 전에 받은 것과 다릅니다(${next}에 따로 둠)`;
    }
    if (readFileSync(next, "utf8") === text) return "same";
  }
}
