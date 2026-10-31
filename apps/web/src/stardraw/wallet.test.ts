import {
  encodeTicket,
  fromHex,
  softCredentialId,
  toBase64Url,
  utf8,
  verifyEntrantSignature,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UnlockPurpose } from "./demo-unlock";
import {
  createDemoWallet,
  createWallet,
  hasUserVerification,
  sitePolicy,
} from "./wallet";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("데모 지갑: 실제 패스키 대신 흉내 확인과 기기 안 데모 열쇠", () => {
  it("확인하면 데모 열쇠를 만들고, 서명마다 다시 확인받아 흉내 패스키 서명(UP·UV, 이 페이지 주소)을 한다", async () => {
    const asked: UnlockPurpose[] = [];
    const wallet = createDemoWallet("test-demo", async (purpose) => {
      asked.push(purpose);
      return true;
    });
    const key = await wallet.createPasskey();
    expect(key.kind).toBe("demo");
    // 패스키 번호는 공개 열쇠에서 정해진다(장부에 패스키 모양으로 등록한다)
    expect(key.credentialId).toEqual(softCredentialId(key.pub));
    expect(wallet.loadKey()?.credentialId).toEqual(key.credentialId);
    // 다시 열어도 같은 열쇠
    expect(wallet.loadKey()?.pub).toEqual(key.pub);

    const signer = await wallet.signerFor(key);
    const message = new TextEncoder().encode("stardraw demo");
    const sig = await signer.sign(message);
    expect(sig.kind).toBe("webauthn");
    expect(sig.authenticatorData[32]).toBe(0x05);
    expect(
      await verifyEntrantSignature(key.pub, message, sig, sitePolicy()),
    ).toBe(true);
    expect(asked).toEqual(["create", "sign"]);
  });

  it("흉내 창을 취소하면 실제 패스키 창을 닫았을 때와 같은 오류(NotAllowedError)", async () => {
    let allow = false;
    const wallet = createDemoWallet("test-demo", async () => allow);
    await expect(wallet.createPasskey()).rejects.toMatchObject({
      name: "NotAllowedError",
    });
    expect(wallet.loadKey()).toBeNull();

    allow = true;
    const key = await wallet.createPasskey();
    allow = false;
    const signer = await wallet.signerFor(key);
    await expect(signer.sign(new Uint8Array([1]))).rejects.toMatchObject({
      name: "NotAllowedError",
    });
  });

  it("실제 패스키(navigator.credentials)를 부르지 않고, 다른 기기 찾기는 없다", async () => {
    const create = vi.fn();
    const get = vi.fn();
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { create, get },
    });
    const wallet = createDemoWallet("test-demo", async () => true);
    const key = await wallet.createPasskey();
    await (await wallet.signerFor(key)).sign(new Uint8Array([2]));
    expect(await wallet.recoverPasskey(async () => key.pub)).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("「데모 처음부터」는 데모 열쇠도 지운다", async () => {
    const wallet = createDemoWallet("test-demo", async () => true);
    await wallet.createPasskey();
    await wallet.clear();
    expect(wallet.loadKey()).toBeNull();
  });
});

describe("응모권은 그 장부의 것으로만 센다", () => {
  const ticketOf = (round: number) => ({
    ticket: {
      v: 1,
      round,
      numbers: [1, 2, 3, 4, 5, 6],
      pub: new Uint8Array(65).fill(4),
      nonce: 7,
      sig: {
        kind: "webauthn" as const,
        authenticatorData: fromHex("0102"),
        clientDataJSON: utf8("{}"),
        signature: fromHex("3006020101020101"),
      },
    },
    receivedAt: 100,
  });

  it("A 장부 1회차 응모권은 다시 시작한 B 장부 1회차에서 응모하지 않은 것으로 보인다", () => {
    let ledger: string | null = "trial:aaaa";
    const wallet = createWallet("test-game", () => ledger);
    wallet.addTicket(ticketOf(1));
    wallet.markOpened(1);
    expect(wallet.loadTickets().map((m) => m.ticket.round)).toEqual([1]);

    // 서버 장부를 새 genesis로 다시 시작했다
    ledger = "trial:bbbb";
    expect(wallet.loadTickets()).toEqual([]);
    expect(wallet.openedRounds().has(1)).toBe(false);

    // 원래 장부로 돌아가면 다시 보인다
    ledger = "trial:aaaa";
    expect(wallet.loadTickets()).toHaveLength(1);
  });

  it("알림 띠를 닫은 회차는 장부별로 남는다", () => {
    let ledger: string | null = "trial:aaaa";
    const wallet = createWallet("test-game", () => ledger);
    wallet.closeNotice([1, 2]);
    wallet.closeNotice([2, 3]);
    expect([...wallet.noticeClosedRounds()].sort()).toEqual([1, 2, 3]);
    expect(wallet.openedRounds().size).toBe(0);
    ledger = "trial:bbbb";
    expect(wallet.noticeClosedRounds().size).toBe(0);
  });

  it("장부를 아직 받지 못했거나 장부 표시가 없는 옛 응모권은 지금 것으로 세지 않는다", () => {
    const wallet = createWallet("test-game", () => null);
    wallet.addTicket(ticketOf(1));
    expect(wallet.loadTickets()).toEqual([]);
    // 장부 표시를 두기 전 판이 저장한 모양
    localStorage.setItem(
      "test-old-tickets",
      JSON.stringify([
        { t: toBase64Url(encodeTicket(ticketOf(1).ticket)), at: 1 },
      ]),
    );
    localStorage.setItem("test-old-opened", JSON.stringify([1]));
    const old = createWallet("test-old", () => "trial:aaaa");
    expect(old.loadTickets()).toEqual([]);
    expect(old.openedRounds().size).toBe(0);
  });
});

describe("등록증 발급 시각", () => {
  it("열쇠를 만든 시각을 저장해 발급 시각으로 쓰고, 이 기기 열쇠가 아니면 null", async () => {
    let now = 1_000;
    const wallet = createDemoWallet(
      "test-demo",
      async () => true,
      () => null,
      () => now,
    );
    const key = await wallet.createPasskey();
    expect(key.createdAt).toBe(1_000);
    now = 9_000;
    expect(wallet.issuedAt(key.pub)).toBe(1_000);
    expect(wallet.loadKey()?.createdAt).toBe(1_000);
    expect(wallet.issuedAt(new Uint8Array(65))).toBeNull();
  });

  it("시각 없이 저장된 예전 열쇠는 처음 볼 때의 시각을 한 번 저장해 계속 쓴다", () => {
    const pub = new Uint8Array(65).fill(4);
    localStorage.setItem(
      "test-game-key",
      JSON.stringify({
        kind: "passkey",
        pub: toBase64Url(pub),
        credentialId: toBase64Url(new Uint8Array([1, 2, 3])),
      }),
    );
    let now = 5_000;
    const wallet = createWallet(
      "test-game",
      () => null,
      () => now,
    );
    expect(wallet.loadKey()?.createdAt).toBeUndefined();
    expect(wallet.issuedAt(pub)).toBe(5_000);
    now = 7_000;
    expect(wallet.issuedAt(pub)).toBe(5_000);
    // 다시 열어도 같은 시각이고 패스키 번호는 그대로
    const again = createWallet(
      "test-game",
      () => null,
      () => now,
    );
    expect(again.loadKey()?.createdAt).toBe(5_000);
    expect(again.loadKey()?.credentialId).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("패스키 만들기: 본인 확인(UV) 표시", () => {
  const authData = (flags: number) => {
    const out = new Uint8Array(37);
    out[32] = flags;
    return out;
  };

  it("UP·UV가 모두 켜져야 통과한다(다른 비트는 상관없다)", () => {
    expect(hasUserVerification(authData(0x05))).toBe(true);
    expect(hasUserVerification(authData(0x5d))).toBe(true);
    expect(hasUserVerification(authData(0x01))).toBe(false);
    expect(hasUserVerification(authData(0x04))).toBe(false);
  });
});
