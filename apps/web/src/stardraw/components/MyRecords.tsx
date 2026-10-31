"use client";

import type { Rank, Schedule } from "@mighty/stardraw-core";
import { type CSSProperties, type ReactNode, useState } from "react";
import { InviteQr } from "@/components/InviteQr";
import { cn } from "@/lib/cn";
import { Seal } from "../astronaut/marks";
import type { AwardGrade, EarnedAward } from "../awards";
import { constellationOf } from "../celebrate";
import { FX } from "../fx-timing";
import { HDR_GLOW_SRC, useHdrScreen } from "../hdr-glow";
import type { MyRecords, WinEntry } from "../my-records";
import { roundShort, roundTitle } from "../round-label";
import { starOf } from "../sky";
import { Medal3D } from "./Medal3D";
import { LottoBall, RANK_LABEL, shortId } from "./parts";
import { StageOverlay, useReducedMotion } from "./StageOverlay";
import { ticketUrl } from "./TicketView";

/**
 * 「내 기록」(docs/36 11-23): 훈장, 당첨증, 관측 수첩(4등 별 도장), 당첨 내역, 기념 서류.
 * 받은 것만 보이고, 받지 않은 서류의 이름·조건은 나오지 않는다(받기 전에는 무엇이 있는지 모르게, 사용자).
 * 무엇이든 누르면 크게 펼쳐 본다. 정품인지는 직인이 아니라 공개 장부가 보증한다(당첨증 QR → 공유 응모권 화면)
 */
export function MyRecordsView({
  records,
  specimen = false,
  schedule,
  recipient,
  onBack,
  onOpenTicket,
}: {
  /** 견본(데모 둘러보기, 로컬 빌드만): 공개 장부에 없는 응모권이라 당첨증 QR 대신 "견본" */
  specimen?: boolean;
  records: MyRecords;
  schedule: Schedule;
  /** 받는 사람 이름(등록증 이름). 없으면 비운다 */
  recipient: string | null;
  onBack: () => void;
  /** 이 기기에 있는 응모권이면 그 영수증으로 */
  onOpenTicket?: ((w: WinEntry) => void) | undefined;
}) {
  const [open, setOpen] = useState<Opened | null>(null);
  const medals = records.awards.filter((a) => a.form === "medal");
  const docs = records.awards.filter((a) => a.form !== "medal");
  const total = records.wins.length;
  return (
    <section
      className="flex flex-col gap-6"
      aria-label="내 기록"
      data-my-records
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/70 hover:text-white"
        >
          ← 내 응모
        </button>
        <h2 className="font-bold text-lg">내 기록</h2>
        <span className="w-16" />
      </div>

      {medals.length > 0 && (
        <Part title="훈장">
          <div className="flex flex-wrap justify-center gap-6">
            {medals.map((m) => (
              <button
                key={`${m.id}-${m.round}`}
                type="button"
                onClick={() => setOpen({ award: m })}
                className="flex flex-col items-center gap-2"
                data-record-medal={m.id}
              >
                <Medal award={m} size={120} live={false} />
                <span className="text-sm text-white/80">{m.name}</span>
              </button>
            ))}
          </div>
        </Part>
      )}

      {records.certificates.length > 0 && (
        <Part title="당첨증">
          <div className="flex flex-col gap-3">
            {records.certificates.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setOpen({ win: c })}
                data-record-certificate={c.round}
                className="sd-glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-white/10"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {roundShort(schedule, c.round)} {RANK_LABEL[c.rank]} 당첨증
                  </span>
                  <span className="text-white/55 text-xs">{dateOf(c.at)}</span>
                </span>
                <span className="flex gap-1">
                  {c.ticket.numbers.map((n) => (
                    <LottoBall
                      key={n}
                      n={n}
                      size="sm"
                      dim={!c.hits.includes(n)}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </Part>
      )}

      <Part title="관측 수첩">
        <StampBook
          stamps={records.stamps}
          schedule={schedule}
          onOpen={(w) => setOpen({ win: w })}
        />
      </Part>

      <Part title="당첨 내역">
        <div className="grid grid-cols-5 gap-1.5 text-center" data-win-counts>
          {([1, 2, 3, 4, 5] as Rank[]).map((r) => (
            <div
              key={r}
              className="sd-glass flex flex-col gap-0.5 rounded-xl py-2"
            >
              <span className="text-white/55 text-xs">{RANK_LABEL[r]}</span>
              <span
                className={cn(
                  "font-bold font-mono text-lg tabular-nums",
                  records.counts[r] > 0 ? "text-amber-100" : "text-white/35",
                )}
              >
                {records.counts[r]}
              </span>
            </div>
          ))}
        </div>
        {total === 0 ? (
          <p className="py-4 text-center text-sm text-white/55">
            아직 당첨된 응모권이 없습니다.
          </p>
        ) : (
          <WinList
            wins={records.wins}
            schedule={schedule}
            onOpen={onOpenTicket}
          />
        )}
      </Part>

      <Part title="기념 서류">
        {docs.length === 0 ? (
          <p className="py-4 text-center text-sm text-white/55">
            아직 받은 서류가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs
              .slice()
              .reverse()
              .map((a) => (
                <li key={`${a.id}-${a.step ?? ""}`}>
                  <button
                    type="button"
                    onClick={() => setOpen({ award: a })}
                    data-record-award={a.id}
                    className="sd-glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-white/10"
                  >
                    <FormMark award={a} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="break-keep font-semibold">{a.name}</span>
                      <span className="text-white/55 text-xs">
                        {a.round !== null
                          ? `${roundTitle(schedule, a.round)} · `
                          : ""}
                        {dateOf(a.at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Part>

      {open && (
        <StageOverlay
          label={open.award ? open.award.name : "당첨증"}
          align="center"
          scroll
        >
          <div className="flex flex-col items-center gap-5 py-6">
            {open.award ? (
              open.award.form === "medal" ? (
                <MedalSheet award={open.award} schedule={schedule} />
              ) : (
                <AwardDocument
                  award={open.award}
                  schedule={schedule}
                  recipient={recipient}
                />
              )
            ) : open.win && open.win.rank === 4 ? (
              <StampSheet win={open.win} schedule={schedule} />
            ) : open.win ? (
              <Certificate
                win={open.win}
                schedule={schedule}
                recipient={recipient}
                specimen={specimen}
              />
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="w-full max-w-xs rounded-2xl border border-white/25 py-3 font-semibold hover:bg-white/10"
            >
              닫기
            </button>
          </div>
        </StageOverlay>
      )}
    </section>
  );
}

interface Opened {
  award?: EarnedAward;
  win?: WinEntry;
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-sm text-white/70">{title}</h3>
      {children}
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const SHORT_DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
});

/** "2027년 3월 5일"(한국 시각) */
export function dateOf(seconds: number): string {
  return DATE.format(new Date(seconds * 1000));
}

const GRADE_COLOR: Record<AwardGrade, string> = {
  bronze: "#d39b6a",
  silver: "#d7dde8",
  gold: "#f3cf6b",
  star: "#fff1b8",
};

/** 목록의 작은 표: 종이·판·메달 모양 */
function FormMark({ award }: { award: EarnedAward }) {
  const c = GRADE_COLOR[award.grade];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center",
        award.form === "plaque" ? "rounded-md" : "rounded-sm",
      )}
      style={{
        background:
          award.form === "plaque"
            ? "linear-gradient(135deg,#5b3a24,#3a2416)"
            : "linear-gradient(160deg,#f7f0e1,#e6dac0)",
        boxShadow: `inset 0 0 0 2px ${c}`,
      }}
    >
      <span className="size-3 rounded-full" style={{ background: c }} />
    </span>
  );
}

/** 당첨 내역 목록(최근 회차부터, 많으면 더 보기) */
function WinList({
  wins,
  schedule,
  onOpen,
}: {
  wins: WinEntry[];
  schedule: Schedule;
  onOpen?: ((w: WinEntry) => void) | undefined;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? wins : wins.slice(0, 20);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5" data-win-list>
        {shown.map((w) => {
          const row = (
            <>
              <span className="flex flex-col text-left">
                <span className="font-semibold text-sm tabular-nums">
                  {roundShort(schedule, w.round)}
                </span>
                <span className="text-amber-200 text-xs">
                  {RANK_LABEL[w.rank]}
                </span>
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {w.ticket.numbers.map((n) => (
                  <LottoBall
                    key={n}
                    n={n}
                    size="sm"
                    dim={!w.hits.includes(n)}
                  />
                ))}
              </span>
            </>
          );
          return (
            <li key={w.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(w)}
                  className="sd-glass flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 hover:bg-white/10"
                >
                  {row}
                </button>
              ) : (
                <div className="sd-glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
                  {row}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!all && wins.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="self-center text-sm text-white/65 underline-offset-2 hover:text-white hover:underline"
        >
          {wins.length - shown.length}건 더 보기
        </button>
      )}
    </div>
  );
}

/** 관측 수첩: 한 장에 12칸, 4등이 나올 때마다 별 도장이 하나씩 찬다 */
function StampBook({
  stamps,
  schedule,
  onOpen,
}: {
  stamps: WinEntry[];
  schedule: Schedule;
  onOpen: (w: WinEntry) => void;
}) {
  const PER = 12;
  const pages = Math.max(1, Math.ceil(stamps.length / PER));
  const [page, setPage] = useState(pages - 1);
  const at = Math.min(page, pages - 1);
  const slots = Array.from(
    { length: PER },
    (_, i) => stamps[at * PER + i] ?? null,
  );
  return (
    <div
      className="rounded-2xl p-4"
      data-stamp-book={stamps.length}
      style={{
        background: "linear-gradient(170deg,#efe6d2,#e2d5b8)",
        boxShadow: "inset 0 0 0 1px rgba(80,60,30,0.25)",
      }}
    >
      <div className="grid grid-cols-4 gap-2">
        {slots.map((w, i) =>
          w ? (
            <button
              key={w.id}
              type="button"
              onClick={() => onOpen(w)}
              data-stamp={w.round}
              aria-label={`${roundShort(schedule, w.round)} 4등 별 도장`}
              className="flex flex-col items-center gap-0.5"
            >
              <Stamp win={w} />
              <span className="font-mono text-[10px] text-[#6b5434] tabular-nums">
                {SHORT_DATE.format(new Date(w.at * 1000))}
              </span>
            </button>
          ) : (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: 빈 칸은 자리 번호뿐이다
              key={`empty-${i}`}
              aria-hidden="true"
              className="mx-auto mb-4 aspect-square w-full max-w-16 rounded-full border border-[#b9a57f] border-dashed"
            />
          ),
        )}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4 text-[#6b5434] text-sm">
          <button
            type="button"
            disabled={at === 0}
            onClick={() => setPage(at - 1)}
            aria-label="앞 장"
            className="px-2 disabled:opacity-30"
          >
            ←
          </button>
          <span className="tabular-nums">
            {at + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={at === pages - 1}
            onClick={() => setPage(at + 1)}
            aria-label="다음 장"
            className="px-2 disabled:opacity-30"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

/** 별 도장 하나: 붉은 인주로 찍은 원 안에, 그 회차에 맞은 내 별 4개를 이은 작은 별자리(도장마다 모양이 다르다) */
function Stamp({ win, size = 64 }: { win: WinEntry; size?: number }) {
  const pts = win.hits.map((n) => ({ n, s: starOf(n) }));
  const xs = pts.map((p) => p.s.x);
  const ys = pts.map((p) => p.s.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 0.05);
  const place = (n: number) => {
    const s = starOf(n);
    const cx = (Math.max(...xs) + minX) / 2;
    const cy = (Math.max(...ys) + minY) / 2;
    return [50 + ((s.x - cx) / span) * 52, 50 + ((s.y - cy) / span) * 52];
  };
  const { edges } = constellationOf(win.hits);
  const ink = "#b3282d";
  // 도장마다 조금씩 기울여 손으로 찍은 느낌
  const tilt = ((win.round * 37) % 21) - 10;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ transform: `rotate(${tilt}deg)`, opacity: 0.88 }}
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke={ink} strokeWidth="4" />
      <circle
        cx="50"
        cy="50"
        r="39"
        fill="none"
        stroke={ink}
        strokeWidth="1.2"
      />
      {edges.map(([a, b]) => {
        const [x1, y1] = place(a);
        const [x2, y2] = place(b);
        return (
          <line
            key={`${a}-${b}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={ink}
            strokeWidth="2"
          />
        );
      })}
      {pts.map((p) => {
        const [x, y] = place(p.n);
        return <circle key={p.n} cx={x} cy={y} r="4.5" fill={ink} />;
      })}
    </svg>
  );
}

/** 펼친 별 도장 */
function StampSheet({ win, schedule }: { win: WinEntry; schedule: Schedule }) {
  return (
    <div
      className="sd-id-drop flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-[#3b2c18]"
      style={
        {
          background: "linear-gradient(170deg,#efe6d2,#e2d5b8)",
          "--fx-ms": `${FX.issueDrop}ms`,
        } as CSSProperties
      }
    >
      <Stamp win={win} size={160} />
      <p className="font-semibold">
        {roundShort(schedule, win.round)} 4등 · {dateOf(win.at)}
      </p>
      <p className="break-keep text-center text-sm">
        맞은 별: {win.hits.map((n) => starOf(n).ko).join(", ")}
      </p>
    </div>
  );
}

/** 종이(장·증·서·상)와 판(패) 서류 */
function AwardDocument({
  award,
  schedule,
  recipient,
}: {
  award: EarnedAward;
  schedule: Schedule;
  recipient: string | null;
}) {
  const plaque = award.form === "plaque";
  const c = GRADE_COLOR[award.grade];
  const paper = (
    <div
      data-award-document={award.id}
      className="relative flex flex-col items-center gap-4 px-6 py-8 text-center text-[#2d2414]"
      style={{
        background: plaque
          ? "linear-gradient(160deg,#f3e2a6,#d9b85e 55%,#f1dc96)"
          : "linear-gradient(170deg,#fbf6ea,#efe5cf)",
        boxShadow: plaque
          ? "inset 0 0 0 2px rgba(90,60,10,0.45)"
          : `inset 0 0 0 6px #fbf6ea, inset 0 0 0 7px ${c}, inset 0 0 0 10px #fbf6ea, inset 0 0 0 11px ${c}`,
      }}
    >
      <span className="font-black text-3xl tracking-[0.4em]">{award.kind}</span>
      <span className="break-keep font-semibold text-sm">{award.name}</span>
      {recipient && (
        <span className="self-start text-sm">{recipient} 우주인 귀하</span>
      )}
      <p className="break-keep text-left text-[15px] leading-relaxed">
        {award.text}
      </p>
      <span className="text-sm">
        {award.round !== null ? `${roundTitle(schedule, award.round)} · ` : ""}
        {dateOf(award.at)}
      </span>
      <span className="relative mt-2 flex items-center gap-2 font-bold">
        카노푸스 우주국장
        <Seal className="size-14" />
      </span>
    </div>
  );
  return (
    <div
      className="sd-id-drop w-full max-w-md"
      style={{ "--fx-ms": `${FX.issueDrop}ms` } as CSSProperties}
    >
      {plaque ? (
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(135deg,#6b4429,#3b2414 60%,#5a3720)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          {paper}
        </div>
      ) : (
        <div style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.4)" }}>{paper}</div>
      )}
    </div>
  );
}

/** 당첨증(1~3등): 회차·등수·내 별·당첨 번호·일련번호·검증 QR. 정품인지는 QR로 공개 장부에서 본다 */
function Certificate({
  win,
  schedule,
  recipient,
  specimen = false,
}: {
  win: WinEntry;
  schedule: Schedule;
  recipient: string | null;
  specimen?: boolean;
}) {
  const origin =
    typeof window === "undefined" ? "https://game.byb.kr" : location.origin;
  return (
    <div
      className="sd-id-drop w-full max-w-md"
      style={{ "--fx-ms": `${FX.issueDrop}ms` } as CSSProperties}
    >
      <div
        data-certificate={win.round}
        className="relative flex flex-col items-center gap-4 px-6 py-8 text-center text-[#2d2414]"
        style={{
          background: "linear-gradient(170deg,#fbf6ea,#efe5cf)",
          boxShadow:
            "inset 0 0 0 6px #fbf6ea, inset 0 0 0 7px #c8a24a, 0 18px 40px rgba(0,0,0,0.4)",
        }}
      >
        <span className="font-black text-3xl tracking-[0.4em]">당첨증</span>
        <span className="font-bold text-lg">
          {roundShort(schedule, win.round)} {RANK_LABEL[win.rank]}
        </span>
        {recipient && (
          <span className="self-start text-sm">{recipient} 우주인 귀하</span>
        )}
        <div className="flex flex-col items-center gap-3">
          <span className="text-xs">내 별</span>
          <span className="flex gap-1">
            {win.ticket.numbers.map((n) => (
              <LottoBall key={n} n={n} size="sm" ring={win.hits.includes(n)} />
            ))}
          </span>
          <span className="mt-2 text-xs">당첨 번호</span>
          <span className="flex items-center gap-1">
            {win.record.numbers.map((n) => (
              <LottoBall key={n} n={n} size="sm" />
            ))}
            <span className="px-0.5">+</span>
            <LottoBall n={win.record.bonus} size="sm" />
          </span>
        </div>
        <span className="font-mono text-xs">일련번호 {shortId(win.id)}</span>
        <div className="flex items-end gap-4">
          {specimen ? (
            <span
              data-certificate-specimen
              className="grid size-24 place-items-center rounded-xl border-2 border-[#b3282d] border-dashed font-black text-[#b3282d] text-xl tracking-[0.3em]"
            >
              견본
            </span>
          ) : (
            <span data-certificate-url={ticketUrl(origin, win.ticket)}>
              <InviteQr
                url={ticketUrl(origin, win.ticket)}
                size={96}
                label="공개 장부에서 이 응모권 확인하기"
              />
            </span>
          )}
          <span className="flex flex-col items-start gap-1 text-left text-xs">
            <span>{dateOf(win.at)}</span>
            <span className="flex items-center gap-2 font-bold text-sm">
              카노푸스 우주국장
              <Seal
                text="당첨"
                label="카노푸스 우주국 당첨 직인"
                className="size-12"
              />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 훈장(카노푸스 별 훈장): 1등 금장·2등 은장. 기울이면(끌거나 마우스를 올리면) 빛이 돈다.
 * HDR 화면이면 흰색보다 밝은 반짝임(hdr-glow)을 겹친다. 움직임 줄이기면 멈춘 그림
 */
/** 훈장: 3D(실물 같은 금속·법랑·리본), WebGL이 없으면 평면 그림 */
export function Medal({
  award,
  size = 160,
  live = true,
}: {
  award: EarnedAward;
  size?: number;
  /** false면 한 번 그린 정지 그림(목록의 작은 훈장, WebGL 화면 수를 늘리지 않는다) */
  live?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="img" aria-label={award.name} data-medal={award.id}>
      <Medal3D
        kind={award.id === "medal-gold" ? "gold" : "silver"}
        width={size}
        still={reduce}
        snapshot={!live}
        fallback={<MedalFlat award={award} size={size} />}
      />
    </div>
  );
}

function MedalFlat({
  award,
  size = 160,
}: {
  award: EarnedAward;
  size?: number;
}) {
  const gold = award.id === "medal-gold";
  const reduce = useReducedMotion();
  const hdr = useHdrScreen();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const metal = gold
    ? ["#fff3c2", "#e6b84a", "#a8741d", "#f7d77a"]
    : ["#ffffff", "#cfd6e2", "#8f99aa", "#e9edf4"];
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({
      x: ((e.clientY - r.top) / r.height - 0.5) * -24,
      y: ((e.clientX - r.left) / r.width - 0.5) * 24,
    });
  };
  return (
    <div
      aria-hidden="true"
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      className="relative flex flex-col items-center"
      style={{ width: size, perspective: 600 }}
    >
      {/* 리본 */}
      <svg
        viewBox="0 0 100 60"
        width={size * 0.62}
        aria-hidden="true"
        className="-mb-3"
      >
        <path d="M18 0h28l10 60H30z" fill={gold ? "#16224a" : "#27304a"} />
        <path d="M54 0h28L70 60H44z" fill={gold ? "#16224a" : "#27304a"} />
        <path d="M41 0h18l-3 60h-12z" fill={gold ? "#e6b84a" : "#cfd6e2"} />
      </svg>
      <div
        className="relative grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 300ms cubic-bezier(0.32,0.72,0,1)",
          background: `conic-gradient(from ${tilt.y * 6}deg, ${metal[0]}, ${metal[1]}, ${metal[2]}, ${metal[3]}, ${metal[0]})`,
          boxShadow: `0 12px 30px rgba(0,0,0,0.45), inset 0 0 0 ${size * 0.04}px ${metal[2]}`,
        }}
      >
        {/* 빛이 도는 결 */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at ${50 + tilt.y * 2}% ${50 - tilt.x * 2}%, rgba(255,255,255,0.65), transparent 45%)`,
            mixBlendMode: "screen",
          }}
        />
        {/* 카노푸스 별 */}
        <svg
          viewBox="-50 -50 100 100"
          width={size * 0.55}
          aria-hidden="true"
          className="relative"
        >
          <path
            d="M0-44 9-9 44 0 9 9 0 44-9 9-44 0-9-9z"
            fill={metal[2]}
            stroke={metal[0]}
            strokeWidth="2"
          />
          <circle r="7" fill={metal[0]} />
        </svg>
        {hdr && (
          // biome-ignore lint/performance/noImgElement: 정적 내보내기라 HDR AVIF를 그대로 겹친다
          <img
            src={HDR_GLOW_SRC}
            alt=""
            aria-hidden="true"
            className="sd-hdr sd-hdr-hit pointer-events-none absolute"
            style={{ width: size * 0.8, height: size * 0.8 }}
          />
        )}
      </div>
    </div>
  );
}

/** 펼친 훈장: 훈장과 훈장증 본문 */
function MedalSheet({
  award,
  schedule,
}: {
  award: EarnedAward;
  schedule: Schedule;
}) {
  return (
    <div
      className="sd-id-drop flex w-full max-w-md flex-col items-center gap-5"
      style={{ "--fx-ms": `${FX.issueDrop}ms` } as CSSProperties}
    >
      <Medal award={award} size={200} />
      <p className="font-bold text-amber-100 text-xl">{award.name}</p>
      <p className="break-keep text-center text-white/85 leading-relaxed">
        {award.text}
      </p>
      <p className="text-sm text-white/60">
        {award.round !== null ? `${roundTitle(schedule, award.round)} · ` : ""}
        {dateOf(award.at)}
      </p>
    </div>
  );
}

/**
 * 처음 받은 기념 서류·당첨증을 건네받는 연출(docs/36 11-21 "물건 건네받기"): 위에서 내려와 내 앞에 자리 잡고,
 * 「받기」를 누르면 아래(내 보관함)로 내려간다. 우주국의 말은 위, 내 행동은 아래
 */
export function RecordHandover({
  award,
  win,
  count,
  schedule,
  recipient,
  onDone,
}: {
  award: EarnedAward | null;
  win: WinEntry | null;
  /** 새로 받은 것의 수 */
  count: number;
  schedule: Schedule;
  recipient: string | null;
  onDone: () => void;
}) {
  const [pocket, setPocket] = useState(false);
  const item = award ? (
    award.form === "medal" ? (
      <MedalSheet award={award} schedule={schedule} />
    ) : (
      <AwardDocument award={award} schedule={schedule} recipient={recipient} />
    )
  ) : win ? (
    <Certificate win={win} schedule={schedule} recipient={recipient} />
  ) : null;
  return (
    <StageOverlay label="기념 서류 받기" scroll>
      <p
        role="status"
        data-record-handover={count}
        className={cn(
          "sd-after break-keep pt-2 text-center font-bold text-amber-100 text-xl transition-opacity duration-500",
          pocket && "opacity-0",
        )}
        style={
          { "--fx-delay": `${FX.issueDrop + FX.pause}ms` } as CSSProperties
        }
      >
        {count > 1
          ? `기념 서류 ${count}개가 도착했습니다.`
          : "기념 서류가 도착했습니다."}
      </p>
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center",
          pocket && "sd-id-pocket",
        )}
        style={
          {
            "--fx-ms": `${FX.issuePocket}ms`,
          } as CSSProperties
        }
        onAnimationEnd={(e) => {
          if (pocket && e.target === e.currentTarget) onDone();
        }}
      >
        {item}
      </div>
      <div
        className={cn(
          "sd-after sticky bottom-0 flex flex-col bg-gradient-to-t from-[#070b16] via-[#070b16]/90 to-transparent pt-6 pb-1 transition-opacity duration-500",
          pocket && "opacity-0",
        )}
        style={
          { "--fx-delay": `${FX.issueDrop + FX.pause}ms` } as CSSProperties
        }
      >
        <button
          type="button"
          disabled={pocket}
          onClick={() => setPocket(true)}
          className="sd-cta rounded-2xl py-3.5 font-bold text-lg text-slate-950"
        >
          받기
        </button>
      </div>
    </StageOverlay>
  );
}

/** 처음 받은 기념 서류가 있으면 화면 위쪽에 띄우는 띠(추첨 끝 알림 띠와 같은 결) */
export function RecordNotice({
  count,
  onOpen,
  onClose,
}: {
  count: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      role="status"
      data-record-notice={count}
      className="sd-rise flex items-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-200/10 py-2 pr-2 pl-4"
    >
      <span className="min-w-0 flex-1 break-keep font-semibold text-amber-50 text-sm">
        새 기념 서류가 도착했습니다.
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 font-bold text-slate-950 text-sm hover:bg-amber-100"
      >
        보러 가기
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-amber-100/70 hover:bg-white/10 hover:text-amber-50"
      >
        ✕
      </button>
    </div>
  );
}
