import { describe, expect, it } from "vitest";

import LIVE from "./fixtures/live-ledger-2026-10-30.json";
import { main } from "./main";

/**
 * 2026-10-30 시험 서버(https://game.byb.kr/stardraw-api)에서 받아 둔 공개 장부와 앵커 저장소 파일.
 * drand BLS 서명과 DigiCert·Sectigo 시각 인증 토큰이 진짜라, 네트워크 없이 실제 검사 경로를 그대로 돈다.
 */
const BASE = "https://game.byb.kr/stardraw-api";
const ANCHOR = "https://raw.githubusercontent.com/ybbarng/stardraw-ledger";

type Files = Record<string, unknown>;

function fakeFetch(change: (f: Files) => void = () => {}): typeof fetch {
  const files: Files = structuredClone(LIVE) as Files;
  change(files);
  return (async (input: string | URL | Request) => {
    const body = files[String(input)];
    if (body === undefined) return new Response("없음", { status: 404 });
    return typeof body === "string" ? new Response(body) : Response.json(body);
  }) as typeof fetch;
}

async function run(argv: string[], fetch: typeof globalThis.fetch) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    fetch,
    print: (t) => out.push(t),
    error: (t) => err.push(t),
    progress: null,
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("장부 검사(받아 둔 실제 장부)", () => {
  it("정직한 장부는 drand 서명·시각 인증·앵커까지 모두 통과한다", async () => {
    const { code, out } = await run([BASE], fakeFetch());
    expect(out).toContain("통과  시험 1회(사슬 1)");
    expect(out).toContain("당첨 번호 9 21 29 38 39 45 + 23");
    expect(out).toContain("1회차 확인(digicert, sectigo)");
    expect(out).toMatch(/통과 {4}앵커 저장소/);
    expect(out).toContain("[국장 열쇠 내력]");
    expect(out).toContain("국장 열쇠 지정 기록이 없습니다");
    expect(out).toContain("결과: 모든 확인을 통과했습니다");
    expect(code).toBe(0);
  });

  it("받아 둔 장부에는 응모권·열쇠 등록이 없어, 원시 열쇠를 받지 않는 규칙으로 바꿔도 걸리는 기록이 없다(docs/36 11-11)", () => {
    const rounds = Object.entries(LIVE as Files).filter(([url]) =>
      url.startsWith(`${BASE}/ledger/rounds/`),
    );
    expect(rounds.length).toBeGreaterThan(0);
    for (const [, file] of rounds) {
      const { tickets, registrations } = file as {
        tickets: string[];
        registrations: string[];
      };
      expect(tickets).toEqual([]);
      expect(registrations).toEqual([]);
    }
  });

  it("장부 끝 해시를 바꾸면 실패로 끝난다(끝 상태 1)", async () => {
    const { code, out } = await run(
      [BASE],
      fakeFetch((f) => {
        const head = f[`${BASE}/ledger/head.json`] as { head: string };
        head.head = "00".repeat(32);
      }),
    );
    expect(out).toMatch(/실패 {4}장부 끝 해시/);
    expect(code).toBe(1);
  });

  it("앵커 저장소의 처음 일정표와 다르면(장부를 다시 시작했다) 실패한다", async () => {
    const { code, out } = await run(
      [BASE],
      fakeFetch((f) => {
        f[`${ANCHOR}/main/genesis.txt`] =
          "stardraw-genesis v1\nledger 0000000000000000\ngenesis " +
          "00".repeat(32) +
          "\nepoch 1793327700\n";
      }),
    );
    expect(out).toContain("장부를 다시 시작했다");
    expect(code).toBe(1);
  });

  it("앵커를 끄면 앵커 항목은 건너뜀이다", async () => {
    const { code, out } = await run([BASE, "--no-anchor"], fakeFetch());
    expect(out).toMatch(/건너뜀 {2}앵커 저장소/);
    expect(code).toBe(0);
  });

  it("장부에 없는 응모권은 못 찾음으로 실패한다", async () => {
    const { code, out } = await run(
      [BASE, "--ticket", "1-abcd ef01 2345"],
      fakeFetch(),
    );
    expect(out).toContain(
      "못 찾음  1-abcd ef01 2345: 1회차 응모권 0장 가운데 이 일련번호가 없습니다",
    );
    expect(out).toContain("확인하려던 응모권을 장부에서 찾지 못했습니다");
    expect(code).toBe(1);
  });

  it("JSON으로 내보낸다", async () => {
    const { code, out } = await run([BASE, "--json"], fakeFetch());
    const json = JSON.parse(out) as { ok: boolean; rounds: number };
    expect(json).toMatchObject({ ok: true, rounds: 1 });
    expect(code).toBe(0);
  });

  it("장부를 받지 못하면 사용법·네트워크 오류(끝 상태 2)", async () => {
    const { code, err } = await run(
      ["https://example.invalid/stardraw-api"],
      fakeFetch(),
    );
    expect(err).toContain("/ledger/genesis.json를 받지 못했습니다(404)");
    expect(code).toBe(2);
  });
});
