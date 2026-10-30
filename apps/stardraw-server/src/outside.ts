import {
  type AnchorEntry,
  anchorCommitMessage,
  anchorFile,
  anchorPath,
  type BeaconVerifier,
  type DrandBeacon,
  fromHex,
  hashedRekordRequest,
  QUICKNET,
  type RekorLog,
  randomnessMatches,
  rekorLogFor,
  rekorProofFromResponse,
  type Signer,
  sealImprint,
  type TsaAuthority,
  type TsaProof,
  timestampRequest,
  toHex,
  tokenFromResponse,
  verifyQuicknetBeacon,
  verifyRekorEntry,
  verifyTimestampToken,
} from "@mighty/stardraw-core";

/**
 * 서버 밖과 닿는 세 가지: drand 공개 난수, 봉인 값의 시각 증명(공개 시각 인증 기관, 꺼 둔 선택지로 Rekor), GitHub 앵커.
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

// ── 봉인 시각 증명 ──

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
 * 받은 응답(본문·SET·포함 증명·체크포인트)은 검사기와 같은 규칙(`verifyRekorEntry`)으로 먼저 확인하고,
 * 맞을 때만 장부(seals/N)에 남긴다. 맞지 않거나 실패하면 null을 돌려 다음 번에 다시 올린다(기한을 넘기면 무효).
 * 로그는 core에 공개 열쇠를 박아 둔 것(시험용·실제)만 쓸 수 있다.
 */
export class RekorRootLog implements RootLog {
  private readonly rekor: RekorLog;

  /** urlOrLog: 운영은 주소(core에 고정한 로그만), 시험은 가짜 로그 정의를 직접 넘긴다 */
  constructor(
    urlOrLog: string | RekorLog,
    private readonly signer: Signer & {
      publicKeyPem: string;
      signDer(m: Uint8Array): Promise<Uint8Array>;
    },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    const log = typeof urlOrLog === "string" ? rekorLogFor(urlOrLog) : urlOrLog;
    if (!log)
      throw new Error(`공개 열쇠를 고정해 두지 않은 Rekor 주소: ${urlOrLog}`);
    this.rekor = log;
  }

  async log(digest: Uint8Array): Promise<LogResult | null> {
    try {
      const signature = await this.signer.signDer(digest);
      const res = await this.fetchFn(`${this.rekor.url}/api/v1/log/entries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify(
          hashedRekordRequest(digest, signature, this.signer.publicKeyPem),
        ),
      });
      if (res.status !== 201) {
        this.warn(`Rekor 등록 실패: HTTP ${res.status}`);
        return null;
      }
      const proof = rekorProofFromResponse(this.rekor.url, await res.json());
      if (!proof) {
        this.warn("Rekor 응답 모양이 틀리다");
        return null;
      }
      const check = await verifyRekorEntry(proof, {
        digest,
        serverPublicKey: this.signer.publicKey,
        logs: [this.rekor],
      });
      if (!check.ok) {
        this.warn(`Rekor 응답 확인 실패: ${check.problems.join(", ")}`);
        return null;
      }
      return { loggedAt: proof.integratedTime, proof };
    } catch (err) {
      this.warn(`Rekor 등록 오류: ${String(err)}`);
      return null;
    }
  }
}

/**
 * 공개 시각 인증 기관(RFC 3161) 여러 곳: SHA-256(봉인 값)을 동시에 보내 토큰을 받는다(docs/36 8-1 O1, 11-1).
 * 받은 토큰은 검사기와 같은 규칙(`verifyTimestampToken`)으로 먼저 확인해 맞는 것만 싣는다.
 * 서로 다른 기관 minValid곳 이상이 맞으면 성공이고, 봉인 시각은 그중 가장 이른 시각이다.
 * 모자라면 null을 돌려 다음 번에 모두에게 다시 묻는다(마감 3분 뒤까지 못 받으면 엔진이 무효로 닫는다).
 */
export class TsaRootLog implements RootLog {
  constructor(
    private readonly authorities: readonly TsaAuthority[],
    private readonly minValid: number,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly warn: (message: string) => void = () => undefined,
  ) {
    if (minValid < 1 || minValid > authorities.length)
      throw new Error(
        `시각 인증 최소 기관 수(${minValid})는 1 이상 ${authorities.length} 이하여야 한다`,
      );
  }

  async log(digest: Uint8Array): Promise<LogResult | null> {
    const imprint = sealImprint(digest);
    const request = timestampRequest(imprint);
    const got = (
      await Promise.all(
        this.authorities.map((a) => this.ask(a, request, imprint)),
      )
    ).filter((t) => t !== null);
    if (got.length < this.minValid) {
      this.warn(
        `시각 인증을 ${this.minValid}곳 이상 받지 못했다(${got.length}곳). 다시 시도한다`,
      );
      return null;
    }
    const proof: TsaProof = {
      kind: "tsa",
      tokens: got.map((t) => ({
        tsa: t.tsa,
        genTime: t.genTime,
        token: Buffer.from(t.token).toString("base64"),
      })),
    };
    return { loggedAt: Math.min(...got.map((t) => t.genTime)), proof };
  }

  private async ask(
    authority: TsaAuthority,
    request: Uint8Array,
    imprint: Uint8Array,
  ): Promise<{ tsa: string; genTime: number; token: Uint8Array } | null> {
    try {
      const res = await this.fetchFn(authority.url, {
        method: "POST",
        headers: { "content-type": "application/timestamp-query" },
        signal: AbortSignal.timeout(10000),
        body: request.slice().buffer,
      });
      if (!res.ok) {
        this.warn(`${authority.name} 시각 인증 실패: HTTP ${res.status}`);
        return null;
      }
      const token = tokenFromResponse(new Uint8Array(await res.arrayBuffer()));
      if (!token) {
        this.warn(`${authority.name} 시각 인증 거절 또는 응답 모양이 틀리다`);
        return null;
      }
      const check = await verifyTimestampToken(token, {
        imprint,
        authorities: [authority],
      });
      if (!check.ok) {
        this.warn(
          `${authority.name} 시각 인증 토큰 확인 실패: ${check.problems.join(", ")}`,
        );
        return null;
      }
      return { tsa: authority.name, genTime: check.genTime, token };
    } catch (err) {
      this.warn(`${authority.name} 시각 인증 오류: ${String(err)}`);
      return null;
    }
  }
}

// ── 앵커 ──

export interface Anchor {
  /** 회차 기록 해시를 바깥에 남긴다. 실패하면 던진다(엔진이 나중에 다시 시도하고, 회차 진행은 멈추지 않는다) */
  anchor(entry: AnchorEntry): Promise<void>;
}

export const noAnchor: Anchor = { anchor: async () => undefined };

/**
 * GitHub 앵커 저장소에 회차마다 파일 하나를 커밋한다(Contents API, core anchor.ts 형식).
 * 같은 경로에 파일이 이미 있으면(앞선 시도의 응답만 잃은 경우) 내용이 같을 때 성공으로 본다.
 * 내용이 다르면 던진다(장부와 앵커가 어긋난 것이라 사람이 봐야 한다). 토큰은 어디에도 찍지 않는다.
 */
export class GitHubAnchor implements Anchor {
  constructor(
    private readonly repo: string,
    private readonly branch: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async anchor(entry: AnchorEntry): Promise<void> {
    const path = anchorPath(entry.ledger, entry.round);
    const url = `https://api.github.com/repos/${this.repo}/contents/${path}`;
    const headers = {
      authorization: `Bearer ${this.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
    const text = anchorFile(entry);
    const res = await this.fetchFn(url, {
      method: "PUT",
      headers,
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        message: anchorCommitMessage(entry),
        branch: this.branch,
        content: Buffer.from(text).toString("base64"),
      }),
    });
    if (res.status === 200 || res.status === 201) return;
    // 이미 있으면 422(sha 없이 덮어쓰려 함). 내용을 읽어 같으면 성공
    if (res.status === 422 || res.status === 409) {
      const got = await this.fetchFn(
        `${url}?ref=${encodeURIComponent(this.branch)}`,
        { headers, signal: AbortSignal.timeout(10000) },
      );
      if (got.ok) {
        const body = (await got.json()) as { content?: string };
        const existing = Buffer.from(body.content ?? "", "base64").toString();
        if (existing === text) return;
        throw new Error(`앵커 파일이 이미 다른 내용으로 있다: ${path}`);
      }
    }
    throw new Error(`앵커 실패: HTTP ${res.status}`);
  }
}
