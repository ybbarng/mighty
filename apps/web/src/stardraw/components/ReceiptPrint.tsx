"use client";

import {
  type RoundRecord,
  type Schedule,
  type Ticket,
  ticketId,
  toHex,
} from "@mighty/stardraw-core";
import { useEffect, useRef, useState } from "react";
import { EASE, FX } from "../fx-timing";
import { Receipt } from "./Receipt";
import { StageOverlay } from "./StageOverlay";

/** 영수증이 다 내려오고 잠깐 머물기까지 */
export const PRINT_MS = FX.printDelay + FX.printFeed + FX.printHold;

/**
 * 영수증 발급 연출: 화면 전체 오버레이 안에서 영수증이 출력구로부터 부드럽게 내려오고, 다 나와 잠깐 머문 뒤
 * 오버레이가 걷히면 `onDone`. 끊기는 드르륵 소리는 부드러운 움직임과 어긋나 두지 않는다. 영수증 화면(막 응모함)과 데모 둘러보기가 같이 쓴다.
 * 걷힐 때 같은 종이가 그 자리에서 이어지게(FLIP): 뒤 화면을 영수증 위쪽에 맞게 스크롤하고, 뒤 화면의 영수증을
 * 오버레이 영수증 자리에 옮겨 놓았다가 제자리로 부드럽게 옮긴다(오버레이 쪽 종이는 그 순간 감춘다).
 * 움직임 줄이기면 바깥에서 그리지 않는다
 */
export function ReceiptPrint({
  ticket,
  receivedAt,
  schedule,
  record,
  sealed,
  onDone,
  continued = false,
}: {
  /** 응모 연출의 출력구에 바로 이어 그린다(오버레이가 새로 나타나지 않는다) */
  continued?: boolean;
  ticket: Ticket;
  receivedAt?: number | undefined;
  schedule: Schedule;
  record?: RoundRecord | undefined;
  sealed?: boolean | undefined;
  onDone: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  /** 뒤 화면의 같은 영수증으로 넘긴다(위 설명) */
  const handoff = () => {
    const over = box.current?.querySelector<HTMLElement>("article");
    const page = document.querySelector<HTMLElement>(
      `[data-receipt="${toHex(ticketId(ticket))}"]`,
    );
    if (over && page) {
      const o = over.getBoundingClientRect();
      window.scrollBy(0, page.getBoundingClientRect().top - o.top);
      const p = page.getBoundingClientRect();
      over.style.visibility = "hidden";
      // 걷히는 오버레이 위에서 옮겨 간다
      page.style.zIndex = "71";
      const anim = page.animate(
        [
          { transform: `translate(${o.left - p.left}px, ${o.top - p.top}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: FX.receiptHandoff, easing: EASE },
      );
      void anim.finished
        .catch(() => {})
        .then(() => {
          page.style.zIndex = "";
        });
    }
    setClosing(true);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 그릴 때 한 번
  useEffect(() => {
    const close = window.setTimeout(handoff, PRINT_MS);
    const off = window.setTimeout(onDone, PRINT_MS + FX.stageOut);
    return () => {
      window.clearTimeout(close);
      window.clearTimeout(off);
    };
  }, []);
  return (
    <StageOverlay label="영수증 발급" closing={closing} appear={!continued}>
      <div ref={box} className="pointer-events-none">
        <Receipt
          ticket={ticket}
          receivedAt={receivedAt}
          schedule={schedule}
          record={record}
          sealed={sealed}
          printing
        />
      </div>
    </StageOverlay>
  );
}
