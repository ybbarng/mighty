import {
  type AnchorEntry,
  anchorCommitMessage,
  anchorFile,
  anchorPath,
  type BeaconVerifier,
  type DrandBeacon,
  fetchQuicknetBeacon,
  GENESIS_ANCHOR_BRANCH,
  GENESIS_ANCHOR_PATH,
  genesisAnchorCommitMessage,
  genesisAnchorFile,
  hashedRekordRequest,
  type RekorLog,
  rekorLogFor,
  rekorProofFromResponse,
  type Schedule,
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

  get(round: number): Promise<DrandBeacon | null> {
    return fetchQuicknetBeacon(round, {
      urls: this.urls,
      verify: this.verify,
      fetchFn: this.fetchFn,
    });
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
  /**
   * 봉인 값을 올린다. 실패하면 null(기한 안이면 다시 시도).
   * `lastChance`: 기한이 거의 다 됐다(엔진이 알려 준다). 그때는 최소 수를 못 채워도 받은 만큼으로 봉인할 수 있다(D8)
   */
  log(
    digest: Uint8Array,
    options?: { lastChance?: boolean },
  ): Promise<LogResult | null>;
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
 * 모자라면 null을 돌리고, 받은 토큰은 들고 있다가 모자란 기관에만 `retryMs`(기본 15초) 간격으로 다시 묻는다
 * (장애 때 기관에 요청을 몰아쳐 차단당하지 않게, D8). 기한이 거의 다 됐는데(`lastChance`) 한 곳이라도 받았으면
 * 그것으로 봉인한다: 검사 규칙은 한 곳이면 통과(「주의」로 표시)라, 한 기관 장애로 회차가 무효가 되는 일을 줄인다.
 * 마감 3분 뒤까지 한 곳도 못 받으면 엔진이 무효로 닫는다.
 */
export class TsaRootLog implements RootLog {
  constructor(
    private readonly authorities: readonly TsaAuthority[],
    private readonly minValid: number,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly warn: (message: string) => void = () => undefined,
    private readonly nowMs: () => number = () => Date.now(),
    private readonly retryMs = 15_000,
  ) {
    if (minValid < 1 || minValid > authorities.length)
      throw new Error(
        `시각 인증 최소 기관 수(${minValid})는 1 이상 ${authorities.length} 이하여야 한다`,
      );
  }

  /** 봉인 값마다 받은 토큰과 기관마다 마지막으로 물은 시각(봉인이 끝나면 그 값은 다시 오지 않는다) */
  private pending = new Map<
    string,
    {
      got: Map<string, { tsa: string; genTime: number; token: Uint8Array }>;
      asked: Map<string, number>;
    }
  >();

  async log(
    digest: Uint8Array,
    options: { lastChance?: boolean } = {},
  ): Promise<LogResult | null> {
    const key = toHex(digest);
    // 지난 봉인 값은 잊는다(같은 때 봉인하는 회차는 하나뿐이다)
    for (const k of this.pending.keys()) if (k !== key) this.pending.delete(k);
    let state = this.pending.get(key);
    if (!state) {
      state = { got: new Map(), asked: new Map() };
      this.pending.set(key, state);
    }
    const imprint = sealImprint(digest);
    const request = timestampRequest(imprint);
    const now = this.nowMs();
    const due = this.authorities.filter(
      (a) =>
        !state.got.has(a.name) &&
        now - (state.asked.get(a.name) ?? -Infinity) >= this.retryMs,
    );
    for (const a of due) state.asked.set(a.name, now);
    for (const t of await Promise.all(
      due.map((a) => this.ask(a, request, imprint)),
    ))
      if (t) state.got.set(t.tsa, t);
    const got = [...state.got.values()];
    const enough =
      got.length >= this.minValid || (options.lastChance && got.length >= 1);
    if (!enough) {
      if (due.length > 0)
        this.warn(
          `시각 인증을 ${this.minValid}곳 이상 받지 못했다(${got.length}곳). 모자란 곳에 다시 묻는다`,
        );
      return null;
    }
    if (got.length < this.minValid)
      this.warn(
        `기한이 다 돼 시각 인증 ${got.length}곳으로 봉인한다(최소 ${this.minValid}곳, 검사에서 「주의」)`,
      );
    this.pending.delete(key);
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

/** 앵커 저장소에 올릴 파일 하나(path는 저장소 안 경로) */
export interface RepoFile {
  path: string;
  text: string;
}

export interface Anchor {
  /**
   * 회차 기록 해시를 바깥에 남긴다(브랜치는 회차의 단계로: 시험 trial, 정식 main).
   * files를 주면 그 회차의 장부 JSON 사본을 같은 커밋에 함께 올린다(docs/36 11-16).
   * 실패하면 던진다(엔진이 나중에 다시 시도하고, 회차 진행은 멈추지 않는다)
   */
  anchor(
    entry: AnchorEntry,
    branch: string,
    files?: readonly RepoFile[],
  ): Promise<void>;
  /** 장부를 처음 만들 때 처음 일정표를 main의 genesis.txt로 남긴다. 다른 장부가 이미 있으면 던진다 */
  anchorGenesis(genesis: Schedule): Promise<void>;
  /** 지난 회차의 장부 JSON 사본을 커밋 하나로 올린다(이미 같은 내용이면 커밋하지 않는다). 실패하면 던진다 */
  mirror(
    branch: string,
    files: readonly RepoFile[],
    message: string,
  ): Promise<void>;
  /**
   * 추첨 전 봉인 사본(docs/36 11-20)을 커밋 하나로 올린다. 같은 내용이 이미 있으면 그대로, 다른 내용이 있으면 던진다
   * (한 번 올린 추첨 전 사본은 고치지 않는다)
   */
  earlySeal(branch: string, file: RepoFile, message: string): Promise<void>;
}

export const noAnchor: Anchor = {
  anchor: async () => undefined,
  anchorGenesis: async () => undefined,
  mirror: async () => undefined,
  earlySeal: async () => undefined,
};

/**
 * GitHub 앵커 저장소에 회차마다 커밋 하나를 남긴다(core anchor.ts 형식).
 * - 앵커 파일만 올릴 때는 Contents API 한 번. 같은 경로에 파일이 이미 있으면(앞선 시도의 응답만 잃은 경우)
 *   내용이 같을 때 성공으로 본다. 내용이 다르면 던진다(장부와 앵커가 어긋난 것이라 사람이 봐야 한다)
 * - 장부 JSON 사본을 함께 올릴 때는 git tree/commit API로 여러 파일을 커밋 하나에 담는다
 *   (앵커 파일 확인, 브랜치 끝, 트리, 커밋, 브랜치 옮기기: 5번). 앵커 파일이 이미 같은 내용으로 있으면
 *   사본도 같은 커밋에 들어간 것이라 성공으로 본다. 브랜치가 없으면 main 끝에서 만든다.
 * 토큰은 어디에도 찍지 않는다.
 */
export class GitHubAnchor implements Anchor {
  private readonly api: string;
  private readonly headers: Record<string, string>;

  constructor(
    repo: string,
    token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.api = `https://api.github.com/repos/${repo}`;
    this.headers = {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
  }

  async anchor(
    entry: AnchorEntry,
    branch: string,
    files: readonly RepoFile[] = [],
  ): Promise<void> {
    const path = anchorPath(entry.ledger, entry.round);
    const text = anchorFile(entry);
    const message = anchorCommitMessage(entry);
    if (files.length === 0) {
      await this.put(path, branch, text, message);
      return;
    }
    const existing = await this.getText(path, branch);
    if (existing !== null) {
      if (existing === text) return;
      throw new Error(`앵커 파일이 이미 다른 내용으로 있다: ${branch}/${path}`);
    }
    await this.commit(branch, [{ path, text }, ...files], message);
  }

  async anchorGenesis(genesis: Schedule): Promise<void> {
    await this.put(
      GENESIS_ANCHOR_PATH,
      GENESIS_ANCHOR_BRANCH,
      genesisAnchorFile(genesis),
      genesisAnchorCommitMessage(genesis),
    );
  }

  async mirror(
    branch: string,
    files: readonly RepoFile[],
    message: string,
  ): Promise<void> {
    if (files.length > 0) await this.commit(branch, files, message);
  }

  async earlySeal(
    branch: string,
    file: RepoFile,
    message: string,
  ): Promise<void> {
    const existing = await this.getText(file.path, branch);
    if (existing !== null) {
      if (existing === file.text) return;
      throw new Error(
        `추첨 전 봉인 사본이 이미 다른 내용으로 있다: ${branch}/${file.path}`,
      );
    }
    await this.commit(branch, [file], message);
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return this.fetchFn(`${this.api}${path}`, {
      method,
      headers: this.headers,
      // 지난 회차를 채우는 트리는 수 MB일 수 있다
      signal: AbortSignal.timeout(body === undefined ? 10000 : 60000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async json<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.call(method, path, body);
    if (!res.ok)
      throw new Error(`앵커 실패: ${method} ${path} HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Contents API로 파일 하나를 읽는다. 없으면 null */
  private async getText(path: string, branch: string): Promise<string | null> {
    const res = await this.call(
      "GET",
      `/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`앵커 실패: ${path} 읽기 HTTP ${res.status}`);
    const body = (await res.json()) as { content?: string };
    return Buffer.from(body.content ?? "", "base64").toString();
  }

  /** 브랜치 끝 커밋과 그 트리. 브랜치가 없으면 null */
  private async branchHead(
    branch: string,
  ): Promise<{ sha: string; tree: string } | null> {
    const res = await this.call(
      "GET",
      `/branches/${encodeURIComponent(branch)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok)
      throw new Error(`앵커 실패: ${branch} 브랜치 읽기 HTTP ${res.status}`);
    const body = (await res.json()) as {
      commit: { sha: string; commit: { tree: { sha: string } } };
    };
    return { sha: body.commit.sha, tree: body.commit.commit.tree.sha };
  }

  /** 여러 파일을 커밋 하나로(git tree/commit API). 바뀐 것이 없으면 커밋하지 않는다 */
  private async commit(
    branch: string,
    files: readonly RepoFile[],
    message: string,
  ): Promise<void> {
    let base = await this.branchHead(branch);
    const create = base === null;
    if (!base) base = await this.branchHead(GENESIS_ANCHOR_BRANCH);
    if (!base)
      throw new Error(`앵커 저장소에 ${GENESIS_ANCHOR_BRANCH} 브랜치가 없다`);
    const tree = await this.json<{ sha: string }>("POST", "/git/trees", {
      base_tree: base.tree,
      tree: files.map((f) => ({
        path: f.path,
        mode: "100644",
        type: "blob",
        content: f.text,
      })),
    });
    if (tree.sha === base.tree && !create) return; // 이미 모두 같은 내용
    const commit = await this.json<{ sha: string }>("POST", "/git/commits", {
      message,
      tree: tree.sha,
      parents: [base.sha],
    });
    if (create)
      await this.json("POST", "/git/refs", {
        ref: `refs/heads/${branch}`,
        sha: commit.sha,
      });
    else
      await this.json("PATCH", `/git/refs/heads/${branch}`, {
        sha: commit.sha,
        force: false,
      });
  }

  private async put(
    path: string,
    branch: string,
    text: string,
    message: string,
  ): Promise<void> {
    const res = await this.call("PUT", `/contents/${path}`, {
      message,
      branch,
      content: Buffer.from(text).toString("base64"),
    });
    if (res.status === 200 || res.status === 201) return;
    // 이미 있으면 422(sha 없이 덮어쓰려 함). 내용을 읽어 같으면 성공
    if (res.status === 422 || res.status === 409) {
      const existing = await this.getText(path, branch);
      if (existing === text) return;
      if (existing !== null)
        throw new Error(
          `앵커 파일이 이미 다른 내용으로 있다: ${branch}/${path}`,
        );
    }
    throw new Error(`앵커 실패: HTTP ${res.status}`);
  }
}
