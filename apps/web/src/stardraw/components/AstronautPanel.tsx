"use client";

import { roundTimes, toHex } from "@mighty/stardraw-core";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { AstronautCard } from "../astronaut/AstronautCard";
import { astronautOf, residentPhrase } from "../astronaut/identity";
import { checkOwner } from "../astronaut/owner-check";
import { checkHolding, loadHoldings } from "../qual-store";
import type { Services } from "../services";
import { sitePolicy } from "../wallet";

/** 날짜 "2026. 10. 30."(ms) */
export function dateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

/**
 * 등록증 발급일(ms)을 정하는 한 곳. 장부의 등록 회차 날짜 > 이 기기에 저장된 발급 시각(패스키를 만든 때,
 * 없으면 처음 등록증을 본 때를 저장) > 지금(둘러보기 견본처럼 이 기기 열쇠가 아닌 경우).
 * 우주인 등록 직후 장부에 등록을 올리므로(docs/36 11-14) 보통 장부 날짜이고, 기기 시각은 등록이 오르기 전(작업 증명 중)과 예전 열쇠에만 쓴다
 */
export async function issuedAtOf(
  services: Services,
  pub: Uint8Array,
): Promise<number> {
  const round = await services.ledger.registeredRound(pub).catch(() => null);
  if (round !== null)
    return roundTimes(services.ledger.schedule, round).closesAt * 1000;
  return services.wallet.issuedAt(pub) ?? services.clock.now();
}

/** 등록증 발급일 "2026. 10. 30."(읽는 중이면 null) */
export function useIssued(services: Services, pub: Uint8Array): string | null {
  const [issued, setIssued] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void issuedAtOf(services, pub).then((ms) => {
      if (alive) setIssued(dateOf(ms));
    });
    return () => {
      alive = false;
    };
  }, [services, pub]);
  return issued;
}

/**
 * 우주인 등록증 한 장과 공유(docs/36 11-9). 등록 직후·내 등록증·데모가 같이 쓴다.
 * 우리 화면은 남의 등록증을 그리지 않는다: 이 기기의 내 등록증만(데모는 가짜 우주인). 그래서 공유도 공개 열쇠 주소 대신
 * 인사 문구와 첫 화면 주소만 보낸다.
 * 공개 열쇠는 앞면·공유에 넣지 않고 카드 뒷면에 가려 둔다(꺼내 보기 전에 본인 확인, `AstronautCard`).
 * 등록증 그림을 나눠도 글자 검색으로 장부 속 응모가 바로 찾히지 않게 하는 실수 방지다. 등록번호로도 계산하면 찾을 수 있다는 한계는 남는다.
 * 발급일은 `issuedAtOf`가 정한다.
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
  const issued = useIssued(services, pub);
  const affiliation = useAffiliation(services, pub);
  const [copied, setCopied] = useState(false);
  // 앞면 주인 확인과 뒷면 열쇠 꺼내 보기가 같은 본인 확인을 쓴다(그 등록증의 패스키, 기기 안에서 확인)
  const confirmOwner = async () =>
    checkOwner(
      pub,
      await services.wallet.ownerSigner(pub),
      sitePolicy(),
      Math.floor(services.clock.now() / 1000),
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
        issued={issued}
        clock={services.clock}
        onCheck={confirmOwner}
        pub={pub}
        onReveal={confirmOwner}
        affiliation={affiliation}
      />
      {children}
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-2xl border border-white/20 py-2.5 font-semibold text-sm hover:bg-white/10"
      >
        {copied ? "링크를 복사했어요" : "등록증 공유"}
      </button>
      <p className="-mt-2 break-keep text-center text-white/55 text-xs">
        등록증을 보여 주면 장부 속 응모가 내 것인 줄 알 수 있습니다.
      </p>
    </section>
  );
}

/**
 * 이 기기에 있는 상품 자격 증서 중 장부의 기간 열쇠로 도장이 확인되는 것의 소속(배지, docs/36 11-13).
 * 증서는 우주인 열쇠와 묶이지 않으니 이 기기의 내 등록증에만 보인다
 */
function useAffiliation(
  services: Services,
  pub: Uint8Array,
): { name: string; method: string } | null {
  const [found, setFound] = useState<{ name: string; method: string } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    const mine = services.wallet.loadKey()?.pub;
    if (!mine || toHex(mine) !== toHex(pub)) {
      setFound(null);
      return;
    }
    services.ledger
      .qualInfo()
      .then((info) => {
        const holdings = loadHoldings(services.ns, services.ledger.id());
        const period = info.periods.find((p) =>
          holdings.some(
            (h) => toHex(h.periodId) === p.id && checkHolding(p, h),
          ),
        );
        if (alive)
          setFound(
            period
              ? { name: period.affiliationName, method: period.method }
              : null,
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [services, pub]);
  return found;
}
