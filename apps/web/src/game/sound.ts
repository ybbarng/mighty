/**
 * 효과음. 음원 파일 없이 Web Audio로 그때그때 합성한다(라이선스 걱정이 없고 받을 파일도 없다).
 * 어떤 장면에 어떤 소리를 내는지는 원작 Mighty Network 4.0을 따른다(docs/16).
 *
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 첫 누름에서 AudioContext를 열어 두어
 * 컴퓨터 차례처럼 누름 없이 나는 첫 소리도 막히지 않게 한다(특히 iOS).
 */
import { FLIGHT_MS } from "./timing";

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
  | "roundEnd";

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
};

/**
 * 소리마다 맞추는 크기(dB). 갑자기 커서 놀라지 않게 귀에 느껴지는 크기의 차이를 좁힌다.
 * `/sounds`에서 잰 0.15초 평균 크기로 평범한 소리는 -33~-38dB, 중요한 소리는 -29dB 근처에 둔다.
 * 소리를 고치면 `/sounds`에서 다시 재고 이 값을 맞춘다.
 */
const TRIM_DB: Partial<Record<Cue, number>> = {
  card: 6.8,
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
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { out, master, noise };
}

function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
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
  src.start(t, Math.random() * 0.5, duration + 0.05);
}

/** 카드 한 장이 탁자에 닿는 "톡". 높은 잡음을 빼야 벌레 소리처럼 들리지 않는다 */
function tap(v: Voice, at: number, gain = 1, bright = 1): void {
  const vary = 0.9 + Math.random() * 0.2;
  noise(v, at, 0.045, {
    freq: 1300 * bright * vary,
    q: 0.5,
    gain: 0.9 * gain,
  });
  thump(v, at, 210 * vary, 110, 0.06, 0.3 * gain);
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
  for (let t = 0; t < length; t += 0.004 + Math.random() * 0.003) {
    // 처음과 끝은 작게, 가운데가 크게
    const swell = Math.sin(Math.PI * Math.min(1, (t / length) * 1.2));
    noise(v, at + t, 0.012, {
      filter: "bandpass",
      freq: 1400 + Math.random() * 800,
      q: 1.1,
      gain: (0.04 + Math.random() * 0.04) * (0.3 + swell),
    });
  }
  // 밑에 깔리는 낮은 "흐르륵"
  noise(v, at, length, { freq: 900, q: 0.5, gain: 0.05, attack: 0.08 });
  tap(v, at + length + 0.04, 0.5, 0.8);
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

export interface PlayOptions {
  /** 몇 초 뒤에 낼지 */
  delay?: number;
  /** 몇 번 이어서 낼지(득점 카드 장수, 키티 장수) */
  times?: number;
}

export function play(
  cue: Cue,
  { delay = 0, times = 1 }: PlayOptions = {},
): void {
  const a = audio();
  if (!a) return;
  const { ctx } = a;
  const t0 = ctx.currentTime + delay;
  const bus = ctx.createGain();
  bus.gain.value = trim(cue);
  bus.connect(a.out);
  if (BIG.has(cue)) {
    // 앞 큰 소리를 이 소리가 시작할 때 재빨리 줄인다.
    bigVoice?.gain.setTargetAtTime(0, t0, 0.04);
    bigVoice = bus;
  }
  const v: Voice = { ctx, bus, noise: a.noise, t0 };
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

/** 소리 하나를 재생하지 않고 그려 본다. 미리 듣기 화면에서 크기와 모양을 보는 데 쓴다 */
export function renderCue(cue: Cue, seconds = 3): Promise<AudioBuffer> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, rate * seconds, rate);
  const g = buildGraph(ctx, 0.8);
  const bus = ctx.createGain();
  bus.gain.value = trim(cue);
  bus.connect(g.out);
  render(cue, { ctx, bus, noise: g.noise, t0: 0 });
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
        bell(v, f, i * 0.045 + Math.random() * 0.02, 0.35, 0.06);
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
