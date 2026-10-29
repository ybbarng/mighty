"use client";

import { useEffect, useState } from "react";

import { dealCues } from "@/game/cues";
import { CUE_LABELS, type Cue, play, renderCue } from "@/game/sound";
import { SHUFFLE_MS } from "@/game/timing";

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
      { cue: "shuffle", when: "덱이 갈라졌다 합쳐질 때(두 번)" },
      { cue: "deal", when: "나눠 줄 때 묶음마다(원작에는 없음)" },
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
      { cue: "penalty", when: "내가 벌점 카드(하트·♠Q)를 가져감" },
      { cue: "scored", when: "내가 점수를 깎는 카드(◆J)를 가져감" },
      { cue: "roundEnd", when: "한 판이 끝나 점수표가 뜸" },
      { cue: "mighty", when: "내가 문을 먹음(남이 먹으면 ♠Q 소리)" },
    ],
  },
  {
    title: "오목",
    cues: [
      { cue: "stone", when: "돌을 놓음(나·상대 모두)" },
      { cue: "invalid", when: "금지 수(3·3 등)를 두려 함" },
      { cue: "win", when: "다섯을 이음, 상대 기권" },
      { cue: "lose", when: "상대가 다섯을 이음, 내가 기권" },
      { cue: "roundEnd", when: "비김" },
    ],
  },
  {
    title: "장기",
    cues: [
      { cue: "piece", when: "기물을 옮김(나·상대 모두)" },
      { cue: "capture", when: "기물을 잡음" },
      { cue: "check", when: "장군(누가 부르든)" },
      { cue: "invalid", when: "둘 수 없는 수를 두려 함" },
      { cue: "win", when: "외통·상대 기권·점수로 이김" },
      { cue: "lose", when: "외통당함·내가 기권·점수로 짐" },
    ],
  },
  {
    title: "체스",
    cues: [
      { cue: "piece", when: "기물을 옮김(나·상대 모두)" },
      { cue: "capture", when: "기물을 잡음" },
      { cue: "check", when: "체크" },
      { cue: "announce", when: "상대가 무승부를 제안함" },
      { cue: "win", when: "체크메이트·상대 기권·상대 시간 끝" },
      { cue: "lose", when: "체크메이트당함·기권·시간패" },
      { cue: "roundEnd", when: "비김(스테일메이트·합의 등)" },
    ],
  },
  {
    title: "바둑",
    cues: [
      { cue: "stone", when: "돌을 놓음(나·상대 모두)" },
      { cue: "capture", when: "돌을 따냄" },
      { cue: "win", when: "세어서 이김·상대 기권" },
      { cue: "lose", when: "세어서 짐·기권" },
    ],
  },
  {
    title: "화투(고스톱·민화투·나이롱뽕)",
    cues: [
      { cue: "hwatuSlap", when: "패를 내 바닥에 침" },
      { cue: "hwatuFlip", when: "더미에서 한 장 뒤집음·가져옴" },
      { cue: "yak", when: "약이 남(초약·홍단 등), 고스톱 점수가 남" },
      { cue: "go", when: "고스톱: 고를 부름" },
      { cue: "ppong", when: "나이롱뽕: 뽕을 부름" },
    ],
  },
  {
    title: "숫자야구",
    cues: [
      { cue: "strike", when: "스트라이크가 하나라도 나온 답(나·상대 모두)" },
      { cue: "ball", when: "볼만 나온 답" },
      { cue: "homerun", when: "다 맞힌 답(홈런). 이어서 승리·패배 소리" },
      { cue: "pass", when: "아웃(하나도 없음)" },
      { cue: "click", when: "숫자 패드 누르기" },
      { cue: "invalid", when: "물을 수 없는 수(이미 물음 등)" },
      { cue: "win", when: "먼저 맞힘·상대 거짓 답이 드러남" },
      { cue: "lose", when: "상대가 먼저 맞힘·기권" },
      { cue: "roundEnd", when: "비김" },
    ],
  },
];

interface Level {
  /** 가장 큰 순간(dBFS) */
  peak: number;
  /** 귀에 크게 느껴지는 정도: 0.15초 구간 평균 크기의 가장 큰 값(dBFS) */
  loudness: number;
  /** 소리가 들리는 길이(초) */
  length: number;
}

/** 귀는 0.1~0.2초쯤을 뭉뚱그려 크기를 느낀다. 그 길이 구간의 평균 크기로 비교한다 */
const WINDOW_S = 0.15;

function measure(buffer: AudioBuffer): Level {
  let peak = 0;
  let last = 0;
  const data = buffer.getChannelData(0);
  const squares = new Float64Array(data.length + 1);
  for (let i = 0; i < data.length; i++) {
    const x = data[i] ?? 0;
    const a = Math.abs(x);
    if (a > peak) peak = a;
    if (a > 0.003) last = i;
    squares[i + 1] = (squares[i] ?? 0) + x * x;
  }
  const win = Math.floor(buffer.sampleRate * WINDOW_S);
  let loudest = 0;
  for (let i = 0; i + win <= data.length; i += 256) {
    const mean = ((squares[i + win] ?? 0) - (squares[i] ?? 0)) / win;
    if (mean > loudest) loudest = mean;
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
  return {
    peak: db(peak),
    loudness: db(Math.sqrt(loudest)),
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
        누르면 그 소리가 납니다. 숫자는 귀에 느껴지는 크기, 가장 큰 순간의 크기,
        들리는 길이입니다.
      </p>
      <button
        type="button"
        data-play-deal
        onClick={() => {
          // 표준 5마 판 시작: 섞고, 나눠 주고, 판 시작 소리까지 실제 연출 시간대로
          const calls = dealCues(10, 5, {
            startDelay: 0,
            shuffleMs: SHUFFLE_MS,
          });
          for (const { cue, delay, times } of calls)
            play(cue, { delay: delay ?? 0, times: times ?? 1 });
        }}
        className="mb-6 rounded-lg border border-amber-300/60 bg-amber-400/15 px-4 py-2 text-sm hover:bg-amber-400/25"
      >
        섞고 나눠 주기 전체 듣기
      </button>
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
                        data-loudness={level?.loudness}
                        data-peak={level?.peak}
                      >
                        {level
                          ? `${level.loudness.toFixed(1)} dB · 최대 ${level.peak.toFixed(1)} · ${level.length.toFixed(2)}초`
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
