/**
 * 별 따기 오류 → 우주국 창구 말 한 곳(2026-10-31 사용자: 모든 단계의 오류를 적절하게). 서버·패스키를 쓰는 모든 흐름
 * (등록 신청서, 신분증 제시, 응모, 당첨 확인 링크·요청·승인, 소속 받기, 내 응모 되찾기, 회차 방 말하기)이 이 함수로
 * 실패 문구를 만든다. 서버는 오류 종류 코드를 따로 주지 않아 HTTP 상태와 서버 문구로 구별한다(서버는 바꾸지 않는다).
 *
 * | 상황 | 구별 | 문구 |
 * |---|---|---|
 * | 패스키 취소·지원 안 함 | DOMException 이름 | passkeyFailText(그대로) |
 * | 서버 바쁨 | 503(응모·등록은 장부가 1·2·3·4초 뒤 네 번 다시 낸 뒤), 429 | 우주국이 너무 바빠 ○○하지 못했습니다. 잠시 뒤 다시 시도해 주세요. |
 * | 응모 마감 | 서버 문구 "마감됐어요(서버 시각 …)" | (응모는 반송 쪽지) 응모가 마감되어 ○○하지 못했습니다. |
 * | 이미 응모 | 409 + "이미 응모" | 이번 회차에는 이미 응모하셨습니다. |
 * | 회차가 바뀜 | 409 + "회차가 바뀌었습니다" | 회차가 바뀌어 ○○하지 못했습니다. 다시 시도해 주세요. |
 * | 서류 형식 | 400 | 서류가 올바르지 않아 ○○하지 못했습니다. |
 * | 서명 불일치 | 403 | 신분증 확인이 맞지 않아 ○○하지 못했습니다. |
 * | 없음 | 404 | 찾을 수 없어 ○○하지 못했습니다. |
 * | 서버 고장 | 500·502·504 | 우주국 창구에 문제가 생겨 ○○하지 못했습니다. 잠시 뒤 다시 시도해 주세요. |
 * | 연결 끊김 | fetch TypeError, 장부 연결 실패 | 우주국과 연락이 닿지 않습니다. 연결을 확인해 주세요. |
 * | 시간 초과 | AbortError·TimeoutError | 응답이 늦어 ○○하지 못했습니다. 다시 시도해 주세요. |
 * | 장부가 아직 없음 | "장부를 아직 받지 못했습니다" | 우주국 장부를 받는 중입니다. 잠시 뒤 다시 시도해 주세요. |
 * | 그 밖 | 장부·화면이 낸 한국어 문구 | 그 문구(마침표를 맞춘다), 없으면 ○○하지 못했습니다. 다시 시도해 주세요. |
 */
import { passkeyFailText, passkeyProblem } from "./passkey-env";

/** 서버가 거절한 요청(상태 코드를 함께 둔다) */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 응모 마감 거절이면 서버가 받은 시각("18:55:03"), 아니면 null. 연습 장부와 서버가 같은 문구를 쓴다(closedMessage) */
export function closedAt(err: unknown): string | null {
  const m =
    err instanceof Error
      ? /마감됐어요\(서버 시각 (\d{2}:\d{2}:\d{2})\)/.exec(err.message)
      : null;
  return m ? (m[1] as string) : null;
}

/** 오류 종류 */
export type ErrorKind =
  | "cancelled"
  | "unsupported"
  | "busy"
  | "closed"
  | "duplicate"
  | "round-changed"
  | "bad-form"
  | "bad-signature"
  | "not-found"
  | "server"
  | "offline"
  | "timeout"
  | "behind"
  | "other";

/** 상태 코드: HttpError·RelayError의 status, 없으면 문구 끝 "(503)" 같은 표시에서 */
const statusOf = (err: unknown): number | null => {
  if (err && typeof err === "object" && "status" in err)
    return Number((err as { status: unknown }).status) || null;
  const m = err instanceof Error ? /\((\d{3})\)/.exec(err.message) : null;
  return m ? Number(m[1]) : null;
};

/** 오류를 종류로 */
export function errorKind(err: unknown): ErrorKind {
  const pk = passkeyProblem(err);
  if (pk === "cancelled" || pk === "unsupported") return pk;
  if (closedAt(err)) return "closed";
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") return "timeout";
  if (err instanceof TypeError) return "offline";
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("장부를 아직 받지 못했습니다")) return "behind";
  const status = statusOf(err);
  if (status === 503 || status === 429) return "busy";
  if (status === 409) {
    if (msg.includes("이미 응모")) return "duplicate";
    if (msg.includes("회차가 바뀌었")) return "round-changed";
  }
  if (status === 400) return "bad-form";
  if (status === 403) return "bad-signature";
  if (status === 404) return "not-found";
  if (status !== null && status >= 500) return "server";
  if (msg.includes("이미 응모")) return "duplicate";
  return "other";
}

/** 문장 끝 마침표를 맞춘다 */
const sentence = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);

/**
 * 오류를 창구 말 한 문장(또는 두 문장)으로. `doing`은 "○○하지 못했습니다"의 ○○(예: "응모를 접수", "등록", "승인").
 * 패스키 취소는 `cancelWhat`(예: "응모되지 않았어요")로 기존 문구를 쓴다
 */
export function errorText(
  err: unknown,
  doing: string,
  cancelWhat = `${doing}하지 않았어요`,
): string {
  const failed = `${doing}하지 못했습니다`;
  switch (errorKind(err)) {
    case "cancelled":
    case "unsupported":
      return passkeyFailText(err, cancelWhat);
    case "busy":
      return `우주국이 너무 바빠 ${failed}. 잠시 뒤 다시 시도해 주세요.`;
    case "closed":
      return `응모가 마감되어 ${failed}.`;
    case "duplicate":
      return "이번 회차에는 이미 응모하셨습니다.";
    case "round-changed":
      return `회차가 바뀌어 ${failed}. 다시 시도해 주세요.`;
    case "bad-form":
      return `서류가 올바르지 않아 ${failed}.`;
    case "bad-signature":
      return `신분증 확인이 맞지 않아 ${failed}.`;
    case "not-found":
      return `찾을 수 없어 ${failed}.`;
    case "server":
      return `우주국 창구에 문제가 생겨 ${failed}. 잠시 뒤 다시 시도해 주세요.`;
    case "offline":
      return "우주국과 연락이 닿지 않습니다. 연결을 확인해 주세요.";
    case "timeout":
      return `응답이 늦어 ${failed}. 다시 시도해 주세요.`;
    case "behind":
      return "우주국 장부를 받는 중입니다. 잠시 뒤 다시 시도해 주세요.";
    case "other": {
      const msg = err instanceof Error ? err.message.trim() : "";
      return msg ? sentence(msg) : `${failed}. 다시 시도해 주세요.`;
    }
  }
}
