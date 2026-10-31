import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  encodeSignatureData,
  fromBase64Url,
  roomPassMessage,
  toBase64Url,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import { RoomHub } from "./room";
import { EPOCH, makeRig, player, type Rig, registerOnly } from "./testing";

let rig: Rig;
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  rig?.close();
});

async function serve() {
  rig = await makeRig();
  const rooms = new RoomHub({
    clock: rig.clock,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    schedule: () => rig.engine.schedule(),
    isRegistered: (pub) => rig.engine.isRegistered(pub),
    isDirector: () => false,
    sealed: (round) => rig.store.seal(round) !== null,
    tickets: (round) => rig.store.entries(round),
    drawn: (round) => rig.store.record(round) !== null,
  });
  const server = createHttpServer(rig.engine, rig.relay, {
    basePath: "/stardraw-api",
    ledgerDir: join(rig.dir, "ledger"),
    devOrigins: [],
    trustProxy: true,
    rooms,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () =>
    new Promise((resolve) => {
      rooms.stop();
      server.closeAllConnections();
      server.close(() => resolve());
    });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/stardraw-api`;
}

describe("HTTP 회차 방", () => {
  it("등록한 우주인이 표를 받고 스트림에서 자기 말을 받는다. 표 없는 말은 거절", async () => {
    const base = await serve();
    await rig.at(EPOCH + 10);
    const p = await player();
    await registerOnly(rig, p);
    const post = (path: string, body: unknown) =>
      fetch(`${base}/api/room/1/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const { nonce } = await (await post("challenge", {})).json();
    const signature = await p.signer.sign(
      roomPassMessage(1, fromBase64Url(nonce)),
    );
    const got = await post("pass", {
      pub: toBase64Url(p.signer.publicKey),
      signature: encodeSignatureData(signature),
      nonce,
    });
    expect(got.status).toBe(200);
    const { pass } = await got.json();
    const stream = await post("events", { pass });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let text = "";
    const until = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error("스트림이 끝났다");
        text += decoder.decode(value);
      }
    };
    await until('"type":"hello"');
    expect((await post("say", { pass, text: "안녕하세요" })).status).toBe(200);
    await until("안녕하세요");
    expect((await post("say", { text: "표 없음" })).status).toBe(401);
    await reader.cancel();
  });
});
