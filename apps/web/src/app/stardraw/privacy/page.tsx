import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { absolute: "개인정보처리방침 · 하늘의 별 따기" },
};

export const viewport: Viewport = { themeColor: "#070d19" };

/**
 * 하늘의 별 따기 개인정보처리방침(docs/36 11-13). 구글 로그인 동의 화면의 브랜딩에 이 주소를 넣는다.
 * 받는 것은 "그 기관 사람이고 이번 기간에 처음 받는다"를 확인하는 데 필요한 것뿐이다
 */
export default function StardrawPrivacyPage() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-xl flex-col gap-5 break-keep text-sm text-white/80 leading-relaxed">
        <a href="/stardraw" className="text-white/70 hover:text-white">
          ← 하늘의 별 따기
        </a>
        <h1 className="font-bold text-2xl text-white">개인정보처리방침</h1>
        <p>
          하늘의 별 따기(game.byb.kr/stardraw)가 무엇을 받고 어디에 쓰는지
          적습니다. 2026년 10월 31일부터 적용합니다.
        </p>

        <h2 className="font-bold text-base text-white">
          소속 받기(구글 로그인)
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            받는 것: 구글이 보내 주는 로그인 결과 중 이메일 주소, 이메일 확인
            여부, 기관 도메인. 이름·사진·연락처는 받지 않습니다.
          </li>
          <li>
            쓰는 곳: 그 기관 사람인지, 이번 자격 기간에 처음 받는지 확인하는
            데만 씁니다.
          </li>
          <li>
            남기는 것: 이메일을 서버 비밀 값으로 바꾼 값(HMAC)과 자격 기간
            번호만 남깁니다. 이메일 원문과 받은 시각은 남기지 않습니다. 자격
            기간 동안 보관합니다.
          </li>
          <li>
            도장은 가린 채로 찍기(블라인드 서명) 때문에, 우주국도 어느 소속
            번호가 누구의 것인지 모릅니다. 응모 기록은 계정과 이어지지 않습니다.
          </li>
        </ul>

        <h2 className="font-bold text-base text-white">응모와 공개 장부</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            응모권(고른 별, 우주인 공개 열쇠, 붙인 소속 번호)과 우주인 등록은
            공개 장부에 남아 누구나 볼 수 있습니다. 이름·이메일은 없습니다.
          </li>
          <li>
            별 따기 서버는 접속 주소(IP)를 지나친 요청을 막는 데만 잠깐 쓰고
            저장하지 않습니다.
          </li>
          <li>
            패스키의 비밀 열쇠는 기기(인증기) 밖으로 나오지 않습니다. 소속의
            복구 코드는 이 기기 저장소에만 둡니다.
          </li>
        </ul>

        <h2 className="font-bold text-base text-white">방문 통계</h2>
        <p>사이트 방문 수는 쿠키를 쓰지 않는 통계 도구(Umami)로 셉니다.</p>

        <h2 className="font-bold text-base text-white">문의</h2>
        <p>
          <a
            href="https://github.com/ybbarng/mighty/issues"
            className="underline hover:text-white"
          >
            github.com/ybbarng/mighty/issues
          </a>
        </p>
      </article>
    </main>
  );
}
