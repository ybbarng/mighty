import {
  type CheckResult,
  displayRound,
  drandTime,
  type PublicLedger,
  problemText,
  RANKS,
  roundTimes,
  scheduleFromRecords,
  type TicketFinding,
} from "@mighty/stardraw-core";

/** 검사 결과를 터미널 글로 옮긴다(시험하기 쉽게 문자열만 만든다) */

const STATUS: Record<string, string> = {
  pass: "통과  ",
  fail: "실패  ",
  skip: "건너뜀",
  warn: "주의  ",
};

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 한국 시각 "10/30 11:55" */
export function kst(seconds: number): string {
  const p = Object.fromEntries(
    PARTS.formatToParts(new Date(seconds * 1000)).map((x) => [x.type, x.value]),
  );
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
}

/** 회차마다 한 줄: 보이는 회차, 마감, 응모 수, 당첨 번호(또는 무효), 그 회차의 실패·건너뜀 */
export function roundLines(
  result: CheckResult,
  ledger: PublicLedger,
): string[] {
  const lines: string[] = [];
  // 취소된 일정 바꾸기를 뺀 지금 일정표로 모든 회차를 센다(바뀐 줄 앞 회차의 시각은 그대로다)
  const schedule = scheduleFromRecords(ledger.genesis, ledger.records);
  for (const [i, record] of ledger.records.entries()) {
    const round = i + 1;
    const { closesAt } = roundTimes(schedule, round);
    const label = displayRound(schedule, round).label;
    const count = ledger.tickets[i]?.length ?? 0;
    const winners = RANKS.map((r) => record.winners[r].length);
    const draw = record.void
      ? "무효 회차(당첨 없음)"
      : `당첨 번호 ${record.numbers.join(" ")} + ${record.bonus} · 당첨 ${
          winners
            .map((n, k) => (n > 0 ? `${k + 1}등 ${n}` : ""))
            .filter(Boolean)
            .join(", ") || "없음"
        }`;
    const problems = result.problems.filter((p) => p.round === round);
    const skipped = result.skipped.filter((s) => s.startsWith(`${round}회차:`));
    lines.push(
      `${problems.length > 0 ? "실패" : "통과"}  ${label}(사슬 ${round}) 마감 ${kst(closesAt)} · 응모 ${count}장 · ${draw}`,
    );
    for (const p of problems) lines.push(`        문제: ${p.message}`);
    for (const s of skipped)
      lines.push(`        건너뜀: ${s.slice(`${round}회차: `.length)}`);
  }
  return lines;
}

export function ledgerReport(
  base: string,
  result: CheckResult & { ledger: PublicLedger },
  findings: { query: string; finding: TicketFinding }[] = [],
  /** 원천에 대한 줄(아직 앵커에 오르지 않은 회차, 두 원천 대조) */
  notes: string[] = [],
): string {
  const failed = result.items.some((i) => i.status === "fail");
  const ticketFailed = findings.some(
    ({ finding }) => !finding.found || !finding.included,
  );
  const out: string[] = [];
  out.push(`하늘의 별 따기 공개 장부 검사 · ${base}`);
  out.push(
    `${result.mode === "trial" ? "시험" : "정식"} 장부 · 닫힌 회차 ${result.rounds}개 · 응모권 ${result.tickets}장 · 열쇠 등록 ${result.registrations}개 · 작업 증명 계산 ${result.powChecked}장`,
  );
  out.push(...notes);
  out.push("");
  out.push("[회차별]");
  const rounds = roundLines(result, result.ledger);
  out.push(...(rounds.length > 0 ? rounds : ["  닫힌 회차가 없습니다"]));
  out.push("");
  out.push("[항목별]");
  for (const item of result.items) {
    out.push(`${STATUS[item.status]}  ${item.label}`);
    if (item.detail) out.push(`        ${item.detail}`);
  }
  const whole = result.problems.filter((p) => p.round === 0);
  for (const p of whole) out.push(`        문제: ${problemText(p)}`);
  out.push("");
  out.push(...directorLines(result));
  out.push(...qualificationLines(result));
  if (findings.length > 0) {
    out.push("");
    out.push("[내 응모권]");
    for (const { query, finding } of findings)
      out.push(...ticketLines(query, finding, result.ledger));
  }
  out.push("");
  out.push(`장부 끝 해시 ${result.head}`);
  out.push(
    failed
      ? "결과: 규칙에 어긋나는 곳이 있습니다"
      : ticketFailed
        ? "결과: 장부는 모든 확인을 통과했지만, 확인하려던 응모권을 장부에서 찾지 못했습니다"
        : "결과: 모든 확인을 통과했습니다(건너뜀은 확인할 수단이 없거나 표본 밖인 것)",
  );
  // 주의(예: 무효 회차)는 통과를 바꾸지 않지만 결과 줄에 묻히지 않게 한 번 더 적는다
  const warns = result.items.filter((i) => i.status === "warn");
  for (const w of warns)
    out.push(`주의: ${w.label}${w.detail ? ` — ${w.detail}` : ""}`);
  return out.join("\n");
}

export function ticketLines(
  query: string,
  finding: TicketFinding,
  ledger: PublicLedger,
): string[] {
  if (!finding.found) return [`못 찾음  ${query}: ${finding.reason}`];
  const label = displayRound(ledger.genesis, finding.round).label;
  const record = ledger.records[finding.round - 1];
  const drawAt = record ? kst(drandTime(record.drandRound)) : "";
  const result = finding.void
    ? "무효 회차라 추첨하지 않았습니다"
    : finding.rank
      ? `${finding.rank}등 당첨`
      : "낙첨";
  return [
    `${finding.included ? "찾음  " : "실패  "}  ${label}(사슬 ${finding.round}) 응모권 ${finding.id}`,
    `        고른 번호 ${finding.ticket.numbers.join(" ")} · 추첨 ${drawAt} · ${result}`,
    finding.included
      ? "        머클 증명: 그 회차 기록의 응모권 루트에 들어 있습니다(작업 증명도 전부 계산했습니다)"
      : "        머클 증명: 기록의 응모권 루트와 맞지 않습니다",
  ];
}

/**
 * 국장 열쇠 내력(docs/36 11-12): 언제 어느 열쇠(지문)가 누구 서명으로 지정·빼기됐는지.
 * 서버 설정으로 국장 열쇠를 몰래 바꿔도 장부의 지정 기록으로 여기 드러난다
 */
export function directorLines(result: CheckResult): string[] {
  const out = ["[국장 열쇠 내력]"];
  if (result.directors.length === 0) {
    out.push(
      "  국장 열쇠 지정 기록이 없습니다(운영 기록을 낼 수 있는 국장이 없음)",
    );
    return out;
  }
  const STATUS_TEXT = {
    pending: "예고 중",
    applied: "효력",
    cancelled: "취소됨",
  };
  for (const d of result.directors)
    out.push(
      `  사슬 ${d.round} 기록 · ${d.action} ${d.fingerprint} · 서명 ${d.signedBy} · ${d.effectiveRound}회차부터 · ${STATUS_TEXT[d.status]}${d.cancelledIn ? `(사슬 ${d.cancelledIn}에서)` : ""}`,
    );
  const others = result.operations.operations.filter(
    (o) => o.kind !== "director-add" && o.kind !== "director-remove",
  );
  if (others.length > 0) {
    out.push("[운영 기록]");
    for (const o of others)
      out.push(
        `  사슬 ${o.round} 기록 · ${o.summary} · 서명 ${o.signedBy} · ${o.kind === "cancel" ? "바로" : `${o.effectiveRound}회차부터`} · ${STATUS_TEXT[o.status]}`,
      );
  }
  return out;
}

/** 소속과 상품 자격(docs/36 11-13): 자격 기간마다 발급 수와 응모권에 쓰인 서로 다른 자격 수 */
export function qualificationLines(result: CheckResult): string[] {
  if (result.qualification.length === 0) return [];
  const day = (s: number) => new Date(s * 1000).toISOString().slice(0, 10);
  return [
    "[소속]",
    ...result.qualification.map(
      (p) =>
        `  ${p.affiliationName} ${p.number}기 · ${day(p.startsAt)}~${day(p.endsAt)} · ${p.from}회차부터 · 도장 열쇠 ${p.fingerprint} · 발급 ${p.issued} · 쓰인 증서 ${p.used}`,
    ),
  ];
}
