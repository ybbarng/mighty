import type { Metadata, Viewport } from "next";

import { Seal } from "@/stardraw/astronaut/marks";
import { AgencyFooter } from "@/stardraw/components/AgencyFooter";
import { BureauDirector } from "@/stardraw/components/BureauDirector";
import { GalaxyMap, NearbyStars3D } from "@/stardraw/components/BureauSpace";
import {
  CANOPUS_SKY_SOURCE,
  CanopusChart,
  JejuSky,
} from "@/stardraw/components/CanopusSky";

export const metadata: Metadata = {
  title: { absolute: "카노푸스 우주국 · 하늘의 별 따기" },
  description:
    "하늘의 별 따기를 여는 카노푸스 우주국의 소개, 하는 일, 원칙과 연혁.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

/**
 * 카노푸스 우주국 소개(별 따기 footer의 기관 이름에서 들어온다). 우주국은 별 따기 안의 기관이고, 실제 운영 주체는
 * 개인정보처리방침에 적는다. 연혁 날짜는 docs/36과 커밋 기록에서 확인한 것만 쓴다
 */
export default function StardrawBureauPage() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article
        data-bureau
        className="mx-auto flex max-w-xl flex-col gap-6 break-keep text-sm text-white/80 leading-relaxed"
      >
        <a href="/stardraw" className="text-white/70 hover:text-white">
          ← 하늘의 별 따기
        </a>

        <header className="flex flex-col items-center gap-4 text-center">
          <Seal className="size-28" />
          <div className="flex flex-col gap-1">
            <h1 className="font-black text-3xl text-white tracking-tight">
              카노푸스 우주국
            </h1>
            <p className="text-white/60 text-xs tracking-[0.3em]">
              CANOPUS SPACE AGENCY
            </p>
          </div>
        </header>

        <Section title="기관 소개">
          <p>
            카노푸스 우주국은 밤하늘 관측 사업 「하늘의 별 따기」를 열고 그
            기록을 지키는 기관입니다. 서울 하늘에서 가장 밝은 별 45개 가운데
            이번에 빛날 별을 맞히는 관측에 누구나 참여할 수 있고, 그 결과는
            누구나 처음부터 다시 계산해 볼 수 있습니다.
          </p>
          <p>
            이름은 용골자리의 카노푸스에서 왔습니다. 시리우스 다음으로
            밤하늘에서 두 번째로 밝은 별입니다. 우리 옛사람들은 이 별을
            노인성이라 부르며 오래 사는 복을 빌었습니다. 남쪽 하늘 낮은 곳에
            떠서 서울에서는 지평선 아래에 머물고, 제주처럼 남쪽 땅에서 잠깐
            보입니다.
          </p>
        </Section>

        <Section title="국장 인사말">
          <blockquote className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <p>
              카노푸스 우주국을 찾아 주셔서 감사합니다. 우주국은 누구나 참여하고
              누구나 확인할 수 있는 관측 사업을 위해 세워졌습니다.
            </p>
            <p>
              당첨 번호는 우주국장도 정할 수 없습니다. 우주국은 하늘이 정한
              결과를 빠짐없이 기록하고 공개하는 일에 힘쓰겠습니다. 관측에 참여해
              주시는 우주인 여러분께 깊이 감사드립니다.
            </p>
            <footer className="text-right text-white/60 text-xs">
              제1대 카노푸스 우주국장
            </footer>
          </blockquote>
        </Section>

        <Section title="역대 국장">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-white/55">제1대</dt>
            <dd>카노푸스 우주국장 · 2026년 ~ 현재</dd>
          </dl>
          <BureauDirector />
        </Section>

        <Section title="하는 일">
          <ul className="flex flex-col gap-3">
            <Duty name="우주인 등록">
              관측에 참여할 우주인을 등록하고 우주인 등록증을 발급합니다.
              등록증은 우주인의 기기 안 패스키로 만들어지며, 우주국은 그 비밀
              열쇠를 받지 않습니다.
            </Duty>
            <Duty name="관측 사업">
              매시간 「하늘의 별 따기」 응모를 받고, 정시에 공개 난수로 이번에
              빛날 별 6개와 보너스 별 하나를 정합니다.
            </Duty>
            <Duty name="소속">
              우주국장이 부여하는 우주인 집단입니다. 성단과 성운이 있고,
              소속마다 정한 방법으로 확인한 우주인만 받습니다.
            </Duty>
            <Duty name="기록 공개">
              모든 응모와 추첨 기록을 공개 장부에 남기고, 바깥 시각 인증 기관과
              공개 저장소에도 사본을 둡니다. 누구나 검증 페이지와 검사 도구로
              처음부터 확인할 수 있습니다.
            </Duty>
          </ul>
        </Section>

        <Section title="카노푸스는 어디에 있나">
          <p>
            카노푸스는 남쪽 하늘의 용골자리에 있습니다. 시리우스의 남쪽,
            오리온자리 아래로 한참 내려간 곳입니다. 아래는 실제 별의 자리와
            밝기, 별빛 색으로 그린 성도입니다.
          </p>
          <CanopusChart />
          <p className="text-white/60 text-xs">
            점선은 그 위도에서 떠오르는 별의 남쪽 끝입니다. 카노푸스는 서울의
            선보다 0.3도 남쪽에 거의 붙어 있어 서울에서는 지평선에 겨우 닿고,
            마라도의 선 안쪽이라 제주 남쪽 바다 위로 떠오릅니다.
          </p>
        </Section>

        <Section title="제주에서 보는 카노푸스">
          <p>
            카노푸스가 가장 높이 뜨는 남중 순간에 우리나라 가장 남쪽 땅
            마라도에서 남쪽 바다를 바라본 하늘입니다. 같은 밤 서울의 남쪽 하늘과
            나란히 놓았습니다.
          </p>
          <JejuSky />
          <p>
            마라도에서 카노푸스는 남쪽 수평선 위 약 4도까지 떠오릅니다.
            서울에서는 가장 높이 떠도 지평선에 걸칠 뿐이라 산과 건물에 가려 보기
            어렵습니다.
          </p>
          <p>
            이렇게 낮은 별의 빛은 머리 위에서 올 때보다 공기를 열 배 넘게 길게
            지나옵니다. 그동안 푸른빛이 먼저 흩어져, 맑은 바닷가에서도 세 등급쯤
            어두워지고 주황빛으로 보입니다. 하늘에서 두 번째로 밝은 별이 수평선
            위에서는 2등성처럼 보이는 까닭입니다.
          </p>
        </Section>

        <Section title="노인성 이야기">
          <p>
            우리 옛사람들은 카노푸스를 남극노인성 또는 노인성이라 불렀습니다.
            사람의 수명을 맡은 별로 여겨, 이 별을 보면 오래 산다고 믿었습니다.
            조선 시대에는 해마다 노인성에 제사를 지냈습니다.
          </p>
          <p>
            한양에서는 거의 볼 수 없는 별이었지만 제주 남쪽 바닷가에서는 볼 수
            있었습니다. 서귀포 삼매봉 정상의 남성정은 지금도 노인성을 바라보는
            곳으로 알려져 있습니다.
          </p>
          <p>
            우주국은 이 별의 이름을 씁니다. 보기 어렵지만 오래도록 같은 자리에서
            빛나는 별처럼, 우주국도 관측 기록을 오래도록 공정하게 지키겠다는
            뜻입니다.
          </p>
        </Section>

        <Section title="우주 속 카노푸스">
          <p>
            카노푸스는 태양에서 약 310광년 떨어진, 우리 은하 오리온 팔 안의
            별입니다. 우주인 등록증 주소의 "우리 은하 › 오리온 팔"과 같은
            곳입니다.
          </p>
          <GalaxyMap />
          <NearbyStars3D />
        </Section>

        <Section title="원칙">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>당첨 번호는 하늘이 정하고, 우주국은 기록할 뿐입니다.</li>
            <li>
              우주국도 우주인이 누구인지 모릅니다. 등록증과 소속은 이름이나
              이메일과 이어지지 않습니다.
            </li>
            <li>
              우주국이 남기는 기록은 모두 공개하고, 한 번 남긴 기록은 고치지
              않습니다.
            </li>
            <li>우주국의 말을 믿지 않아도 결과를 확인할 수 있게 합니다.</li>
          </ol>
        </Section>

        <Section title="연혁">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 tabular-nums">
            <dt className="text-white/55">2026.</dt>
            <dd>카노푸스 우주국 설립. 제1대 국장 취임.</dd>
            <dt className="text-white/55">2026. 10. 29.</dt>
            <dd>관측 사업 설계안 마련.</dd>
            <dt className="text-white/55">2026. 10. 30.</dt>
            <dd>시험 관측 시작. 우주인 등록과 등록증 발급 시작.</dd>
            <dt className="text-white/55">2026. 10. 31.</dt>
            <dd>소속 제도 시작. 첫 소속 벌집 성단.</dd>
            <dt className="text-white/55">예정</dt>
            <dd>정식 개국. 매시간 관측 사업 시작.</dd>
          </dl>
        </Section>

        <p data-bureau-sources className="text-[11px] text-white/45">
          출처: {CANOPUS_SKY_SOURCE} 별 위치는 J2000 좌표로, 남중 고도는 위도와
          적위로, 대기 굴절은 Sæmundsson 식, 대기 질량은 Kasten과 Young의 식,
          소광 계수는 맑은 바닷가의 흔한 값(0.25등급)으로 계산했습니다. 별까지의
          거리는 히파르코스 새 처리 시차(van Leeuwen 2007, VizieR I/311), 은하의
          크기와 태양의 자리는 GRAVITY 협력단(2019)과 공개 연구를 따랐고, 은하
          그림은 직접 그린 도식입니다.
        </p>

        <nav
          aria-label="관련 문서"
          className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-white/60"
        >
          <a href="/stardraw/about" className="hover:text-white">
            설명
          </a>
          <a href="/stardraw/verify" className="hover:text-white">
            검증
          </a>
          <a href="/stardraw/learn" className="hover:text-white">
            보안 배우기
          </a>
          <a href="/stardraw/privacy" className="hover:text-white">
            개인정보처리방침
          </a>
        </nav>

        <footer className="pt-2 text-center text-[11px] text-white/40">
          <AgencyFooter />
        </footer>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold text-base text-white">{title}</h2>
      {children}
    </section>
  );
}

function Duty({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-semibold text-amber-100">{name}</span>
      <span>{children}</span>
    </li>
  );
}
