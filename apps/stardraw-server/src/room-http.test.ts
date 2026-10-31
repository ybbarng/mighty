import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  encodeSignatureData,
  fromBase64Url,
  roomPassMessage,
  toBase64Url,
} from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";
import { RoomClient, type RoomEvent } from "../../web/src/stardraw/room-client";

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

async function serve(directors: Set<string> = new Set()) {
  rig = await makeRig();
  const rooms = new RoomHub({
    clock: rig.clock,
    policy: { rpId: "game.byb.kr", origins: ["https://game.byb.kr"] },
    schedule: () => rig.engine.schedule(),
    isRegistered: (pub) => rig.engine.isRegistered(pub),
    isDirector: (pub) => directors.has(toBase64Url(pub)),
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

/** 화면이 쓰는 클라이언트(apps/web RoomClient) 그대로 서버에 붙인다: 두 쪽의 요청·이벤트 형식이 어긋나지 않는지 */
describe("화면 클라이언트 ↔ 서버", () => {
  /** 스트림 이벤트를 모아 두고 조건이 맞을 때까지 기다린다 */
  function listen(client: RoomClient, pass: string | null) {
    const events: RoomEvent[] = [];
    let wake = () => {};
    void client.listen(
      pass,
      (e) => {
        events.push(e);
        wake();
      },
      () => wake(),
    );
    const until = async (ok: (e: RoomEvent) => boolean) => {
      for (;;) {
        const found = events.find(ok);
        if (found) return found;
        await new Promise<void>((r) => {
          wake = r;
        });
      }
    };
    return { events, until };
  }

  it("표를 받아 들어오고, 말이 보는 사람에게 가고, 국장이 가리고 내보낸다", async () => {
    const director = await player();
    const base = await serve(new Set([toBase64Url(director.signer.publicKey)]));
    await rig.at(EPOCH + 10);
    const p = await player();
    await registerOnly(rig, p);

    const watcher = listen(new RoomClient(base, 1), null);
    await watcher.until((e) => e.type === "hello");

    const mine = new RoomClient(base, 1);
    const got = await mine.issuePass(p.signer, (await mine.challenge()).nonce);
    const me = listen(mine, got.pass);
    await me.until((e) => e.type === "hello");
    await watcher.until((e) => e.type === "join" && e.person.id === got.id);

    const { id: said } = await mine.say(got.pass, "별이 많네요");
    await watcher.until(
      (e) => e.type === "say" && e.id === said && e.from === got.id,
    );

    const boss = new RoomClient(base, 1);
    const bossPass = await boss.issuePass(
      director.signer,
      (await boss.challenge()).nonce,
    );
    const bossView = listen(boss, bossPass.pass);
    const hello = await bossView.until((e) => e.type === "hello");
    expect(
      hello.type === "hello" &&
        hello.people.find((x) => x.id === bossPass.id)?.director,
    ).toBe(true);

    await boss.moderate(
      director.signer,
      (await boss.challenge()).nonce,
      "hide",
      said,
    );
    await watcher.until((e) => e.type === "hide" && e.id === said);
    await boss.moderate(
      director.signer,
      (await boss.challenge()).nonce,
      "kick",
      got.id,
    );
    await watcher.until((e) => e.type === "kicked" && e.id === got.id);
    // 내보낸 사람의 표로는 더 말할 수 없다
    await expect(mine.say(got.pass, "다시")).rejects.toMatchObject({
      status: 401,
    });
    // 국장이 아닌 열쇠의 조치는 거절
    await expect(
      mine.moderate(p.signer, (await mine.challenge()).nonce, "hide", said),
    ).rejects.toMatchObject({ status: 403 });
    for (const c of [mine, boss]) c.close();
  });
});
