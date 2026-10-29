import {
  type Action,
  type BaseballRules,
  type BaseballView,
  commitmentOf,
  derivedSecret,
  digitPool,
  score,
} from "@mighty/baseball-engine";

/**
 * 내 비밀 수는 이 기기에만 둔다(docs/34 4절). 방장 기기의 엔진에는 약속(해시)만 들어가고,
 * 상대가 물으면 이 기기가 스트라이크·볼을 세어 답하는 행동을 낸다. 판 끝에 비밀과 소금을 공개한다.
 */
export interface SecretMaterial {
  secret: string;
  salt: string;
}

/** 판 번호 → 그 판 내 비밀 */
export type SecretBook = Record<number, SecretMaterial>;

/** 소금 16바이트(브라우저의 안전한 난수) */
export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 규칙에 맞는 무작위 비밀 수(무작위 단추) */
export function randomSecret(
  rules: Pick<BaseballRules, "digits" | "zero">,
): string {
  const pool = digitPool(rules);
  const bytes = new Uint8Array(rules.digits);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    const at = b % pool.length;
    out += pool[at];
    pool.splice(at, 1);
  }
  return out;
}

/**
 * 이번 판 내 비밀. 이 기기에 남긴 것 가운데 약속과 맞는 것을 쓴다. 없으면 끊긴 사이 컴퓨터가 내 자리 비밀 재료로
 * 대신 정한 수인지 본다. 둘 다 아니면(다른 기기에서 정했다 등) null
 */
export function mySecret(
  view: BaseballView,
  book: SecretBook,
): SecretMaterial | null {
  const commit = view.commits[view.mySeat];
  if (!commit) return book[view.roundNumber] ?? null;
  const kept = book[view.roundNumber];
  if (kept && commitmentOf(kept.secret, kept.salt) === commit) return kept;
  const derived = derivedSecret(view.botKey, view.roundNumber, view.rules);
  if (commitmentOf(derived.secret, derived.salt) === commit) return derived;
  return null;
}

/**
 * 사람이 직접 셀 필요가 없는 행동: 상대 물음에 답하기, 판 끝 공개. 내 비밀을 모르면 null.
 * 비밀 정하기·묻기·다음 판은 사람이 한다
 */
export function autoAction(
  view: BaseballView,
  book: SecretBook,
): Action | null {
  const decision = view.decision;
  if (!decision) return null;
  if (decision.kind !== "answer" && decision.kind !== "reveal") return null;
  const mine = mySecret(view, book);
  if (!mine) return null;
  if (decision.kind === "answer")
    return { type: "answer", ...score(mine.secret, decision.guess) };
  return { type: "reveal", secret: mine.secret, salt: mine.salt };
}

/** 온라인 방의 내 비밀은 그 탭에만 남긴다(새로고침하면 이어 쓴다) */
export function loadSecretBook(key: string): SecretBook {
  try {
    const raw = sessionStorage.getItem(`baseball-secret:${key}`);
    return raw ? (JSON.parse(raw) as SecretBook) : {};
  } catch {
    return {};
  }
}

export function saveSecretBook(key: string, book: SecretBook): void {
  try {
    sessionStorage.setItem(`baseball-secret:${key}`, JSON.stringify(book));
  } catch {
    // 남길 수 없으면 새로고침 뒤에 답할 수 없을 뿐이다(그때는 끝내기).
  }
}
