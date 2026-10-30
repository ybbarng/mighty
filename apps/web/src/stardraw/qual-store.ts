import {
  blindStampRequest,
  fromBase64Url,
  fromHex,
  matchPeriod,
  newQualSeed,
  parseRecoveryCode,
  type QualHolding,
  type QualInfo,
  type QualPeriodInfo,
  qualKeyFromSeed,
  toBase64Url,
  toHex,
  unblindStamp,
  verifyStamp,
} from "@mighty/stardraw-core";

import type { Ledger } from "./ledger";

/**
 * 이 기기에 둔 상품 자격(docs/36 11-13). 들고 있는 사람이 주인인 비밀값(씨앗 + 도장)이라 밖으로 보이지 않게
 * 이 기기 저장소에만 둔다. 패스키 PRF로 잠그는 것은 아직 하지 않았다(응모 서명 경로와 함께 바꿔야 한다).
 * 장부 표시(`Ledger.id()`)별로 둔다.
 */

interface Stored {
  ledger: string | null;
  periodId: string;
  seed: string;
  stamp: string;
  /** 받은 회차. 그 회차에는 붙이지 않는다(받은 직후 응모로 누구의 자격인지 짐작되지 않게) */
  r?: number;
}

/** 보낸 뒤 응답을 못 받았을 때 같은 가린 값으로 다시 받기 위해 남겨 두는 요청 */
interface PendingRequest {
  ledger: string | null;
  periodId: string;
  seed: string;
  factor: string;
  blinded: string;
}

const key = (ns: string) => `${ns}-qual`;
const pendingKey = (ns: string) => `${ns}-qual-pending`;

function read<T>(k: string): T | null {
  try {
    const text = localStorage.getItem(k);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면 이번 방문 동안만 남는다
  }
}

export function loadHoldings(ns: string, ledger: string | null): QualHolding[] {
  return (read<Stored[]>(key(ns)) ?? [])
    .filter((s) => s.ledger === ledger)
    .map((s) => ({
      periodId: fromHex(s.periodId),
      seed: fromBase64Url(s.seed),
      stamp: fromBase64Url(s.stamp),
    }));
}

export function saveHolding(
  ns: string,
  ledger: string | null,
  h: QualHolding,
  receivedRound?: number,
): void {
  const all = (read<Stored[]>(key(ns)) ?? []).filter(
    (s) => !(s.ledger === ledger && s.periodId === toHex(h.periodId)),
  );
  all.push({
    ledger,
    periodId: toHex(h.periodId),
    seed: toBase64Url(h.seed),
    stamp: toBase64Url(h.stamp),
    ...(receivedRound === undefined ? {} : { r: receivedRound }),
  });
  write(key(ns), all);
}

export function removeHolding(
  ns: string,
  ledger: string | null,
  periodId: string,
): void {
  write(
    key(ns),
    (read<Stored[]>(key(ns)) ?? []).filter(
      (s) => !(s.ledger === ledger && s.periodId === periodId),
    ),
  );
}

/**
 * 회차 round 응모권에 붙일 수 있는 자격: 그 장부의 기간이고, 도장이 장부의 기간 열쇠로 확인되고,
 * 받은 회차가 지났다(받은 그 회차에는 붙이지 않는다, docs/36 11-13 남는 한계 "시간으로 이어질 수 있다")
 */
export function usableHolding(
  ns: string,
  ledger: string | null,
  info: QualInfo | null,
  round: number,
): { holding: QualHolding; period: QualPeriodInfo } | null {
  if (!info) return null;
  for (const s of (read<Stored[]>(key(ns)) ?? []).filter(
    (x) => x.ledger === ledger && (x.r === undefined || x.r < round),
  )) {
    const holding = {
      periodId: fromHex(s.periodId),
      seed: fromBase64Url(s.seed),
      stamp: fromBase64Url(s.stamp),
    };
    const period = info.periods.find((p) => p.id === s.periodId);
    if (period && checkHolding(period, holding)) return { holding, period };
  }
  return null;
}

/** 도장이 장부의 기간 열쇠로 확인되는지(서버 응답이 아니라 장부의 열쇠로 본다) */
export function checkHolding(
  period: QualPeriodInfo,
  holding: QualHolding,
): boolean {
  return verifyStamp(
    fromBase64Url(period.issuerKey),
    holding.periodId,
    qualKeyFromSeed(holding.seed).publicKey,
    holding.stamp,
  );
}

/**
 * 도장 받기: 자격 열쇠를 만들어 가리고(요청을 먼저 남긴다), 받은 도장을 벗겨 장부의 기간 열쇠로 확인한 뒤 저장한다.
 * 같은 기간에 남은 요청이 있으면 그 가린 값을 다시 보낸다(서버가 같은 도장을 다시 준다)
 */
export async function receiveQualification(
  ns: string,
  ledger: Ledger,
  period: QualPeriodInfo,
  credential: string,
): Promise<QualHolding> {
  const ledgerId = ledger.id();
  const periodId = fromHex(period.id);
  const saved = read<PendingRequest>(pendingKey(ns));
  let request: PendingRequest;
  if (saved && saved.ledger === ledgerId && saved.periodId === period.id) {
    request = saved;
  } else {
    const seed = newQualSeed();
    const made = blindStampRequest(periodId, qualKeyFromSeed(seed).publicKey);
    request = {
      ledger: ledgerId,
      periodId: period.id,
      seed: toBase64Url(seed),
      factor: made.factor.toString(16),
      blinded: toBase64Url(made.blinded),
    };
    write(pendingKey(ns), request);
  }
  const blindStamp = await ledger.issueStamp(
    period.id,
    credential,
    fromBase64Url(request.blinded),
  );
  const holding: QualHolding = {
    periodId,
    seed: fromBase64Url(request.seed),
    stamp: unblindStamp(blindStamp, BigInt(`0x${request.factor}`)),
  };
  if (!checkHolding(period, holding))
    throw new Error("받은 도장이 장부의 기간 열쇠와 맞지 않습니다");
  saveHolding(ns, ledgerId, holding, ledger.status().round);
  write(pendingKey(ns), null);
  return holding;
}

/** 복구 코드 불러오기: 장부의 기간에서 찾아 도장을 확인한 뒤 저장한다 */
export function importRecoveryCode(
  ns: string,
  ledgerId: string | null,
  info: QualInfo,
  code: string,
): QualHolding {
  const parsed = parseRecoveryCode(code);
  const periodId = matchPeriod(
    parsed.periodPrefix,
    info.periods.map((p) => fromHex(p.id)),
  );
  if (!periodId)
    throw new Error("이 장부에서 지금 쓸 수 있는 자격 기간의 코드가 아닙니다");
  const period = info.periods.find((p) => p.id === toHex(periodId));
  const holding = { periodId, seed: parsed.seed, stamp: parsed.stamp };
  if (!period || !checkHolding(period, holding))
    throw new Error("도장이 맞지 않는 복구 코드입니다");
  saveHolding(ns, ledgerId, holding);
  return holding;
}
