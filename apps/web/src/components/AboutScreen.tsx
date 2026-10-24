"use client";

import { CREDITS } from "./brand/brand";
import { Logo } from "./brand/Logo";
import { LicenseLink, MadeWith } from "./brand/MadeWith";
import { ActionButton } from "./panels/common";

/** 마이티는?: 게임 소개와 만든 사람, 원작 표시 */
export function AboutScreen({
  onBack,
  onTutorial,
}: {
  onBack: () => void;
  onTutorial: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_center,#166534_0%,#0a3622_75%)] p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur">
        <div className="flex justify-center">
          <Logo size={160} />
        </div>

        <section className="flex flex-col gap-2 text-[15px] leading-relaxed">
          <h2 className="font-bold text-lg">마이티는</h2>
          <p>
            다섯 명이 트럼프 52장과 조커 한 장으로 하는 트릭 테이킹 카드
            게임입니다. 가장 높은 공약을 건{" "}
            <b className="text-amber-200">주공</b>이 같은 편{" "}
            <b className="text-amber-200">프렌드</b>를 카드로 지목하고, 둘이서
            공약한 만큼 점수 카드(10·J·Q·K·A)를 가져오면 이깁니다.
          </p>
          <p>
            가장 센 카드 <b className="text-amber-200">마이티</b>, 그다음 조커,
            조커를 끌어내는 조커콜까지. 오래전 대학 동아리방과 PC통신에서 널리
            하던 게임입니다. 2~7명 규칙도 고를 수 있습니다.
          </p>
          <ActionButton variant="secondary" onClick={onTutorial}>
            단원별로 배우기
          </ActionButton>
        </section>

        <section className="flex flex-col gap-1.5 text-xs leading-relaxed opacity-80">
          <h2 className="font-semibold text-sm">친구와 할 때 안전한가요?</h2>
          <p>
            서버 없이 기기끼리 이어지는데도 섞기 조작, 결과 조작, 방장 사칭을
            어떻게 막는지 실제 코드로 해 볼 수 있게 정리했습니다.{" "}
            <a href="/security" className="text-sky-300 underline">
              어떻게 지켜지나요?
            </a>{" "}
            · 처음부터 차근차근 배우려면{" "}
            <a href="/learn" className="text-sky-300 underline">
              보안 배우기
            </a>
          </p>
        </section>

        <section className="flex flex-col gap-1.5 text-xs leading-relaxed opacity-80">
          <h2 className="font-semibold text-sm">이 게임은</h2>
          <p>
            윈도우용{" "}
            <a
              href="https://github.com/skyser2003/mighty40"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              마이티 네트워크(Mighty Network) 4.0
            </a>
            을 이어받아 웹으로 다시 만들었습니다. 원작의 규칙 옵션과 진행 방식을
            따르고, 원작의 규칙 문자열을 그대로 쓸 수 있습니다. 코드와
            그림·소리는 새로 만들었습니다.
          </p>
          <p>
            다함께 마이티는 서버 없이 기기끼리 바로 연결되고, 방장도 섞기를
            조작할 수 없게 판이 끝난 뒤 모두가 직접 검증합니다.
          </p>
        </section>

        <section className="flex flex-col gap-1.5 text-xs">
          <h2 className="font-semibold text-sm opacity-80">만든 사람들</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
            {CREDITS.map((c) => (
              <div key={c.name} className="contents">
                <dt className="tabular-nums opacity-60">{c.years}</dt>
                <dd>{c.name}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="text-center text-[11px] leading-relaxed opacity-50">
          전통 그림 카드 인물: Dmitry Fomin, 위키미디어 공용(CC0)
          <br />
          <MadeWith /> · <LicenseLink />
        </p>

        <button
          type="button"
          onClick={onBack}
          className="text-center text-xs underline opacity-70"
        >
          처음으로
        </button>
      </div>
    </main>
  );
}
