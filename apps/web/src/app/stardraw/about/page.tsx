import type { Metadata, Viewport } from "next";

import { MadeWith } from "@/components/brand/MadeWith";
import { LottoBall } from "@/stardraw/components/parts";
import { RANK_RULE } from "@/stardraw/results";
import { SKY_STARS, tempWord } from "@/stardraw/sky";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 설명 · Stardraw" },
  description:
    "하늘의 별 따기 게임 방법, 응모판(서울 하늘의 밝은 별 45개) 읽는 법, 별 목록, 당첨자 확인, 데이터 출처.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-xl">{title}</h2>
      {children}
    </section>
  );
}

/** 하늘의 별 따기 설명 페이지(게임 화면에는 작은 "설명" 링크만 둔다) */
export default function StardrawAbout() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-2xl flex-col gap-10 break-keep leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href="/stardraw"
            className="self-start text-sm text-white/70 hover:text-white"
          >
            ← 하늘의 별 따기
          </a>
          <h1 className="font-black text-3xl">하늘의 별 따기 설명</h1>
          <p className="text-white/75">
            로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요? 서울 하늘에서 가장
            밝은 별 45개 가운데 6개를 고르는 정시 추첨입니다. 상품은 없고,
            누구나 결과를 처음부터 다시 계산해 볼 수 있습니다.
          </p>
          <a
            href="/stardraw/demo"
            className="self-start rounded-xl border border-amber-200/40 px-4 py-2 text-amber-100 text-sm hover:bg-amber-200/10"
          >
            데모에서 응모부터 당첨자 확인까지 해 보기
          </a>
        </header>

        <Section title="게임 방법">
          <ol className="list-decimal space-y-2 pl-5 text-white/85">
            <li>
              회차마다 별 6개를 고릅니다. 네모 하늘에서 별을 누르거나, 아래 1~45
              칸에서 번호를 눌러도 같습니다. 자동·남은 칸 자동도 됩니다.
            </li>
            <li>
              처음 한 번 응모 열쇠(패스키)를 만듭니다. 응모권에 이 열쇠의 서명이
              들어가고, 이름·이메일은 받지 않습니다. 한 열쇠는 회차마다 한 장만
              낼 수 있습니다.
            </li>
            <li>
              회차는 1시간이고, 마감 5분 뒤 공개 난수로 당첨 번호 6개와 보너스
              1개를 정합니다. 추첨기에서 공이 하나씩 나오며 하늘의 그 별이
              켜집니다.
            </li>
            <li>등수는 실제 로또와 같습니다.</li>
          </ol>
          <table className="w-full text-sm">
            <tbody>
              {([1, 2, 3, 4, 5] as const).map((rank) => (
                <tr key={rank} className="border-white/10 border-b">
                  <td className="py-1.5 font-bold">{rank}등</td>
                  <td className="py-1.5 text-white/75">
                    {RANK_RULE[rank]} 맞음
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="응모판 읽는 법">
          <ul className="list-disc space-y-2 pl-5 text-white/85">
            <li>
              번호 1~45는 서울에서 보이는 가장 밝은 실제 별 45개이고, 번호가 곧
              밝은 순서입니다. 1번은 온 하늘에서 가장 밝은 시리우스입니다.
            </li>
            <li>
              별의 크기는 실제 밝기(등급), 색은 실제 표면 온도입니다.
              베텔게우스·안타레스는 붉고, 리겔·스피카는 푸릅니다.
            </li>
            <li>
              네모 하늘은 하늘을 가로(동쪽이 왼쪽)·세로(위가 북쪽)로 편
              것입니다. 별이 가장 드문 곳에서 하늘을 갈라 별자리가 잘리지 않게
              했고, 동서남북 차례는 대체로 지키면서 별이 몰린 겨울 하늘은 넓히고
              빈 곳은 채웠습니다. 손가락으로 누를 틈도 두었습니다.
            </li>
            <li>
              별 아래 작은 공의 색은 로또 공 색 구간입니다(1~10 노랑, 11~20
              파랑, 21~30 빨강, 31~40 회색, 41~45 초록).
            </li>
            <li>
              흐린 선은 실제 별자리 선(서울 하늘에 뜨는 별자리 68개)이고, 작은
              점은 번호가 없는 어두운 별입니다. 별을 누르면 그 별의 별자리가
              환해지며 이름이 나오고, 고른 별의 별자리는 조금 밝게 남습니다.
            </li>
          </ul>
        </Section>

        <Section title="로또 1등과 하늘의 별 따기">
          <p className="text-white/85">
            맨눈으로 보이는 별은 온 하늘에 약 9천 개입니다. 그중 하나를 콕 집어
            맞힐 확률은 약 1/9,000이고, 로또 1등(45개 중 6개)은
            1/8,145,060입니다. 로또 1등이 약 900배 더 어렵습니다.
          </p>
        </Section>

        <Section title="당첨자 확인">
          <ol className="list-decimal space-y-2 pl-5 text-white/85">
            <li>
              확인하는 분이 지난 회차의 등수 줄에서 「당첨자 확인」을 누르고
              이름을 적으면, 그 등수 응모권 모두에 확인 요청이 갑니다.
            </li>
            <li>
              당첨자 기기가 요청을 띄우면 [확인]을 누르고 패스키로 서명합니다.
              모르는 분의 요청이면 거절합니다. 24시간 안에 답하면 됩니다.
            </li>
            <li>
              당첨자 화면에 별 세 개가 ①②③ 차례로 뜹니다. 당첨을 알렸던 그
              메신저·메일로 이 세 별 이름을 차례대로 보냅니다.
            </li>
            <li>
              확인하는 분은 받은 세 별을 하늘에서 차례로 누릅니다. 맞으면
              초록불이 켜지고, 세 번 틀리면 요청이 닫힙니다.
            </li>
          </ol>
          <p className="rounded-xl border border-amber-200/30 bg-amber-200/5 p-3 text-amber-50/90 text-sm">
            판정은 늘 확인하는 사람의 기기에서 합니다. 확인하는 분의 브라우저가
            장부의 응모권 열쇠로 서명을 직접 검사하고, 두 기기만 아는 임시
            열쇠로 별 세 개를 계산합니다. 당첨자 화면이나 그 스크린숏은 증거가
            아닙니다. 별 세 개는 요청을 전달하는 서버도 알 수 없어, 가운데서
            누가 끼어들어도 맞출 수 없습니다.
          </p>
        </Section>

        <Section title="별 45개">
          <ol className="flex flex-col gap-3">
            {SKY_STARS.map((s) => (
              <li key={s.n} className="flex items-start gap-3">
                <LottoBall n={s.n} size="sm" className="mt-0.5" />
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold">
                    {s.ko}{" "}
                    <span className="font-normal text-white/55 text-xs">
                      {s.con} {s.bayer} · {s.mag.toFixed(2)}등급 ·{" "}
                      {tempWord(s.k)}
                    </span>
                  </span>
                  <span className="text-sm text-white/75">{s.fact}</span>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="데이터 출처">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">
            <li>
              별 목록: Hoffleit &amp; Warren, The Bright Star Catalogue 5판
              (VizieR V/50). 서울에서 적위 -45° 위로 뜨는 별 가운데 밝은 순서로
              45개를 골랐습니다.
            </li>
            <li>
              별자리 선: Olaf Frohn,{" "}
              <a
                href="https://github.com/ofrohn/d3-celestial"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                d3-celestial
              </a>{" "}
              (BSD 라이선스)
            </li>
            <li>
              별의 한글 이름과 데이터 정리:{" "}
              <a
                href="https://star.byb.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                star.byb.kr
              </a>
            </li>
          </ul>
        </Section>

        <footer className="text-center text-[11px] text-white/40">
          <MadeWith />
        </footer>
      </article>
    </main>
  );
}
