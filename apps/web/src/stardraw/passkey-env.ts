/**
 * 패스키를 쓸 수 있는 환경인지와, 기기에 맞는 말(docs/36 11-2 "패스키로만 응모").
 * 브라우저 응모는 패스키로만 한다. 쓸 수 없는 환경이면 응모 대신 무엇을 하면 되는지 알려 준다.
 */

/** 패스키가 막히는 앱 안 브라우저. 사용자 에이전트에 이 글자가 있으면 그 앱 이름 */
const IN_APP: [RegExp, string][] = [
  [/KAKAOTALK/i, "카카오톡"],
  [/NAVER\(inapp/i, "네이버 앱"],
  [/DaumApps/i, "다음 앱"],
  [/Instagram/i, "인스타그램"],
  [/FBAN|FBAV|FB_IAB/i, "페이스북"],
  [/\bLine\//i, "라인"],
  [/BAND\//i, "밴드"],
  [/everytimeApp/i, "에브리타임"],
];

export function inAppBrowser(ua: string): string | null {
  return IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
}

/** 이 브라우저에 WebAuthn이 있는지 */
export function passkeyApi(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** 이 기기 안에서 얼굴·지문·화면 잠금으로 패스키를 쓸 수 있는지(없어도 휴대폰 QR·보안 키로는 된다) */
export async function platformUnlock(): Promise<boolean> {
  try {
    return (
      passkeyApi() &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/**
 * 응모 단추에 넣을 잠금 이름(조사까지). 이 기기 잠금을 못 쓰면 "패스키로"(휴대폰 QR·보안 키 창이 뜬다)
 */
export function unlockWith(ua: string, platform: boolean): string {
  if (!platform) return "패스키로";
  if (/iPhone/i.test(ua)) return "Face ID로";
  if (/iPad/i.test(ua)) return "Face ID·Touch ID로";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Touch ID로";
  if (/Android/i.test(ua)) return "지문·화면 잠금으로";
  if (/Windows/i.test(ua)) return "Windows Hello로";
  return "패스키로";
}

export type PasskeyProblem =
  /** 사용자가 창을 닫았거나 시간이 지났다 */
  | "cancelled"
  /** 이 인증기가 ES256(P-256) 패스키를 만들지 못하거나(일부 오래된 Windows Hello) 본인 확인(UV)을 못 한다 */
  | "unsupported"
  /** 그 밖의 오류 */
  | "other";

export function passkeyProblem(err: unknown): PasskeyProblem {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "AbortError")
      return "cancelled";
    if (err.name === "NotSupportedError" || err.name === "ConstraintError")
      return "unsupported";
  }
  return "other";
}

/**
 * 패스키 확인이 끝나지 않았을 때 앞 문장(`what`, 예: "응모되지 않았어요") 뒤에 붙일 까닭.
 * 브라우저는 "창을 닫음"과 "이 기기에 맞는 패스키가 없음(지운 패스키, 다른 기기에만 있는 패스키)"을 일부러 같은
 * 오류(NotAllowedError)로 돌려준다(어떤 패스키가 있는지 사이트가 알아내지 못하게). 그래서 둘을 함께 말하고,
 * 가를 수 있는 시간 초과(AbortError)·우리가 만든 취소(흉내 창)는 따로 말한다
 */
export function passkeyFailText(err: unknown, what: string): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return `${what}. 확인 시간이 지났어요.`;
  if (err instanceof DOMException && err.message === DEMO_CANCEL)
    return `${what}. 확인을 취소했어요.`;
  return `${what}. 확인을 취소했거나, 이 기기에서 등록증의 패스키를 찾지 못했어요.`;
}

/** 흉내 창(데모)을 닫았을 때의 오류 문구(passkeyFailText가 취소로 읽는다) */
export const DEMO_CANCEL = "확인을 취소했습니다";
