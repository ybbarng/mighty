import { GAMES } from "@/games/registry";

import { IconArt } from "./brand/icon-art";
import { MadeWith } from "./brand/MadeWith";

/** 공용 화면: 게임마다가 아니라 사이트 전체에 걸친 것 */
const SHARED_LINKS = [
  {
    href: "/security",
    icon: "🔒",
    title: "어떻게 지켜지나요?",
    detail: "서버 없이, 방장도 남의 패를 모르게 하는 방법",
  },
  {
    href: "/learn",
    icon: "🧩",
    title: "보안 배우기",
    detail: "암호와 공정한 섞기를 직접 해 보며 배우기",
  },
  {
    href: "/profile",
    icon: "📊",
    title: "내 기록",
    detail: "이 기기에 쌓인 판과 승률",
  },
] as const;

/**
 * 첫 화면: 게임 목록과 공용 화면. 게임은 등록부(`games/registry.ts`) 순서대로 보인다.
 * 휴대폰은 한 줄에 하나, 넓은 화면은 두 줄로 놓는다.
 */
export function GameCenterHome() {
  return (
    <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top,#1e293b_0%,#020617_70%)] px-4 py-8 text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="font-black text-3xl tracking-tight">게임</h1>
          <p className="text-sm text-white/70">
            서버 없이 친구와 바로. 혼자라면 컴퓨터와.
          </p>
        </header>

        <section aria-label="게임" className="grid gap-3 sm:grid-cols-2">
          {GAMES.map((game) => (
            <a
              key={game.id}
              href={game.path}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/10"
            >
              <span className="size-16 shrink-0 overflow-hidden rounded-2xl">
                <IconArt game={game.id} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-bold text-lg">
                  {game.name}{" "}
                  <span className="font-normal text-sm text-white/50">
                    {game.englishName}
                  </span>
                </span>
                <span className="break-keep text-sm text-white/70">
                  {game.tagline}
                </span>
                <span className="text-white/50 text-xs">{game.players}</span>
              </span>
            </a>
          ))}
        </section>

        <section aria-label="더 보기" className="grid gap-2 sm:grid-cols-3">
          {SHARED_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 transition hover:bg-white/10 sm:flex-col sm:items-start sm:gap-1"
            >
              <span className="text-xl">{link.icon}</span>
              <span className="flex flex-col">
                <span className="font-semibold text-sm">{link.title}</span>
                <span className="text-white/60 text-xs">{link.detail}</span>
              </span>
            </a>
          ))}
        </section>

        <footer className="text-center text-[11px] text-white/40">
          <MadeWith />
        </footer>
      </div>
    </main>
  );
}
