"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import {
  ChatRoutingDemo,
  CommitRevealDemo,
  HostSignatureDemo,
  KeyProofDemo,
  MentalPokerDemo,
  ReplayAuditDemo,
  ShuffleProofDemo,
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
    status: "막음",
    how: "멘탈 포커: 방장 기기에도 자리 표만 있다(컴퓨터 자리 패는 예외)",
    link: "mental-poker",
  },
  {
    attack: "섞기 조작(원하는 패 받기)",
    who: "방장·참가자",
    status: "막음",
    how: "멘탈 포커: 모두가 차례로 잠그고 섞는다. 한 사람만 정직해도 아무도 순서를 모른다",
    link: "mental-poker",
  },
  {
    attack: "내 카드가 아닌 카드 내기",
    who: "참가자",
    status: "막음",
    how: "낸 사람 열쇠로 연 카드가 그 카드여야 한다",
    link: "mental-poker",
  },
  {
    attack: "무늬 안 따르기·조커콜 숨기기",
    who: "참가자",
    status: "잡아냄",
    how: "숨긴 카드가 드러나는 순간 그 자리를 찍고 판을 멈춘다",
    link: "mental-poker",
  },
  {
    attack: "6마 죽이기·프렌드 거짓말",
    who: "참가자",
    status: "잡아냄",
    how: "마지막 턴에 판 전체를 진짜 카드로 다시 계산한다",
    link: "mental-poker",
  },
  {
    attack: "카드 주인 떠보기",
    who: "방장",
    status: "잡아냄",
    how: "죽이기 없이 물으면 다음 화면에서 바로 드러난다",
    link: "mental-poker",
  },
  {
    attack: "규칙 위반 눈감기·결과 조작",
    who: "방장",
    status: "잡아냄",
    how: "판마다(멘탈 포커) 또는 게임 끝에 참가자가 기록을 다시 돌린다",
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
    who: "링크를 아는 사람·신호 서버",
    status: "막음",
    how: "초대 링크의 열쇠 지문 + ECDSA 서명(연결 인증서 지문까지)",
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
    who: "신호 서버·네트워크",
    status: "막음",
    how: "연결 정보는 방 코드로 암호화, 게임 데이터는 WebRTC(DTLS, 순방향 비밀성)",
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
    title: "Barnett & Smart, Mental Poker Revisited (2003)",
    url: "https://doi.org/10.1007/978-3-540-40974-8_29",
    note: "타원곡선 ElGamal + 증명으로 하는 표준 멘탈 포커",
  },
  {
    title: "Bultel & Lafourcade, Secure Trick-Taking Game Protocols (FC 2019)",
    url: "https://eprint.iacr.org/2019/375",
    note: "트릭 게임(스페이드)에서 무늬 안 따르기를 그 자리에서 막는 영지식 증명",
  },
  {
    title: "Bella et al., French Tarot 멘탈 포커 (FC 2023)",
    url: "https://eprint.iacr.org/2023/309",
    note: "따로 두는 카드(독)를 다룬다. 마이티 바닥 카드와 구조가 같다",
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
            <a href="/learn" className="text-sm underline opacity-70">
              처음부터 배우기 →
            </a>
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
              ["mental-poker", "멘탈 포커"],
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

        <Section id="network" title="기기끼리 바로 잇기">
          <svg
            viewBox="0 0 600 200"
            className="w-full"
            role="img"
            aria-label="신호 서버로 서로를 찾고, WebRTC로 방장과 참가자가 바로 이어지는 구조"
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
              신호 서버(byb.kr)
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
            신호 서버는 "이 방에 누가 있나"를 알리는 게시판 역할만 합니다.
            아무것도 저장하지 않고, 지금 같은 방을 보고 있는 사람에게만
            넘깁니다. 연결 정보(SDP)는 방 코드를 비밀번호로 암호화해 올리므로
            서버도 읽지 못하고, 링크를 모르는 사람은 들어올 수
            없습니다(Trystero). 연결이 맺어진 뒤의 게임 데이터는 WebRTC 데이터
            채널(DTLS)로 기기끼리 바로 오가고 신호 서버를 거치지 않습니다. 회사
            와이파이처럼 기기끼리 바로 잇는 길이 막힌 곳에서만 TURN 서버가
            암호화된 채로 중계합니다. 참가자는 방장하고만 게임 메시지를
            주고받습니다(별 모양). 코드:{" "}
            <code>apps/web/src/net/p2p-transport.ts</code>.
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
            되므로 남의 패를 볼 수는 있습니다. 그래서 마이티는 이 위에 멘탈
            포커를 씁니다(아래). 멘탈 포커 판의 시드는 덱을 정하지 않으므로
            시작하자마자 공개합니다.
          </P>
          <CommitRevealDemo />
        </Section>

        <Section id="mental-poker" title="멘탈 포커: 방장도 남의 패를 모르게">
          <P>
            commit-reveal로는 아무도 시드를 마음대로 정할 수 없지만, 엔진을
            돌리는 방장 기기는 시드를 알아서 모든 패를 볼 수 있습니다. 멘탈
            포커는 아예 아무도 덱을 혼자 볼 수 없게 합니다. 마이티(2~7마)와
            하트의 친구와 하기는 모두 이 방식이 기본입니다(대기실에서 끌 수
            있습니다).
          </P>
          <P>
            바탕은 Shamir·Rivest·Adleman(1979)의 교환 가능한 암호(SRA)입니다.
            타원곡선 ristretto255 위에서 카드 점 M을 열쇠 k로 잠그면 k·M이고,
            열쇠끼리 곱해지므로 잠근 순서와 상관없이 풀 수 있습니다. 카드는
            해시로 정한 점으로 나타냅니다(생성원의 배수로 두면 잠근 값에서
            카드를 거꾸로 맞춰 볼 수 있습니다). 처음에는 2048비트 안전 소수의
            거듭제곱(m<sup>k</sup> mod p)을 썼는데, 같은 원리를 타원곡선으로
            옮기니 계산은 열 배쯤 빨라지고 주고받는 값은 8분의 1로 줄었습니다
            (2026-10-27).
          </P>
          <ol className="list-decimal pl-5 text-sm leading-relaxed opacity-90">
            <li>
              섞기: 기기마다 차례로 덱 전체를 자기 열쇠로 잠그고 섞어 넘깁니다.
            </li>
            <li>
              다시 잠그기: 각자 섞기 열쇠를 풀고 자리마다 다른 열쇠로 잠급니다.
              그래야 한 자리 열쇠를 공개해도 다른 자리가 안전합니다.
            </li>
            <li>
              나눠 주기: 자리 s를 j에게 줄 때 j를 뺀 모두가 s의 열쇠를
              공개합니다. j만 마지막 자물쇠를 풀 수 있습니다.
            </li>
            <li>
              내기: 낸 사람이 그 자리 열쇠를 공개하면 모두가 그 카드를 직접
              엽니다. 남의 자리 카드는 열쇠가 없어서 낼 수 없습니다.
            </li>
            <li>
              마지막 턴이 시작되면 모두 남은 열쇠를 공개합니다(남은 카드는 한
              장씩이라 더 숨길 것이 없습니다). 각 기기가 판 전체를 진짜 카드로
              처음부터 다시 계산해 맞춰 봅니다.
            </li>
          </ol>
          <MentalPokerDemo />
          <P>
            <b>방장 엔진은 카드를 모른 채 어떻게 진행할까요?</b> 엔진 상태의
            손패에 카드 대신 "자리 표"(<code>?_12</code> = 12번 자리의 카드)를
            넣습니다. 자리 표는 무늬도 숫자도 없습니다. 각 기기는 받은 화면의
            자리 표를 자기가 연 카드로 바꿔 봅니다. 누가 어느 자리를 갖는지는
            엔진 사건(공개 정보)만 보고 모든 기기가 같은 방법으로 계산합니다.
            그래서 방장이 자리를 더 가져갈 틈이 없습니다. 엔진이 남의 카드를
            알아야 하는 순간에는 그 카드를 가진 기기가 증명을 보냅니다.
          </P>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="opacity-60">
                <tr>
                  <th className="py-1 pr-2">순간</th>
                  <th>증명</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "카드를 낼 때",
                    "낸 사람이 그 자리 열쇠를 공개한다. 연 카드가 낸다고 한 카드여야 한다",
                  ],
                  [
                    "딜미스",
                    "패 전부의 열쇠를 공개한다(원래도 패를 보여 준다)",
                  ],
                  [
                    "6·7마 죽이기",
                    "불린 카드를 가진 사람이 그 자리 열쇠를 공개한다. 바닥 카드와 죽은 사람 카드는 새 자리로 다시 섞는다",
                  ],
                  [
                    "프렌드가 점수를 땄을 때",
                    "그 턴을 이긴 사람이 숨은 프렌드면 프렌드 카드 자리를 공개한다. 이긴 게 맞는지는 그 사람이 직접 계산해 본 뒤에 답한다",
                  ],
                  [
                    "마지막 턴",
                    "모두 열쇠를 공개하고, 각 기기가 판 전체를 진짜 카드로 다시 계산한다",
                  ],
                ].map(([when, proof]) => (
                  <tr key={when} className="border-white/10 border-t align-top">
                    <td className="py-1.5 pr-2 font-semibold">{when}</td>
                    <td className="opacity-90">{proof}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            <b>무늬 안 따르기는 어떻게 잡을까요?</b> 남의 남은 패를 모르니 그
            자리에서는 확인할 수 없습니다. 하지만 마이티는 한 판 동안 손패를 다
            냅니다. 카드 c가 나중에 드러나는 순간 "c는 앞선 턴에도 손에
            있었다"가 확정됩니다. 그 사람이 앞선 턴에 낸 카드를 손패 {"{x, c}"}
            만으로 다시 따져 위반이면 바로 멈춥니다. 엔진의 금지 규칙은 손에
            카드가 늘어도 풀리지 않으므로, 정직한 사람을 잘못 잡는 일은
            없습니다(
            <code>packages/fair-play/src/renege.ts</code>).
          </P>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="opacity-60">
                <tr>
                  <th className="py-1 pr-2">부정</th>
                  <th className="pr-2">언제 잡나</th>
                  <th>누구인지</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "내 카드가 아닌 카드 내기",
                    "바로(방장이 열쇠로 열어 본다)",
                    "그 사람",
                  ],
                  [
                    "무늬 안 따르기·조커콜에 조커 숨기기",
                    "숨긴 카드가 드러날 때, 늦어도 마지막 턴",
                    "그 사람",
                  ],
                  ['6마 죽이기에 "없다" 거짓말', "마지막 턴", "그 사람"],
                  [
                    "숨은 프렌드가 점수를 따고도 숨기기",
                    "마지막 턴",
                    "그 사람",
                  ],
                  ["방장이 죽이기 없이 카드 주인 묻기", "다음 화면", "방장"],
                  [
                    "방장의 진행 조작·컴퓨터 조종·행동 바꿔치기",
                    "마지막 턴",
                    "방장",
                  ],
                  [
                    "섞을 때 카드 바꿔치기, 틀린 열쇠",
                    "카드가 안 열리거나 같은 카드가 두 장일 때",
                    "가릴 수 없음",
                  ],
                ].map(([what, when, who]) => (
                  <tr key={what} className="border-white/10 border-t align-top">
                    <td className="py-1.5 pr-2 font-semibold">{what}</td>
                    <td className="pr-2 opacity-90">{when}</td>
                    <td
                      className={cn(
                        who === "가릴 수 없음" ? "text-rose-300" : "opacity-90",
                      )}
                    >
                      {who}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            찾으면 <b>찾은 기기의 화면</b>에 그 자리와 까닭이 크게 뜨고, 그
            자리판에 "⚠ 부정 감지"가 붙고, 판이 멈춥니다. 그 기기는 다른
            모두에게도 직접 알립니다. 받은 쪽은 이것을 "그 사람의 알림"으로
            채팅에만 남깁니다. 거짓 알림으로 남의 판을 멈추지 못하게 하려는
            것입니다. 정직한 기기는 같은 공개 정보로 같은 계산을 하므로 모두
            같은 결과를 스스로 찾습니다.
          </P>
          <P>
            <b>누가 나가면?</b> 그 사람 카드는 그 사람 열쇠로만 열리므로
            컴퓨터가 대신할 수 없습니다. 열쇠는 탭(sessionStorage)에 남겨 두어,
            새로고침이나 잠깐 끊김은 방장이 그동안의 메시지를 다시 보내 같은
            판을 이어 갑니다. 방장은 언제든 게임을 끝낼 수 있고, 60초가 지나도
            돌아오지 않으면 남은 사람 모두에게 끝내기 투표가 열립니다. 과반이
            끝내기를 고르면 끝납니다.
          </P>
          <P>
            <b>얼마나 걸리나요?</b> 한 컴퓨터에 탭 5~6개를 띄워 모든 자리를
            사람으로 채우고(섞기 사슬이 가장 긴 경우) 예전 2048비트로 두어 보니,
            판 시작에 모두 함께 섞는 시간이 1.3~1.5초, 6마 죽이기 뒤 다시 섞기가
            0.6초쯤 걸렸습니다. 타원곡선으로 옮긴 뒤로는 섞는 계산이 3분의 1
            남짓으로 줄었습니다. 카드를 낼 때는 열쇠 하나를 공개하고 여는
            것뿐이라 느껴지지 않습니다.
          </P>
          <P>
            <b>틀린 열쇠를 낸 사람은?</b> 열쇠를 공개했는데 카드가 열리지
            않으면, 누가 틀린 열쇠를 냈는지 알아야 합니다. 그래서 공개하는
            열쇠에 <b>Chaum–Pedersen 증명</b>(1992)을 붙입니다. "두 쌍이 같은
            비밀 지수로 이어져 있다"를 그 지수를 보이지 않고 증명하는
            방법입니다.
          </P>
          <ol className="list-decimal pl-5 text-sm leading-relaxed opacity-90">
            <li>
              자리마다 다시 잠글 때 각자 I → O = I<sup>u·k</sup>로 잠그고(u는
              섞기 열쇠를 푸는 지수, k는 자리 열쇠), V = g<sup>u</sup>를 함께
              공개합니다. V로는 u를 알 수 없습니다.
            </li>
            <li>
              나중에 자리 열쇠 k를 공개할 때 A = I<sup>k</sup>, B = O로 두고 "B
              = A<sup>u</sup>이고 V = g<sup>u</sup>"를 증명합니다. 무작위 r로 a
              = g<sup>r</sup>, b = A<sup>r</sup>를 만들고, 도전값 c를 해시로
              정해(Fiat–Shamir) z = r + c·u를 냅니다. 확인하는 쪽은 g
              <sup>z</sup> = a·V<sup>c</sup>, A<sup>z</sup> = b·B<sup>c</sup>를
              봅니다. u가 같지 않으면 두 식을 함께 맞출 수 없습니다.
            </li>
            <li>
              열쇠 여러 개는 해시로 정한 가중치를 곱해 한 증명으로 묶습니다.
              열쇠 53개를 증명하는 데도, 확인하는 데도 0.01초쯤
              걸립니다(2048비트일 때는 0.1초 남짓).
            </li>
            <li>
              평소에는 확인하지 않고, 카드가 열리지 않을 때만 그 자리 열쇠들의
              증명을 확인해 틀린 사람을 짚습니다. 증명이 모두 맞으면 섞는
              단계에서 조작한 것입니다(아래 한계).
            </li>
          </ol>
          <KeyProofDemo />
          <P>
            <b>섞을 때 카드를 바꿨다면?</b> 열쇠 증명은 열쇠 거짓말만 잡습니다.
            섞을 때 카드를 바꿔치기하거나 복제하면(그 카드를 엿보려고) 순서가
            섞여 카드끼리 짝이 없으니 다른 증명이 있어야 합니다. 섞은 사람마다{" "}
            <b>섞기 증명</b>(cut-and-choose, Sako–Kilian 1995식)을 냅니다.
          </P>
          <ol className="list-decimal pl-5 text-sm leading-relaxed opacity-90">
            <li>
              증명할 것: 넘긴 덱 Y가 받은 덱 X를 같은 열쇠 e로 잠그고 순서만
              바꾼 것(Y<sub>i</sub> = X<sub>π(i)</sub>
              <sup>e</sup>). 바꿔치기·복제·빼기는 모두 이것을 깹니다.
            </li>
            <li>
              중간 덱 Z = σ(X<sup>t</sup>)를 16벌 먼저 냅니다(σ는 무작위 순서,
              t는 무작위 수). 도전이 0이면 σ와 t를 보여 X → Z를, 1이면 Z → Y를
              열쇠 증명과 같은 방법으로 보입니다. 둘 다 보이면 e와 π가
              드러나지만 한 쪽만 보이므로 아무것도 새지 않습니다. 거짓 덱은 둘
              중 하나가 틀려 한 번에 ½로 들키고, 16번이면 빠져나갈 확률이 2
              <sup>-16</sup>입니다.
            </li>
            <li>
              도전값은 모두가 함께 정합니다. 섞을 때 비밀 값의 해시를 걸고,
              모두의 중간 덱이 모인 뒤 비밀 값을 공개해 해시합니다. 한 사람만
              정직해도 아무도 미리 알 수 없습니다.
            </li>
            <li>
              섞은 덱은 바로 넘기고 증명은 내 카드가 열린 뒤에 보내 판 시작이
              늦어지지 않습니다(만들기 0.3초, 하나 확인 0.2초. 2048비트일 때는
              1.6초와 0.9초). 틀리거나 30초 안에 응답하지 않으면 그 사람을
              짚습니다. 6·7마 다시 섞기도 같습니다.
            </li>
          </ol>
          <ShuffleProofDemo />
          <P>
            <b>남은 영지식 증명은?</b> 더 강한 섞기 증명(Neff, Bayer–Groth)은 한
            번에 거의 확실하게 증명하고, "남은 카드에 선 무늬가 없다"는
            Bultel·Lafourcade(FC 2019)의 방식이 있습니다. 표준적인 다음 단계는
            Barnett·Smart(2003)의 타원곡선 ElGamal에 이 증명들을 붙이는
            것입니다. 설계와 조사: <code>docs/13-mental-poker.md</code>,{" "}
            <code>docs/15-shuffle-proof.md</code>.
          </P>
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
              방장은{" "}
              <code>
                게임|nonce|참가자 연결 아이디|자리|토큰|방장 인증서 지문|참가자
                인증서 지문
              </code>
              에 서명해 공개 열쇠와 함께 답합니다. 인증서 지문은 이 연결을
              암호화하는 WebRTC(DTLS) 인증서의 지문입니다.
            </li>
            <li>
              참가자는 공개 열쇠의 지문이 링크와 같은지, 서명이 맞는지, 서명된
              연결 아이디와 인증서 지문이 자기 연결에서 본 것과 같은지 확인한
              뒤에야 그 연결을 방장으로 믿습니다. 그 뒤로는 그 연결의 메시지만
              방장 메시지로 받습니다.
            </li>
          </ol>
          <P>
            nonce는 예전 서명을 다시 써먹는 것(재전송)을, 연결 아이디는 진짜
            방장과 참가자 사이에 끼어드는 중간자를 막습니다. 인증서 지문은
            서로를 찾게 해 주는 신호 서버가 연결 정보를 바꿔치기해 가운데 끼는
            것을 막습니다. 그러면 참가자가 연결한 상대는 신호 서버의 인증서라
            방장이 서명한 지문과 다릅니다. 신호 서버는 방장 서명 열쇠가 없어
            지문을 고쳐 다시 서명할 수 없습니다(메신저의 "보안 코드 비교"를
            기계가 하는 셈입니다). 코드:{" "}
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
              <b>컴퓨터 자리 패는 방장 기기가 봅니다.</b> 컴퓨터는 방장 기기에서
              돌기 때문에 그 카드도 방장 기기가 엽니다. 모르는 사람과 할 때는
              빈자리를 사람으로 채우세요. 멘탈 포커를 끈 방은 예전처럼 방장
              기기가 모든 패를 압니다.
            </li>
            <li>
              <b>방장이 아예 나가면 방이 끝납니다.</b> 방장 기기에 엔진과
              방장·컴퓨터 자리 열쇠가 있기 때문입니다. 같은 탭에서 새로고침한
              것은 탭에 남긴 진행·열쇠·서명 열쇠로 그 판을 이어 가고, 잠깐 끊긴
              것은 참가자가 기다렸다 이어 갑니다(60초).
            </li>
            <li>
              <b>
                섞기 조작은 2<sup>-16</sup> 확률로 빠져나갈 수 있습니다.
              </b>{" "}
              그래도 판 끝에 같은 카드가 드러나 판은 멈춥니다. 틀린 열쇠와 섞기
              조작은 증명으로 누가 했는지 짚습니다.
            </li>
            <li>
              무늬 안 따르기는 그 자리에서 막지 못하고, 숨긴 카드가 드러날 때
              잡습니다. 잡히면 판은 무효가 되고, 그때까지 드러난 카드는 이미
              보인 뒤입니다.
            </li>
            <li>
              <b>방장은 채팅을 지어낼 수 있습니다.</b> 모든 말이 방장을
              거칩니다. 참가자마다 서명 열쇠를 두면 막을 수 있습니다.
            </li>
            <li>
              멘탈 포커를 끈 방의 판 끝 검증은 게임이 끝날 때 한 번입니다. 멘탈
              포커 판은 판마다 마지막 턴에 확인합니다.
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
