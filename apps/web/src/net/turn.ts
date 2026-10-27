/** 서버가 내주는 시간 제한 TURN 계정(byb.kr 서버의 coturn, 요청마다 새 계정) */
const TURN_CREDENTIALS_PATH = "/turn-credentials";
/** 계정을 이만큼 기다리고, 넘으면 TURN 없이 잇는다 */
const TURN_FETCH_TIMEOUT_MS = 3000;
/** 계정이 끝나기 이만큼 전부터는 다시 받는다 */
const TURN_RENEW_BEFORE_MS = 60 * 60 * 1000;

let turnCache: { config: RTCIceServer[]; until: number } | null = null;

/**
 * 기기끼리 바로 이어지지 않는 네트워크(회사·학교 방화벽 등)를 위한 TURN 중계 계정.
 * 정적 사이트라 계정을 번들에 넣지 않고, 방에 들어갈 때 같은 출처에서 받는다.
 * 못 받으면(개발 서버, 서버 장애) TURN 없이 잇는다.
 */
export async function turnConfig(): Promise<RTCIceServer[] | null> {
  if (turnCache && Date.now() < turnCache.until) return turnCache.config;
  try {
    const response = await fetch(TURN_CREDENTIALS_PATH, {
      cache: "no-store",
      signal: AbortSignal.timeout(TURN_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      username?: unknown;
      credential?: unknown;
      urls?: unknown;
      ttl?: unknown;
    };
    if (
      typeof body.username !== "string" ||
      typeof body.credential !== "string" ||
      !Array.isArray(body.urls) ||
      body.urls.length === 0 ||
      !body.urls.every((url) => typeof url === "string")
    )
      return null;
    const config = [
      { urls: body.urls, username: body.username, credential: body.credential },
    ];
    const ttlMs = typeof body.ttl === "number" ? body.ttl * 1000 : 0;
    turnCache = { config, until: Date.now() + ttlMs - TURN_RENEW_BEFORE_MS };
    return config;
  } catch {
    return null;
  }
}

/** 시험: 받아 둔 계정을 지운다 */
export function resetTurnCache(): void {
  turnCache = null;
}
