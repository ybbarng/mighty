"use client";

import { useEffect, useRef, useState } from "react";

import { QUICK_CHATS, useChat } from "@/net/chat";
import { CHAT_MAX_LENGTH } from "@/net/protocol";

/** 채팅 기록과 입력. 대기실에 그대로 두거나 게임 화면에서 띄워 쓴다 */
export function ChatBox({ mySeat }: { mySeat: number | null }) {
  const messages = useChat((s) => s.messages);
  const send = useChat((s) => s.send);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 새 말이 오면 맨 아래로 내린다
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const say = (value: string) => {
    if (!send || !value.trim()) return;
    send(value);
    setText("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={listRef}
        className="flex h-32 flex-col gap-1 overflow-y-auto rounded-xl bg-black/30 p-2 text-sm"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-xs opacity-50">아직 아무 말도 없습니다</p>
        ) : (
          messages.map((m) => (
            <p key={m.id} className="leading-snug">
              <b
                className={
                  m.seat === mySeat ? "text-amber-200" : "text-sky-200"
                }
              >
                {m.name}
              </b>{" "}
              {m.text}
            </p>
          ))
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_CHATS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={!send}
            onClick={() => say(q)}
            className="rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          say(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="한마디"
          aria-label="채팅 입력"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!send || !text.trim()}
          className="rounded-lg bg-amber-400 px-3 font-semibold text-black text-sm disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </div>
  );
}
