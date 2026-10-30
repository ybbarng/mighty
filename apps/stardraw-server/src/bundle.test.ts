import { readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { loadPublicLedger, loadRoundFiles } from "@mighty/stardraw-core";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpServer } from "./http";
import { Publisher, pad } from "./publish";
import { EPOCH, makeRig, type Rig } from "./testing";

/**
 * 묶음 파일(docs/36 7절 「장부 받기」): 다 찬 10회차 구간의 회차·봉인 파일을 한 파일로 함께 낸다.
 * 낱개 파일과 내용이 같고, 한 번 쓰면 바꾸지 않으며, 서버를 다시 띄우면 빠진 묶음을 채운다
 */

let rigs: Rig[] = [];
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  const open = rigs;
  rigs = [];
  for (const r of open) r.close();
});

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

async function rigWithRounds(n: number): Promise<Rig> {
  const rig = await makeRig();
  rigs.push(rig);
  await rig.at(EPOCH + 10);
  for (let round = 1; round <= n; round++) await rig.finish(round);
  return rig;
}

describe("장부 묶음 파일", () => {
  it("10회차가 닫히면 그 구간의 회차·봉인 파일을 그대로 묶어 낸다", async () => {
    const rig = await rigWithRounds(11);
    const ledger = join(rig.dir, "ledger");
    const bundle = read(join(ledger, "bundles", "10", "000001.json"));
    expect(bundle.first).toBe(1);
    expect(bundle.size).toBe(10);
    for (let n = 1; n <= 10; n++) {
      expect(bundle.rounds[n - 1]).toEqual(
        read(join(ledger, "rounds", `${pad(n)}.json`)),
      );
      expect(bundle.seals[n - 1]).toEqual(
        read(join(ledger, "seals", `${pad(n)}.json`)),
      );
    }
    // 아직 덜 찬 11~20 구간은 묶지 않는다
    expect(() => read(join(ledger, "bundles", "10", "000011.json"))).toThrow();
  });

  it("있는 묶음은 다시 쓰지 않고, 서버를 다시 띄우면 빠진 묶음을 채운다", async () => {
    const rig = await rigWithRounds(10);
    const ledger = join(rig.dir, "ledger");
    const path = join(ledger, "bundles", "10", "000001.json");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, "그대로");
    new Publisher(ledger).bundles(10);
    expect(readFileSync(path, "utf8")).toBe("그대로");
    rmSync(path);
    // 같은 데이터 폴더로 다시 띄운다(폴더는 새 서버가 끝에 지운다)
    rig.store.close();
    rigs = rigs.filter((r) => r !== rig);
    const again = await makeRig({ dir: rig.dir, at: rig.clock.now() / 1000 });
    rigs.push(again);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("HTTP로 오래 캐시되게 내고, 받는 쪽은 묶음으로 받아 낱개와 같은 장부를 얻는다", async () => {
    const rig = await rigWithRounds(12);
    const server = createHttpServer(rig.engine, rig.relay, {
      basePath: "/stardraw-api",
      ledgerDir: join(rig.dir, "ledger"),
      devOrigins: [],
      trustProxy: false,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    close = () => new Promise((r) => server.close(() => r()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/stardraw-api`;

    const res = await fetch(`${base}/ledger/bundles/10/000001.json`);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect((await fetch(`${base}/ledger/bundles/7/000001.json`)).status).toBe(
      404,
    );

    const asked: string[] = [];
    const counting = ((url: string, init?: RequestInit) => {
      asked.push(url.slice(base.length));
      return fetch(url, init);
    }) as typeof fetch;
    const ledger = await loadPublicLedger(base, counting);
    expect(ledger.records.map((r) => r.round)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    // genesis·head + 묶음 1개 + 11·12회차 낱개(회차·봉인)
    expect(asked).toHaveLength(2 + 1 + 4);
    const singles = await loadRoundFiles(base, fetch, 1, 12, { seals: true });
    expect(ledger.seals).toEqual(singles.map((s) => s.seal));
  });
});
