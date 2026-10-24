"use client";

import { useEffect, useState } from "react";

import { CUE_LABELS, type Cue, play, renderCue } from "@/game/sound";

/** 원작에서 그 소리가 나던 때. 소리를 들어 보며 다듬을 때 참고한다(docs/16) */
const GROUPS: { title: string; cues: { cue: Cue; when: string }[] }[] = [
  {
    title: "카드 내기",
    cues: [
      { cue: "card", when: "평범한 카드" },
      { cue: "mighty", when: "마이티" },
      { cue: "joker", when: "힘 있는 조커" },
      { cue: "jokerCall", when: "선이 조커콜을 부름" },
      { cue: "deadJoker", when: "조커콜에 걸리거나 힘을 잃은 조커" },
      { cue: "gan", when: "선 무늬가 없어 기루다로 자름" },
    ],
  },
  {
    title: "선거",
    cues: [
      { cue: "bid", when: "누군가 공약을 냄" },
      { cue: "pass", when: "출마 포기, 죽이기 헛다리" },
      { cue: "dealMiss", when: "딜미스, 모두 포기" },
      { cue: "announce", when: "주공 당선, 공약·프렌드 확정" },
      { cue: "kill", when: "6·7마 죽이기" },
      { cue: "pickCard", when: "키티 받기(장마다), 버릴 카드 고르기" },
      { cue: "cardSet", when: "내가 버릴 카드를 확정" },
    ],
  },
  {
    title: "판 흐름",
    cues: [
      { cue: "shuffle", when: "섞기(두 번)" },
      { cue: "gameStart", when: "다 나눠 주고 판 시작" },
      { cue: "friend", when: "프렌드가 드러남" },
      { cue: "scored", when: "야당이 점수 카드를 가져감(장마다)" },
      { cue: "win", when: "내 편이 이김" },
      { cue: "lose", when: "내 편이 짐" },
    ],
  },
  {
    title: "화면",
    cues: [
      { cue: "click", when: "시작 화면 메뉴" },
      { cue: "beep", when: "공약·프렌드 창에서 고르기" },
      { cue: "invalid", when: "낼 수 없는 카드" },
    ],
  },
  {
    title: "하트",
    cues: [
      { cue: "queenOfSpades", when: "스페이드 Q" },
      { cue: "heartsBroken", when: "하트가 처음 깨짐" },
    ],
  },
];

interface Level {
  /** 가장 큰 순간(dBFS) */
  peak: number;
  /** 소리가 들리는 길이(초) */
  length: number;
}

function measure(buffer: AudioBuffer): Level {
  let peak = 0;
  let last = 0;
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const x = Math.abs(data[i] ?? 0);
    if (x > peak) peak = x;
    if (x > 0.003) last = i;
  }
  return {
    peak: peak > 0 ? 20 * Math.log10(peak) : -120,
    length: last / buffer.sampleRate,
  };
}

/** 효과음 미리 듣기(/sounds). 모든 소리를 하나씩 들어 보고 크기를 비교한다 */
export function SoundBoard() {
  const [levels, setLevels] = useState<Partial<Record<Cue, Level>>>({});

  useEffect(() => {
    let alive = true;
    const cues = GROUPS.flatMap((g) => g.cues.map((c) => c.cue));
    void (async () => {
      for (const cue of cues) {
        const level = measure(await renderCue(cue));
        if (!alive) return;
        setLevels((prev) => ({ ...prev, [cue]: level }));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="min-h-dvh bg-[#0a3622] p-4 text-white">
      <h1 className="mb-1 font-bold text-lg">효과음</h1>
      <p className="mb-4 text-sm text-white/70">
        누르면 그 소리가 납니다. 숫자는 가장 큰 순간의 크기와 들리는 길이입니다.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 font-semibold text-amber-200">{group.title}</h2>
            <ul className="space-y-2">
              {group.cues.map(({ cue, when }) => {
                const level = levels[cue];
                return (
                  <li key={cue}>
                    <button
                      type="button"
                      data-cue={cue}
                      onClick={() => play(cue)}
                      className="flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="flex-1">
                        <span className="block font-medium">
                          {CUE_LABELS[cue]}
                        </span>
                        <span className="block text-white/60 text-xs">
                          {when}
                        </span>
                      </span>
                      <span
                        className="text-right font-mono text-white/60 text-xs tabular-nums"
                        data-level={cue}
                      >
                        {level
                          ? `${level.peak.toFixed(1)} dB · ${level.length.toFixed(2)}초`
                          : "…"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
