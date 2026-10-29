// @vitest-environment node
import { describe, expect, it } from "vitest";

import { inAppBrowser, passkeyProblem, unlockWith } from "./passkey-env";

const IPHONE_KAKAO =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("패스키 환경", () => {
  it("앱 안 브라우저를 알아본다", () => {
    expect(inAppBrowser(IPHONE_KAKAO)).toBe("카카오톡");
    expect(
      inAppBrowser(`${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.10.3)`),
    ).toBe("네이버 앱");
    expect(inAppBrowser(`${ANDROID_CHROME} Instagram 360.0.0`)).toBe(
      "인스타그램",
    );
    expect(inAppBrowser(ANDROID_CHROME)).toBeNull();
    expect(inAppBrowser(MAC_SAFARI)).toBeNull();
  });

  it("기기에 맞는 잠금 이름을 붙이고, 이 기기 잠금을 못 쓰면 패스키로 한다", () => {
    expect(unlockWith(IPHONE_KAKAO, true)).toBe("Face ID로");
    expect(unlockWith(MAC_SAFARI, true)).toBe("Touch ID로");
    expect(unlockWith(ANDROID_CHROME, true)).toBe("지문·화면 잠금으로");
    expect(unlockWith(WINDOWS_EDGE, true)).toBe("Windows Hello로");
    expect(unlockWith(WINDOWS_EDGE, false)).toBe("패스키로");
  });

  it("실패를 취소·만들 수 없음·그 밖으로 나눈다", () => {
    expect(passkeyProblem(new DOMException("x", "NotAllowedError"))).toBe(
      "cancelled",
    );
    expect(passkeyProblem(new DOMException("x", "NotSupportedError"))).toBe(
      "unsupported",
    );
    expect(passkeyProblem(new Error("x"))).toBe("other");
  });
});
