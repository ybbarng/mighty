import {
  type BeaconVerifier,
  type DrandBeacon,
  fromHex,
  QUICKNET,
  randomnessMatches,
  type Signer,
  sha256,
  toHex,
  verifyQuicknetBeacon,
} from "@mighty/stardraw-core";

/**
 * 서버 밖과 닿는 세 가지: drand 공개 난수, 투명성 로그(봉인 값의 시각 증명), GitHub 앵커.
 * 모두 인터페이스로 나눠 시험은 가짜를, 운영은 실제 구현을 넣는다. 설정이 없으면 실제 구현은 꺼진다.
 */

// ── drand ──

export interface DrandSource {
  /** 정해진 회차 값. 아직 안 나왔거나 받지 못하면 null(다음에 다시 묻는다) */
  get(round: number): Promise<DrandBeacon | null>;
}

/** drand HTTP 중계 여러 곳을 차례로 묻는다. 서명은 규칙의 quicknet 공개 열쇠로 직접 확인한다 */
export class HttpDrand implements DrandSource {
  constructor(
    private readonly urls: readonly string[],
    private readonly verify: BeaconVerifier = verifyQuicknetBeacon,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async get(round: number): Promise<DrandBeacon | null> {
    for (const base of this.urls) {
      try {
        const res = await this.fetchFn(
          `${base}/${QUICKNET.hash}/public/${round}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) continue;
        const body = (await res.json()) as {
          round: number;
          signature: string;
          randomness: string;
        };
        const beacon = {
          round: body.round,
          signature: fromHex(body.signature),
        };
        if (beacon.round !== round) continue;
        if (!randomnessMatches(beacon, fromHex(body.randomness))) continue;
        if (!this.verify(beacon)) continue;
        return beacon;
      } catch {
        // 다음 중계로
      }
    }
    return null;
  }
}

// ── 투명성 로그 ──

export interface LogResult {
  /** 로그가 찍은 시각(초) */
  loggedAt: number;
  /** 검사기가 다시 확인할 증거 */
  proof: unknown;
}

export interface RootLog {
  /** 봉인 값을 올린다. 실패하면 null(기한 안이면 다시 시도) */
  log(digest: Uint8Array): Promise<LogResult | null>;
}

/** 가짜 로그: 지금 시각을 적는다(시험·로컬 개발). 시각 증명이 없다는 것을 장부에 남긴다 */
export class LocalRootLog implements RootLog {
  constructor(private readonly nowSeconds: () => number) {}
  async log(digest: Uint8Array): Promise<LogResult> {
    return {
      loggedAt: this.nowSeconds(),
      proof: { kind: "local", digest: toHex(digest) },
    };
  }
}

/**
 * Sigstore Rekor(hashedrekord): 봉인 값(32바이트)을 서버 열쇠로 서명해 올리고, 로그가 찍은 integratedTime을 받는다.
 * 운영 전에 실제 Rekor에 한 번 올려 보고 확인해야 한다(아직 실제 등록은 하지 않았다).
 */
export class RekorRootLog implements RootLog {
  constructor(
    private readonly url: string,
    private readonly signer: Signer & {
      publicKeyPem: string;
      signDer(m: Uint8Array): Promise<Uint8Array>;
    },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async log(digest: Uint8Array): Promise<LogResult | null> {
    try {
      const signature = await this.signer.signDer(digest);
      const res = await this.fetchFn(`${this.url}/api/v1/log/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          apiVersion: "0.0.1",
          kind: "hashedrekord",
          spec: {
            data: {
              hash: { algorithm: "sha256", value: toHex(sha256(digest)) },
            },
            signature: {
              content: Buffer.from(signature).toString("base64"),
              publicKey: {
                content: Buffer.from(this.signer.publicKeyPem).toString(
                  "base64",
                ),
              },
            },
          },
        }),
      });
      if (res.status !== 201) return null;
      const body = (await res.json()) as Record<
        string,
        { integratedTime: number; logIndex: number; verification?: unknown }
      >;
      const [uuid, entry] = Object.entries(body)[0] ?? [];
      if (!uuid || !entry) return null;
      return {
        loggedAt: entry.integratedTime,
        proof: {
          kind: "rekor",
          url: this.url,
          uuid,
          logIndex: entry.logIndex,
          verification: entry.verification,
        },
      };
    } catch {
      return null;
    }
  }
}

// ── 앵커 ──

export interface Anchor {
  /** 회차 기록 해시를 바깥에 남긴다(실패해도 회차 진행은 멈추지 않는다) */
  anchor(round: number, recordHashHex: string): Promise<void>;
}

export const noAnchor: Anchor = { anchor: async () => undefined };

/** GitHub 앵커 저장소에 회차마다 한 줄 파일을 커밋한다(contents API) */
export class GitHubAnchor implements Anchor {
  constructor(
    private readonly repo: string,
    private readonly branch: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async anchor(round: number, recordHashHex: string): Promise<void> {
    const path = `rounds/${String(round).padStart(6, "0")}.txt`;
    const res = await this.fetchFn(
      `https://api.github.com/repos/${this.repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          message: `${round}회차 기록 해시`,
          branch: this.branch,
          content: Buffer.from(`${round} ${recordHashHex}\n`).toString(
            "base64",
          ),
        }),
      },
    );
    if (!res.ok && res.status !== 422)
      throw new Error(`앵커 실패: ${res.status}`);
  }
}
