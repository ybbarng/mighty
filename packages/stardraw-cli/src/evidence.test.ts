import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { folderEarlySealSource, watchOnce } from "./evidence";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const seal = (round: number, digest: string, tokens = true) =>
  `${JSON.stringify({
    v: 1,
    round,
    digest,
    loggedAt: tokens ? 1793327710 : 0,
    log: tokens
      ? { kind: "tsa", tokens: [{ tsa: "digicert", genTime: 1793327710 }] }
      : null,
  })}\n`;

/** 서버 흉내: head.json의 sealed와 봉인 파일들 */
function server(state: { sealed: number; files: Map<number, string> }) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/ledger/head.json"))
      return new Response(JSON.stringify({ sealed: state.sealed }));
    const m = /\/ledger\/seals\/(\d{6})\.json$/.exec(url);
    const text = m ? state.files.get(Number(m[1])) : undefined;
    return text === undefined
      ? new Response("없음", { status: 404 })
      : new Response(text);
  }) as typeof fetch;
}

describe("추첨 전 봉인 증거 모으기(watch)", () => {
  it("처음엔 막 봉인한 회차부터, 그 뒤로는 새 회차를 차례로 받아 두고, 서버가 파일을 바꾸면 따로 둔다", async () => {
    const out = mkdtempSync(join(tmpdir(), "stardraw-ev-"));
    dirs.push(out);
    const state = {
      sealed: 3,
      files: new Map([
        [3, seal(3, "aa")],
        [4, seal(4, "bb")],
        [5, seal(5, "cc", false)],
      ]),
    };
    expect(await watchOnce("", out, server(state))).toEqual([
      "3회 봉인 받음(시각 인증 digicert)",
    ]);
    state.sealed = 5;
    expect(await watchOnce("", out, server(state))).toEqual([
      "4회 봉인 받음(시각 인증 digicert)",
      "5회 봉인 받음(시각 인증 없음 — 이 회차는 무효로 닫힙니다)",
    ]);
    expect(readdirSync(out).sort()).toEqual([
      "000003.json",
      "000004.json",
      "000005.json",
    ]);

    // 추첨 뒤에 서버가 4회 봉인 파일에서 토큰을 빼면 따로 남기고 알린다
    state.files.set(4, seal(4, "bb", false));
    const changed = await watchOnce("", out, server(state));
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain(
      "주의: 4회 봉인 파일이 전에 받은 것과 다릅니다",
    );
    expect(readdirSync(out)).toContain("000004.1.json");

    // 증거 폴더로 읽으면 회차마다 받아 둔 파일이 나온다
    const source = folderEarlySealSource(out);
    expect((await source(4)).map((f) => f.loggedAt).sort()).toEqual([
      0, 1793327710,
    ]);
    expect(await source(9)).toEqual([]);
  });
});
