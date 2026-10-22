import type { KitLoggedAction } from "@/game/kit";
import type { StatsMode } from "@/stats/records";

/*
 * 복기용 게임 기록: 판이 끝날 때마다 그 게임의 시작 조건과 행동 기록을 이 기기(IndexedDB)에 남긴다.
 * 엔진이 결정적이라 시작 조건과 행동 기록만 있으면 어느 순간이든 다시 만든다(review/replay.ts).
 * 멘탈 포커 판은 시드가 패를 정하지 않으므로 판마다 실제 패(`deals`)를 함께 남긴다. docs/14.
 */

export interface GameArchive {
  /** 대국 키(내 기록과 같다: 혼자 `solo:시드`, 온라인 `online:방`) */
  id: string;
  /** 게임 키트 id(mighty, hearts) */
  game: string;
  mode: StatsMode;
  /** 처음 남긴 때와 마지막으로 고친 때 */
  startedAt: number;
  updatedAt: number;
  rules: unknown;
  seed: number;
  /** 첫 판 정해진 패(튜토리얼 등). 멘탈 포커는 `deals`를 쓴다 */
  presetDeal?: unknown;
  /** 멘탈 포커: 판 번호 → 그 판 실제 패(게임마다 모양이 다르다) */
  deals?: Record<number, unknown>;
  /** 행동 기록(실제 카드) */
  log: KitLoggedAction<unknown>[];
  /** 내 자리 */
  seat: number;
  /** 온라인이면 자리 이름. 혼자면 null(화면이 컴퓨터 이름을 붙인다) */
  seatNames: string[] | null;
  /** 끝난 판 수와 게임이 끝났는지(목록에 보인다) */
  rounds: number;
  over: boolean;
}

const DB = "mighty-review";
const STORE = "games";
/** 이보다 많으면 오래된 것부터 지운다 */
export const KEEP_GAMES = 50;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      // 사생활 보호 창 등 IndexedDB를 쓸 수 없으면 복기만 안 된다.
      resolve(null);
    }
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function listArchives(): Promise<GameArchive[]> {
  const all = (await run("readonly", (s) => s.getAll())) as
    | GameArchive[]
    | null;
  return (all ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadArchive(id: string): Promise<GameArchive | null> {
  return ((await run("readonly", (s) => s.get(id))) as GameArchive) ?? null;
}

/** 같은 대국이면 덮어쓴다. 많아지면 오래된 것부터 지운다 */
export async function saveArchive(archive: GameArchive): Promise<void> {
  const before = await loadArchive(archive.id);
  await run("readwrite", (s) =>
    s.put({ ...archive, startedAt: before?.startedAt ?? archive.startedAt }),
  );
  const all = await listArchives();
  for (const old of all.slice(KEEP_GAMES))
    await run("readwrite", (s) => s.delete(old.id));
}

export async function deleteArchive(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}
