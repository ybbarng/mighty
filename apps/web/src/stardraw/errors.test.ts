import { closedMessage } from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";
import { closedAt, errorKind, errorText, HttpError } from "./errors";
import { DEMO_CANCEL } from "./passkey-env";

const http = (status: number, msg = `실패(${status})`) =>
  new HttpError(msg, status);

describe("오류 종류(상태 코드·서버 문구)", () => {
  it("서버 상태 코드로 가른다", () => {
    expect(errorKind(http(503))).toBe("busy");
    expect(errorKind(http(429))).toBe("busy");
    expect(errorKind(http(400))).toBe("bad-form");
    expect(errorKind(http(403))).toBe("bad-signature");
    expect(errorKind(http(404))).toBe("not-found");
    expect(errorKind(http(500))).toBe("server");
    expect(errorKind(http(502))).toBe("server");
    expect(errorKind(http(409, "이번 회차에는 이미 응모했습니다"))).toBe(
      "duplicate",
    );
    expect(
      errorKind(http(409, "회차가 바뀌었습니다. 다시 계산해 주세요")),
    ).toBe("round-changed");
    // 상태 코드가 없는 오류는 문구 끝 "(503)"에서
    expect(errorKind(new Error("장부를 받지 못했습니다(503)"))).toBe("busy");
  });

  it("마감 거절은 서버가 받은 시각을 꺼낸다(연습 장부와 서버가 같은 문구)", () => {
    const t = Date.UTC(2026, 10, 2, 9, 55, 3) / 1000;
    const err = http(409, closedMessage(t));
    expect(errorKind(err)).toBe("closed");
    expect(closedAt(err)).toBe("18:55:03");
    expect(closedAt(new Error("다른 오류"))).toBeNull();
  });

  it("패스키·연결·시간 초과·장부 없음", () => {
    expect(errorKind(new DOMException("x", "NotAllowedError"))).toBe(
      "cancelled",
    );
    expect(errorKind(new DOMException("x", "NotSupportedError"))).toBe(
      "unsupported",
    );
    expect(errorKind(new TypeError("Failed to fetch"))).toBe("offline");
    const timeout = new Error("늦음");
    timeout.name = "TimeoutError";
    expect(errorKind(timeout)).toBe("timeout");
    expect(errorKind(new Error("장부를 아직 받지 못했습니다"))).toBe("behind");
    expect(
      errorKind(new Error("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다")),
    ).toBe("other");
  });
});

describe("창구 말 문구", () => {
  it("종류마다 ○○ 자리를 채운 한 문장(마침표)", () => {
    expect(errorText(http(503), "등록")).toBe(
      "우주국이 너무 바빠 등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
    expect(errorText(http(400), "응모를 접수")).toBe(
      "서류가 올바르지 않아 응모를 접수하지 못했습니다.",
    );
    expect(errorText(http(403), "승인")).toBe(
      "신분증 확인이 맞지 않아 승인하지 못했습니다.",
    );
    expect(errorText(new TypeError("x"), "응모를 접수")).toBe(
      "우주국과 연락이 닿지 않습니다. 연결을 확인해 주세요.",
    );
    expect(errorText(http(409, "이미 응모했습니다"), "응모를 접수")).toBe(
      "이번 회차에는 이미 응모하셨습니다.",
    );
    // 장부·화면이 낸 한국어 문구는 그대로(마침표를 맞춘다)
    expect(
      errorText(
        new Error("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다"),
        "응모를 접수",
      ),
    ).toBe("앞 회차 추첨이 끝난 뒤에 응모할 수 있습니다.");
    expect(errorText(null, "등록")).toBe(
      "등록하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("패스키 취소는 기존 문구를 쓴다", () => {
    expect(
      errorText(
        new DOMException(DEMO_CANCEL, "NotAllowedError"),
        "응모를 접수",
        "응모되지 않았어요",
      ),
    ).toBe("응모되지 않았어요. 확인을 취소했어요.");
  });

  it("모든 종류의 문구가 문장 끝 부호로 끝난다", () => {
    const errs: unknown[] = [
      http(503),
      http(429),
      http(400),
      http(403),
      http(404),
      http(500),
      http(409, closedMessage(0)),
      http(409, "이미 응모"),
      http(409, "회차가 바뀌었습니다"),
      new TypeError("x"),
      Object.assign(new Error("늦음"), { name: "TimeoutError" }),
      new Error("장부를 아직 받지 못했습니다"),
      new Error("모르는 오류"),
      null,
    ];
    for (const e of errs) expect(errorText(e, "응모를 접수")).toMatch(/[.?!]$/);
  });
});
