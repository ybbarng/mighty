"use client";

import { RANKS, roundTimes } from "@mighty/stardraw-core";
import { type ReactNode, useMemo } from "react";

import { roundShort } from "../round-label";
import type { Services } from "../services";
import { ballColor, SKY_STARS, tempWord } from "../sky";
import { NOTHING_SEALED, type Sealed } from "../spoiler";
import {
  computeStats,
  type GroupStat,
  type StarStat,
  type Stats,
} from "../stats";
import { formatTime, LottoBall, RANK_LABEL } from "./parts";
import { SkyBoard } from "./SkyBoard";

/** 이보다 추첨이 적으면 숫자가 크게 출렁인다고 밝힌다 */
const FEW_DRAWS = 30;
/** 응모 추이 막대 수 */
const SERIES = 48;

/** 관측 기록(/stardraw/stats): 공개 장부만으로 계산한 통계(docs/36 11-18) */
export function StatsView({
  services,
  version,
  sealed = NOTHING_SEALED,
  onBack,
}: {
  services: Services;
  version: number;
  /** 추첨을 아직 열어 보지 않은 내 회차는 조용히 빼고 센다 */
  sealed?: Sealed;
  onBack: () => void;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: 장부가 바뀔 때 다시 계산한다
  const stats = useMemo(
    () =>
      computeStats(
        services.ledger
          .closed()
          .filter(({ record }) => !sealed(record.round))
          .map(({ record, tickets }) => ({
            record,
            qualified: tickets.filter((t) => t.qual).length,
          })),
      ),
    [services, version, sealed],
  );
  const schedule = services.ledger.schedule;

  return (
    <section className="flex flex-col gap-4" aria-label="관측 기록">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 지난 회차
        </button>
        <h2 className="font-bold text-lg">관측 기록</h2>
        <span className="w-16" />
      </div>
      {stats.draws === 0 ? (
        <p className="py-10 text-center text-white/60">
          아직 추첨한 회차가 없습니다
        </p>
      ) : (
        <>
          <Overview stats={stats} schedule={schedule} />
          <ObservedSky stats={stats} />
          <Highlights stats={stats} />
          <Card title="별빛 색">
            <GroupBars
              groups={stats.kinds}
              total={stats.draws * 6}
              colorOf={kindColor}
            />
          </Card>
          <Card title="밝은 별과 어두운 별">
            <GroupBars groups={stats.brightness} total={stats.draws * 6} />
          </Card>
          <Constellations groups={stats.constellations} />
          <Fair stats={stats} />
          <Card title="등수별 당첨 누적">
            <ul className="grid grid-cols-5 gap-2 text-center">
              {RANKS.map((r) => (
                <li key={r} className="flex flex-col gap-0.5">
                  <span className="text-white/60 text-xs">{RANK_LABEL[r]}</span>
                  <span className="font-semibold tabular-nums">
                    {stats.winners[r]}장
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Entries stats={stats} schedule={schedule} />
        </>
      )}
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sd-glass flex flex-col gap-3 rounded-2xl px-4 py-4">
      <h3 className="font-semibold text-sm text-white/80">{title}</h3>
      {children}
    </section>
  );
}

function Overview({
  stats,
  schedule,
}: {
  stats: Stats;
  schedule: Services["ledger"]["schedule"];
}) {
  const first = stats.firstRound
    ? roundTimes(schedule, stats.firstRound).opensAt
    : null;
  const rows: [string, string][] = [
    [
      "추첨",
      `${stats.draws}회${stats.voids ? ` (무효 ${stats.voids}회)` : ""}`,
    ],
    ["응모", `${stats.entries.toLocaleString("ko-KR")}장`],
    ["우주인", `${stats.astronauts.toLocaleString("ko-KR")}명`],
  ];
  if (stats.qualified > 0)
    rows.push([
      "상품 대상 응모",
      `${stats.qualified.toLocaleString("ko-KR")}장`,
    ]);
  if (first !== null) rows.push(["첫 관측", formatTime(first)]);
  if (stats.latestDrand !== null)
    rows.push(["마지막 drand 회차", stats.latestDrand.toLocaleString("ko-KR")]);
  return (
    <Card title="카노푸스 우주국 관측 일지">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-white/55 text-xs">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {stats.draws < FEW_DRAWS && (
        <p className="text-amber-100/80 text-xs">
          아직 {stats.draws}회뿐이라 아래 숫자는 크게 출렁입니다.
        </p>
      )}
    </Card>
  );
}

/** 관측 하늘: 많이 떨어진 별일수록 그 별빛 색으로 크고 밝게 */
function ObservedSky({ stats }: { stats: Stats }) {
  const max = Math.max(1, ...stats.stars.map((s) => s.drawn));
  return (
    <Card title="관측 하늘">
      <div data-observed-sky className="relative">
        <SkyBoard
          state={{
            mode: "draw",
            picked: [],
            focus: null,
            lit: [],
            bonus: null,
          }}
          label="관측 하늘: 많이 떨어진 별일수록 밝게"
          overlay={
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              <defs>
                {stats.stars.map((s) => (
                  <radialGradient key={s.star.n} id={`sd-obs-${s.star.n}`}>
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop
                      offset="0.35"
                      stopColor={ballColor(s.star.n)}
                      stopOpacity="0.7"
                    />
                    <stop
                      offset="1"
                      stopColor={ballColor(s.star.n)}
                      stopOpacity="0"
                    />
                  </radialGradient>
                ))}
              </defs>
              {stats.stars
                .filter((s) => s.drawn > 0)
                .map((s) => {
                  const t = s.drawn / max;
                  return (
                    <circle
                      key={s.star.n}
                      data-drawn={s.drawn}
                      cx={s.star.x * 100}
                      cy={s.star.y * 100}
                      r={1.2 + 4.3 * t}
                      fill={`url(#sd-obs-${s.star.n})`}
                      opacity={0.35 + 0.65 * t}
                    />
                  );
                })}
            </svg>
          }
        />
      </div>
      <p className="text-white/55 text-xs">
        많이 떨어진 별일수록 크고 밝습니다(가장 많이 {max}번).
      </p>
    </Card>
  );
}

function StarRow({ s, note }: { s: StarStat; note: string }) {
  return (
    <li className="flex items-center gap-3">
      <LottoBall n={s.star.n} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate font-semibold text-sm">{s.star.ko}</span>
        <span className="truncate text-white/55 text-xs">{s.star.con}</span>
      </span>
      <span className="shrink-0 text-sm tabular-nums">{note}</span>
    </li>
  );
}

function Highlights({ stats }: { stats: Stats }) {
  const byDrawn = [...stats.stars].sort(
    (a, b) => b.drawn - a.drawn || a.star.n - b.star.n,
  );
  const sleeping = stats.stars
    .filter((s) => s.drawn > 0)
    .sort((a, b) => b.asleep - a.asleep || a.star.n - b.star.n);
  const never = stats.stars.filter((s) => s.drawn === 0);
  const streak = [...stats.stars].sort(
    (a, b) => b.streak - a.streak || a.star.n - b.star.n,
  )[0];
  const exp = stats.expected;
  return (
    <>
      <Card title="가장 자주 떨어진 별">
        <ul className="flex flex-col gap-2">
          {byDrawn.slice(0, 3).map((s) => (
            <StarRow key={s.star.n} s={s} note={`${s.drawn}번`} />
          ))}
        </ul>
        <p className="text-white/55 text-xs">
          고르게 뽑히면 별마다 {exp.toFixed(1)}번쯤입니다.
        </p>
      </Card>
      <Card title="가장 오래 잠든 별">
        <ul className="flex flex-col gap-2">
          {sleeping.slice(0, 3).map((s) => (
            <StarRow key={s.star.n} s={s} note={`${s.asleep}회째`} />
          ))}
        </ul>
        {never.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              한 번도 떨어지지 않은 별{" "}
              <span className="tabular-nums">{never.length}개</span>
            </p>
            <span className="flex flex-wrap gap-1">
              {never.map((s) => (
                <LottoBall key={s.star.n} n={s.star.n} size="sm" />
              ))}
            </span>
          </div>
        )}
      </Card>
      {streak && streak.streak >= 2 && (
        <Card title="이어서 떨어진 별">
          <ul>
            <StarRow s={streak} note={`${streak.streak}회 연속`} />
          </ul>
        </Card>
      )}
    </>
  );
}

/** 무리마다 뽑힌 비율(막대)과 고르게 뽑힐 때의 비율(눈금) */
/** 별빛 갈래의 공 색(그 갈래 별 하나의 번호 공 색) */
function kindColor(kind: string): string | undefined {
  const star = SKY_STARS.find((s) => tempWord(s.k) === kind);
  return star ? ballColor(star.n) : undefined;
}

function GroupBars({
  groups,
  total,
  colorOf,
}: {
  groups: readonly GroupStat[];
  total: number;
  /** 막대 색(없으면 금빛) */
  colorOf?: (label: string) => string | undefined;
}) {
  return (
    <ul className="flex flex-col gap-2.5">
      {groups.map((g) => {
        const share = total ? g.drawn / total : 0;
        const expected = total ? g.expected / total : 0;
        const diff = g.drawn - g.expected;
        return (
          <li key={g.label} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between text-sm">
              <span>
                {g.label}{" "}
                <span className="text-white/45 text-xs">{g.stars}개</span>
              </span>
              <span className="tabular-nums">
                {g.drawn}번{" "}
                <span className="text-white/45 text-xs">
                  (기대 {g.expected.toFixed(1)}, {diff >= 0 ? "+" : ""}
                  {diff.toFixed(1)})
                </span>
              </span>
            </span>
            <span className="relative h-2 rounded-full bg-white/10">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-amber-200/80"
                style={{
                  width: `${Math.min(100, share * 100)}%`,
                  backgroundColor: colorOf?.(g.label),
                }}
              />
              <span
                className="absolute -inset-y-0.5 w-0.5 bg-white/80"
                style={{ left: `${Math.min(100, expected * 100)}%` }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Constellations({ groups }: { groups: readonly GroupStat[] }) {
  const top = groups.filter((g) => g.drawn > 0).slice(0, 5);
  return (
    <Card title="많이 떨어진 별자리">
      <ol className="flex flex-col gap-1.5 text-sm">
        {top.map((g, i) => (
          <li key={g.label} className="flex items-baseline justify-between">
            <span>
              <span className="mr-2 text-white/45 tabular-nums">{i + 1}</span>
              {g.label}{" "}
              <span className="text-white/45 text-xs">별 {g.stars}개</span>
            </span>
            <span className="tabular-nums">{g.drawn}번</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const VERDICT = {
  even: "고르게 떨어지고 있습니다",
  slight: "조금 치우쳤습니다",
  skewed: "치우쳤습니다",
} as const;

/** 공정성: 별 45개가 고르게 떨어지는지(카이제곱) */
function Fair({ stats }: { stats: Stats }) {
  const f = stats.fairness;
  if (!f) return null;
  const pct = f.p * 100;
  return (
    <Card title="별이 고르게 떨어지나">
      <p data-fairness={f.verdict} className="font-semibold">
        {VERDICT[f.verdict]}
      </p>
      <p className="text-sm text-white/70">
        모든 별이 같은 확률로 뽑힌다면, 지금보다 더 치우친 결과가 나올 확률은{" "}
        <span className="tabular-nums">
          {pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(2)}%`}
        </span>
        입니다.
        {f.verdict === "even"
          ? " 흔히 나오는 정도입니다."
          : " 드문 정도라 지켜보고 있습니다."}
      </p>
      <p className="text-white/45 text-xs tabular-nums">
        카이제곱 {f.chi2.toFixed(1)} · 자유도 44(평균 44 안팎)
      </p>
    </Card>
  );
}

function Entries({
  stats,
  schedule,
}: {
  stats: Stats;
  schedule: Services["ledger"]["schedule"];
}) {
  const series = stats.entrySeries.slice(-SERIES);
  const max = Math.max(1, ...series.map((s) => s.count));
  const first = series[0];
  const last = series.at(-1);
  return (
    <Card title="회차별 응모">
      <div
        className="flex h-20 items-end gap-px"
        role="img"
        aria-label={`최근 ${series.length}회 응모, 가장 많을 때 ${max}장`}
      >
        {series.map((s) => (
          <span
            key={s.round}
            title={`${roundShort(schedule, s.round)} · ${s.count}장`}
            className="min-w-0 flex-1 rounded-t-sm bg-sky-200/70"
            style={{ height: `${Math.max(2, (s.count / max) * 100)}%` }}
          />
        ))}
      </div>
      {first && last && (
        <p className="flex justify-between text-white/45 text-xs">
          <span>{roundShort(schedule, first.round)}</span>
          <span>가장 많을 때 {max}장</span>
          <span>{roundShort(schedule, last.round)}</span>
        </p>
      )}
    </Card>
  );
}
