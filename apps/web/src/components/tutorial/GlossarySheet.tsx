"use client";

import { GLOSSARY, TERM_GROUPS } from "@/tutorial/glossary";

import { SuitText } from "../SuitText";
import { TermAside } from "../TermHint";

/** 게임 중에도 볼 수 있는 용어 사전 */
export function GlossarySheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center bg-black/50 p-4"
      onPointerDown={onClose}
    >
      <div
        role="dialog"
        aria-label="용어 사전"
        className="pop-in flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-3xl border border-white/15 bg-felt-dark/95 p-5 shadow-2xl backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">용어 사전</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm"
          >
            닫기
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto pr-1 text-sm">
          {TERM_GROUPS.map((g) => (
            <section key={g.id} className="flex flex-col gap-2.5">
              <h3 className="font-semibold text-xs opacity-60">{g.name}</h3>
              <dl className="flex flex-col gap-2.5">
                {GLOSSARY.filter((t) => t.group === g.id).map((t) => (
                  <div key={t.id}>
                    <dt className="font-bold text-amber-200">{t.term}</dt>
                    <dd className="leading-relaxed opacity-85">
                      <SuitText text={t.meaning} />
                      <TermAside term={t} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
