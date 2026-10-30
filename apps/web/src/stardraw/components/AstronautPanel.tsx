"use client";

import { equalBytes, roundTimes, toHex } from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { AstronautCard, type Registered } from "../astronaut/AstronautCard";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { checkOwner } from "../astronaut/owner-check";
import { roundShort } from "../round-label";
import type { Services } from "../services";
import { sitePolicy } from "../wallet";

/** 날짜 "2026. 10. 30." */
function dateOf(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** 등록 일자 칸: 장부의 등록 회차(첫 응모 회차)의 날짜. 아직 응모 전이면 pending */
export function useRegistered(services: Services, pub: Uint8Array): Registered {
  const [registered, setRegistered] = useState<Registered>({
    state: "loading",
  });

  useEffect(() => {
    let alive = true;
    void services.ledger
      .registeredRound(pub)
      .then((round) => {
        if (!alive) return;
        const schedule = services.ledger.schedule;
        setRegistered(
          round === null
            ? { state: "pending" }
            : {
                state: "done",
                date: dateOf(roundTimes(schedule, round).closesAt),
                round: roundShort(schedule, round),
              },
        );
      })
      .catch(() => alive && setRegistered({ state: "pending" }));
    return () => {
      alive = false;
    };
  }, [services, pub]);

  return registered;
}

/**
 * 우주인 등록증 한 장과 공개 열쇠, 공유(docs/36 11-9). 등록 직후·내 등록증·데모가 같이 쓴다.
 * 우리 화면은 남의 등록증을 그리지 않는다: 이 기기의 내 등록증만(데모는 가짜 우주인). 그래서 공유도 공개 열쇠 주소 대신
 * 인사 문구와 첫 화면 주소만 보낸다.
 * 등록 일자는 장부의 등록 회차(첫 응모 회차)의 날짜다. 아직 응모 전이면 "첫 응모 때 기록".
 */
export function AstronautPanel({
  services,
  pub,
  greeting,
  children,
}: {
  services: Services;
  pub: Uint8Array;
  /** 카드 위 인사(등록 직후 등) */
  greeting?: ReactNode;
  /** 카드 아래 더 둘 것(예: 별 고르러 가기) */
  children?: ReactNode;
}) {
  const a = useMemo(() => astronautOf(pub), [pub]);
  const registered = useRegistered(services, pub);
  const [copied, setCopied] = useState(false);

  const tickets = services.ledger
    .closed()
    .reduce(
      (n, { tickets }) =>
        n + tickets.filter((t) => equalBytes(t.pub, pub)).length,
      0,
    );

  const share = async () => {
    const text = `${residentPhrase(a)}, 하늘의 별 따기 우주인으로 등록했어요.`;
    const url = `${window.location.origin}/stardraw`;
    if (navigator.share) {
      try {
        await navigator.share({ text, url });
      } catch {
        // 공유 시트를 닫았다
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      // 복사를 못 하면 아무 일도 하지 않는다
    }
  };

  return (
    <section
      className="flex flex-col gap-4"
      aria-label="우주인 등록증"
      data-astronaut={a.number}
    >
      {greeting}
      <AstronautCard
        astronaut={a}
        registered={registered}
        clock={services.clock}
        onCheck={async () =>
          checkOwner(
            pub,
            await services.wallet.ownerSigner(pub),
            sitePolicy(),
            Math.floor(services.clock.now() / 1000),
          )
        }
      />
      {children}
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
      >
        {copied ? "링크를 복사했어요" : "등록증 공유"}
      </button>
      <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <span className="text-white/60 text-xs">공개 열쇠</span>
        <code
          data-public-key
          className="break-all font-mono text-[11px] text-white/85 leading-relaxed"
        >
          {toHex(pub)}
        </code>
        <p className="break-keep text-white/60 text-xs">
          공개 열쇠는 원래 공개하는 값이라 보여 줘도 안전합니다. 다만 등록증을
          보여 주면 장부 속 응모가 내 것인 줄 알 수 있습니다.
          {tickets > 0 && ` 지금 장부에 ${tickets}장.`}
        </p>
      </div>
    </section>
  );
}
