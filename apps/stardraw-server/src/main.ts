import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { realClock } from "@mighty/fair-play";

import { loadConfig } from "./config";
import { StardrawServer } from "./engine";
import { createHttpServer } from "./http";
import { parseStartLiveArgs, startLive } from "./live";
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
  // 설정의 모드와 데이터 폴더의 장부 종류가 같아야 띄운다(시험 데이터로 정식을, 정식 데이터로 시험을 띄우지 않게)
  const stored = store.storedGenesis();
  if (config.mode === "live" && !stored)
    throw new Error(
      "정식 장부가 없다. 먼저 `start-live`로 만든다(deploy/stardraw/README.md)",
    );
  if (stored && (stored.ledger === "trial") !== (config.mode === "trial"))
    throw new Error(
      `데이터 폴더는 ${stored.ledger === "trial" ? "시험" : "정식"} 장부인데 STARDRAW_MODE=${config.mode}다`,
    );
  const serverKey = await loadServerKey(
    config.serverKeyFile,
    config.generateServerKey,
  );
  const log = (message: string) => console.log(`[stardraw] ${message}`);

  // 투명성 로그: 설정이 없으면 이 서버의 시계를 적는다(시각 증명 없음. 개발용)
  const rootLog: RootLog = config.rekor
    ? new RekorRootLog(config.rekor.url, serverKey, fetch, log)
    : new LocalRootLog(() => Math.floor(clock.now() / 1000));
  const anchor: Anchor = config.github
    ? new GitHubAnchor(
        config.github.repo,
        config.github.branch,
        config.github.token,
      )
    : noAnchor;
  if (config.mode === "trial") log("시험 운영: 장부는 정식 시작 때 버린다");
  log(
    config.rekor
      ? `투명성 로그: ${config.rekor.url}`
      : "투명성 로그 설정이 없어 서버 시계로 봉인 시각을 적는다(시각 증명 없음)",
  );
  log(
    config.github
      ? `앵커: ${config.github.repo}(${config.github.branch} 브랜치)`
      : "앵커 저장소 설정이 없어 앵커를 남기지 않는다",
  );

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

/**
 * `node server.mjs backup <파일>`: 서버를 멈추지 않고 SQLite를 한 파일로 떠 둔다(node:sqlite backup).
 * 장부 파일(ledger/)은 공개돼 있고 앵커에도 남지만, 마감 전 응모권과 확인 전달은 DB에만 있다
 */
async function backupTo(target: string): Promise<void> {
  const config = loadConfig();
  const store = new Store(join(config.dataDir, "stardraw.sqlite"));
  const pages = await backup(store.db, target);
  store.close();
  console.log(`[stardraw] ${target}에 ${pages}쪽을 떠 두었다`);
}

/** `node server.mjs start-live --epoch <ISO> --carry-registrations <시험 장부 백업>`: 정식 장부를 만든다 */
async function startLiveCommand(args: readonly string[]): Promise<void> {
  const config = loadConfig();
  const parsed = parseStartLiveArgs(args);
  const result = startLive({
    dataDir: config.dataDir,
    ledgerDir: config.ledgerDir,
    epoch: parsed.epoch,
    ...(parsed.roundSeconds ? { roundSeconds: parsed.roundSeconds } : {}),
    trialExport: parsed.trialExport,
    now: Math.floor(Date.now() / 1000),
  });
  console.log(
    `[stardraw] 정식 장부를 만들었다: 1회차 ${new Date(result.schedule.epoch * 1000).toISOString()}, ` +
      `패스키 등록 ${result.carried}개를 옮김(원시 열쇠 ${result.skipped}개는 옮기지 않음), genesis ${result.genesis}`,
  );
}

const [command, ...rest] = process.argv.slice(2);
void (
  command === "backup" && rest[0]
    ? backupTo(rest[0])
    : command === "start-live"
      ? startLiveCommand(rest)
      : main()
).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
