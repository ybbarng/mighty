/**
 * 데모의 "패스키 흉내" 창구. 데모는 실제 패스키를 만들지 않는다(2026-10-29 사용자):
 * 데모와 실제 게임이 같은 주소(game.byb.kr)라, 데모 패스키가 비밀번호 관리 앱에 남아 실제 게임의 패스키 목록에 섞이기 때문이다.
 * 데모 지갑이 서명하기 전에 `requestUnlock`을 부르면, 화면의 `DemoUnlockSheet`가 휴대폰 시스템 창을 닮은 시트를 띄우고
 * 사용자가 [확인]이나 [취소]를 누를 때 답이 돌아온다. 한 번에 하나만 묻는다.
 */

export type UnlockPurpose = "create" | "sign";

export interface UnlockAsk {
  /** 요청마다 새 번호(시트를 요청마다 새로 그린다) */
  id: number;
  purpose: UnlockPurpose;
  answer(ok: boolean): void;
}

type Listener = (ask: UnlockAsk | null) => void;

let current: UnlockAsk | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function publish(): void {
  for (const l of listeners) l(current);
}

/** 시트가 떠서 답할 때까지 기다린다. 시트가 없으면(화면이 아직 안 그려짐) 취소로 본다 */
export function requestUnlock(purpose: UnlockPurpose): Promise<boolean> {
  if (listeners.size === 0) return Promise.resolve(false);
  // 시트가 뜬 횟수를 화면에 남긴다(응모 한 번에 몇 번 묻는지 화면 시험이 센다)
  try {
    const root = document.documentElement;
    root.dataset.demoUnlocks = String(
      Number(root.dataset.demoUnlocks ?? 0) + 1,
    );
  } catch {
    // 화면이 없으면(단위 시험) 세지 않는다
  }
  // 앞서 묻던 것이 있으면 취소로 닫는다
  current?.answer(false);
  return new Promise((resolve) => {
    const ask: UnlockAsk = {
      id: nextId++,
      purpose,
      answer: (ok) => {
        if (current !== ask) return;
        current = null;
        publish();
        resolve(ok);
      },
    };
    current = ask;
    publish();
  });
}

export function subscribeUnlock(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
