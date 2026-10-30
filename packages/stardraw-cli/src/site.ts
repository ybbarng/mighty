import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * 화면 코드 해시 비교(docs/36 11-8).
 *
 * 사이트는 빌드할 때 만든 해시 목록 `/build-hashes.json`(apps/web/scripts/build-hashes.mjs)을 함께 낸다.
 * (a) 저장소를 받아 같은 커밋·같은 빌드 변수로 빌드한 out/ 이 목록과 같은지,
 * (b) 사이트에서 지금 받은 파일이 목록의 해시인지를 본다. 둘 다 맞으면 사이트가 내준 화면 코드가
 * 공개 저장소의 그 커밋에서 나온 것이다.
 */

export const HASHES_FILE = "build-hashes.json";

export interface BuildHashes {
  v: 1;
  commit: string;
  dirty: boolean | null;
  env: Record<string, string>;
  node: string;
  files: Record<string, string>;
  digest: string;
}

/** 바이트 순서 정렬(빌드 스크립트와 같은 규칙) */
const byBytes = (a: string, b: string) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));

/** 폴더 아래 모든 파일의 SHA-256. 경로는 / 로 잇고 바이트 순서, 해시 목록 파일 자신은 뺀다 */
export function hashTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        if (path !== HASHES_FILE) files[path] = sha256Hex(readFileSync(full));
      }
    }
  };
  walk(root);
  return sortFiles(files);
}

export function sortFiles(
  files: Record<string, string>,
): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const path of Object.keys(files).sort(byBytes))
    sorted[path] = files[path] as string;
  return sorted;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** sha256sum 형식("<hex>  <경로>\n", 바이트 순서)으로 적은 글의 SHA-256 */
export function treeDigest(files: Record<string, string>): string {
  return sha256Hex(
    Object.entries(sortFiles(files))
      .map(([path, hash]) => `${hash}  ${path}\n`)
      .join(""),
  );
}

/** 해시 목록 모양 확인. 틀리면 이유 */
export function parseBuildHashes(text: string): BuildHashes {
  const m = JSON.parse(text) as Partial<BuildHashes>;
  if (m.v !== 1) throw new Error("해시 목록 판(v)이 1이 아닙니다");
  if (typeof m.commit !== "string" || typeof m.digest !== "string")
    throw new Error("해시 목록에 commit·digest가 없습니다");
  if (!m.files || typeof m.files !== "object")
    throw new Error("해시 목록에 files가 없습니다");
  for (const [path, hash] of Object.entries(m.files))
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash))
      throw new Error(`${path}의 해시 모양이 틀렸습니다`);
  return m as BuildHashes;
}

export interface TreeDiff {
  same: number;
  /** 해시가 다른 경로 */
  changed: string[];
  /** 목록에는 있는데 비교 대상에 없는 경로 */
  missing: string[];
  /** 비교 대상에만 있는 경로 */
  extra: string[];
}

export function diffTrees(
  expected: Record<string, string>,
  actual: Record<string, string>,
): TreeDiff {
  const diff: TreeDiff = { same: 0, changed: [], missing: [], extra: [] };
  for (const [path, hash] of Object.entries(expected)) {
    const got = actual[path];
    if (got === undefined) diff.missing.push(path);
    else if (got === hash) diff.same++;
    else diff.changed.push(path);
  }
  for (const path of Object.keys(actual))
    if (!(path in expected)) diff.extra.push(path);
  return diff;
}

/**
 * 사이트에서 받아 볼 파일: 하늘의 별 따기 페이지(HTML과 화면 전환용 .txt), 모든 화면 코드(`_next/`), 서비스 워커.
 * `all`이면 목록 전부(그림·소리 포함).
 */
export function siteScope(path: string, all = false): boolean {
  if (all) return true;
  return (
    /^stardraw(\.|\/)/.test(path) ||
    path.startsWith("_next/") ||
    path === "sw.js"
  );
}

export interface SiteCheck {
  checked: number;
  changed: string[];
  /** 받지 못한 파일(이유 포함) */
  failed: string[];
}

/** 사이트에서 파일을 받아 해시를 목록과 비교한다(동시에 6개씩) */
export async function checkSiteFiles(
  site: string,
  hashes: BuildHashes,
  options: {
    all?: boolean;
    fetch?: typeof fetch;
    onProgress?: ((done: number, total: number) => void) | undefined;
  } = {},
): Promise<SiteCheck> {
  const f = options.fetch ?? ((...args) => fetch(...args));
  const paths = Object.keys(hashes.files).filter((p) =>
    siteScope(p, options.all),
  );
  const result: SiteCheck = { checked: 0, changed: [], failed: [] };
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < paths.length) {
      const path = paths[next++] as string;
      try {
        const res = await f(`${site}/${encodePath(path)}`, {
          cache: "no-store",
        });
        if (!res.ok) result.failed.push(`${path}(${res.status})`);
        else {
          const hash = sha256Hex(new Uint8Array(await res.arrayBuffer()));
          result.checked++;
          if (hash !== hashes.files[path]) result.changed.push(path);
        }
      } catch (err) {
        result.failed.push(
          `${path}(${err instanceof Error ? err.message : String(err)})`,
        );
      }
      options.onProgress?.(++done, paths.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  result.changed.sort(byBytes);
  result.failed.sort(byBytes);
  return result;
}

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");
