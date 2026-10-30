import { describe, expect, it } from "vitest";
import { ByteReader, ByteWriter, concat, toHex, utf8 } from "./bytes";
import { generateSigner } from "./keys";
import {
  DEFAULT_WEBAUTHN_POLICY,
  derToP1363,
  p1363ToDer,
  RawKeyRejected,
  readSignature,
  type SignatureData,
  signAsEntrant,
  softCredentialId,
  softPasskeySigner,
  verifyEntrantSignature,
  writeSignature,
} from "./signature";
import { fakePasskey } from "./testing";

const MESSAGE = utf8("stardraw/test\u0000하늘의 별 따기 12회 응모권");

describe("원시 P-256 서명은 받지 않는다(docs/36 11-11)", () => {
  it("서명 종류 01(r‖s 64바이트)은 읽는 단계에서 거절한다", () => {
    const bytes = new ByteWriter().u8(1).fixed(new Uint8Array(64), 64).done();
    expect(() => readSignature(new ByteReader(bytes))).toThrow(RawKeyRejected);
  });
});

describe("흉내 패스키(softPasskeySigner)", () => {
  it("기기 안 열쇠로 패스키 모양 서명을 만들고, UP·UV가 켜져 확인을 통과한다", async () => {
    const signer = softPasskeySigner(await generateSigner());
    const sig = await signAsEntrant(signer, MESSAGE);
    expect(sig.kind).toBe("webauthn");
    expect(sig.authenticatorData[32]).toBe(0x05);
    expect(await verifyEntrantSignature(signer.publicKey, MESSAGE, sig)).toBe(
      true,
    );
  });

  it("패스키 번호는 공개 열쇠에서 정해진다(열쇠 쌍만 저장해도 같다)", async () => {
    const key = await generateSigner();
    const a = softPasskeySigner(key);
    const b = softPasskeySigner(key);
    expect(a.credentialId).toHaveLength(16);
    expect(toHex(a.credentialId)).toBe(toHex(b.credentialId));
    expect(toHex(a.credentialId)).toBe(toHex(softCredentialId(key.publicKey)));
    expect(toHex(a.credentialId)).not.toBe(
      toHex(softCredentialId((await generateSigner()).publicKey)),
    );
  });
});

describe("패스키(WebAuthn ES256) 서명", () => {
  it("브라우저 모양의 단언을 확인하고, 내용이 다르면 거절한다", async () => {
    const { signer } = await fakePasskey();
    const sig = await signAsEntrant(signer, MESSAGE);
    expect(sig.kind).toBe("webauthn");
    expect(await verifyEntrantSignature(signer.publicKey, MESSAGE, sig)).toBe(
      true,
    );
    expect(
      await verifyEntrantSignature(signer.publicKey, utf8("다른 내용"), sig),
    ).toBe(false);
  });

  it("다른 사이트(rpId)에서 만든 서명은 거절한다", async () => {
    const { signer } = await fakePasskey({ rpId: "evil.example" });
    const sig = await signAsEntrant(signer, MESSAGE);
    expect(await verifyEntrantSignature(signer.publicKey, MESSAGE, sig)).toBe(
      false,
    );
  });

  it("허용하지 않은 주소(origin)는 거절하고, 정책에 넣으면(개발용 localhost) 받는다", async () => {
    const { signer } = await fakePasskey({
      rpId: "localhost",
      origin: "http://localhost:3456",
    });
    const sig = await signAsEntrant(signer, MESSAGE);
    expect(await verifyEntrantSignature(signer.publicKey, MESSAGE, sig)).toBe(
      false,
    );
    expect(
      await verifyEntrantSignature(signer.publicKey, MESSAGE, sig, {
        rpId: "localhost",
        origins: [...DEFAULT_WEBAUTHN_POLICY.origins, "http://localhost:3456"],
      }),
    ).toBe(true);
  });

  it("UP(0x01)·UV(0x04) 가운데 하나라도 빠진 서명, 등록용(webauthn.create) 서명은 거절한다", async () => {
    for (const flags of [0x04, 0x01, 0x00, 0x41]) {
      const s = (await fakePasskey({ flags })).signer;
      expect(
        await verifyEntrantSignature(
          s.publicKey,
          MESSAGE,
          await signAsEntrant(s, MESSAGE),
        ),
      ).toBe(false);
    }
    // 다른 비트(BE·BS 등)가 함께 켜져 있어도 UP·UV만 있으면 받는다(동기화 패스키는 0x1d)
    const synced = (await fakePasskey({ flags: 0x1d })).signer;
    expect(
      await verifyEntrantSignature(
        synced.publicKey,
        MESSAGE,
        await signAsEntrant(synced, MESSAGE),
      ),
    ).toBe(true);
    const create = (await fakePasskey({ type: "webauthn.create" })).signer;
    expect(
      await verifyEntrantSignature(
        create.publicKey,
        MESSAGE,
        await signAsEntrant(create, MESSAGE),
      ),
    ).toBe(false);
  });

  it("바이너리로 바꿨다 되돌려도 같고, 확인을 통과한다", async () => {
    const { signer } = await fakePasskey();
    const sig = await signAsEntrant(signer, MESSAGE);
    const back = readSignature(
      new ByteReader(writeSignature(new ByteWriter(), sig).done()),
    );
    expect(back).toEqual(sig);
    expect(await verifyEntrantSignature(signer.publicKey, MESSAGE, back)).toBe(
      true,
    );
  });

  it("다른 열쇠의 패스키 서명은 거절한다", async () => {
    const a = (await fakePasskey()).signer;
    const b = (await fakePasskey()).signer;
    const sig = await signAsEntrant(a, MESSAGE);
    expect(await verifyEntrantSignature(b.publicKey, MESSAGE, sig)).toBe(false);
  });

  it("clientDataJSON이 JSON이 아니면 거절한다", async () => {
    const { signer } = await fakePasskey();
    const sig = (await signAsEntrant(signer, MESSAGE)) as Extract<
      SignatureData,
      { kind: "webauthn" }
    >;
    expect(
      await verifyEntrantSignature(signer.publicKey, MESSAGE, {
        ...sig,
        clientDataJSON: concat(utf8("{"), sig.clientDataJSON),
      }),
    ).toBe(false);
  });
});

describe("DER ↔ r‖s", () => {
  it("앞 비트가 1인 정수는 0을 붙이고, 앞 0은 떼어 낸다. 되돌리면 같다", () => {
    const raw = new Uint8Array(64);
    raw[0] = 0x80; // r: 앞 비트 1 → 0x00을 붙여 33바이트
    raw[31] = 1;
    raw[63] = 0x7f; // s: 앞이 모두 0 → 1바이트
    const der = p1363ToDer(raw);
    expect(toHex(der)).toBe(`3026022100${toHex(raw.slice(0, 32))}02017f`);
    expect(toHex(derToP1363(der) as Uint8Array)).toBe(toHex(raw));
  });

  it("모양이 틀린 DER은 null", () => {
    expect(derToP1363(new Uint8Array([0x30, 0x02, 0x02, 0x00]))).toBeNull();
    const der = p1363ToDer(new Uint8Array(64).fill(1));
    expect(derToP1363(der.slice(0, der.length - 1))).toBeNull();
  });
});
