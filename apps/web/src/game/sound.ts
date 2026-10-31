/**
 * 효과음. 음원 파일 없이 Web Audio로 그때그때 합성한다(라이선스 걱정이 없고 받을 파일도 없다).
 * 어떤 장면에 어떤 소리를 내는지는 원작 Mighty Network 4.0을 따른다(docs/16).
 *
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 첫 누름에서 AudioContext를 열어 두어
 * 컴퓨터 차례처럼 누름 없이 나는 첫 소리도 막히지 않게 한다(특히 iOS).
 */
import { createRng, nextFloat } from "@mighty/engine";

import { FLIGHT_MS } from "./timing";

/**
 * 소리마다 조금씩 다르게 들리게 하는 난수. 평소에는 Math.random이고,
 * renderCue는 씨앗을 고정해 같은 소리를 몇 번 그려도 똑같이 나오게 한다(크기 시험이 흔들리지 않게)
 */
let random: () => number = Math.random;

export type Cue =
  /** 일반 카드 내기 */
  | "card"
  /** 키티 받기, 버릴 카드 고르기(원작 카드받기) */
  | "pickCard"
  /** 버릴 카드 확정·딜미스(원작 카드셋) */
  | "cardSet"
  | "shuffle"
  /** 나눠 주기: 카드 묶음 하나가 날아가 닿는 소리 */
  | "deal"
  /** 판 시작(원작 게임시작 "솨악!") */
  | "gameStart"
  | "bid"
  | "pass"
  /** 주공 당선, 선거 끝 공지(원작 공지 "짠~") */
  | "announce"
  | "mighty"
  | "joker"
  | "jokerCall"
  /** 조커콜에 걸려 힘을 잃은 조커 */
  | "deadJoker"
  /** 찍기(간): 선 무늬가 없어 기루다로 자르기 */
  | "gan"
  | "friend"
  /** 야당이 점수 카드를 가져갈 때 */
  | "scored"
  /** 6·7마 죽이기 */
  | "kill"
  | "win"
  | "lose"
  | "dealMiss"
  | "invalid"
  /** 시작 화면 메뉴(원작 철컥) */
  | "click"
  /** 공약·프렌드 창에서 고르기(원작 삑) */
  | "beep"
  /** 하트: 스페이드 Q */
  | "queenOfSpades"
  /** 하트: 하트가 처음 깨질 때 */
  | "heartsBroken"
  /** 하트: 내가 벌점 카드를 가져갈 때 */
  | "penalty"
  /** 하트: 한 판이 끝나 점수표가 뜰 때 */
  | "roundEnd"
  /** 오목: 나무 판에 돌을 놓는 "딱" */
  | "stone"
  /** 장기: 나무 기물을 판에 놓는 묵직한 "탁" */
  | "piece"
  /** 장기: 상대 기물을 쳐서 잡는 "탁-딱" */
  | "capture"
  /** 장기: 장군을 부르는 짧은 나팔 */
  | "check"
  /** 화투: 패를 바닥에 치는 "착" */
  | "hwatuSlap"
  /** 화투: 더미에서 한 장 뒤집는 "사락" */
  | "hwatuFlip"
  /** 화투: 약(초약·홍단 등)이나 점수가 남 */
  | "yak"
  /** 고스톱: "고!" */
  | "go"
  /** 나이롱뽕: "뽕!" */
  | "ppong"
  /** 숫자야구: 스트라이크가 나온 답(공이 미트에 꽂히는 "팡") */
  | "strike"
  /** 숫자야구: 볼만 나온 답(미트에 부드럽게 받는 "퍽") */
  | "ball"
  /** 숫자야구: 다 맞힌 답(방망이 "딱"과 관중 함성) */
  | "homerun"
  /** 하늘의 별 따기: 추첨 룰렛 불빛이 별 하나를 지날 때마다 작은 "틱" */
  | "starTick"
  /** 하늘의 별 따기: 룰렛이 당첨 별에서 멈춰 그 별이 켜지는 "딩"(응모 접수에도 쓴다) */
  | "starBall"
  /** 하늘의 별 따기: 당첨(맑은 종이 올라가며 반짝임) */
  | "starWin"
  /** 윷놀이: 윷가락을 던져 공중에서 서로 부딪는 "따르륵" */
  | "yutThrow"
  /** 윷놀이: 윷가락이 멍석에 떨어지는 "탁탁" */
  | "yutLand"
  /** 윷놀이: 윷·모가 나와 한 번 더(떨어지는 소리와 맑은 종) */
  | "yutBonus"
  /** 윷놀이: 말을 판에 놓는 "톡" */
  | "yutPiece"
  /** 윷놀이: 상대 말을 잡는 "딱-퐁" */
  | "yutCapture"
  /** 윷놀이: 말이 나는 "띠링" */
  | "yutHome";

/** 소리 이름. 소리 미리 듣기 화면에 쓴다 */
export const CUE_LABELS: Record<Cue, string> = {
  card: "카드 내기",
  pickCard: "키티 받기·버릴 카드 고르기",
  cardSet: "버릴 카드 정리",
  shuffle: "섞기",
  deal: "나눠 주기",
  gameStart: "판 시작",
  bid: "공약",
  pass: "포기",
  announce: "당선·선거 끝 공지",
  mighty: "마이티",
  joker: "조커",
  jokerCall: "조커콜",
  deadJoker: "죽은 조커",
  gan: "찍기(간)",
  friend: "프렌드 공개",
  scored: "야당 득점",
  kill: "죽이기",
  win: "승리",
  lose: "패배",
  dealMiss: "딜미스",
  invalid: "낼 수 없는 카드",
  click: "메뉴 누르기",
  beep: "고르기",
  queenOfSpades: "하트: 스페이드 Q",
  heartsBroken: "하트: 하트 깨짐",
  penalty: "하트: 벌점 먹음",
  roundEnd: "하트: 판 끝 점수표",
  stone: "오목: 돌 놓기",
  piece: "장기: 기물 놓기",
  capture: "장기: 잡기",
  check: "장기: 장군",
  hwatuSlap: "화투: 패 치기",
  hwatuFlip: "화투: 뒤집기",
  yak: "화투: 약",
  go: "고스톱: 고",
  ppong: "나이롱뽕: 뽕",
  strike: "숫자야구: 스트라이크",
  ball: "숫자야구: 볼",
  homerun: "숫자야구: 홈런",
  starTick: "하늘의 별 따기: 룰렛 틱",
  starBall: "하늘의 별 따기: 별 켜짐",
  starWin: "하늘의 별 따기: 당첨",
  yutThrow: "윷놀이: 던지기",
  yutLand: "윷놀이: 떨어지기",
  yutBonus: "윷놀이: 윷·모(한 번 더)",
  yutPiece: "윷놀이: 말 놓기",
  yutCapture: "윷놀이: 잡기",
  yutHome: "윷놀이: 나기",
};

/**
 * 소리마다 맞추는 크기(dB). 갑자기 커서 놀라지 않게 귀에 느껴지는 크기의 차이를 좁힌다.
 * `/sounds`에서 잰 0.15초 평균 크기로 평범한 소리는 -33~-38dB, 중요한 소리는 -29dB 근처에 둔다.
 * 소리를 고치면 `/sounds`에서 다시 재고 이 값을 맞춘다.
 */
const TRIM_DB: Partial<Record<Cue, number>> = {
  card: 6.8,
  stone: 7.5,
  piece: 6,
  capture: 3,
  check: -3,
  pickCard: 8.5,
  click: 7.7,
  beep: 10,
  pass: 4.9,
  invalid: 3.7,
  cardSet: 3,
  shuffle: -1,
  deal: 1.5,
  mighty: -8.2,
  joker: -1.2,
  jokerCall: 2.9,
  deadJoker: 2,
  gan: -3.4,
  announce: -2.4,
  kill: -0.8,
  friend: -1.7,
  scored: -0.9,
  win: -5.6,
  lose: -3.3,
  queenOfSpades: -5.8,
  heartsBroken: 2,
  roundEnd: -1.5,
  hwatuSlap: 8.7,
  hwatuFlip: 6,
  ppong: 6.5,
  strike: 4,
  ball: 8,
  homerun: 8.5,
  go: -1.5,
  yutThrow: 6,
  yutLand: 5,
  yutBonus: 2,
  yutPiece: 12,
  // 룰렛이 도는 동안 칸마다 나는 작은 유리 "띵". 가장 작은 "삑" 수준(몰리면 play가 더 줄인다)
  starTick: 15,
  yutCapture: 3,
  yutHome: 0,
};

function trim(cue: Cue): number {
  return 10 ** ((TRIM_DB[cue] ?? 0) / 20);
}

/**
 * 큰 소리. 원작은 한 번에 한 소리만 냈고 큰 소리는 앞 소리를 끊었다(`PlaySound(id, true)`).
 * 여기서는 큰 소리끼리만 앞 소리를 줄여 끊고, 카드처럼 흔한 소리는 겹쳐 둔다.
 */
const BIG: ReadonlySet<Cue> = new Set<Cue>([
  "gameStart",
  "bid",
  "announce",
  "mighty",
  "joker",
  "jokerCall",
  "gan",
  "friend",
  "kill",
  "win",
  "lose",
  "queenOfSpades",
  "heartsBroken",
  "go",
  "ppong",
]);

interface Graph {
  /** 마른 소리와 울림으로 함께 보내는 입구 */
  out: GainNode;
  /** 전체 음량 */
  master: GainNode;
  noise: AudioBuffer;
}

interface Audio extends Graph {
  ctx: AudioContext;
}

let audioState: Audio | null = null;
let volume = 0.8;
/** 지금 울리고 있는 큰 소리. 다음 큰 소리가 나면 줄여 끊는다 */
let bigVoice: GainNode | null = null;

function createAudio(): Audio | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext === "undefined"
  )
    return null;
  const ctx = new window.AudioContext();
  return { ctx, ...buildGraph(ctx, volume) };
}

function buildGraph(ctx: BaseAudioContext, gain: number): Graph {
  const master = ctx.createGain();
  master.gain.value = gain;
  // 여러 소리가 겹쳐도 깨지지 않게 살짝 누른다. 문턱을 더 낮추면 압축기가 전체를
  // 자동으로 키워(makeup gain) 오히려 커지므로, 소리 사이 크기는 `TRIM_DB`로 맞춘다.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(ctx.destination);

  // 작은 방 울림. 합성음이 덜 딱딱하게 들린다.
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 1.3);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  reverb.connect(wet).connect(master);

  const out = ctx.createGain();
  out.connect(master);
  out.connect(reverb);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return { out, master, noise };
}

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++)
      data[i] = (random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function audio(): Audio | null {
  audioState ??= createAudio();
  if (audioState?.ctx.state === "suspended") void audioState.ctx.resume();
  return audioState;
}

/** 사용자가 처음 누를 때 소리를 열어 둔다. 누름 안에서 열어야 iOS가 막지 않는다 */
function unlockOnFirstGesture(): void {
  if (typeof window === "undefined") return;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const unlock = () => {
    const a = audio();
    if (!a) return;
    // 아주 짧은 빈 소리를 내야 iOS Safari가 열린 것으로 본다.
    const src = a.ctx.createBufferSource();
    src.buffer = a.ctx.createBuffer(1, 1, a.ctx.sampleRate);
    src.connect(a.ctx.destination);
    src.start();
    if (a.ctx.state === "running")
      for (const e of events) window.removeEventListener(e, unlock, true);
  };
  for (const e of events)
    window.addEventListener(e, unlock, { capture: true, passive: true });
}
unlockOnFirstGesture();

/** 전체 음량(0~1). 아직 소리를 낸 적이 없으면 첫 소리부터 적용된다 */
export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (audioState) audioState.master.gain.value = volume;
}

/** 소리 하나가 지나가는 길. 큰 소리를 끊을 때 이 음량을 줄인다 */
interface Voice {
  ctx: BaseAudioContext;
  bus: GainNode;
  noise: AudioBuffer;
  /** 소리가 시작하는 시각(AudioContext 시간) */
  t0: number;
  star?: StarSound | undefined;
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  endFreq?: number;
  attack?: number;
  /** 떨림: 빠르기(Hz)와 깊이(Hz) */
  vibrato?: [number, number];
  /** 소리를 낮은 쪽만 남겨 부드럽게 한다 */
  lowpass?: number;
}

function tone(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  {
    type = "sine",
    gain = 0.2,
    endFreq,
    attack = 0.008,
    vibrato,
    lowpass,
  }: ToneOptions = {},
): void {
  const { ctx } = v;
  const t = v.t0 + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq)
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato[0];
    depth.gain.value = vibrato[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + duration + 0.05);
  }
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  let node: AudioNode = osc;
  if (lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lowpass;
    node = node.connect(filter);
  }
  node.connect(env).connect(v.bus);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** 종소리: 배음이 정수배가 아니라 맑게 울린다 */
function bell(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  gain = 0.1,
) {
  tone(v, freq, at, duration, { gain, attack: 0.004 });
  tone(v, freq * 2.76, at, duration * 0.45, {
    gain: gain * 0.35,
    attack: 0.003,
  });
  tone(v, freq * 5.4, at, duration * 0.2, { gain: gain * 0.15, attack: 0.002 });
}

/** 마림바처럼 톡 치고 빨리 사라지는 음 */
function pluck(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  gain = 0.16,
) {
  tone(v, freq, at, duration, { type: "triangle", gain, attack: 0.004 });
  tone(v, freq * 4, at, duration * 0.25, { gain: gain * 0.25, attack: 0.002 });
}

/** 금관 소리: 톱니파를 거르는 정도를 열어 가며 낸다 */
function brass(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  { gain = 0.08, vibrato }: { gain?: number; vibrato?: [number, number] } = {},
): void {
  const { ctx } = v;
  const t = v.t0 + at;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq, t);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato[0];
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(vibrato[1], t + duration * 0.5);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + duration + 0.05);
  }
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(freq * 1.5, t);
  filter.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.06);
  filter.frequency.exponentialRampToValueAtTime(freq * 2.5, t + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  env.gain.setValueAtTime(gain, t + duration * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(filter).connect(env).connect(v.bus);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** 북처럼 음이 뚝 떨어지는 낮은 소리 */
function thump(
  v: Voice,
  at: number,
  freq: number,
  endFreq: number,
  duration: number,
  gain = 0.3,
): void {
  // 너무 날카롭게 치고 들어오면 놀라므로 아주 조금 부드럽게 시작한다.
  tone(v, freq, at, duration, { gain, endFreq, attack: 0.008 });
}

interface NoiseOptions {
  filter?: BiquadFilterType;
  freq?: number;
  q?: number;
  gain?: number;
  sweepTo?: number;
  attack?: number;
}

function noise(
  v: Voice,
  at: number,
  duration: number,
  {
    filter = "lowpass",
    freq = 1500,
    q = 0.7,
    gain = 0.25,
    sweepTo,
    attack = 0.002,
  }: NoiseOptions = {},
): void {
  const { ctx } = v;
  const t = v.t0 + at;
  const src = ctx.createBufferSource();
  src.buffer = v.noise;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
  f.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  // 같은 잡음 버퍼를 매번 다른 곳에서 읽어 똑같이 들리지 않게 한다.
  src.connect(f).connect(env).connect(v.bus);
  src.start(t, random() * 0.5, duration + 0.05);
}

/** 카드 한 장이 탁자에 닿는 "톡". 높은 잡음을 빼야 벌레 소리처럼 들리지 않는다 */
function tap(v: Voice, at: number, gain = 1, bright = 1): void {
  const vary = 0.9 + random() * 0.2;
  noise(v, at, 0.045, {
    freq: 1300 * bright * vary,
    q: 0.5,
    gain: 0.9 * gain,
  });
  thump(v, at, 210 * vary, 110, 0.06, 0.3 * gain);
}

/** 단단한 나무끼리 부딪는 짧은 "탁"(윷가락·윷말). `pitch`가 크면 높고 가볍다 */
function woodClack(v: Voice, at: number, gain = 1, pitch = 1): void {
  const vary = 0.92 + random() * 0.16;
  noise(v, at, 0.03, {
    filter: "bandpass",
    freq: 1900 * pitch * vary,
    q: 2.2,
    gain: 0.7 * gain,
    attack: 0.001,
  });
  tone(v, 820 * pitch * vary, at, 0.07, {
    type: "triangle",
    gain: 0.08 * gain,
    endFreq: 640 * pitch * vary,
    attack: 0.001,
  });
}

/** 덱을 둘로 가르는 "스윽" */
function cut(v: Voice, at: number): void {
  noise(v, at, 0.2, {
    filter: "bandpass",
    freq: 700,
    sweepTo: 1400,
    q: 0.9,
    gain: 0.18,
    attack: 0.05,
  });
}

/**
 * 두 묶음의 카드 끝이 촘촘히 맞물리는 "촤르르륵".
 * 아주 짧은 잡음 알갱이를 4~7ms 간격으로 겹쳐 끊기지 않는 떨림을 만들고
 * (알갱이 사이가 벌어지면 "톡톡" 따로 들려 어색하다), 끝에 묶음을 밀어 맞추는 "착"을 낸다.
 */
function riffle(v: Voice, at: number): void {
  const length = 0.3;
  for (let t = 0; t < length; t += 0.004 + random() * 0.003) {
    // 처음과 끝은 작게, 가운데가 크게
    const swell = Math.sin(Math.PI * Math.min(1, (t / length) * 1.2));
    noise(v, at + t, 0.012, {
      filter: "bandpass",
      freq: 1400 + random() * 800,
      q: 1.1,
      gain: (0.04 + random() * 0.04) * (0.3 + swell),
    });
  }
  // 밑에 깔리는 낮은 "흐르륵"
  noise(v, at, length, { freq: 900, q: 0.5, gain: 0.05, attack: 0.08 });
  tap(v, at + length + 0.04, 0.5, 0.8);
}

// ---------------------------------------------------------------- 하늘의 별 따기

/**
 * 별 따기 소리는 밤하늘·유리 천구에 맞춰 맑고 부드럽게 짠다. 음은 모두 다장조 5음(도·레·미·솔·라) 안에서만
 * 골라 몇 개가 겹쳐도 부딪치지 않는다. 짧은 메아리(지연)로 넓은 하늘에 울리는 느낌을 더한다
 */
const PENTATONIC = [0, 2, 4, 7, 9];
/** 도(523Hz)에서 5음 음계로 step칸 위의 음 */
function pentatonic(step: number): number {
  const octave = Math.floor(step / 5);
  const degree = PENTATONIC[((step % 5) + 5) % 5] as number;
  return 523.25 * 2 ** (octave + degree / 12);
}

/** 온도 → 0(붉고 따뜻함) ~ 1(파랗고 맑음) */
function hue(temp: number | undefined): number {
  const k = temp ?? 6500;
  return Math.min(1, Math.max(0, (k - 3200) / (11000 - 3200)));
}

/** 이 소리만 짧은 메아리를 거쳐 나가게 한다(넓은 하늘). 메아리는 seconds 뒤 꺼진다 */
function withEcho(v: Voice, seconds: number, wet = 0.28): Voice {
  const { ctx } = v;
  const mix = ctx.createGain();
  mix.connect(v.bus);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.27;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  const feedback = ctx.createGain();
  feedback.gain.setValueAtTime(0.32, v.t0);
  feedback.gain.setValueAtTime(0, v.t0 + seconds);
  const send = ctx.createGain();
  send.gain.value = wet;
  mix.connect(send).connect(delay).connect(tone).connect(feedback);
  feedback.connect(delay);
  tone.connect(v.bus);
  return { ...v, bus: mix };
}

/** 유리 종: 맑은 기음에 비정수 배음을 조금, 밝기(0~1)만큼 높은 배음을 더한다 */
function glass(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  gain: number,
  bright = 0.5,
): void {
  tone(v, freq, at, duration, { gain, attack: 0.003 });
  tone(v, freq * 2.0, at, duration * 0.55, {
    gain: gain * (0.12 + 0.2 * bright),
    attack: 0.003,
  });
  tone(v, freq * 2.76, at, duration * 0.25, {
    gain: gain * (0.04 + 0.12 * bright),
    attack: 0.002,
  });
}

/** 부드럽게 부풀었다 오래 사라지는 바탕음(살짝 어긋난 두 음이 일렁인다) */
function pad(
  v: Voice,
  freq: number,
  at: number,
  duration: number,
  gain: number,
): void {
  tone(v, freq, at, duration, { gain, attack: 0.25, lowpass: 2400 });
  tone(v, freq * 1.004, at, duration, {
    gain: gain * 0.8,
    attack: 0.3,
    lowpass: 2400,
  });
}

/** 높은 곳에서 흩어지는 반짝임 몇 개 */
function sparkles(
  v: Voice,
  count: number,
  from: number,
  spread: number,
  gain = 0.018,
): void {
  for (let i = 0; i < count; i++) {
    const at = from + (spread * i) / Math.max(1, count) + random() * 0.05;
    const f = pentatonic(10 + Math.floor(random() * 6));
    tone(v, f, at, 0.22, {
      gain: gain * (0.6 + random() * 0.6),
      attack: 0.002,
    });
  }
}

/** 룰렛 불빛이 별 하나를 지날 때: 아주 작은 유리 "띵", 별마다 음이 조금씩 다르다 */
function starTick(v: Voice): void {
  const n = v.star?.n ?? Math.floor(random() * 45);
  const f = pentatonic(5 + ((n * 7) % 9));
  glass(v, f, 0, 0.16, 0.045, 0.3);
}

/** 켜지는 당첨 번호 차례대로 쌓이는 화음(도·미·솔·라·도·미), 보너스는 따로 */
const STAR_CHORD = [0, 2, 3, 4, 5, 7];

/**
 * 별이 켜질 때: 그 별빛 색에 맞는 맑은 종과 부드러운 바탕음. 차례가 갈수록 높은 음이 더해져
 * 일곱 개가 켜지면 화음이 쌓인다. 보너스는 한 옥타브 위 반짝임으로 구별한다
 */
function starBall(v: Voice): void {
  const s = v.star ?? {};
  const index = s.index ?? 0;
  const bright = hue(s.temp);
  const e = withEcho(v, 2.5);
  if (index >= 6) {
    // 보너스: 높은 두 음이 엇갈려 반짝인다
    glass(e, pentatonic(8), 0, 1.4, 0.07, 0.9);
    glass(e, pentatonic(11), 0.09, 1.2, 0.05, 0.9);
    sparkles(e, 4, 0.12, 0.5);
    return;
  }
  const f = pentatonic(STAR_CHORD[index] ?? 0);
  // 붉은 별은 한 옥타브 아래 따뜻한 음을 받치고, 파란 별은 한 옥타브 위 맑은 음을 얹는다
  glass(e, f, 0, 1.6, 0.085, bright);
  if (bright > 0.55)
    tone(e, f * 2, 0.02, 0.9, { gain: 0.025 * bright, attack: 0.004 });
  else
    tone(e, f / 2, 0, 1.4, {
      gain: 0.04 * (1 - bright),
      attack: 0.02,
      lowpass: 1200,
    });
  pad(e, f, 0, 2.6, 0.022);
}

/** 당첨: 등수가 높을수록 길고 화려하게(5등 짧은 반짝 하나 ~ 1등 길게 펼쳐지는 화음) */
function starWin(v: Voice): void {
  const rank = v.star?.rank ?? 3;
  const e = withEcho(v, rank <= 2 ? 4 : 2.5);
  if (rank >= 5) {
    glass(e, pentatonic(4), 0, 0.7, 0.06, 0.6);
    glass(e, pentatonic(5), 0.1, 0.9, 0.06, 0.6);
    sparkles(e, 2, 0.18, 0.3);
    return;
  }
  if (rank === 4) {
    [0, 2, 3].forEach((step, i) => {
      glass(e, pentatonic(step), i * 0.1, 0.9, 0.065, 0.6);
    });
    sparkles(e, 3, 0.3, 0.4);
    return;
  }
  if (rank === 3) {
    [0, 2, 3, 5].forEach((step, i) => {
      glass(e, pentatonic(step), i * 0.1, 1.1, 0.065, 0.6);
    });
    pad(e, pentatonic(0), 0.3, 1.8, 0.02);
    sparkles(e, 5, 0.4, 0.7);
    return;
  }
  // 1·2등: 위로 펼쳐지는 아르페지오, 이어 화음이 부풀고 반짝임이 오래 흩어진다
  const steps = rank === 1 ? [0, 2, 3, 4, 5, 7, 8, 10] : [0, 2, 3, 4, 5, 7];
  steps.forEach((step, i) => {
    glass(e, pentatonic(step), i * 0.09, 1.3, 0.06, 0.65);
  });
  const bloom = steps.length * 0.09;
  for (const step of rank === 1 ? [-5, 0, 2, 3, 5, 6] : [0, 2, 3, 5])
    pad(e, pentatonic(step), bloom, rank === 1 ? 3.6 : 2.4, 0.02);
  sparkles(e, rank === 1 ? 14 : 8, bloom, rank === 1 ? 2.6 : 1.4);
}

const C4 = 261.63;
const E4 = 329.63;
const G4 = 392;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;

/** 하늘의 별 따기 소리의 갈래. 없으면 기본 소리 */
export interface StarSound {
  /** 별 번호(룰렛이 지나는 별·켜진 별). 별마다 음이 조금씩 달라 단조롭지 않다 */
  n?: number;
  /** 켜진 차례(0~5는 당첨 번호, 6은 보너스). 차례대로 화음이 쌓인다 */
  index?: number;
  /** 별 표면 온도(K). 파란 별은 맑고 높게, 붉은 별은 낮고 따뜻하게 */
  temp?: number;
  /** 등수(1~5). 1등일수록 길고 화려하다 */
  rank?: number;
}

export interface PlayOptions {
  /** 몇 초 뒤에 낼지 */
  delay?: number;
  /** 몇 번 이어서 낼지(득점 카드 장수, 키티 장수) */
  times?: number;
  star?: StarSound | undefined;
}

/** 룰렛 "띵"이 몰릴수록 작게: 최근에 낸 횟수(0.35초마다 절반쯤 잊는다) */
let tickEnergy = 0;
let tickAt = 0;

export function play(
  cue: Cue,
  { delay = 0, times = 1, star }: PlayOptions = {},
): void {
  const a = audio();
  if (!a) return;
  const { ctx } = a;
  const t0 = ctx.currentTime + delay;
  const bus = ctx.createGain();
  bus.gain.value = trim(cue);
  if (cue === "starTick") {
    tickEnergy = tickEnergy * Math.exp(-(t0 - tickAt) / 0.5) + 1;
    tickAt = t0;
    bus.gain.value /= Math.sqrt(tickEnergy);
  }
  bus.connect(a.out);
  if (BIG.has(cue)) {
    // 앞 큰 소리를 이 소리가 시작할 때 재빨리 줄인다.
    bigVoice?.gain.setTargetAtTime(0, t0, 0.04);
    bigVoice = bus;
  }
  const v: Voice = { ctx, bus, noise: a.noise, t0, star };
  for (let i = 0; i < times; i++) render(cue, { ...v, t0: t0 + i * gap(cue) });
}

/**
 * 음량 막대를 놓을 때 들려준다. 카드 내기(가장 작은 쪽)만 들려주면 게임 중 큰 장면 소리가
 * 5~6dB 더 크게 들려, 작은 쪽과 큰 쪽(프렌드 공개)을 이어서 들려준다
 */
export function previewVolume(): void {
  play("card");
  play("friend", { delay: 0.3 });
}

/**
 * 소리 하나를 재생하지 않고 그려 본다. 미리 듣기 화면에서 크기와 모양을 보는 데 쓴다.
 * 난수 씨앗을 고정해 같은 소리는 늘 똑같이 그려진다
 */
export function renderCue(
  cue: Cue,
  seconds = 3,
  seed = 1,
  star?: StarSound,
): Promise<AudioBuffer> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const rng = createRng(seed);
  random = () => nextFloat(rng);
  try {
    // 난수는 소리를 짜는 동안에만 쓰고, 실제 그리기(startRendering)에는 쓰지 않는다.
    const g = buildGraph(ctx, 0.8);
    const bus = ctx.createGain();
    bus.gain.value = trim(cue);
    bus.connect(g.out);
    render(cue, { ctx, bus, noise: g.noise, t0: 0, star });
  } finally {
    random = Math.random;
  }
  return ctx.startRendering();
}

/** 같은 소리를 이어서 낼 때 간격(초) */
function gap(cue: Cue): number {
  return cue === "pickCard" ? 0.09 : 0.13;
}

function render(cue: Cue, v: Voice): void {
  switch (cue) {
    case "card":
      tap(v, 0);
      break;
    case "pickCard":
      tap(v, 0, 0.8, 1.5);
      break;
    case "cardSet":
      tap(v, 0, 0.35, 0.9);
      tap(v, 0.08, 0.55, 0.8);
      break;
    case "shuffle":
      // 원작처럼 두 번 섞는다. 섞기 연출(`DealAnimation`)이 0.4초마다 갈라졌다 합쳐지는 데 맞춘다.
      cut(v, 0);
      riffle(v, 0.4);
      cut(v, 0.8);
      riffle(v, 1.2);
      break;
    case "deal":
      // 카드 묶음이 날아가는 "슥"과 손에 닿는 "톡"
      noise(v, 0, 0.12, {
        filter: "bandpass",
        freq: 1000,
        sweepTo: 2000,
        q: 0.8,
        gain: 0.1,
        attack: 0.03,
      });
      tap(v, FLIGHT_MS / 1000, 0.35, 1.1);
      break;
    case "gameStart":
      noise(v, 0, 0.55, {
        filter: "bandpass",
        freq: 350,
        sweepTo: 3000,
        q: 0.8,
        gain: 0.28,
        attack: 0.25,
      });
      [C5, E5, G5].forEach((f, i) => {
        pluck(v, f, 0.42 + i * 0.07, 0.35, 0.12);
      });
      bell(v, C6, 0.63, 0.9, 0.07);
      break;
    case "bid":
      pluck(v, G5, 0, 0.25);
      pluck(v, C6, 0.08, 0.4);
      break;
    case "pass":
      // 원작 주석의 "뽀록": 김 빠지듯 톡 하고 내려간다.
      tone(v, 560, 0, 0.13, { gain: 0.35, endFreq: 190, attack: 0.004 });
      break;
    case "announce":
      [C5, E5, G5].forEach((f, i) => {
        bell(v, f, i * 0.05, 0.6, 0.08);
      });
      bell(v, C6, 0.15, 1.1, 0.1);
      break;
    case "mighty":
      // 금관 "빠-밤!"과 큰북, 마지막에 반짝임
      brass(v, G4, 0, 0.11, { gain: 0.09 });
      brass(v, G4, 0.13, 0.08, { gain: 0.09 });
      for (const f of [C4, E4, G4, C5]) brass(v, f, 0.24, 1.0, { gain: 0.06 });
      thump(v, 0.24, 120, 55, 0.6, 0.25);
      noise(v, 0.24, 0.5, { freq: 900, sweepTo: 200, gain: 0.12 });
      bell(v, C6 * 2, 0.32, 0.9, 0.04);
      bell(v, G5 * 2, 0.4, 0.8, 0.03);
      break;
    case "joker":
      // 장난스럽게 "뾰로롱" 올라갔다 흔들리며 내려오고, 키득거리듯 세 번 톡톡
      tone(v, 300, 0, 0.18, {
        type: "square",
        endFreq: 1000,
        gain: 0.13,
        lowpass: 2500,
      });
      tone(v, 1000, 0.18, 0.4, {
        type: "square",
        endFreq: 500,
        gain: 0.13,
        vibrato: [9, 40],
        lowpass: 2500,
      });
      [1318.5, C6, A5].forEach((f, i) => {
        pluck(v, f, 0.62 + i * 0.09, 0.15, 0.15);
      });
      break;
    case "jokerCall":
      // 경보처럼 "삐뽀삐뽀"
      thump(v, 0, 150, 60, 0.3, 0.35);
      for (let i = 0; i < 4; i++)
        tone(v, i % 2 === 0 ? 988 : 740, i * 0.15, 0.15, {
          type: "sawtooth",
          gain: 0.12,
          attack: 0.01,
          lowpass: 2200,
        });
      break;
    case "deadJoker":
      // 바람 빠지듯 "뿌우웅" 내려간다
      tone(v, 420, 0, 0.75, {
        type: "sawtooth",
        endFreq: 80,
        gain: 0.2,
        vibrato: [7, 25],
        lowpass: 1200,
        attack: 0.02,
      });
      break;
    case "gan":
      // 내리찍는 "쾅!": 낮은 북, 짧게 터지는 잡음, 쇳소리
      thump(v, 0, 170, 45, 0.4, 0.55);
      noise(v, 0, 0.28, { freq: 3500, sweepTo: 300, q: 0.6, gain: 0.5 });
      for (const f of [1250, 1720, 2390])
        tone(v, f, 0.005, 0.35, { gain: 0.035, attack: 0.002 });
      break;
    case "friend":
      // 하프처럼 쭉 올라간 뒤 반짝이는 화음 "짜잔~"
      [C5, D5, E5, G5, A5, C6, C6 * 1.125, C6 * 1.25].forEach((f, i) => {
        pluck(v, f, i * 0.035, 0.4, 0.09);
      });
      for (const f of [E5 * 2, G5 * 2, C6 * 2]) bell(v, f, 0.32, 1.3, 0.05);
      tone(v, C5, 0.32, 1.2, { type: "triangle", gain: 0.06, attack: 0.05 });
      break;
    case "scored":
      // 동전 "띵-딩"
      tone(v, 987.77, 0, 0.07, { gain: 0.18, attack: 0.002 });
      bell(v, 1318.5, 0.06, 0.4, 0.14);
      break;
    case "kill":
      // 북을 몰아치다 칼 "슉"
      for (let i = 0; i < 4; i++)
        thump(v, i * 0.08, 130, 70, 0.12, 0.1 + i * 0.03);
      noise(v, 0.36, 0.3, {
        filter: "highpass",
        freq: 5000,
        sweepTo: 1500,
        q: 0.7,
        gain: 0.08,
        attack: 0.08,
      });
      break;
    case "win":
      [C5, E5, G5].forEach((f, i) => {
        brass(v, f, i * 0.12, 0.13, { gain: 0.06 });
      });
      for (const f of [C5, E5, G5]) brass(v, f, 0.38, 1.0, { gain: 0.045 });
      brass(v, C4, 0.38, 1.0, { gain: 0.05 });
      [C6, E5 * 2, G5 * 2].forEach((f, i) => {
        bell(v, f, 0.45 + i * 0.08, 1.0, 0.05);
      });
      thump(v, 0.38, 110, 55, 0.5, 0.2);
      break;
    case "lose":
      // 축 처지는 트롬본 "빠바바밤~"
      [392, 370, 349.23].forEach((f, i) => {
        brass(v, f / 2, i * 0.32, 0.3, { gain: 0.12 });
      });
      brass(v, 329.63 / 2, 0.96, 1.1, { gain: 0.12, vibrato: [5, 4] });
      break;
    case "dealMiss":
      tap(v, 0, 0.35, 0.9);
      tap(v, 0.08, 0.55, 0.8);
      tone(v, 220, 0.12, 0.35, { gain: 0.1, endFreq: 150 });
      break;
    case "invalid":
      tone(v, 196, 0, 0.09, { type: "triangle", gain: 0.14 });
      tone(v, 165, 0.1, 0.12, { type: "triangle", gain: 0.14 });
      break;
    case "click":
      // 기계가 맞물리는 "철컥"
      noise(v, 0, 0.015, { filter: "highpass", freq: 3000, gain: 0.25 });
      noise(v, 0.045, 0.035, {
        filter: "bandpass",
        freq: 1100,
        q: 1,
        gain: 0.35,
      });
      thump(v, 0.045, 300, 140, 0.04, 0.12);
      break;
    case "beep":
      tone(v, 1200, 0, 0.05, { gain: 0.2, attack: 0.003 });
      break;
    case "queenOfSpades":
      // 불길한 "둥, 둥, 두웅~"
      brass(v, 196 / 2, 0, 0.16, { gain: 0.1 });
      brass(v, 196 / 2, 0.22, 0.16, { gain: 0.1 });
      brass(v, 155.56 / 2, 0.46, 1.1, { gain: 0.1, vibrato: [5, 2] });
      thump(v, 0.46, 90, 40, 0.7, 0.22);
      break;
    case "heartsBroken":
      // 유리가 깨지는 "쨍그랑"
      noise(v, 0, 0.3, {
        filter: "highpass",
        freq: 6000,
        sweepTo: 2500,
        gain: 0.35,
      });
      [2637, 3136, 2349, 2960, 2093].forEach((f, i) => {
        bell(v, f, i * 0.045 + random() * 0.02, 0.35, 0.06);
      });
      break;
    case "penalty":
      // 아쉬운 "뿌우": 부드럽게 내려가는 두 음
      tone(v, 330, 0, 0.18, { type: "triangle", gain: 0.12, attack: 0.02 });
      tone(v, 262, 0.16, 0.4, {
        type: "triangle",
        gain: 0.12,
        endFreq: 220,
        vibrato: [5, 3],
        attack: 0.02,
      });
      break;
    case "stone": {
      // 돌이 판에 닿는 짧고 단단한 "딱"과 나무 판이 울리는 낮은 "통"
      const vary = 0.94 + random() * 0.12;
      noise(v, 0, 0.025, {
        filter: "bandpass",
        freq: 2400 * vary,
        q: 1.8,
        gain: 0.9,
        attack: 0.001,
      });
      tone(v, 640 * vary, 0, 0.09, {
        type: "triangle",
        gain: 0.12,
        endFreq: 560,
        attack: 0.002,
      });
      thump(v, 0, 190 * vary, 120, 0.08, 0.22);
      break;
    }
    case "piece": {
      // 돌보다 크고 무거운 나무 기물: 낮은 "탁"과 판이 울리는 "퉁"
      const vary = 0.94 + random() * 0.12;
      noise(v, 0, 0.035, {
        filter: "bandpass",
        freq: 1500 * vary,
        q: 1.4,
        gain: 0.9,
        attack: 0.001,
      });
      tone(v, 420 * vary, 0, 0.11, {
        type: "triangle",
        gain: 0.13,
        endFreq: 360,
        attack: 0.002,
      });
      thump(v, 0, 140 * vary, 90, 0.11, 0.26);
      break;
    }
    case "capture": {
      // 상대 기물을 치는 "탁"과 바로 이어 판에 닿는 "딱"
      for (const [at, freq] of [
        [0, 1300],
        [0.07, 2100],
      ] as const) {
        noise(v, at, 0.035, {
          filter: "bandpass",
          freq,
          q: 1.6,
          gain: 0.9,
          attack: 0.001,
        });
        thump(v, at, 160, 95, 0.1, 0.22);
      }
      tone(v, 520, 0.07, 0.12, {
        type: "triangle",
        gain: 0.1,
        endFreq: 440,
        attack: 0.002,
      });
      break;
    }
    case "check":
      // "장군!": 짧게 두 번 부는 나팔
      brass(v, 392, 0, 0.12, { gain: 0.1 });
      brass(v, 523.25, 0.13, 0.32, { gain: 0.11, vibrato: [6, 3] });
      break;
    case "hwatuSlap": {
      // 두꺼운 화투 패가 담요 위 패를 내리치는 "착": 짧고 밝은 마찰음과 낮은 "툭"
      const vary = 0.94 + random() * 0.12;
      noise(v, 0, 0.03, {
        filter: "bandpass",
        freq: 3200 * vary,
        q: 1.2,
        gain: 0.8,
        attack: 0.001,
      });
      noise(v, 0.012, 0.05, {
        filter: "lowpass",
        freq: 900,
        gain: 0.35,
        attack: 0.002,
      });
      thump(v, 0, 170 * vary, 110, 0.07, 0.2);
      break;
    }
    case "hwatuFlip":
      // 더미에서 한 장 집어 뒤집는 "사락"
      noise(v, 0, 0.09, {
        filter: "bandpass",
        freq: 2200,
        sweepTo: 3600,
        q: 0.9,
        gain: 0.35,
        attack: 0.02,
      });
      noise(v, 0.08, 0.025, {
        filter: "bandpass",
        freq: 2800,
        q: 1.4,
        gain: 0.5,
        attack: 0.001,
      });
      break;
    case "yak":
      // 약이 났다: 맑은 종 셋이 올라간다
      bell(v, C5, 0, 0.5, 0.07);
      bell(v, E5, 0.09, 0.5, 0.07);
      bell(v, G5, 0.18, 0.8, 0.08);
      break;
    case "go":
      // "고!": 힘차게 한 번 올려 부는 나팔
      brass(v, 392, 0, 0.1, { gain: 0.09 });
      brass(v, 587.33, 0.09, 0.3, { gain: 0.1, vibrato: [6, 3] });
      break;
    case "ppong":
      // "뽕!": 높은 데서 뚝 떨어지는 통통한 소리와 손바닥으로 패를 내리치는 "탁"
      tone(v, 900, 0, 0.16, {
        type: "sine",
        gain: 0.22,
        endFreq: 260,
        attack: 0.004,
      });
      tone(v, 1800, 0, 0.06, {
        type: "triangle",
        gain: 0.05,
        endFreq: 700,
        attack: 0.002,
      });
      noise(v, 0.02, 0.03, {
        filter: "bandpass",
        freq: 2600,
        q: 1.3,
        gain: 0.7,
        attack: 0.001,
      });
      thump(v, 0.02, 150, 90, 0.1, 0.22);
      break;
    case "strike":
      // 공이 가죽 미트에 꽂히는 짧고 묵직한 "팡"과 뒤따르는 밝은 "딱"
      noise(v, 0, 0.05, {
        filter: "bandpass",
        freq: 900,
        q: 1,
        gain: 0.9,
        attack: 0.001,
      });
      thump(v, 0, 130, 70, 0.12, 0.28);
      tone(v, 1320, 0.03, 0.1, {
        type: "triangle",
        gain: 0.06,
        endFreq: 1100,
        attack: 0.002,
      });
      break;
    case "ball":
      // 공을 미트로 부드럽게 받는 "퍽": 스트라이크보다 낮고 밝은 "딱"이 없다
      noise(v, 0, 0.06, {
        filter: "lowpass",
        freq: 700,
        q: 0.8,
        gain: 0.7,
        attack: 0.003,
      });
      thump(v, 0, 110, 65, 0.1, 0.2);
      break;
    case "homerun":
      // 방망이가 공을 때리는 마른 "딱"과 뒤따라 부풀었다 잦아드는 관중 함성
      noise(v, 0, 0.035, {
        filter: "bandpass",
        freq: 2400,
        q: 1.6,
        gain: 0.8,
        attack: 0.001,
      });
      tone(v, 1750, 0, 0.07, {
        type: "triangle",
        gain: 0.07,
        endFreq: 1500,
        attack: 0.001,
      });
      thump(v, 0, 180, 120, 0.05, 0.12);
      noise(v, 0.08, 1.1, {
        filter: "bandpass",
        freq: 900,
        sweepTo: 1300,
        q: 0.6,
        gain: 0.12,
        attack: 0.35,
      });
      break;
    case "starTick":
      starTick(v);
      break;
    case "starBall":
      starBall(v);
      break;
    case "starWin":
      starWin(v);
      break;
    case "yutThrow":
      // 손을 떠난 윷가락 넷이 공중에서 서로 스치며 부딪는 가벼운 "따르륵"
      for (let i = 0; i < 4; i++)
        woodClack(v, i * 0.045 + random() * 0.02, 0.35);
      noise(v, 0, 0.25, {
        filter: "bandpass",
        freq: 1600,
        sweepTo: 900,
        q: 0.7,
        gain: 0.04,
        attack: 0.05,
      });
      break;
    case "yutLand":
      // 멍석에 떨어진 가락들이 차례로 닿는 "탁 타닥"
      woodClack(v, 0, 0.9);
      woodClack(v, 0.05 + random() * 0.02, 0.6);
      woodClack(v, 0.11 + random() * 0.02, 0.5);
      thump(v, 0, 140, 80, 0.09, 0.18);
      break;
    case "yutBonus":
      // 윷·모: 떨어지는 소리 뒤 맑은 종 둘이 올라간다(한 번 더)
      woodClack(v, 0, 0.9);
      woodClack(v, 0.05, 0.6);
      bell(v, E5, 0.12, 0.45, 0.07);
      bell(v, A5, 0.22, 0.7, 0.08);
      break;
    case "yutPiece":
      // 나무 말을 판에 놓는 짧고 둥근 "톡"
      woodClack(v, 0, 0.8, 0.75);
      thump(v, 0, 180, 110, 0.06, 0.16);
      break;
    case "yutCapture":
      // 상대 말을 쳐 내는 "딱"과 말이 처음으로 튕겨 가는 "퐁"
      woodClack(v, 0, 1, 1.2);
      thump(v, 0, 160, 90, 0.08, 0.22);
      tone(v, 700, 0.07, 0.18, {
        type: "sine",
        gain: 0.12,
        endFreq: 1100,
        attack: 0.004,
      });
      break;
    case "yutHome":
      // 말이 참먹이를 지나 나는 "띠링"
      pluck(v, C5, 0, 0.25, 0.12);
      bell(v, G5, 0.08, 0.6, 0.07);
      bell(v, C6, 0.16, 0.8, 0.06);
      break;
    case "roundEnd":
      // 점수표를 펼치는 "사락"과 "띵동"
      noise(v, 0, 0.18, {
        filter: "bandpass",
        freq: 1100,
        sweepTo: 1800,
        q: 0.8,
        gain: 0.12,
        attack: 0.06,
      });
      bell(v, G5, 0.15, 0.6, 0.08);
      bell(v, E5, 0.32, 0.9, 0.08);
      break;
  }
}
