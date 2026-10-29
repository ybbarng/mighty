"use client";

import { type Clock, realClock } from "@mighty/fair-play";
import { useEffect, useState } from "react";

import { browserCheckStore, Checker } from "./checks";
import {
  browserRelayStore,
  type ConfirmRelay,
  LocalConfirmRelay,
} from "./confirm-relay";
import { type LedgerStatus, LocalLedger } from "./local-ledger";
import { createWallet, sitePolicy, type Wallet } from "./wallet";

/**
 * 화면이 쓰는 장부·지갑·확인 전달·확인 기록. 지금은 모두 이 기기 안 연습용이다(서버가 생기면 여기서 바꿔 끼운다).
 * 저장 이름공간(`ns`)마다 따로 둔다: 실제 게임은 "stardraw", 데모는 "stardraw-demo".
 */
export interface Services {
  ns: string;
  ledger: LocalLedger;
  wallet: Wallet;
  relay: ConfirmRelay;
  /** 확인하는 분 기기의 확인 기록 */
  checker: Checker;
  clock: Clock;
}

const cache = new Map<string, Services>();

export const GAME_NS = "stardraw";
export const DEMO_NS = "stardraw-demo";

export function getServices(ns: string = GAME_NS): Services {
  const found = cache.get(ns);
  if (found) return found;
  const clock = realClock;
  const relay = new LocalConfirmRelay(
    clock,
    browserRelayStore(),
    `${ns}-confirm:`,
  );
  const ledgerKey = `${ns}-ledger`;
  const services: Services = {
    ns,
    clock,
    relay,
    wallet: createWallet(ns),
    checker: new Checker(
      relay,
      browserCheckStore(`${ns}-checks`),
      clock,
      sitePolicy(),
    ),
    ledger: new LocalLedger({
      clock,
      policy: sitePolicy(),
      store: {
        load: () => {
          try {
            return localStorage.getItem(ledgerKey);
          } catch {
            return null;
          }
        },
        save: (text) => {
          try {
            localStorage.setItem(ledgerKey, text);
          } catch {
            // 저장소를 못 쓰면 이번 방문 동안만 장부가 남는다
          }
        },
      },
    }),
  };
  cache.set(ns, services);
  return services;
}

/** 데모를 처음부터: 그 이름공간의 장부·지갑·전달을 지우고 새로 만든다 */
export async function resetServices(ns: string): Promise<Services> {
  const old = cache.get(ns) ?? getServices(ns);
  await old.wallet.clear();
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(`${ns}-`)) localStorage.removeItem(key);
    indexedDB.deleteDatabase(`${ns}-checks`);
  } catch {
    // 지우지 못한 것은 새 장부와 섞이지 않는다(장부 씨앗이 새로 생긴다)
  }
  cache.delete(ns);
  return getServices(ns);
}

/** 1초마다 지난 회차를 추첨하고 지금 상태를 돌려준다. 장부가 바뀌면 `version`이 오른다 */
export function useLedger(ns: string = GAME_NS): {
  services: Services | null;
  status: LedgerStatus | null;
  version: number;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
} {
  const [state, setState] = useState<{
    services: Services | null;
    status: LedgerStatus | null;
    version: number;
  }>({ services: null, status: null, version: 0 });
  const [generation, setGeneration] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 데모를 처음부터 하면(generation) 새 장부로 다시 돈다
  useEffect(() => {
    const s = getServices(ns);
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
  }, [ns, generation]);

  return {
    ...state,
    refresh: async () => {
      const s = getServices(ns);
      await s.ledger.settle();
      setState((prev) => ({
        services: s,
        status: s.ledger.status(),
        version: prev.version + 1,
      }));
    },
    reset: async () => {
      const s = await resetServices(ns);
      setState((prev) => ({
        services: s,
        status: s.ledger.status(),
        version: prev.version + 1,
      }));
      setGeneration((g) => g + 1);
    },
  };
}
