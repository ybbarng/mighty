import { argon2id } from "@noble/hashes/argon2.js";
import { describe, expect, it } from "vitest";
import { ByteWriter, fromHex, toHex } from "./bytes";
import {
  entrantId,
  generateSigner,
  signerFromKeyPair,
  verifySignature,
} from "./keys";
import {
  checkPow,
  POW_PARAMS,
  powHash,
  powTargetForTries,
  solvePow,
} from "./pow";
import { EASY_TARGET, TEST_POW, ticketFor } from "./testing";
import {
  checkNumbers,
  decodeTicket,
  encodeTicket,
  TICKET_LENGTH,
  type Ticket,
  ticketBody,
  ticketContent,
  ticketId,
  verifyTicketSignature,
} from "./ticket";

// 고정 값 응모권: 공개 열쇠 자리에 04 ‖ 01×64, 서명 자리에 0×64
const FIXED: Ticket = {
  v: 1,
  round: 7,
  numbers: [3, 11, 19, 27, 38, 44],
  pub: Uint8Array.from([4, ...new Array<number>(64).fill(1)]),
  nonce: 258,
  sig: new Uint8Array(64),
};

describe("열쇠와 서명(WebCrypto P-256)", () => {
  it("공개 열쇠 65바이트, 응모자 id 16바이트, 서명 64바이트", async () => {
    const signer = await generateSigner();
    expect(signer.publicKey.length).toBe(65);
    expect(entrantId(signer.publicKey).length).toBe(16);
    const message = new TextEncoder().encode("빕또");
    const sig = await signer.sign(message);
    expect(sig.length).toBe(64);
    expect(await verifySignature(signer.publicKey, message, sig)).toBe(true);
    expect(
      await verifySignature(
        signer.publicKey,
        new TextEncoder().encode("빕또!"),
        sig,
      ),
    ).toBe(false);
    expect(
      await verifySignature(signer.publicKey, message, sig.slice(0, 63)),
    ).toBe(false);
  });

  it("내보낼 수 없는 열쇠도 다시 열어 같은 공개 열쇠로 서명한다(IndexedDB에 둔 열쇠 쌍)", async () => {
    const { keyPair, publicKey } = await generateSigner(false);
    const again = await signerFromKeyPair(keyPair);
    expect(toHex(again.publicKey)).toBe(toHex(publicKey));
  });
});

describe("응모권 형식", () => {
  it("번호는 1~45에서 서로 다른 6개, 오름차순", () => {
    expect(checkNumbers([1, 2, 3, 4, 5, 45])).toBeNull();
    expect(checkNumbers([1, 2, 3, 4, 5])).not.toBeNull();
    expect(checkNumbers([0, 2, 3, 4, 5, 6])).not.toBeNull();
    expect(checkNumbers([1, 2, 3, 4, 5, 46])).not.toBeNull();
    expect(checkNumbers([1, 2, 3, 4, 6, 5])).not.toBeNull();
    expect(checkNumbers([1, 2, 3, 4, 5, 5])).not.toBeNull();
  });

  // id는 파이썬 hashlib으로 따로 계산해 맞춰 봤다
  it("시험 값: 고정 응모권 → 바이트 → id", () => {
    // v 01 ‖ round 00000007 ‖ 번호 03 0b 13 1b 26 2c ‖ 공개 열쇠 04 01…01
    expect(toHex(ticketContent(FIXED))).toBe(
      `0100000007030b131b262c04${"01".repeat(64)}`,
    );
    // ‖ nonce 00000102
    expect(toHex(ticketBody(FIXED))).toBe(
      `${toHex(ticketContent(FIXED))}00000102`,
    );
    expect(toHex(ticketId(FIXED))).toBe(
      "8363a6147d4d97c4fe3da0483d3f8c502d81b326c6cb1c4341914c5e2893363d",
    );
    expect(encodeTicket(FIXED).length).toBe(TICKET_LENGTH);
  });

  it("바이트로 바꿨다 되돌리면 같은 응모권이다", () => {
    expect(decodeTicket(encodeTicket(FIXED))).toEqual(FIXED);
    expect(() =>
      decodeTicket(encodeTicket(FIXED).slice(0, TICKET_LENGTH - 1)),
    ).toThrow();
  });

  it("서명이 달라도 id는 같다(서명 모양 복제를 같은 응모권으로 거른다)", () => {
    const resigned: Ticket = { ...FIXED, sig: new Uint8Array(64).fill(9) };
    expect(toHex(ticketId(resigned))).toBe(toHex(ticketId(FIXED)));
  });
});

describe("작업 증명(Argon2id)", () => {
  const challenge = fromHex("11".repeat(32));

  it("시험 값: 규칙의 값(16MB, 반복 1)으로 고정 입력 → 해시, 다른 구현(noble)과 같다", async () => {
    const hash = await powHash(challenge, ticketContent(FIXED), 0, POW_PARAMS);
    expect(toHex(hash)).toBe(
      "4637c23e36292d161bb06239109a4f625297ddd5dc7366c1bd5e1ad55de9e8ec",
    );
    // password = 응모권 내용(u16 길이 + 바이트) ‖ n(u32), salt = 문제 값
    const password = new ByteWriter().bytes(ticketContent(FIXED)).u32(0).done();
    const other = argon2id(password, challenge, {
      t: 1,
      m: 16 * 1024,
      p: 1,
      dkLen: 32,
    });
    expect(toHex(other)).toBe(toHex(hash));
  });

  it("평균 시도 수 → 목표값", () => {
    expect(powTargetForTries(1)).toBe(0xffffffff);
    expect(powTargetForTries(64)).toBe(2 ** 26);
  });

  it("푼 n은 확인을 통과하고, 문제 값이 다르면 통과하지 못한다", async () => {
    const content = ticketContent(FIXED);
    const nonce = await solvePow(challenge, content, EASY_TARGET, {
      params: TEST_POW,
    });
    expect(nonce).not.toBeNull();
    expect(
      await checkPow(
        challenge,
        content,
        nonce as number,
        EASY_TARGET,
        TEST_POW,
      ),
    ).toBe(true);
    // 목표값 1은 앞 4바이트가 0이어야 해서 이 n으로는 통과할 수 없다
    expect(
      await checkPow(challenge, content, nonce as number, 1, TEST_POW),
    ).toBe(false);
  });

  it("취소하면 null", async () => {
    const nonce = await solvePow(challenge, ticketContent(FIXED), 1, {
      params: TEST_POW,
      onTry: (n) => n < 3,
    });
    expect(nonce).toBeNull();
  });
});

describe("응모권 만들기", () => {
  it("작업 증명을 풀고 서명한다. 내용을 바꾸면 서명이 맞지 않는다", async () => {
    const signer = await generateSigner();
    const challenge = fromHex("22".repeat(32));
    const t = await ticketFor(signer, 3, [44, 3, 19, 11, 27, 38], challenge);
    expect(t.numbers).toEqual([3, 11, 19, 27, 38, 44]);
    expect(await verifyTicketSignature(t)).toBe(true);
    expect(
      await checkPow(
        challenge,
        ticketContent(t),
        t.nonce,
        EASY_TARGET,
        TEST_POW,
      ),
    ).toBe(true);
    expect(await verifyTicketSignature({ ...t, round: 4 })).toBe(false);
    expect(
      await verifyTicketSignature({ ...t, numbers: [3, 11, 19, 27, 38, 45] }),
    ).toBe(false);
  });
});
