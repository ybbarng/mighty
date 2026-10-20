import type { SavedMatch } from "./local-match";

const KEY = "mighty-save";

/** 진행 중인 대국 저장. 브라우저 저장소를 쓸 수 없는 환경(사생활 보호 창 등)에서는 조용히 넘어간다 */
export function saveGame(saved: SavedMatch): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // 저장할 수 없으면 이어하기만 안 될 뿐 게임은 계속된다.
  }
}

export function loadGame(): SavedMatch | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedMatch;
    return saved.version === 1 && Array.isArray(saved.log) ? saved : null;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 수 없어도 문제없다.
  }
}
