import { verifySignature } from "@mighty/stardraw-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UnlockPurpose } from "./demo-unlock";
import { createDemoWallet } from "./wallet";

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
