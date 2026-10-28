import {
  cardOf,
  type Month,
  monthOf,
  type PresetDeal,
  shuffledDeck,
} from "@mighty/hwatu";

import {
  CHONGTONG_POINTS,
  dealSizes,
  type GostopRules,
  goThreshold,
  MEONGBAK_ANIMALS,
  PIBAK_UNDER,
} from "./rules";
import { piCountOf, piToGive, scoreCaptured } from "./score";
import type {
  Action,
  Bak,
  Decision,
  GameEvent,
  GostopState,
  GostopView,
  LoggedAction,
  PendingTurn,
  Settlement,
} from "./state";

export type StepResult =
  | { ok: true; state: GostopState; events: GameEvent[] }
  | { ok: false; error: string };

const fail = (error: string): StepResult => ({ ok: false, error });

/** 판 번호·다시 섞은 횟수마다 다른 시드(같은 게임 시드면 늘 같은 패) */
function dealSeed(seed: number, round: number, attempt: number): number {
  return (
    (seed +
      Math.imul(round, 0x9e3779b1) +
      Math.imul(attempt, 0x85ebca6b) +
      0x1234567) >>>
    0
  );
}

function countMonths(ids: readonly string[]): Map<Month, number> {
  const counts = new Map<Month, number>();
  for (const id of ids) {
    const m = monthOf(id);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return counts;
}

/** 엔진 걸음이 상태를 고쳐 쓰도록 깊이 복사한다(지난 판 정산은 바뀌지 않아 함께 쓴다) */
export function cloneState(s: GostopState): GostopState {
  return {
    ...s,
    hands: s.hands.map((h) => [...h]),
    floor: [...s.floor],
    deck: [...s.deck],
    captured: s.captured.map((c) => [...c]),
    stacks: s.stacks.map((x) => ({ ...x })),
    pending: s.pending ? clonePending(s.pending) : null,
    goCount: [...s.goCount],
    lastGoScore: [...s.lastGoScore],
    shakes: [...s.shakes],
    revealed: s.revealed.map((r) => [...r]),
    flipOwed: [...s.flipOwed],
    ppeok: [...s.ppeok],
    scores: [...s.scores],
    history: [...s.history],
    continued: [...s.continued],
  };
}

function clonePending(p: PendingTurn): PendingTurn {
  return {
    ...p,
    bomb: p.bomb ? [...p.bomb] : null,
    handPair: [...p.handPair],
    options: [...p.options],
    captures: [...p.captures],
  };
}

function newPending(card: string | null): PendingTurn {
  return {
    card,
    bomb: null,
    matched: 0,
    handPair: [],
    options: [],
    flipped: null,
    captures: [],
    steals: 0,
  };
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);

/** 새 판의 패를 나눈다. 바닥에 같은 달 넉 장이 깔리면 다시 섞는다. 총통이면 바로 판이 끝난다 */
function dealRound(s: GostopState, events: GameEvent[]): void {
  const n = s.rules.players;
  const size = dealSizes(s.rules);
  if (s.fair) {
    // 멘탈 포커 판: 함께 섞어 나눈 패(바닥 넉 장이면 이미 다시 섞었다)
    const preset = s.preset;
    if (!preset) throw new Error("멘탈 포커 판인데 이번 판 패가 없다");
    s.hands = preset.hands.map((h) => [...h]);
    s.floor = [...preset.floor];
    s.deck = [...preset.deck];
    s.redeals = preset.redeals ?? 0;
    delete s.preset;
  }
  for (let attempt = 0; !s.fair; attempt++) {
    const deck = shuffledDeck(dealSeed(s.seed, s.roundNumber, attempt));
    const floor = deck.slice(n * size.hand, n * size.hand + size.floor);
    const four = [...countMonths(floor).values()].some((c) => c === 4);
    if (four && attempt < 100) continue;
    s.hands = Array.from({ length: n }, (_, i) =>
      deck.slice(i * size.hand, (i + 1) * size.hand),
    );
    s.floor = floor;
    s.deck = deck.slice(n * size.hand + size.floor);
    s.redeals = attempt;
    break;
  }
  s.stacks = [...countMonths(s.floor).entries()]
    .filter(([, c]) => c === 3)
    .map(([month]) => ({ month, owner: null }));
  s.captured = Array.from({ length: n }, () => []);
  s.goCount = zeros(n);
  s.lastGoScore = zeros(n);
  s.lastGoSeat = null;
  s.shakes = zeros(n);
  s.revealed = Array.from({ length: n }, () => []);
  s.flipOwed = zeros(n);
  s.ppeok = zeros(n);
  s.turn = s.dealer;
  s.stage = "play";
  s.pending = null;
  s.lastTurn = null;
  s.result = null;
  s.phase = "play";
  s.continued = Array.from({ length: n }, () => false);
  events.push({
    type: "roundStarted",
    roundNumber: s.roundNumber,
    dealer: s.dealer,
    nagari: s.nagari,
    redeals: s.redeals,
  });
  // 총통: 선부터 차례로 보아 같은 달 넉 장을 받은 사람이 바로 이긴다.
  for (let k = 0; k < n; k++) {
    const seat = (s.dealer + k) % n;
    const four = [...countMonths(s.hands[seat] ?? []).entries()].find(
      ([, c]) => c === 4,
    );
    if (four) {
      settleChongtong(s, seat, four[0], events);
      return;
    }
  }
}

/** `preset`이 있으면 멘탈 포커 판: 판마다 미리 정한 패로 나눈다(다음 판 패는 `state.preset`) */
export function createMatch(
  rules: GostopRules,
  seed: number,
  preset?: PresetDeal,
): { state: GostopState; events: GameEvent[] } {
  const n = rules.players;
  const state: GostopState = {
    rules,
    seed: seed >>> 0,
    roundNumber: 1,
    dealer: (seed >>> 0) % n,
    hands: [],
    floor: [],
    deck: [],
    captured: [],
    stacks: [],
    turn: 0,
    stage: "play",
    pending: null,
    lastTurn: null,
    goCount: [],
    lastGoScore: [],
    lastGoSeat: null,
    shakes: [],
    revealed: [],
    flipOwed: [],
    ppeok: [],
    nagari: 0,
    scores: zeros(n),
    history: [],
    phase: "play",
    result: null,
    continued: [],
    redeals: 0,
    ...(preset ? { fair: true as const, preset } : {}),
  };
  const events: GameEvent[] = [];
  dealRound(state, events);
  return { state, events };
}

/* ---------- 판 진행 ---------- */

function sameValue(a: string, b: string): boolean {
  const x = cardOf(a);
  const y = cardOf(b);
  return (
    x.kind === y.kind &&
    x.piValue === y.piValue &&
    x.ribbon === y.ribbon &&
    x.special === y.special &&
    x.bird === y.bird
  );
}

const floorOf = (s: GostopState, m: Month) =>
  s.floor.filter((id) => monthOf(id) === m);

function remove(list: string[], ids: readonly string[]): void {
  for (const id of ids) {
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
  }
}

/** 바닥의 같은 달 석 장(뻑)을 넷째 장으로 먹는다. 남의 뻑은 피 한 장, 자뻑은 두 장씩 빼앗는다 */
function takeStack(
  s: GostopState,
  seat: number,
  month: Month,
  p: PendingTurn,
  events: GameEvent[],
): void {
  const i = s.stacks.findIndex((x) => x.month === month);
  if (i < 0) return;
  const owner = s.stacks[i]?.owner ?? null;
  s.stacks.splice(i, 1);
  if (owner === null) return;
  const self = owner === seat;
  p.steals += self ? 2 : 1;
  events.push({ type: "special", seat, kind: self ? "selfStack" : "stack" });
}

function roundOver(s: GostopState): boolean {
  return (
    s.hands.every((h) => h.length === 0) && s.flipOwed.every((f) => f === 0)
  );
}

function playCard(
  s: GostopState,
  seat: number,
  card: string,
  shake: boolean,
  events: GameEvent[],
): string | null {
  const hand = s.hands[seat] as string[];
  if (!hand.includes(card)) return "손에 없는 카드다";
  const m = monthOf(card);
  const sameInHand = hand.filter((id) => monthOf(id) === m);
  if (shake) {
    if (sameInHand.length !== 3 || floorOf(s, m).length !== 0)
      return "흔들기는 같은 달 석 장을 들고 바닥에 그 달이 없을 때만 한다";
  }
  remove(hand, [card]);
  remove(s.revealed[seat] as string[], [card]);
  events.push({ type: "played", seat, card, ...(shake ? { shake } : {}) });
  if (shake) {
    s.shakes[seat] = (s.shakes[seat] ?? 0) + 1;
    (s.revealed[seat] as string[]).push(
      ...sameInHand.filter((id) => id !== card),
    );
    events.push({ type: "special", seat, kind: "shake" });
  }
  const p = newPending(card);
  const matches = floorOf(s, m);
  if (matches.length === 0) {
    s.floor.push(card);
  } else if (matches.length === 1) {
    remove(s.floor, matches);
    p.handPair = [card, ...matches];
    p.matched = 1;
  } else if (matches.length === 2) {
    const [a, b] = matches as [string, string];
    if (sameValue(a, b)) {
      remove(s.floor, [a]);
      p.handPair = [card, a];
      p.matched = 2;
    } else {
      p.options = [a, b];
      s.pending = p;
      s.stage = "chooseHand";
      return null;
    }
  } else {
    remove(s.floor, matches);
    p.handPair = [card, ...matches];
    p.matched = 3;
    takeStack(s, seat, m, p, events);
  }
  flipPhase(s, seat, p, events);
  return null;
}

function bomb(
  s: GostopState,
  seat: number,
  month: Month,
  events: GameEvent[],
): string | null {
  const hand = s.hands[seat] as string[];
  const cards = hand.filter((id) => monthOf(id) === month);
  const onFloor = floorOf(s, month);
  if (cards.length !== 3 || onFloor.length !== 1)
    return "폭탄은 같은 달 석 장을 들고 바닥에 그 달이 한 장 있을 때만 한다";
  remove(hand, cards);
  remove(s.revealed[seat] as string[], cards);
  remove(s.floor, onFloor);
  events.push({ type: "bombed", seat, cards });
  events.push({ type: "special", seat, kind: "bomb" });
  s.shakes[seat] = (s.shakes[seat] ?? 0) + 1;
  s.flipOwed[seat] = (s.flipOwed[seat] ?? 0) + 2;
  const p = newPending(cards[0] as string);
  p.bomb = cards;
  p.handPair = [...cards, ...onFloor];
  p.matched = 3;
  p.steals += 1;
  flipPhase(s, seat, p, events);
  return null;
}

/** 더미 맨 위를 뒤집어 짝을 맞춘다. 뻑·쪽·따닥을 가린다 */
function flipPhase(
  s: GostopState,
  seat: number,
  p: PendingTurn,
  events: GameEvent[],
): void {
  const flipped = s.deck.shift();
  if (flipped === undefined) {
    finishTurn(s, seat, p, events);
    return;
  }
  p.flipped = flipped;
  events.push({ type: "flipped", seat, card: flipped });
  const m = monthOf(flipped);
  if (p.card !== null && p.bomb === null && monthOf(p.card) === m) {
    if (p.matched === 0) {
      // 쪽: 바닥에 둔 카드를 뒤집은 카드가 바로 먹는다.
      remove(s.floor, [p.card]);
      p.captures.push(p.card, flipped);
      p.steals += 1;
      events.push({ type: "special", seat, kind: "jjok" });
    } else if (p.matched === 1) {
      // 뻑: 석 장이 바닥에 남는다.
      s.floor.push(...p.handPair, flipped);
      p.handPair = [];
      s.stacks.push({ month: m, owner: seat });
      s.ppeok[seat] = (s.ppeok[seat] ?? 0) + 1;
      events.push({ type: "special", seat, kind: "ppeok" });
    } else {
      // 따닥: 같은 달 넉 장을 모두 먹는다.
      const rest = floorOf(s, m);
      remove(s.floor, rest);
      p.captures.push(...p.handPair, ...rest, flipped);
      p.handPair = [];
      p.steals += 1;
      events.push({ type: "special", seat, kind: "ttadak" });
    }
    finishTurn(s, seat, p, events);
    return;
  }
  const matches = floorOf(s, m);
  if (matches.length === 0) {
    s.floor.push(flipped);
  } else if (matches.length === 1) {
    remove(s.floor, matches);
    p.captures.push(flipped, ...matches);
  } else if (matches.length === 2) {
    const [a, b] = matches as [string, string];
    if (sameValue(a, b)) {
      remove(s.floor, [a]);
      p.captures.push(flipped, a);
    } else {
      p.options = [a, b];
      s.pending = p;
      s.stage = "chooseFlip";
      return;
    }
  } else {
    remove(s.floor, matches);
    p.captures.push(flipped, ...matches);
    takeStack(s, seat, m, p, events);
  }
  finishTurn(s, seat, p, events);
}

/** 차례 마무리: 먹은 패를 넣고, 싹쓸이·피 빼앗기, 고·스톱 확인 */
function finishTurn(
  s: GostopState,
  seat: number,
  p: PendingTurn,
  events: GameEvent[],
): void {
  p.captures.push(...p.handPair);
  p.handPair = [];
  p.options = [];
  const mine = s.captured[seat] as string[];
  mine.push(...p.captures);
  if (p.captures.length > 0)
    events.push({ type: "captured", seat, cards: [...p.captures] });
  const over = roundOver(s);
  // 싹쓸이: 바닥을 다 쓸면 피를 빼앗는다(판 마지막 차례는 빼고).
  if (s.floor.length === 0 && p.captures.length > 0 && !over) {
    p.steals += 1;
    events.push({ type: "special", seat, kind: "sweep" });
  }
  for (let other = 0; other < s.rules.players; other++) {
    if (other === seat) continue;
    const theirs = s.captured[other] as string[];
    for (let k = 0; k < p.steals; k++) {
      const card = piToGive(theirs);
      if (card === null) break;
      remove(theirs, [card]);
      mine.push(card);
      events.push({ type: "stolen", from: other, to: seat, card });
    }
  }
  s.lastTurn = p;
  s.pending = null;
  const score = scoreCaptured(mine, s.rules.gukjin).total;
  if (score >= goThreshold(s.rules) && score > (s.lastGoScore[seat] ?? 0)) {
    // 마지막 차례면 고를 불러도 더 할 게 없어 바로 스톱이다.
    if (over) settleStop(s, seat, events);
    else s.stage = "goStop";
    return;
  }
  nextTurn(s, events);
}

function nextTurn(s: GostopState, events: GameEvent[]): void {
  s.stage = "play";
  if (roundOver(s)) {
    settleNagari(s, events);
    return;
  }
  const n = s.rules.players;
  for (let k = 1; k <= n; k++) {
    const seat = (s.turn + k) % n;
    if ((s.hands[seat]?.length ?? 0) > 0 || (s.flipOwed[seat] ?? 0) > 0) {
      s.turn = seat;
      return;
    }
  }
}

/* ---------- 정산 ---------- */

function emptySettlement(s: GostopState, kind: Settlement["kind"]): Settlement {
  const n = s.rules.players;
  return {
    kind,
    winner: null,
    breakdown: null,
    goCount: 0,
    goBonus: 0,
    goDouble: 1,
    shakeDouble: 1,
    nagariDouble: 2 ** s.nagari,
    points: 0,
    baks: Array.from({ length: n }, () => []),
    deltas: zeros(n),
    payer: null,
  };
}

/** 스톱한 사람의 정산: 점수 × 고·흔들기·나가리 배수, 진 사람마다 박 */
export function settlementFor(s: GostopState, winner: number): Settlement {
  const out = emptySettlement(s, "stop");
  const n = s.rules.players;
  const breakdown = scoreCaptured(s.captured[winner] ?? [], s.rules.gukjin);
  const go = s.goCount[winner] ?? 0;
  out.winner = winner;
  out.breakdown = breakdown;
  out.goCount = go;
  out.goBonus = go;
  out.goDouble = go >= 3 ? 2 ** (go - 2) : 1;
  out.shakeDouble = 2 ** (s.shakes[winner] ?? 0);
  out.points =
    (breakdown.total + out.goBonus) *
    out.goDouble *
    out.shakeDouble *
    out.nagariDouble;
  const amounts = zeros(n);
  for (let seat = 0; seat < n; seat++) {
    if (seat === winner) continue;
    const theirs = s.captured[seat] ?? [];
    const baks: Bak[] = [];
    if (breakdown.pi > 0 && piCountOf(theirs, s.rules.gukjin) < PIBAK_UNDER)
      baks.push("pi");
    if (
      breakdown.gwang > 0 &&
      !theirs.some((id) => cardOf(id).kind === "gwang")
    )
      baks.push("gwang");
    if (breakdown.counts.animal >= MEONGBAK_ANIMALS) baks.push("meong");
    if ((s.goCount[seat] ?? 0) > 0) baks.push("go");
    out.baks[seat] = baks;
    amounts[seat] = out.points * 2 ** baks.length;
  }
  // 3명: 고를 부르고 진 사람이 진 사람 몫을 모두 낸다(고박 독박).
  const goLosers = [...Array(n).keys()].filter(
    (seat) => seat !== winner && (s.goCount[seat] ?? 0) > 0,
  );
  if (n === 3 && goLosers.length > 0) {
    const payer =
      s.lastGoSeat !== null && goLosers.includes(s.lastGoSeat)
        ? s.lastGoSeat
        : (goLosers[0] as number);
    out.payer = payer;
    const total = amounts.reduce((a, b) => a + b, 0);
    out.deltas[payer] = -total;
    out.deltas[winner] = total;
  } else {
    let total = 0;
    for (let seat = 0; seat < n; seat++) {
      if (seat === winner) continue;
      out.deltas[seat] = -(amounts[seat] ?? 0);
      total += amounts[seat] ?? 0;
    }
    out.deltas[winner] = total;
  }
  return out;
}

function settleStop(s: GostopState, seat: number, events: GameEvent[]): void {
  finishRound(s, settlementFor(s, seat), events);
}

function settleNagari(s: GostopState, events: GameEvent[]): void {
  finishRound(s, emptySettlement(s, "nagari"), events);
}

function settleChongtong(
  s: GostopState,
  seat: number,
  month: Month,
  events: GameEvent[],
): void {
  const out = emptySettlement(s, "chongtong");
  out.winner = seat;
  out.month = month;
  out.points = CHONGTONG_POINTS * out.nagariDouble;
  for (let other = 0; other < s.rules.players; other++) {
    if (other === seat) continue;
    out.deltas[other] = -out.points;
    out.deltas[seat] = (out.deltas[seat] ?? 0) + out.points;
  }
  finishRound(s, out, events);
}

function finishRound(
  s: GostopState,
  settlement: Settlement,
  events: GameEvent[],
): void {
  s.result = settlement;
  s.history = [...s.history, settlement];
  s.scores = s.scores.map((v, i) => v + (settlement.deltas[i] ?? 0));
  s.nagari = settlement.winner === null ? s.nagari + 1 : 0;
  s.stage = "play";
  s.pending = null;
  s.continued = s.scores.map(() => false);
  s.phase = s.roundNumber >= s.rules.rounds ? "gameOver" : "roundEnd";
  events.push({ type: "roundEnded", settlement, scores: [...s.scores] });
  if (s.phase === "gameOver")
    events.push({ type: "gameEnded", scores: [...s.scores] });
}

/* ---------- 걸음 ---------- */

/** 행동 하나를 적용한다. 잘못된 행동은 한국어 오류로 거절한다 */
export function step(
  state: GostopState,
  seat: number,
  action: Action,
): StepResult {
  if (seat < 0 || seat >= state.rules.players) return fail("없는 자리다");
  if (state.phase === "gameOver") return fail("게임이 끝났다");
  const s = cloneState(state);
  const events: GameEvent[] = [];
  if (action.type === "retire") {
    s.phase = "gameOver";
    s.retired = true;
    events.push({ type: "gameEnded", scores: [...s.scores], retired: true });
    return { ok: true, state: s, events };
  }
  if (s.phase === "roundEnd") {
    if (action.type !== "continue")
      return fail("판이 끝났다. 다음 판을 누른다");
    if (s.continued[seat]) return fail("이미 다음 판을 눌렀다");
    s.continued[seat] = true;
    if (s.continued.every(Boolean)) {
      s.roundNumber += 1;
      s.dealer = s.result?.winner ?? s.dealer;
      dealRound(s, events);
    }
    return { ok: true, state: s, events };
  }
  if (seat !== s.turn) return fail("내 차례가 아니다");
  let error: string | null = null;
  switch (s.stage) {
    case "play":
      if (action.type === "play")
        error = playCard(s, seat, action.card, action.shake === true, events);
      else if (action.type === "bomb")
        error = bomb(s, seat, action.month, events);
      else if (action.type === "flip") {
        if ((s.flipOwed[seat] ?? 0) <= 0)
          error = "뒤집기만 하는 차례가 남지 않았다";
        else {
          s.flipOwed[seat] = (s.flipOwed[seat] ?? 0) - 1;
          events.push({ type: "flipOnly", seat });
          flipPhase(s, seat, newPending(null), events);
        }
      } else error = "카드를 낼 차례다";
      break;
    case "chooseHand":
    case "chooseFlip": {
      const p = s.pending;
      if (action.type !== "choose" || !p) {
        error = "먹을 바닥 카드를 고를 차례다";
        break;
      }
      if (!p.options.includes(action.card)) {
        error = "고를 수 있는 카드가 아니다";
        break;
      }
      remove(s.floor, [action.card]);
      events.push({ type: "chose", seat, card: action.card });
      s.pending = null;
      if (s.stage === "chooseHand") {
        p.handPair = [p.card as string, action.card];
        p.matched = 2;
        p.options = [];
        s.stage = "play";
        flipPhase(s, seat, p, events);
      } else {
        p.captures.push(p.flipped as string, action.card);
        p.options = [];
        s.stage = "play";
        finishTurn(s, seat, p, events);
      }
      break;
    }
    case "goStop": {
      const score = scoreCaptured(s.captured[seat] ?? [], s.rules.gukjin).total;
      if (action.type === "go") {
        const count = (s.goCount[seat] ?? 0) + 1;
        s.goCount[seat] = count;
        s.lastGoScore[seat] = score;
        s.lastGoSeat = seat;
        events.push({ type: "go", seat, count, score });
        nextTurn(s, events);
      } else if (action.type === "stop") {
        events.push({ type: "stopped", seat, score });
        settleStop(s, seat, events);
      } else error = "고 또는 스톱을 고를 차례다";
      break;
    }
  }
  if (error !== null) return fail(error);
  return { ok: true, state: s, events };
}

/* ---------- 화면 ---------- */

export function decisionFor(s: GostopState, seat: number): Decision | null {
  if (s.phase === "gameOver") return null;
  if (s.phase === "roundEnd")
    return s.continued[seat] ? null : { kind: "continue" };
  if (seat !== s.turn) return null;
  if (s.stage === "chooseHand" || s.stage === "chooseFlip")
    return {
      kind: "choose",
      options: [...(s.pending?.options ?? [])],
      source: s.stage === "chooseHand" ? "hand" : "flip",
    };
  if (s.stage === "goStop")
    return {
      kind: "goStop",
      score: scoreCaptured(s.captured[seat] ?? [], s.rules.gukjin).total,
      goCount: s.goCount[seat] ?? 0,
    };
  const hand = s.hands[seat] ?? [];
  const inHand = countMonths(hand);
  const onFloor = countMonths(s.floor);
  const shakeable = hand.filter(
    (id) =>
      inHand.get(monthOf(id)) === 3 && (onFloor.get(monthOf(id)) ?? 0) === 0,
  );
  const bombs = [...inHand.entries()]
    .filter(([m, c]) => c === 3 && onFloor.get(m) === 1)
    .map(([m]) => m);
  return {
    kind: "play",
    cards: [...hand],
    shakeable,
    bombs,
    flip: (s.flipOwed[seat] ?? 0) > 0,
  };
}

export function pendingSeats(s: GostopState): number[] {
  if (s.phase === "gameOver") return [];
  if (s.phase === "roundEnd")
    return s.continued.flatMap((c, i) => (c ? [] : [i]));
  return [s.turn];
}

/** 한 자리에서 보이는 것. 남의 손패·더미 순서·시드는 장수만 남긴다 */
export function viewOf(s: GostopState, seat: number): GostopView {
  const { hands, deck, seed: _seed, preset: _preset, ...open } = s;
  return {
    ...open,
    floor: [...s.floor],
    captured: s.captured.map((c) => [...c]),
    stacks: s.stacks.map((x) => ({ ...x })),
    pending: s.pending ? clonePending(s.pending) : null,
    lastTurn: s.lastTurn ? clonePending(s.lastTurn) : null,
    goCount: [...s.goCount],
    lastGoScore: [...s.lastGoScore],
    shakes: [...s.shakes],
    revealed: s.revealed.map((r) => [...r]),
    flipOwed: [...s.flipOwed],
    ppeok: [...s.ppeok],
    scores: [...s.scores],
    history: [...s.history],
    continued: [...s.continued],
    mySeat: seat,
    hand: [...(hands[seat] ?? [])],
    handCounts: hands.map((h) => h.length),
    deckCount: deck.length,
    liveScores: s.captured.map((c) => scoreCaptured(c, s.rules.gukjin).total),
    decision: decisionFor(s, seat),
  };
}

/** 시작 조건과 행동 기록으로 처음부터 다시 돌린다(이어하기, 온라인 판 끝 검증, 복기) */
export function replay(
  rules: GostopRules,
  seed: number,
  log: readonly LoggedAction[],
  preset?: PresetDeal,
):
  | { ok: true; state: GostopState }
  | { ok: false; index: number; error: string } {
  let { state } = createMatch(rules, seed, preset);
  for (const [index, { seat, action }] of log.entries()) {
    const result = step(state, seat, action);
    if (!result.ok) return { ok: false, index, error: result.error };
    state = result.state;
  }
  return { ok: true, state };
}
