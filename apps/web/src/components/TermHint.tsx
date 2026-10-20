"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { cn } from "@/lib/cn";
import { termOf } from "@/tutorial/glossary";

const TermContext = createContext<(id: string) => void>(() => {});

/** 게임 화면의 용어를 누르면 뜻을 잠깐 보여 준다(용어 사전과 같은 데이터) */
export function TermProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setId(null), 5000);
    return () => clearTimeout(timer);
  }, [id]);
  const term = id ? termOf(id) : undefined;
  return (
    <TermContext.Provider value={setId}>
      {children}
      {term && (
        <button
          type="button"
          aria-live="polite"
          onClick={() => setId(null)}
          className="pop-in fixed inset-x-0 top-14 z-[500] mx-auto flex w-[min(92%,26rem)] flex-col gap-0.5 rounded-2xl border border-amber-300/50 bg-black/90 px-4 py-2.5 text-left shadow-2xl"
        >
          <span className="font-bold text-amber-200 text-sm">{term.term}</span>
          <span className="text-sm leading-snug">{term.meaning}</span>
        </button>
      )}
    </TermContext.Provider>
  );
}

/** 누르면 뜻이 뜨는 용어. 점선 밑줄로 누를 수 있음을 알린다 */
export function Term({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const open = useContext(TermContext);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(id);
      }}
      className={cn(
        "cursor-help underline decoration-dotted decoration-white/40 underline-offset-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 패널 제목 옆의 작은 "?" */
export function TermQuestion({ id }: { id: string }) {
  const open = useContext(TermContext);
  const term = termOf(id);
  if (!term) return null;
  return (
    <button
      type="button"
      aria-label={`${term.term} 뜻`}
      onClick={() => open(id)}
      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 align-middle font-bold text-[11px] hover:bg-white/25"
    >
      ?
    </button>
  );
}
