import type { Metadata, Viewport } from "next";

import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import {
  KeyHoldingExplained,
  PasskeyFaq,
} from "@/stardraw/components/PasskeyHelp";
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
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
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
          <p className="text-amber-100/90" data-agency>
            하늘의 별 따기는 카노푸스 우주국이 정해진 시각마다 여는 공개
            추첨입니다. 당첨 번호는 하늘이 정하고, 우주국은 기록할 뿐입니다.
            우주국장에게도 당첨 번호를 고르거나, 지난 기록을 고치거나, 남의
            등록증으로 응모할 권한이 없습니다. 우주국은 처음부터 그렇게
            세워졌습니다.
          </p>
          <details className="text-sm text-white/70">
            <summary className="cursor-pointer text-white/80">
              왜 카노푸스인가요?
            </summary>
            <p className="mt-2">
              카노푸스는 밤하늘에서 두 번째로 밝은 별이지만, 서울에서는 지평선
              위로 오르지 않아 우리 별 45개 목록에 없습니다. 우리나라에서는
              노인성이라 불렀고, 이 별을 보면 오래 산다고 여겼습니다. 제주 남쪽
              하늘에서나 아주 낮게 보이는 귀한 별입니다. 매리너 4호와 보이저
              같은 탐사선은 방향을 잡는 기준 별로 카노푸스를 썼습니다. 우주국이
              이 별의 이름을 쓰는 까닭입니다.
            </p>
          </details>
          <p className="text-white/75">
            로또 1등과 하늘의 별 따기, 어느 게 더 쉬울까요? 서울 하늘에서 가장
            밝은 별 45개를 준비했습니다. 그중 이번에 빛날 별 6개를 골라 보세요.
            추첨은 매시간 진행합니다.
          </p>
          <a
            href="/stardraw/demo"
            className="self-start rounded-xl border border-amber-200/40 px-4 py-2 text-amber-100 text-sm hover:bg-amber-200/10"
          >
            데모에서 응모부터 당첨자 확인까지 해 보기
          </a>
          <a
            href="/stardraw/learn"
            className="self-start text-amber-100/90 text-sm underline underline-offset-2"
          >
            어떻게 속일 수 없게 만들었나요? 보안 배우기
          </a>
        </header>

        <Section title="게임 방법">
          <ol className="list-decimal space-y-2 pl-5 text-white/85">
            <li>
              회차마다 별 6개를 고릅니다. 네모 하늘에서 별을 누르거나, 아래 1~45
              칸에서 번호를 눌러도 같습니다. 자동·남은 칸 자동도 됩니다.
            </li>
            <li>
              응모는 패스키로 합니다. 처음 우주인으로 등록할 때 Face
              ID·지문·화면 잠금으로 패스키가 만들어지고, 응모할 때마다 그
              패스키로 응모권에 서명합니다. 우주국은 우주인의 이름·이메일을 묻지
              않고, 한 패스키는 회차마다 한 장만 낼 수 있습니다. 먼저 등록한
              우주인이라고 확률이 높아지지는 않습니다.
            </li>
            <li>
              회차는 1시간입니다. 매시 55분에 응모를 마감하고, 5분 뒤 정각에
              공개 난수로 당첨 번호 6개와 보너스 1개를 정합니다. 추첨기에서 공이
              하나씩 나오며 하늘의 그 별이 켜집니다.
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
              번호는 별 오른쪽 위에 그 별의 빛깔로 적고, 고른 번호 공은 그
              빛깔을 진하게 칠합니다. 표면 온도가 높은 순서로 푸른 별, 흰 별,
              노란빛 별, 주황빛 별, 붉은 별입니다.
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
            눈에 보이는 별은 온 하늘에 약 9천 개입니다. 그중 하나를 콕 집어 맞힐
            확률은 약 1/9,000이고, 로또 1등(45개 중 6개)은 1/8,145,060입니다.
            로또 1등이 약 900배 더 어렵습니다. 우주국은 별 따기를 권합니다.
          </p>
        </Section>

        <Section title="당첨자 확인">
          <ol className="list-decimal space-y-2 pl-5 text-white/85">
            <li>
              당첨되면 내 응모에 카노푸스 우주국 당첨 안내가 뜹니다. 서버가 보낸
              말이 아니라 내 기기가 공개 장부로 계산한 안내입니다.
            </li>
            <li>
              「확인 링크 만들기」를 누르고 우주인 등록증으로 서명하면, 한 번만
              쓰는 링크가 생깁니다. 당첨을 알리고 싶은 사람에게 메신저로
              보냅니다. 링크는 응모권 주인만 만들 수 있고 7일 뒤 닫힙니다.
            </li>
            <li>
              받은 사람이 링크를 열어 「확인 시작」을 누르면 내 기기에 확인
              요청이 옵니다. 「등록증으로 승인」하면 별 세 개가 ①②③ 차례로
              뜹니다. 24시간 안에 승인하면 됩니다.
            </li>
            <li>
              링크를 보낸 그 메신저·메일로 세 별 이름을 차례대로 보냅니다. 받은
              사람이 하늘에서 차례로 누르면 초록불이 켜지고, 세 번 틀리면
              닫힙니다. 다시 하려면 새 링크를 보냅니다.
            </li>
          </ol>
          <p className="rounded-xl border border-amber-200/30 bg-amber-200/5 p-3 text-amber-50/90 text-sm">
            판정은 늘 확인하는 사람의 기기에서 합니다. 확인하는 분의 브라우저가
            장부의 응모권 열쇠로 서명을 직접 검사하고, 두 기기만 아는 임시
            열쇠로 별 세 개를 계산합니다. 당첨자 화면이나 그 스크린숏은 증거가
            아닙니다. 별 세 개는 요청을 전달하는 서버도 알 수 없어, 가운데서
            누가 끼어들어도 맞출 수 없습니다. 링크는 한 번 쓰면 닫혀, 누가
            링크를 가로채 먼저 쓰면 받은 사람 화면에 "이미 사용된 링크"가 떠서
            알 수 있습니다.
          </p>
        </Section>

        <Section title="우주국장도 장부로만 일합니다" id="director">
          <p className="text-white/85">
            소속을 더하거나 정식 시작을 예약하는 운영 일은 우주국장이 국장
            패스키로 서명한 기록으로만 합니다. 그 기록은 공개 장부에 실리고
            3회차가 지난 뒤에야 효력이 생겨, 그사이 누구나 볼 수 있습니다. 서버
            데이터를 몰래 고치는 길은 없습니다. 국장 열쇠가 언제 지정되고
            바뀌었는지도 장부에 남아{" "}
            <a href="/stardraw/verify#check" className="underline">
              검증하기
            </a>
            에서 볼 수 있습니다. 국장 패스키는 응모용 패스키와 따로라,
            우주국장의 응모도 장부에서 남과 구별되지 않습니다.
          </p>
        </Section>

        <Section title="패스키와 보안" id="passkey">
          <p className="text-white/85">
            하늘의 별 따기는 패스키로만 응모합니다. 비밀번호보다 안전하고 쓰기도
            쉬워서, 이 게임으로 패스키에 익숙해지면 좋겠습니다. 처음 한 번
            패스키를 만들고(얼굴·지문 확인 한 번), 그 뒤 응모할 때마다 그
            패스키로 서명합니다(확인 한 번). 사람들이 많이 묻는 것을 모았습니다.
          </p>
          <KeyHoldingExplained />
          <PasskeyFaq />
        </Section>

        <Section title="우주국이 보관하는 것" id="privacy">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-white/85">
            <li>
              저장하는 것: 공개 열쇠, 패스키 번호, 등록 회차. 응모권은 공개
              장부에 남습니다.
            </li>
            <li>받지 않는 것: 이름, 이메일, 전화번호.</li>
            <li>
              응모 수 제한에 쓰는 IP는 앞부분(IPv4는 앞 세 칸, IPv6는 앞 세
              묶음)만 메모리에서 세고 저장하지 않습니다.
            </li>
            <li>
              장부는 고칠 수 없어 지울 수도 없습니다. 대신 장부에는 이름 없이
              공개 열쇠만 남습니다.
            </li>
            <li>
              응모가 서로 이어져 보이는 게 싫으면 새 우주인으로 다시 등록하세요.
              그때부터 낸 응모는 앞의 것과 이어지지 않습니다.
            </li>
          </ul>
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

        <div className="flex flex-col gap-2">
          <a
            href="/stardraw/learn"
            className="self-start text-sm text-amber-100/90 underline underline-offset-2"
          >
            보안 기술을 직접 해 보며 배우기: 서명, 패스키, 작업 증명, 머클 나무,
            시각 인증, drand, 사슬, 공격해 보기
          </a>
          <a
            href="/stardraw/verify"
            className="self-start text-sm text-amber-100/90 underline underline-offset-2"
          >
            직접 검증하려면: 장부 파일, 계산 규칙, 시험 값, 장부 전체 검사
          </a>
        </div>

        <footer className="text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </article>
    </main>
  );
}
