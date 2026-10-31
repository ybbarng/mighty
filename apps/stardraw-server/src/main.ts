import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { realClock } from "@mighty/fair-play";

import {
  GOOGLE_CLIENT_ID,
  sealFingerprint,
  toBase64Url,
} from "@mighty/stardraw-core";
import { loadConfig } from "./config";
import { StardrawServer } from "./engine";
import { googleTokenVerifier } from "./google";
import { createHttpServer } from "./http";
import {
  type Anchor,
  GitHubAnchor,
  HttpDrand,
  LocalRootLog,
  noAnchor,
  RekorRootLog,
  type RootLog,
  TsaRootLog,
} from "./outside";
import { isPowWorker, runPowWorker, WorkerPowChecker } from "./pow-pool";
import { Publisher } from "./publish";
import { DEFAULT_RELAY_LIMITS, Relay } from "./relay";
import { RoomHub } from "./room";
import { parseScheduleLiveArgs, scheduleLive } from "./schedule-live";
import {
  createNextServerKey,
  loadNextServerKey,
  loadServerKey,
} from "./server-key";
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
  const nextServerKey = await loadNextServerKey(config.nextServerKeyFile);
  const log = (message: string) => console.log(`[stardraw] ${message}`);

  // 봉인 시각 증명: 공개 시각 인증 기관(기본). 끄면(개발용) 이 서버의 시계를 적는다(시각 증명 없음)
  const rootLog: RootLog = config.tsa
    ? new TsaRootLog(
        config.tsa.authorities,
        config.tsa.minValid,
        fetch,
        log,
        () => clock.now(),
      )
    : config.rekor
      ? new RekorRootLog(config.rekor.url, serverKey, fetch, log)
      : new LocalRootLog(() => Math.floor(clock.now() / 1000));
  const anchor: Anchor = config.github
    ? new GitHubAnchor(config.github.repo, config.github.token)
    : noAnchor;
  log(
    config.tsa
      ? `시각 인증: ${config.tsa.authorities.map((a) => a.name).join(", ")} 중 ${config.tsa.minValid}곳 이상`
      : config.rekor
        ? `투명성 로그: ${config.rekor.url}`
        : "시각 인증을 꺼서 서버 시계로 봉인 시각을 적는다(시각 증명 없음)",
  );
  log(
    config.qualAffiliations.size > 0
      ? `소속 발급: ${[...config.qualAffiliations.keys()].join(", ")}(${GOOGLE_CLIENT_ID ? "구글 로그인" : "구글 클라이언트 ID가 없어 준비 중"})`
      : "소속 설정이 없어 도장을 찍지 않는다",
  );
  log(
    config.github
      ? `앵커: ${config.github.repo}(시험 단계 trial, 정식 단계 main 브랜치)`
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
    ...(nextServerKey ? { nextServerKey } : {}),
    drand: new HttpDrand(config.drandUrls),
    rootLog,
    anchor,
    limits: {
      entriesPerPrefixPerRound: config.entriesPerPrefixPerRound,
      registrationsPerPrefixPerDay: config.registrationsPerPrefixPerDay,
      argonConcurrency: config.argonConcurrency,
      argonQueue: config.argonQueue,
    },
    // 작업 증명은 작업 스레드에서(이벤트 루프가 봉인·싼 확인을 계속 돌게, D2). 이 번들 파일 자신을 작업 스레드로 띄운다
    powChecker: new WorkerPowChecker(
      new URL(import.meta.url),
      config.argonConcurrency,
    ),
    sealDeadline: config.sealDeadline,
    directorKeys: config.directorKeys,
    directorRequestsPerPrefixPerDay: config.directorRequestsPerPrefixPerDay,
    qualification: {
      affiliations: config.qualAffiliations,
      issuesPerPrefixPerDay: config.qualIssuesPerPrefixPerDay,
      verifyGoogle: googleTokenVerifier(GOOGLE_CLIENT_ID),
    },
    log,
  });
  const relay = new Relay(
    store,
    clock,
    config.policy,
    {
      ...DEFAULT_RELAY_LIMITS,
      invitesPerPrefixPerDay: config.invitesPerPrefixPerDay,
      badLinksPerPrefixPerDay: config.badLinksPerPrefixPerDay,
    },
    (pub) => engine.isActiveDirector(pub),
  );
  const rooms = new RoomHub({
    clock,
    policy: config.policy,
    schedule: () => engine.schedule(),
    isRegistered: (pub) => engine.isRegistered(pub),
    isDirector: (pub) => engine.isActiveDirector(pub),
    sealed: (round) => store.seal(round) !== null,
    tickets: (round) => store.entries(round),
    drawn: (round) => store.record(round) !== null,
  });
  const http = createHttpServer(engine, relay, {
    basePath: config.basePath,
    ledgerDir: config.ledgerDir,
    devOrigins: config.devOrigins,
    trustProxy: config.trustProxy,
    rooms,
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
    rooms.stop();
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

/**
 * `node server.mjs schedule-live --from <ISO>`: 정식 단계를 예약한다(docs/36 11-6).
 * 돌고 있는 서버가 다음에 닫는 회차 기록에 일정 바꾸기 한 줄로 싣는다(3회차 예고)
 */
function scheduleLiveCommand(args: readonly string[]): void {
  const config = loadConfig();
  const parsed = parseScheduleLiveArgs(args);
  const store = new Store(join(config.dataDir, "stardraw.sqlite"));
  try {
    const { change, decidedIn } = scheduleLive(
      store,
      parsed.from,
      parsed.roundSeconds,
    );
    console.log(
      `[stardraw] 정식 단계를 예약했다: 사슬 ${change.fromRound}회차(${new Date(parsed.from * 1000).toISOString()} 시작)가 정식 1회, ` +
        `${change.length / 60}분 회차. ${decidedIn}회차 기록에 실린다`,
    );
  } finally {
    store.close();
  }
}

/**
 * 다음 관인 열쇠 파일을 만든다(관인 교체 준비, docs/36 11-25). 이미 있으면 거절한다.
 * 공개 열쇠와 지문만 출력한다(비밀 열쇠는 파일에만)
 */
async function sealNextCommand(): Promise<void> {
  const config = loadConfig();
  const pub = await createNextServerKey(config.nextServerKeyFile);
  console.log(
    `[stardraw] 다음 관인 열쇠를 만들었다: ${config.nextServerKeyFile}\n` +
      `  지문 ${sealFingerprint(pub)}\n  공개 열쇠 ${toBase64Url(pub)}\n` +
      "  먼저 이 파일을 백업하고, 서버를 다시 띄운 뒤 국장 화면에서 「관인 교체」를 서명한다",
  );
}

const [command, ...rest] = process.argv.slice(2);
void (
  isPowWorker()
    ? Promise.resolve().then(runPowWorker)
    : command === "backup" && rest[0]
      ? backupTo(rest[0])
      : command === "schedule-live"
        ? Promise.resolve().then(() => scheduleLiveCommand(rest))
        : command === "seal-next"
          ? sealNextCommand()
          : main()
).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
