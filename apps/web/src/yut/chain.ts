import {
  type Action,
  chainCommit,
  chainLink,
  derivedSeed,
  type YutView,
} from "@mighty/yut-engine";

/**
 * 내 던지기 사슬 씨앗(docs/37 5절). 온라인에서는 이 기기에만 두고 방장 엔진에는 약속(x_0)만 간다.
 * 던질 때마다 이 기기가 다음 고리를 자동으로 공개한다. 혼자 하기는 자리 재료(시드)로 만든 씨앗을 쓴다
 */

/** 세대(사슬을 다 써서 다시 약속한 횟수) → 그 세대 내 씨앗 */
export type SeedBook = Record<number, string>;

/** 씨앗 32바이트(브라우저의 안전한 난수) */
export function newSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 같은 씨앗의 약속을 다시 계산하지 않게(사슬 600번 해시) 기억해 둔다 */
const commitCache = new Map<string, string>();

function commitOf(seed: string): string {
  let commit = commitCache.get(seed);
  if (!commit) {
    commit = chainCommit(seed);
    commitCache.set(seed, commit);
  }
  return commit;
}

/**
 * 이번 세대 내 씨앗. 이 기기에 남긴 것 가운데 약속과 맞는 것을 쓴다. 없으면 끊긴 사이 컴퓨터가 내 자리 재료로
 * 대신 약속한 사슬인지 본다. 둘 다 아니면(다른 기기에서 약속했다 등) null
 */
export function mySeed(view: YutView, book: SeedBook): string | null {
  const commit = view.chains[view.mySeat]?.commit ?? null;
  const kept = book[view.generation];
  if (!commit) return kept ?? null;
  if (kept && commitOf(kept) === commit) return kept;
  const derived = derivedSeed(view.botKey, view.generation);
  if (commitOf(derived) === commit) return derived;
  return null;
}

/** 이 사슬 씨앗으로 낼 다음 공개 행동 */
export function revealAction(view: YutView, seed: string): Action {
  const used = view.chains[view.mySeat]?.used ?? 0;
  return { type: "reveal", link: chainLink(seed, used + 1) };
}

/** 이 씨앗의 약속 행동 */
export function commitAction(seed: string): Action {
  return { type: "commit", hash: commitOf(seed) };
}

/** 온라인 방의 내 씨앗은 그 탭에만 남긴다(새로고침하면 이어 쓴다) */
export function loadSeedBook(key: string): SeedBook {
  try {
    const raw = sessionStorage.getItem(`yut-seed:${key}`);
    return raw ? (JSON.parse(raw) as SeedBook) : {};
  } catch {
    return {};
  }
}

export function saveSeedBook(key: string, book: SeedBook): void {
  try {
    sessionStorage.setItem(`yut-seed:${key}`, JSON.stringify(book));
  } catch {
    // 남길 수 없으면 새로고침 뒤에 공개할 수 없을 뿐이다(그때는 끝내기).
  }
}
