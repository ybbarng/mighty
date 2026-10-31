"use client";

import type { EarnedAward } from "@/stardraw/awards";
import { Medal } from "@/stardraw/components/MyRecords";

/**
 * 기념 서류·훈장 견본(로컬 전용). 운영·CI 빌드에는 페이지로 잡히지 않는다(next.config pageExtensions,
 * stardraw/awards.ts AWARD_SPECIMENS). 받기 전에는 무엇이 있는지 모르게 하려는 것이다(docs/36 11-19)
 */

const medal = (gold: boolean): EarnedAward => ({
  id: gold ? "medal-gold" : "medal-silver",
  step: null,
  name: gold ? "카노푸스 별 훈장 금장" : "카노푸스 별 훈장 은장",
  kind: "훈장",
  form: "medal",
  grade: gold ? "star" : "gold",
  category: "결과",
  round: 1,
  at: 0,
  text: "",
});

export default function AwardSpecimens() {
  return (
    <main
      data-award-specimen
      className="sd-night flex min-h-dvh flex-col items-center gap-10 px-4 py-10 text-white"
    >
      <h1 className="font-bold text-xl">훈장 견본(로컬 전용)</h1>
      <section className="flex flex-wrap items-end justify-center gap-10">
        {[true, false].map((gold) => (
          <figure
            key={String(gold)}
            className="flex flex-col items-center gap-3"
          >
            <Medal award={medal(gold)} size={300} />
            <figcaption className="text-white/70">
              {medal(gold).name}
            </figcaption>
          </figure>
        ))}
      </section>
      <section className="flex flex-wrap items-end justify-center gap-6">
        {[true, false].map((gold) => (
          <Medal key={String(gold)} award={medal(gold)} size={120} />
        ))}
      </section>
    </main>
  );
}
