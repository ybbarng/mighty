"use client";

import { TEST_VECTORS, type TestVector } from "@mighty/stardraw-core";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";

import { GAME_NS, getServices } from "../services";
import {
  type CheckResult,
  type CheckStatus,
  checkPracticeLedger,
  checkServerLedger,
  SERVER_API,
} from "./check";

/** 서버 주소가 있으면 서버 장부, 없으면 이 기기의 연습 장부를 검사한다 */
async function runCheck(options: { powSample?: number } = {}) {
  if (SERVER_API) return checkServerLedger(options);
  return checkPracticeLedger(getServices(GAME_NS).ledger);
}

type VectorState = { value?: string; error?: string; running?: boolean };

async function computeVector(v: TestVector): Promise<VectorState> {
  try {
    return { value: await v.compute() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** 공개 시험 값을 이 브라우저에서 규칙 코드로 다시 계산해 기대값과 나란히 보인다 */
const vectorKey = (g: number, i: number) => `${g}:${i}`;

export function VectorTable() {
  const [states, setStates] = useState<Record<string, VectorState>>({});
  const key = vectorKey;

  const run = useCallback(async (g: number, i: number) => {
    const v = TEST_VECTORS[g]?.vectors[i];
    if (!v) return;
    setStates((s) => ({ ...s, [vectorKey(g, i)]: { running: true } }));
    const next = await computeVector(v);
    setStates((s) => ({ ...s, [vectorKey(g, i)]: next }));
  }, []);

  useEffect(() => {
    TEST_VECTORS.forEach((group, g) => {
      group.vectors.forEach((v, i) => {
        if (!v.heavy) void run(g, i);
      });
    });
  }, [run]);

  return (
    <div className="flex flex-col gap-6">
      {TEST_VECTORS.map((group, g) => (
        <div
          key={group.id}
          id={`vectors-${group.id}`}
          className="flex flex-col gap-2"
        >
          <h3 className="font-semibold text-white/90">{group.title}</h3>
          <ul className="flex flex-col gap-3">
            {group.vectors.map((v, i) => {
              const s = states[key(g, i)] ?? {};
              const done = s.value !== undefined || s.error !== undefined;
              const ok = s.value === v.expected;
              return (
                <li
                  // 시험 값 목록은 고정이라 순서가 바뀌지 않는다
                  key={`${v.title}|${v.input}`}
                  data-vector={`${group.id}-${i}`}
                  data-status={done ? (ok ? "pass" : "fail") : "wait"}
                  className="flex min-w-0 flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm"
                >
                  <span className="font-medium text-white/90">{v.title}</span>
                  <span className="text-white/60">입력: {v.input}</span>
                  <code className="break-all font-mono text-[12px] text-amber-100/90">
                    {v.expected}
                  </code>
                  {done ? (
                    <span
                      className={cn(
                        "text-xs",
                        ok ? "text-emerald-300" : "text-rose-300",
                      )}
                    >
                      {ok
                        ? "이 브라우저에서 다시 계산한 값과 같습니다"
                        : `다시 계산한 값: ${s.error ?? s.value}`}
                    </span>
                  ) : v.heavy && !s.running ? (
                    <button
                      type="button"
                      onClick={() => void run(g, i)}
                      className="self-start rounded-md border border-white/20 px-2 py-1 text-white/80 text-xs hover:bg-white/10"
                    >
                      계산하기(16MB, 몇 초)
                    </button>
                  ) : (
                    <span className="text-white/50 text-xs">계산 중…</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "통과",
  fail: "실패",
  skip: "건너뜀",
  warn: "주의",
};

/** 「장부 전체 검사」와 콘솔 함수 `stardraw.verify()`·`stardraw.vectors()` */
export function LedgerCheck() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const api = {
      verify: (options?: { powSample?: number }) => runCheck(options),
      vectors: async () =>
        Promise.all(
          TEST_VECTORS.flatMap((group) =>
            group.vectors.map(async (v) => {
              const s = await computeVector(v);
              return {
                group: group.title,
                title: v.title,
                ok: s.value === v.expected,
                expected: v.expected,
                actual: s.error ?? s.value,
              };
            }),
          ),
        ),
    };
    (window as unknown as { stardraw?: typeof api }).stardraw = api;
    return () => {
      delete (window as unknown as { stardraw?: typeof api }).stardraw;
    };
  }, []);

  const start = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runCheck());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const failed = result?.items.some((i) => i.status === "fail");
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void start()}
        disabled={running}
        className="self-start rounded-xl bg-amber-200 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
      >
        {running ? "검사하는 중…" : "장부 전체 검사"}
      </button>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {result && (
        <div
          data-check-result={failed ? "fail" : "pass"}
          className="flex flex-col gap-3 rounded-xl border border-white/15 bg-white/[0.03] p-4 text-sm"
        >
          <p className={failed ? "text-rose-300" : "text-emerald-300"}>
            {failed
              ? "규칙에 어긋나는 곳이 있습니다"
              : "모든 확인을 통과했습니다"}
          </p>
          {result.items
            .filter((i) => i.status === "warn")
            .map((w) => (
              <p
                key={w.id}
                data-check-warn={w.id}
                className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-amber-100"
              >
                주의: {w.label}
                {w.detail ? ` — ${w.detail}` : ""}
              </p>
            ))}
          <p className="text-white/65">
            {result.source === "server"
              ? `서버 ${result.mode === "trial" ? "시험" : "정식"} 장부`
              : "이 기기의 연습 장부"}{" "}
            · 닫힌 회차 {result.rounds}개 · 응모권 {result.tickets}장 · 열쇠
            등록 {result.registrations}개
          </p>
          <ul className="flex flex-col gap-1.5">
            {result.items.map((item) => (
              <li
                key={item.id}
                data-check-item={item.id}
                data-status={item.status}
                className="flex min-w-0 flex-col"
              >
                <span>
                  <span
                    className={cn(
                      "mr-2 inline-block min-w-12 font-semibold",
                      item.status === "pass" && "text-emerald-300",
                      item.status === "fail" && "text-rose-300",
                      item.status === "skip" && "text-white/50",
                      item.status === "warn" && "text-amber-300",
                    )}
                  >
                    {STATUS_TEXT[item.status]}
                  </span>
                  {item.label}
                </span>
                {item.detail && (
                  <span className="break-all pl-14 text-white/55 text-xs">
                    {item.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1" data-director-history>
            <p className="font-semibold text-sm text-white/80">
              국장 열쇠 내력
            </p>
            {result.directors.length === 0 ? (
              <p className="text-white/55 text-xs">
                국장 열쇠 지정 기록이 없습니다(운영 기록을 낼 수 있는 국장이
                없음)
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-white/65 text-xs">
                {result.directors.map((d) => (
                  <li key={`${d.round}-${d.fingerprint}-${d.action}`}>
                    사슬 {d.round} 기록 · {d.action}{" "}
                    <code className="text-amber-100/90">{d.fingerprint}</code> ·
                    서명 {d.signedBy} · {d.effectiveRound}회차부터 ·{" "}
                    {d.status === "pending"
                      ? "예고 중"
                      : d.status === "applied"
                        ? "효력"
                        : `취소됨(사슬 ${d.cancelledIn})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1" data-seal-history>
            <p className="font-semibold text-sm text-white/80">관인 내력</p>
            {result.operations.seals.length === 0 ? (
              <p className="text-white/55 text-xs">관인 기록이 아직 없습니다</p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-white/65 text-xs">
                {result.operations.seals.map((s) => (
                  <li key={`${s.pub}-${s.round}`}>
                    {s.round === null
                      ? "처음 관인 "
                      : `사슬 ${s.round} 기록 · 관인 교체 `}
                    <code className="text-amber-100/90">{s.fingerprint}</code> ·{" "}
                    {s.signedBy ? `서명 ${s.signedBy} · ` : ""}
                    {s.from}회차부터
                    {s.round === null
                      ? ""
                      : s.status === "pending"
                        ? " · 예고 중"
                        : s.status === "applied"
                          ? " · 효력"
                          : ` · 취소됨(사슬 ${s.cancelledIn})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {result.qualification.length > 0 && (
            <div className="flex flex-col gap-1" data-qualification-summary>
              <p className="font-semibold text-sm text-white/80">소속</p>
              <ul className="flex flex-col gap-0.5 text-white/65 text-xs">
                {result.qualification.map((p) => (
                  <li key={p.id}>
                    {p.affiliationName} {p.number}기 · {p.from}회차부터 · 도장
                    열쇠{" "}
                    <code className="text-amber-100/90">{p.fingerprint}</code> ·
                    발급 {p.issued} · 쓰인 증서 {p.used}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="break-all font-mono text-[11px] text-white/45">
            장부 끝 해시 {result.head}
          </p>
        </div>
      )}
    </div>
  );
}
