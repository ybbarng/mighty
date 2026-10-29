import {
  DONE,
  defaultPrevPoint,
  HOME,
  type Piece,
  POINT_COUNT,
  type Position,
  sideCount,
  sideOf,
  type ThrowValue,
  throwOdds,
  travel,
  type YutRules,
} from "@mighty/yut-engine";

/*
 * 컴퓨터 평가(docs/37 3절). 곱셈·덧셈·비교만 쓴다: 온라인 판 끝 검증에서 참가자 기기가 컴퓨터 수를
 * 다시 계산하므로 기기마다 같은 값이 나와야 한다.
 */

type RuleKey = Pick<YutRules, "landOnHome" | "flatPercent" | "backDo">;

interface Table {
  /** 판 점마다 나기까지 남은 평균 던지기 수 */
  points: number[];
  home: number;
}

const tables = new Map<string, Table>();

/**
 * 말 하나만 혼자 움직인다고 보고, 나기까지 남은 평균 던지기 수를 점마다 구한다(가치 반복, 정해진 횟수).
 * 모서리·방에 정확히 멈춰야 지름길을 타는 것까지 확률로 들어간다. 빽도는 앞 점으로 되돌아간다고 본다
 */
function expectedThrows(rules: RuleKey): Table {
  const odds = throwOdds(rules);
  const points = new Array<number>(POINT_COUNT).fill(0);
  let home = 0;
  const valueAt = (point: number): number =>
    point === DONE ? 0 : point === HOME ? home : (points[point] ?? 0);
  const expectFrom = (from: Position): number => {
    let e = 1;
    for (const { value, p } of odds) {
      const moved = travel(from, value, rules.landOnHome);
      // 쓸 수 없는 결과(처음에서 빽도)는 제자리
      e +=
        p *
        (moved
          ? valueAt(moved.finished ? DONE : moved.to.point)
          : valueAt(from.point));
    }
    return e;
  };
  for (let round = 0; round < 120; round++) {
    const next = points.map((_, point) =>
      expectFrom({ point, trail: [defaultPrevPoint(point)] }),
    );
    home = expectFrom({ point: HOME, trail: [] });
    for (let i = 0; i < next.length; i++) points[i] = next[i] as number;
  }
  return { points, home };
}

function tableFor(rules: RuleKey): Table {
  const key = `${rules.landOnHome}|${rules.flatPercent}|${rules.backDo}`;
  let table = tables.get(key);
  if (!table) {
    table = expectedThrows(rules);
    tables.set(key, table);
  }
  return table;
}

/** 말 하나가 나기까지 남은 평균 던지기 수 */
export function pieceDistance(
  piece: Pick<Piece, "point">,
  rules: RuleKey,
): number {
  const table = tableFor(rules);
  if (piece.point === DONE) return 0;
  if (piece.point === HOME) return table.home;
  return table.points[piece.point] ?? table.home;
}

/** 말 하나가 처음보다 얼마나 나아갔나(처음 0, 났으면 처음 값). 단위는 던지기 수 */
export function pieceProgress(
  piece: Pick<Piece, "point">,
  rules: RuleKey,
): number {
  return tableFor(rules).home - pieceDistance(piece, rules);
}

/** 이 편 말들의 나아간 정도 합 */
export function sideProgress(
  pieces: readonly Piece[],
  side: number,
  rules: RuleKey,
): number {
  let sum = 0;
  for (const p of pieces) if (p.side === side) sum += pieceProgress(p, rules);
  return sum;
}

/**
 * 공격 편이 다음 한 번 던져 그 점에 정확히 닿을 확률(잡을 확률). 닿게 하는 결과마다 한 번만 센다.
 * 판 위 말과 아직 나가지 않은 말(앞으로 나가는 결과만)을 모두 본다
 */
export function hitChance(
  pieces: readonly Piece[],
  attacker: number,
  target: number,
  rules: YutRules,
): number {
  if (target < 0) return 0;
  const odds = throwOdds(rules);
  let chance = 0;
  for (const { value, p } of odds) {
    if (reaches(pieces, attacker, target, value, rules)) chance += p;
  }
  return chance;
}

function reaches(
  pieces: readonly Piece[],
  attacker: number,
  target: number,
  value: ThrowValue,
  rules: YutRules,
): boolean {
  const seen = new Set<number>();
  for (const p of pieces) {
    if (p.side !== attacker || p.point === DONE || seen.has(p.point)) continue;
    seen.add(p.point);
    const moved = travel(p, value, rules.landOnHome);
    if (moved && !moved.finished && moved.to.point === target) return true;
  }
  return false;
}

/** 판 위 이 편 말 묶음(점 → 말 수) */
function groupsOf(pieces: readonly Piece[], side: number): Map<number, number> {
  const groups = new Map<number, number>();
  for (const p of pieces)
    if (p.side === side && p.point >= 0)
      groups.set(p.point, (groups.get(p.point) ?? 0) + 1);
  return groups;
}

/** 바로 다음에 던지는 편이 잡을 기회의 무게 */
const NEXT_WEIGHT = 0.8;
/** 그다음에야 던지는 편이 잡을 기회의 무게(그사이 상대가 피하거나 먼저 잡을 수 있다) */
const LATER_WEIGHT = 0.3;

/**
 * 이 편에서 본 판의 값. 내 나아간 정도 − 가장 앞선 상대의 나아간 정도 − 잡힐 위험 + 잡을 기회.
 * 위험과 기회는 다음에 던질 편(`turn`의 편)이 누구냐에 따라 무게가 다르다. 이긴 판은 아주 크게, 진 판은 아주 작게
 */
export function evaluate(
  state: { pieces: readonly Piece[]; rules: YutRules; turn: number },
  side: number,
): number {
  const { pieces, rules } = state;
  const nextSide = sideOf(rules, state.turn);
  const weightFor = (attacker: number) =>
    attacker === nextSide ? NEXT_WEIGHT : LATER_WEIGHT;
  const sides = sideCount(rules);
  const mineAll = pieces.filter((p) => p.side === side);
  if (mineAll.every((p) => p.point === DONE)) return 1e6;
  let best = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < sides; s++) {
    if (s === side) continue;
    const theirs = pieces.filter((p) => p.side === s);
    if (theirs.every((p) => p.point === DONE)) return -1e6;
    const progress = sideProgress(pieces, s, rules);
    if (progress > best) best = progress;
  }
  let value = sideProgress(pieces, side, rules) - best;
  for (let s = 0; s < sides; s++) {
    if (s === side) continue;
    for (const [point, count] of groupsOf(pieces, side)) {
      const risk = hitChance(pieces, s, point, rules);
      if (risk > 0)
        value -= weightFor(s) * risk * count * pieceProgress({ point }, rules);
    }
    for (const [point, count] of groupsOf(pieces, s)) {
      const chance = hitChance(pieces, side, point, rules);
      if (chance > 0)
        value +=
          weightFor(side) * chance * count * pieceProgress({ point }, rules);
    }
  }
  return value;
}
