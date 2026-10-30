import {
  encodeTicket,
  toBase64Url,
  verifySignature,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UnlockPurpose } from "./demo-unlock";
import { createDemoWallet, createWallet, hasUserVerification } from "./wallet";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("데모 지갑: 실제 패스키 대신 흉내 확인과 기기 안 데모 열쇠", () => {
  it("확인하면 데모 열쇠를 만들고, 서명마다 다시 확인받아 원시 서명을 한다", async () => {
    const asked: UnlockPurpose[] = [];
    const wallet = createDemoWallet("test-demo", async (purpose) => {
      asked.push(purpose);
      return true;
    });
    const key = await wallet.createPasskey();
    expect(key.kind).toBe("demo");
    expect(key.credentialId).toHaveLength(0);
    // 다시 열어도 같은 열쇠
    expect(wallet.loadKey()?.pub).toEqual(key.pub);

    const signer = await wallet.signerFor(key);
    const message = new TextEncoder().encode("stardraw demo");
    const sig = await signer.sign(message);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(await verifySignature(key.pub, message, sig as Uint8Array)).toBe(
      true,
    );
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
      sig: { kind: "raw" as const, sig: new Uint8Array(64).fill(1) },
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
