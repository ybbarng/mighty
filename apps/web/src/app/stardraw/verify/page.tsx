import type { Metadata, Viewport } from "next";

import { MadeWith } from "@/components/brand/MadeWith";
import { LedgerCheck, VectorTable } from "@/stardraw/verify/VerifyTools";

export const metadata: Metadata = {
  title: { absolute: "하늘의 별 따기 검증하기 · Stardraw" },
  description:
    "하늘의 별 따기 공개 장부를 직접 다시 계산하는 데 필요한 것: 장부 파일, 계산 규칙, 시험 값, 장부 전체 검사.",
};

export const viewport: Viewport = { themeColor: "#070d19" };

const SOURCE =
  "https://github.com/ybbarng/mighty/tree/main/packages/stardraw-core/src";

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="font-bold text-xl">{title}</h2>
      {children}
    </section>
  );
}

function Rule({
  title,
  file,
  children,
}: {
  title: string;
  /** 규칙 코드 파일. 아직 코드가 없으면 비워 둔다 */
  file?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-white/90">
        {title}{" "}
        {file && (
          <a
            href={`${SOURCE}/${file}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono font-normal text-amber-100/70 text-xs underline underline-offset-2"
          >
            {file}
          </a>
        )}
      </h3>
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[12px] text-white/85 leading-relaxed">
      {children}
    </pre>
  );
}

const li = "list-disc space-y-1.5 pl-5 text-white/80";

/** 하늘의 별 따기 검증하기: 직접 다시 계산하려는 개발자용(비개발자용 설명은 /stardraw/about) */
export default function StardrawVerify() {
  return (
    <main
      data-game="stardraw"
      className="sd-night min-h-dvh px-4 pt-6 pb-12 text-white"
    >
      <article className="mx-auto flex max-w-2xl flex-col gap-10 break-keep leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href="/stardraw/about"
            className="self-start text-sm text-white/70 hover:text-white"
          >
            ← 하늘의 별 따기 설명
          </a>
          <h1 className="font-black text-3xl">검증하기</h1>
          <p className="text-white/75">
            공개 장부만으로 모든 회차를 처음부터 다시 계산하는 데 필요한 것을
            모았습니다. 규칙은 참조 구현(
            <a
              href={SOURCE}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              packages/stardraw-core
            </a>
            )이 기준이고, 아래 시험 값으로 다른 언어의 구현을 맞춰 볼 수
            있습니다.
          </p>
        </header>

        <Section title="공개 데이터" id="data">
          <p className="text-white/80">
            모두 <code className="font-mono">/stardraw-api</code> 아래에
            있습니다. 바이너리는 base64url(덧붙임 없음)로 담깁니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <tbody className="[&_td]:border-white/10 [&_td]:border-b [&_td]:py-1.5 [&_td]:align-top">
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    ledger/genesis.json
                  </td>
                  <td className="text-white/75">
                    처음 일정표 <code>schedule</code>(epoch, 회차 길이 줄, 시험
                    표시 <code>ledger: &quot;trial&quot;</code>, 옮겨 온 등록의
                    수·루트 <code>carried</code>)와 옮겨 온 등록 목록
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    ledger/head.json
                  </td>
                  <td className="text-white/75">
                    닫힌 회차 수 <code>rounds</code>, 마지막 기록 해시{" "}
                    <code>head</code>, 봉인한 회차 수 <code>sealed</code>, 서버
                    공개 열쇠 <code>serverKey</code>(영수증 서명 확인)
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    ledger/seals/000001.json
                  </td>
                  <td className="text-white/75">
                    마감 직후의 봉인: 응모 수·머클 루트, 등록 수·루트,{" "}
                    <code>digest</code>(봉인 값), <code>loggedAt</code>, 바깥
                    시각 증거 <code>log</code>. drand 값보다 먼저 나옵니다
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    ledger/rounds/000001.json
                  </td>
                  <td className="text-white/75">
                    회차 기록 <code>record</code>, 응모권 목록{" "}
                    <code>tickets</code>, 열쇠 등록 목록{" "}
                    <code>registrations</code>(둘 다 id 사전 순)
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    api/state
                  </td>
                  <td className="text-white/75">
                    지금 회차, 닫힌 회차 수, 문제 값, 응모 수, 모드
                  </td>
                </tr>
                <tr>
                  <td className="pr-3 font-mono text-amber-100/90">
                    api/passkeys/:id
                  </td>
                  <td className="text-white/75">
                    패스키 번호(credential id)로 등록된 공개 열쇠 찾기
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="계산 규칙" id="rules">
          <Rule title="공통" file="bytes.ts">
            <ul className={li}>
              <li>
                해시는 SHA-256. 정수는 빅엔디언, 가변 길이 값은 앞에 u16 길이를
                붙입니다.
              </li>
              <li>
                <code>taggedHash(tag, x) = SHA-256(utf8(tag) ‖ 00 ‖ x)</code>.
                용도가 다르면 같은 바이트도 다른 해시가 됩니다.
              </li>
            </ul>
          </Rule>

          <Rule title="응모권" file="ticket.ts">
            <Code>{`body = v(u8=1) ‖ round(u32) ‖ numbers(6바이트, 1~45 서로 다름, 오름차순)
     ‖ pub(65, 압축하지 않은 P-256) ‖ nonce(u32)          = 80바이트
응모권 = body ‖ 서명
id    = taggedHash("stardraw/ticket/v1", body)       서명은 id에 들어가지 않습니다
작업 증명 대상 = body에서 nonce를 뺀 앞 76바이트(ticketContent)
서명할 내용 = utf8("stardraw/ticket-sig/v1") ‖ 00 ‖ body`}</Code>
          </Rule>

          <Rule title="서명" file="signature.ts">
            <Code>{`서명 = kind(u8)
  1 ‖ r‖s(64)                                원시 P-256(ECDSA SHA-256)
  2 ‖ authenticatorData ‖ clientDataJSON ‖ DER 서명   (각각 u16 길이 + 바이트) 패스키`}</Code>
            <ul className={li}>
              <li>
                패스키는{" "}
                <code>authenticatorData ‖ SHA-256(clientDataJSON)</code>에 대한
                ES256 서명입니다.
              </li>
              <li>
                clientDataJSON: <code>type</code>이{" "}
                <code>&quot;webauthn.get&quot;</code>, <code>challenge</code>가{" "}
                <code>base64url(SHA-256(서명할 내용))</code>,{" "}
                <code>origin</code>이 <code>https://game.byb.kr</code>,{" "}
                <code>crossOrigin</code>이 true가 아님.
              </li>
              <li>
                authenticatorData: 앞 32바이트가{" "}
                <code>SHA-256(&quot;game.byb.kr&quot;)</code>(rpId), flags의
                UP(0x01)가 켜져 있음. 크기 상한은 authenticatorData 512,
                clientDataJSON 1024, DER 72바이트.
              </li>
              <li>응모자 id = SHA-256(공개 열쇠) 앞 16바이트.</li>
            </ul>
          </Rule>

          <Rule title="열쇠 등록과 옮겨 온 등록" file="registration.ts">
            <Code>{`등록 = v(u8=1) ‖ kind(u8: 1 원시, 2 패스키) ‖ credentialId(u16 길이 + 바이트)
     ‖ pub(65) ‖ nonce(u32)
id   = taggedHash("stardraw/registration/v1", 등록 바이트)
작업 증명 대상 = utf8("stardraw/register/v1") ‖ 00 ‖ (nonce를 뺀 앞부분)`}</Code>
            <ul className={li}>
              <li>
                응모권의 열쇠는 그 회차까지 등록돼 있어야 합니다. 같은 열쇠,
                같은 패스키 번호는 장부에 한 번만 들어갑니다(먼저 들어간 것).
              </li>
              <li>
                등록은 그 회차 기록의 <code>registrationCount</code>·
                <code>registrationRoot</code>(id 사전 순 머클 루트)에 묶입니다.
              </li>
              <li>
                정식 장부는 시험 장부의 패스키 등록을 옮겨 올 수 있습니다.
                목록은 genesis.json에 있고, 수와 루트가 처음 일정표의{" "}
                <code>carried</code>에 들어가 genesis 해시에 묶입니다. 옮긴
                등록은 작업 증명을 다시 보지 않습니다.
              </li>
            </ul>
          </Rule>

          <Rule title="작업 증명" file="pow.ts">
            <Code>{`h = Argon2id(password = u16 길이 ‖ 대상 ‖ nonce(u32), salt = 문제 값(32),
             memory 16MiB, iterations 1, parallelism 1, 32바이트)
h 앞 4바이트(u32) < 목표값 이면 통과
문제 값 = 앞 회차 기록 해시(1회차는 genesis 해시)
목표값  = 일정표 줄의 powTarget(응모권), registerPowTarget(등록)`}</Code>
            <p className="text-white/80">
              검사기는 회차마다 공개 seed로 고른 몇 장만 계산해도 됩니다(내
              응모권과 당첨 응모권은 늘 전부). 표본 seed는{" "}
              <code>
                taggedHash(&quot;stardraw/sample/v1&quot;, drand 난수)
              </code>
              (무효 회차는 머클 루트 ‖ 앞 기록 해시)이고, n장 가운데 j번째로
              고르는 자리는{" "}
              <code>
                taggedHash(&quot;stardraw/sample-pick/v1&quot;, seed ‖ j(u32))
              </code>{" "}
              앞 4바이트(u32) mod n 입니다. 같은 자리가 나오면 다음 j로
              넘어갑니다.
            </p>
          </Rule>

          <Rule title="머클 루트" file="merkle.ts">
            <ul className={li}>
              <li>
                RFC 6962: 잎 <code>SHA-256(00 ‖ 잎)</code>, 가지{" "}
                <code>SHA-256(01 ‖ 왼쪽 ‖ 오른쪽)</code>. n개는 n보다 작은 가장
                큰 2의 거듭제곱 k에서 왼쪽 k개, 오른쪽 나머지로 나눕니다. 빈
                목록은 <code>SHA-256(빈 바이트)</code>.
              </li>
              <li>
                잎은 응모권 id(또는 등록 id)를 사전 순으로 정렬한 것입니다.
              </li>
            </ul>
          </Rule>

          <Rule title="회차 시각과 drand 회차" file="schedule.ts">
            <Code>{`일정표 = epoch + 줄들 { fromRound, length, closeMargin, powTarget, registerPowTarget }
회차 k: 앞 줄들의 길이를 더해 opensAt, closesAt = opensAt + length
drand 회차 = closesAt + 300초 이후(같거나 뒤) 처음 나오는 quicknet 회차
quicknet 회차 r의 시각 = 1692803367 + (r − 1) × 3`}</Code>
            <ul className={li}>
              <li>
                일정 변경은 회차 기록의 <code>scheduleChanges</code>에 들어가고,
                그 회차 마감 + 24시간 뒤에 시작하는 회차부터 적용됩니다.
              </li>
              <li>
                quicknet: 체인 해시{" "}
                <code className="break-all">52db9ba7…e971</code>, 스킴
                bls-unchained-g1-rfc9380. 메시지는{" "}
                <code>SHA-256(회차(u64))</code>, 서명은 G1 48바이트, DST{" "}
                <code className="break-all">
                  BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_
                </code>
                . 난수 = <code>SHA-256(서명)</code>.
              </li>
            </ul>
          </Rule>

          <Rule title="봉인 값과 무효 회차" file="round.ts">
            <Code>{`sealDigest = taggedHash("stardraw/seal/v1",
               round(u32) ‖ count(u32) ‖ merkleRoot(32) ‖ registrationCount(u32) ‖ registrationRoot(32))
무효 회차: rootLoggedAt = 0, 또는 rootLoggedAt < closesAt,
          또는 rootLoggedAt ≥ drand 회차 시각`}</Code>
            <p className="text-white/80">
              무효 회차는 당첨 번호와 당첨자 없이 기록만 남습니다.
            </p>
          </Rule>

          <Rule title="봉인이 추첨보다 먼저였다는 증거">
            <p className="text-white/80">
              마감 직후 봉인 값으로 공개 시각 인증 기관(RFC 3161 TSA) 여러
              곳에서 시각 인증 토큰을 받습니다. 토큰마다 다음을 확인합니다.
            </p>
            <ul className={li}>
              <li>
                <code>messageImprint</code>가 SHA-256이고 값이 봉인
                값(sealDigest)과 같다
              </li>
              <li>
                <code>genTime</code> &lt; drand 회차 시각
              </li>
              <li>
                토큰 서명이 미리 정해 둔 TSA 인증서로 확인된다(인증서를 고정해
                둠)
              </li>
            </ul>
          </Rule>

          <Rule title="당첨 번호와 등수" file="draw.ts">
            <Code>{`seed = taggedHash("stardraw/seed/v1", round(u32) ‖ drand 난수(32))
블록 i = taggedHash("stardraw/draw/v1", seed ‖ i(u32)),  i = 0, 1, 2, …
블록의 바이트 b를 차례로: b ≥ 225 이면 버림, 아니면 n = b mod 45 + 1, 이미 나온 n은 건너뜀
7개가 될 때까지 → 앞 6개 당첨 번호(오름차순으로 기록), 7번째 보너스`}</Code>
            <p className="text-white/80">
              머클 루트·응모 수처럼 운영자가 바꿀 수 있는 값은 seed에 넣지
              않습니다. 등수는 6/45 로또와 같습니다: 1등 6개, 2등 5개 + 보너스,
              3등 5개, 4등 4개, 5등 3개.
            </p>
          </Rule>

          <Rule title="회차 기록과 사슬" file="record.ts">
            <Code>{`기록 = v(u8=1) ‖ round(u32) ‖ prev(32) ‖ count(u32) ‖ merkleRoot(32)
     ‖ registrationCount(u32) ‖ registrationRoot(32) ‖ rootLoggedAt(u64) ‖ void(u8)
     ‖ drandRound(u64) ‖ drandSig(u16 길이 + 바이트) ‖ numbers(6) ‖ bonus(u8)
     ‖ 등수 1~5마다 [개수(u32) ‖ 응모권 id(32) × 개수]
     ‖ 일정 변경 [개수(u16) ‖ (u32 × 5) × 개수]
     ‖ 별명 [개수(u16) ‖ …]
기록 해시 = taggedHash("stardraw/record/v1", 기록)      다음 회차의 prev이자 문제 값
genesis 해시 = taggedHash("stardraw/genesis/v1" | "stardraw/genesis-trial/v1",
               epoch(u64) ‖ 줄 수(u16) ‖ 줄마다 u32 × 5 [‖ carried 수(u32) ‖ 루트(32)])`}</Code>
            <p className="text-white/80">
              시험 장부는 genesis 꼬리표가 달라 정식 장부와 사슬이 처음부터
              갈립니다. 무효 회차는 numbers 0 × 6, bonus 0, drandSig 빈
              바이트입니다.
            </p>
          </Rule>

          <Rule title="별 세 개(당첨자 확인)" file="sas.ts">
            <Code>{`양쪽이 요청마다 임시 P-256 ECDH 열쇠를 만들고 공개 열쇠만 주고받는다
공유 비밀 = ECDH(내 임시 비밀 열쇠, 상대 임시 공개 열쇠)   32바이트
seed     = taggedHash("stardraw/sas/v1", 공유 비밀 ‖ 요청 id(u16 길이 + utf8))
블록 i   = taggedHash("stardraw/sas-draw/v1", seed ‖ i(u32)) — 당첨 번호와 같은 거절 표본, 3개
당첨자가 서명하는 문구 = 요청 문구 | 확인자 임시 공개 열쇠 | 당첨자 임시 공개 열쇠 (base64url)`}</Code>
            <p className="text-white/80">
              서버는 공개 열쇠만 보므로 별을 알 수 없습니다. 서명이 응모권의
              열쇠로 했는지는 확인하는 쪽 브라우저가 장부로 직접 검사합니다.
            </p>
          </Rule>
        </Section>

        <Section title="시험 값" id="vectors">
          <p className="text-white/80">
            각 값은 이 브라우저에서 규칙 코드로 다시 계산해 맞춰 봅니다. 같은
            값이 참조 구현의 시험(<code>vectors.test.ts</code>)에도 들어
            있습니다.
          </p>
          <VectorTable />
        </Section>

        <Section title="장부 전체 검사" id="check">
          <p className="text-white/80">
            공개 장부 파일을 처음부터 받아 다시 계산합니다: 일정표, 기록 사슬,
            열쇠 등록, 응모권 서명과 한 사람 한 장, 머클 루트, 봉인 파일, drand
            회차와 BLS 서명, 무효 규칙, 당첨 번호와 등수, 장부 끝 해시. 작업
            증명은 회차마다 표본 8장입니다.
          </p>
          <LedgerCheck />
          <p className="text-white/80">브라우저 콘솔에서도 부를 수 있습니다.</p>
          <Code>{`// 장부 전체 검사
await stardraw.verify()
// 작업 증명까지 전부
await stardraw.verify({ powSample: Infinity })
// 시험 값 다시 계산
await stardraw.vectors()`}</Code>
        </Section>

        <Section title="믿는 것과 안 믿는 것" id="trust">
          <h3 className="font-semibold text-white/90">
            운영자가 할 수 없는 일
          </h3>
          <ul className={li}>
            <li>당첨 번호를 고르거나 미리 알기(drand 값이 마감 뒤에 나옴)</li>
            <li>남의 응모권을 만들거나 당첨을 가로채기(서명)</li>
          </ul>
          <h3 className="font-semibold text-white/90">하면 드러나는 일</h3>
          <ul className={li}>
            <li>지난 회차 기록 고치기, 사람마다 다른 장부 보이기(기록 사슬)</li>
            <li>응모권 끼워 넣기·빼기, 번호 바꾸기(머클 루트, 봉인 파일)</li>
            <li>당첨 번호·등수 속이기, 다른 drand 회차 쓰기(다시 계산)</li>
            <li>영수증을 받은 응모권 빼기(서버 서명 영수증이 증거가 됨)</li>
          </ul>
          <h3 className="font-semibold text-white/90">막지 못하는 일</h3>
          <ul className={li}>
            <li>특정 응모권을 받지 않기(당사자만 알 수 있음)</li>
            <li>운영자가 여러 열쇠로 응모하기(남과 같은 작업 증명 비용)</li>
            <li>서버가 멈추면 회차가 무효가 되거나 밀림</li>
          </ul>
        </Section>

        <Section title="지금의 한계" id="limits">
          <ul className={li}>
            <li>
              시험 운영 중이라 봉인 값의 시각 인증(TSA)을 받지 않습니다. 그래서
              봉인이 drand 값보다 먼저였다는 것을 서버 밖에서 증명할 수
              없습니다. 장부 전체 검사도 이 항목을 건너뜁니다.
            </li>
            <li>
              이 페이지와 화면 코드는 운영자가 내줍니다. 코드 해시 공개, 재현
              가능한 빌드, 서버를 거치지 않는 독립 터미널 검사기는 아직
              없습니다. 가장 독립적인 검사는 위 규칙대로 직접 짠 검사기입니다.
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
