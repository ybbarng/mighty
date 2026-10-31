"use client";

import { realClock } from "@mighty/fair-play";
import { fromBase64Url, roundTimes } from "@mighty/stardraw-core";
import { useEffect, useState } from "react";

import { AstronautCard } from "../astronaut/AstronautCard";
import { astronautOf } from "../astronaut/identity";
import type { DirectorState } from "../local-ledger";
import { dateOf } from "./AstronautPanel";

/** 서버 주소(관리 화면과 같다): 빌드의 NEXT_PUBLIC_STARDRAW_API, 없으면 같은 출처 /stardraw-api */
const API = process.env.NEXT_PUBLIC_STARDRAW_API || "/stardraw-api";

interface Current {
  pub: Uint8Array;
  fingerprint: string;
  issued: string;
}

interface Pending {
  fingerprint: string;
  effectiveRound: number;
}

/**
 * 우주국 소개의 "지금 국장 열쇠": 공개 장부의 국장 열쇠 내력에서 지금 효력이 있는 열쇠를 골라 지문과 그 열쇠로 그린
 * 등록증을 보인다(국장 응모용 우주인 등록증이 아니다 — 국장 열쇠는 우주인으로 응모할 수 없어 응모가 드러나지 않는다).
 * 예고 중인 지정이 있으면 함께 적는다. 장부를 못 읽으면 아무것도 그리지 않는다
 */
export function BureauDirector() {
  const [state, setState] = useState<{
    current: Current | null;
    pending: Pending[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`${API}/api/director/state`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const d = (await res.json()) as DirectorState;
        const next = d.view.next.round;
        const live = d.view.directors.filter(
          (k) => k.from <= next && (k.until === null || k.until > next),
        );
        // 여럿이면 가장 늦게 효력을 얻은 열쇠(새 기기)를 보인다
        const top = live.sort((a, b) => b.from - a.from)[0];
        const current = top
          ? {
              pub: fromBase64Url(top.pub),
              fingerprint: top.fingerprint,
              issued: dateOf(roundTimes(d.schedule, top.from).opensAt * 1000),
            }
          : null;
        const pending = d.view.operations
          .filter((o) => o.kind === "director-add" && o.status === "pending")
          .flatMap((o) => {
            const m = /국장-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(
              o.summary,
            );
            return m
              ? [{ fingerprint: m[0], effectiveRound: o.effectiveRound }]
              : [];
          });
        if (alive) setState({ current, pending });
      } catch {
        // 장부를 못 읽으면 이 칸을 그리지 않는다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!state || (!state.current && state.pending.length === 0)) return null;
  return (
    <div data-bureau-director className="flex flex-col gap-3">
      {state.current && (
        <>
          <AstronautCard
            astronaut={astronautOf(state.current.pub)}
            issued={state.current.issued}
            clock={realClock}
            pub={state.current.pub}
            office="카노푸스 우주국장"
          />
          <p className="text-center text-white/70 text-xs">
            지금 국장 열쇠{" "}
            <span className="font-mono text-white" data-director-fingerprint>
              {state.current.fingerprint}
            </span>
          </p>
        </>
      )}
      {state.pending.map((p) => (
        <p key={p.fingerprint} className="text-center text-white/60 text-xs">
          지정 예고 중{" "}
          <span className="font-mono text-white/80">{p.fingerprint}</span> ·{" "}
          {p.effectiveRound}회부터
        </p>
      ))}
      <p className="text-center text-white/55 text-xs">
        <a
          href="/stardraw/verify#check"
          className="underline underline-offset-2 hover:text-white"
        >
          검증 페이지의 국장 열쇠 내력과 맞춰 보기
        </a>
      </p>
    </div>
  );
}
