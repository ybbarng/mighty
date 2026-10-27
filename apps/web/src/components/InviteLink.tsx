"use client";

import { useEffect, useState } from "react";

import { InviteQr } from "./InviteQr";
import { ActionButton } from "./panels/common";

/**
 * 방장 화면의 초대 상자(마이티·하트 공통). 링크 복사가 기본이고,
 * 공유 창이 있는 기기(주로 휴대폰)에는 보내기 단추도 둔다.
 */
export function InviteLink({
  link,
  roomCode,
  shareTitle,
}: {
  link: string;
  roomCode: string;
  shareTitle: string;
}) {
  const [copied, setCopied] = useState(false);
  // 서버에서 그린 화면과 어긋나지 않게 그린 뒤에 공유 창이 있는지 본다.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // 복사를 막은 브라우저: 링크 칸을 직접 골라 복사한다
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: shareTitle, url: link });
    } catch {
      // 공유 창을 닫은 경우
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
      <p className="text-sm">친구에게 이 링크를 보내세요</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-1.5 font-mono text-xs"
        />
        <ActionButton
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => void copy()}
        >
          {copied ? "복사됨" : "복사"}
        </ActionButton>
        {canShare && (
          <ActionButton
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => void share()}
          >
            보내기
          </ActionButton>
        )}
      </div>
      {link && (
        <div className="flex items-center gap-3">
          <InviteQr url={link} size={120} />
          <p className="text-xs leading-relaxed opacity-70">
            휴대폰 카메라로 찍으면 바로 들어옵니다.
            <br />방 코드 {roomCode}
          </p>
        </div>
      )}
    </div>
  );
}
