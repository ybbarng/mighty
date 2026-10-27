"use client";

import { useEffect, useState } from "react";
import { SuitText } from "@/components/SuitText";
import { Box, Btn, Result } from "@/components/security/demos";
import { cn } from "@/lib/cn";

/*
 * 작은 수로 원리를 보여 주는 장난감들. 실제 게임은 타원곡선(ristretto255)을 쓰지만, 원리는 23 같은 작은 소수로도 같다.
 * 작은 군: 안전 소수 p = 23 = 2·11 + 1, 이차잉여(제곱수) 11개가 크기 q = 11의 부분군이고 g = 4가 생성원이다.
 */

const P = 23;
const Q = 11;
const G = 4;

/** 거듭제곱 나머지(작은 수) */
function pow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return result;
}

/** 역원(작은 소수 mod) */
function inv(x: number, mod: number): number {
  return pow(x, mod - 2, mod);
}

function rand(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) % n;
}

/** 제곱수(이차잉여) mod 23 */
const QR = [1, 2, 3, 4, 6, 8, 9, 12, 13, 16, 18];

/** 장난감 카드: 이름 → 수(제곱수) */
const TOY_CARDS: [string, number][] = [
  ["♠A", 4],
  ["♥K", 9],
  ["◆Q", 16],
  ["♣J", 2],
  ["♠10", 13],
  ["조커", 3],
];

function Num({ children }: { children: React.ReactNode }) {
  return (
    <b className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-amber-200">
      {children}
    </b>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="w-20 text-white/70">{label}</span>
      {options.map((o) => (
        <Btn key={o} onClick={() => onChange(o)} active={o === value}>
          {o}
        </Btn>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 교환 가능한 자물쇠: 잠근 순서와 상관없이 풀린다(SRA) */
export function LockToy() {
  const [card, setCard] = useState(0);
  const [a, setA] = useState(3);
  const [b, setB] = useState(7);
  const [name, m] = TOY_CARDS[card] as [string, number];
  const ma = pow(m, a, P);
  const mab = pow(ma, b, P);
  const mb = pow(m, b, P);
  const mba = pow(mb, a, P);
  const ai = inv(a, Q);
  const bi = inv(b, Q);
  const afterA = pow(mab, ai, P);
  const back = pow(afterA, bi, P);
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <Box title="교환 가능한 자물쇠(p = 23)">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="w-20 text-white/70">카드</span>
        {TOY_CARDS.map(([n, v], i) => (
          <Btn key={n} onClick={() => setCard(i)} active={i === card}>
            <SuitText text={n} /> = {v}
          </Btn>
        ))}
      </div>
      <Picker label="철수 열쇠 a" value={a} options={keys} onChange={setA} />
      <Picker label="영희 열쇠 b" value={b} options={keys} onChange={setB} />
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          <SuitText text={name} />는 수 <Num>{m}</Num>로 나타낸다.
        </li>
        <li>
          철수가 잠근다: {m}
          <sup>{a}</sup> mod 23 = <Num>{ma}</Num>
        </li>
        <li>
          영희가 그 위에 또 잠근다: {ma}
          <sup>{b}</sup> mod 23 = <Num>{mab}</Num>
        </li>
        <li>
          순서를 바꿔도(영희 먼저 {mb}, 그다음 철수) {mb}
          <sup>{a}</sup> = <Num>{mba}</Num> —{" "}
          {mab === mba ? "같다!" : "다르다?"}
        </li>
        <li>
          푸는 열쇠는 a의 역수 mod 11: a′ = <Num>{ai}</Num>(a·a′ = {a * ai} ≡ 1
          mod 11). 철수가 먼저 풀어도 {mab}
          <sup>{ai}</sup> = <Num>{afterA}</Num>, 영희가 마저 풀면{" "}
          <Num>{back}</Num> = <SuitText text={name} />
        </li>
      </ol>
      <Result ok={mab === mba && back === m}>
        지수끼리 곱해지므로(m^(a·b) = m^(b·a)) 누가 먼저 잠그고 풀든 같다.
        자물쇠를 겹쳐 채우고 아무 순서로나 풀 수 있는 셈이다.
      </Result>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/** 이차잉여 누출: 잠가도 "제곱수인가"는 그대로 남는다 */
export function QrLeakToy() {
  type Card = { label: string; red: boolean; value: number };
  const deal = (squaresOnly: boolean): Card[] => {
    // 빨강 카드 넷, 검정 카드 넷. 잘못된 방식은 빨강을 제곱수가 아닌 수로 나타낸다.
    const nonQr = [5, 7, 10, 11, 14, 15, 17, 19, 20, 21, 22];
    const reds = squaresOnly ? QR.slice(1, 5) : nonQr.slice(0, 4);
    const blacks = squaresOnly ? QR.slice(5, 9) : QR.slice(1, 5);
    return [
      ...reds.map((v, i) => ({ label: `♥${i + 2}`, red: true, value: v })),
      ...blacks.map((v, i) => ({ label: `♠${i + 2}`, red: false, value: v })),
    ];
  };
  const [squaresOnly, setSquaresOnly] = useState(false);
  const [locked, setLocked] = useState<(Card & { cipher: number })[] | null>(
    null,
  );
  const [guess, setGuess] = useState<Set<number>>(new Set());
  const [judged, setJudged] = useState(false);

  const lockAndShuffle = () => {
    // 22와 서로소인 홀수 열쇠(전체 군에서 잠그고 풀 수 있게)
    const keys = [3, 5, 7, 9, 13, 15, 17, 19, 21];
    const k = keys[rand(keys.length)] as number;
    const cards = deal(squaresOnly).map((c) => ({
      ...c,
      cipher: pow(c.value, k, P),
    }));
    for (let i = cards.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [cards[i], cards[j]] = [cards[j] as never, cards[i] as never];
    }
    setLocked(cards);
    setGuess(new Set());
    setJudged(false);
  };
  const euler = (x: number) => pow(x, Q, P) === 1;
  const hits = locked
    ? locked.filter((c, i) => guess.has(i) === c.red).length
    : 0;
  return (
    <Box title="잠가도 새는 1비트(이차잉여)">
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() => {
            setSquaresOnly(false);
            setLocked(null);
          }}
          active={!squaresOnly}
        >
          잘못된 방식: 빨강은 제곱수가 아닌 수로
        </Btn>
        <Btn
          onClick={() => {
            setSquaresOnly(true);
            setLocked(null);
          }}
          active={squaresOnly}
        >
          게임의 방식: 모두 제곱수로
        </Btn>
        <Btn onClick={lockAndShuffle}>상대가 잠그고 섞기</Btn>
      </div>
      {locked && (
        <>
          <p className="text-sm text-white/80">
            상대가 모르는 열쇠로 잠그고 섞었다. 어느 것이 빨강(
            <SuitText text="♥" />
            )일까? 눌러서 고르고, "판정 돌려 보기"로 수학의 힘을 빌려 보자.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {locked.map((c, i) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: 섞은 순서가 곧 정체다
                key={i}
                type="button"
                onClick={() =>
                  setGuess((g) => {
                    const next = new Set(g);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className={cn(
                  "flex w-14 flex-col items-center rounded-lg border px-1 py-1.5 font-mono text-xs",
                  guess.has(i)
                    ? "border-rose-300 bg-rose-900/60"
                    : "border-white/20 bg-white/5",
                )}
              >
                <span className="text-sm">{c.cipher}</span>
                {judged && (
                  <span className="text-[10px] text-white/70">
                    x¹¹ = {euler(c.cipher) ? "1" : "22"}
                  </span>
                )}
                {judged && (
                  <span className={c.red ? "text-rose-300" : "text-white"}>
                    <SuitText text={c.label} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Btn
              onClick={() =>
                setGuess(
                  new Set(
                    locked
                      .map((c, i) => (euler(c.cipher) ? -1 : i))
                      .filter((i) => i >= 0),
                  ),
                )
              }
            >
              판정 돌려 보기(x¹¹ mod 23)
            </Btn>
            <Btn onClick={() => setJudged(true)}>정답 보기</Btn>
          </div>
          {judged && (
            <Result ok={squaresOnly}>
              {hits}/8 맞혔다.{" "}
              {squaresOnly
                ? "모두 제곱수라 판정 값이 늘 1이다. 아무것도 알 수 없다."
                : "제곱수인지(x¹¹이 1인지)는 잠가도 바뀌지 않는다. 빨강을 제곱수가 아닌 수로 두면 잠근 뒤에도 빨강이 그대로 드러난다."}
            </Result>
          )}
        </>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 영지식 증명 맛보기(Chaum–Pedersen): V = g^u, B = A^u를 u를 보이지 않고 증명한다.
 * 정직한 증명과, 도전값을 미리 짐작해 속이는 증명을 한 걸음씩 본다
 */
export function ZkToy() {
  // 비밀 u와 A는 그린 뒤에 무작위로 고른다(미리 그려 둔 화면과 첫 화면이 같아야 한다).
  const [u, setU] = useState(5);
  const [A, setA] = useState(9);
  useEffect(() => {
    setU(2 + rand(Q - 2));
    setA(QR[1 + rand(QR.length - 1)] as number);
  }, []);
  const [cheat, setCheat] = useState(false);
  const [guessC, setGuessC] = useState(3);
  const [step, setStep] = useState(0);
  const [r, setR] = useState(0);
  const [c, setC] = useState(0);
  const V = pow(G, u, P);
  // 속이는 사람은 B를 A^u가 아닌 값으로 내세운다(같은 지수가 아니다).
  const realB = pow(A, u, P);
  const B = cheat ? (QR.find((x) => x !== realB && x !== 1) ?? 2) : realB;
  // 정직: a = g^r, b = A^r. 속임: c를 미리 짐작해 z를 먼저 고르고 a, b를 거꾸로 맞춘다.
  const zFake = r;
  const a = cheat
    ? (pow(G, zFake, P) * inv(pow(V, guessC, P), P)) % P
    : pow(G, r, P);
  const b = cheat
    ? (pow(A, zFake, P) * inv(pow(B, guessC, P), P)) % P
    : pow(A, r, P);
  const z = cheat ? zFake : (r + c * u) % Q;
  const left1 = pow(G, z, P);
  const right1 = (a * pow(V, c, P)) % P;
  const left2 = pow(A, z, P);
  const right2 = (b * pow(B, c, P)) % P;
  const ok = left1 === right1 && left2 === right2;
  const reset = (nextCheat: boolean) => {
    setCheat(nextCheat);
    setStep(0);
  };
  return (
    <Box title="영지식 증명(작은 수로)">
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => reset(false)} active={!cheat}>
          정직한 증명
        </Btn>
        <Btn onClick={() => reset(true)} active={cheat}>
          속이는 증명(같은 지수가 아니다)
        </Btn>
      </div>
      <p className="text-sm text-white/80">
        공개된 것: g = <Num>{G}</Num>, V = g<sup>u</sup> = <Num>{V}</Num>, A ={" "}
        <Num>{A}</Num>, B = <Num>{B}</Num>.{" "}
        {cheat
          ? "B는 A^u가 아니다. 그래도 증명해 보려 한다."
          : "증명할 것: B = A^u (u는 비밀)"}
      </p>
      {cheat && step === 0 && (
        <Picker
          label="미리 짐작한 c"
          value={guessC}
          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
          onChange={setGuessC}
        />
      )}
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          증명하는 사람이 먼저 a, b를 낸다.{" "}
          {step >= 1 ? (
            <>
              a = <Num>{a}</Num>, b = <Num>{b}</Num>
              {cheat
                ? ` (짐작한 c = ${guessC}에 맞춰 거꾸로 만들었다)`
                : ` (무작위 r = ${r}로 g^r, A^r)`}
            </>
          ) : (
            <Btn
              onClick={() => {
                setR(rand(Q));
                setStep(1);
              }}
            >
              a, b 내기
            </Btn>
          )}
        </li>
        <li>
          확인하는 사람이 도전값 c를 무작위로 고른다.{" "}
          {step >= 2 ? (
            <>
              c = <Num>{c}</Num>
            </>
          ) : (
            <Btn
              onClick={() => {
                setC(rand(Q));
                setStep(2);
              }}
              disabled={step < 1}
            >
              c 고르기
            </Btn>
          )}
        </li>
        <li>
          증명하는 사람이 z를 낸다.{" "}
          {step >= 2 && (
            <>
              z = <Num>{z}</Num>
              {cheat ? "" : ` (= r + c·u mod 11)`}
            </>
          )}
        </li>
        <li>
          확인: g<sup>z</sup> = a·V<sup>c</sup> 이고 A<sup>z</sup> = b·B
          <sup>c</sup>인가?{" "}
          {step >= 2 && (
            <>
              {left1} {left1 === right1 ? "=" : "≠"} {right1}, {left2}{" "}
              {left2 === right2 ? "=" : "≠"} {right2}
            </>
          )}
        </li>
      </ol>
      {step >= 2 && (
        <Result ok={cheat ? !ok : ok}>
          {cheat
            ? ok
              ? `통과해 버렸다 — c를 미리 맞혔다(1/11 확률). 실제 게임의 c는 2²⁰⁴⁷ 가지라 미리 맞힐 수 없다.`
              : "통과하지 못했다. 같은 지수가 아니면 c를 미리 알지 않는 한 두 식을 함께 맞출 수 없다."
            : "통과. z에는 무작위 r이 섞여 있어 u가 새지 않는다. 그런데 c를 미리 알면 비밀 없이도 이런 기록을 만들 수 있다(속이는 증명 참고) — 그래서 기록만으로는 u에 대해 아무것도 알 수 없다(영지식)."}
        </Result>
      )}
      {step >= 2 && <Btn onClick={() => setStep(0)}>다시 해 보기</Btn>}
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/** cut-and-choose 게임: 내가 속인 덱으로 16번을 버텨 본다 */
export function CutChooseGame() {
  const [rounds, setRounds] = useState<
    { pick: 0 | 1; coin: 0 | 1; ok: boolean }[]
  >([]);
  const [games, setGames] = useState({ played: 0, won: 0 });
  const caught = rounds.some((r) => !r.ok);
  const done = caught || rounds.length >= 16;
  const play = (pick: 0 | 1) => {
    if (done) return;
    const coin = rand(2) as 0 | 1;
    const next = [...rounds, { pick, coin, ok: pick === coin }];
    setRounds(next);
    const over = next.some((r) => !r.ok) || next.length >= 16;
    if (over)
      setGames((g) => ({
        played: g.played + 1,
        won: g.won + (next.every((r) => r.ok) ? 1 : 0),
      }));
  };
  return (
    <Box title="cut-and-choose: 속인 덱으로 버텨 보기">
      <p className="text-sm text-white/80">
        나는 섞을 때 카드 한 장을 바꿨다. 매번 중간 덱을 하나 내야 한다.
        "입력에서 정직하게" 만들면 X→Z는 보일 수 있지만 Z→Y는 못 보이고,
        "출력에서 거꾸로" 만들면 그 반대다. 상대가 동전을 던져 어느 쪽을 보일지
        정한다. 16번 모두 맞혀야 빠져나간다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => play(0)} disabled={done}>
          입력에서 정직하게(0이 나오길)
        </Btn>
        <Btn onClick={() => play(1)} disabled={done}>
          출력에서 거꾸로(1이 나오길)
        </Btn>
        <Btn onClick={() => setRounds([])}>새 판</Btn>
      </div>
      <div className="flex flex-wrap gap-1">
        {rounds.map((r, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 회 순서가 곧 정체다
            key={i}
            className={cn(
              "flex size-7 items-center justify-center rounded font-mono text-xs",
              r.ok ? "bg-emerald-700" : "bg-rose-700",
            )}
            title={`고른 쪽 ${r.pick}, 동전 ${r.coin}`}
          >
            {r.coin}
          </span>
        ))}
      </div>
      {done && (
        <Result ok={caught}>
          {caught
            ? `${rounds.length}번째에 들켰다. 한 번 버틸 확률은 ½, 16번이면 (½)¹⁶ = 1/65,536이다.`
            : "16번을 모두 버텼다! 6만 5천 판에 한 번 있을 일이다. 그래도 판 끝 확인에서 같은 카드가 드러난다."}
        </Result>
      )}
      {games.played > 0 && (
        <p className="text-xs text-white/60">
          지금까지 {games.played}판 중 {games.won}판 빠져나감
        </p>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */

async function sha256Bits(text: string, k: number): Promise<number> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  const bytes = new Uint8Array(digest);
  let n = 0;
  for (let i = 0; i < 4; i++) n = (n << 8) | (bytes[i] as number);
  return (n >>> 0) & ((1 << k) - 1);
}

/**
 * 도전값을 누가 정하나: 해시(Fiat–Shamir)로 정하면 속이는 사람이 약속을 바꿔 가며 해시를 계속 돌려
 * 원하는 도전값이 나올 때까지 시도할 수 있다. 모두가 함께 정하면 한 번뿐이다
 */
export function FiatShamirToy() {
  const [k, setK] = useState(12);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const grind = async () => {
    setRunning(true);
    setResult(null);
    const want = 0; // 속이는 사람에게 유리한 도전값(모두 0)
    const started = performance.now();
    let tries = 0;
    for (;;) {
      tries++;
      if ((await sha256Bits(`약속-${tries}`, k)) === want) break;
      if (tries % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
      if (tries > 2_000_000) break;
    }
    const ms = Math.round(performance.now() - started);
    setResult(
      `약속을 ${tries.toLocaleString()}번 바꿔 해시를 돌렸더니 원하는 도전값(${k}비트 모두 0)이 나왔다. ${ms.toLocaleString()}ms. 평균 2^${k} = ${(2 ** k).toLocaleString()}번이면 된다.`,
    );
    setRunning(false);
  };
  return (
    <Box title="도전값을 누가 정하나">
      <Picker
        label="회 수 k"
        value={k}
        options={[8, 10, 12, 14, 16, 18]}
        onChange={setK}
      />
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => void grind()} disabled={running}>
          해시로 정할 때: 속이는 사람이 계속 다시 시도
        </Btn>
      </div>
      {running && <p className="text-sm text-white/70">해시를 돌리는 중…</p>}
      {result && <Result ok={false}>{result}</Result>}
      <p className="text-sm text-white/80">
        그래서 해시로만 정하면 k를 40~64로 크게 잡아야 한다. 이 게임은 섞을 때
        각자 비밀 값(nonce)의 해시를 걸고, 모두의 약속이 모인 뒤에 비밀 값을
        공개해 함께 도전값을 정한다. 약속을 바꿀 수 없으니 기회는 한 번뿐이고, k
        = 16이면 충분하다(빠져나갈 확률 1/65,536).
      </p>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/** 사후에 잡는 부정: 무늬 안 따르기 */
export function RenegeToy() {
  const steps = [
    {
      text: "1턴: 선이 ♠를 냈다. 철수는 ◆5를 낸다. ♠가 없다고 한 셈이다.",
      caught: false,
    },
    {
      text: "2~5턴: 아무도 철수의 손을 모른다. 그대로 진행된다.",
      caught: false,
    },
    {
      text: "6턴: 철수가 ♠9를 낸다. 열쇠를 공개하자 모두가 ♠9를 본다.",
      caught: true,
    },
  ];
  const [i, setI] = useState(0);
  const step = steps[i] as (typeof steps)[number];
  return (
    <Box title="무늬 안 따르기는 드러나는 순간 잡는다">
      <p className="text-sm">
        <SuitText text={step.text} />
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Btn onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>
          ◀ 이전
        </Btn>
        <Btn
          onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))}
          disabled={i === steps.length - 1}
        >
          다음 ▶
        </Btn>
      </div>
      {step.caught && (
        <Result ok>
          <SuitText text="♠9는 1턴에도 철수 손에 있었다(카드는 줄기만 한다). 그때 ♠를 따라야 했으므로 ◆5는 규칙 위반이다." />{" "}
          모든 기기가 이 순간 철수를 짚고 판을 멈춘다. 거짓 양성이 없다 — 손에
          카드가 늘어도 풀리지 않는 금지라서다.
        </Result>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* 심화: 아직 게임에 적용하지 않은 기법                                    */
/* ------------------------------------------------------------------ */

/**
 * ElGamal 다시 감싸기: 같은 카드라도 감쌀 때마다 값이 바뀐다(SRA는 같은 열쇠면 같은 값).
 * 모두의 열쇠를 더한 공동 공개 열쇠로 감싸고, 열 때는 각자 몫을 낸다
 */
export function ElGamalToy() {
  const [card, setCard] = useState(0);
  const [x1, setX1] = useState(3);
  const [x2, setX2] = useState(6);
  const [r, setR] = useState(4);
  const [wraps, setWraps] = useState<number[]>([]);
  const [opened, setOpened] = useState(0);
  const [, m] = TOY_CARDS[card] as [string, number];
  const h = pow(G, (x1 + x2) % Q, P);
  // 감쌀 때마다 무작위 s를 더한다: (c1·g^s, c2·h^s)
  const total = (r + wraps.reduce((a, b) => a + b, 0)) % Q;
  const c1 = pow(G, total, P);
  const c2 = (m * pow(h, total, P)) % P;
  const d1 = pow(c1, x1, P);
  const d2 = pow(c1, x2, P);
  const plain =
    opened === 2
      ? (c2 * inv((d1 * d2) % P, P)) % P
      : opened === 1
        ? (c2 * inv(d1, P)) % P
        : null;
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <Box title="ElGamal 다시 감싸기(p = 23)">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="w-20 text-white/70">카드</span>
        {TOY_CARDS.map(([n, v], i) => (
          <Btn
            key={n}
            onClick={() => {
              setCard(i);
              setWraps([]);
              setOpened(0);
            }}
            active={i === card}
          >
            <SuitText text={n} /> = {v}
          </Btn>
        ))}
      </div>
      <Picker label="철수 몫 x₁" value={x1} options={keys} onChange={setX1} />
      <Picker label="영희 몫 x₂" value={x2} options={keys} onChange={setX2} />
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          공동 공개 열쇠 h = g<sup>x₁+x₂</sup> = <Num>{h}</Num>. 둘 다 몫을 내야
          연다.
        </li>
        <li>
          카드 <Num>{m}</Num>를 무작위 r = {r}로 감싼다: (g<sup>r</sup>, m·h
          <sup>r</sup>) = (<Num>{c1}</Num>, <Num>{c2}</Num>)
        </li>
        <li>
          다시 감싼 횟수 {wraps.length}번{" "}
          <Btn
            onClick={() => {
              setWraps((w) => [...w, 1 + rand(Q - 1)]);
              setOpened(0);
            }}
          >
            다시 감싸기(무작위 s를 더한다)
          </Btn>{" "}
          <Btn
            onClick={() => {
              setR(1 + rand(Q - 1));
              setWraps([]);
              setOpened(0);
            }}
          >
            처음부터
          </Btn>
        </li>
        <li>
          열기: 철수 몫 c₁<sup>x₁</sup> = {d1}, 영희 몫 c₁<sup>x₂</sup> = {d2}{" "}
          <Btn onClick={() => setOpened(1)}>철수만 풀기</Btn>{" "}
          <Btn onClick={() => setOpened(2)}>둘 다 풀기</Btn>
          {plain !== null && (
            <>
              {" "}
              → <Num>{plain}</Num>
            </>
          )}
        </li>
      </ol>
      <Result ok>
        같은 카드인데 다시 감쌀 때마다 두 값이 모두 바뀐다. SRA는 같은 열쇠로
        잠그면 같은 카드는 같은 값이라, 섞기 증명이 따로 짝을 맞춰야 했다.
        ElGamal은 섞을 때마다 다시 감싸 짝을 끊고, 그 대신 "다시 감싸고 순서만
        바꿨다"를 Bayer–Groth 같은 증명으로 한 번에 보인다.{" "}
        {opened === 1 ? "한 사람 몫만으로는 엉뚱한 수가 나온다." : ""}
      </Result>
    </Box>
  );
}

/**
 * 다항식으로 순서 확인(Neff·Bayer–Groth의 핵심): 두 목록이 순서만 다른지 보려면
 * 무작위 t에서 Π(t − aᵢ)와 Π(t − bᵢ)를 견준다. 순열이면 언제나 같고, 하나라도 바뀌면 거의 다르다
 */
export function PolyCheckToy() {
  const base = [2, 5, 9, 13, 17, 20];
  const [b, setB] = useState<number[]>(() => [9, 20, 2, 17, 5, 13]);
  const [t, setT] = useState(7);
  const [stats, setStats] = useState({ tries: 0, caught: 0 });
  const tampered = [...b].sort((x, y) => x - y).join() !== [...base].join();
  const evalAt = (list: number[], x: number) =>
    list.reduce((acc, v) => (acc * ((((x - v) % P) + P) % P)) % P, 1);
  const pa = evalAt(base, t);
  const pb = evalAt(b, t);
  const draw = () => {
    const next = rand(P);
    setT(next);
    if (tampered)
      setStats((s) => ({
        tries: s.tries + 1,
        caught: s.caught + (evalAt(base, next) !== evalAt(b, next) ? 1 : 0),
      }));
  };
  return (
    <Box title="다항식으로 순서만 바뀌었는지 확인">
      <p className="text-sm text-white/80">
        받은 목록 A와 넘긴 목록 B가 같은 수들을 순서만 바꾼 것인지, 수를 하나씩
        견주지 않고 한 번에 본다.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() => {
            setB([...base].sort(() => rand(3) - 1));
            setStats({ tries: 0, caught: 0 });
          }}
        >
          B = A를 섞은 것
        </Btn>
        <Btn
          onClick={() => {
            const next = [...base].sort(() => rand(3) - 1);
            next[0] = next[1] as number; // 한 장을 복제했다
            setB(next);
            setStats({ tries: 0, caught: 0 });
          }}
        >
          B = 섞으며 한 장을 복제
        </Btn>
        <Btn onClick={draw}>무작위 t 뽑기</Btn>
      </div>
      <p className="font-mono text-xs">
        A = [{base.join(", ")}] · B = [{b.join(", ")}] · t = {t}
      </p>
      <p className="text-sm">
        Π(t − aᵢ) mod 23 = <Num>{pa}</Num>, Π(t − bᵢ) mod 23 = <Num>{pb}</Num> →{" "}
        {pa === pb ? "같다" : "다르다"}
      </p>
      {tampered && stats.tries > 0 && (
        <p className="text-xs text-white/70">
          t를 {stats.tries}번 뽑아 {stats.caught}번 잡았다. 두 다항식이 다르면
          같아지는 t는 많아야 6개(차수)라, 23개 중에서는 가끔 빠져나가지만 실제
          게임의 큰 수(2²⁵²개쯤) 중에서는 사실상 빠져나갈 수 없다.
        </p>
      )}
      <Result ok={!tampered || pa !== pb}>
        {tampered
          ? pa === pb
            ? "이번 t에서는 우연히 같아졌다(드물다). 다시 뽑아 보자."
            : "복제 카드가 들어가면 두 곱이 달라 바로 드러난다."
          : "순서만 바꿨으니 어떤 t에서도 두 곱이 같다."}{" "}
        Neff(2001)와 Bayer–Groth(2012)는 이 생각에 "값을 보이지 않고"를 더한
        영지식 증명이다. cut-and-choose(16번, 2⁻¹⁶)와 달리 한 번에 거의
        확실하다.
      </Result>
    </Box>
  );
}

/**
 * OR 증명(Cramer–Damgård–Schoenmakers 1994): "V₁의 비밀이나 V₂의 비밀 중 하나를 안다"를
 * 어느 쪽인지 숨기고 증명한다. 모르는 쪽은 도전값을 미리 정해 흉내 낸다(8단원의 속이는 증명)
 */
export function OrProofToy() {
  const [real, setReal] = useState<0 | 1>(0);
  const [x] = useState(6);
  const [proof, setProof] = useState<{
    a: [number, number];
    c: [number, number];
    z: [number, number];
    total: number;
  } | null>(null);
  const [guess, setGuess] = useState<0 | 1 | null>(null);
  const [score, setScore] = useState({ played: 0, right: 0 });
  // 공개 열쇠 둘. 증명하는 사람은 real 쪽 비밀(x)만 안다.
  const V: [number, number] =
    real === 0 ? [pow(G, x, P), pow(G, 8, P)] : [pow(G, 9, P), pow(G, x, P)];
  const run = () => {
    const fake = (1 - real) as 0 | 1;
    // 모르는 쪽: 도전값 c_f와 z_f를 먼저 고르고 a_f를 거꾸로 맞춘다.
    const cf = rand(Q);
    const zf = rand(Q);
    const af = (pow(G, zf, P) * inv(pow(V[fake], cf, P), P)) % P;
    // 아는 쪽: 정직하게 r로 시작한다.
    const r = rand(Q);
    const ar = pow(G, r, P);
    // 확인하는 사람의 도전값 c. 아는 쪽 도전값은 c − c_f로 정해진다.
    const c = rand(Q);
    const cr = (((c - cf) % Q) + Q) % Q;
    const zr = (r + cr * x) % Q;
    const a: [number, number] = real === 0 ? [ar, af] : [af, ar];
    const cs: [number, number] = real === 0 ? [cr, cf] : [cf, cr];
    const zs: [number, number] = real === 0 ? [zr, zf] : [zf, zr];
    setProof({ a, c: cs, z: zs, total: c });
    setGuess(null);
  };
  const verifies =
    proof !== null &&
    (proof.c[0] + proof.c[1]) % Q === proof.total &&
    [0, 1].every(
      (i) =>
        pow(G, proof.z[i] as number, P) ===
        ((proof.a[i] as number) *
          pow(V[i] as number, proof.c[i] as number, P)) %
          P,
    );
  return (
    <Box title="OR 증명: 둘 중 하나를, 어느 쪽인지 숨기고">
      <div className="flex flex-wrap gap-1.5">
        <Btn
          onClick={() => {
            setReal(0);
            setProof(null);
          }}
          active={real === 0}
        >
          증명하는 사람은 왼쪽 비밀을 안다
        </Btn>
        <Btn
          onClick={() => {
            setReal(1);
            setProof(null);
          }}
          active={real === 1}
        >
          오른쪽 비밀을 안다
        </Btn>
        <Btn onClick={run}>증명 만들기</Btn>
      </div>
      <p className="text-sm text-white/80">
        공개 열쇠 V₁ = <Num>{V[0]}</Num>, V₂ = <Num>{V[1]}</Num>. 증명할 것: "둘
        중 하나의 비밀을 안다." 확인하는 사람에게는 어느 쪽인지 알리지 않는다.
      </p>
      {proof && (
        <>
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg bg-white/5 p-2">
                {i === 0 ? "왼쪽" : "오른쪽"}: a = {proof.a[i]}, c ={" "}
                {proof.c[i]}, z = {proof.z[i]}
                <br />g<sup>z</sup> = a·V<sup>c</sup>?{" "}
                {pow(G, proof.z[i] as number, P) ===
                ((proof.a[i] as number) *
                  pow(V[i] as number, proof.c[i] as number, P)) %
                  P
                  ? "맞다"
                  : "틀리다"}
              </div>
            ))}
          </div>
          <p className="text-sm">
            도전값 c = {proof.total} = {proof.c[0]} + {proof.c[1]} (mod 11) ·{" "}
            {verifies ? "증명이 맞다" : "증명이 틀리다"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-white/70">어느 쪽이 진짜일까?</span>
            {([0, 1] as const).map((i) => (
              <Btn
                key={i}
                onClick={() => {
                  if (guess !== null) return;
                  setGuess(i);
                  setScore((s) => ({
                    played: s.played + 1,
                    right: s.right + (i === real ? 1 : 0),
                  }));
                }}
                active={guess === i}
              >
                {i === 0 ? "왼쪽" : "오른쪽"}
              </Btn>
            ))}
          </div>
          {guess !== null && (
            <Result ok>
              {guess === real ? "맞혔다" : "틀렸다"}(진짜는{" "}
              {real === 0 ? "왼쪽" : "오른쪽"}). 지금까지 {score.played}번 중{" "}
              {score.right}번 — 두 쪽 기록이 똑같이 생겨 반반 찍기보다 나을 수
              없다. 모르는 쪽은 도전값을 미리 정해 흉내 내고, 두 도전값의 합만
              확인하는 사람의 c와 맞으면 된다. "선 무늬가 없다"는 손의 카드마다
              <SuitText text={'"♥이거나 ◆이거나 ♣이다"'} />를 이런 OR 증명(또는
              Groth–Kohlweiss의 one-out-of-many)으로 보이는 것이다.
            </Result>
          )}
        </>
      )}
    </Box>
  );
}
