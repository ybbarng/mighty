import { describe, expect, it } from "vitest";
import {
  ByteReader,
  ByteWriter,
  compareBytes,
  fromBase64Url,
  fromHex,
  sha256,
  taggedHash,
  toBase64Url,
  toHex,
  utf8,
} from "./bytes";

describe("고정 바이너리 형식", () => {
  it("정수는 빅엔디언, 가변 길이는 u16 길이를 앞에 붙인다", () => {
    const bytes = new ByteWriter()
      .u8(1)
      .u16(0x0203)
      .u32(0x04050607)
      .u64(0x08090a0b0c)
      .text("가")
      .done();
    expect(toHex(bytes)).toBe(
      "01" + "0203" + "04050607" + "00000008090a0b0c" + "0003eab080",
    );
    const r = new ByteReader(bytes);
    expect([r.u8(), r.u16(), r.u32(), r.u64(), r.text()]).toEqual([
      1,
      0x0203,
      0x04050607,
      0x08090a0b0c,
      "가",
    ]);
    r.end();
  });

  it("범위 밖 정수, 길이가 다른 고정 바이트, 남거나 모자란 바이트는 오류다", () => {
    expect(() => new ByteWriter().u8(256)).toThrow();
    expect(() => new ByteWriter().u32(-1)).toThrow();
    expect(() => new ByteWriter().u32(1.5)).toThrow();
    expect(() => new ByteWriter().fixed(new Uint8Array(3), 4)).toThrow();
    expect(() => new ByteReader(new Uint8Array(3)).u32()).toThrow("모자란다");
    const r = new ByteReader(new Uint8Array(2));
    r.u8();
    expect(() => r.end()).toThrow("남는다");
  });
});

describe("해시", () => {
  it("SHA-256 시험 값(FIPS 180-2 'abc')", () => {
    expect(toHex(sha256(utf8("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("용도 이름이 다르면 같은 바이트라도 해시가 다르다", () => {
    const data = utf8("같은 내용");
    expect(toHex(taggedHash("stardraw/a", data))).not.toBe(
      toHex(taggedHash("stardraw/b", data)),
    );
    // 용도 이름과 내용 사이 0 바이트로 경계가 섞이지 않는다
    expect(toHex(taggedHash("ab", utf8("c")))).not.toBe(
      toHex(taggedHash("a", utf8("bc"))),
    );
  });
});

describe("문자열 표현", () => {
  it("16진수", () => {
    expect(toHex(fromHex("00ff10"))).toBe("00ff10");
    expect(() => fromHex("0g")).toThrow();
    expect(() => fromHex("abc")).toThrow();
  });

  it("base64url(RFC 4648 시험 값, 덧붙임 없음)", () => {
    const cases: [string, string][] = [
      ["", ""],
      ["f", "Zg"],
      ["fo", "Zm8"],
      ["foo", "Zm9v"],
      ["foob", "Zm9vYg"],
      ["fooba", "Zm9vYmE"],
      ["foobar", "Zm9vYmFy"],
    ];
    for (const [plain, encoded] of cases) {
      expect(toBase64Url(utf8(plain))).toBe(encoded);
      expect(toHex(fromBase64Url(encoded))).toBe(toHex(utf8(plain)));
    }
    expect(toBase64Url(fromHex("fbff"))).toBe("-_8");
    expect(() => fromBase64Url("a+b")).toThrow();
  });

  it("사전 순 비교", () => {
    expect(compareBytes(fromHex("01"), fromHex("02"))).toBeLessThan(0);
    expect(compareBytes(fromHex("0102"), fromHex("01"))).toBeGreaterThan(0);
    expect(compareBytes(fromHex("ab"), fromHex("ab"))).toBe(0);
  });
});
