/*
 * 내 기록: 판과 게임이 끝날 때마다 이 기기(localStorage)에 한 줄씩 쌓는다. 서버는 없다.
 * 게임마다 다른 내용은 `data`에 두고(마이티·하트가 각자 정한다), 지표는 화면을 그릴 때 기록에서 계산한다.
 * 그래야 나중에 새 지표를 만들어도 지난 기록으로 바로 볼 수 있다.
 */

import { type GameId, track } from "./track";

/** 혼자(컴퓨터와) 또는 친구와(온라인) */
export type StatsMode = "solo" | "online";

export interface RoundRecord<D = unknown> {
  /** `대국 키:판 번호`. 같은 판을 두 번 남기지 않는다 */
  id: string;
  /** 게임 키트 id(mighty, hearts) */
  game: string;
  at: number;
  mode: StatsMode;
  /** 판 처음을 보지 못했다(이어하기·새로고침). 사건으로 세는 지표에서는 뺀다 */
  partial?: true;
  data: D;
}

export interface GameRecord<D = unknown> {
  id: string;
  game: string;
  at: number;
  mode: StatsMode;
  data: D;
}

export interface StatsBook {
  version: 1;
  /** 처음 기록한 때 */
  since: number;
  rounds: RoundRecord[];
  games: GameRecord[];
}

const KEY = "mighty-stats";
/** 이보다 많으면 오래된 것부터 지운다(판 한 줄이 200바이트 안팎이라 1MB 남짓) */
export const KEEP_ROUNDS = 5000;
export const KEEP_GAMES = 1000;

function empty(): StatsBook {
  return { version: 1, since: Date.now(), rounds: [], games: [] };
}

function isBook(value: unknown): value is StatsBook {
  const v = value as StatsBook | null;
  return (
    typeof v === "object" &&
    v !== null &&
    v.version === 1 &&
    Array.isArray(v.rounds) &&
    Array.isArray(v.games)
  );
}

/** 브라우저 저장소를 쓸 수 없으면(사생활 보호 창 등) 빈 기록 */
export function loadStats(): StatsBook {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return isBook(parsed) ? parsed : empty();
  } catch {
    return empty();
  }
}

function save(book: StatsBook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // 남기지 못해도 게임에는 지장이 없다.
  }
}

export function addRound(record: RoundRecord): void {
  const book = loadStats();
  if (book.rounds.some((r) => r.id === record.id)) return;
  book.rounds.push(record);
  book.rounds = book.rounds.slice(-KEEP_ROUNDS);
  save(book);
}

export function addGame(record: GameRecord): void {
  const book = loadStats();
  if (book.games.some((g) => g.id === record.id)) return;
  book.games.push(record);
  // 통계에는 게임과 혼자·온라인만 보낸다(id에 방 코드가 들어 있고 data는 게임마다 다르다).
  track("game-finish", { game: record.game as GameId, mode: record.mode });
  book.games = book.games.slice(-KEEP_GAMES);
  save(book);
}

/** 내보낸 기록(JSON)을 합친다. 같은 줄은 한 번만. 합친 뒤 판 수를 돌려준다 */
export function importStats(text: string): number | null {
  let incoming: unknown;
  try {
    incoming = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isBook(incoming)) return null;
  const book = loadStats();
  const merge = <T extends { id: string; at: number }>(a: T[], b: T[]) => {
    const seen = new Set(a.map((r) => r.id));
    return [...a, ...b.filter((r) => !seen.has(r.id))].sort(
      (x, y) => x.at - y.at,
    );
  };
  book.rounds = merge(book.rounds, incoming.rounds).slice(-KEEP_ROUNDS);
  book.games = merge(book.games, incoming.games).slice(-KEEP_GAMES);
  book.since = Math.min(book.since, incoming.since);
  save(book);
  return book.rounds.length;
}

export function clearStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}
