"use client";

import { type ReactNode, useEffect, useState } from "react";

import { MadeWith } from "@/components/brand/MadeWith";
import { Quiz, type QuizItem } from "@/components/learn/Quiz";
import { cn } from "@/lib/cn";

import { AttackToy } from "./AttackToy";
import { RendezvousToys } from "./RendezvousToy";
import { ChainToy, DrandToy, SasToy, TsaToy } from "./toys-draw";
import { MerkleToy, PasskeyToy, PowToy, SignToy } from "./toys-entry";
import { P } from "./ui";

interface Lesson {
  id: string;
  title: string;
  /** 목차에 보이는 한 줄 */
  hook: string;
  body: ReactNode;
  demo: ReactNode;
  points: string[];
  quiz: QuizItem[];
}

const LESSONS: Lesson[] = [
  {
    id: "sign",
    title: "서명: 내 응모권은 나만 낼 수 있다",
    hook: "응모권마다 비밀 열쇠로 서명한다. 한 글자만 바뀌어도 확인이 실패한다",
    body: (
      <>
        <P>
          응모권은 80바이트입니다: 판, 회차, 번호 6개, 공개 열쇠, 작업 증명 값.
          여기에 내 비밀 열쇠(P-256)로 서명합니다. 서명은 공개 열쇠만 있으면
          누구나 확인할 수 있지만, 만들려면 비밀 열쇠가 있어야 합니다.
        </P>
        <P>
          서버도 가운데서 번호를 바꾸거나 남의 이름으로 응모권을 만들 수
          없습니다. 아래에서 서명한 뒤 번호나 회차를 바꿔 보세요.
        </P>
        <P>
          서버도 자기 서명 열쇠로 영수증에 서명합니다. 이것이 카노푸스 우주국의
          진짜 관인입니다. 우주인 등록증의 붉은 직인은 꾸밈이고, 효력은 언제나
          서명에서 나옵니다.
        </P>
      </>
    ),
    demo: <SignToy />,
    points: [
      "서명은 응모권 내용 전체를 덮는다. 바뀌면 확인이 실패한다",
      "응모자 id는 공개 열쇠의 해시다. 이름·이메일은 없다",
    ],
    quiz: [
      {
        q: "서버가 내 응모권 번호 하나를 몰래 바꿔 장부에 올리면?",
        options: [
          "아무도 모른다",
          "서명이 맞지 않아 누구든 검사하면 드러난다",
          "번호만 바뀌고 서명은 그대로 맞다",
        ],
        answer: 1,
        why: "서명은 번호까지 포함한 내용 전체에 대한 것이다.",
      },
    ],
  },
  {
    id: "passkey",
    title: "패스키: 열쇠는 기기 밖으로 나오지 않는다",
    hook: "비밀 열쇠는 꺼낼 수 없고, 사이트 주소(game.byb.kr)에 묶인다",
    body: (
      <>
        <P>
          브라우저에서는 패스키로 응모합니다. 패스키의 비밀 열쇠는 기기(또는
          iCloud 키체인·Google 비밀번호 관리자)에 있고, 사용자도 서버도 화면
          코드도 꺼낼 수 없습니다. 서명할 때마다 Face ID·지문·기기 PIN으로 본인
          확인을 하고, 검사기는 그 표시(UV)가 없는 서명을 받지 않습니다.
        </P>
        <P>
          패스키는 만든 사이트 주소에 묶입니다. 비슷한 가짜 주소에서는
          브라우저가 그 패스키를 내주지 않고, 서명 안에도 지금 주소가 들어가
          검사기가 알아챕니다. 아래는 실제 패스키가 아니라 같은 모양으로 만든
          흉내입니다.
        </P>
      </>
    ),
    demo: <PasskeyToy />,
    points: [
      "비밀 열쇠는 기기 밖으로 나오지 않는다(복사당하지 않는다)",
      "서명에는 사이트 해시와 주소가 들어 있어 피싱 사이트의 서명은 받지 않는다",
      "사람이 누른 표시(UP)와 본인 확인 표시(UV)가 없으면 받지 않는다",
    ],
    quiz: [
      {
        q: "game-byb.kr 같은 가짜 사이트가 내 패스키로 응모권 서명을 받으려 하면?",
        options: [
          "Face ID만 통과하면 서명이 그대로 쓰인다",
          "브라우저가 그 패스키를 내주지 않고, 서명이 만들어져도 주소가 달라 검사에서 걸린다",
          "가짜 사이트는 비밀 열쇠를 복사해 간다",
        ],
        answer: 1,
        why: "패스키는 game.byb.kr에 묶이고, 서명 안의 주소와 사이트 해시를 검사기가 본다.",
      },
    ],
  },
  {
    id: "pow",
    title: "작업 증명: 한 장마다 몇 초의 비용",
    hook: "Argon2id로 조건에 맞는 n을 찾는다. 만들기는 여러 번, 확인은 한 번",
    body: (
      <>
        <P>
          응모권 한 장을 내려면 Argon2id(메모리 16MB)를 결과가 목표값보다 작게
          나올 때까지 되풀이합니다. 휴대폰에서 몇 초 걸립니다. 한 사람이 열쇠를
          잔뜩 만들어 수천 장을 내려면 그만큼 계산해야 합니다.
        </P>
        <P>
          메모리를 많이 쓰는 계산이라 그래픽카드로 빨리 하기 어렵고, 문제 값이
          앞 회차 기록 해시라 미리 계산해 둘 수 없습니다. 아래는 이 브라우저에서
          실제로 계산합니다. 무거우면 낮춘 값으로 해 보세요.
        </P>
      </>
    ),
    demo: <PowToy />,
    points: [
      "평균 시도 수 = 2³² ÷ 목표값. 규칙은 평균 30번, 16MB",
      "확인은 한 번 계산으로 끝난다(만드는 쪽만 비싸다)",
      "완전한 1인 1장은 아니다: 자원이 많은 사람은 더 낼 수 있다",
    ],
    quiz: [
      {
        q: "작업 증명을 미리 잔뜩 계산해 두었다가 다음 회차에 쓸 수 없는 까닭은?",
        options: [
          "Argon2가 매번 다른 값을 내서",
          "문제 값이 앞 회차 기록 해시라 그 회차가 끝나야 알 수 있어서",
          "서버가 n을 정해 줘서",
        ],
        answer: 1,
        why: "문제 값(salt)은 앞 회차가 drand로 확정된 뒤에야 나온다.",
      },
    ],
  },
  {
    id: "merkle",
    title: "머클 나무: 마감 때 목록을 값 하나로 봉인",
    hook: "모든 응모권을 뿌리 하나로 묶는다. 하나만 빼거나 바꿔도 뿌리가 달라진다",
    body: (
      <>
        <P>
          마감하면 응모권 id를 정렬해 둘씩 해시하며 올라가 뿌리 하나를
          만듭니다(RFC 6962 방식). 이 뿌리가 봉인 값에 들어가 공개됩니다.
        </P>
        <P>
          내 응모권이 들어 있는지는 목록 전체를 받지 않아도, 나무를 따라
          올라가는 데 필요한 몇 개의 값(증명)만으로 확인됩니다. 아래에서
          응모권을 빼거나 번호를 바꿔 보세요.
        </P>
      </>
    ),
    demo: <MerkleToy />,
    points: [
      "뿌리 하나가 목록 전체를 대신한다",
      "내 응모권 증명은 응모권 수가 늘어도 몇 개 값이면 된다",
      "잎과 가지에 서로 다른 앞 바이트를 붙여 가지를 잎인 척하는 위조를 막는다",
    ],
    quiz: [
      {
        q: "운영자가 마감 뒤 남의 응모권 하나를 목록에서 빼면?",
        options: [
          "뿌리는 그대로라 아무도 모른다",
          "뿌리가 달라져 마감 때 봉인한 값과 어긋난다",
          "그 사람의 응모권만 사라지고 나머지는 영향이 없다",
        ],
        answer: 1,
        why: "잎 하나가 바뀌면 뿌리까지 모든 위쪽 해시가 바뀐다.",
      },
    ],
  },
  {
    id: "tsa",
    title: "시각 인증: 봉인이 추첨보다 먼저였다",
    hook: "바깥 기관(TSA)이 봉인 값과 시각에 서명한다. 운영자가 시각을 고칠 수 없다",
    body: (
      <>
        <P>
          봉인 값을 공개했다는 것만으로는 부족합니다. 운영자가 추첨 결과를 본 뒤
          목록을 바꾸고 "마감 때 봉인했다"고 우길 수 있으니까요. 그래서 마감
          직후 봉인 값을 공개 시각 인증 기관(RFC 3161, DigiCert·Sectigo)에 보내
          "이 값이 이 시각에 있었다"는 서명 토큰을 받습니다.
        </P>
        <P>
          검사기는 토큰의 서명을 기관의 고정한 루트 열쇠까지 따라가 확인하고, 그
          시각이 drand 추첨보다 앞서는지 봅니다. 아래는 실제로 받아 둔
          토큰입니다.
        </P>
      </>
    ),
    demo: <TsaToy />,
    points: [
      "토큰은 기관 열쇠로 서명돼 운영자가 시각이나 값을 고칠 수 없다",
      "봉인 시각이 추첨 뒤면 그 회차는 당첨 없이 무효로 닫는다",
      "두 기관에 함께 묻는다. 한 기관과 운영자가 짜는 위험은 상품 크기에 맞춰 감수한다",
    ],
    quiz: [
      {
        q: "GitHub 커밋 시각 대신 시각 인증 기관 토큰을 쓰는 까닭은?",
        options: [
          "GitHub가 느려서",
          "커밋 시각은 커밋하는 쪽이 정할 수 있지만 토큰 시각은 기관이 서명한다",
          "토큰이 더 짧아서",
        ],
        answer: 1,
        why: "커밋 시각은 운영자가 마음대로 적을 수 있어 증거가 되지 못한다.",
      },
    ],
  },
  {
    id: "drand",
    title: "drand: 추첨 전에는 아무도 모르는 공개 난수",
    hook: "정해진 회차의 drand 값에서 번호 7개가 결정적으로 나온다",
    body: (
      <>
        <P>
          당첨 번호는 서버가 뽑지 않습니다. 세계 여러 기관이 함께 운영하는
          drand가 3초마다 내는 공개 난수를 씁니다. 어느 drand 회차를 쓸지는 마감
          시각에서 계산식으로 정해져(마감 + 5분 뒤 첫 회차) 운영자가 고를 수
          없고, 그 값은 나오기 전에는 서버도 모릅니다.
        </P>
        <P>
          값이 나오면 누구든 같은 계산으로 같은 번호를 얻습니다. 아래는 실제
          drand 값의 서명을 확인하고 번호를 뽑는 과정을 한 바이트씩 보여 줍니다.
        </P>
      </>
    ),
    demo: <DrandToy />,
    points: [
      "drand 회차는 마감 시각이 정한다. 운영자가 고를 수 없다",
      "BLS 서명으로 진짜 drand 값인지 누구나 확인한다",
      "seed에 응모권 목록을 넣지 않아, 응모권을 넣고 빼며 번호를 고를 수 없다",
    ],
    quiz: [
      {
        q: "seed에 머클 뿌리를 넣지 않는 까닭은?",
        options: [
          "계산이 빨라서",
          "넣으면 운영자가 응모권을 넣고 빼며 원하는 번호가 나오는 뿌리를 찾을 수 있어서",
          "뿌리는 비밀이라서",
        ],
        answer: 1,
        why: "운영자가 바꿀 수 있는 값이 seed에 들어가면 결과를 고를 여지가 생긴다.",
      },
    ],
  },
  {
    id: "chain",
    title: "사슬과 앵커: 지난 기록은 고칠 수 없다",
    hook: "회차 기록은 앞 기록 해시를 품는다. 하나를 고치면 뒤가 모두 어긋난다",
    body: (
      <>
        <P>
          회차 기록마다 바로 앞 기록의 해시가 들어갑니다. 지난 회차 하나를
          고치면 그 해시가 바뀌어 다음 기록과 이어지지 않습니다. 뒤를 모두 다시
          이어 붙이면 끝 해시가 달라집니다.
        </P>
        <P>
          서버는 회차마다 기록 해시를 공개 GitHub 저장소(앵커)에 남기고, 장부를
          처음 만들 때 처음 일정표를 genesis.txt로 남깁니다. 장부는 다시
          시작하지 않고 시험 회차부터 정식 회차까지 한 사슬로 잇습니다. 일정
          바꾸기(정식 시작 포함)는 24시간 전에 장부에 예고돼야 합니다.
        </P>
      </>
    ),
    demo: <ChainToy />,
    points: [
      "지난 기록을 고치면 사슬이 끊기거나 끝 해시가 바뀐다",
      "앵커는 운영자가 강제 push로 고칠 수 있는 보조 기록이다. 기기가 기억한 끝 해시와 시각 인증 토큰이 함께 지킨다",
      "일정 바꾸기는 24시간 예고. 이미 응모받는 회차의 시각은 바꿀 수 없다",
    ],
    quiz: [
      {
        q: "운영자가 지난 회차를 고치고 뒤 기록을 모두 다시 이어 붙였다. 어떻게 드러나나?",
        options: [
          "드러나지 않는다",
          "끝 해시가 GitHub 앵커와 기기가 기억한 값과 달라진다",
          "다음 회차 응모가 막힌다",
        ],
        answer: 1,
        why: "다시 이으면 뒤 회차 해시가 모두 바뀐다.",
      },
    ],
  },
  {
    id: "sas",
    title: "당첨자 확인 별 세 개",
    hook: "두 기기가 임시 열쇠(ECDH)로 같은 별 세 개를 얻는다. 가운데 끼어들면 별이 달라진다",
    body: (
      <>
        <P>
          당첨자 확인은 당첨자가 먼저 시작합니다. 당첨자가 응모권 열쇠로 서명해
          한 번만 쓰는 확인 링크를 만들어 보내고, 서버는 그 서명이 장부의 응모권
          열쇠로 맞을 때만 링크를 받습니다. 그래서 아무나 당첨자에게 요청을 보낼
          수 없습니다.
        </P>
        <P>
          링크를 받은 분이 확인을 시작하면, 두 기기는 요청마다 임시 열쇠를
          만들어 공개 열쇠만 주고받습니다. 각자 내 비밀 열쇠와 상대 공개 열쇠로
          같은 공유 비밀을 계산하고, 거기서 별 세 개를 뽑습니다. 요청을 전달하는
          서버는 공개 열쇠만 보므로 별을 모릅니다.
        </P>
        <P>
          당첨자는 양쪽 임시 열쇠를 묶은 문구에 응모권 열쇠로 서명합니다. 그래서
          가운데서 열쇠를 바꿔치기하면 서명 검사에서 걸리고, 별도 달라집니다.
          당첨자는 별 이름을 당첨을 알렸던 메신저로 보내고, 확인하는 분은 그
          별을 하늘에서 누릅니다.
        </P>
      </>
    ),
    demo: <SasToy />,
    points: [
      "판정은 늘 확인하는 분의 기기에서 한다. 당첨자 화면이나 스크린숏은 증거가 아니다",
      "확인 링크는 응모권 주인만 만들 수 있고 한 번 쓰면 닫힌다",
      "서버는 공개 열쇠만 봐서 별을 알 수 없다",
      "열쇠를 바꿔치기하면 서명 문구가 맞지 않고 양쪽 별도 다르다",
    ],
    quiz: [
      {
        q: "요청을 전달하는 서버가 가짜 당첨자에게 별 세 개를 알려 줄 수 없는 까닭은?",
        options: [
          "서버가 별을 지운다",
          "별은 두 기기의 비밀 열쇠로만 계산되는 공유 비밀에서 나온다",
          "별은 장부에 적혀 있다",
        ],
        answer: 1,
        why: "ECDH 공유 비밀은 공개 열쇠만으로는 계산할 수 없다.",
      },
    ],
  },
  {
    id: "attack",
    title: "공격해 보기",
    hook: "운영자·참가자·중간자 입장에서 조작해 보고 어디서 걸리는지 본다",
    body: (
      <P>
        앞에서 배운 것을 한꺼번에 써 봅니다. 조작 하나를 고르면 장부를 고친 뒤
        검증하기 페이지의 장부 전체 검사와 당첨자 확인 검사를 그대로 돌려, 어느
        확인에서 걸리는지 보여 줍니다.
      </P>
    ),
    demo: <AttackToy />,
    points: [
      "운영자가 할 수 없는 일: 번호 고르기·미리 알기, 남의 응모권 만들기, 당첨 가로채기",
      "하면 드러나는 일: 응모권 넣고 빼기, 지난 기록 고치기, 사람마다 다른 장부",
      "한 사람만 검사해도 드러난다",
    ],
    quiz: [
      {
        q: "운영자가 결과를 보고 자기 응모권을 넣은 뒤 사슬과 앵커까지 모두 고쳐 썼다. 마지막까지 남는 증거는?",
        options: [
          "서버 기록",
          "마감 직후 기관이 서명한 봉인 토큰(옛 봉인 값을 담고 있다)",
          "없다",
        ],
        answer: 1,
        why: "기관 서명은 운영자가 새로 받아 낼 수 없다. 이미 받은 토큰은 옛 목록의 봉인 값을 담고 있다.",
      },
    ],
  },
  {
    id: "rendezvous",
    title: "덧붙임: 등록증은 어떻게 정해지나",
    hook: "랑데부 해싱. 주소를 더해도 대부분의 우주인은 이사하지 않는다",
    body: (
      <>
        <P>
          우주인 등록증의 이름·주소·얼굴은 공개 열쇠 하나에서 계산합니다. 보안
          기술은 아니지만, 나중에 주소나 이름을 목록에 더해도 이미 있는 등록증이
          바뀌지 않게 하려고 랑데부 해싱(가중 HRW)을 씁니다.
        </P>
        <P>
          가장 쉬운 방법은 &ldquo;해시 % 목록 길이&rdquo;, 해시를 목록 길이로
          나눈 나머지 번째 주소를 고르는 것입니다. 그런데 주소를 하나 더해
          길이가 바뀌면 나머지가 거의 다 달라져, 대부분의 우주인이 이사합니다.
        </P>
        <P>
          랑데부 해싱은 주소마다 따로 점수를 매기고 가장 높은 곳을 고릅니다.
          점수는 내 씨앗과 그 주소의 id만으로 정해지므로, 새 주소가 생겨도 다른
          주소의 점수는 그대로입니다. 새 주소 점수가 내 1등보다 높을 때만 그리로
          이사합니다. 아래 계산은 실제 등록증과 같은 코드입니다.
        </P>
      </>
    ),
    demo: <RendezvousToys />,
    points: [
      "주소를 더하면 새 주소가 1등이 된 약 1/(n+1)만 이사한다",
      "주소를 빼면 그 주소 주민만 다른 곳으로 옮겨 간다",
      "화면 이름은 고쳐도 되지만 id는 바꾸지 않는다(바꾸면 그 주소 주민이 흩어진다)",
      "가중치가 2배면 뽑힐 확률도 2배다",
      "분산 캐시·저장소에서 서버를 더하거나 뺄 때 옮길 데이터를 줄이려고 쓴다. 같은 일을 하는 일관 해싱은 해시 고리에 서버를 놓고, 랑데부 해싱은 고리 없이 항목마다 점수를 센다",
    ],
    quiz: [
      {
        q: "주소 10곳 목록에 한 곳을 더했다. 랑데부 해싱이면 이사하는 우주인은?",
        options: ["거의 모두", "새 주소가 1등이 된 약 11분의 1", "아무도 없다"],
        answer: 1,
        why: "다른 주소의 점수는 그대로라, 새 주소 점수가 1등을 넘은 사람만 옮긴다.",
      },
      {
        q: "주소 '화성'(id mars)의 화면 이름을 '붉은 행성'으로 고치면?",
        options: [
          "화성 주민이 모두 흩어진다",
          "아무도 이사하지 않는다",
          "모두 이사한다",
        ],
        answer: 1,
        why: "점수는 id로 계산한다. id를 바꾸면 그때는 그 주소 주민이 흩어진다.",
      },
    ],
  },
];

/** 막지 못하는 것(docs/36 1·8절, 8-1의 한계) */
const LIMITS: { title: string; body: string }[] = [
  {
    title: "응모를 아예 받지 않기",
    body: "서버가 특정 응모권을 받지 않으면 막을 수 없습니다. 받고 나서 빼면 영수증으로 증명할 수 있지만, 처음부터 거절하면 당사자만 압니다.",
  },
  {
    title: "기기나 잠금 비밀번호를 빼앗긴 경우",
    body: "패스키는 지문·Face ID가 안 되면 기기 잠금 비밀번호로도 열립니다. 그 비밀번호를 아는 사람은 내 이름으로 응모하고 당첨자 확인에도 답할 수 있습니다.",
  },
  {
    title: "화면 코드는 운영자가 내준다",
    body: "패스키 열쇠는 꺼낼 수 없지만, 서버가 내준 화면 코드가 그 열쇠로 무엇에 서명할지 고를 수는 있습니다. 그래서 같은 커밋이면 누가 빌드해도 같은 파일이 나오게 하고 화면 코드 해시를 공개해, 받은 코드가 공개 저장소에서 나온 것인지 비교할 수 있게 했습니다. 장부 검사는 터미널 검사기로 화면 없이 할 수 있습니다. 다만 사람마다 다른 코드를 내주면 내가 비교한 그때의 코드만 확인되고, 응모와 당첨 확인은 브라우저 패스키로만 하므로 서명을 시키는 것은 늘 화면 코드입니다.",
  },
  {
    title: "열쇠를 여러 개 만들어 더 내기",
    body: "작업 증명은 비용일 뿐입니다. 여러 기기·네트워크를 쓰거나 계산 자원이 많은 사람(운영자 포함)은 몇 장 더 낼 수 있습니다. 상품이 커지면 신원 확인을 다시 봅니다.",
  },
  {
    title: "바깥 기관이 짜는 경우",
    body: "drand 운영 기관 과반이 짜면 미래 값을 알 수 있고, 시각 인증 기관이 운영자와 짜면 시각을 속일 수 있습니다(기본은 한 곳 이상 받으면 봉인). 커피 한 잔 규모에서 감수합니다.",
  },
  {
    title: "서버가 멈추기",
    body: "서버가 멈추면 회차가 밀리거나, 봉인을 제때 받지 못한 회차는 당첨 없이 무효로 닫힙니다.",
  },
  {
    title: "응모가 이어져 보이는 것",
    body: "같은 패스키로 낸 응모권은 모두 같은 공개 열쇠라 이어져 보입니다. 당첨 때 이름을 밝히면 지난 응모가 모두 그 사람 것으로 보입니다. 우주인 등록증을 공유해도 마찬가지입니다.",
  },
  {
    title: "우주인 등록증을 흉내 내기",
    body: '등록증의 이름·주소·사진은 재미로 붙인 것이라 열쇠를 많이 만들면 똑같은 등록증이 나오고, 40비트 등록번호도 약 1조 번 시도하면 맞출 수 있습니다. 그래서 응모와 당첨자 확인은 언제나 공개 열쇠 전체와 서명으로 판정합니다. 등록증을 눌러 나오는 "이 기기에서 확인됨"도 내 패스키가 그 열쇠와 맞는지 나에게 보여 줄 뿐이고, 가짜 페이지도 같은 모습을 흉내 낼 수 있습니다. 남에게 당첨을 증명할 때는 당첨자 확인(별 세 개)을 씁니다.',
  },
];

const KEY = "stardraw-learn-done";

function loadDone(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** 하늘의 별 따기 보안 배우기: 단계마다 설명·직접 해 보기·확인 문제. 계산은 모두 규칙 패키지 코드다 */
export function StardrawLearn() {
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
  const doneCount = LESSONS.filter((l) => done.has(l.id)).length;

  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-2xl flex-col gap-10 break-keep leading-relaxed">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <a href="/stardraw" className="text-white/70 hover:text-white">
              ← 하늘의 별 따기
            </a>
            <span className="flex gap-3">
              <a
                href="/stardraw/about"
                className="text-white/70 underline underline-offset-2"
              >
                설명
              </a>
              <a
                href="/stardraw/verify"
                className="text-white/70 underline underline-offset-2"
              >
                검증하기
              </a>
            </span>
          </div>
          <h1 className="font-black text-3xl">
            하늘의 별 따기 보안, 직접 해 보며 배우기
          </h1>
          <P>
            운영자도 결과를 고를 수 없고, 누가 속이면 드러나는 로또는 어떻게
            만들까요? 하늘의 별 따기에 쓰인 기술을 아홉 단계로 나누고, 끝에
            우주인 등록증이 정해지는 방법을 덧붙였습니다. 상자 안의 계산은 모두
            실제 게임과 같은 코드가 이 브라우저에서 합니다.
          </P>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-200"
                style={{ width: `${(doneCount / LESSONS.length) * 100}%` }}
              />
            </div>
            <span className="text-sm text-white/70 tabular-nums">
              {doneCount}/{LESSONS.length}단계
            </span>
          </div>
          <nav className="grid gap-1.5 sm:grid-cols-2" aria-label="단계">
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
                      ? "bg-emerald-400 text-black"
                      : "bg-white/10",
                  )}
                >
                  {done.has(l.id) ? "✓" : i + 1}
                </span>
                <span>
                  <span className="font-semibold">{l.title}</span>
                  <span className="block text-white/55 text-xs">{l.hook}</span>
                </span>
              </a>
            ))}
            <a
              href="#limits"
              className="flex items-start gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px]">
                !
              </span>
              <span>
                <span className="font-semibold">막지 못하는 것</span>
                <span className="block text-white/55 text-xs">
                  이 설계의 한계를 솔직하게
                </span>
              </span>
            </a>
          </nav>
        </header>

        {LESSONS.map((l, i) => (
          <section
            key={l.id}
            id={l.id}
            className="flex scroll-mt-6 flex-col gap-4"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-amber-200 text-sm">
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
                  <span aria-hidden className="text-amber-200">
                    ●
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Quiz items={l.quiz} onPass={() => mark(l.id)} />
          </section>
        ))}

        <section id="limits" className="flex scroll-mt-6 flex-col gap-4">
          <h2 className="font-bold text-xl">막지 못하는 것</h2>
          <P>
            이 설계는 운영자가 결과를 고르거나 몰래 고치는 것을 막거나 드러나게
            하지만, 모든 것을 막지는 못합니다.
          </P>
          <ul className="flex flex-col gap-3">
            {LIMITS.map((x) => (
              <li key={x.title} className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm">{x.title}</span>
                <span className="text-sm text-white/75">{x.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-col items-center gap-2 text-center text-sm text-white/60">
          <span>
            더 자세한 규칙과 장부 전체 검사는{" "}
            <a href="/stardraw/verify" className="underline underline-offset-2">
              검증하기
            </a>
            , 게임 전체에 쓰인 보안은{" "}
            <a href="/learn" className="underline underline-offset-2">
              보안 배우기
            </a>
            에 있습니다.
          </span>
          <span className="text-[11px] text-white/40">
            <MadeWith />
          </span>
        </footer>
      </article>
    </main>
  );
}
