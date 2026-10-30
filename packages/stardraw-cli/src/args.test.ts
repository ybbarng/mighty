import { describe, expect, it } from "vitest";

import { DEFAULT_API, DEFAULT_SITE, parseArgs } from "./args";

describe("명령줄", () => {
  it("주소 없이 부르면 시험 서버 장부를 검사한다", () => {
    expect(parseArgs([])).toEqual({
      kind: "ledger",
      base: DEFAULT_API,
      source: { kind: "github" },
      compare: false,
      tickets: [],
      powSample: 8,
      anchorRepo: undefined,
      json: false,
    });
  });

  it("장부 선택: 주소 끝 / 는 떼고, 응모권은 여러 번, 작업 증명 전부, 앵커 끄기", () => {
    expect(
      parseArgs([
        "https://game.byb.kr/stardraw-api/",
        "--ticket",
        "1-abcd ef01 2345",
        "--ticket",
        "2-0011223344",
        "--pow-all",
        "--no-anchor",
        "--json",
      ]),
    ).toEqual({
      kind: "ledger",
      base: "https://game.byb.kr/stardraw-api",
      source: { kind: "github" },
      compare: false,
      tickets: ["1-abcd ef01 2345", "2-0011223344"],
      powSample: Number.POSITIVE_INFINITY,
      anchorRepo: null,
      json: true,
    });
  });

  it("장부를 받을 곳: github(기본)·server·받아 둔 폴더, 두 원천 대조", () => {
    expect(parseArgs(["--source", "server"])).toMatchObject({
      source: { kind: "server" },
    });
    expect(
      parseArgs(["--source", "../stardraw-ledger", "--compare"]),
    ).toMatchObject({
      source: { kind: "folder", path: "../stardraw-ledger" },
      compare: true,
    });
    expect(() => parseArgs(["site", "--compare"])).toThrow(/ledger 명령/);
  });

  it("site 명령: 기본 사이트, 해시 목록·내 빌드 폴더", () => {
    expect(parseArgs(["site", "--build", "apps/web/out"])).toEqual({
      kind: "site",
      site: DEFAULT_SITE,
      hashes: undefined,
      build: "apps/web/out",
      all: false,
      download: true,
      json: false,
    });
  });

  it("틀린 사용은 이유와 함께 거절한다", () => {
    expect(() => parseArgs(["--ticket"])).toThrow("--ticket 뒤에 값이 필요");
    expect(() => parseArgs(["site", "--ticket", "1-abcdef01"])).toThrow(
      "ledger 명령에서만",
    );
    expect(() => parseArgs(["--pow-sample", "-1"])).toThrow();
    expect(() => parseArgs(["site", "--no-download"])).toThrow("--build");
    expect(() => parseArgs(["--모름"])).toThrow("모르는 선택");
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
  });
});
