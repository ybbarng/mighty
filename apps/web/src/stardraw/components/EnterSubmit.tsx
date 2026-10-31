"use client";

import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { play } from "@/game/sound";
import { cn } from "@/lib/cn";
import { EASE, EASE_OUT, FX } from "../fx-timing";
import { SKY_STARS, starOf } from "../sky";
import { LottoBall } from "./parts";

/**
 * 고른 별 6칸 한 줄(작은 수부터). 고르는 화면에서는 누르면 그 별을 빼고(onRemove), 제출 연출에서는 그대로 보인다.
 * `hidden`의 별은 자리만 남긴다(용지로 옮겨 간 별)
 */
export const PickedRow = forwardRef<
  HTMLElement,
  {
    title: string;
    picked: readonly number[];
    onRemove?: ((n: number) => void) | undefined;
    hidden?: readonly number[];
    /** 6개를 다 고른 뒤 또 누름: 한 번 흔들린다(글 없이) */
    shake?: boolean;
    className?: string;
    style?: React.CSSProperties;
  }
>(function PickedRow(
  { title, picked, onRemove, hidden = [], shake = false, className, style },
  ref,
) {
  const sorted = [...picked].sort((a, b) => a - b);
  return (
    <section
      ref={ref}
      aria-label={title}
      data-entry-slip={picked.length}
      style={style}
      className={cn(
        "sd-slip relative rounded-2xl px-3.5 pt-3 pb-3.5",
        picked.length === 6 && "sd-slip-full",
        shake && "sd-shake",
        className,
      )}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 className="font-bold text-base text-rose-50 tabular-nums">
          {title}
        </h2>
        <span
          className="font-mono text-rose-100/70 text-sm tabular-nums"
          aria-live="polite"
        >
          {picked.length}/6
        </span>
      </div>
      <ol className="grid grid-cols-6 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const n = sorted[i];
          if (n === undefined)
            return (
              <li
                key={`empty-${i}`}
                className="grid aspect-square place-items-center rounded-xl border border-rose-200/25 border-dashed"
              >
                <span className="size-6 rounded-full border border-rose-200/25 border-dashed" />
              </li>
            );
          const st = starOf(n);
          const gone = hidden.includes(n);
          return (
            <li key={n} className="aspect-square">
              <button
                type="button"
                disabled={!onRemove}
                onClick={() => onRemove?.(n)}
                aria-label={`${n} ${st.ko} 빼기`}
                data-slip-star={n}
                className={cn(
                  "sd-pop grid size-full place-items-center rounded-xl border border-amber-200/45 bg-amber-100/10 hover:bg-amber-100/15",
                  gone && "border-rose-200/25 border-dashed bg-transparent",
                )}
              >
                <span className={cn(gone && "invisible")}>
                  <LottoBall n={n} size="md" />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

/** 실제 로또 용지처럼 1~45 칸(누를 수 없다). `marked` 칸은 펜으로 칠하듯 채워진다 */
const NumberPaper = forwardRef<
  HTMLFieldSetElement,
  { marked: readonly number[] }
>(function NumberPaper({ marked }, ref) {
  return (
    <fieldset
      ref={ref}
      aria-label="응모 용지"
      className="rounded-2xl border border-rose-300/25 bg-[#1b1622] p-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
    >
      <div className="grid grid-cols-7 gap-1.5">
        {SKY_STARS.map((s) => {
          const on = marked.includes(s.n);
          return (
            <span
              key={s.n}
              data-cell={s.n}
              data-marked={on || undefined}
              className={cn(
                "sd-cell relative grid h-9 place-items-center rounded-md font-semibold text-sm tabular-nums",
                on ? "sd-cell-ink text-slate-950" : "text-rose-100/85",
              )}
              style={{ ["--ink-ms" as string]: `${FX.starMark}ms` }}
            >
              {/* 용지의 칸 괄호 */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-1 inset-y-1 rounded-sm border-rose-300/40 border-x",
                  on && "border-transparent",
                )}
              />
              <span className="relative">{s.n}</span>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
});

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/**
 * 응모 용지 작성과 제출(오버레이 안, 움직임 줄이기가 아닐 때). 차례대로 하나씩:
 * 위쪽 "응모 용지를 작성해 주세요." → 고른 별 줄과 용지가 함께 아래에서 미끄러져 올라와 아래쪽에 붙음 → 별이 하나씩
 * 자기 칸으로 옮겨 가 칸을 칠함 → "용지를 밀어 올려 제출해 주세요." → 사람이 용지를 위로 밀어 올리거나 용지를 한 번
 * 누름 → 용지가 위(우주국)로 올라가 사라지면 `onSubmitted`.
 * 용지는 아래(내 앞)에 두고 위로 제출한다(2026-10-31 사용자). 시간은 fx-timing의 FX
 */
export function SubmitView({
  title,
  picked,
  onSubmitted,
}: {
  title: string;
  picked: readonly number[];
  onSubmitted: () => void;
}) {
  const rowEl = useRef<HTMLElement>(null);
  const paper = useRef<HTMLFieldSetElement>(null);
  const [text, setText] = useState("응모 용지를 작성해 주세요.");
  const [sheet, setSheet] = useState<"below" | "in" | "away">("below");
  const [flown, setFlown] = useState<number[]>([]);
  const [marked, setMarked] = useState<number[]>([]);
  /** 위쪽 별 칸 줄: 마킹이 끝나면 흐려져 없어진다(응모 용지가 아니라서, 2026-10-31 사용자) */
  const [row, setRow] = useState<"shown" | "fading" | "gone">("shown");
  /** 밀어 올리기를 기다리는 중 */
  const [awaiting, setAwaiting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 그릴 때 한 번 차례대로
  useEffect(() => {
    let alive = true;
    const clones: HTMLElement[] = [];
    const sorted = [...picked].sort((a, b) => a - b);
    void (async () => {
      await wait(FX.read);
      if (!alive) return;
      setSheet("in");
      await wait(FX.sheetIn + FX.pause);
      for (const n of sorted) {
        if (!alive) return;
        await flyStar(n, clones);
        if (!alive) return;
        setMarked((m) => [...m, n]);
        play("starTick");
        await wait(FX.starMark + FX.starRest);
      }
      await wait(FX.pause);
      if (!alive) return;
      setRow("fading");
      await wait(FX.rowFade);
      if (!alive) return;
      setRow("gone");
      await wait(FX.pause);
      if (!alive) return;
      setText("용지를 밀어 올려 제출해 주세요.");
      setAwaiting(true);
    })();
    return () => {
      alive = false;
      for (const c of clones) c.remove();
    };
  }, []);

  /** 별 하나: 제자리에서 살짝 떠올라 자기 칸까지 날아가 닿으면 반짝이며 사라진다 */
  const flyStar = async (n: number, clones: HTMLElement[]) => {
    const from = rowEl.current?.querySelector<HTMLElement>(
      `[data-slip-star="${n}"] [data-ball]`,
    );
    const to = paper.current?.querySelector<HTMLElement>(`[data-cell="${n}"]`);
    setFlown((f) => [...f, n]);
    if (!from || !to) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const clone = from.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, {
      position: "fixed",
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      margin: "0",
      zIndex: "71",
      pointerEvents: "none",
    });
    document.body.appendChild(clone);
    clones.push(clone);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const total = FX.starLift + FX.starFlight;
    const lift = FX.starLift / total;
    const anim = clone.animate(
      [
        { transform: "translate(0, 0) scale(1)", offset: 0 },
        { transform: "translate(0, -10px) scale(1.12)", offset: lift },
        {
          transform: `translate(${dx * 0.55}px, ${dy * 0.45 - 28}px) scale(1.05)`,
          offset: lift + (1 - lift) * 0.55,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, offset: 1 },
      ],
      { duration: total, easing: EASE, fill: "forwards" },
    );
    await anim.finished.catch(() => {});
    // 닿으면 반짝이며 사라진다(칸은 그 사이 칠해진다)
    const out = clone.animate(
      [
        { opacity: 1, filter: "brightness(1.6)" },
        { opacity: 0, filter: "brightness(2)" },
      ],
      { duration: FX.starMark, easing: "ease-out", fill: "forwards" },
    );
    void out.finished.then(() => clone.remove()).catch(() => {});
  };

  /** 제출: 용지가 위로 올라가 사라진 뒤 `onSubmitted` */
  const submit = async () => {
    if (!awaiting) return;
    setAwaiting(false);
    navigator.vibrate?.(20);
    setSheet("away");
    await wait(FX.paperAway + FX.pause);
    onSubmitted();
  };

  return (
    <section
      className="flex min-h-full flex-1 flex-col gap-4"
      aria-label="응모 용지 제출"
    >
      <p
        key={text}
        role="status"
        className="sd-text-in sd-submit-status min-h-8 text-center font-bold text-amber-100 text-lg"
      >
        {text}
      </p>
      <div className="flex-1" />
      <Sheet sheet={sheet} awaiting={awaiting} onSwiped={() => void submit()}>
        {row !== "gone" && (
          <PickedRow
            ref={rowEl}
            title={title}
            picked={picked}
            hidden={flown}
            className="sd-submit-row mx-auto w-full max-w-md transition-opacity"
            style={{
              opacity: row === "fading" ? 0 : 1,
              transitionDuration: `${FX.rowFade}ms`,
            }}
          />
        )}
        <NumberPaper ref={paper} marked={marked} />
      </Sheet>
    </section>
  );
}

/**
 * 아래쪽에 붙는 용지 덩어리. 제출을 기다리는 동안은 용지 자체가 단추다(「용지 제출」): 위쪽 손잡이 막대와 아주 은은한
 * 떠오름으로 알리고, 끌면 손을 따라오며(살짝 기울고 그림자가 짙어진다) 일정 거리·속도를 넘기면 손을 떼도 위로
 * 날아간다. 못 미치면 제자리로 돌아온다. 한 번 누르기(탭·클릭)와 키보드 Enter·Space·↑도 같은 제출이라 끌기가 어려운
 * 사람·마우스·화면 읽기 프로그램도 쓸 수 있다. 조금이라도 끌었으면(TAP_SLOP 넘게) 누르기로 보지 않는다
 */
const TAP_SLOP = 8;

function Sheet({
  sheet,
  awaiting,
  onSwiped,
  children,
}: {
  sheet: "below" | "in" | "away";
  awaiting: boolean;
  onSwiped: () => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; t: number; lastY: number; lastT: number }>(
    null,
  );
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!awaiting) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    start.current = {
      y: e.clientY,
      t: e.timeStamp,
      lastY: e.clientY,
      lastT: e.timeStamp,
    };
    setDrag(0);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    s.lastY = e.clientY;
    s.lastT = e.timeStamp;
    // 위로만 따라온다(아래로는 조금만 늘어난다)
    const dy = e.clientY - s.y;
    setDrag(dy < 0 ? dy : dy * 0.2);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dy = e.clientY - s.y;
    const dt = Math.max(1, e.timeStamp - s.lastT);
    const v = (e.clientY - s.lastY) / dt;
    const tap = Math.abs(dy) <= TAP_SLOP && e.type === "pointerup";
    if (tap || -dy > FX.swipeDistance || v < -FX.swipeVelocity) onSwiped();
    setDrag(null);
  };
  const dragging = drag !== null;
  const transform =
    sheet === "below"
      ? "translateY(100vh)"
      : sheet === "away"
        ? "translateY(-120vh)"
        : dragging
          ? `translateY(${drag}px) rotate(${(drag ?? 0) / -60}deg) scale(${1 + Math.min(0.03, -(drag ?? 0) / 4000)})`
          : "translateY(0)";
  const transition = dragging
    ? "none"
    : sheet === "away"
      ? `transform ${FX.paperAway}ms ${EASE_OUT}`
      : sheet === "in"
        ? `transform ${awaiting ? FX.swipeBack : FX.sheetIn}ms ${EASE}`
        : "none";
  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: 안에 번호 칸과 별 줄을 담은 덩어리라 button으로 감쌀 수 없다 */}
      <div
        role="button"
        aria-label="용지 제출"
        aria-disabled={!awaiting}
        tabIndex={awaiting ? 0 : -1}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if (
            awaiting &&
            (e.key === "Enter" || e.key === " " || e.key === "ArrowUp")
          ) {
            e.preventDefault();
            onSwiped();
          }
        }}
        data-sheet={sheet}
        data-awaiting={awaiting || undefined}
        className={cn(
          "flex touch-none select-none flex-col gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070b16]",
          awaiting && !dragging && "sd-sheet-hint cursor-grab",
          dragging && "cursor-grabbing",
        )}
        style={{
          transform,
          transition,
          filter: dragging
            ? `drop-shadow(0 ${16 + Math.min(24, -(drag ?? 0) / 6)}px 28px rgba(0,0,0,0.5))`
            : undefined,
        }}
      >
        {awaiting && (
          <span
            aria-hidden="true"
            className="mx-auto h-1.5 w-10 rounded-full bg-white/35"
          />
        )}
        {children}
      </div>
    </div>
  );
}
