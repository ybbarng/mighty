import { create } from "zustand";

import type { ChatMessage } from "./protocol";

/** 화면에 남겨 두는 채팅 줄 수 */
const KEEP = 50;

interface ChatState {
  messages: (ChatMessage & { at: number })[];
  /** 채팅 창을 닫아 둔 동안 온 말 수 */
  unread: number;
  open: boolean;
  /** 지금 방에서 말하기. 방에 들어가면 정해진다 */
  send: ((text: string) => void) | null;
  receive(message: ChatMessage): void;
  setOpen(open: boolean): void;
  reset(): void;
}

/** 온라인 대전 채팅. 대기실과 게임 화면이 같이 쓴다 */
export const useChat = create<ChatState>()((set) => ({
  messages: [],
  unread: 0,
  open: false,
  send: null,
  receive: (message) =>
    set((s) => ({
      messages: [...s.messages, { ...message, at: Date.now() }].slice(-KEEP),
      unread: s.open ? 0 : s.unread + 1,
    })),
  setOpen: (open) => set((s) => ({ open, unread: open ? 0 : s.unread })),
  reset: () => set({ messages: [], unread: 0, open: false, send: null }),
}));

/** 자주 쓰는 짧은 말 */
export const QUICK_CHATS = [
  "👍",
  "😂",
  "😮",
  "😭",
  "🔥",
  "👏",
  "잘했어!",
  "아깝다",
];
