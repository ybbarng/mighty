"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import {
  ChatRoutingDemo,
  CommitRevealDemo,
  HostSignatureDemo,
  ReplayAuditDemo,
  ViewFilterDemo,
} from "./demos";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="font-bold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed opacity-90">{children}</p>;
}

type Status = "막음" | "잡아냄" | "못 막음";

const THREATS: {
  attack: string;
  who: string;
  status: Status;
  how: string;
  link: string;
}[] = [
  {
    attack: "남의 패 엿보기",
    who: "참가자",
    status: "막음",
    how: "방장이 viewOf로 그 자리 정보만 보낸다",
    link: "view",
  },
  {
    attack: "남의 패 엿보기",
    who: "방장",
    status: "못 막음",
    how: "엔진이 방장 기기에서 돈다. 멘탈 포커가 필요하다",
    link: "limits",
  },
  {
    attack: "섞기 조작(원하는 패 받기)",
    who: "방장·참가자",
    status: "막음",
    how: "commit-reveal: 모두의 비밀 값으로 시드를 만든다",
    link: "shuffle",
  },
  {
    attack: "규칙 위반(없는 카드, 무늬 안 따르기)",
    who: "참가자",
    status: "막음",
    how: "방장 엔진의 step이 거절한다",
    link: "replay",
  },
  {
    attack: "규칙 위반 눈감기·결과 조작",
    who: "방장",
    status: "잡아냄",
    how: "판 끝에 기록을 공개하고 참가자가 다시 돌린다",
    link: "replay",
  },
  {
    attack: "게임 중 화면 조작",
    who: "방장",
    status: "잡아냄",
    how: "받은 화면 전부를 다시 돌린 화면과 대조한다",
    link: "replay",
  },
  {
    attack: "방장 사칭·중간자",
    who: "링크를 아는 사람",
    status: "막음",
    how: "초대 링크의 열쇠 지문 + ECDSA 서명",
    link: "identity",
  },
  {
    attack: "채팅에서 남인 척",
    who: "참가자",
    status: "막음",
    how: "방장이 보낸 연결 기준으로 이름을 붙인다",
    link: "chat",
  },
  {
    attack: "채팅 지어내기",
    who: "방장",
    status: "못 막음",
    how: "모든 말이 방장을 거친다",
    link: "limits",
  },
  {
    attack: "시드에서 참가자 값 빼기",
    who: "방장",
    status: "잡아냄",
    how: "참가자가 자기 약속이 시작·판 끝 목록에 있는지 확인",
    link: "pentest",
  },
  {
    attack: "참가자 행동 바꿔치기",
    who: "방장",
    status: "잡아냄",
    how: "참가자가 보낸 행동과 기록 속 내 행동을 대조",
    link: "pentest",
  },
  {
    attack: "컴퓨터 자리 조종",
    who: "방장",
    status: "잡아냄",
    how: "같은 컴퓨터·같은 난수로 컴퓨터 수를 다시 계산",
    link: "pentest",
  },
  {
    attack: "판 끝 기록 숨기기",
    who: "방장",
    status: "잡아냄",
    how: "기록 없이 나가면 검증 못 함으로 알림",
    link: "pentest",
  },
  {
    attack: "재접속 토큰 가로채기",
    who: "링크를 아는 사람",
    status: "막음",
    how: "토큰 대신 받는 사람에 묶인 해시만 보냄",
    link: "pentest",
  },
  {
    attack: "엿듣기",
    who: "릴레이·네트워크",
    status: "막음",
    how: "연결 정보는 방 코드로 암호화, 게임 데이터는 WebRTC(DTLS)",
    link: "network",
  },
];

/** 모의 침투에서 실제로 통했던 공격과 고친 방법 */
const PENTEST: [string, string, string][] = [
  [
    "방장이 참가자 약속을 빼고 시드 고르기",
    "참가자는 목록에 자기 약속이 없으면 확인을 건너뛰었다",
    "시작 알림과 판 끝 공개의 약속 목록에 내 것이 그대로 있는지 확인",
  ],
  [
    "방장이 판 끝 기록을 숨기고 나가기",
    "기록이 안 와도 아무 경고가 없었다",
    '게임을 했는데 기록 없이 나가면 "검증하지 못했다"로 알림',
  ],
  [
    "방장이 참가자 카드를 바꿔 넣기",
    "기록과 화면이 서로 맞으면 통과했다",
    "내가 보낸 행동과 기록 속 내 행동을 대조",
  ],
  [
    "방장이 컴퓨터 자리를 조종",
    "컴퓨터 수는 규칙에만 맞으면 통과했다",
    "알린 실력의 컴퓨터로 같은 난수를 써서 다시 계산해 대조",
  ],
  [
    "새로고침한 사람의 토큰을 엿들어 자리 빼앗기",
    "입장 요청이 방 안 모두에게 토큰째로 갔다",
    "SHA-256(토큰·받는 사람 연결 아이디)만 보냄",
  ],
  [
    "한 연결로 여러 자리 차지",
    "동시에 온 입장 요청을 따로 처리했다",
    "입장을 하나씩 처리, 이미 앉은 연결이면 같은 자리",
  ],
  [
    "참가자가 게임 강제 종료(그만두기)",
    "엔진이 차례와 상관없이 그만두기를 받았다",
    "온라인 참가자에게는 그만두기를 막음",
  ],
  [
    "모르는 행동으로 기록 부풀리기",
    "마이티 엔진에 모르는 행동을 거절하는 갈래가 없었다",
    "엔진이 모르는 행동을 거절",
  ],
  [
    "약속과 다른 값으로 시작 막기",
    "값이 틀리면 시작이 예외로 멈췄다",
    "받을 때 확인하고 틀리면 시드에서 뺌",
  ],
  [
    "자리 없는 사람이 채팅·기록 엿듣기, 방 코드 맞히기",
    '"모두에게" 보내기가 방 안 모든 연결에 갔다, 방 코드가 6글자였다',
    "앉은 참가자에게만 보냄, 방 코드 16글자",
  ],
];

const RESOURCES: { title: string; url: string; note: string }[] = [
  {
    title: "Commitment scheme (Wikipedia)",
    url: "https://en.wikipedia.org/wiki/Commitment_scheme",
    note: "commit-reveal의 바탕. 숨김(hiding)과 묶임(binding)",
  },
  {
    title: "Mental poker (Wikipedia)",
    url: "https://en.wikipedia.org/wiki/Mental_poker",
    note: "방장도 남의 패를 못 보게 하는 방법. Shamir·Rivest·Adleman의 교환 가능한 암호",
  },
  {
    title: "Web Crypto API (MDN)",
    url: "https://developer.mozilla.org/ko/docs/Web/API/Web_Crypto_API",
    note: "브라우저의 SHA-256, ECDSA. 이 게임이 쓰는 API",
  },
  {
    title: "Elliptic Curve Digital Signature Algorithm (Wikipedia)",
    url: "https://en.wikipedia.org/wiki/Elliptic_Curve_Digital_Signature_Algorithm",
    note: "방장 서명(P-256)",
  },
  {
    title: "WebRTC API (MDN)",
    url: "https://developer.mozilla.org/ko/docs/Web/API/WebRTC_API",
    note: "기기끼리 바로 잇는 데이터 채널",
  },
  {
    title: "A Study of WebRTC Security",
    url: "https://webrtc-security.github.io/",
    note: "DTLS·SRTP, 시그널링 보안 정리",
  },
  {
    title: "Nostr NIP-01",
    url: "https://github.com/nostr-protocol/nips/blob/master/01.md",
    note: "서로를 찾는 데 쓰는 릴레이 프로토콜",
  },
  {
    title: "Trystero",
    url: "https://github.com/dmotz/trystero",
    note: "서버 없이 WebRTC를 잇는 라이브러리(이 게임이 쓴다)",
  },
  {
    title: "Event Sourcing (Martin Fowler)",
    url: "https://martinfowler.com/eaaDev/EventSourcing.html",
    note: "행동 기록으로 상태를 다시 만드는 생각. 판 끝 검증과 이어하기의 바탕",
  },
];

/** 어떻게 지켜지나요? — 온라인 대전의 보안 구조와 직접 해 보는 시연 */
export function SecurityPage() {
  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-100">
      <article className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <a href="/" className="text-sm underline opacity-70">
              ← 처음으로
            </a>
            <span className="font-mono text-xs opacity-50">개발자용 설명</span>
          </div>
          <h1 className="font-black text-3xl">어떻게 지켜지나요?</h1>
          <P>
            마이티와 하트의 온라인 대전에는 게임 서버가 없습니다. 방장의
            브라우저가 엔진을 돌리고, 기기끼리 WebRTC로 바로 이어집니다. 서버가
            없는데 누가 프로그램을 고치면 어떻게 될까요? 이 페이지는 무엇을
            막고, 무엇을 잡아내고, 무엇은 못 막는지를 실제 코드로 보여 줍니다.
            아래 상자는 모두 이 브라우저에서 게임의 실제 함수를 돌립니다.
          </P>
          <nav className="flex flex-wrap gap-1.5 text-xs">
            {[
              ["summary", "한눈에"],
              ["network", "연결"],
              ["view", "보이는 정보"],
              ["shuffle", "섞기"],
              ["replay", "판 끝 검증"],
              ["identity", "방장 확인"],
              ["chat", "채팅"],
              ["pentest", "모의 침투"],
              ["limits", "한계"],
              ["learn", "더 공부하기"],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded-full border border-white/15 px-2.5 py-1 hover:bg-white/10"
              >
                {label}
              </a>
            ))}
          </nav>
        </header>

        <Section id="summary" title="한눈에">
          <P>
            "막음"은 애초에 할 수 없다, "잡아냄"은 해도 판이 끝나면 정상
            프로그램이 자동으로 찾아낸다, "못 막음"은 지금 구조의 한계라는
            뜻입니다. 공격자 한 명이 프로그램을 고치고 나머지는 정상 프로그램을
            쓴다고 가정합니다.
          </P>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="opacity-60">
                <tr>
                  <th className="py-1 pr-2">공격</th>
                  <th className="pr-2">누가</th>
                  <th className="pr-2">결과</th>
                  <th>어떻게</th>
                </tr>
              </thead>
              <tbody>
                {THREATS.map((t) => (
                  <tr
                    key={`${t.attack}-${t.who}`}
                    className="border-white/10 border-t"
                  >
                    <td className="py-1.5 pr-2">{t.attack}</td>
                    <td className="pr-2 opacity-80">{t.who}</td>
                    <td className="pr-2">
                      <span
                        className={cn(
                          "whitespace-nowrap rounded px-1.5 py-0.5 font-semibold",
                          t.status === "막음" && "bg-emerald-700/70",
                          t.status === "잡아냄" && "bg-sky-700/70",
                          t.status === "못 막음" && "bg-rose-800/70",
                        )}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="opacity-80">
                      <a href={`#${t.link}`} className="hover:underline">
                        {t.how}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="network" title="서버 없이 연결하기">
          <svg
            viewBox="0 0 600 200"
            className="w-full"
            role="img"
            aria-label="Nostr 릴레이로 서로를 찾고, WebRTC로 방장과 참가자가 바로 이어지는 구조"
          >
            <title>연결 구조</title>
            <rect
              x={210}
              y={10}
              width={180}
              height={40}
              rx={8}
              fill="#334155"
            />
            <text
              x={300}
              y={35}
              textAnchor="middle"
              fontSize={13}
              fill="#e2e8f0"
            >
              Nostr 릴레이(공개 + byb.kr)
            </text>
            {[
              [80, 150, "참가자 A"],
              [300, 150, "방장(엔진)"],
              [520, 150, "참가자 B"],
            ].map(([x, y, label]) => (
              <g key={label as string}>
                <line
                  x1={x as number}
                  y1={(y as number) - 20}
                  x2={300}
                  y2={50}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
                <rect
                  x={(x as number) - 60}
                  y={(y as number) - 20}
                  width={120}
                  height={40}
                  rx={8}
                  fill={label === "방장(엔진)" ? "#92400e" : "#0c4a6e"}
                />
                <text
                  x={x as number}
                  y={(y as number) + 5}
                  textAnchor="middle"
                  fontSize={13}
                  fill="white"
                >
                  {label}
                </text>
              </g>
            ))}
            <line
              x1={140}
              y1={150}
              x2={240}
              y2={150}
              stroke="#fbbf24"
              strokeWidth={3}
            />
            <line
              x1={360}
              y1={150}
              x2={460}
              y2={150}
              stroke="#fbbf24"
              strokeWidth={3}
            />
            <text
              x={190}
              y={185}
              textAnchor="middle"
              fontSize={11}
              fill="#fbbf24"
            >
              WebRTC(DTLS)
            </text>
            <text
              x={410}
              y={185}
              textAnchor="middle"
              fontSize={11}
              fill="#fbbf24"
            >
              WebRTC(DTLS)
            </text>
            <text x={455} y={95} fontSize={11} fill="#94a3b8">
              점선: 서로 찾기(암호화된 SDP)
            </text>
          </svg>
          <P>
            릴레이는 "이 방에 누가 있나"를 알리는 게시판 역할만 합니다. 연결
            정보 (SDP)는 방 코드를 비밀번호로 암호화해 올리므로 링크를 모르는
            사람은 들어올 수 없습니다(Trystero). 연결이 맺어진 뒤의 게임
            데이터는 WebRTC 데이터 채널(DTLS)로 기기끼리 바로 오가고 릴레이를
            거치지 않습니다. 참가자는 방장하고만 게임 메시지를 주고받습니다(별
            모양). 코드: <code>apps/web/src/net/p2p-transport.ts</code>.
          </P>
        </Section>

        <Section id="view" title="보이는 정보만 보내기">
          <P>
            원작 마이티 네트워크는 섞은 덱 전체를 모든 참가자에게 보냈습니다.
            개발자 도구만 열면 누구나 모든 패를 볼 수 있었습니다. 여기서는 방장
            기기만 전체 상태(<code>MatchState</code>)를 갖고, 참가자에게는{" "}
            <code>viewOf(state, seat)</code>로 만든 그 자리의 화면만 보냅니다.
            남의 손패, 바닥 카드, 버린 카드(주공 말고), 공개 전 프렌드, 난수
            상태가 빠집니다. 무작위 대국 테스트가 매 단계 남의 카드가 섞여 들지
            않았는지 확인합니다.
          </P>
          <ViewFilterDemo />
        </Section>

        <Section id="shuffle" title="섞기: commit-reveal">
          <P>
            섞기는 시드 하나로 정해집니다(엔진은 결정적입니다). 방장이 시드를
            고를 수 있다면 원하는 패를 받을 수 있습니다. 그래서 시드를 모두가
            함께 만듭니다.
          </P>
          <ol className="list-decimal pl-5 text-sm leading-relaxed opacity-90">
            <li>
              각자 비밀 값 r<sub>i</sub>를 만들고 h<sub>i</sub> = SHA-256(r
              <sub>i</sub>)만 보냅니다(참가자는 들어올 때).
            </li>
            <li>
              시작할 때 방장이 <b>자기 것까지 모든 해시를 먼저</b> 알립니다.
              참가자는 그 뒤에야 r<sub>i</sub>를 방장에게만 보냅니다.
            </li>
            <li>
              seed = SHA-256(r<sub>0</sub>‖r<sub>1</sub>‖…‖r<sub>n</sub>). 한
              사람이라도 정직하게 무작위 값을 냈다면 아무도 시드를 정할 수
              없습니다.
            </li>
            <li>
              게임이 끝나면 방장이 모든 r<sub>i</sub>를 공개하고, 참가자는
              해시와 맞는지, 자기 값이 그대로인지 확인합니다.
            </li>
          </ol>
          <P>
            r<sub>i</sub>를 시작할 때 모두에게 공개하지 않는 이유: 그러면
            참가자도 시드를 계산해 덱 전체를 알 수 있습니다. 방장은 시드를 알게
            되므로 남의 패를 볼 수는 있습니다(한계 참고).
          </P>
          <CommitRevealDemo />
        </Section>

        <Section id="replay" title="판 끝 검증: 다시 돌려 맞춰 보기">
          <P>
            엔진은 순수 함수입니다. 같은 규칙, 같은 시드, 같은 행동 기록이면
            같은 결과가 나옵니다(<code>step</code>, <code>replay</code>). 게임이
            끝나면 방장은 비밀 값과 행동 기록 전체를 공개하고, 참가자는 기록을
            처음부터 한 걸음씩 다시 돌립니다. 그리고 두 가지를 확인합니다.
          </P>
          <ul className="list-disc pl-5 text-sm leading-relaxed opacity-90">
            <li>
              모든 행동이 규칙에 맞는가 — 방장이 위반을 눈감아 줬거나 결과를
              바꿨다면 여기서 걸립니다.
            </li>
            <li>
              게임 중 받은 화면이 모두, 다시 돌린 화면 목록에 차례대로 들어
              있는가 — 방장이 중간에 다른 화면을 보여 줬다면 여기서 걸립니다.
            </li>
          </ul>
          <P>
            결과는 참가자가 다른 모두에게 <b>직접</b> 알립니다(방장을 거치면
            방장이 숨길 수 있으니까요). 실패하면 그 게임은 무효로 표시되고
            기록이 남습니다. 코드: <code>guest-room.ts</code>의{" "}
            <code>verify</code>.
          </P>
          <ReplayAuditDemo />
        </Section>

        <Section id="identity" title="방장 확인: 링크 속 열쇠 지문과 서명">
          <P>
            링크를 아는 사람은 모두 같은 방에 있습니다. 새로 들어오는 사람에게
            다른 참가자가 먼저 "어서 와, 너는 2번 자리야"라고 답하면 방장 행세를
            할 수 있습니다. 그래서 방장은 방을 열 때 ECDSA P-256 열쇠 쌍을
            만들고, 공개 열쇠의 지문 (SHA-256 앞 16바이트)을 초대 링크에
            넣습니다.
          </P>
          <ol className="list-decimal pl-5 text-sm leading-relaxed opacity-90">
            <li>참가자는 입장 요청에 임의의 값(nonce)을 넣습니다.</li>
            <li>
              방장은 <code>게임|nonce|참가자 연결 아이디|자리|토큰</code>에
              서명해 공개 열쇠와 함께 답합니다.
            </li>
            <li>
              참가자는 공개 열쇠의 지문이 링크와 같은지, 서명이 맞는지, 서명된
              연결 아이디가 자기 것인지 확인한 뒤에야 그 연결을 방장으로
              믿습니다. 그 뒤로는 그 연결의 메시지만 방장 메시지로 받습니다.
            </li>
          </ol>
          <P>
            nonce는 예전 서명을 다시 써먹는 것(재전송)을, 연결 아이디는 진짜
            방장과 참가자 사이에 끼어드는 중간자를 막습니다. 코드:{" "}
            <code>apps/web/src/net/identity.ts</code>.
          </P>
          <HostSignatureDemo />
        </Section>

        <Section id="chat" title="채팅과 사칭">
          <P>
            모든 게임 메시지에는 "어느 연결에서 왔는가"가 붙습니다. 이것은
            메시지 내용이 아니라 WebRTC 연결이 정하므로 고친 프로그램도 바꿀 수
            없습니다. 방장은 이 연결로 자리를 찾아 이름을 붙이므로, 참가자는
            다른 사람인 척 말할 수 없습니다. 참가자끼리 직접 보내는 판 끝 검증
            알림도 대기실에 적힌 자리별 연결 아이디와 맞아야 받습니다.
          </P>
          <ChatRoutingDemo />
        </Section>

        <Section id="pentest" title="모의 침투: 고친 프로그램으로 해 본 공격">
          <P>
            소스 코드를 다 가진 공격자 한 명이 자기 프로그램을 고친다고
            가정하고(나머지는 정상 프로그램), 별도 에이전트가 공격 방법을
            찾았습니다. 항목마다 공격을 실제로 해 보는 시험을 먼저 만들어 정말
            통하는지 확인하고, 고친 뒤 같은 시험이 막히는지 봤습니다(
            <code>apps/web/src/net/attacks.test.ts</code>). 처음에는 아래
            공격들이 실제로 통했습니다.
          </P>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="opacity-60">
                <tr>
                  <th className="py-1 pr-2">공격</th>
                  <th className="pr-2">원인</th>
                  <th>고친 방법</th>
                </tr>
              </thead>
              <tbody>
                {PENTEST.map(([attack, cause, fix]) => (
                  <tr
                    key={attack}
                    className="border-white/10 border-t align-top"
                  >
                    <td className="py-1.5 pr-2 font-semibold">{attack}</td>
                    <td className="pr-2 opacity-80">{cause}</td>
                    <td className="opacity-90">{fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            그대로 둔 것: 다른 사람이 손패 몇 번째에서 카드를 뽑았는지(
            <code>slot</code>)는 보입니다. 오프라인에서 보는 것과 같은 정보라서
            일부러 남겼습니다. 전체 목록:{" "}
            <code>docs/12-redteam-2026-10-21.md</code>.
          </P>
        </Section>

        <Section id="limits" title="한계: 아직 못 막는 것">
          <ul className="list-disc pl-5 text-sm leading-relaxed opacity-90">
            <li>
              <b>방장은 모든 패를 볼 수 있습니다.</b> 엔진이 방장 기기에서 돌기
              때문입니다. 막으려면 멘탈 포커가 필요합니다. 카드를 각자 열쇠로
              잠가(교환 가능한 암호, SRA) 아무도 혼자 덱을 볼 수 없게 하고, 무늬
              따라내기 같은 규칙은 판 끝에 열쇠를 모두 공개해 확인합니다. 설계는
              있지만 아직 만들지 않았습니다. 그래서 모르는 사람과 할 때는{" "}
              <b>방장을 믿을 수 있는 사람에게</b> 맡기세요.
            </li>
            <li>
              <b>방장은 채팅을 지어낼 수 있습니다.</b> 모든 말이 방장을
              거칩니다. 참가자마다 서명 열쇠를 두면 막을 수 있습니다.
            </li>
            <li>
              판 끝 검증은 게임이 끝날 때 한 번입니다. 조작은 잡아내지만 그
              게임이 끝나야 알 수 있습니다.
            </li>
            <li>
              음성 통화로 패를 알려 주는 짜고 치기, 나온 카드를 세 주는 도움
              프로그램은 어떤 구조로도 막을 수 없습니다. 오프라인 마이티와
              같습니다.
            </li>
          </ul>
          <P>
            설계 문서: <code>docs/07-security.md</code>, 모의 침투:{" "}
            <code>docs/12-redteam-2026-10-21.md</code>.
          </P>
        </Section>

        <Section id="learn" title="더 공부하기">
          <ul className="flex flex-col gap-2 text-sm">
            {RESOURCES.map((r) => (
              <li key={r.url}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-300 hover:underline"
                >
                  {r.title}
                </a>
                <span className="opacity-70"> — {r.note}</span>
              </li>
            ))}
          </ul>
        </Section>
      </article>
    </main>
  );
}
