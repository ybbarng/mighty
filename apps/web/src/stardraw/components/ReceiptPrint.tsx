"use client";

import type { RoundRecord, Schedule, Ticket } from "@mighty/stardraw-core";
import { useEffect, useState } from "react";
import { FX } from "../fx-timing";
import { Receipt } from "./Receipt";
import { StageOverlay } from "./StageOverlay";

/** 영수증이 다 내려오고 잠깐 머물기까지 */
export const PRINT_MS = FX.printDelay + FX.printFeed + FX.printHold;

/**
 * 영수증 발급 연출: 화면 전체 오버레이 안에서 영수증이 출력구로부터 부드럽게 내려오고, 다 나와 잠깐 머문 뒤
 * 오버레이가 걷히면 `onDone`. 끊기는 드르륵 소리는 부드러운 움직임과 어긋나 두지 않는다. 영수증 화면(막 응모함)과 데모 둘러보기가 같이 쓴다.
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: 처음 그릴 때 한 번
  useEffect(() => {
    const close = window.setTimeout(() => setClosing(true), PRINT_MS);
    const off = window.setTimeout(onDone, PRINT_MS + FX.stageOut);
    return () => {
      window.clearTimeout(close);
      window.clearTimeout(off);
    };
  }, []);
  return (
    <StageOverlay label="영수증 발급" closing={closing} appear={!continued}>
      <div className="pointer-events-none">
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
