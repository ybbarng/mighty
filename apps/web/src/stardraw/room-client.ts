"use client";

import {
  type EntrantSigner,
  encodeSignatureData,
  fromBase64Url,
  ROOM_TEXT_MAX,
  roomCharCount,
  roomPassMessage,
  toBase64Url,
} from "@mighty/stardraw-core";

/**
 * 회차 방 연결(docs/36 11-23). 스트림은 fetch로 POST해 받는다(대화 표를 주소에 넣지 않으려고 EventSource 대신).
 * 서버 시각과 기기 시각의 차이(`offset`)를 hello·time 이벤트로 맞춘다: 서버 시각 ≈ Date.now() + offset
 */

export interface RoomPerson {
  id: string;
  pub: string;
  entered: boolean;
  director?: boolean;
}

export interface RoomPicks {
  counts: Record<number, number>;
  byPerson: Record<string, number[]>;
}

export type RoomEvent =
  | {
      type: "hello";
      serverTime: number;
      round: number;
      drawAt: number;
      entryDeadline: number;
      closesAt: number;
      me: string | null;
      people: RoomPerson[];
      watchers: number;
      sealed: boolean;
      drawn: boolean;
      picks: RoomPicks | null;
    }
  | { type: "time"; serverTime: number }
  | { type: "join"; person: RoomPerson }
  | { type: "leave"; id: string }
  | { type: "watchers"; count: number }
  | { type: "say"; id: string; from: string; text: string; at: number }
  | {
      type: "cheer";
      from: string;
      kind: "twinkle" | "meteor";
      to: string | null;
    }
  | { type: "hide"; id: string }
  | { type: "kicked"; id: string }
  | { type: "sealed"; picks: RoomPicks }
  | { type: "drawn" }
  | { type: "closed" }
  | { type: "report"; id: string; count: number };

export class RoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export { ROOM_TEXT_MAX, roomCharCount };

/** 대화 표를 이 기기(탭)에 둔다: 잠깐 나갔다 와도 다시 들어오게. 방이 닫히면 쓸모없어진다 */
const passKey = (round: number) => `stardraw-room-pass-${round}`;
export function savedPass(round: number): { pass: string; id: string } | null {
  try {
    const raw = sessionStorage.getItem(passKey(round));
    return raw ? (JSON.parse(raw) as { pass: string; id: string }) : null;
  } catch {
    return null;
  }
}
function savePass(round: number, value: { pass: string; id: string }) {
  try {
    sessionStorage.setItem(passKey(round), JSON.stringify(value));
  } catch {
    // 저장소를 못 쓰면 이번 연결 동안만
  }
}

export class RoomClient {
  offset = 0;
  private abort: AbortController | null = null;

  constructor(
    private base: string,
    readonly round: number,
  ) {}

  private url(action: string) {
    return `${this.base}/api/room/${this.round}/${action}`;
  }

  private async post<T>(action: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(action), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    } & T;
    if (!res.ok)
      throw new RoomError(data.error ?? "방에 닿지 못했어요", res.status);
    return data;
  }

  /** 서버 시각(ms) */
  serverNow(): number {
    return Date.now() + this.offset;
  }

  /** 한 번 쓰는 값. 신분증 제시 단추를 누르기 전에 미리 받아 둔다(누름 직후 바로 패스키를 열게) */
  challenge(): Promise<{ nonce: string; expiresAt: number }> {
    return this.post("challenge", {});
  }

  /**
   * 대화 표: 미리 받은 값에 패스키로 서명(누름 처리 안에서 곧바로 부른다)해 서버에 낸다
   */
  async issuePass(
    signer: EntrantSigner,
    nonce: string,
  ): Promise<{ pass: string; id: string }> {
    const signature = await signer.sign(
      roomPassMessage(this.round, fromBase64Url(nonce)),
    );
    const got = await this.post<{ pass: string; id: string }>("pass", {
      pub: toBase64Url(signer.publicKey),
      signature: encodeSignatureData(signature),
      nonce,
    });
    savePass(this.round, got);
    return got;
  }

  say(pass: string, text: string): Promise<{ id: string }> {
    return this.post("say", { pass, text });
  }

  cheer(pass: string, kind: "twinkle" | "meteor", to: string | null) {
    return this.post("cheer", { pass, kind, to });
  }

  report(pass: string, id: string) {
    return this.post<{ count: number }>("report", { pass, id });
  }

  /** 스트림을 연다. 끊기면 `onEnd`(다시 연결은 바깥에서) */
  async listen(
    pass: string | null,
    onEvent: (e: RoomEvent) => void,
    onEnd: (err: RoomError | null) => void,
  ): Promise<void> {
    this.close();
    const abort = new AbortController();
    this.abort = abort;
    let res: Response;
    try {
      res = await fetch(this.url("events"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(pass ? { pass } : {}),
        signal: abort.signal,
      });
    } catch {
      if (!abort.signal.aborted) onEnd(new RoomError("방에 닿지 못했어요", 0));
      return;
    }
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      onEnd(new RoomError(data.error ?? "방에 들어가지 못했어요", res.status));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let cut = buf.indexOf("\n\n");
        while (cut >= 0) {
          const chunk = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          for (const line of chunk.split("\n"))
            if (line.startsWith("data: ")) {
              const e = JSON.parse(line.slice(6)) as RoomEvent;
              if (e.type === "hello" || e.type === "time")
                this.offset = e.serverTime - Date.now();
              onEvent(e);
            }
          cut = buf.indexOf("\n\n");
        }
      }
    } catch {
      // 끊김
    }
    if (!abort.signal.aborted) onEnd(null);
  }

  close(): void {
    this.abort?.abort();
    this.abort = null;
  }
}
