"use client";

import { type ReactNode, useEffect, useState } from "react";
import { MadeWith } from "@/components/brand/MadeWith";
import { SuitText } from "@/components/SuitText";
import {
  ChatRoutingDemo,
  CommitRevealDemo,
  HostSignatureDemo,
  KeyProofDemo,
  MentalPokerDemo,
  ReplayAuditDemo,
  ShuffleProofDemo,
  ViewFilterDemo,
} from "@/components/security/demos";
import { cn } from "@/lib/cn";

import { Quiz, type QuizItem } from "./Quiz";
import {
  CutChooseGame,
  ElGamalToy,
  FiatShamirToy,
  LockToy,
  OrProofToy,
  PolyCheckToy,
  QrLeakToy,
  RenegeToy,
  ZkToy,
} from "./toys";

interface Lesson {
  id: string;
  title: string;
  /** 한 줄 요약(목차에 보인다) */
  hook: string;
  body: ReactNode;
  demo: ReactNode;
  points: string[];
  quiz: QuizItem[];
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-white/85">{children}</p>;
}

const LESSONS: Lesson[] = [
  {
    id: "view",
    title: "서버 없는 게임에서 누가 무엇을 보나",
    hook: "방장 기기가 엔진을 돌린다. 참가자에게는 자기 자리에서 보이는 것만 보낸다",
    body: (
      <>
        <P>
          이 게임에는 게임 서버가 없습니다. 방장의 브라우저가 규칙 엔진을
          돌리고, 친구들의 브라우저는 WebRTC로 방장과 바로 이어집니다. 그러면
          가장 먼저 걱정할 것은 "남의 패가 내 기기로 오지 않는가"입니다.
        </P>
        <P>
          방장 기기는 참가자마다 그 자리에서 보이는 화면만 만들어 보냅니다(내
          손패, 바닥에 나온 카드, 남은 장수). 개발자 도구로 받은 데이터를 열어
          봐도 남의 패는 없습니다.
        </P>
      </>
    ),
    demo: <ViewFilterDemo />,
    points: [
      "보내지 않은 정보는 어떤 프로그램 조작으로도 볼 수 없다",
      "하지만 방장 기기 자신은 엔진을 돌리므로 모든 패를 안다 → 뒤에서 멘탈 포커로 푼다",
    ],
    quiz: [
      {
        q: "참가자가 브라우저 개발자 도구로 받은 메시지를 모두 열어 보면?",
        options: [
          "남의 패가 보인다",
          "자기 자리에서 보이는 정보만 있다",
          "암호문이라 아무것도 못 본다",
        ],
        answer: 1,
        why: "방장이 자리마다 보이는 화면만 만들어 보내기 때문이다.",
      },
    ],
  },
  {
    id: "commit",
    title: "함께 정하는 시드: 약속하고 공개하기",
    hook: "해시로 먼저 약속하면, 남의 값을 보고 내 값을 바꿀 수 없다",
    body: (
      <>
        <P>
          컴퓨터 자리의 수나 섞기에 쓰는 무작위 값을 방장 혼자 정하면 방장이
          원하는 값을 고를 수 있습니다. 그래서 모두가 비밀 값을 하나씩 내고,
          그것을 섞어 시드를 만듭니다.
        </P>
        <P>
          문제는 "마지막에 내는 사람"입니다. 남의 값을 다 본 뒤 내 값을 고르면
          결과를 조종할 수 있습니다. 그래서 먼저 비밀 값의 해시(지문)만
          냅니다(약속, commit). 모두의 약속이 모인 뒤 원래 값을
          공개하고(reveal), 해시가 약속과 맞는지 봅니다. 해시는 거꾸로 풀 수
          없고, 같은 해시가 나오는 다른 값을 찾을 수도 없습니다.
        </P>
      </>
    ),
    demo: <CommitRevealDemo />,
    points: [
      "약속(해시)을 먼저, 값은 나중에 — 남의 값을 보고 내 값을 바꿀 수 없다",
      "약속과 다른 값을 내면 바로 드러난다",
    ],
    quiz: [
      {
        q: "비밀 값을 곧바로 공개하지 않고 해시를 먼저 내는 까닭은?",
        options: [
          "값을 짧게 만들려고",
          "마지막 사람이 남의 값을 보고 자기 값을 고르지 못하게",
          "네트워크를 아끼려고",
        ],
        answer: 1,
        why: "약속을 먼저 걸어 두면 나중에 값을 바꿀 수 없다.",
      },
    ],
  },
  {
    id: "replay",
    title: "다시 계산해 확인하기",
    hook: "같은 규칙·같은 시드·같은 행동이면 결과가 같다. 모두가 판을 다시 돌려 본다",
    body: (
      <>
        <P>
          엔진은 순수 함수입니다. 같은 시작 조건과 같은 행동 기록을 넣으면
          언제나 같은 결과가 나옵니다. 그래서 판이 끝나면 방장이 기록 전체를
          공개하고, 모든 참가자가 자기 기기에서 처음부터 다시 돌려 봅니다.
        </P>
        <P>
          방장이 중간에 점수를 바꿨거나, 내가 낸 카드를 다른 카드로 바꿔
          넣었거나, 컴퓨터 자리를 몰래 조종했다면 다시 돌린 결과와 어긋나서
          드러납니다.
        </P>
      </>
    ),
    demo: <ReplayAuditDemo />,
    points: [
      "방장은 진행을 맡지만 결과를 지어낼 수는 없다",
      "기록 속 내 행동이 내가 보낸 것인지, 받은 화면이 다시 계산한 화면인지도 맞춰 본다",
    ],
    quiz: [
      {
        q: "방장이 몰래 컴퓨터 자리의 카드를 바꿔 냈다. 어떻게 드러나나?",
        options: [
          "드러나지 않는다",
          "판 끝에 같은 컴퓨터·같은 난수로 다시 계산하면 다른 수가 나온다",
          "다른 참가자가 화면을 보고 눈치챈다",
        ],
        answer: 1,
        why: "컴퓨터 수도 결정적이라 모두가 다시 계산할 수 있다.",
      },
    ],
  },
  {
    id: "identity",
    title: "서명과 지문: 진짜 방장인가",
    hook: "초대 링크에 방장 공개 열쇠의 지문을 넣고, 방장은 들어올 때마다 서명한다",
    body: (
      <>
        <P>
          방에 들어갈 때 상대가 정말 링크를 보낸 방장인지 어떻게 알까요? 방장은
          처음에 서명 열쇠를 만들고, 공개 열쇠의 지문(해시)을 초대 링크에
          넣습니다. 참가자가 들어오면 방장은 "이 연결에 이 자리를 준다"에
          서명하고, 참가자는 서명과 지문을 확인합니다.
        </P>
        <P>
          서명에는 연결 인증서(DTLS)의 지문도 들어갑니다. 연결을 이어 주는 신호
          릴레이가 가운데 끼어들면 인증서가 달라져 서명이 맞지 않습니다.
        </P>
      </>
    ),
    demo: <HostSignatureDemo />,
    points: [
      "지문은 링크로, 서명은 연결로 — 둘이 맞아야 방장으로 믿는다",
      "가운데 끼어든 중간자는 연결 인증서가 달라 들킨다",
    ],
    quiz: [
      {
        q: "가짜 방장이 자기 열쇠로 서명하면?",
        options: [
          "서명이 맞으니 믿는다",
          "공개 열쇠의 지문이 링크의 지문과 달라 믿지 않는다",
          "아무 일도 일어나지 않는다",
        ],
        answer: 1,
        why: "지문은 공개 열쇠의 해시라 다른 열쇠로는 같은 지문을 만들 수 없다.",
      },
    ],
  },
  {
    id: "lock",
    title: "교환 가능한 자물쇠(SRA)",
    hook: "카드를 수로 바꾸고 거듭제곱으로 잠근다. 잠근 순서와 상관없이 풀린다",
    body: (
      <>
        <P>
          이제 방장도 남의 패를 모르게 하는 멘탈 포커의 바탕입니다. 카드를 수
          m으로 나타내고, 열쇠 k로 잠그면 m<sup>k</sup> mod p입니다(p는 큰
          소수). 풀 때는 k의 역수 지수로 한 번 더 거듭제곱합니다.
        </P>
        <P>
          지수끼리 곱해지므로 철수가 잠근 위에 영희가 잠가도, 누가 먼저 풀든
          원래 카드로 돌아옵니다. 자물쇠 두 개를 겹쳐 채우고 아무 순서로나 여는
          셈입니다. 아래는 p = 23이라는 작은 수로 해 보는 것이고, 게임은
          2048비트 소수를 씁니다.
        </P>
      </>
    ),
    demo: <LockToy />,
    points: [
      "m^(a·b) = m^(b·a) — 잠그고 푸는 순서가 자유롭다",
      "모두가 자기 열쇠로 잠근 카드는 모두가 풀어 줘야 열린다",
    ],
    quiz: [
      {
        q: "철수(a)와 영희(b)가 차례로 잠근 카드를 영희가 먼저 풀면?",
        options: [
          "풀 수 없다(잠근 반대 순서로만 풀린다)",
          "철수 자물쇠만 남은 상태가 된다",
          "카드가 망가진다",
        ],
        answer: 1,
        why: "교환 법칙 덕분에 순서와 상관없이 하나씩 풀린다.",
      },
    ],
  },
  {
    id: "qr",
    title: "잠가도 새는 1비트",
    hook: "제곱수인지 아닌지는 잠가도 그대로 남는다. 그래서 카드를 모두 제곱수로",
    body: (
      <>
        <P>
          SRA에는 잘 알려진 약점이 있습니다. 어떤 수가 제곱수(이차잉여)인지는
          아무 열쇠로 잠가도 바뀌지 않습니다. 오일러 판정 x<sup>(p−1)/2</sup>로
          누구나 계산할 수 있습니다. 카드 일부를 제곱수로, 일부를 아닌 수로
          나타내면 잠근 뒤에도 그 1비트가 샙니다(예: 빨강이냐 검정이냐).
        </P>
        <P>
          게임은 카드 번호 i를 (i+2)<sup>2</sup>로 나타내 모든 카드를 제곱수로
          만듭니다. 그러면 판정 값이 늘 같아 아무것도 알 수 없습니다.
        </P>
      </>
    ),
    demo: <QrLeakToy />,
    points: [
      "암호를 직접 짤 때는 '잠가도 남는 성질'을 꼭 따져야 한다",
      "모든 카드를 같은 부분군(제곱수)에 두면 새는 정보가 없다",
    ],
    quiz: [
      {
        q: "잘못된 방식에서 상대가 빨강 카드를 알아챈 방법은?",
        options: [
          "열쇠를 훔쳤다",
          "잠근 값이 제곱수인지 계산했다(잠가도 바뀌지 않는 성질)",
          "카드를 섞는 순서를 외웠다",
        ],
        answer: 1,
        why: "x^11 mod 23이 1인지 22인지는 거듭제곱으로 잠가도 그대로다.",
      },
    ],
  },
  {
    id: "mental-poker",
    title: "멘탈 포커 한 판",
    hook: "모두가 잠그고 섞고, 자리마다 다시 잠그고, 받는 사람만 마지막 자물쇠를 연다",
    body: (
      <>
        <P>
          1. 섞기: 각자 차례로 덱 전체를 자기 열쇠로 잠그고 순서를 섞어
          넘깁니다. 모두가 섞었으니 누구도 순서를 모릅니다. 2. 자리마다 다시
          잠그기: 각자 섞기 열쇠를 풀고 자리마다 다른 열쇠로 잠급니다. 3. 나눠
          주기: 자리 s를 철수에게 줄 때 철수를 뺀 모두가 s의 열쇠를 공개합니다.
          철수만 마지막 자물쇠를 풀어 봅니다. 4. 내기: 낸 사람이 그 자리 열쇠를
          공개하면 모두가 그 카드를 봅니다.
        </P>
        <P>
          아래에서 "방장" 화면으로 봐도 남의 카드는 "열 수 없음"입니다. 다른
          카드라고 속여 내면 모두가 직접 열어 보니 바로 들킵니다.
        </P>
      </>
    ),
    demo: <MentalPokerDemo />,
    points: [
      "방장 기기도 남의 패를 모른다(컴퓨터 자리 패는 방장 기기가 연다)",
      "카드를 낼 때는 모두가 직접 열어 확인한다",
    ],
    quiz: [
      {
        q: "자리마다 '다른' 열쇠로 다시 잠그는 까닭은?",
        options: [
          "계산을 빠르게 하려고",
          "한 자리 열쇠를 공개해도 다른 자리 카드는 안전하게",
          "카드를 더 잘 섞으려고",
        ],
        answer: 1,
        why: "같은 열쇠를 쓰면 한 장을 열 때 모두 열린다.",
      },
    ],
  },
  {
    id: "zk",
    title: "영지식 증명 맛보기",
    hook: "비밀을 보이지 않고 '같은 비밀로 이어져 있다'만 증명한다",
    body: (
      <>
        <P>
          공개한 열쇠가 정말 잠글 때 쓴 열쇠인지 어떻게 증명할까요? 열쇠를
          보이면 안 되는 경우도 있습니다. Chaum–Pedersen 증명은 "V = g
          <sup>u</sup>와 B = A<sup>u</sup>가 같은 비밀 u로 이어져 있다"를 u를
          보이지 않고 증명합니다.
        </P>
        <P>
          증명하는 사람이 먼저 a, b를 내고, 확인하는 사람이 무작위 도전값 c를
          고르고, 증명하는 사람이 z를 냅니다. 같은 지수가 아니면 c를 미리 알지
          않는 한 두 확인 식을 함께 맞출 수 없습니다. 반대로 c를 미리 알면 비밀
          없이도 그럴듯한 기록을 만들 수 있는데, 바로 그 점 때문에 기록에서 u에
          대해 아무것도 알 수 없습니다(영지식).
        </P>
      </>
    ),
    demo: <ZkToy />,
    points: [
      "도전값을 미리 알 수 없어야 증명이 의미가 있다",
      "증명 기록은 비밀 없이도 흉내 낼 수 있다 → 비밀이 새지 않는다",
    ],
    quiz: [
      {
        q: "속이는 사람이 통과하려면 무엇을 알아야 하나?",
        options: ["비밀 u", "확인하는 사람이 고를 도전값 c를 미리", "g의 값"],
        answer: 1,
        why: "c를 미리 알면 z를 먼저 고르고 a, b를 거꾸로 맞출 수 있다.",
      },
    ],
  },
  {
    id: "key-proof",
    title: "열쇠 증명: 틀린 열쇠를 낸 사람 짚기",
    hook: "다시 잠글 때 V = g^u를 걸고, 열쇠를 공개할 때 증명을 붙인다",
    body: (
      <>
        <P>
          나눠 줄 때 남의 자리에 틀린 열쇠를 주면 카드가 열리지 않습니다.
          예전에는 판이 멈추기만 하고 누가 틀렸는지 몰랐습니다. 이제 자리마다
          다시 잠글 때 V = g<sup>u</sup>를 함께 내고, 열쇠를 공개할 때 앞의
          영지식 증명을 붙입니다. 카드가 열리지 않으면 증명을 확인해 그 사람을
          짚습니다.
        </P>
        <P>
          열쇠 여러 개는 해시로 정한 가중치를 곱해 한 증명으로 묶습니다.
          가중치가 없으면 틀린 열쇠 둘이 서로 지워지게 고를 수 있기 때문입니다.
        </P>
      </>
    ),
    demo: <KeyProofDemo />,
    points: [
      "평소에는 확인하지 않고, 카드가 안 열릴 때만 확인한다(빠르다)",
      "2048비트에서 열쇠 53개 증명 0.1초, 확인 0.15초",
    ],
    quiz: [
      {
        q: "열쇠 여러 개를 한 증명으로 묶을 때 가중치를 해시로 정하는 까닭은?",
        options: [
          "증명을 짧게 하려고",
          "틀린 열쇠끼리 서로 지워져 곱이 맞아 버리지 않게",
          "열쇠를 숨기려고",
        ],
        answer: 1,
        why: "가중치를 미리 알 수 없으면 틀린 열쇠를 맞춰 지울 수 없다.",
      },
    ],
  },
  {
    id: "cut-and-choose",
    title: "섞기 증명: cut-and-choose",
    hook: "중간 덱을 하나 더 만들고, 상대가 정한 한쪽만 보인다. 16번이면 1/65,536",
    body: (
      <>
        <P>
          섞을 때 카드를 바꿔치기하거나 복제하면(그 카드를 엿보려고) 열쇠
          증명으로는 못 잡습니다. 순서가 섞여 카드끼리 짝이 없으니까요. 그래서
          섞은 사람이 "넘긴 덱은 받은 덱을 같은 열쇠로 잠그고 순서만 바꾼 것"을
          증명합니다.
        </P>
        <P>
          중간 덱 Z를 하나 더 만들어 먼저 내고, 도전이 0이면 받은 덱 → Z를,
          1이면 Z → 넘긴 덱을 보입니다. 둘 다 보이면 열쇠와 순서가 드러나지만
          한쪽만 보이니 아무것도 새지 않습니다. 속인 덱은 둘 중 하나가 틀리므로
          한 번에 ½로 들킵니다. 아래 게임에서 직접 버텨 보세요.
        </P>
      </>
    ),
    demo: (
      <>
        <CutChooseGame />
        <ShuffleProofDemo />
      </>
    ),
    points: [
      "한 번에 ½, k번이면 (½)^k — 게임은 16번(1/65,536)",
      "증명은 섞은 덱을 넘긴 뒤 따로 보내 판이 늦어지지 않는다",
    ],
    quiz: [
      {
        q: "속인 덱으로 16번을 모두 버틸 확률은?",
        options: ["1/16", "1/256", "1/65,536"],
        answer: 2,
        why: "매번 ½로 맞혀야 하므로 (½)^16이다.",
      },
    ],
  },
  {
    id: "fiat-shamir",
    title: "도전값은 누가 정하나",
    hook: "해시로 정하면 다시 시도할 수 있다. 모두가 함께 정하면 기회는 한 번",
    body: (
      <>
        <P>
          도전값을 상대와 주고받지 않고 해시로 정하는 방법(Fiat–Shamir)은
          편리하지만, 속이는 사람이 약속을 바꿔 가며 해시를 계속 돌려 원하는
          도전값이 나올 때까지 시도할 수 있습니다. 아래에서 직접 돌려 보세요.
        </P>
        <P>
          이 게임은 섞을 때 각자 비밀 값의 해시를 걸어 두고, 모두의 약속이 모인
          뒤에 비밀 값을 공개해 함께 도전값을 정합니다(2강의 약속하고 공개하기와
          같은 생각). 한 사람이라도 정직하면 아무도 미리 알 수 없습니다. 비밀
          값을 공개하지 않고 버티면, 조작이 드러날 때 그 사람을 짚습니다.
        </P>
      </>
    ),
    demo: <FiatShamirToy />,
    points: [
      "해시로 정하면 k를 40~64로 크게 해야 한다",
      "함께 정하면 k = 16이면 충분하다",
    ],
    quiz: [
      {
        q: "도전값을 해시로만 정할 때의 위험은?",
        options: [
          "해시가 느리다",
          "속이는 사람이 약속을 바꿔 가며 원하는 도전값을 노릴 수 있다",
          "도전값이 너무 크다",
        ],
        answer: 1,
        why: "해시는 누구나 계산할 수 있어 몰래 여러 번 시도할 수 있다.",
      },
    ],
  },
  {
    id: "renege",
    title: "사후에 잡는 부정과 알림 규칙",
    hook: "무늬 안 따르기는 숨긴 카드가 드러나는 순간 잡는다. 남의 알림은 주장일 뿐",
    body: (
      <>
        <P>
          남의 손패를 모르니 "따라 낼 무늬가 정말 없었나"를 그 자리에서 확인할
          수는 없습니다. 오프라인 마이티도 같습니다. 대신 그 무늬 카드가 나중에
          공개되는 순간, 그때도 손에 있었다는 것이 확실해져 바로 짚습니다.
        </P>
        <P>
          누가 부정을 찾으면 그 사람의 기기 화면에 크게 뜨고 판이 멈춥니다. 다른
          사람이 보낸 알림은 그 사람의 주장으로 채팅에만 남깁니다. 거짓 알림으로
          남의 판을 멈추지 못하게 하려는 것입니다. 정직한 기기는 같은 공개
          정보로 같은 계산을 하므로 모두 스스로 같은 결과를 찾습니다.
        </P>
      </>
    ),
    demo: (
      <>
        <RenegeToy />
        <ChatRoutingDemo />
      </>
    ),
    points: [
      "그 자리에서 막으려면 '선 무늬가 없다'는 영지식 증명이 필요하다(다음 단계)",
      "내 기기가 직접 확인한 것만 판을 멈추는 근거로 쓴다",
    ],
    quiz: [
      {
        q: "다른 참가자가 '방장이 부정했다'고 알려 왔다. 내 화면은?",
        options: [
          "바로 판을 멈추고 방장을 짚는다",
          "그 사람의 주장으로 채팅에 남기고, 내 기기가 직접 확인한 것만 근거로 쓴다",
          "무시한다",
        ],
        answer: 1,
        why: "남의 알림을 그대로 믿으면 거짓 알림으로 판을 멈출 수 있다.",
      },
    ],
  },
  {
    id: "limits",
    title: "정리: 막는 것, 잡는 것, 못 막는 것",
    hook: "어떤 상대가 와도 못 속인다는 아니다. 한계를 아는 것이 보안의 시작",
    body: (
      <>
        <P>
          막는 것: 남의 패 엿보기(멘탈 포커), 방장 사칭과 중간자(서명·지문),
          시드·컴퓨터 수 조작(약속·다시 계산), 남의 이름으로 알림 지어내기.
        </P>
        <P>
          잡는 것: 틀린 열쇠(열쇠 증명), 섞기 조작(섞기 증명, 1/65,536로
          빠져나가도 판 끝에 드러남), 방장의 진행 조작(판마다 다시 계산), 무늬
          안 따르기·죽이기 거짓말·프렌드 숨기기(드러나는 순간).
        </P>
        <P>
          못 막는 것: 컴퓨터 자리 패는 방장 기기가 본다, 무늬 안 따르기는 사후에
          잡는다, 게임 밖에서 짜고 치기, 지는 판에서 나가 버리기(투표로 끝낼
          수만 있다), 방장의 채팅 조작.
        </P>
      </>
    ),
    demo: null,
    points: [
      "자세한 구조와 모의 침투 결과는 '어떻게 지켜지나요?' 페이지에",
      "다음 단계: 타원곡선 ElGamal + Bayer–Groth 섞기 증명, 선 무늬 없음 증명",
    ],
    quiz: [
      {
        q: "모르는 사람과 할 때 빈자리를 사람으로 채우라고 하는 까닭은?",
        options: [
          "컴퓨터가 약해서",
          "컴퓨터 자리 패는 방장 기기가 열어서 방장이 볼 수 있으니까",
          "서버가 없어서",
        ],
        answer: 1,
        why: "컴퓨터는 방장 기기에서 돌기 때문에 그 패도 방장 기기가 연다.",
      },
    ],
  },
];

/** 심화 학습: 아직 게임에 적용하지 않았지만 다음 단계로 배워 볼 만한 기법 */
const ADVANCED: Lesson[] = [
  {
    id: "elgamal",
    title: "타원곡선 ElGamal: 섞을 때마다 다시 감싸기",
    hook: "공동 공개 열쇠로 감싸고 섞을 때마다 다시 감싼다. 표준 멘탈 포커(Barnett–Smart)",
    body: (
      <>
        <P>
          이 게임의 SRA는 카드를 거듭제곱으로 잠급니다. 같은 열쇠로 잠그면 같은
          카드는 같은 값이 되므로, 섞을 때 카드끼리 짝이 이어지지 않게 하려면
          사람마다 새 열쇠로 잠가야 하고, 섞기를 증명할 때도 그 구조에 맞춘
          방법(cut-and-choose)을 써야 했습니다.
        </P>
        <P>
          표준적인 멘탈 포커(Barnett·Smart 2003)는 ElGamal을 씁니다. 모두의 비밀
          몫을 더한 공동 공개 열쇠 하나로 카드를 (g<sup>r</sup>, m·h
          <sup>r</sup>)로 감싸고, 섞을 때마다 무작위 값을 더해{" "}
          <b>다시 감쌉니다</b>. 그러면 같은 카드도 값이 완전히 바뀌어 짝을 찾을
          수 없습니다. 열 때는 각자 몫(c₁<sup>xᵢ</sup>)을 내고, 그 몫이 맞다는
          것은 8단원의 Chaum–Pedersen 증명으로 보입니다. 타원곡선 위에서 하면
          수가 256비트로 짧아 메시지도 작아집니다.
        </P>
      </>
    ),
    demo: <ElGamalToy />,
    points: [
      "다시 감싸기가 짝을 끊어 주므로 '감싸고 순서만 바꿨다'만 증명하면 된다",
      "적용하려면 잠그기·열쇠 공개·하트 넘기기·판 끝 확인을 모두 다시 짜야 한다(큰 작업, docs/15)",
      "참고: Barnett & Smart, Mental Poker Revisited(2003) · 구현체 geometryxyz/mental-poker, ziffle",
    ],
    quiz: [
      {
        q: "ElGamal에서 다시 감싸면 무엇이 좋아지나?",
        options: [
          "카드가 더 빨리 열린다",
          "같은 카드도 값이 바뀌어 섞기 전과 뒤의 짝을 찾을 수 없다",
          "열쇠가 필요 없어진다",
        ],
        answer: 1,
        why: "무작위 값이 더해져 같은 카드라도 매번 다른 값이 된다.",
      },
    ],
  },
  {
    id: "bayer-groth",
    title: "다항식으로 한 번에: Neff·Bayer–Groth 섞기 증명",
    hook: "두 목록이 순서만 다른지는 무작위 t 하나에서 Π(t − aᵢ)를 견주면 안다",
    body: (
      <>
        <P>
          cut-and-choose는 16번을 반복해 1/65,536까지 줄입니다. 더 강한 섞기
          증명은 수학 사실 하나에 기댑니다. 두 목록 A, B가 같은 수들을 순서만
          바꾼 것이라면 다항식 Π(x − aᵢ)와 Π(x − bᵢ)는 똑같습니다. 하나라도
          바뀌었다면 두 다항식은 다르고, 서로 다른 n차 다항식은 많아야 n개의
          점에서만 같습니다(Schwartz–Zippel). 그래서 아주 큰 범위에서 무작위 t를
          하나 뽑아 두 곱을 견주면 거의 확실하게 가려집니다.
        </P>
        <P>
          Neff(2001)는 이 생각에 "값과 순서를 보이지 않고"를 더한 영지식 증명을
          만들었고, Bayer–Groth(2012)는 덱을 √n×√n 표로 놓아 증명 크기를
          줄였습니다. 52장 증명이 5.5KB 정도입니다. 이 게임의 SRA 군에서 Neff를
          쓰면 한 번에 끝나지만 2048비트라 4~5초가 걸려, 지금은 cut-and-choose를
          골랐습니다.
        </P>
      </>
    ),
    demo: <PolyCheckToy />,
    points: [
      "순열이면 다항식이 같다 → 무작위 점 하나로 확인(Schwartz–Zippel)",
      "cut-and-choose 2⁻¹⁶ 대신 한 번에 거의 확실",
      "참고: Neff, A Verifiable Secret Shuffle(CCS 2001) · Bayer & Groth(EUROCRYPT 2012) · docs/15",
    ],
    quiz: [
      {
        q: "목록에 복제 카드가 섞였을 때 무작위 t에서 두 곱이 우연히 같을 확률은?",
        options: [
          "언제나 같다",
          "많아야 (카드 수)/(수의 범위) — 범위가 크면 사실상 0",
          "반반이다",
        ],
        answer: 1,
        why: "서로 다른 n차 다항식은 많아야 n개 점에서만 같다.",
      },
    ],
  },
  {
    id: "no-suit",
    title: '"선 무늬가 없다" 증명: OR 증명',
    hook: "손의 카드마다 '♥이거나 ◆이거나 ♣이다'를, 어느 것인지 숨기고 증명한다",
    body: (
      <>
        <P>
          지금은 무늬 안 따르기를 숨긴 카드가 드러날 때 잡습니다(12단원). 잡혀도
          그때까지 드러난 카드는 이미 보인 뒤입니다. 그 자리에서 막으려면 무늬를
          따르지 않을 때 "내 손에 선 무늬 카드가 없다"를 손패를 보이지 않고
          증명해야 합니다.
        </P>
        <P>
          바탕은 OR 증명(Cramer–Damgård–Schoenmakers 1994)입니다. "이것 아니면
          저것"을 증명하는데, 모르는 쪽은 8단원의 속이는 증명처럼 도전값을 미리
          정해 흉내 내고, 두 도전값의 합만 확인하는 사람의 도전값과 맞춥니다. 두
          쪽 기록이 똑같이 생겨 어느 쪽이 진짜인지 알 수 없습니다. 손의 카드마다
          "선 무늬가 아닌 카드들 중 하나다"를 보이면 됩니다. 후보가 많을 때는
          Groth–Kohlweiss(2015)의 one-out-of-many 증명이 크기를 로그로 줄입니다.
          트릭 테이킹 게임에 이것을 붙인 연구가 Bultel·Lafourcade(FC 2019), 바닥
          카드까지 다룬 것이 Bella 외(FC 2023)입니다.
        </P>
      </>
    ),
    demo: <OrProofToy />,
    points: [
      "OR 증명: 모르는 쪽은 흉내 내고, 도전값의 합만 맞춘다",
      "적용하면 무늬 안 따르기를 사후가 아니라 그 자리에서 막는다",
      "참고: Bultel & Lafourcade(FC 2019, ePrint 2019/375) · Bella 외(FC 2023, ePrint 2023/309) · Groth & Kohlweiss(EUROCRYPT 2015)",
    ],
    quiz: [
      {
        q: "OR 증명에서 확인하는 사람이 어느 쪽이 진짜인지 모르는 까닭은?",
        options: [
          "기록을 암호로 숨겨서",
          "진짜 쪽과 흉내 낸 쪽의 기록이 똑같은 분포라서",
          "한쪽 기록만 보내서",
        ],
        answer: 1,
        why: "흉내 낸 기록도 확인 식을 똑같이 만족해 구별할 수 없다.",
      },
    ],
  },
];

const KEY = "mighty-learn-done";

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * 보안 배우기: 이 게임이 쓰는 보안 기법을 13단원으로 차근차근. 단원마다 설명·직접 해 보기·확인 퀴즈.
 * 체험은 게임의 실제 코드나, 원리를 보이려고 작은 수로 만든 장난감을 돌린다
 */
export function LearnPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => setDone(loadDone()), []);
  const mark = (id: string) =>
    setDone((d) => {
      const next = new Set(d).add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        // 남기지 못해도 배우는 데는 지장이 없다.
      }
      return next;
    });
  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-100">
      <article className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <a href="/" className="underline opacity-70">
              ← 처음으로
            </a>
            <a href="/security" className="underline opacity-70">
              어떻게 지켜지나요? →
            </a>
          </div>
          <h1 className="font-black text-3xl">
            서버 없는 카드 게임의 보안, 직접 해 보며 배우기
          </h1>
          <P>
            이 게임에는 게임 서버가 없습니다. 그런데도 방장마저 남의 패를 볼 수
            없고, 누가 속이면 그 자리에서 짚습니다. 어떻게 가능한지 13단원으로
            나눴습니다. 단원마다 설명을 읽고, 상자에서 직접 해 보고, 확인 문제를
            풀어 보세요. 상자는 모두 이 브라우저에서 돌아갑니다.
          </P>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-300"
                style={{
                  width: `${(LESSONS.filter((l) => done.has(l.id)).length / LESSONS.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-sm text-white/70 tabular-nums">
              {LESSONS.filter((l) => done.has(l.id)).length}/{LESSONS.length}
              단원
            </span>
          </div>
          <a href="#elgamal" className="w-fit text-sky-300 text-sm underline">
            심화 학습(아직 적용하지 않은 기법) 바로 가기 ↓
          </a>
          <nav className="grid gap-1.5 sm:grid-cols-2">
            {LESSONS.map((l, i) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-white/5",
                  done.has(l.id) ? "border-emerald-400/40" : "border-white/10",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                    done.has(l.id)
                      ? "bg-emerald-500 text-black"
                      : "bg-white/10",
                  )}
                >
                  {done.has(l.id) ? "✓" : i + 1}
                </span>
                <span>
                  <span className="font-semibold">{l.title}</span>
                  <span className="block text-white/55 text-xs">
                    <SuitText text={l.hook} />
                  </span>
                </span>
              </a>
            ))}
          </nav>
        </header>

        {LESSONS.map((l, i) => (
          <section
            key={l.id}
            id={l.id}
            className="flex scroll-mt-4 flex-col gap-4"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-amber-300 text-sm">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="font-bold text-xl">{l.title}</h2>
              {done.has(l.id) && (
                <span className="text-emerald-300 text-xs">✓ 마침</span>
              )}
            </div>
            {l.body}
            {l.demo}
            <ul className="flex flex-col gap-1 rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
              {l.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-amber-300">
                    ●
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Quiz items={l.quiz} onPass={() => mark(l.id)} />
          </section>
        ))}
        <header className="flex flex-col gap-2 border-white/10 border-t pt-8">
          <span className="font-mono text-amber-300 text-xs">심화 학습</span>
          <h2 className="font-black text-2xl">
            아직 적용하지 않은, 다음 단계의 기법
          </h2>
          <P>
            아래 세 가지는 이 게임에 아직 붙이지 않았지만, 더 강한 보안을 원할
            때 다음으로 배워 볼 만한 표준 기법입니다. 원리를 작은 수로 해 볼 수
            있게 만들었습니다. 조사 내용은 docs/13·docs/15에 있습니다.
          </P>
          <p className="text-sm text-white/60 tabular-nums">
            {ADVANCED.filter((l) => done.has(l.id)).length}/{ADVANCED.length}
            단원
          </p>
        </header>
        {ADVANCED.map((l, i) => (
          <section
            key={l.id}
            id={l.id}
            className="flex scroll-mt-4 flex-col gap-4"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sky-300 text-sm">
                심화 {i + 1}
              </span>
              <h2 className="font-bold text-xl">{l.title}</h2>
              {done.has(l.id) && (
                <span className="text-emerald-300 text-xs">✓ 마침</span>
              )}
            </div>
            <p className="text-sm text-white/55">
              <SuitText text={l.hook} />
            </p>
            {l.body}
            {l.demo}
            <ul className="flex flex-col gap-1 rounded-xl bg-white/[0.04] px-4 py-3 text-sm">
              {l.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="text-sky-300">
                    ●
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Quiz items={l.quiz} onPass={() => mark(l.id)} />
          </section>
        ))}
        <footer className="text-center text-sm text-white/60">
          끝까지 오셨다면 이제 실제 게임에서 확인해 보세요.{" "}
          <a href="/" className="underline">
            처음으로
          </a>
          <p className="mt-2 text-xs opacity-70">
            <MadeWith />
          </p>
        </footer>
      </article>
    </main>
  );
}
