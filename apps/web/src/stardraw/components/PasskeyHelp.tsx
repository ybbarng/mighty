"use client";

import { toBase64Url, toHex } from "@mighty/stardraw-core";

import { cn } from "@/lib/cn";

import type { KeyInfo } from "../wallet";

/**
 * 패스키를 자연스럽게 쓰게 하는 부품(docs/36 11-2). 조르지 않고, 패스키에 응모권·확률 혜택은 주지 않는다(공정성).
 * - `PasskeyFaq`: 사람들이 실제로 걱정하는 질문에 쉬운 말로 답한다
 * - `KeyChip`: 내 열쇠 상태
 * - `KeyHolding`: "서버(장부)가 가진 것"과 "내 기기에만 있는 것"을 나란히 보여 준다
 */

const FAQ: { q: string; a: string }[] = [
  {
    q: "패스키가 뭐예요?",
    a: "비밀번호 대신 휴대폰·컴퓨터의 잠금(얼굴, 지문, 화면 잠금 PIN)으로 본인임을 확인하는 방법이에요. 하늘의 별 따기는 응모권에 내 패스키로 서명해 두었다가, 당첨되면 그 응모권이 내 것임을 증명해요.",
  },
  {
    q: "얼굴·지문이 서버로 가나요?",
    a: "아니요. 얼굴과 지문은 기기 안에서 잠금을 여는 데만 쓰이고 기기 밖으로 나가지 않아요. 서버에는 서명만 와요.",
  },
  {
    q: "서버가 해킹되면요?",
    a: "서버에는 공개 열쇠만 있어요. 공개 열쇠는 서명이 맞는지 확인하는 데만 쓰여서, 누가 훔쳐 가도 내 응모나 당첨 증명을 흉내 낼 수 없어요.",
  },
  {
    q: "가짜 사이트에 속으면요?",
    a: "패스키는 game.byb.kr에 묶여 있어서, 비슷하게 꾸민 다른 주소에서는 아예 작동하지 않아요. 비밀번호는 가짜 사이트에 입력하면 그대로 넘어가지만 패스키는 그럴 수 없어요. 비밀번호와 가장 큰 차이예요.",
  },
  {
    q: "휴대폰을 잃어버리면요?",
    a: "패스키는 iCloud 키체인, Google 비밀번호 관리자, 1Password 같은 곳에 저장되어 새 기기로 따라와요. 잃어버린 휴대폰은 화면 잠금이 지켜 줘요.",
  },
  {
    q: "비밀번호보다 왜 나아요?",
    a: "외울 것이 없고, 사이트에서 새어 나갈 비밀번호가 없고, 여러 사이트에 같은 비밀번호를 돌려 쓰는 문제도 없어요.",
  },
  {
    q: "저를 추적하나요?",
    a: "이름·이메일을 받지 않아요. 패스키는 사이트마다 따로 만들어져서 다른 사이트와 이어지지 않아요.",
  },
  {
    q: "어디에 저장되나요?",
    a: "쓰는 기기에 따라 iCloud 키체인(아이폰·맥), Google 비밀번호 관리자(안드로이드·크롬), 1Password 같은 비밀번호 관리 앱, 윈도우 Hello, 보안 키 중 한 곳에 저장돼요.",
  },
  {
    q: "아이폰과 안드로이드를 같이 쓰면요?",
    a: "응모할 때 '다른 기기 사용'을 고르면 화면에 QR이 떠요. 패스키가 있는 휴대폰 카메라로 찍으면 그 휴대폰으로 확인할 수 있어요. 1Password처럼 두 기기에 모두 있는 앱에 저장해도 어디서나 쓸 수 있어요.",
  },
];

export function PasskeyFaq({ className }: { className?: string }) {
  return (
    <section
      aria-label="패스키가 뭐예요?"
      className={cn("flex flex-col gap-2", className)}
    >
      <ul className="flex flex-col gap-1.5">
        {FAQ.map(({ q, a }) => (
          <li key={q}>
            <details className="group rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <summary className="cursor-pointer list-none font-semibold text-sm marker:hidden">
                <span className="mr-1.5 inline-block text-white/50 transition group-open:rotate-90">
                  ›
                </span>
                {q}
              </summary>
              <p className="mt-1.5 break-keep text-sm text-white/75 leading-relaxed">
                {a}
              </p>
            </details>
          </li>
        ))}
      </ul>
      <p className="break-keep rounded-xl border border-amber-200/20 bg-amber-200/5 px-3 py-2 text-amber-100/85 text-xs leading-relaxed">
        솔직한 한계: 누군가 내 휴대폰 잠금을 풀 수 있다면 그 사람도 내 패스키를
        쓸 수 있어요. 화면 잠금은 꼭 켜 두세요.
      </p>
      <div className="break-keep rounded-xl border border-sky-200/20 bg-sky-200/5 px-3 py-2 text-sky-100/85 text-xs leading-relaxed">
        <p className="font-semibold text-sm">연습: 다른 기기에서 열어 보기</p>
        <p>
          다른 기기나 브라우저에서 game.byb.kr/stardraw를 열고 「내 응모」의
          「다른 기기에서 내 응모권 찾기」를 누르세요. 패스키로 한 번 확인해 내
          응모 이력이 보이면, 패스키가 잘 따라온 거예요.
        </p>
      </div>
    </section>
  );
}

/** 내 열쇠 상태 칩 */
export function KeyChip() {
  return (
    <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-emerald-100 text-xs">
      <KeyIcon className="size-3.5" />
      패스키 · 기기를 바꿔도 안전
    </span>
  );
}

/** "서버(장부)가 가진 것"과 "내 기기에만 있는 것" */
export function KeyHolding({ keyInfo }: { keyInfo: KeyInfo }) {
  const pub = toHex(keyInfo.pub);
  const credential = toBase64Url(keyInfo.credentialId);
  return (
    <section
      aria-label="내 열쇠가 있는 곳"
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="font-semibold text-sm">서버(공개 장부)가 가진 것</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-white/55">공개 열쇠</dt>
          <dd className="truncate font-mono text-white/80">
            {pub.slice(0, 18)}…
          </dd>
          <dt className="text-white/55">패스키 번호</dt>
          <dd className="truncate font-mono text-white/80">
            {credential.slice(0, 14)}…
          </dd>
        </dl>
        <p className="break-keep text-white/55 text-xs">
          누구나 볼 수 있어요. 서명이 맞는지 확인하는 데만 쓰여요.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-emerald-300/25 bg-emerald-300/5 p-3">
        <p className="font-semibold text-sm">내 기기에만 있는 것</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-white/55">비밀 열쇠</dt>
          <dd className="flex items-center gap-1 text-emerald-100">
            <KeyIcon className="size-3.5" />
            꺼낼 수 없음
          </dd>
          <dt className="text-white/55">얼굴·지문</dt>
          <dd className="text-emerald-100">기기 밖으로 안 나감</dd>
        </dl>
        <p className="break-keep text-white/55 text-xs">
          이 사이트도, 서버도 볼 수 없어요. 잠금을 풀어야만 서명에 쓰여요.
        </p>
      </div>
    </section>
  );
}

/** 작은 열쇠 그림(꾸밈) */
export function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="5" cy="8" r="3" />
      <path d="M8 8h6.5M12 8v2.5M14.5 8v2" />
    </svg>
  );
}
