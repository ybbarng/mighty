import {
  anchorBranch,
  anchorFile,
  anchorPath,
  ByteWriter,
  closeRound,
  concat,
  drandRoundForClose,
  equalBytes,
  FLAG_UP,
  FLAG_UV,
  GENESIS_ANCHOR_BRANCH,
  GENESIS_ANCHOR_PATH,
  genesisAnchorFile,
  genesisHash,
  githubAnchorVerifier,
  githubGenesisVerifier,
  leafHash,
  ledgerId,
  nodeHash,
  p1363ToDer,
  type RoundRecord,
  rawPublicKeyFromSpki,
  recordHash,
  roundTimes,
  type Schedule,
  sha256,
  taggedHash,
  ticketId,
  toBase64Url,
  toHex,
  utf8,
  type WebAuthnAssertion,
} from "@mighty/stardraw-core";

/**
 * 보안 배우기(/stardraw/learn)의 계산. 규칙은 모두 `@mighty/stardraw-core`가 하고, 여기는 체험에 필요한
 * 재료(흉내 패스키, 연습 응모권 목록, 짧은 장부, 앵커 저장소 흉내)와 그림에 쓸 모양만 만든다.
 */

export const SITE = "game.byb.kr";
export const SITE_ORIGIN = `https://${SITE}`;
export const ANCHOR_REPO = "ybbarng/stardraw-ledger";

/** 짧게 보이는 hex */
export function short(bytes: Uint8Array, n = 8): string {
  return toHex(bytes).slice(0, n);
}

// ── 패스키 흉내 ──

/**
 * 흉내 패스키. 실제 패스키처럼 비밀 열쇠는 꺼낼 수 없는 WebCrypto 열쇠(extractable=false)이고,
 * 만들 때 사이트 주소(rpId)에 묶인다. 서명 모양은 브라우저가 돌려주는 WebAuthn 단언과 같다.
 */
export interface DemoPasskey {
  rpId: string;
  publicKey: Uint8Array;
  privateKey: CryptoKey;
  signCount: number;
}

export async function createDemoPasskey(rpId = SITE): Promise<DemoPasskey> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(
    await crypto.subtle.exportKey("spki", pair.publicKey),
  );
  return {
    rpId,
    publicKey: rawPublicKeyFromSpki(spki),
    privateKey: pair.privateKey,
    signCount: 0,
  };
}

/** 비밀 열쇠를 꺼내 보려 한다. 꺼낼 수 없으면 브라우저가 낸 오류 이름 */
export async function tryExportPrivateKey(key: CryptoKey): Promise<string> {
  try {
    await crypto.subtle.exportKey("pkcs8", key);
    return "꺼냈다";
  } catch (err) {
    return err instanceof Error ? err.name || err.message : String(err);
  }
}

/** 브라우저 규칙: 주소의 호스트가 rpId이거나 그 아래 주소일 때만 그 rpId의 패스키를 쓸 수 있다 */
export function rpIdAllowed(origin: string, rpId: string): boolean {
  const host = new URL(origin).hostname;
  return host === rpId || host.endsWith(`.${rpId}`);
}

/**
 * 흉내 인증기의 서명(WebAuthn 단언).
 * authenticatorData = SHA-256(rpId) ‖ flags ‖ signCount, clientDataJSON = {type, challenge, origin, crossOrigin},
 * 서명 = authenticatorData ‖ SHA-256(clientDataJSON)에 대한 ES256(DER)
 */
export async function demoAssertion(
  passkey: DemoPasskey,
  challenge: Uint8Array,
  where: { origin: string; rpId: string; userVerified?: boolean },
): Promise<WebAuthnAssertion> {
  passkey.signCount++;
  // 진짜 패스키는 화면이 `userVerification: "required"`로 부르므로 UP(0x01)·UV(0x04)가 함께 켜진다.
  // 본인 확인을 건너뛴 흉내는 UP만 켠다
  const authenticatorData = concat(
    sha256(utf8(where.rpId)),
    new Uint8Array([
      where.userVerified === false ? FLAG_UP : FLAG_UP | FLAG_UV,
    ]),
    new ByteWriter().u32(passkey.signCount).done(),
  );
  const clientDataJSON = utf8(
    JSON.stringify({
      type: "webauthn.get",
      challenge: toBase64Url(challenge),
      origin: where.origin,
      crossOrigin: false,
    }),
  );
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      passkey.privateKey,
      new Uint8Array(concat(authenticatorData, sha256(clientDataJSON))),
    ),
  );
  return { authenticatorData, clientDataJSON, signature: p1363ToDer(raw) };
}

/** 패스키 서명에서 사람이 볼 만한 것: 주소, 사이트 해시가 이 사이트 것인지, 눌렀는지, 본인 확인을 했는지 */
export function readAssertion(a: WebAuthnAssertion): {
  origin: string;
  challenge: string;
  rpIdMatches: boolean;
  userPresent: boolean;
  userVerified: boolean;
} {
  const data = JSON.parse(new TextDecoder().decode(a.clientDataJSON)) as {
    origin: string;
    challenge: string;
  };
  return {
    origin: data.origin,
    challenge: data.challenge,
    rpIdMatches: equalBytes(
      a.authenticatorData.slice(0, 32),
      sha256(utf8(SITE)),
    ),
    userPresent: ((a.authenticatorData[32] ?? 0) & FLAG_UP) === FLAG_UP,
    userVerified: ((a.authenticatorData[32] ?? 0) & FLAG_UV) === FLAG_UV,
  };
}

// ── 응모권 바이트 ──

/** 응모권 앞부분(80바이트)의 칸: 이름과 바이트 범위 */
export const BODY_FIELDS = [
  { key: "v", label: "판", from: 0, to: 1 },
  { key: "round", label: "회차", from: 1, to: 5 },
  { key: "numbers", label: "번호", from: 5, to: 11 },
  { key: "pub", label: "공개 열쇠", from: 11, to: 76 },
  { key: "nonce", label: "작업 증명 n", from: 76, to: 80 },
] as const;

/** 번호 하나를 아직 없는 다음 번호로 바꾼다(오름차순 유지) */
export function bumpNumber(
  numbers: readonly number[],
  index: number,
): number[] {
  const out = [...numbers];
  let n = out[index] as number;
  do n = (n % 45) + 1;
  while (out.includes(n));
  out[index] = n;
  return out.sort((a, b) => a - b);
}

// ── 머클 나무 ──

/** 연습 응모권: 이름에서 정해지는 공개 열쇠 흉내(65바이트). id 계산만 하므로 실제 곡선 위 점일 필요는 없다 */
export function practicePub(name: string): Uint8Array {
  return concat(
    new Uint8Array([4]),
    sha256(utf8(`learn pub ${name}`)),
    sha256(utf8(`learn pub2 ${name}`)),
  );
}

export interface Entry {
  name: string;
  numbers: number[];
}

export const MERKLE_ENTRIES: readonly Entry[] = [
  { name: "나", numbers: [3, 7, 12, 21, 33, 41] },
  { name: "민지", numbers: [1, 8, 15, 22, 29, 36] },
  { name: "준호", numbers: [2, 9, 17, 24, 38, 45] },
  { name: "서연", numbers: [4, 11, 19, 26, 31, 40] },
  { name: "도윤", numbers: [5, 6, 13, 27, 34, 43] },
  { name: "하은", numbers: [10, 14, 18, 25, 30, 44] },
  { name: "지우", numbers: [16, 20, 23, 28, 35, 42] },
  { name: "시우", numbers: [1, 5, 9, 32, 37, 39] },
];

export function entryTicketId(e: Entry, round = 12): Uint8Array {
  return ticketId({
    v: 1,
    round,
    numbers: e.numbers,
    pub: practicePub(e.name),
    nonce: 0,
  });
}

/** 그림용 머클 나무(RFC 6962와 같은 나누기). 잎은 정렬한 차례 번호를 갖는다 */
export interface TreeNode {
  hash: Uint8Array;
  /** 이 마디가 덮는 잎 범위 [lo, hi) */
  lo: number;
  hi: number;
  /** 잎에서 잰 높이(잎 0) */
  height: number;
  left?: TreeNode;
  right?: TreeNode;
}

export function buildTree(leaves: readonly Uint8Array[]): TreeNode | null {
  if (leaves.length === 0) return null;
  const build = (lo: number, hi: number): TreeNode => {
    if (hi - lo === 1)
      return { hash: leafHash(leaves[lo] as Uint8Array), lo, hi, height: 0 };
    let k = 1;
    while (k * 2 < hi - lo) k *= 2;
    const left = build(lo, lo + k);
    const right = build(lo + k, hi);
    return {
      hash: nodeHash(left.hash, right.hash),
      lo,
      hi,
      height: Math.max(left.height, right.height) + 1,
      left,
      right,
    };
  };
  return build(0, leaves.length);
}

/** 나무의 모든 마디(그리기용) */
export function treeNodes(root: TreeNode | null): TreeNode[] {
  if (!root) return [];
  return [
    root,
    ...treeNodes(root.left ?? null),
    ...treeNodes(root.right ?? null),
  ];
}

/** 잎 index의 길(뿌리까지 지나는 마디)과 증명에 쓰이는 형제 마디 */
export function proofNodes(
  root: TreeNode | null,
  index: number,
): { path: TreeNode[]; siblings: TreeNode[] } {
  const path: TreeNode[] = [];
  const siblings: TreeNode[] = [];
  let node = root;
  while (node) {
    path.push(node);
    if (!node.left || !node.right) break;
    const goLeft = index < node.left.hi;
    siblings.push(goLeft ? node.right : node.left);
    node = goLeft ? node.left : node.right;
  }
  return { path, siblings };
}

// ── 짧은 장부와 앵커 저장소 흉내 ──

/** drand 값 흉내(48바이트). 사슬 체험은 해시 잇기만 보므로 BLS 서명 확인은 6단계에서 실제 값으로 한다 */
export function demoBeaconSignature(round: number): Uint8Array {
  const a = sha256(utf8(`learn drand ${round}`));
  return concat(a, a.slice(0, 16));
}

/** 1시간 회차, 시험 단계로 시작하는 서버 장부 모양의 일정표 */
export function chainSchedule(epoch: number): Schedule {
  return {
    epoch,
    entries: [
      {
        fromRound: 1,
        length: 3600,
        closeMargin: 5,
        powTarget: 143165576,
        registerPowTarget: 7158278,
        phase: "trial",
      },
    ],
  };
}

/** 2026-10-30 09:55 KST가 1회차 마감인 epoch(정각 추첨에 맞춘 값) */
export const CHAIN_EPOCH = 1793321700;

/** 응모권 없는 회차 기록 count개를 규칙(closeRound)대로 잇는다 */
export function buildChain(genesis: Schedule, count: number): RoundRecord[] {
  const out: RoundRecord[] = [];
  let prev = genesisHash(genesis);
  for (let round = 1; round <= count; round++) {
    const { closesAt } = roundTimes(genesis, round);
    const drandRound = drandRoundForClose(closesAt);
    const record = closeRound({
      schedule: genesis,
      round,
      prev,
      tickets: [],
      rootLoggedAt: closesAt + 60,
      beacon: { round: drandRound, signature: demoBeaconSignature(drandRound) },
    });
    out.push(record);
    prev = recordHash(record);
  }
  return out;
}

/** 앵커 저장소 흉내: "브랜치/경로" → 파일 본문 */
export type AnchorRepo = Map<string, string>;

/** 서버가 하는 대로 genesis.txt와 회차 파일을 남긴다 */
export function anchorRepoFor(
  genesis: Schedule,
  records: readonly RoundRecord[],
  repo: AnchorRepo = new Map(),
): AnchorRepo {
  const genesisKey = `${GENESIS_ANCHOR_BRANCH}/${GENESIS_ANCHOR_PATH}`;
  // 처음 일정표 파일은 한 번만 남기고 덮어쓰지 않는다
  if (!repo.has(genesisKey)) repo.set(genesisKey, genesisAnchorFile(genesis));
  writeRoundAnchors(genesis, records, repo);
  return repo;
}

/** 회차 파일을 (다시) 쓴다. 운영자가 강제 push로 고쳐 쓰는 것도 이것이다 */
export function writeRoundAnchors(
  genesis: Schedule,
  records: readonly RoundRecord[],
  repo: AnchorRepo,
): void {
  const ledger = ledgerId(genesis);
  for (const r of records) {
    repo.set(
      `${anchorBranch(genesis, r.round)}/${anchorPath(ledger, r.round)}`,
      anchorFile({
        ledger,
        round: r.round,
        record: toHex(recordHash(r)),
        seal: "-",
      }),
    );
  }
}

/** raw.githubusercontent.com 대신 흉내 저장소를 읽는 fetch(core의 앵커 확인 함수에 그대로 넣는다) */
export function repoFetch(repo: AnchorRepo): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const key = String(input).replace(
      /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\//,
      "",
    );
    const text = repo.get(key);
    return text === undefined
      ? new Response("", { status: 404 })
      : new Response(text, { status: 200 });
  }) as typeof fetch;
}

/** 기록 하나의 당첨 번호를 바꾼다(해시는 다시 계산된다) */
export function tamperRecord(record: RoundRecord): RoundRecord {
  return { ...record, numbers: bumpNumber(record.numbers, 0) };
}

/** from 번째 기록 뒤의 prev를 다시 이어 붙인다(운영자가 고친 뒤 사슬을 다시 맞추는 것) */
export function relink(
  genesis: Schedule,
  records: readonly RoundRecord[],
): RoundRecord[] {
  const out: RoundRecord[] = [];
  let prev = genesisHash(genesis);
  for (const r of records) {
    const next = { ...r, prev };
    out.push(next);
    prev = recordHash(next);
  }
  return out;
}

export interface ChainCheck {
  /** 회차마다: 앞 기록 해시와 이어지는지, 앵커와 같은지(null 앵커 없음) */
  rounds: { round: number; linked: boolean; anchored: boolean | null }[];
  /** 처음 일정표가 앵커의 genesis.txt와 같은지 */
  genesisAnchored: boolean | null;
  head: Uint8Array;
}

/** 사슬 잇기와 앵커를 core의 확인 함수(githubAnchorVerifier·githubGenesisVerifier)로 본다 */
export async function checkChain(
  genesis: Schedule,
  records: readonly RoundRecord[],
  repo: AnchorRepo,
): Promise<ChainCheck> {
  const fetchFn = repoFetch(repo);
  const anchored = githubAnchorVerifier({
    repo: ANCHOR_REPO,
    genesis,
    fetchFn,
  });
  const genesisAnchored = await githubGenesisVerifier({
    repo: ANCHOR_REPO,
    fetchFn,
  })(genesis);
  let prev = genesisHash(genesis);
  const rounds: ChainCheck["rounds"] = [];
  for (const r of records) {
    rounds.push({
      round: r.round,
      linked: equalBytes(r.prev, prev),
      anchored: await anchored(r, genesis),
    });
    prev = recordHash(r);
  }
  return { rounds, genesisAnchored, head: prev };
}

// ── 당첨 번호 뽑기 따라가기 ──

export interface DrawStep {
  block: number;
  byte: number;
  /** 버림(225 이상), 이미 나옴, 뽑힘 */
  result: "reject" | "dup" | "pick";
  n: number | null;
}

/**
 * drawNumbers가 바이트를 읽는 차례를 그대로 따라간다(화면에 보이려고). 결과 차례는 화면이
 * core의 drawNumbers와 같은지 다시 맞춰 본다.
 */
export function traceDraw(seed: Uint8Array): DrawStep[] {
  const steps: DrawStep[] = [];
  const picked: number[] = [];
  for (let i = 0; picked.length < 7; i++) {
    const block = taggedHash(
      "stardraw/draw/v1",
      seed,
      new ByteWriter().u32(i).done(),
    );
    for (const b of block) {
      if (b >= 225) {
        steps.push({ block: i, byte: b, result: "reject", n: null });
        continue;
      }
      const n = (b % 45) + 1;
      if (picked.includes(n)) {
        steps.push({ block: i, byte: b, result: "dup", n });
        continue;
      }
      picked.push(n);
      steps.push({ block: i, byte: b, result: "pick", n });
      if (picked.length === 7) break;
    }
  }
  return steps;
}

// ── TSA 토큰 ──

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** 초 → "20261030015112"(GeneralizedTime 앞 14자리, UTC) */
export function generalizedDigits(seconds: number): string {
  return new Date(seconds * 1000)
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
}

/**
 * 토큰 안 기관이 찍은 시각 글자의 마지막 자리(초)를 바꾼다. 운영자가 시각을 고쳐 보는 흉내.
 * 찾지 못하면 null
 */
export function shiftTokenTime(
  token: Uint8Array,
  genTime: number,
): Uint8Array | null {
  const digits = utf8(generalizedDigits(genTime));
  for (let i = 0; i + digits.length <= token.length; i++) {
    let same = true;
    for (let k = 0; k < digits.length; k++)
      if (token[i + k] !== digits[k]) {
        same = false;
        break;
      }
    if (!same) continue;
    const out = token.slice();
    const at = i + digits.length - 1;
    // 초의 끝자리를 하나 앞당긴다(0이면 9로): 더 이른 시각인 척
    out[at] = (out[at] as number) === 0x30 ? 0x39 : (out[at] as number) - 1;
    return out;
  }
  return null;
}

/** 시각(초) → 한국 시각 "2026-10-30 10:51:12" */
export function kst(seconds: number): string {
  return new Date((seconds + 9 * 3600) * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

/** 내 응모권 id가 들어 있는지(그림의 잎 표시용) */
export function indexOfId(ids: readonly Uint8Array[], id: Uint8Array): number {
  return ids.findIndex((x) => equalBytes(x, id));
}
