"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import { useEffect, useState } from "react";

import {
  browserRelayStore,
  type ConfirmRelay,
  LocalConfirmRelay,
} from "./confirm-relay";
import { type LedgerStatus, LocalLedger } from "./local-ledger";
import { sitePolicy } from "./wallet";

/**
 * 화면이 쓰는 장부와 확인 전달. 지금은 둘 다 이 기기 안 연습용이다(서버가 생기면 여기서 바꿔 끼운다).
 */
export interface Services {
  ledger: LocalLedger;
  relay: ConfirmRelay;
  clock: Clock;
}

let services: Services | null = null;

const LEDGER_STORAGE = "stardraw-ledger";

export function getServices(): Services {
  if (services) return services;
  const clock = realClock;
  services = {
    clock,
    ledger: new LocalLedger({
      clock,
      policy: sitePolicy(),
      store: {
        load: () => {
          try {
            return localStorage.getItem(LEDGER_STORAGE);
          } catch {
            return null;
          }
        },
        save: (text) => {
          try {
            localStorage.setItem(LEDGER_STORAGE, text);
          } catch {
            // 저장소를 못 쓰면 이번 방문 동안만 장부가 남는다
          }
        },
      },
    }),
    relay: new LocalConfirmRelay(clock, browserRelayStore()),
  };
  return services;
}

/** 1초마다 지난 회차를 추첨하고 지금 상태를 돌려준다. 장부가 바뀌면 `version`이 오른다 */
export function useLedger(): {
  services: Services | null;
  status: LedgerStatus | null;
  version: number;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<{
    services: Services | null;
    status: LedgerStatus | null;
    version: number;
  }>({ services: null, status: null, version: 0 });

  useEffect(() => {
    const s = getServices();
    let stop: (() => void) | null = null;
    let alive = true;
    let lastRecords = -1;
    const tick = async () => {
      await s.ledger.settle();
      if (!alive) return;
      const closed = s.ledger.closed().length;
      setState((prev) => ({
        services: s,
        status: s.ledger.status(),
        version: closed !== lastRecords ? prev.version + 1 : prev.version,
      }));
      lastRecords = closed;
      stop = s.clock.after(1000, () => void tick());
    };
    void tick();
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  return {
    ...state,
    refresh: async () => {
      const s = getServices();
      await s.ledger.settle();
      setState((prev) => ({
        services: s,
        status: s.ledger.status(),
        version: prev.version + 1,
      }));
    },
  };
}
