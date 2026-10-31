"use client";

import { drandRandomness, fromHex, toHex } from "@mighty/stardraw-core";
import { useEffect, useRef, useState } from "react";

import {
  chiSquare,
  countBand,
  createTally,
  drawPair,
  REPEAT_EXPECTED,
  type Tally,
  tailOf,
  WINDOW_ALPHA,
  windowsTail,
} from "./fairness";
import { Btn, Mono, Row, Toy, Verdict } from "./ui";

/** drand 체험과 같은 실제 값(quicknet 1000000회차 서명) */
const REAL_BASE = drandRandomness({
  round: 1000000,
  signature: fromHex(
    "83ad29e4c409f9470fc2ef02f90214df49e02b441a1a241a82d622d9f608ef98fd8b11a029f1bee9d9e83b45088abe72",
  ),
});
const COUNTS = [1_000, 10_000, 100_000] as const;
const WINDOWS = [100, 1_000, 5_000] as const;
/** 한 번에 이만큼 돌리고 화면에 돌려준다(멈춰 보이지 않게) */
const CHUNK = 2_000;

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

interface Run {
  fair: Tally;
  biased: Tally;
  total: number;
  windowSize: number;
}

const copy = (t: Tally): Tally => ({
  ...t,
  counts: [...t.counts],
  windows: [...t.windows],
});

export function FairnessToy() {
  const [count, setCount] = useState<number>(10_000);
  const [windowText, setWindowText] = useState("1000");
  const [base, setBase] = useState<Uint8Array>(REAL_BASE);
  const [compare, setCompare] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  const windowSize = Math.max(
    10,
    Math.min(count, Math.floor(Number(windowText) || 0)),
  );

  const start = () => {
    stop.current();
    let alive = true;
    stop.current = () => {
      alive = false;
    };
    const fair = createTally(windowSize);
    const biased = createTally(windowSize);
    let round = 1;
    setRunning(true);
    const step = () => {
      if (!alive) return;
      const end = Math.min(count, round + CHUNK - 1);
      for (; round <= end; round++) {
        const d = drawPair(base, round);
        fair.add(d.fair);
        biased.add(d.biased);
      }
      setRun({
        fair: copy(fair.tally),
        biased: copy(biased.tally),
        total: count,
        windowSize,
      });
      if (round <= count) setTimeout(step, 0);
      else setRunning(false);
    };
    setTimeout(step, 0);
  };

  const randomBase = () => {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    setBase(b);
    setRun(null);
  };

  const done = run !== null && !running;
  return (
    <Toy title="실제 규칙으로 몇만 회차 돌려 보기" id="fair">
      <div
        className="flex flex-col gap-3"
        data-fair-state={running ? "running" : done ? "done" : "idle"}
      >
        <Row label="회차 수">
          <span className="flex flex-wrap gap-1.5">
            {COUNTS.map((c) => (
              <Btn
                key={c}
                active={count === c}
                onClick={() => setCount(c)}
                disabled={running}
              >
                {c.toLocaleString("ko-KR")}
              </Btn>
            ))}
          </span>
        </Row>
        <Row label="묶음 크기">
          <span className="flex flex-wrap items-center gap-1.5">
            {WINDOWS.map((w) => (
              <Btn
                key={w}
                active={windowSize === w}
                onClick={() => setWindowText(String(w))}
                disabled={running}
              >
                {w.toLocaleString("ko-KR")}
              </Btn>
            ))}
            <input
              type="number"
              inputMode="numeric"
              min={10}
              value={windowText}
              onChange={(e) => setWindowText(e.target.value)}
              disabled={running}
              aria-label="묶음 크기(회차)"
              data-fair-window
              className="w-20 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs"
            />
          </span>
        </Row>
        <Row label="씨앗">
          <span className="flex flex-wrap items-center gap-1.5">
            <Btn
              active={base === REAL_BASE}
              onClick={() => {
                setBase(REAL_BASE);
                setRun(null);
              }}
              disabled={running}
            >
              실제 drand 값
            </Btn>
            <Btn onClick={randomBase} disabled={running}>
              무작위 씨앗
            </Btn>
            <Mono>{toHex(base).slice(0, 16)}…</Mono>
          </span>
        </Row>
        <span className="flex flex-wrap gap-1.5">
          <Btn active={compare} onClick={() => setCompare((v) => !v)}>
            치우친 뽑기와 견주기
          </Btn>
          <Btn primary onClick={start} disabled={running}>
            돌리기
          </Btn>
        </span>

        {run && (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="돌린 회차"
            aria-valuemin={0}
            aria-valuemax={run.total}
            aria-valuenow={run.fair.draws}
          >
            <div
              className="h-full bg-amber-200"
              style={{ width: `${(run.fair.draws / run.total) * 100}%` }}
            />
          </div>
        )}

        {run && <Results run={run} compare={compare} done={done} />}
      </div>
    </Toy>
  );
}

function Results({
  run,
  compare,
  done,
}: {
  run: Run;
  compare: boolean;
  done: boolean;
}) {
  const { fair, biased, windowSize } = run;
  const p = tailOf(chiSquare(fair.counts, fair.draws));
  const pBiased = tailOf(chiSquare(biased.counts, biased.draws));
  const outside = fair.windows.filter((w) => w < WINDOW_ALPHA).length;
  const outsideBiased = biased.windows.filter((w) => w < WINDOW_ALPHA).length;
  const repeat = fair.repeatPairs ? fair.repeats / fair.repeatPairs : 0;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-fair-draws={fair.draws}>
      <span className="text-white/60 text-xs">
        번호별 당첨 횟수 · 가운데 선은 기대값, 띠는 우연으로 흔히 나오는 범위
        {compare && " · 붉은 점은 치우친 뽑기"}
      </span>
      <CountChart fair={fair} biased={compare ? biased : null} />

      <span className="text-white/60 text-xs">
        {windowSize.toLocaleString("ko-KR")}회차 묶음마다의 치우침 점수 · 선
        위는 우연 범위 밖(꼬리 확률 5% 밑)
      </span>
      <WindowChart fair={fair} biased={compare ? biased : null} />

      {done && (
        <>
          <Verdict ok={p >= 0.01} testId="fair-total">
            {fair.draws.toLocaleString("ko-KR")}회차 전체의 꼬리 확률은 {pct(p)}
            입니다.{" "}
            {p >= 0.01
              ? "우연으로 흔히 나오는 범위입니다."
              : "치우쳐 보입니다."}
            {compare &&
              ` 치우친 뽑기는 ${pBiased < 0.0001 ? "0.01% 밑" : pct(pBiased, 2)}입니다.`}
          </Verdict>
          <Verdict
            ok={windowsTail(outside, fair.windows.length) >= 0.001}
            testId="fair-windows"
          >
            묶음 {fair.windows.length.toLocaleString("ko-KR")}개 중{" "}
            {outside.toLocaleString("ko-KR")}개(
            {pct(outside / Math.max(1, fair.windows.length))})가 우연 범위
            밖입니다. 고르게 뽑아도 약 5%는 이렇게 나옵니다.
            {compare &&
              ` 치우친 뽑기는 ${pct(outsideBiased / Math.max(1, biased.windows.length))}입니다.`}
          </Verdict>
          <Verdict
            ok={Math.abs(repeat - REPEAT_EXPECTED) < 0.02}
            testId="fair-repeat"
          >
            앞 회차 번호가 다음 회차에 다시 나온 비율은 {pct(repeat)}입니다.
            회차끼리 독립이면 {pct(REPEAT_EXPECTED)}입니다.
          </Verdict>
        </>
      )}
    </div>
  );
}

function CountChart({ fair, biased }: { fair: Tally; biased: Tally | null }) {
  const band = countBand(fair.draws);
  // 0부터 그리면 작은 차이가 안 보여, 기대값 둘레만 확대해 그린다
  const all = [...fair.counts, ...(biased ? biased.counts : [])];
  const pad = (band.high - band.low) * 0.6;
  const top = Math.max(band.high, ...all) + pad;
  const floor = Math.max(0, Math.min(band.low, ...all) - pad);
  const H = 120;
  const y = (v: number) => H - ((v - floor) / (top - floor || 1)) * H;
  return (
    <svg
      viewBox={`0 0 450 ${H}`}
      className="w-full"
      role="img"
      aria-label={`번호 1~45의 당첨 횟수, 기대값 ${Math.round(band.expected)}회`}
      data-fair-chart="counts"
    >
      <rect
        x={0}
        y={y(band.high)}
        width={450}
        height={Math.max(0, y(band.low) - y(band.high))}
        className="fill-emerald-300/15"
      />
      {fair.counts.map((c, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: 번호 차례 그대로
          key={i}
          x={i * 10 + 1.5}
          y={y(c)}
          width={7}
          height={H - y(c)}
          className="fill-amber-200/80"
        />
      ))}
      <line
        x1={0}
        x2={450}
        y1={y(band.expected)}
        y2={y(band.expected)}
        className="stroke-white/60"
        strokeDasharray="3 3"
      />
      {biased?.counts.map((c, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: 번호 차례 그대로
          key={i}
          cx={i * 10 + 5}
          cy={y(c)}
          r={2.2}
          className="fill-rose-400"
        />
      ))}
    </svg>
  );
}

/** 묶음마다 −log10(꼬리 확률): 높을수록 우연으로 보기 어렵다. 4(0.01%) 위는 잘라 그린다 */
function WindowChart({ fair, biased }: { fair: Tally; biased: Tally | null }) {
  const H = 80;
  const MAX = 4;
  const n = Math.max(fair.windows.length, biased?.windows.length ?? 0, 1);
  const x = (i: number) => ((i + 0.5) / n) * 450;
  const y = (p: number) =>
    H - (Math.min(MAX, -Math.log10(Math.max(p, 1e-12))) / MAX) * H;
  return (
    <svg
      viewBox={`0 0 450 ${H}`}
      className="w-full"
      role="img"
      aria-label="묶음마다의 치우침 점수"
      data-fair-chart="windows"
    >
      <line
        x1={0}
        x2={450}
        y1={y(WINDOW_ALPHA)}
        y2={y(WINDOW_ALPHA)}
        className="stroke-white/50"
        strokeDasharray="3 3"
      />
      {biased?.windows.map((p, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: 묶음 차례 그대로
          key={`b${i}`}
          cx={x(i)}
          cy={y(p)}
          r={n > 200 ? 1 : 2}
          className="fill-rose-400/80"
        />
      ))}
      {fair.windows.map((p, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: 묶음 차례 그대로
          key={`f${i}`}
          cx={x(i)}
          cy={y(p)}
          r={n > 200 ? 1 : 2}
          className={p < WINDOW_ALPHA ? "fill-amber-100" : "fill-amber-200/70"}
        />
      ))}
    </svg>
  );
}
