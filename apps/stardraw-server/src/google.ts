import { fromBase64Url } from "@mighty/stardraw-core";

/**
 * 구글 로그인 ID 토큰 확인(docs/36 11-13, 기관 계정으로 상품 자격 받기).
 * 화면이 Google Identity Services로 받은 ID 토큰(JWT, RS256)을 그대로 보낸다. 서버는 구글 공개 열쇠(JWKS)로
 * 서명을 확인하고 iss·aud·exp·email_verified를 본다. 화면이 보낸 다른 값(이메일·도메인)은 믿지 않는다.
 * 클라이언트 보안 비밀은 쓰지 않는다(ID 토큰만 받는다).
 */

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  /** Workspace 도메인. 개인 계정이면 null */
  hd: string | null;
}

export type GoogleTokenVerifier = (token: string) => Promise<GoogleIdentity>;

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
/** 시계 차이 허용(초) */
const SKEW = 60;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

/** 확인할 수 없는 토큰. 화면에 그대로 보이는 문장 */
export class GoogleTokenError extends Error {}

const decoder = new TextDecoder();

function part(text: string | undefined): Record<string, unknown> {
  if (!text) throw new GoogleTokenError("구글 로그인 결과 형식이 아닙니다");
  try {
    return JSON.parse(decoder.decode(fromBase64Url(text)));
  } catch {
    throw new GoogleTokenError("구글 로그인 결과 형식이 아닙니다");
  }
}

/**
 * 구글 공개 열쇠를 받아 두고(1시간) ID 토큰을 확인한다. 모르는 kid가 오면 한 번 새로 받는다(열쇠가 바뀐 때)
 */
export function googleTokenVerifier(
  clientId: string,
  options: {
    fetch?: typeof fetch;
    now?: () => number;
    jwksUrl?: string;
  } = {},
): GoogleTokenVerifier {
  const get = options.fetch ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const url = options.jwksUrl ?? GOOGLE_JWKS_URL;
  let keys: Jwk[] = [];
  let fetchedAt = 0;

  const load = async (): Promise<void> => {
    const res = await get(url);
    if (!res.ok) throw new GoogleTokenError("구글 공개 열쇠를 받지 못했습니다");
    const body = (await res.json()) as { keys?: Jwk[] };
    keys = body.keys ?? [];
    fetchedAt = now();
  };

  return async (token) => {
    if (!clientId) throw new GoogleTokenError("구글 로그인을 준비 중입니다");
    const [h, p, s, extra] = token.split(".");
    if (extra !== undefined || !s)
      throw new GoogleTokenError("구글 로그인 결과 형식이 아닙니다");
    const header = part(h);
    const payload = part(p);
    if (header.alg !== "RS256" || typeof header.kid !== "string")
      throw new GoogleTokenError("구글 로그인 결과 형식이 아닙니다");
    if (now() - fetchedAt > 3600 || !keys.some((k) => k.kid === header.kid))
      await load();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) throw new GoogleTokenError("구글 서명 열쇠를 찾지 못했습니다");
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      new Uint8Array(fromBase64Url(s)),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!ok) throw new GoogleTokenError("구글 서명이 맞지 않습니다");
    if (!ISSUERS.includes(String(payload.iss)))
      throw new GoogleTokenError("구글이 만든 로그인 결과가 아닙니다");
    if (payload.aud !== clientId)
      throw new GoogleTokenError("다른 앱의 로그인 결과입니다");
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp + SKEW < now())
      throw new GoogleTokenError("로그인이 만료됐습니다. 다시 로그인해 주세요");
    if (typeof payload.email !== "string")
      throw new GoogleTokenError("이메일이 없는 로그인 결과입니다");
    return {
      email: payload.email,
      emailVerified: payload.email_verified === true,
      hd: typeof payload.hd === "string" ? payload.hd : null,
    };
  };
}
