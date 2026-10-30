// 화면 코드 해시 목록(docs/36 11-8). `next build`가 끝난 뒤 out/ 의 모든 파일 SHA-256을 out/build-hashes.json 에 적는다.
// 사이트는 이 파일을 /build-hashes.json 으로 함께 낸다. 누구든 같은 커밋으로 빌드해 같은 해시인지,
// 사이트에서 받은 파일이 이 해시인지 비교할 수 있다(터미널 검사기 `stardraw-verify site`, 또는 sha256sum).
//
// 형식(v1)
//   commit  빌드한 커밋(SOURCE_COMMIT, 없으면 git). 빌드 id로도 쓰여 out/ 안에 들어간다(next.config.ts)
//   dirty   커밋하지 않은 변경이 있었는지(git이 없으면 null)
//   env     out/ 에 들어가는 빌드 변수(NEXT_PUBLIC_*). 같은 값으로 빌드해야 같은 파일이 나온다
//   node    빌드한 Node 판(참고)
//   files   { "경로": "sha256 hex" } — 경로는 out/ 기준, 바이트 순서로 정렬. 이 파일 자신은 뺀다
//   digest  files를 sha256sum 형식("<hex>  <경로>\n")으로 적은 글의 SHA-256. 한 줄로 비교할 때 쓴다
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HASHES_FILE = "build-hashes.json";

/** 폴더 아래 모든 파일의 SHA-256(경로는 / 로 잇고 바이트 순서로 정렬) */
export function hashTree(root) {
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        if (path === HASHES_FILE) continue;
        files[path] = createHash("sha256")
          .update(readFileSync(full))
          .digest("hex");
      }
    }
  };
  walk(root);
  const sorted = {};
  for (const path of Object.keys(files).sort(byBytes))
    sorted[path] = files[path];
  return sorted;
}

const byBytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** sha256sum 형식 목록의 SHA-256 */
export function treeDigest(files) {
  const text = Object.entries(files)
    .map(([path, hash]) => `${hash}  ${path}\n`)
    .join("");
  return createHash("sha256").update(text).digest("hex");
}

function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  // 폴더를 주면 그 폴더(시험), 없으면 apps/web/out
  const out =
    process.argv[2] ?? fileURLToPath(new URL("../out", import.meta.url));
  const files = hashTree(out);
  const commit =
    process.env.SOURCE_COMMIT?.trim() ||
    git(["rev-parse", "HEAD"]) ||
    "unknown";
  const status = git(["status", "--porcelain"]);
  const env = {};
  for (const name of Object.keys(process.env).sort()) {
    if (name.startsWith("NEXT_PUBLIC_")) env[name] = process.env[name];
  }
  const manifest = {
    v: 1,
    commit,
    dirty: status === null ? null : status.length > 0,
    env,
    node: process.version,
    files,
    digest: treeDigest(files),
  };
  writeFileSync(
    join(out, HASHES_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `build-hashes.json: 파일 ${Object.keys(files).length}개, digest ${manifest.digest}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
