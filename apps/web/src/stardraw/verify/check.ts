import {
  type BeaconVerifier,
  type CheckResult,
  checkItemsFrom,
  checkPublicLedger,
  directorHistory,
  operationsView,
  qualificationSummary,
  type RoundRecord,
  STARDRAW_ANCHOR_REPO,
  TIMESTAMP_LABEL,
  type Ticket,
  type TsaAuthority,
  toHex,
  type VerifyReport,
  voidRoundsItem,
  withPowDetail,
  withQualDetail,
} from "@mighty/stardraw-core";

export type {
  CheckItem,
  CheckResult,
  CheckStatus,
} from "@mighty/stardraw-core";

/**
 * 「장부 전체 검사」(검증하기 페이지·콘솔 `stardraw.verify()`).
 * 서버 장부면 공개 장부 파일만 받아 화면의 장부 코드를 거치지 않고 처음부터 다시 계산한다.
 * 계산은 규칙 패키지의 `checkPublicLedger`로, 터미널 검사기(packages/stardraw-cli)와 같은 코드다.
 * 서버 주소가 없는 빌드(연습 장부)는 이 기기의 연습 장부를 같은 함수로 검사한다.
 */

/** 서버 주소(빌드할 때 들어간다, services.ts와 같은 값). 비어 있으면 연습 장부 */
export const SERVER_API = process.env.NEXT_PUBLIC_STARDRAW_API ?? "";

/** GitHub 앵커 저장소(docs/36 11-7). 시험 단계 회차는 trial, 정식 단계 회차와 처음 일정표는 main 브랜치 */
export const ANCHOR_REPO =
  process.env.NEXT_PUBLIC_STARDRAW_ANCHOR_REPO ?? STARDRAW_ANCHOR_REPO;

export interface CheckOptions {
  /** 회차마다 작업 증명을 계산할 표본 수(내 것·당첨 제외). 기본 8, 전부는 Infinity */
  powSample?: number;
  fetch?: typeof fetch;
  base?: string;
  /** 시험만 바꿔 끼운다(기본은 quicknet BLS 확인) */
  beaconVerifier?: BeaconVerifier;
  /** 앵커 저장소(기본 ANCHOR_REPO). null이면 앵커를 보지 않는다 */
  anchorRepo?: string | null;
  /** 시험만 바꿔 끼운다(기본은 core에 열쇠를 고정한 기관 `TSA_AUTHORITIES`) */
  tsaAuthorities?: readonly TsaAuthority[];
}

/** 서버의 공개 장부 파일을 처음부터 받아 검사한다 */
export async function checkServerLedger(
  options: CheckOptions = {},
): Promise<CheckResult> {
  const { ledger: _, ...result } = await checkPublicLedger({
    ...options,
    base: options.base ?? SERVER_API,
    anchorRepo:
      options.anchorRepo === undefined ? ANCHOR_REPO : options.anchorRepo,
  });
  return result;
}

/** 이 기기의 연습 장부를 검사한다(서버 주소가 없는 빌드) */
export async function checkPracticeLedger(ledger: {
  settle(): Promise<void>;
  verify(mine?: readonly Uint8Array[]): Promise<VerifyReport>;
  closed(): { record: RoundRecord; tickets: readonly Ticket[] }[];
}): Promise<CheckResult> {
  await ledger.settle();
  const report = await ledger.verify();
  const closed = ledger.closed();
  const qualification = qualificationSummary(report, closed.length);
  const items = withQualDetail(
    withPowDetail(
      checkItemsFrom(
        report.problems,
        [
          // 연습 장부는 drand가 가짜이고 앵커가 없어 있었을 결과·추첨 전 증거는 보지 않는다
          await voidRoundsItem(
            closed.map((c) => c.record),
            closed.map((c) => c.tickets),
            report.schedule,
          ),
          {
            id: "timestamp",
            label: TIMESTAMP_LABEL,
            status: "skip",
            detail: "연습 장부는 이 기기 안에서만 돕니다",
          },
        ],
        {
          drand:
            "연습 장부는 기기 안에서 만든 가짜 난수라 drand 서명이 없습니다",
          anchor: "연습 장부는 이 기기 안에서만 돌아 앵커를 남기지 않습니다",
        },
      ),
      report,
    ),
    qualification,
  );
  return {
    source: "practice",
    mode: "practice",
    rounds: closed.length,
    tickets: closed.reduce((n, c) => n + c.tickets.length, 0),
    registrations: report.keys.length,
    powChecked: report.powChecked,
    head: toHex(report.head),
    items,
    problems: report.problems,
    skipped: report.skipped,
    directors: directorHistory(report.operations),
    operations: operationsView(report.operations, closed.length, report.head),
    qualification,
  };
}
