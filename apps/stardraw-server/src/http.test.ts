import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  decodeReceipt,
  encodeRegistration,
  encodeTicket,
  fromBase64Url,
  toBase64Url,
  verifyReceipt,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import { drawOf, EPOCH, entryFor, makeRig, player, type Rig } from "./testing";

let rig: Rig;
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  rig?.close();
});

async function serve() {
  rig = await makeRig();
  const server = createHttpServer(rig.engine, rig.relay, {
    basePath: "/stardraw-api",
    ledgerDir: join(rig.dir, "ledger"),
    devOrigins: ["http://localhost:3456"],
    trustProxy: true,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => new Promise((resolve) => server.close(() => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/stardraw-api`;
}

describe("HTTP", () => {
  it("상태를 묻고, 응모하면 서명된 영수증을 받고, 장부 파일을 내려받는다", async () => {
    const base = await serve();
    await rig.at(EPOCH + 10);
    const stateRes = await fetch(`${base}/api/state`);
    expect(stateRes.headers.get("x-content-type-options")).toBe("nosniff");
    const state = await stateRes.json();
    expect(state).toMatchObject({
      round: 1,
      records: 0,
      entries: 0,
      // 감시용 칸(D10): 앵커를 쓰지 않는 시험 장치라 밀림은 null
      voidRecent: [],
      anchorLag: null,
      earlySealLag: null,
      sealOverdueSeconds: 0,
      qualIssued: [],
      qualIssuedMax: 0,
    });

    const p = await player();
    const { ticket, registration } = await entryFor(
      p,
      1,
      drawOf(1).numbers,
      rig.engine.head(),
    );
    const keyUrl = `${base}/api/keys/${toBase64Url(p.signer.publicKey)}`;
    expect(await (await fetch(keyUrl)).json()).toEqual({
      registered: false,
      round: null,
    });
    const res = await fetch(`${base}/api/enter`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.9",
      },
      body: JSON.stringify({
        ticket: toBase64Url(encodeTicket(ticket)),
        registration: toBase64Url(
          encodeRegistration(registration as NonNullable<typeof registration>),
        ),
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const receipt = decodeReceipt(fromBase64Url(body.receipt));
    const serverKey = fromBase64Url(state.serverKey);
    expect(await verifyReceipt(serverKey, receipt)).toBe(true);
    expect(await (await fetch(keyUrl)).json()).toEqual({
      registered: true,
      round: 1,
    });

    // 같은 응모권을 또 내면 거절(한국어 문구와 409)
    const again = await fetch(`${base}/api/enter`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket: toBase64Url(encodeTicket(ticket)) }),
    });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toContain("이미 응모");

    await rig.finish(1);
    const head = await fetch(`${base}/ledger/head.json`);
    expect(head.headers.get("cache-control")).toBe("no-cache");
    expect(await head.json()).toMatchObject({ rounds: 1, sealed: 1 });
    const round = await fetch(`${base}/ledger/rounds/000001.json`);
    expect(round.headers.get("cache-control")).toContain("immutable");
    expect((await round.json()).tickets).toHaveLength(1);
  });

  it("개발용 출처에만 CORS를 열고, 장부 밖 파일·모르는 주소는 404", async () => {
    const base = await serve();
    const dev = await fetch(`${base}/api/state`, {
      headers: { origin: "http://localhost:3456" },
    });
    expect(dev.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3456",
    );
    const other = await fetch(`${base}/api/state`, {
      headers: { origin: "https://evil.example" },
    });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    expect((await fetch(`${base}/ledger/../db.sqlite`)).status).toBe(404);
    expect((await fetch(`${base}/ledger/%2e%2e/db.sqlite`)).status).toBe(404);
    expect((await fetch(`${base}/api/nothing`)).status).toBe(404);
    const bad = await fetch(`${base}/api/enter`, { method: "POST", body: "{" });
    expect(bad.status).toBe(400);
  });
});
