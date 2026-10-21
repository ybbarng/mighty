"use client";

import { heuristicBot } from "@mighty/ai";
import {
  type Action,
  type Card,
  createMatch,
  createRng,
  decisionFor,
  type LoggedAction,
  type MatchState,
  presetRules,
  step,
  viewOf,
} from "@mighty/engine";
import {
  encodedDeck,
  GROUP_1024,
  Party,
  PublicLedger,
} from "@mighty/fair-play";
import { useEffect, useMemo, useState } from "react";

import { cardLabel } from "@/game/terms";
import { cn } from "@/lib/cn";
import { commit, deriveSeed } from "@/net/fairness";
import {
  createHostIdentity,
  type HostIdentity,
  verifyHostProof,
  welcomeStatement,
} from "@/net/identity";

const rules = presetRules("standard5");

function CardChip({ card, dim = false }: { card: Card; dim?: boolean }) {
  const red = card.startsWith("H") || card.startsWith("D");
  return (
    <span
      className={cn(
        "inline-block rounded bg-white px-1 font-semibold text-[11px] leading-5",
        red ? "text-red-600" : "text-black",
        dim && "opacity-40",
      )}
    >
      {cardLabel(card)}
    </span>
  );
}

function Box({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/40 p-4">
      <div className="font-semibold text-sky-200 text-xs uppercase tracking-wide">
        ▶ 직접 해 보기 · {title}
      </div>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-40",
        active
          ? "border-amber-300 bg-amber-300 text-black"
          : "border-white/20 bg-white/5 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Result({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 font-mono text-xs",
        ok
          ? "bg-emerald-900/60 text-emerald-200"
          : "bg-rose-900/60 text-rose-200",
      )}
    >
      {ok ? "✓ " : "✗ "}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 1. 기기마다 받는 데이터                                              */
/* ------------------------------------------------------------------ */

export function ViewFilterDemo() {
  const [seed, setSeed] = useState(7);
  const [seat, setSeat] = useState(1);
  const { state } = useMemo(() => createMatch({ rules, seed }), [seed]);
  const view = viewOf(state, seat);
  const names = ["방장(0)", "철수(1)", "영희(2)", "민준(3)", "서연(4)"];
  const json = JSON.stringify(
    {
      seat: view.seat,
      hand: view.hand,
      handCounts: view.handCounts,
      kittyCount: view.kittyCount,
      phase: view.phase,
    },
    null,
    1,
  );
  return (
    <Box title="방장이 가진 것과 참가자가 받는 것">
      <p className="text-xs opacity-80">
        아래는 실제 엔진(<code>createMatch</code>)으로 나눈 한 판입니다. 왼쪽은
        엔진을 돌리는 방장 기기의 메모리, 오른쪽은{" "}
        <code>viewOf(state, seat)</code>로 만들어 그 자리에 보내는 데이터입니다.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs opacity-70">받는 자리</span>
        {[1, 2, 3, 4].map((s) => (
          <Btn key={s} active={s === seat} onClick={() => setSeat(s)}>
            {names[s]}
          </Btn>
        ))}
        <Btn onClick={() => setSeed((n) => n + 1)}>다시 섞기</Btn>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-lg bg-black/40 p-3">
          <div className="text-xs opacity-70">
            방장 기기: MatchState.round.hands
          </div>
          {state.round.hands.map((hand, s) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 자리 순서가 곧 정체다
            <div key={s} className="flex flex-wrap items-center gap-0.5">
              <span
                className={cn(
                  "w-14 shrink-0 text-[11px]",
                  s === seat && "font-bold text-amber-300",
                )}
              >
                {names[s]}
              </span>
              {hand.map((c) => (
                <CardChip key={c} card={c} dim={s !== seat} />
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-0.5">
            <span className="w-14 shrink-0 text-[11px]">바닥</span>
            {state.round.deck.map((c) => (
              <CardChip key={c} card={c} dim />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg bg-black/40 p-3">
          <div className="text-xs opacity-70">
            {names[seat]}에게 가는 snapshot.view (일부)
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-snug">
            {json}
          </pre>
          <p className="text-[11px] opacity-70">
            남의 손패는 장수(<code>handCounts</code>)만, 바닥 카드는 장수 (
            <code>kittyCount</code>)만 갑니다. 난수 상태(<code>rng</code>)도
            빠집니다.
          </p>
        </div>
      </div>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* 2. commit-reveal                                                    */
/* ------------------------------------------------------------------ */

export function CommitRevealDemo() {
  const players = ["방장", "철수", "영희"];
  const [secrets, setSecrets] = useState([
    "host-secret-42",
    "chulsoo-7",
    "younghee-9",
  ]);
  const [hashes, setHashes] = useState<string[] | null>(null);
  const [stage, setStage] = useState(0);
  const [cheat, setCheat] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; seed: number; hand: Card[] }
    | { ok: false; reason: string }
    | null
  >(null);

  const reset = () => {
    setStage(0);
    setHashes(null);
    setResult(null);
  };

  const commitAll = async () => {
    setHashes(await Promise.all(secrets.map((s) => commit(s))));
    setStage(1);
  };

  const reveal = async () => {
    if (!hashes) return;
    // 방장이 참가자 값을 본 뒤 자기 값을 바꿔치기하는 경우
    const revealed = secrets.map((secret, seat) => ({
      seat,
      secret: seat === 0 && cheat ? `${secret}-바꿔치기` : secret,
    }));
    const derived = await deriveSeed(
      hashes.map((hash, seat) => ({ seat, hash })),
      revealed,
    );
    if (!derived.ok) setResult(derived);
    else {
      const { state } = createMatch({ rules, seed: derived.seed });
      setResult({
        ok: true,
        seed: derived.seed,
        hand: state.round.hands[1] ?? [],
      });
    }
    setStage(2);
  };

  return (
    <Box title="commit-reveal로 시드 만들기">
      <p className="text-xs opacity-80">
        세 사람이 각자 비밀 값을 정합니다. 실제 코드(<code>fairness.ts</code>의{" "}
        <code>commit</code>, <code>deriveSeed</code>)를 그대로 씁니다.
      </p>
      <div className="flex flex-col gap-1.5">
        {players.map((name, i) => (
          <label key={name} className="flex items-center gap-2 text-xs">
            <span className="w-10 shrink-0">{name}</span>
            <input
              value={secrets[i]}
              disabled={stage > 0}
              onChange={(e) =>
                setSecrets((s) =>
                  s.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
              className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 font-mono"
            />
            {hashes && (
              <span className="hidden w-40 truncate font-mono text-[10px] opacity-60 sm:inline">
                h={hashes[i]}
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => void commitAll()} disabled={stage !== 0}>
          ① 해시만 먼저 공개
        </Btn>
        <Btn onClick={() => void reveal()} disabled={stage !== 1}>
          ② 비밀 값 공개 → 시드
        </Btn>
        <Btn
          onClick={() => setCheat((c) => !c)}
          active={cheat}
          disabled={stage === 2}
        >
          방장이 ②에서 자기 값을 바꿔치기
        </Btn>
        <Btn onClick={reset}>처음부터</Btn>
      </div>
      {stage >= 1 && (
        <p className="text-[11px] opacity-70">
          ①에서 방장은 자기 해시까지 모두 알렸습니다. 이제 참가자 값을 본 뒤
          자기 값을 바꾸면 해시가 맞지 않습니다.
        </p>
      )}
      {result &&
        (result.ok ? (
          <Result ok>
            seed = SHA-256(r0|r1|r2) 앞 32비트 = {result.seed} → 철수의 패:{" "}
            {result.hand.map(cardLabel).join(" ")}
          </Result>
        ) : (
          <Result ok={false}>참가자 검증 실패: {result.reason}</Result>
        ))}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* 3. 판 끝 다시 돌리기                                                 */
/* ------------------------------------------------------------------ */

/** 봇 다섯이 첫 몇 턴을 둔 기록 */
function sampleGame(seed: number, actions: number) {
  let { state } = createMatch({ rules, seed });
  const log: LoggedAction[] = [];
  const rng = createRng(seed);
  for (let i = 0; i < 400 && log.length < actions; i++) {
    const seat = state.order.find((s) => decisionFor(state, s) !== null);
    if (seat === undefined) break;
    const action = heuristicBot.decide(viewOf(state, seat), rng);
    const r = step(state, seat, action);
    if (!r.ok) break;
    state = r.state;
    log.push({ seat, action });
  }
  return log;
}

function viewsAlong(log: readonly LoggedAction[], seed: number, seat: number) {
  let { state }: { state: MatchState } = createMatch({ rules, seed });
  const views = [JSON.stringify(viewOf(state, seat))];
  for (const [index, entry] of log.entries()) {
    const r = step(state, entry.seat, entry.action);
    if (!r.ok) return { views, error: { index, reason: r.error } };
    state = r.state;
    views.push(JSON.stringify(viewOf(state, seat)));
  }
  return { views, error: null };
}

function describe(action: Action): string {
  switch (action.type) {
    case "bid":
      return `공약 ${action.goal.kiruda}${action.goal.score}`;
    case "pass":
      return "포기";
    case "play":
      return `${cardLabel(action.card)} 냄`;
    case "exchange":
      return `교환(${action.discard.map(cardLabel).join(" ")} 버림)`;
    case "friend":
      return "프렌드 선언";
    default:
      return action.type;
  }
}

export function ReplayAuditDemo() {
  const seed = 2024;
  const original = useMemo(() => sampleGame(seed, 40), []);
  const [log, setLog] = useState<LoggedAction[]>(original);
  const [tamperView, setTamperView] = useState(false);
  const me = 1;
  // 참가자(철수)가 게임 중 실제로 받은 화면들: 정직한 방장이 보낸 것
  const received = useMemo(() => {
    const { views } = viewsAlong(original, seed, me);
    if (!tamperView) return views;
    const copy = [...views];
    const i = Math.floor(copy.length / 2);
    const v = JSON.parse(copy[i] as string);
    v.money = v.money.map(() => 0);
    copy[i] = JSON.stringify(v);
    return copy;
  }, [original, tamperView]);

  const audit = useMemo(() => {
    const { views, error } = viewsAlong(log, seed, me);
    if (error)
      return {
        ok: false,
        text: `기록 ${error.index + 1}번째 행동이 규칙에 맞지 않는다 (${error.reason})`,
      };
    if (views.at(-1) !== received.at(-1))
      return {
        ok: false,
        text: "다시 계산한 마지막 화면이 내가 본 화면과 다르다",
      };
    let cursor = 0;
    for (const [i, seen] of received.entries()) {
      while (cursor < views.length && views[cursor] !== seen) cursor++;
      if (cursor === views.length)
        return {
          ok: false,
          text: `게임 중 받은 ${i + 1}번째 화면이 기록과 맞지 않는다`,
        };
    }
    return {
      ok: true,
      text: `기록 ${log.length}개를 다시 돌린 결과와 받은 화면 ${received.length}개가 모두 맞다`,
    };
  }, [log, received]);

  const tamper = (index: number) => {
    setLog((current) =>
      current.map((entry, i) => {
        if (i !== index || entry.action.type !== "play") return entry;
        // 같은 사람의 다른 카드로 바꿔 본다(대개 무늬 따라내기 위반이거나 결과가 달라진다)
        const card = entry.action.card;
        const other: Card = card.startsWith("S") ? "HA" : "SA";
        return { ...entry, action: { ...entry.action, card: other } };
      }),
    );
  };

  return (
    <Box title="판 끝에 다시 돌려 맞춰 보기">
      <p className="text-xs opacity-80">
        봇 다섯이 둔 실제 기록입니다. 방장이 공개한 기록을 참가자(철수)가{" "}
        <code>step</code>으로 처음부터 다시 돌려, 게임 중 받은 화면과 맞춰
        봅니다. 카드 내기 줄의 <b>조작</b>을 눌러 방장이 기록을 바꿨다고 해
        보세요.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => setTamperView((t) => !t)} active={tamperView}>
          방장이 게임 중 화면 하나를 조작해 보냄
        </Btn>
        <Btn
          onClick={() => {
            setLog(original);
            setTamperView(false);
          }}
        >
          되돌리기
        </Btn>
      </div>
      <Result ok={audit.ok}>{audit.text}</Result>
      <ol className="max-h-56 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[11px]">
        {log.map((entry, i) => {
          const changed = JSON.stringify(entry) !== JSON.stringify(original[i]);
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 기록 순서가 곧 정체다
              key={i}
              className={cn(
                "flex items-center gap-2 py-0.5",
                changed && "text-rose-300",
              )}
            >
              <span className="w-6 text-right opacity-50">{i + 1}</span>
              <span className="w-10">자리 {entry.seat}</span>
              <span className="flex-1">{describe(entry.action)}</span>
              {entry.action.type === "play" && !changed && (
                <button
                  type="button"
                  onClick={() => tamper(i)}
                  className="rounded bg-rose-500/30 px-1.5 hover:bg-rose-500/50"
                >
                  조작
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* 4. 방장 서명                                                         */
/* ------------------------------------------------------------------ */

export function HostSignatureDemo() {
  const [host, setHost] = useState<HostIdentity | null>(null);
  const [fake, setFake] = useState<HostIdentity | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  useEffect(() => {
    void createHostIdentity().then(setHost);
    void createHostIdentity().then(setFake);
  }, []);
  const guestPeer = "guest-peer-a1";
  const nonce = "n-8f3c1e";
  const fields = {
    game: "mighty",
    nonce,
    peerId: guestPeer,
    seat: 1,
    token: "tok",
  };

  const run = async (kind: "real" | "fake" | "mitm" | "none") => {
    if (!host || !fake) return;
    if (kind === "none") {
      setResult({
        ok: false,
        text: '서명이 없는 "어서 와" → 방장으로 믿지 않는다',
      });
      return;
    }
    const signer = kind === "fake" ? fake : host;
    const statement = welcomeStatement(
      kind === "mitm" ? { ...fields, peerId: "attacker-peer-x9" } : fields,
    );
    const sig = await signer.sign(statement);
    const ok = await verifyHostProof(
      host.fingerprint,
      { key: signer.publicKey, sig },
      welcomeStatement(fields),
    );
    setResult({
      ok,
      text: ok
        ? "지문 일치 · 서명 일치 · 서명된 연결 아이디가 내 것 → 방장으로 믿는다"
        : kind === "fake"
          ? "공개 열쇠의 지문이 링크(k=)와 다르다 → 무시"
          : "서명된 연결 아이디가 내 것이 아니다(중간자) → 무시",
    });
  };

  return (
    <Box title="초대 링크의 열쇠 지문으로 방장 확인">
      <p className="text-xs opacity-80">
        이 브라우저에서 방금 실제로 ECDSA P-256 열쇠 쌍 두 개(진짜 방장, 가짜
        방장)를 만들었습니다(<code>identity.ts</code>).
      </p>
      <div className="rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
        <div>
          초대 링크: …/?room=ab12cd&amp;k=
          <span className="text-amber-300">{host?.fingerprint ?? "…"}</span>
        </div>
        <div className="opacity-70">서명 문장: {welcomeStatement(fields)}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => void run("real")} disabled={!host}>
          진짜 방장이 답함
        </Btn>
        <Btn onClick={() => void run("none")}>
          링크 아는 사람이 서명 없이 답함
        </Btn>
        <Btn onClick={() => void run("fake")} disabled={!fake}>
          가짜 방장이 자기 열쇠로 서명
        </Btn>
        <Btn onClick={() => void run("mitm")} disabled={!host}>
          중간자가 진짜 방장 서명을 전달
        </Btn>
      </div>
      {result && <Result ok={result.ok}>{result.text}</Result>}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* 5. 채팅 경로                                                         */
/* ------------------------------------------------------------------ */

export function ChatRoutingDemo() {
  const people = ["방장", "철수", "영희"];
  const [sender, setSender] = useState(1);
  const [claim, setClaim] = useState(2);
  const shown = sender === 0 ? people[claim] : people[sender]; // 방장만 이름을 마음대로 붙일 수 있다
  return (
    <Box title="채팅에서 다른 사람인 척하기">
      <p className="text-xs opacity-80">
        참가자의 말은 방장에게만 가고, 방장이 <b>보낸 연결</b>로 자리를 찾아
        이름을 붙여 모두에게 다시 보냅니다(<code>host-room.ts</code>의{" "}
        <code>seatOf(from)</code>). 메시지 안에 이름을 적어 보내도 쓰이지
        않습니다.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="opacity-70">보내는 사람(고친 프로그램)</span>
        {people.map((p, i) => (
          <Btn key={p} active={i === sender} onClick={() => setSender(i)}>
            {p}
          </Btn>
        ))}
        <span className="ml-2 opacity-70">사칭하려는 이름</span>
        {people.map((p, i) => (
          <Btn key={p} active={i === claim} onClick={() => setClaim(i)}>
            {p}
          </Btn>
        ))}
      </div>
      <svg
        viewBox="0 0 320 110"
        className="w-full max-w-md"
        role="img"
        aria-label="채팅이 방장을 거쳐 퍼지는 그림"
      >
        <title>채팅 경로</title>
        {[
          [40, 85, "철수"],
          [280, 85, "영희"],
        ].map(([x, y, n]) => (
          <g key={n as string}>
            <line
              x1={160}
              y1={25}
              x2={x as number}
              y2={(y as number) - 12}
              stroke="currentColor"
              strokeOpacity={0.4}
            />
            <circle cx={x as number} cy={y as number} r={14} fill="#0c4a6e" />
            <text
              x={x as number}
              y={(y as number) + 4}
              textAnchor="middle"
              fontSize={9}
              fill="white"
            >
              {n}
            </text>
          </g>
        ))}
        <circle cx={160} cy={25} r={16} fill="#92400e" />
        <text x={160} y={29} textAnchor="middle" fontSize={9} fill="white">
          방장
        </text>
      </svg>
      <Result ok={sender !== 0}>
        모두의 화면: "{shown}: 안녕" —{" "}
        {sender === 0
          ? "방장은 모든 말을 거치므로 남의 이름으로 말을 지어낼 수 있다(한계)"
          : people[sender] === people[claim]
            ? "자기 이름으로 말했다"
            : `${people[sender]}가 ${people[claim]}인 척했지만 방장이 연결 기준으로 ${people[sender]}라고 붙였다`}
      </Result>
    </Box>
  );
}

/* ---------------------------------------------------------------------------------------------- */

const MP_CARDS: Card[] = [
  "SA",
  "JK",
  "HK",
  "D10",
  "C7",
  "S3",
  "HQ",
  "DA",
  "C2",
];
const MP_PEOPLE = ["방장", "철수", "영희"];
const MP_COLORS = ["text-amber-300", "text-sky-300", "text-pink-300"];

type MpStage = "start" | "shuffled" | "relocked" | "dealt";

interface MpState {
  parties: Party[];
  ledger: PublicLedger;
  /** 단계별 덱(보여 주기용) */
  decks: { label: string; deck: bigint[] }[];
  stage: MpStage;
  /** 자리 → 받은 사람 */
  owners: number[];
  log: string[];
  /** 낸 카드: 자리 → 카드 */
  played: Map<number, Card>;
}

function short(value: bigint): string {
  const hex = value.toString(16);
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

/** 멘탈 포커: 세 사람이 9장을 섞고 나누고 낸다. 게임의 실제 SRA 코드(packages/fair-play)를 돌린다 */
export function MentalPokerDemo() {
  const g = GROUP_1024;
  const [state, setState] = useState<MpState | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(0);

  const reset = () => {
    const parties = MP_PEOPLE.map((_, id) => new Party(id, g));
    setState({
      parties,
      ledger: new PublicLedger(g),
      decks: [
        { label: "처음(카드 번호를 수로)", deck: encodedDeck(g, MP_CARDS) },
      ],
      stage: "start",
      owners: MP_CARDS.map((_, i) => i % 3),
      log: [],
      played: new Map(),
    });
  };
  useEffect(reset, []);
  if (!state) return null;

  const run = async (task: (s: MpState) => Promise<Partial<MpState>>) => {
    setBusy(true);
    const t0 = performance.now();
    const next = await task(state);
    const ms = Math.round(performance.now() - t0);
    setState({
      ...state,
      ...next,
      log: [...(next.log ?? state.log), `  (${ms}ms)`],
    });
    setBusy(false);
  };

  const shuffle = () =>
    run(async (s) => {
      const decks = [...s.decks];
      let deck = decks.at(-1)?.deck ?? [];
      for (const p of s.parties) {
        deck = await p.lockAndShuffle(deck, "shuffle");
        decks.push({ label: `${MP_PEOPLE[p.id]}이 잠그고 섞음`, deck });
      }
      return {
        decks,
        stage: "shuffled",
        log: [
          ...s.log,
          "1. 셋이 차례로 자기 열쇠로 잠그고 섞었다. 이제 누구도 어느 자리가 무슨 카드인지 모른다.",
        ],
      };
    });

  const relock = () =>
    run(async (s) => {
      let deck = s.decks.at(-1)?.deck ?? [];
      const slots = deck.map((_, i) => i);
      for (const p of s.parties)
        deck = await p.relock(deck, slots, ["shuffle"]);
      s.ledger.extend(deck);
      return {
        decks: [...s.decks, { label: "자리마다 다른 열쇠로 다시 잠금", deck }],
        stage: "relocked",
        log: [
          ...s.log,
          "2. 각자 섞기 열쇠를 풀고 자리마다 다른 열쇠로 다시 잠갔다. 한 자리 열쇠를 공개해도 다른 자리는 안전하다.",
        ],
      };
    });

  const deal = () =>
    run(async (s) => {
      s.owners.forEach((owner, slot) => {
        for (const other of s.parties)
          if (other.id !== owner)
            s.ledger.publish(slot, other.id, other.revealKey(slot, "deal"));
        const party = s.parties[owner] as Party;
        party.receive(
          slot,
          s.ledger.deck[slot] as bigint,
          s.parties
            .filter((p) => p.id !== owner)
            .map((p) => s.ledger.keys.get(slot)?.get(p.id) as bigint),
        );
      });
      return {
        stage: "dealt",
        log: [
          ...s.log,
          "3. 자리마다 받을 사람을 뺀 둘이 열쇠를 공개했다. 받는 사람만 마지막 자물쇠를 풀어 자기 카드를 본다.",
        ],
      };
    });

  const play = (slot: number, claim?: Card) =>
    run(async (s) => {
      const owner = s.owners[slot] as number;
      const party = s.parties[owner] as Party;
      const real = party.hand.get(slot) as Card;
      s.ledger.publish(slot, owner, party.revealKey(slot, "play"));
      const opened = s.ledger.open(slot, [0, 1, 2]);
      const said = claim ?? real;
      const played = new Map(s.played);
      if (opened === said) played.set(slot, opened);
      return {
        played,
        log: [
          ...s.log,
          opened === said
            ? `4. ${MP_PEOPLE[owner]}이 ${slot}번 자리 열쇠를 공개하고 ${cardLabel(said)}를 냈다. 모두가 열어 보니 ${cardLabel(opened as Card)} — 맞다.`
            : `⚠ ${MP_PEOPLE[owner]}이 ${cardLabel(said)}를 낸다고 했지만 열쇠로 연 ${slot}번 자리는 ${opened ? cardLabel(opened) : "카드가 아님"} — 모두의 화면에 ${MP_PEOPLE[owner]}의 부정으로 찍힌다.`,
        ],
      };
    });

  const deck = state.decks.at(-1)?.deck ?? [];
  const viewer = state.parties[view] as Party;
  const canSee = (slot: number): Card | null => {
    const played = state.played.get(slot);
    if (played) return played;
    if (state.stage === "dealt" && state.owners[slot] === view)
      return viewer.hand.get(slot) ?? null;
    return null;
  };

  return (
    <Box title="멘탈 포커(세 사람, 카드 9장)">
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() => void shuffle()}
          disabled={busy || state.stage !== "start"}
        >
          1. 섞기
        </Btn>
        <Btn
          onClick={() => void relock()}
          disabled={busy || state.stage !== "shuffled"}
        >
          2. 자리마다 다시 잠그기
        </Btn>
        <Btn
          onClick={() => void deal()}
          disabled={busy || state.stage !== "relocked"}
        >
          3. 나눠 주기
        </Btn>
        <Btn onClick={reset} disabled={busy}>
          처음부터
        </Btn>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="opacity-70">누구 화면으로 볼까:</span>
        {MP_PEOPLE.map((name, i) => (
          <Btn key={name} onClick={() => setView(i)} active={view === i}>
            {name}
          </Btn>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="opacity-60">
            <tr>
              <th className="pr-2">자리</th>
              <th className="pr-2">덱의 값(공개 정보)</th>
              <th className="pr-2">받은 사람</th>
              <th>{MP_PEOPLE[view]} 화면</th>
            </tr>
          </thead>
          <tbody>
            {deck.map((value, slot) => {
              const seen = canSee(slot);
              const owner = state.owners[slot] as number;
              return (
                <tr
                  key={value.toString(16)}
                  className="border-white/10 border-t"
                >
                  <td className="py-1 pr-2">{slot}</td>
                  <td className="pr-2 opacity-80">{short(value)}</td>
                  <td className={cn("pr-2", MP_COLORS[owner])}>
                    {state.stage === "dealt" ? MP_PEOPLE[owner] : "—"}
                  </td>
                  <td>
                    {seen ? (
                      <CardChip card={seen} />
                    ) : (
                      <span className="opacity-40">열 수 없음</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {state.stage === "dealt" && (
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="opacity-70">
            철수 차례: 카드를 내 보세요(정직하게, 또는 고친 프로그램으로).
          </div>
          <div className="flex flex-wrap gap-1.5">
            {state.owners
              .map((o, slot) => ({ o, slot }))
              .filter(({ o, slot }) => o === 1 && !state.played.has(slot))
              .map(({ slot }) => {
                const real = state.parties[1]?.hand.get(slot) as Card;
                return (
                  <Btn
                    key={slot}
                    onClick={() => void play(slot)}
                    disabled={busy}
                  >
                    {cardLabel(real)} 내기
                  </Btn>
                );
              })}
            {state.owners.some(
              (o, slot) => o === 1 && !state.played.has(slot),
            ) && (
              <Btn
                onClick={() => {
                  const slot = state.owners.findIndex(
                    (o, s) => o === 1 && !state.played.has(s),
                  );
                  const real = state.parties[1]?.hand.get(slot);
                  void play(slot, real === "SA" ? "HK" : "SA");
                }}
                disabled={busy}
              >
                고친 프로그램: 다른 카드라고 속여 내기
              </Btn>
            )}
          </div>
        </div>
      )}
      <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[11px] leading-relaxed">
        {state.log.length === 0
          ? "1번부터 눌러 보세요. 방장 화면으로 봐도 남의 카드는 '열 수 없음'입니다."
          : state.log.join("\n")}
      </pre>
    </Box>
  );
}
