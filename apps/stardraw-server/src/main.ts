import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { realClock } from "@mighty/fair-play";

import { loadConfig } from "./config";
import { StardrawServer } from "./engine";
import { createHttpServer } from "./http";
import {
  type Anchor,
  GitHubAnchor,
  HttpDrand,
  LocalRootLog,
  noAnchor,
  RekorRootLog,
  type RootLog,
} from "./outside";
import { Publisher } from "./publish";
import { Relay } from "./relay";
import { loadServerKey } from "./server-key";
import { Store } from "./store";

/** 하늘의 별 따기 회차 서버 시작(docs/36 11-5 3번) */
async function main(): Promise<void> {
  const config = loadConfig();
  mkdirSync(config.dataDir, { recursive: true });
  const clock = realClock;
  const store = new Store(join(config.dataDir, "stardraw.sqlite"));
  const serverKey = await loadServerKey(
    config.serverKeyFile,
    config.generateServerKey,
  );
  const log = (message: string) => console.log(`[stardraw] ${message}`);

  // 투명성 로그: 설정이 없으면 이 서버의 시계를 적는다(시각 증명 없음. 개발용)
  const rootLog: RootLog = config.rekor
    ? new RekorRootLog(config.rekor.url, serverKey)
    : new LocalRootLog(() => Math.floor(clock.now() / 1000));
  const anchor: Anchor = config.github
    ? new GitHubAnchor(
        config.github.repo,
        config.github.branch,
        config.github.token,
      )
    : noAnchor;
  if (!config.rekor)
    log("투명성 로그 설정이 없어 서버 시계로 봉인 시각을 적는다(개발용)");
  if (!config.github) log("앵커 저장소 설정이 없어 앵커를 남기지 않는다");

  const engine = new StardrawServer({
    store,
    publisher: new Publisher(config.ledgerDir),
    clock,
    schedule: config.schedule,
    pow: config.pow,
    policy: config.policy,
    serverKey,
    drand: new HttpDrand(config.drandUrls),
    rootLog,
    anchor,
    limits: {
      entriesPerPrefixPerRound: config.entriesPerPrefixPerRound,
      registrationsPerPrefixPerDay: config.registrationsPerPrefixPerDay,
      argonConcurrency: config.argonConcurrency,
      argonQueue: config.argonQueue,
    },
    sealDeadline: config.sealDeadline,
    log,
  });
  const relay = new Relay(store, clock, config.policy);
  const http = createHttpServer(engine, relay, {
    basePath: config.basePath,
    ledgerDir: config.ledgerDir,
    devOrigins: config.devOrigins,
    trustProxy: config.trustProxy,
  });

  let stopTick = () => {};
  const loop = () => {
    void engine.tick().finally(() => {
      stopTick = clock.after(1000, loop);
    });
  };
  loop();
  http.listen(config.port, () =>
    log(
      `${config.port}번 포트, ${config.basePath} 아래에서 기다린다(1회차 시작 ${new Date(engine.genesis.epoch * 1000).toISOString()})`,
    ),
  );

  const stop = () => {
    stopTick();
    http.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
