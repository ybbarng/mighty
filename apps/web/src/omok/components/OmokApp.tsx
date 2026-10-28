"use client";

import {
  type OmokView,
  pointName,
  seatToMove,
  stoneOfSeat,
} from "@mighty/omok-engine";
import { useEffect, useState } from "react";

import { BackToGames } from "@/components/BackToGames";
import { MadeWith } from "@/components/brand/MadeWith";
import { ChatBox } from "@/components/ChatBox";
import { cn } from "@/lib/cn";
import { type HostRestore, hostedRoom } from "@/net/host-store";

import { endOmokSession } from "../session";
import {
  OMOK_LEVELS,
  type OmokLevel,
  useOmokSettings,
  VARIANT_INFO,
} from "../settings";
import {
  clearOmok,
  loadOmok,
  type OmokSaved,
  type StonePick,
  useOmok,
} from "../store";
import { OmokBoard } from "./OmokBoard";
import { OmokOnlineScreen } from "./OmokOnlineScreen";

const WINS_OPTIONS = [
  { value: 1, label: "한 판" },
  { value: 2, label: "3판 2승" },
  { value: 3, label: "5판 3승" },
] as const;

const PICK_OPTIONS: readonly { value: StonePick; label: string }[] = [
  { value: "black", label: "● 흑(먼저)" },
  { value: "white", label: "○ 백" },
  { value: "random", label: "무작위" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm transition",
        active
          ? "border-amber-300 bg-amber-300 font-semibold text-black"
          : "border-white/15 bg-white/5 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold text-sm text-white/70">{title}</h2>
      {children}
    </section>
  );
}

/** 시작 화면: 규칙·판 수·컴퓨터·내 돌을 고른다 */
function OmokStart({
  onStart,
  onOnline,
}: {
  onStart: (saved?: OmokSaved) => void;
  onOnline: () => void;
}) {
  const s = useOmokSettings();
  const [saved, setSaved] = useState<OmokSaved | null>(null);
  useEffect(() => setSaved(loadOmok()), []);
  const variant = VARIANT_INFO.find((v) => v.value === s.variant);
  const level = OMOK_LEVELS.find((l) => l.value === s.level);

  return (
    <main
      data-game="center"
      className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)] px-4 py-6 text-white"
    >
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <BackToGames />
        <header className="text-center">
          <h1 className="font-black text-4xl tracking-tight">오목</h1>
          <p className="mt-1 text-sm text-white/70">
            가로·세로·대각선으로 다섯 개를 먼저 잇는 사람이 이긴다
          </p>
        </header>

        {saved && (
          <button
            type="button"
            onClick={() => onStart(saved)}
            className="rounded-2xl bg-white/10 py-3 font-semibold hover:bg-white/15"
          >
            이어하기
          </button>
        )}

        <Section title="규칙">
          <div className="flex gap-2">
            {VARIANT_INFO.map((v) => (
              <Chip
                key={v.value}
                active={s.variant === v.value}
                onClick={() => s.set({ variant: v.value })}
              >
                {v.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">{variant?.description}</p>
        </Section>

        <Section title="판 수">
          <div className="flex gap-2">
            {WINS_OPTIONS.map((w) => (
              <Chip
                key={w.value}
                active={s.winsToFinish === w.value}
                onClick={() => s.set({ winsToFinish: w.value })}
              >
                {w.label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="컴퓨터">
          <div className="flex gap-2">
            {OMOK_LEVELS.map((l) => (
              <Chip
                key={l.value}
                active={s.level === l.value}
                onClick={() => s.set({ level: l.value as OmokLevel })}
              >
                {l.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">{level?.description}</p>
        </Section>

        <Section title="내 돌">
          <div className="flex gap-2">
            {PICK_OPTIONS.map((p) => (
              <Chip
                key={p.value}
                active={s.pick === p.value}
                onClick={() => s.set({ pick: p.value })}
              >
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="text-white/60 text-xs">
            여러 판이면 판마다 흑백을 바꾼다
          </p>
        </Section>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.showForbidden}
            onChange={(e) => s.set({ showForbidden: e.target.checked })}
            className="size-4 accent-amber-300"
          />
          내 차례에 금지 자리를 ×로 보이기
        </label>

        <button
          type="button"
          onClick={() => onStart()}
          className="rounded-2xl bg-amber-300 py-3 font-bold text-black text-lg hover:bg-amber-200"
        >
          컴퓨터와 시작
        </button>
        <button
          type="button"
          onClick={onOnline}
          className="rounded-2xl border border-amber-300/60 py-3 font-bold text-amber-200 text-lg hover:bg-amber-300/10"
        >
          친구와 하기
        </button>
        <p className="-mt-3 text-center text-white/50 text-xs">
          방을 만들어 링크를 보내면 친구가 바로 들어옵니다. 위에서 고른 규칙과
          판 수를 씁니다
        </p>
        <p className="mt-2 text-center text-[11px] opacity-40">
          <MadeWith />
        </p>
      </div>
    </main>
  );
}

/** 자리 표: 이름, 돌 색, 이긴 판 수, 차례 표시 */
function PlayerPlate({
  view,
  seat,
  name,
}: {
  view: OmokView;
  seat: number;
  name: string;
}) {
  const black = stoneOfSeat(view, seat) === 1;
  const turn = seatToMove(view) === seat;
  return (
    <div
      data-turn={turn || undefined}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2",
        turn
          ? "border-amber-300 bg-amber-300/15"
          : "border-white/10 bg-white/5",
      )}
    >
      {/* 판 위 돌과 같은 빛(왼쪽 위)과 그림자 */}
      <span
        className="size-5 shrink-0 rounded-full shadow-[1px_2px_2px_rgba(0,0,0,0.5)]"
        style={{
          background: black
            ? "radial-gradient(circle at 36% 32%, #6b6b6b, #2a2a2a 35%, #050505)"
            : "radial-gradient(circle at 36% 32%, #ffffff, #f1f0ec 55%, #b9b6ae)",
        }}
      />
      <span className="truncate font-semibold text-sm">{name}</span>
      <span className="ml-auto text-sm text-white/70">
        {view.wins[seat] ?? 0}승
      </span>
    </div>
  );
}

/** 대국 화면 */
function OmokGame({ onExit }: { onExit: () => void }) {
  const {
    view,
    host,
    local,
    notice,
    level,
    seatNames,
    reconnecting,
    hostLeft,
  } = useOmok();
  const submit = useOmok((s) => s.submit);
  const undo = useOmok((s) => s.undo);
  const canUndo = useOmok((s) => s.canUndo());
  const clearNotice = useOmok((s) => s.clearNotice);
  const showForbidden = useOmokSettings((s) => s.showForbidden);
  const [aim, setAim] = useState<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(clearNotice, 1800);
    return () => clearTimeout(id);
  }, [notice, clearNotice]);

  if (!view || !host) return null;
  const me = host.seat;
  const myStone = stoneOfSeat(view, me);
  const myTurn = view.phase === "play" && seatToMove(view) === me;
  const levelName = OMOK_LEVELS.find((l) => l.value === level)?.label ?? "";
  const online = local === null;
  const opponent = online
    ? (seatNames?.[1 - me] ?? "상대")
    : `컴퓨터(${levelName})`;
  const result = view.result;
  const lastMove = view.moves.at(-1) ?? null;

  let status: string;
  if (view.phase === "play")
    status = myTurn
      ? aim !== null
        ? `${pointName(aim)}: 한 번 더 누르면 둔다`
        : "내 차례 — 판을 눌러 두세요"
      : online
        ? `${opponent}의 차례`
        : "컴퓨터가 생각하는 중…";
  else if (result?.kind === "draw") status = "비겼어요";
  else if (result?.seat === me)
    status = result.kind === "resign" ? "상대가 기권했어요" : "이겼어요!";
  else status = result?.kind === "resign" ? "기권했어요" : "졌어요";

  const gameOver = view.phase === "gameOver";
  const variantLabel = VARIANT_INFO.find(
    (v) => v.value === view.rules.variant,
  )?.label;

  return (
    <main
      data-game="omok"
      className="flex min-h-dvh flex-col items-center gap-3 bg-[#1c1917] px-4 py-3 text-white short-landscape:grid short-landscape:grid-cols-[auto_minmax(0,18rem)] short-landscape:grid-rows-[auto_auto_auto_1fr] short-landscape:content-center short-landscape:justify-center short-landscape:gap-x-6"
    >
      <header className="flex w-full max-w-xl items-center gap-2 text-sm short-landscape:col-start-2 short-landscape:row-start-1">
        <button
          type="button"
          onClick={onExit}
          className="text-white/70 hover:text-white"
        >
          ← 오목
        </button>
        <span className="ml-auto text-white/60">
          {variantLabel} · {view.roundNumber}판째
        </span>
      </header>

      {online && (reconnecting || hostLeft) && (
        <p
          role="alert"
          className="w-full max-w-xl rounded-xl bg-rose-700/80 px-3 py-2 text-center text-sm short-landscape:col-start-2"
        >
          {hostLeft
            ? "방장이 방을 나갔습니다"
            : "방장과 연결이 끊겼습니다. 다시 연결하는 중…"}
        </p>
      )}

      <div className="flex w-full max-w-xl gap-2 short-landscape:col-start-2 short-landscape:row-start-2 short-landscape:flex-col">
        <PlayerPlate view={view} seat={me} name="나" />
        <PlayerPlate view={view} seat={1 - me} name={opponent} />
      </div>

      {/* 휴대폰 가로: 판이 화면 높이를 꽉 채우고 나머지는 오른쪽에 */}
      <div className="aspect-square w-[min(100%,calc(100dvh-15rem))] max-w-xl short-landscape:col-start-1 short-landscape:row-span-4 short-landscape:row-start-1 short-landscape:w-[calc(100dvh-1.5rem)]">
        <OmokBoard
          board={view.board}
          myStone={myStone}
          canPlay={myTurn}
          lastMove={lastMove}
          winLine={result?.kind === "five" ? result.line : null}
          forbidden={showForbidden ? view.forbidden : []}
          aim={aim}
          onAim={setAim}
          onPlace={(at) => submit({ type: "place", at })}
        />
      </div>

      <p
        role="status"
        className="min-h-6 text-center font-semibold short-landscape:col-start-2 short-landscape:row-start-3"
      >
        {notice ?? status}
      </p>

      <div className="flex w-full max-w-xl flex-wrap justify-center gap-2 short-landscape:col-start-2 short-landscape:row-start-4 short-landscape:content-start">
        {view.phase === "play" && (
          <>
            {aim !== null && myTurn && (
              <button
                type="button"
                onClick={() => {
                  setAim(null);
                  submit({ type: "place", at: aim });
                }}
                className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
              >
                여기 두기
              </button>
            )}
            {!online && (
              <button
                type="button"
                disabled={!canUndo}
                onClick={() => {
                  setAim(null);
                  undo();
                }}
                className="rounded-xl bg-white/10 px-4 py-2 disabled:opacity-40"
              >
                무르기
              </button>
            )}
            {/* 온라인 참가자는 내 차례에만 행동을 보낼 수 있다 */}
            {(!online || myTurn) && (
              <button
                type="button"
                onClick={() => submit({ type: "resign" })}
                className="rounded-xl bg-white/10 px-4 py-2"
              >
                기권
              </button>
            )}
          </>
        )}
        {view.phase === "roundEnd" && !view.continued[me] && (
          <button
            type="button"
            onClick={() => submit({ type: "continue" })}
            className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
          >
            다음 판
          </button>
        )}
        {gameOver && (
          <>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-black"
            >
              다시 하기
            </button>
            <a href="/" className="rounded-xl bg-white/10 px-4 py-2">
              게임 목록
            </a>
          </>
        )}
      </div>

      {online && (
        <div className="w-full max-w-xl short-landscape:col-start-2">
          <ChatBox mySeat={me} />
        </div>
      )}
    </main>
  );
}

type Screen =
  | { kind: "start" }
  | {
      kind: "online";
      /** 초대 링크로 들어왔으면 방 코드, 방장이면 null */
      room: string | null;
      /** 방장이 새로고침했으면 이 탭이 연 방과 남긴 것 */
      resume?: { room: string; restore: HostRestore };
    }
  | { kind: "playing" };

/** 오목(/omok): 시작 화면, 친구와 하기 방, 대국 화면 */
export function OmokApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "start" });
  const view = useOmok((s) => s.view);
  const variant = useOmokSettings((s) => s.variant);
  const winsToFinish = useOmokSettings((s) => s.winsToFinish);

  // 다 끝난 게임은 이어하기에 남기지 않는다.
  useEffect(() => {
    if (view?.phase === "gameOver") clearOmok();
  }, [view?.phase]);

  // 초대 링크로 왔으면 그 방으로, 방장이 새로고침했으면 연 방을 다시 연다.
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (room) {
      setScreen({ kind: "online", room });
      return;
    }
    const hosted = hostedRoom("omok");
    if (hosted) setScreen({ kind: "online", room: null, resume: hosted });
  }, []);

  const backToStart = () => {
    endOmokSession();
    useOmok.getState().leave();
    if (window.location.search.includes("room=")) {
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url);
    }
    setScreen({ kind: "start" });
  };

  if (screen.kind === "online")
    return (
      <OmokOnlineScreen
        rules={{ variant, winsToFinish }}
        roomFromUrl={screen.room}
        {...(screen.resume ? { resume: screen.resume } : {})}
        onBack={backToStart}
        onPlaying={() => setScreen({ kind: "playing" })}
      />
    );
  if (screen.kind === "playing") return <OmokGame onExit={backToStart} />;
  return (
    <OmokStart
      onOnline={() => setScreen({ kind: "online", room: null })}
      onStart={(saved) => {
        if (saved) useOmok.getState().resume(saved);
        else {
          const s = useOmokSettings.getState();
          useOmok.getState().newGame({
            rules: { variant: s.variant, winsToFinish: s.winsToFinish },
            level: s.level,
            pick: s.pick,
          });
        }
        setScreen({ kind: "playing" });
      }}
    />
  );
}
