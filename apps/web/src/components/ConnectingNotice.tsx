"use client";

import { useEffect, useState } from "react";

/** 이만큼 지나도 방장과 이어지지 않으면 네트워크 안내를 띄운다(ms) */
const HINT_AFTER_MS = 15_000;

/**
 * 방에 이어지는 중 문구(마이티·하트 공통). 기기끼리 바로 잇기(WebRTC)가 막힌 망에서는
 * 끝없이 기다리기만 하므로, 참가자가 오래 기다리면 무엇을 해 볼지 알려 준다.
 */
export function ConnectingNotice({ isHost }: { isHost: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (isHost) return;
    const id = setTimeout(() => setSlow(true), HINT_AFTER_MS);
    return () => clearTimeout(id);
  }, [isHost]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm opacity-80">
        {isHost ? "방을 여는 중…" : "방장을 찾는 중… 잠시만 기다려 주세요"}
      </p>
      {slow && (
        <div
          role="status"
          className="rounded-xl bg-white/5 px-3 py-2 text-xs leading-relaxed opacity-90"
        >
          <p className="mb-1 font-semibold">연결이 오래 걸리나요?</p>
          <ul className="list-disc pl-4">
            <li>
              회사·학교 와이파이는 기기끼리 바로 잇는 것을 막을 때가 많습니다.
              한쪽이라도 휴대폰 데이터로 바꿔 보세요.
            </li>
            <li>방장 화면이 켜져 있는지, 링크가 맞는지 확인해 보세요.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
