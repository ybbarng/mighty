"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { astronautOf } from "../astronaut/identity";
import { GAME_NS, type Services } from "../services";
import type { KeyInfo } from "../wallet";

/** 탭바가 가리키는 앱 안 화면 */
export type NavTarget = "home" | "mine" | "rounds" | "stats" | "records";

/** 마우스로 쓰는 넓은 화면(PC): 탭바 대신 위쪽 메뉴 줄. 휴대폰 가로처럼 넓어도 손가락으로 쓰면 탭바 */
export const WIDE_QUERY =
  "(min-width: 768px) and (hover: hover) and (pointer: fine)";

/** 넓은 화면인지(첫 그리기 뒤에 읽고, 창 크기가 바뀌면 따른다) */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = matchMedia(WIDE_QUERY);
    setWide(m.matches);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/** 탭 그림 */
const ICONS = {
  home: (
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
  ),
  mine: (
    <>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 8.5h6M9 12h6" />
    </>
  ),
  rounds: (
    <path d="M12 3.5 14.4 9l5.8.5-4.4 3.8 1.3 5.7L12 16l-5.1 3 1.3-5.7L3.8 9.5 9.6 9z" />
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
} as const;

/** 탭 항목(휴대폰 탭바와 PC 메뉴 줄이 같이 쓴다) */
const TABS: [NavTarget, string][] = [
  ["home", "홈"],
  ["mine", "내 응모"],
  ["rounds", "지난 회차"],
];

/** 다른 페이지(새로 불러오는 링크) */
const PAGES: [string, string][] = [
  ["설명", "/stardraw/about"],
  ["배우기", "/stardraw/learn"],
  ["검증", "/stardraw/verify"],
  ["소속", "/stardraw/qualify"],
  ["데모", "/stardraw/demo"],
];

/** 탭바 「더 보기」 목록: 내 등록증(이름·번호), 관측 기록, 다른 페이지 */
function MoreList({
  services,
  keyInfo,
  onGo,
}: {
  services: Services;
  keyInfo: KeyInfo | null;
  onGo: (t: NavTarget) => void;
}) {
  const a = keyInfo ? astronautOf(keyInfo.pub) : null;
  const row =
    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/10";
  return (
    <div className="flex flex-col gap-1">
      {a && (
        <a
          href={services.ns === GAME_NS ? "/stardraw/id" : undefined}
          data-my-name
          className="mb-1 flex flex-col rounded-xl bg-white/5 px-3 py-2.5 hover:bg-white/10"
        >
          <span className="font-semibold">{a.name} 우주인</span>
          <span className="font-mono text-white/55 text-xs tabular-nums">
            {a.number}
          </span>
        </a>
      )}
      <button type="button" className={row} onClick={() => onGo("records")}>
        내 기록
      </button>
      <button type="button" className={row} onClick={() => onGo("stats")}>
        관측 기록
      </button>
      <div className="my-1 border-white/10 border-t" />
      {PAGES.map(([label, href]) => (
        <a key={href} href={href} className={cn(row, "text-white/75")}>
          {label}
        </a>
      ))}
    </div>
  );
}

/**
 * 별 따기 메뉴: 홈·내 응모·지난 회차·더 보기. 휴대폰은 하단 탭바(더 보기는 아래에서 올라오는 목록),
 * 마우스로 쓰는 넓은 화면은 위쪽 메뉴 줄(더 보기는 아래로 펼치는 목록, 2026-10-31 사용자). 같은 항목·같은 강조를 쓴다
 */
export function TabBar(props: {
  services: Services;
  keyInfo: KeyInfo | null;
  active: NavTarget | null;
  onGo: (t: NavTarget) => void;
}) {
  return useWideScreen() ? <TopBar {...props} /> : <BottomBar {...props} />;
}

/** PC 위쪽 메뉴 줄: 왼쪽 이름(누르면 홈), 오른쪽 탭과 더 보기. 더 보기는 바깥을 누르거나 Esc로 닫힌다 */
function TopBar({
  services,
  keyInfo,
  active,
  onGo,
}: {
  services: Services;
  keyInfo: KeyInfo | null;
  active: NavTarget | null;
  onGo: (t: NavTarget) => void;
}) {
  const [more, setMore] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!more) return;
    // 펼치면 첫 항목으로 초점을 옮긴다
    box.current?.querySelector<HTMLElement>("a, button")?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !opener.current?.contains(t))
        setMore(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMore(false);
      opener.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [more]);
  const item = (t: NavTarget, label: string) => {
    const on = active === t && !more;
    return (
      <button
        key={t}
        type="button"
        data-tab={t}
        aria-current={on ? "page" : undefined}
        onClick={() => {
          setMore(false);
          onGo(t);
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
          on
            ? "bg-white/10 text-amber-100"
            : "text-white/65 hover:bg-white/5 hover:text-white",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[t as keyof typeof ICONS]}
        </svg>
        {label}
      </button>
    );
  };
  return (
    <nav
      aria-label="별 따기 메뉴"
      className="fixed inset-x-0 top-0 z-50 border-white/10 border-b bg-[#0a0f1c]/85 backdrop-blur-md"
    >
      <div className="sd-wide mx-auto flex max-w-xl items-center justify-between gap-4 px-4 py-2.5">
        <button
          type="button"
          onClick={() => onGo("home")}
          className="font-black text-amber-50 tracking-tight hover:text-amber-100"
        >
          하늘의 별 따기
        </button>
        <div className="relative flex items-center gap-1">
          {TABS.map(([t, label]) => item(t, label))}
          <button
            ref={opener}
            type="button"
            data-tab="more"
            aria-expanded={more}
            aria-haspopup="true"
            onClick={() => setMore((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              more
                ? "bg-white/10 text-amber-100"
                : "text-white/65 hover:bg-white/5 hover:text-white",
            )}
          >
            더 보기
            <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3">
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {more && (
            <div
              ref={box}
              className="absolute top-full right-0 mt-2 border border-white/10 bg-[#111a2c] max-h-[calc(100dvh-80px)] w-64 overflow-y-auto rounded-2xl p-2 shadow-2xl"
            >
              <MoreList
                services={services}
                keyInfo={keyInfo}
                onGo={(t) => {
                  setMore(false);
                  onGo(t);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

/** 휴대폰 하단 탭바 */
function BottomBar({
  services,
  keyInfo,
  active,
  onGo,
}: {
  services: Services;
  keyInfo: KeyInfo | null;
  active: NavTarget | null;
  onGo: (t: NavTarget) => void;
}) {
  const [more, setMore] = useState(false);
  const tab = (
    t: NavTarget | "more",
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
  ) => {
    const on = t === "more" ? more : active === t && !more;
    return (
      <button
        key={t}
        type="button"
        onClick={onClick}
        aria-current={on ? "page" : undefined}
        data-tab={t}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
          on ? "text-amber-100" : "text-white/55 hover:text-white/80",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
        {label}
      </button>
    );
  };
  return (
    <>
      {more && (
        <>
          <button
            type="button"
            aria-label="더 보기 닫기"
            onClick={() => setMore(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            role="dialog"
            aria-label="더 보기"
            className="fixed inset-x-0 z-40 mx-auto border border-white/10 bg-[#111a2c] max-h-[calc(100dvh-80px)] max-w-xl overflow-y-auto rounded-t-3xl px-3 pt-3"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
              paddingLeft: "max(12px, env(safe-area-inset-left, 0px))",
              paddingRight: "max(12px, env(safe-area-inset-right, 0px))",
              paddingBottom: 12,
            }}
          >
            <MoreList
              services={services}
              keyInfo={keyInfo}
              onGo={(t) => {
                setMore(false);
                onGo(t);
              }}
            />
          </div>
        </>
      )}
      <nav
        aria-label="별 따기 메뉴"
        className="fixed inset-x-0 bottom-0 z-50 border-white/10 border-t bg-[#0a0f1c]/90 backdrop-blur-md"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.map(([t, label]) =>
            tab(t, label, ICONS[t as keyof typeof ICONS], () => {
              setMore(false);
              onGo(t);
            }),
          )}
          {tab("more", "더 보기", ICONS.more, () => setMore((v) => !v))}
        </div>
      </nav>
    </>
  );
}
