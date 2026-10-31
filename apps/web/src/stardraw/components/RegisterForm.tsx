"use client";

import { cn } from "@/lib/cn";
import { FX } from "../fx-timing";
import { Sheet } from "./EnterSubmit";
import { KeyIcon } from "./PasskeyHelp";
import { StageOverlay } from "./StageOverlay";

/** 신청서 단계: 문구만 / 아래에서 올라옴(내기를 기다림) / 패스키 중 / 서명이 찍힘 / 위로 제출 */
export type ApplyStage = "text" | "waiting" | "signing" | "signed" | "away";

/** 오늘 날짜 "2026. 10. 31." */
function today(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
}

/**
 * 우주인 등록 신청서(관공서 서식, 2026-10-31 사용자). 오버레이 위쪽에 우주국 말, 아래에서 신청서가 올라와 내 앞에 놓인다.
 * 응모 용지처럼 밀어 올리거나 누르면(내기) 그 누름에 바로 패스키 만들기(`onSubmit`), 성공하면 서명란에 패스키 서명이
 * 찍히고 신청서가 위(우주국)로 올라가 사라진다. 취소하면 신청서가 그 자리에서 다시 기다린다. 작은 「취소」로 닫는다
 */
export function RegisterForm({
  stage,
  now,
  onSubmit,
  onCancel,
}: {
  stage: ApplyStage;
  now: number;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const signed = stage === "signed" || stage === "away";
  return (
    <StageOverlay label="우주인 등록 신청">
      <section
        className="flex min-h-full flex-1 flex-col gap-4"
        aria-label="우주인 등록 신청서"
      >
        <p
          role="status"
          className="sd-text-in sd-submit-status min-h-8 text-center font-bold text-amber-100 text-lg"
        >
          우주인 등록 신청서를 제출해 주세요.
        </p>
        <div className="flex-1" />
        <Sheet
          sheet={stage === "text" ? "below" : stage === "away" ? "away" : "in"}
          awaiting={stage === "waiting"}
          onSwiped={onSubmit}
          label="신청서 제출"
        >
          <article
            data-register-form
            className="mx-auto w-full max-w-md rounded-sm bg-[#f3eedf] px-5 pt-3 pb-5 text-slate-800 shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
          >
            <p className="text-[10px] text-slate-500">별지 제1호 서식</p>
            <h2 className="mt-1 text-center font-black text-lg tracking-[0.2em]">
              우주인 등록 신청서
            </h2>
            <table className="mt-3 w-full border-collapse text-[13px]">
              <tbody>
                <Row head="신청 구분">신규 등록</Row>
                <Row head="신청일">{today(now)}</Row>
                <Row head="성명" muted>
                  등록 후 우주국이 부여합니다.
                </Row>
                <Row head="등록번호" muted>
                  등록 후 우주국이 부여합니다.
                </Row>
                <Row head="주소" muted>
                  등록 후 우주국이 부여합니다.
                </Row>
                <Row head="신분 확인">패스키</Row>
                <tr>
                  <th className="w-24 border border-slate-400/70 bg-slate-800/5 px-2 py-2 text-left font-semibold">
                    서명
                  </th>
                  <td className="relative h-12 border border-slate-400/70 px-2">
                    {signed && (
                      <span
                        data-register-signed
                        className="sd-pop absolute inset-y-1 right-2 flex items-center gap-1.5 rounded-md border-2 border-rose-700/80 px-2 font-bold text-rose-700/90 text-xs"
                        style={{ animationDuration: `${FX.idCheck}ms` }}
                      >
                        <KeyIcon className="size-4" />
                        패스키 서명
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-4 text-center text-[13px]">
              위와 같이 우주인 등록을 신청합니다.
            </p>
            <p className="mt-2 text-right font-semibold text-[13px]">
              카노푸스 우주국장 귀하
            </p>
          </article>
        </Sheet>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "self-center rounded-xl px-4 py-2 text-sm text-white/60 transition-opacity hover:text-white",
            stage === "waiting"
              ? "opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          취소
        </button>
      </section>
    </StageOverlay>
  );
}

function Row({
  head,
  muted = false,
  children,
}: {
  head: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <th className="w-24 border border-slate-400/70 bg-slate-800/5 px-2 py-1.5 text-left font-semibold">
        {head}
      </th>
      <td
        className={cn(
          "border border-slate-400/70 px-2 py-1.5",
          muted && "text-slate-400",
        )}
      >
        {children}
      </td>
    </tr>
  );
}
