/** 온라인 게임의 판 끝 검증 결과를 이 기기에 남긴다 */
export interface AuditRecord {
  at: number;
  room: string;
  /** 모두 문제없음 */
  ok: boolean;
  /** 실패를 알린 사람과 이유 */
  failures: string[];
}

const KEY = "mighty-audit-history";
const KEEP = 20;

export function loadAuditHistory(): AuditRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuditRecord[]) : [];
  } catch {
    return [];
  }
}

/** 같은 방의 기록은 하나로 합친다(여러 사람의 알림이 차례로 온다) */
export function recordAudit(room: string, failure: string | null): void {
  try {
    const history = loadAuditHistory();
    const recent = history[0];
    const record: AuditRecord =
      recent && recent.room === room && Date.now() - recent.at < 10 * 60_000
        ? recent
        : { at: Date.now(), room, ok: true, failures: [] };
    if (failure) {
      record.ok = false;
      if (!record.failures.includes(failure)) record.failures.push(failure);
    }
    const next = [record, ...history.filter((r) => r !== record)].slice(
      0,
      KEEP,
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장하지 못해도 게임에는 지장이 없다.
  }
}
