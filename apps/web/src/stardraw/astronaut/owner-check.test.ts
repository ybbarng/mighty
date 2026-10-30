// @vitest-environment node
import {
  DEFAULT_WEBAUTHN_POLICY,
  type EntrantSigner,
  generateSigner,
  toHex,
} from "@mighty/stardraw-core";
import { describe, expect, it } from "vitest";

import { checkOwner, ownerMessage } from "./owner-check";

const AT = 1793324413;

describe("주인 확인 문제 값", () => {
  it("공개 열쇠·무작위 값·시각이 하나라도 다르면 다른 내용", async () => {
    const { publicKey } = await generateSigner();
    const nonce = new Uint8Array(32).fill(7);
    const base = toHex(ownerMessage(publicKey, nonce, AT));
    expect(toHex(ownerMessage(publicKey, nonce, AT))).toBe(base);
    expect(toHex(ownerMessage(publicKey, nonce, AT + 1))).not.toBe(base);
    expect(
      toHex(ownerMessage(publicKey, new Uint8Array(32).fill(8), AT)),
    ).not.toBe(base);
    const other = await generateSigner();
    expect(toHex(ownerMessage(other.publicKey, nonce, AT))).not.toBe(base);
    expect(() => ownerMessage(publicKey, new Uint8Array(16), AT)).toThrow();
  });
});

describe("주인 확인", () => {
  it("그 등록증의 열쇠로 서명하면 통과", async () => {
    const me = await generateSigner();
    expect(
      await checkOwner(me.publicKey, me, DEFAULT_WEBAUTHN_POLICY, AT),
    ).toBe(true);
  });

  it("다른 사람의 등록증(이 기기에 그 열쇠가 없다)은 내 열쇠로 서명해도 실패", async () => {
    const me = await generateSigner();
    const other = await generateSigner();
    expect(
      await checkOwner(other.publicKey, me, DEFAULT_WEBAUTHN_POLICY, AT),
    ).toBe(false);
  });

  it("지난 서명을 다시 내밀어도 새 문제 값이라 실패", async () => {
    const me = await generateSigner();
    let saved: Uint8Array | null = null;
    const replay: EntrantSigner = {
      publicKey: me.publicKey,
      sign: async (message) => {
        saved ??= await me.sign(message);
        return saved;
      },
    };
    let n = 0;
    const random = (len: number) => new Uint8Array(len).fill(++n);
    const policy = DEFAULT_WEBAUTHN_POLICY;
    expect(await checkOwner(me.publicKey, replay, policy, AT, random)).toBe(
      true,
    );
    expect(await checkOwner(me.publicKey, replay, policy, AT, random)).toBe(
      false,
    );
  });

  it("서명을 취소하면 조용히 실패(오류를 던지지 않는다)", async () => {
    const me = await generateSigner();
    const cancel: EntrantSigner = {
      publicKey: me.publicKey,
      sign: async () => {
        throw new DOMException("취소", "NotAllowedError");
      },
    };
    expect(
      await checkOwner(me.publicKey, cancel, DEFAULT_WEBAUTHN_POLICY, AT),
    ).toBe(false);
  });
});
