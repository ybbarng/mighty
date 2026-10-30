import { readFileSync } from "node:fs";
import {
  checkPublicLedger,
  findTicket,
  loadPublicLedger,
  parseTicketQuery,
  ticketIdFromHex,
} from "@mighty/stardraw-core";

import { type Command, parseArgs, USAGE } from "./args";
import { ledgerReport } from "./report";
import {
  type BuildHashes,
  checkSiteFiles,
  diffTrees,
  HASHES_FILE,
  hashTree,
  parseBuildHashes,
  type SiteCheck,
  siteScope,
  type TreeDiff,
  treeDigest,
} from "./site";

/**
 * 하늘의 별 따기 독립 검사기(docs/36 7절, 11-8). 규칙 코드는 화면과 같은 @mighty/stardraw-core지만,
 * 공개 저장소에서 내가 받아 돌리므로 운영자가 내주는 화면 코드를 믿지 않아도 된다.
 */

/** 바깥과 닿는 곳. 시험은 받아 둔 장부를 내주는 가짜 fetch와 글 모으기를 넣는다 */
export interface Io {
  fetch: typeof fetch;
  print: (text: string) => void;
  error: (text: string) => void;
  /** 받는 중 n/m 표시(터미널일 때만) */
  progress: ((label: string) => (done: number, total: number) => void) | null;
}

/** 30초 안에 응답이 없으면 끊는다(멈춘 연결에 매달리지 않게) */
const timedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(30_000) });

const DEFAULT_IO: Io = {
  fetch: timedFetch,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  progress: process.stderr.isTTY
    ? (label) => (done, total) => {
        process.stderr.write(`\r${label} ${done}/${total}`);
        if (done === total) process.stderr.write("\n");
      }
    : null,
};

async function runLedger(
  cmd: Extract<Command, { kind: "ledger" }>,
  io: Io,
): Promise<number> {
  const queries = cmd.tickets.map((text) => {
    const q = parseTicketQuery(text);
    if (!q)
      throw new Error(
        `응모권을 읽지 못했습니다: ${text} (예: 12-abcd ef01 2345)`,
      );
    return { text, q };
  });
  // 장부를 한 번 받아 내 응모권을 찾고, 찾은 응모권은 작업 증명까지 전부 계산하게 검사에 넘긴다
  const ledger = await loadPublicLedger(
    cmd.base,
    io.fetch,
    cmd.json ? undefined : io.progress?.("장부 받는 중"),
  );
  const findings = queries.map(({ text, q }) => ({
    query: text,
    finding: findTicket(ledger, q),
  }));
  const mine = findings.flatMap(({ finding }) =>
    finding.found ? [ticketIdFromHex(finding.id) as Uint8Array] : [],
  );
  const result = await checkPublicLedger({
    base: cmd.base,
    ledger,
    fetch: io.fetch,
    powSample: cmd.powSample,
    ...(cmd.anchorRepo !== undefined ? { anchorRepo: cmd.anchorRepo } : {}),
    ...(mine.length > 0 ? { mine } : {}),
  });
  const failed =
    result.items.some((i) => i.status === "fail") ||
    findings.some((f) => !f.finding.found || !f.finding.included);
  if (cmd.json) {
    const { ledger: _, ...rest } = result;
    io.print(
      JSON.stringify(
        {
          base: cmd.base,
          ...rest,
          mine: findings.map(({ query, finding }) =>
            finding.found
              ? {
                  query,
                  found: true,
                  round: finding.round,
                  id: finding.id,
                  included: finding.included,
                  rank: finding.rank,
                  void: finding.void,
                  numbers: finding.ticket.numbers,
                }
              : { query, found: false, reason: finding.reason },
          ),
          ok: !failed,
        },
        null,
        2,
      ),
    );
  } else io.print(ledgerReport(cmd.base, result, findings));
  return failed ? 1 : 0;
}

async function loadHashes(source: string, io: Io): Promise<BuildHashes> {
  if (/^https?:\/\//.test(source)) {
    const res = await io.fetch(source, { cache: "no-store" });
    if (!res.ok)
      throw new Error(`해시 목록을 받지 못했습니다(${res.status}): ${source}`);
    return parseBuildHashes(await res.text());
  }
  return parseBuildHashes(readFileSync(source, "utf8"));
}

const list = (paths: string[], max = 10) =>
  paths.length > max
    ? [...paths.slice(0, max), `… 외 ${paths.length - max}개`]
    : paths;

async function runSite(
  cmd: Extract<Command, { kind: "site" }>,
  io: Io,
): Promise<number> {
  const source = cmd.hashes ?? `${cmd.site}/${HASHES_FILE}`;
  const hashes = await loadHashes(source, io);
  const selfOk = treeDigest(hashes.files) === hashes.digest;
  let build: TreeDiff | undefined;
  // 기본은 하늘의 별 따기 화면 코드 범위만 본다(--all이면 그림까지 전부)
  const inScope = (files: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(files).filter(([p]) => siteScope(p, cmd.all)),
    );
  if (cmd.build)
    build = diffTrees(inScope(hashes.files), inScope(hashTree(cmd.build)));
  let site: SiteCheck | undefined;
  if (cmd.download)
    site = await checkSiteFiles(cmd.site, hashes, {
      all: cmd.all,
      fetch: io.fetch,
      ...(cmd.json ? {} : { onProgress: io.progress?.("파일 받는 중") }),
    });
  const buildOk =
    !build ||
    (build.changed.length === 0 &&
      build.missing.length === 0 &&
      build.extra.length === 0);
  const siteOk =
    !site || (site.changed.length === 0 && site.failed.length === 0);
  const ok = selfOk && buildOk && siteOk;
  if (cmd.json) {
    io.print(
      JSON.stringify(
        {
          hashes: source,
          commit: hashes.commit,
          dirty: hashes.dirty,
          env: hashes.env,
          digest: hashes.digest,
          files: Object.keys(hashes.files).length,
          digestOk: selfOk,
          build,
          site,
          ok,
        },
        null,
        2,
      ),
    );
    return ok ? 0 : 1;
  }
  const out: string[] = [];
  out.push(`하늘의 별 따기 화면 코드 해시 비교 · ${source}`);
  out.push(
    `커밋 ${hashes.commit}${hashes.dirty ? " (커밋하지 않은 변경이 있던 빌드)" : ""} · 파일 ${Object.keys(hashes.files).length}개 · Node ${hashes.node}`,
  );
  out.push(
    `빌드 변수 ${
      Object.entries(hashes.env)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ") || "(없음)"
    }`,
  );
  out.push(
    `${selfOk ? "통과  " : "실패  "}  목록의 digest ${hashes.digest}${selfOk ? "" : " — 파일 목록으로 다시 계산한 값과 다릅니다"}`,
  );
  if (build) {
    out.push(
      `${buildOk ? "통과  " : "실패  "}  내 빌드(${cmd.build}): 같은 파일 ${build.same}개${cmd.all ? "" : "(하늘의 별 따기 페이지·화면 코드·서비스 워커)"}`,
    );
    for (const p of list(build.changed)) out.push(`        다름: ${p}`);
    for (const p of list(build.missing))
      out.push(`        내 빌드에 없음: ${p}`);
    for (const p of list(build.extra))
      out.push(`        내 빌드에만 있음: ${p}`);
  }
  if (site) {
    out.push(
      `${siteOk ? "통과  " : "실패  "}  사이트(${cmd.site})에서 받은 파일 ${site.checked}개${cmd.all ? "" : "(하늘의 별 따기 페이지·화면 코드·서비스 워커)"}`,
    );
    for (const p of list(site.changed)) out.push(`        다름: ${p}`);
    for (const p of list(site.failed)) out.push(`        받지 못함: ${p}`);
  }
  out.push(
    ok
      ? build && site
        ? "결과: 사이트가 내준 화면 코드가 이 커밋을 직접 빌드한 것과 같습니다"
        : build
          ? "결과: 내 빌드가 목록과 같습니다"
          : "결과: 사이트 파일이 목록과 같습니다. 목록이 그 커밋에서 나온 것인지는 --build로 직접 빌드해 확인하세요"
      : "결과: 어긋나는 파일이 있습니다",
  );
  io.print(out.join("\n"));
  return ok ? 0 : 1;
}

export async function main(
  argv: readonly string[],
  overrides: Partial<Io> = {},
): Promise<number> {
  const io: Io = { ...DEFAULT_IO, ...overrides };
  let cmd: Command;
  try {
    cmd = parseArgs(argv);
  } catch (err) {
    io.error(`${err instanceof Error ? err.message : String(err)}\n`);
    io.error(USAGE);
    return 2;
  }
  if (cmd.kind === "help") {
    io.print(USAGE);
    return 0;
  }
  try {
    return cmd.kind === "ledger"
      ? await runLedger(cmd, io)
      : await runSite(cmd, io);
  } catch (err) {
    io.error(
      `검사하지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }
}
