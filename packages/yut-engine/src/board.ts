/**
 * 윷판 29점과 말 길(docs/37 1절).
 *
 * 점 번호
 * - 바깥 0~19: 0 참먹이(오른쪽 아래)에서 반시계로. 5 모(오른쪽 위), 10 뒷모(왼쪽 위), 15 찌모(왼쪽 아래)
 * - 지름길 A(모 → 방 → 찌모): 20, 21, 22(방), 23, 24
 * - 지름길 B(뒷모 → 방 → 참먹이): 25, 26, 22(방), 27, 28
 *
 * 모·뒷모·방에 멈춘 말은 다음 걸음을 지름길로 시작한다(방에서는 참먹이 쪽 B). 지나가기만 하면 원래 길로 간다.
 */

export const POINT_COUNT = 29;
/** 아직 판에 나가지 않은 말 */
export const HOME = -1;
/** 참먹이를 지나 난 말 */
export const DONE = -2;

export const START = 0;
export const MO = 5;
export const BACK_MO = 10;
export const JJI_MO = 15;
export const CENTER = 22;

/** 판에 그릴 자리(왼쪽 위 0,0 ~ 오른쪽 아래 1,1) */
export const POINT_XY: readonly { x: number; y: number }[] = (() => {
  const xy: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const side = Math.floor(i / 5);
    const t = (i % 5) / 5;
    if (side === 0) xy.push({ x: 1, y: 1 - t });
    else if (side === 1) xy.push({ x: 1 - t, y: 0 });
    else if (side === 2) xy.push({ x: 0, y: t });
    else xy.push({ x: t, y: 1 });
  }
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  // 지름길 A: 모(1,0) → 찌모(0,1)
  for (const t of [1 / 6, 2 / 6])
    xy.push({ x: lerp(1, 0, t), y: lerp(0, 1, t) });
  xy.push({ x: 0.5, y: 0.5 });
  for (const t of [4 / 6, 5 / 6])
    xy.push({ x: lerp(1, 0, t), y: lerp(0, 1, t) });
  // 지름길 B: 뒷모(0,0) → 참먹이(1,1)
  for (const t of [1 / 6, 2 / 6, 4 / 6, 5 / 6]) xy.push({ x: t, y: t });
  return xy;
})();

/** 큰 점(모서리·방)인가 */
export function isBigPoint(point: number): boolean {
  return (
    point === START ||
    point === MO ||
    point === BACK_MO ||
    point === JJI_MO ||
    point === CENTER
  );
}

/** 점 이름(모서리·방만 이름이 있다) */
export function pointName(point: number): string | null {
  switch (point) {
    case START:
      return "참먹이";
    case MO:
      return "모";
    case BACK_MO:
      return "뒷모";
    case JJI_MO:
      return "찌모";
    case CENTER:
      return "방";
    default:
      return null;
  }
}

/**
 * 한 걸음 앞 점. `prev`는 방금 지나온 점(방을 지나갈 때 어느 지름길에서 왔는지 안다),
 * `first`는 이번 움직임의 첫 걸음인가(멈춰 있던 모·뒷모·방에서 지름길로 꺾는다)
 */
export function nextPoint(
  point: number,
  prev: number | undefined,
  first: boolean,
): number {
  if (first) {
    if (point === MO) return 20;
    if (point === BACK_MO) return 25;
    if (point === CENTER) return 27;
  }
  if (point >= 0 && point < 19) return point + 1;
  if (point === 19) return START;
  switch (point) {
    case 20:
      return 21;
    case 21:
      return CENTER;
    case CENTER:
      // 지나가는 중: A에서 왔으면 찌모 쪽, B에서 왔으면 참먹이 쪽
      return prev === 26 ? 27 : 23;
    case 23:
      return 24;
    case 24:
      return JJI_MO;
    case 25:
      return 26;
    case 26:
      return CENTER;
    case 27:
      return 28;
    case 28:
      return START;
    default:
      return START;
  }
}

/** 지나온 길이 없을 때 한 걸음 뒤 점(참먹이에서 빽도 등) */
export function defaultPrevPoint(point: number): number {
  if (point === START) return 19;
  if (point > 0 && point < 20) return point - 1;
  switch (point) {
    case 20:
      return MO;
    case 21:
      return 20;
    case CENTER:
      return 21;
    case 23:
      return CENTER;
    case 24:
      return 23;
    case 25:
      return BACK_MO;
    case 26:
      return 25;
    case 27:
      return CENTER;
    case 28:
      return 27;
    default:
      return START;
  }
}

/** 말(또는 업힌 말 묶음) 하나의 자리 */
export interface Position {
  /** HOME·DONE 또는 판 점 0~28 */
  point: number;
  /** 이번 바퀴에 지나온 점(빽도로 되돌아갈 때 쓴다). 지금 점은 넣지 않는다 */
  trail: number[];
}

/** 움직인 결과. `path`는 지나간 점(마지막이 도착 점, 났으면 마지막이 참먹이) */
export interface Travel {
  to: Position;
  path: number[];
  finished: boolean;
}

/**
 * `from`에서 `steps`칸 움직인다(-1은 빽도). 판에 없는 말은 처음에서 나가고(빽도는 못 쓴다), 난 말은 움직이지 않는다.
 * `landOnHome`이면 참먹이에 정확히 서도 난다. 쓸 수 없으면 null
 */
export function travel(
  from: Position,
  steps: number,
  landOnHome: boolean,
): Travel | null {
  if (from.point === DONE) return null;
  if (steps === -1) {
    if (from.point === HOME) return null;
    const trail = [...from.trail];
    const back = trail.pop() ?? defaultPrevPoint(from.point);
    return { to: { point: back, trail }, path: [back], finished: false };
  }
  if (steps < 1) return null;
  // 참먹이에 서 있던 말은 무엇이 나와도 난다.
  if (from.point === START)
    return {
      to: { point: DONE, trail: [] },
      path: [START],
      finished: true,
    };
  const path: number[] = [];
  const trail = [...from.trail];
  let point = from.point === HOME ? START : from.point;
  let prev: number | undefined = trail.at(-1);
  for (let i = 0; i < steps; i++) {
    // 판에 없던 말의 첫 걸음은 참먹이 다음 점이다(참먹이는 지나간 것으로 치지 않는다).
    const next =
      from.point === HOME && i === 0 ? 1 : nextPoint(point, prev, i === 0);
    if (!(from.point === HOME && i === 0)) trail.push(point);
    prev = point;
    point = next;
    path.push(point);
    if (point === START && i < steps - 1)
      return { to: { point: DONE, trail: [] }, path, finished: true };
  }
  if (point === START && landOnHome)
    return { to: { point: DONE, trail: [] }, path, finished: true };
  return { to: { point, trail }, path, finished: false };
}

/**
 * 점마다 나기까지 남은 최단 칸 수(지름길을 쓸 수 있으면 쓴다). 컴퓨터 평가에 쓴다.
 * 처음(HOME)은 `homeDistance`. 참먹이에 서 있으면 1(무엇이든 나오면 난다)
 */
export function distanceTable(landOnHome: boolean): {
  points: number[];
  home: number;
} {
  const INF = 1e9;
  // fin: 참먹이에 닿은 뒤 나기까지 더 필요한 칸
  const atStart = landOnHome ? 0 : 1;
  const dist = new Array<number>(POINT_COUNT).fill(INF);
  dist[START] = 1;
  // 이음(점 → 다음 점들). 모·뒷모·방은 지름길로도 갈 수 있다.
  const edges = (p: number): number[] => {
    const out = [nextPoint(p, p === CENTER ? 21 : undefined, false)];
    if (p === CENTER) out.push(27);
    if (p === MO) out.push(20);
    if (p === BACK_MO) out.push(25);
    return out;
  };
  for (let round = 0; round < POINT_COUNT * 2; round++) {
    for (let p = 0; p < POINT_COUNT; p++) {
      if (p === START) continue;
      for (const q of edges(p)) {
        const d = q === START ? 1 + atStart : 1 + (dist[q] ?? INF);
        if (d < (dist[p] ?? INF)) dist[p] = d;
      }
    }
  }
  return { points: dist, home: 1 + (dist[1] ?? INF) };
}
