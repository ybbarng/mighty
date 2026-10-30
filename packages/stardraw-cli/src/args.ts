/** 명령줄 읽기(시험하기 쉽게 따로 둔다) */

export const DEFAULT_API = "https://game.byb.kr/stardraw-api";
export const DEFAULT_SITE = "https://game.byb.kr";

export type Command =
  | {
      kind: "ledger";
      base: string;
      tickets: string[];
      powSample: number;
      anchorRepo: string | null | undefined;
      json: boolean;
    }
  | {
      kind: "site";
      site: string;
      hashes: string | undefined;
      build: string | undefined;
      all: boolean;
      download: boolean;
      json: boolean;
    }
  | { kind: "help" };

export const USAGE = `stardraw-verify — 하늘의 별 따기 독립 검사기

서버나 우리 화면을 거치지 않고, 공개 장부 전체와 사이트 화면 코드를 내 컴퓨터에서 검사합니다.

  stardraw-verify [ledger] [서버 주소]        공개 장부 전체 검사(기본 ${DEFAULT_API})
      --ticket <회차-일련번호>   내 응모권 확인(여러 번 줄 수 있음). 일련번호는 영수증 앞 12자리면 됩니다.
                               공유 주소(…/stardraw/ticket#12-…)를 그대로 넣어도 됩니다
      --pow-sample <n>         회차마다 작업 증명을 계산할 표본 수(기본 8). 내 응모권·당첨은 늘 전부
      --pow-all                작업 증명을 모두 계산(느림)
      --anchor-repo <소유자/이름>  앵커 저장소(기본 ybbarng/stardraw-ledger)
      --no-anchor              앵커 저장소를 보지 않음
      --json                   결과를 JSON으로

  stardraw-verify site [사이트 주소]         화면 코드 해시 비교(기본 ${DEFAULT_SITE})
      --hashes <파일|주소>      해시 목록(기본 <사이트>/build-hashes.json)
      --build <out 폴더>        같은 커밋으로 직접 빌드한 out/ 을 목록과 비교
      --all                    하늘의 별 따기 화면 코드뿐 아니라 목록의 모든 파일(그림 포함)을 비교
      --no-download            사이트에서 파일을 받지 않음(--build 비교만)
      --json                   결과를 JSON으로

끝 상태: 0 모두 통과(건너뜀 포함), 1 어긋남, 2 사용법·네트워크 오류`;

export function parseArgs(argv: readonly string[]): Command {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" };
  let kind: "ledger" | "site" = "ledger";
  if (args[0] === "site" || args[0] === "ledger") {
    kind = args.shift() as "ledger" | "site";
  }
  const positional: string[] = [];
  const tickets: string[] = [];
  let powSample = 8;
  let anchorRepo: string | null | undefined;
  let json = false;
  let hashes: string | undefined;
  let build: string | undefined;
  let all = false;
  let download = true;
  const value = (flag: string): string => {
    const v = args.shift();
    if (v === undefined || v.startsWith("--"))
      throw new Error(`${flag} 뒤에 값이 필요합니다`);
    return v;
  };
  while (args.length > 0) {
    const a = args.shift() as string;
    const only = (k: "ledger" | "site") => {
      if (kind !== k) throw new Error(`${a}는 ${k} 명령에서만 씁니다`);
    };
    switch (a) {
      case "--json":
        json = true;
        break;
      case "--ticket":
        only("ledger");
        tickets.push(value(a));
        break;
      case "--pow-sample": {
        only("ledger");
        const n = Number(value(a));
        if (!Number.isInteger(n) || n < 0)
          throw new Error("--pow-sample은 0 이상의 정수입니다");
        powSample = n;
        break;
      }
      case "--pow-all":
        only("ledger");
        powSample = Number.POSITIVE_INFINITY;
        break;
      case "--anchor-repo":
        only("ledger");
        anchorRepo = value(a);
        break;
      case "--no-anchor":
        only("ledger");
        anchorRepo = null;
        break;
      case "--hashes":
        only("site");
        hashes = value(a);
        break;
      case "--build":
        only("site");
        build = value(a);
        break;
      case "--all":
        only("site");
        all = true;
        break;
      case "--no-download":
        only("site");
        download = false;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`모르는 선택 ${a}`);
        positional.push(a);
    }
  }
  if (positional.length > 1)
    throw new Error(`주소는 하나만 줍니다: ${positional.join(" ")}`);
  const trim = (url: string) => url.replace(/\/+$/, "");
  if (kind === "ledger")
    return {
      kind,
      base: trim(positional[0] ?? DEFAULT_API),
      tickets,
      powSample,
      anchorRepo,
      json,
    };
  if (!download && !build)
    throw new Error("--no-download이면 --build로 비교할 폴더를 주세요");
  return {
    kind,
    site: trim(positional[0] ?? DEFAULT_SITE),
    hashes,
    build,
    all,
    download,
    json,
  };
}
