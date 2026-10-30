import {
  alignedEpoch,
  DEFAULT_TSA_MIN,
  DEFAULT_TSA_NAMES,
  type Phase,
  POW_PARAMS,
  type PowParams,
  powTargetForTries,
  rekorLogFor,
  type Schedule,
  type ScheduleEntry,
  type TsaAuthority,
  tsaByName,
  type WebAuthnPolicy,
} from "@mighty/stardraw-core";

/**
 * 서버 설정. 모두 환경 변수로 받고, 없으면 운영 기본값이다.
 * 주소는 game.byb.kr/stardraw-api/ 아래(Traefik이 PathPrefix로 넘긴다). 화면과 같은 출처라 CORS가 필요 없고,
 * 개발용 localhost만 허용 목록에 둔다.
 */

/**
 * 운영 단계는 설정이 아니라 장부가 정한다(docs/36 11-6). 새 장부는 시험 단계로 시작하고,
 * `schedule-live` 명령이 일정 바꾸기 한 줄로 정식 단계를 예약한다. 사슬은 끝까지 하나다.
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
  /** 마감 뒤 봉인 값의 시각 증명을 받아야 하는 기한(초) */
  sealDeadline: number;
  drandUrls: string[];
  /** 공개 시각 인증 기관과, 몇 곳 이상 받아야 봉인 성공인지. null이면 끈다(개발용, 서버 시계를 적는다) */
  tsa: { authorities: TsaAuthority[]; minValid: number } | null;
  /** 꺼 둔 선택지: Rekor(시각 인증을 끈 때만) */
  rekor: { url: string } | null;
  /** GitHub 앵커. 브랜치는 회차의 단계로 정한다(시험 trial, 정식 main) */
  github: { repo: string; token: string } | null;
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

/** 정식 단계 회차 길이: 1시간(매시 정각 추첨 · 55분 마감) */
export const LIVE_ROUND_SECONDS = 3600;

/**
 * 일정표 한 줄: 화면 마감 여유 5초(시계 차이만 덮는다). 응모는 휴대폰 3초 안팎, 열쇠 등록은 1분 안팎.
 * 회차 길이는 정식 1시간, 시험 기본 10분(최소 10분 규칙은 규칙 패키지가 지킨다)
 */
export function scheduleEntry(
  fromRound: number,
  phase: Phase,
  length = phase === "trial" ? 600 : LIVE_ROUND_SECONDS,
): ScheduleEntry {
  return {
    fromRound,
    length,
    closeMargin: 5,
    powTarget: powTargetForTries(30),
    registerPowTarget: powTargetForTries(600),
    phase,
  };
}

/** 새 장부의 처음 일정표: 시험 단계로 시작. 마감은 추첨 5분 전(epoch를 alignedEpoch로 맞춘다) */
export function defaultSchedule(epoch: number, length = 600): Schedule {
  return { epoch, entries: [scheduleEntry(1, "trial", length)] };
}

export function loadConfig(): ServerConfig {
  const dataDir = env("STARDRAW_DATA_DIR") ?? "./data";
  const epoch = env("STARDRAW_EPOCH");
  const length = int("STARDRAW_ROUND_SECONDS", 600);
  const outside = outsideConfig(env);
  return {
    port: int("PORT", 8080),
    basePath: env("STARDRAW_BASE_PATH") ?? "/stardraw-api",
    dataDir,
    ledgerDir: env("STARDRAW_LEDGER_DIR") ?? `${dataDir}/ledger`,
    serverKeyFile:
      env("STARDRAW_SERVER_KEY_FILE") ?? `${dataDir}/server-key.pkcs8`,
    generateServerKey: env("STARDRAW_GENERATE_SERVER_KEY") === "1",
    // 새 장부일 때만 쓴다. 정해 두지 않으면 띄운 뒤 첫 맞춘 마감이 1회차 마감
    schedule: defaultSchedule(
      epoch
        ? Number(epoch)
        : alignedEpoch(Math.floor(Date.now() / 1000), length),
      length,
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
    ...outside,
  };
}

/**
 * 바깥 기록 설정(docs/36 11-1, 11-6).
 * - 시각 인증(`STARDRAW_TSA`): 기관 이름을 쉼표로(기본 digicert,sectigo, core tsa.ts에 열쇠를 고정한 기관만).
 *   `off`면 끈다(개발용). `STARDRAW_TSA_MIN`(기본 1)곳 이상 맞는 토큰을 받아야 봉인 성공. 단계와 상관없이 켠다
 * - Rekor(꺼 둔 선택지, `STARDRAW_TSA=off`일 때만, `STARDRAW_REKOR_URL`): core에 공개 열쇠를 고정해 둔 로그만
 *   (rekor.sigstage.dev, rekor.sigstore.dev). 맞지 않는 주소면 서버를 띄우지 않는다.
 * - GitHub 앵커(`STARDRAW_ANCHOR_REPO`, `STARDRAW_ANCHOR_TOKEN`): 저장소와 토큰이 둘 다 있을 때만.
 *   브랜치는 회차의 단계로(시험 `trial`, 정식 `main`), 처음 일정표 파일은 늘 `main`
 */
export function outsideConfig(
  get: (name: string) => string | undefined,
): Pick<ServerConfig, "tsa" | "rekor" | "github"> {
  const tsaNames = get("STARDRAW_TSA") ?? DEFAULT_TSA_NAMES.join(",");
  let tsa: ServerConfig["tsa"] = null;
  if (tsaNames !== "off") {
    const authorities = tsaNames.split(",").map((name) => {
      const a = tsaByName(name.trim());
      if (!a)
        throw new Error(`열쇠를 고정해 두지 않은 시각 인증 기관: ${name}`);
      return a;
    });
    const minValid = Number(get("STARDRAW_TSA_MIN") ?? DEFAULT_TSA_MIN);
    if (
      !Number.isInteger(minValid) ||
      minValid < 1 ||
      minValid > authorities.length
    )
      throw new Error(
        `STARDRAW_TSA_MIN은 1 이상 ${authorities.length} 이하: ${minValid}`,
      );
    tsa = { authorities, minValid };
  }
  const rekorUrl = get("STARDRAW_REKOR_URL");
  if (rekorUrl && tsa)
    throw new Error("Rekor를 쓰려면 시각 인증을 끈다(STARDRAW_TSA=off)");
  let rekor: ServerConfig["rekor"] = null;
  if (rekorUrl) {
    const log = rekorLogFor(rekorUrl);
    if (!log)
      throw new Error(`공개 열쇠를 고정해 두지 않은 Rekor 주소: ${rekorUrl}`);
    rekor = { url: log.url };
  }
  const repo = get("STARDRAW_ANCHOR_REPO");
  const token = get("STARDRAW_ANCHOR_TOKEN");
  return { tsa, rekor, github: repo && token ? { repo, token } : null };
}
