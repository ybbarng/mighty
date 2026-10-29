/**
 * 사이트 통계(umami, docs/33). star.byb.kr과 같은 stats.byb.kr에 붙인다.
 * 쿠키를 쓰지 않고 페이지 주소와 정해 둔 게임 이벤트(`track.ts`)만 센다.
 *
 * 비밀이 새지 않게 네 겹으로 막는다(docs/33 3절):
 * ① 스크립트가 주소의 쿼리·`#`을 지운다(`data-exclude-search`·`data-exclude-hash`)
 * ② 보내기 직전 이 파일의 `beforeSend`가 다시 본다: 쿼리·`#`·`room=`이 남았으면 보내지 않는다
 * ③ 이벤트 값은 `track.ts`의 타입으로 정해 둔 것만
 * ④ 시험(`analytics.test.ts`)
 */

/** 빌드 때 넣는 사이트 ID. 개발·시험 빌드에는 없어 스크립트를 싣지 않는다 */
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "";

/** 통계를 끈 기기. 설정 저장소는 첫 그리기 뒤에 읽어서, 첫 페이지 보기 전에 읽을 수 있게 따로 둔다 */
export const ANALYTICS_OFF_KEY = "game-analytics-off";

export function analyticsOff(): boolean {
  try {
    return localStorage.getItem(ANALYTICS_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(ANALYTICS_OFF_KEY, "1");
    else localStorage.removeItem(ANALYTICS_OFF_KEY);
  } catch {
    // 저장이 안 되는 창(사생활 보호 등)에서는 이번 방문 동안만 화면 값이 바뀐다
  }
}

/** 주소에 비밀이 남을 수 있는 흔적: 쿼리(`?room=`·`?seed=`), `#`, 방 코드 이름 */
function leaks(text: string | undefined): boolean {
  if (!text) return false;
  return text.includes("?") || text.includes("#") || text.includes("room=");
}

export interface SendContext {
  /** 이 기기에서 통계를 껐다 */
  off: boolean;
  /** 브라우저의 "추적하지 말라"(GPC) */
  gpc: boolean;
  /** 지금 주소의 쿼리(같은 탭 시험 `?net=local`은 보내지 않는다) */
  search: string;
}

/** 이 요청을 보내도 되나. 순수 함수라 시험한다 */
export function shouldSend(
  payload: { url?: string; referrer?: string } | null | undefined,
  context: SendContext,
): boolean {
  if (context.off || context.gpc) return false;
  if (context.search.includes("net=local")) return false;
  if (!payload) return false;
  return !leaks(payload.url) && !leaks(payload.referrer);
}

/** umami 스크립트가 보내기 직전 부른다(`data-before-send`). 거짓을 돌려주면 보내지 않는다 */
export function beforeSend<P extends { url?: string; referrer?: string }>(
  _type: string,
  payload: P,
): P | false {
  const nav = globalThis.navigator as
    | (Navigator & { globalPrivacyControl?: boolean })
    | undefined;
  return shouldSend(payload, {
    off: analyticsOff(),
    gpc: nav?.globalPrivacyControl === true,
    search: globalThis.location?.search ?? "",
  })
    ? payload
    : false;
}

/** 스크립트가 이름으로 찾는다. 이 파일을 불러올 때(첫 그리기 전) 걸어 둔다 */
export const BEFORE_SEND_NAME = "umamiBeforeSend";
if (typeof window !== "undefined")
  (window as unknown as Record<string, unknown>)[BEFORE_SEND_NAME] = beforeSend;
