import {
  POW_PARAMS,
  type PowParams,
  powTargetForTries,
  type Schedule,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

/**
 * 서버 설정. 모두 환경 변수로 받고, 없으면 운영 기본값이다.
 * 주소는 game.byb.kr/stardraw-api/ 아래(Traefik이 PathPrefix로 넘긴다). 화면과 같은 출처라 CORS가 필요 없고,
 * 개발용 localhost만 허용 목록에 둔다.
 */

export interface ServerConfig {
  port: number;
  /** 주소 앞머리(Traefik PathPrefix와 같게) */
  basePath: string;
  /** SQLite 파일·서버 열쇠가 놓이는 곳 */
  dataDir: string;
  /** 공개 장부 파일을 쓰는 곳(서버가 /ledger/로 낸다. nginx가 대신 내도 된다) */
  ledgerDir: string;
  /** 서버 서명 열쇠(PKCS8 DER base64). 운영은 파일 비밀값으로 마운트한다 */
  serverKeyFile: string;
  /** 열쇠 파일이 없을 때 새로 만들어 저장해도 되는지(개발만) */
  generateServerKey: boolean;
  /** 처음 일정표. 장부가 이미 있으면 장부의 것이 우선이다 */
  schedule: Schedule;
  pow: PowParams;
  policy: WebAuthnPolicy;
  /** 개발용으로 다른 출처를 받을 때(CORS 허용 목록) */
  devOrigins: string[];
  /** Traefik 뒤에서 X-Real-Ip를 믿는다 */
  trustProxy: boolean;
  /** 공인 IP 앞부분 하나당 회차 응모 상한 */
  entriesPerPrefixPerRound: number;
  /** 공인 IP 앞부분 하나당 하루 새 열쇠 등록 상한 */
  registrationsPerPrefixPerDay: number;
  /** 동시에 도는 Argon2 확인 수, 기다리는 줄 상한 */
  argonConcurrency: number;
  argonQueue: number;
  /** 마감 뒤 봉인 값을 투명성 로그에 올려야 하는 기한(초) */
  sealDeadline: number;
  drandUrls: string[];
  rekor: { url: string } | null;
  github: { repo: string; branch: string; token: string } | null;
}

const env = (name: string): string | undefined => {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
};

const int = (name: string, fallback: number): number => {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${name}는 정수여야 한다: ${v}`);
  return n;
};

/** 운영 기본 일정표: 1시간 회차, 화면 마감 여유 60초. 응모는 휴대폰 3초 안팎, 열쇠 등록은 1분 안팎 */
export function defaultSchedule(epoch: number): Schedule {
  return {
    epoch,
    entries: [
      {
        fromRound: 1,
        length: 3600,
        closeMargin: 60,
        powTarget: powTargetForTries(30),
        registerPowTarget: powTargetForTries(600),
      },
    ],
  };
}

export function loadConfig(): ServerConfig {
  const dataDir = env("STARDRAW_DATA_DIR") ?? "./data";
  const epoch = env("STARDRAW_EPOCH");
  const rekorUrl = env("STARDRAW_REKOR_URL");
  const ghRepo = env("STARDRAW_ANCHOR_REPO");
  const ghToken = env("STARDRAW_ANCHOR_TOKEN");
  return {
    port: int("PORT", 8080),
    basePath: env("STARDRAW_BASE_PATH") ?? "/stardraw-api",
    dataDir,
    ledgerDir: env("STARDRAW_LEDGER_DIR") ?? `${dataDir}/ledger`,
    serverKeyFile:
      env("STARDRAW_SERVER_KEY_FILE") ?? `${dataDir}/server-key.pkcs8`,
    generateServerKey: env("STARDRAW_GENERATE_SERVER_KEY") === "1",
    schedule: defaultSchedule(
      // 정해 두지 않으면 다음 정시(개발용). 운영은 반드시 정해 둔다
      epoch ? Number(epoch) : Math.ceil(Date.now() / 1000 / 3600) * 3600,
    ),
    pow: POW_PARAMS,
    policy: {
      rpId: env("STARDRAW_RP_ID") ?? "game.byb.kr",
      origins: (env("STARDRAW_ORIGINS") ?? "https://game.byb.kr").split(","),
    },
    devOrigins: (env("STARDRAW_DEV_ORIGINS") ?? "").split(",").filter(Boolean),
    trustProxy: env("STARDRAW_TRUST_PROXY") === "1",
    entriesPerPrefixPerRound: int("STARDRAW_ENTRIES_PER_PREFIX", 20),
    registrationsPerPrefixPerDay: int("STARDRAW_REGISTRATIONS_PER_PREFIX", 10),
    argonConcurrency: int("STARDRAW_ARGON_CONCURRENCY", 2),
    argonQueue: int("STARDRAW_ARGON_QUEUE", 32),
    sealDeadline: int("STARDRAW_SEAL_DEADLINE", 180),
    drandUrls: (
      env("STARDRAW_DRAND_URLS") ??
      "https://api.drand.sh,https://drand.cloudflare.com"
    ).split(","),
    rekor: rekorUrl ? { url: rekorUrl } : null,
    github:
      ghRepo && ghToken
        ? {
            repo: ghRepo,
            branch: env("STARDRAW_ANCHOR_BRANCH") ?? "main",
            token: ghToken,
          }
        : null,
  };
}
