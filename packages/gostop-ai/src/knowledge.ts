import { type GostopView, goThreshold } from "@mighty/gostop-engine";
import {
  CHEONGDAN,
  CHODAN,
  cardOf,
  GODORI,
  HONGDAN,
  HWATU_DECK,
  type HwatuCard,
  type Month,
  monthOf,
} from "@mighty/hwatu";

/*
 * 카드 값 어림. 중수는 이것만으로 두고, 고수는 앞날을 굴려 볼 때 모든 자리를 이것으로 둔다.
 * 값은 대략 "점수 1점"을 1로 잡는다. 내가 먹으면 좋은 값에 상대가 먹지 못하게 막는 값을 더한다
 */

const SETS: readonly (readonly string[])[] = [
  GODORI,
  HONGDAN,
  CHEONGDAN,
  CHODAN,
];
const SET_OF = new Map<string, readonly string[]>();
for (const set of SETS) for (const id of set) SET_OF.set(id, set);

/** 한 자리가 먹은 패의 장수 요약 */
export interface Holdings {
  gwang: number;
  animals: number;
  ribbons: number;
  pi: number;
  ids: Set<string>;
}

export function holdingsOf(ids: readonly string[]): Holdings {
  const h: Holdings = {
    gwang: 0,
    animals: 0,
    ribbons: 0,
    pi: 0,
    ids: new Set(ids),
  };
  for (const id of ids) {
    const card = cardOf(id);
    if (card.kind === "gwang") h.gwang++;
    else if (card.kind === "animal") h.animals++;
    else if (card.kind === "ribbon") h.ribbons++;
    else h.pi += card.piValue ?? 1;
  }
  return h;
}

function piGain(value: number, h: Holdings): number {
  return value * (h.pi >= 8 ? 0.9 : h.pi >= 5 ? 0.55 : 0.4);
}

/** 이 자리가 그 카드를 먹으면 얼마나 좋은가. `others`가 묶음 카드를 하나라도 가졌으면 그 묶음은 죽었다 */
export function gainFor(
  card: HwatuCard,
  h: Holdings,
  others: readonly Holdings[],
): number {
  const set = SET_OF.get(card.id);
  let setBonus = 0;
  if (set && !others.some((o) => set.some((id) => o.ids.has(id)))) {
    const have = set.filter((id) => h.ids.has(id)).length;
    const big = set === GODORI ? 3 : 1.8;
    setBonus = 0.4 + (have >= 2 ? big : have === 1 ? 0.5 : 0);
  }
  switch (card.kind) {
    case "gwang": {
      let v = 1 + (h.gwang >= 2 ? 2 : h.gwang === 1 ? 0.6 : 0);
      if (card.special === "rainGwang" && h.gwang < 3) v -= 0.3;
      return v;
    }
    case "animal": {
      const v =
        0.35 + (h.animals >= 4 ? 0.9 : h.animals >= 3 ? 0.3 : 0) + setBonus;
      return card.special === "cup" ? Math.max(v, piGain(2, h)) : v;
    }
    case "ribbon":
      return (
        0.35 + (h.ribbons >= 4 ? 0.9 : h.ribbons >= 3 ? 0.3 : 0) + setBonus
      );
    case "pi":
      return piGain(card.piValue ?? 1, h);
  }
}

/** 화면에서 읽은 판 요약: 자리마다 먹은 패 요약과 아직 못 본 카드 */
export interface Table {
  me: number;
  players: number;
  holdings: Holdings[];
  /** 내가 못 본 카드(남의 손패·더미) */
  unseen: Set<string>;
  /** 고수: 박을 피하고, 점수가 가까운 상대를 더 막는다 */
  careful: boolean;
  /** 상대 가운데 기준 점수에 가까운 사람이 있다 */
  danger: boolean;
}

export function tableOf(view: GostopView, careful = false): Table {
  const seen = new Set<string>([...view.hand, ...view.floor]);
  for (const c of view.captured) for (const id of c) seen.add(id);
  for (const r of view.revealed) for (const id of r) seen.add(id);
  const p = view.pending;
  if (p) {
    for (const id of [
      ...(p.card ? [p.card] : []),
      ...(p.bomb ?? []),
      ...p.handPair,
      ...p.options,
      ...(p.flipped ? [p.flipped] : []),
      ...p.captures,
    ])
      seen.add(id);
  }
  const unseen = new Set(
    HWATU_DECK.map((c) => c.id).filter((id) => !seen.has(id)),
  );
  return {
    me: view.mySeat,
    players: view.rules.players,
    holdings: view.captured.map(holdingsOf),
    unseen,
    careful,
    danger: careful && threat(view).opp >= threat(view).threshold - 2,
  };
}

/** 그 카드를 내가 먹을 때 값: 내 이득 + 상대가 못 먹게 막는 값 */
export function worth(id: string, t: Table): number {
  const card = cardOf(id);
  const mine = t.holdings[t.me] as Holdings;
  const others = t.holdings.filter((_, i) => i !== t.me);
  let block = 0;
  for (let o = 0; o < t.players; o++) {
    if (o === t.me) continue;
    const theirs = t.holdings[o] as Holdings;
    const rest = t.holdings.filter((_, i) => i !== o);
    block = Math.max(block, gainFor(card, theirs, rest));
  }
  let extra = 0;
  if (t.careful) {
    const most = (pick: (h: Holdings) => number) =>
      Math.max(0, ...t.holdings.filter((_, i) => i !== t.me).map(pick));
    // 피박·광박을 피한다: 상대가 피·광 점수에 가까우면 내 피·광이 더 귀하다.
    if (card.kind === "pi" && mine.pi < 5 && most((h) => h.pi) >= 7)
      extra += 0.5 * (card.piValue ?? 1);
    if (card.kind === "gwang" && mine.gwang === 0 && most((h) => h.gwang) >= 2)
      extra += 1.5;
  }
  return gainFor(card, mine, others) + (t.danger ? 1 : 0.7) * block + extra;
}

/** 상대에게 그 카드가 가면 잃는 값(바닥에 둘 때 위험) */
export function exposure(id: string, t: Table): number {
  const card = cardOf(id);
  let worst = 0;
  for (let o = 0; o < t.players; o++) {
    if (o === t.me) continue;
    const rest = t.holdings.filter((_, i) => i !== o);
    worst = Math.max(worst, gainFor(card, t.holdings[o] as Holdings, rest));
  }
  return worst;
}

/** 그 달 카드 가운데 내가 못 본 것 수 */
export function unseenOfMonth(month: Month, t: Table): number {
  let n = 0;
  for (const id of t.unseen) if (monthOf(id) === month) n++;
  return n;
}

/** 지금 판에서 상대 가운데 가장 높은 점수와 기준 점수 */
export function threat(view: GostopView): { opp: number; threshold: number } {
  let opp = 0;
  for (let s = 0; s < view.rules.players; s++)
    if (s !== view.mySeat) opp = Math.max(opp, view.liveScores[s] ?? 0);
  return { opp, threshold: goThreshold(view.rules) };
}
