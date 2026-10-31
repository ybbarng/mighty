"use client";

import { useEffect, useState } from "react";

import { dealCues } from "@/game/cues";
import { CUE_LABELS, type Cue, play, renderCue } from "@/game/sound";
import { SHUFFLE_MS } from "@/game/timing";
import { starOf } from "@/stardraw/sky";

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
  {
    title: "하늘의 별 따기",
    cues: [
      { cue: "starTick", when: "추첨 룰렛 불빛이 별 하나를 지남" },
      { cue: "starBall", when: "룰렛이 당첨 별에서 멈춰 별이 켜짐·응모 접수" },
      { cue: "starWin", when: "내 응모권이 당첨(1~5등)" },
      { cue: "beep", when: "별·번호를 고름" },
    ],
  },
  {
    title: "윷놀이",
    cues: [
      { cue: "yutThrow", when: "던지기를 누름(나·상대 모두)" },
      { cue: "yutLand", when: "윷가락이 떨어져 도·개·걸·빽도가 나옴" },
      { cue: "yutBonus", when: "윷·모가 나와 한 번 더" },
      { cue: "yutPiece", when: "말을 움직임·업음" },
      { cue: "yutCapture", when: "상대 말을 잡음(한 번 더)" },
      { cue: "yutHome", when: "말이 참먹이를 지나 남" },
      { cue: "invalid", when: "쓸 수 없는 결과·말" },
      { cue: "win", when: "내 편이 말을 모두 냄" },
      { cue: "lose", when: "상대 편이 먼저 냄·기권" },
      { cue: "roundEnd", when: "이긴 편 없이 끝남" },
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

/** 추첨 한 회차를 짧게 흉내 낸다: 별마다 룰렛이 몇 칸 돌다 멈추고 별이 켜진다, 끝에 1등 */
function playDrawDemo(): void {
  const order = [7, 23, 1, 38, 15, 42, 9];
  let at = 0;
  order.forEach((n, index) => {
    // 빨리 돌다 느려지는 룰렛 불빛
    for (let k = 0; k < 14; k++) {
      at += 0.05 + k * k * 0.0016;
      play("starTick", { delay: at, star: { n: (n * 3 + k * 5) % 45 } });
    }
    at += 0.25;
    play("starBall", { delay: at, star: { n, index, temp: starOf(n).k } });
    at += 1.1;
  });
  play("starWin", { delay: at + 0.4, star: { rank: 1 } });
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
      <section
        data-star-sounds
        className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/30 bg-sky-200/5 p-3"
      >
        <span className="w-full font-semibold text-sky-100 text-sm">
          하늘의 별 따기
        </span>
        <button
          type="button"
          data-play-draw
          onClick={playDrawDemo}
          className="rounded-lg border border-sky-200/50 bg-sky-200/10 px-3 py-1.5 text-sm hover:bg-sky-200/20"
        >
          추첨 흉내(별 7개 → 1등)
        </button>
        {[1, 2, 3, 4, 5].map((rank) => (
          <button
            key={rank}
            type="button"
            data-play-win={rank}
            onClick={() => play("starWin", { star: { rank } })}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            {rank}등 당첨
          </button>
        ))}
      </section>
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
