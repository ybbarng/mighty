"use client";

import { useEffect, useRef, useState } from "react";

import { summarizeMighty } from "@/game/mighty-stats";
import { useSettings } from "@/game/settings";
import { kirudaName } from "@/game/terms";
import { summarizeHearts } from "@/hearts/stats";
import { cn } from "@/lib/cn";

import { clearStats, importStats, loadStats, type StatsBook } from "./records";
import {
  Card,
  Counts,
  Moments,
  pct,
  RateBar,
  RateColumns,
  ResultStrip,
  StatTile,
  TrendLine,
} from "./widgets";

/** 열 판마다 한 단계 오른다 */
const ROUNDS_PER_LEVEL = 10;

const RANKS = ["1등", "2등", "3등", "4등"];

const ROLE_NAME = { declarer: "주공", friend: "프렌드", opposition: "야당" };

function signed(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}`;
}

/**
 * 내 기록: 이 기기에 쌓인 판·게임 기록으로 승률과 여러 지표를 보여 준다(오버워치 개인 프로필처럼).
 * 기록은 서버 없이 이 브라우저에만 있으므로 내보내기·가져오기로 옮기거나 남겨 둔다
 */
export function ProfilePage() {
  const name = useSettings((s) => s.playerName);
  const [book, setBook] = useState<StatsBook | null>(null);
  const [tab, setTab] = useState<"mighty" | "hearts">("mighty");
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 들어온 게임의 처음 화면. 게임 목록에서 왔으면 목록 */
  const [back, setBack] = useState("/");
  const file = useRef<HTMLInputElement>(null);

  // 저장소는 브라우저에만 있으므로 그린 뒤에 읽는다.
  useEffect(() => {
    setBook(loadStats());
    // 게임에서 들어왔으면 그 게임 기록부터 보이고 그 게임으로 돌아간다.
    const game = new URLSearchParams(window.location.search).get("game");
    if (game === "mighty" || game === "hearts") {
      setBack(`/${game}`);
      setTab(game);
    }
  }, []);
  if (!book) return <main className="min-h-dvh bg-slate-950" />;

  const total = book.rounds.length;
  const level = Math.floor(total / ROUNDS_PER_LEVEL) + 1;
  const progress = (total % ROUNDS_PER_LEVEL) / ROUNDS_PER_LEVEL;

  const exportBook = () => {
    const blob = new Blob([JSON.stringify(book)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mighty-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importBook = async (f: File) => {
    const count = importStats(await f.text());
    setNotice(
      count === null
        ? "기록 파일이 아닙니다"
        : `가져왔습니다. 이제 ${count}판이 있습니다`,
    );
    setBook(loadStats());
  };

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex flex-col gap-4 rounded-3xl bg-[linear-gradient(135deg,#14532d_0%,#0f172a_70%)] p-5 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <a
              href={back}
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
            >
              ← 처음으로
            </a>
            <a
              href="/review"
              className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
            >
              지난 게임 복기 →
            </a>
            <span className="hidden text-white/50 text-xs sm:inline">
              {total > 0
                ? `${new Date(book.since).toLocaleDateString("ko-KR")}부터`
                : ""}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-amber-300/70 bg-black/40">
              <span className="text-[10px] text-amber-200/80">레벨</span>
              <span className="font-black text-3xl text-amber-200">
                {level}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className="truncate font-black text-2xl">
                {name || "이름 없는 플레이어"}
              </h1>
              <div className="text-sm text-white/70">
                {total}판 · 게임 {book.games.length}번
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-amber-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="text-white/50 text-xs">
                다음 레벨까지 {ROUNDS_PER_LEVEL - (total % ROUNDS_PER_LEVEL)}판
              </div>
            </div>
          </div>
          <div className="flex gap-1.5" role="tablist">
            {(["mighty", "hearts"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full px-4 py-1.5 font-semibold text-sm",
                  tab === t ? "bg-white text-black" : "bg-white/10",
                )}
              >
                {t === "mighty" ? "♠ 마이티" : "♥ 하트"}
              </button>
            ))}
          </div>
        </header>

        {tab === "mighty" ? (
          <MightyStats book={book} />
        ) : (
          <HeartsStats book={book} />
        )}

        <Card title="기록 관리">
          <p className="text-sm text-white/60">
            기록은 이 브라우저에만 있습니다. 브라우저 데이터를 지우면 함께
            사라지니, 가끔 내보내 두세요. 다른 기기에서 가져오면 합칩니다.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={exportBook}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
            >
              내보내기
            </button>
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
            >
              가져오기
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="기록 파일"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importBook(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                clearStats();
                setBook(loadStats());
                setConfirmClear(false);
                setNotice("기록을 지웠습니다");
              }}
              className={cn(
                "rounded-lg px-3 py-1.5",
                confirmClear ? "bg-rose-600" : "bg-white/10 hover:bg-white/15",
              )}
            >
              {confirmClear ? "정말 모두 지울까요?" : "기록 지우기"}
            </button>
          </div>
          {notice && (
            <p role="status" className="text-sm text-white/80">
              {notice}
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <Card title="아직 기록이 없습니다">
      <p className="text-sm text-white/70">
        {what}를 한 판 끝까지 두면 여기에 쌓입니다. 혼자 하기와 친구와 하기를
        모두 기록하고, 배우기는 기록하지 않습니다.
      </p>
    </Card>
  );
}

function MightyStats({ book }: { book: StatsBook }) {
  const s = summarizeMighty(book.rounds, book.games);
  if (s.rounds === 0) return <Empty what="마이티" />;
  const c = s.counts;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="판 승률"
          value={pct(s.overall.won, s.overall.n)}
          sub={`${s.overall.won}승 ${s.overall.n - s.overall.won}패`}
        />
        <StatTile
          label="주공 성공률"
          value={pct(s.byRole.declarer.won, s.byRole.declarer.n)}
          sub={`공약 ${s.byRole.declarer.n}번`}
        />
        <StatTile
          label="번 돈"
          value={signed(s.money)}
          sub={`한 판 최고 ${signed(s.bestRound)}`}
        />
        <StatTile
          label="게임 1등"
          value={pct(s.firsts.won, s.firsts.n)}
          sub={`${s.firsts.won}/${s.firsts.n}게임`}
        />
      </div>

      <Card title="숫자로 보기">
        <Counts
          items={[
            { label: "총 판", value: c.rounds },
            { label: "이긴 판", value: c.won },
            { label: "진 판", value: c.lost },
            ...(c.out > 0 ? [{ label: "죽어서 빠진 판", value: c.out }] : []),
            { label: "주공", value: c.declarer, sub: `성공 ${c.declarerWon}` },
            { label: "프렌드", value: c.friend, sub: `승 ${c.friendWon}` },
            {
              label: "야당",
              value: c.opposition,
              sub: `승 ${c.oppositionWon}`,
            },
            { label: "출마한 판", value: c.bids },
            { label: "먹은 턴", value: c.tricks },
            { label: "딴 점수 카드", value: c.points },
            { label: "조커 낸 판", value: c.jokerPlays },
            { label: "조커콜", value: c.jokerCalls },
            { label: "조커콜로 조커 끌어냄", value: c.jokerCallHits },
            { label: "조커콜 턴 먹음", value: c.jokerCallWins },
          ]}
        />
      </Card>

      <Card title="역할별 승률">
        {(["declarer", "friend", "opposition"] as const).map((role) => (
          <RateBar
            key={role}
            label={ROLE_NAME[role]}
            won={s.byRole[role].won}
            n={s.byRole[role].n}
          />
        ))}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="공약별 성공률(주공)">
          {s.byGoal.length > 0 ? (
            <RateColumns
              items={s.byGoal.map((g) => ({
                label: `${g.score}`,
                won: g.rate.won,
                n: g.rate.n,
              }))}
            />
          ) : (
            <p className="text-sm text-white/50">
              아직 공약을 걸지 않았습니다.
            </p>
          )}
        </Card>
        <Card title="기루다별 성공률(주공)">
          {s.byKiruda.length > 0 ? (
            s.byKiruda.map((k) => (
              <RateBar
                key={k.kiruda}
                label={kirudaName(k.kiruda)}
                won={k.rate.won}
                n={k.rate.n}
              />
            ))
          ) : (
            <p className="text-sm text-white/50">
              아직 공약을 걸지 않았습니다.
            </p>
          )}
        </Card>
      </div>

      <Card title="번 돈 흐름(최근 100판)">
        <TrendLine values={s.moneyLine} unit="" label="쌓인 돈" />
        <p className="text-white/50 text-xs">
          가장 크게 잃은 판 {signed(s.worstRound)} · 가장 긴 연승 {s.bestStreak}
          판 ·{" "}
          {s.streak >= 0 ? `지금 ${s.streak}연승` : `지금 ${-s.streak}연패`}
        </p>
      </Card>

      <Card title={`최근 ${s.recent.length}판`}>
        <ResultStrip
          title="최근 판 결과"
          results={s.recent.map((r) => ({
            won: r.won,
            title: ROLE_NAME[r.role],
          }))}
        />
      </Card>

      <Card title="명장면">
        <Moments
          items={[
            { icon: "🏃", label: "런으로 이김", count: s.moments.run },
            { icon: "↩️", label: "백런으로 이김", count: s.moments.reverseRun },
            {
              icon: "🙅",
              label: "노프렌드 성공",
              count: s.moments.noFriendWin,
            },
            {
              icon: "🚫",
              label: "노기루다 성공",
              count: s.moments.noKirudaWin,
            },
            { icon: "👑", label: "마이티 낸 판", count: s.moments.mighty },
            { icon: "🃏", label: "조커콜 한 판", count: s.moments.jokerCall },
            { icon: "🗡️", label: "죽인 판", count: s.moments.killer },
            { icon: "💀", label: "죽은 판", count: s.moments.killed },
          ]}
        />
      </Card>

      {s.byPlayers.length > 1 && (
        <Card title="몇 마별 승률">
          {s.byPlayers.map((p) => (
            <RateBar
              key={p.players}
              label={`${p.players}마`}
              won={p.rate.won}
              n={p.rate.n}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function HeartsStats({ book }: { book: StatsBook }) {
  const s = summarizeHearts(book.rounds, book.games);
  if (s.rounds === 0) return <Empty what="하트" />;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="게임 승률"
          value={pct(s.wins, s.games)}
          sub={`${s.wins}/${s.games}게임`}
        />
        <StatTile
          label="판 평균 점수"
          value={s.average.toFixed(1)}
          sub="낮을수록 좋다"
        />
        <StatTile
          label="0점 판"
          value={pct(s.clean, s.rounds)}
          sub={`${s.clean}/${s.rounds}판`}
        />
        <StatTile
          label="가장 좋은 게임"
          value={s.bestGame ?? "—"}
          sub="끝난 게임의 가장 낮은 점수"
        />
      </div>
      <Card title="숫자로 보기">
        <Counts
          items={[
            { label: "총 판", value: s.rounds },
            { label: "끝낸 게임", value: s.games },
            { label: "이긴 게임", value: s.wins },
            { label: "받은 점수", value: s.points },
            { label: "먹은 턴", value: s.tricks },
            { label: "0점 판", value: s.clean },
            { label: "♠Q 먹은 판", value: s.queen },
            { label: "문 슛 성공", value: s.moonMe },
            { label: "문 슛 당함", value: s.moonOther },
          ]}
        />
      </Card>
      <Card title="게임 순위">
        {s.ranks.map((count, i) => (
          <RateBar key={RANKS[i]} label={RANKS[i]} won={count} n={s.games} />
        ))}
      </Card>
      <Card title={`최근 ${s.recent.length}판에 받은 점수`}>
        <TrendLine values={s.recent} unit="점" label="판마다 받은 점수" />
      </Card>
      <Card title="명장면">
        <Moments
          items={[
            { icon: "🌙", label: "문 슛 성공", count: s.moonMe },
            { icon: "🌑", label: "문 슛 당함", count: s.moonOther },
            { icon: "👸", label: "♠Q 먹은 판", count: s.queen },
            { icon: "🧼", label: "0점 판", count: s.clean },
          ]}
        />
      </Card>
    </>
  );
}
