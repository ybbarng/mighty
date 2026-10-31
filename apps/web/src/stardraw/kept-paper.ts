/**
 * 보관한 용지(2026-11-01 사용자): 마감 뒤에 도착해 돌려받은 응모 용지를 「이 용지 보관하기」로 챙겨 두면, 다음 회차가
 * 열렸을 때 회차 카드의 「보관한 용지로 응모하기」로 같은 별을 새 회차 용지에 옮겨 적어 낸다. 서명은 회차에 묶여 낼 때
 * 새로 한다. 한 장만 두고, 응모하거나(어느 쪽으로든 한 회차 한 장) 버리면 사라진다. 내 응모 목록에는 남지 않는다.
 * 장부 표시(`Ledger.id()`)별로 이 기기 저장소에 둔다
 */
export interface KeptPaper {
  ledger: string | null;
  /** 반송된 회차 */
  round: number;
  numbers: number[];
  /** 원래 응모에서 「소속으로 응모」를 켰는지(옮겨 낼 때 새 회차 기준으로 다시 고른다) */
  qual: boolean;
}

const key = (ns: string) => `${ns}-kept-paper`;

export function loadKept(ns: string, ledger: string | null): KeptPaper | null {
  try {
    const text = localStorage.getItem(key(ns));
    const k = text ? (JSON.parse(text) as KeptPaper) : null;
    return k && k.ledger === ledger && k.numbers?.length === 6 ? k : null;
  } catch {
    return null;
  }
}

export function saveKept(ns: string, paper: KeptPaper): void {
  try {
    localStorage.setItem(key(ns), JSON.stringify(paper));
  } catch {
    // 저장소를 못 쓰면 보관되지 않는다(다음 회차에 새로 고른다)
  }
}

export function clearKept(ns: string): void {
  try {
    localStorage.removeItem(key(ns));
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
