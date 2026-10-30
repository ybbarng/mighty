import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  encodeRegistration,
  encodeTicket,
  findGitHubLedger,
  GENESIS_ANCHOR_PATH,
  genesisHash,
  type PublicLedger,
  parseGenesisAnchorFile,
  recordHash,
  STARDRAW_ANCHOR_REPO,
  toHex,
} from "@mighty/stardraw-core";

import type { LedgerSource } from "./args";

/**
 * 장부를 받을 곳(docs/36 11-16). 기본은 앵커 저장소에 올라간 장부 사본(GitHub raw)이라 우리 서버 없이 검사한다.
 * 받는 코드(`loadPublicLedger`)는 같고 기준 주소와 fetch만 바뀐다.
 */
export interface ResolvedSource {
  kind: LedgerSource["kind"];
  /** 사람이 읽는 이름(보고서 첫 줄) */
  label: string;
  /** loadPublicLedger 기준 주소 */
  base: string;
  fetch: typeof fetch;
}

/** file:// 주소를 폴더에서 읽어 내주는 fetch(없으면 404). 그 밖의 주소는 next로 */
export function folderFetch(next: typeof fetch): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.protocol !== "file:") return next(input, init);
    try {
      return new Response(readFileSync(url));
    } catch {
      return new Response("없음", { status: 404 });
    }
  }) as typeof fetch;
}

/** 받아 둔 앵커 저장소 폴더에서 장부 id를 찾는다: genesis.txt, 없으면 사본이 하나뿐인 장부 */
export function folderLedgerId(root: string): string {
  const genesis = join(root, GENESIS_ANCHOR_PATH);
  if (existsSync(genesis)) {
    const hash = parseGenesisAnchorFile(readFileSync(genesis, "utf8"));
    if (hash) return hash.slice(0, 16);
  }
  const dir = join(root, "ledgers");
  const ids = existsSync(dir)
    ? readdirSync(dir).filter((id) =>
        existsSync(join(dir, id, "ledger", "head.json")),
      )
    : [];
  if (ids.length === 1) return ids[0] as string;
  throw new Error(
    ids.length === 0
      ? `${root}에 장부 사본(ledgers/<장부 id>/ledger/head.json)이 없습니다`
      : `${root}에 장부가 여럿이라 고르지 못했습니다: ${ids.join(", ")}`,
  );
}

export async function resolveSource(
  source: LedgerSource,
  server: string,
  repo: string | null | undefined,
  fetchFn: typeof fetch,
): Promise<ResolvedSource> {
  if (source.kind === "server")
    return { kind: "server", label: server, base: server, fetch: fetchFn };
  if (source.kind === "folder") {
    const root = resolve(source.path);
    const id = folderLedgerId(root);
    const base = pathToFileURL(join(root, "ledgers", id)).href;
    return {
      kind: "folder",
      label: `${root} (장부 ${id})`,
      base,
      fetch: folderFetch(fetchFn),
    };
  }
  const found = await findGitHubLedger({
    repo: repo ?? STARDRAW_ANCHOR_REPO,
    fetch: fetchFn,
  }).catch((err: unknown) => {
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}. 서버에서 받으려면 --source server`,
    );
  });
  return {
    kind: "github",
    label: `GitHub ${found.repo} ${found.branch} 브랜치 (장부 ${found.ledger})`,
    base: found.base,
    fetch: fetchFn,
  };
}

/**
 * 두 원천의 장부를 겹치는 회차까지 대조한다(처음 일정표, 회차 기록 해시, 응모권·등록 목록, 봉인 파일).
 * 다른 곳을 문장으로 돌려준다. 한쪽에만 있는 회차는 다름이 아니다(앵커는 회차가 닫힌 뒤 오른다)
 */
export function compareLedgers(a: PublicLedger, b: PublicLedger): string[] {
  const out: string[] = [];
  if (toHex(genesisHash(a.genesis)) !== toHex(genesisHash(b.genesis))) {
    out.push("처음 일정표가 다릅니다");
    return out;
  }
  const same = (x: Uint8Array[], y: Uint8Array[]) =>
    x.length === y.length &&
    x.every((v, i) => toHex(v) === toHex(y[i] ?? new Uint8Array()));
  const n = Math.min(a.records.length, b.records.length);
  for (let i = 0; i < n; i++) {
    const round = i + 1;
    const ra = a.records[i];
    const rb = b.records[i];
    if (!ra || !rb || toHex(recordHash(ra)) !== toHex(recordHash(rb)))
      out.push(`${round}회차: 기록 해시가 다릅니다`);
    if (
      !same(
        (a.tickets[i] ?? []).map(encodeTicket),
        (b.tickets[i] ?? []).map(encodeTicket),
      )
    )
      out.push(`${round}회차: 응모권 목록이 다릅니다`);
    if (
      !same(
        (a.registrations[i] ?? []).map(encodeRegistration),
        (b.registrations[i] ?? []).map(encodeRegistration),
      )
    )
      out.push(`${round}회차: 열쇠 등록 목록이 다릅니다`);
    if (JSON.stringify(a.seals[i]) !== JSON.stringify(b.seals[i]))
      out.push(`${round}회차: 봉인 파일이 다릅니다`);
  }
  return out;
}
