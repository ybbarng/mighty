import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { main } from "./main";
import {
  type BuildHashes,
  checkSiteFiles,
  diffTrees,
  hashTree,
  parseBuildHashes,
  sha256Hex,
  siteScope,
  treeDigest,
} from "./site";

/** out/ 을 닮은 작은 폴더 */
function fakeOut(): string {
  const dir = mkdtempSync(join(tmpdir(), "stardraw-out-"));
  mkdirSync(join(dir, "stardraw"), { recursive: true });
  mkdirSync(join(dir, "_next/static/chunks"), { recursive: true });
  writeFileSync(join(dir, "stardraw.html"), "<html>별</html>");
  writeFileSync(join(dir, "stardraw/verify.html"), "<html>검증</html>");
  writeFileSync(join(dir, "_next/static/chunks/a.js"), "console.log(1)");
  writeFileSync(join(dir, "sw.js"), "self");
  writeFileSync(join(dir, "omok.html"), "<html>오목</html>");
  return dir;
}

const SCRIPT = fileURLToPath(
  new URL("../../../apps/web/scripts/build-hashes.mjs", import.meta.url),
);

describe("해시 목록 계산", () => {
  it("파일마다 SHA-256, 경로는 / 로 잇고 바이트 순서", () => {
    const files = hashTree(fakeOut());
    expect(Object.keys(files)).toEqual([
      "_next/static/chunks/a.js",
      "omok.html",
      "stardraw.html",
      "stardraw/verify.html",
      "sw.js",
    ]);
    expect(files["sw.js"]).toBe(sha256Hex("self"));
  });

  it("digest는 sha256sum 형식 글의 SHA-256이다(다른 도구로 다시 계산할 수 있다)", () => {
    const files = { "b.js": "11".repeat(32), "a.html": "22".repeat(32) };
    expect(treeDigest(files)).toBe(
      sha256Hex(`${"22".repeat(32)}  a.html\n${"11".repeat(32)}  b.js\n`),
    );
  });

  it("사이트 빌드 스크립트(apps/web/scripts/build-hashes.mjs)가 만든 목록과 검사기 계산이 같다", async () => {
    const dir = fakeOut();
    execFileSync(process.execPath, [SCRIPT, dir], {
      env: {
        ...process.env,
        SOURCE_COMMIT: "abc123",
        NEXT_PUBLIC_SITE_URL: "https://game.byb.kr",
      },
      stdio: "ignore",
    });
    const file = join(dir, "build-hashes.json");
    const hashes = parseBuildHashes(readFileSync(file, "utf8"));
    expect(hashes.commit).toBe("abc123");
    expect(hashes.env.NEXT_PUBLIC_SITE_URL).toBe("https://game.byb.kr");
    expect(hashes.files).toEqual(hashTree(dir));
    expect(hashes.digest).toBe(treeDigest(hashTree(dir)));

    // 같은 폴더를 내 빌드로 비교하면 통과, 한 파일을 고치면 실패
    const quiet = { print: () => {}, error: () => {}, progress: null };
    const argv = ["site", "--hashes", file, "--build", dir, "--no-download"];
    expect(await main(argv, quiet)).toBe(0);
    // 범위 밖 파일(다른 게임)은 기본 비교에서 빠지고 --all에서 드러난다
    writeFileSync(join(dir, "omok.html"), "<html>바뀜</html>");
    expect(await main(argv, quiet)).toBe(0);
    expect(await main([...argv, "--all"], quiet)).toBe(1);
    writeFileSync(join(dir, "stardraw.html"), "<html>바뀜</html>");
    expect(await main(argv, quiet)).toBe(1);
  });
});

describe("비교", () => {
  it("다름·없음·더 있음을 나눈다", () => {
    expect(
      diffTrees({ a: "1", b: "2", c: "3" }, { a: "1", b: "9", d: "4" }),
    ).toEqual({ same: 1, changed: ["b"], missing: ["c"], extra: ["d"] });
  });

  it("사이트에서 받을 범위: 별 따기 페이지·화면 코드·서비스 워커", () => {
    expect(siteScope("stardraw.html")).toBe(true);
    expect(siteScope("stardraw/verify.txt")).toBe(true);
    expect(siteScope("_next/static/chunks/a.js")).toBe(true);
    expect(siteScope("sw.js")).toBe(true);
    expect(siteScope("omok.html")).toBe(false);
    expect(siteScope("stardrawish.html")).toBe(false);
    expect(siteScope("omok.html", true)).toBe(true);
  });

  it("사이트에서 받은 파일이 목록과 다르거나 받지 못하면 드러난다", async () => {
    const dir = fakeOut();
    const files = hashTree(dir);
    const hashes: BuildHashes = {
      v: 1,
      commit: "abc",
      dirty: false,
      env: {},
      node: "v24",
      files,
      digest: treeDigest(files),
    };
    const served: Record<string, string> = {
      "https://game.byb.kr/stardraw.html": "<html>별</html>",
      "https://game.byb.kr/stardraw/verify.html": "<html>몰래 바꿈</html>",
      "https://game.byb.kr/sw.js": "self",
    };
    const fetch = (async (input: string | URL | Request) => {
      const body = served[String(input)];
      return body === undefined
        ? new Response("없음", { status: 404 })
        : new Response(body);
    }) as typeof globalThis.fetch;
    const result = await checkSiteFiles("https://game.byb.kr", hashes, {
      fetch,
    });
    expect(result).toEqual({
      checked: 3,
      changed: ["stardraw/verify.html"],
      failed: ["_next/static/chunks/a.js(404)"],
    });
  });

  it("모양이 틀린 목록은 거절한다", () => {
    expect(() => parseBuildHashes('{"v":2}')).toThrow("판");
    expect(() =>
      parseBuildHashes(
        JSON.stringify({ v: 1, commit: "a", digest: "b", files: { x: "zz" } }),
      ),
    ).toThrow("x의 해시");
  });
});
