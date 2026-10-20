/**
 * 효과음. 음원 파일 없이 Web Audio로 그때그때 합성한다(라이선스 걱정이 없고 받을 파일도 없다).
 * 브라우저는 사용자가 한 번 누르기 전에는 소리를 막으므로 첫 소리를 낼 때 AudioContext를 만든다.
 */
export type Cue =
  | "card"
  | "bid"
  | "pass"
  | "elected"
  | "mighty"
  | "joker"
  | "jokerCall"
  | "friend"
  | "trick"
  | "shuffle"
  | "win"
  | "lose"
  | "dealMiss"
  | "invalid";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.8;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext === "undefined"
  )
    return null;
  if (!ctx) {
    ctx = new window.AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { ctx, out: master } : null;
}

/** 전체 음량(0~1). 아직 소리를 낸 적이 없으면 첫 소리부터 적용된다 */
export function setVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (master) master.gain.value = volume;
}

function tone(
  a: { ctx: AudioContext; out: GainNode },
  freq: number,
  at: number,
  duration: number,
  {
    type = "sine",
    gain = 0.2,
    endFreq,
  }: { type?: OscillatorType; gain?: number; endFreq?: number } = {},
): void {
  const t = a.ctx.currentTime + at;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq)
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(a.out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise(
  a: { ctx: AudioContext; out: GainNode },
  at: number,
  duration: number,
  {
    freq = 2500,
    q = 0.8,
    gain = 0.25,
    sweepTo,
  }: { freq?: number; q?: number; gain?: number; sweepTo?: number } = {},
): void {
  const t = a.ctx.currentTime + at;
  const length = Math.max(1, Math.floor(a.ctx.sampleRate * duration));
  const buffer = a.ctx.createBuffer(1, length, a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo)
    filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
  filter.Q.value = q;
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t);
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;

export function play(cue: Cue): void {
  const a = audio();
  if (!a) return;
  switch (cue) {
    case "card":
      noise(a, 0, 0.07, { freq: 3200, q: 0.7, gain: 0.35 });
      tone(a, 190, 0, 0.05, { gain: 0.08 });
      break;
    case "bid":
      tone(a, 660, 0, 0.09, { type: "triangle", gain: 0.15 });
      tone(a, 880, 0.07, 0.1, { type: "triangle", gain: 0.12 });
      break;
    case "pass":
      tone(a, 330, 0, 0.12, { gain: 0.1, endFreq: 260 });
      break;
    case "elected":
      [C5, E5, G5, C5 * 2].forEach((f, i) => {
        tone(a, f, i * 0.09, 0.22, { type: "triangle", gain: 0.14 });
      });
      break;
    case "mighty":
      [C5 * 2, E5 * 2, G5 * 2, C5 * 4].forEach((f, i) => {
        tone(a, f, i * 0.05, 0.35, { gain: 0.08 });
      });
      noise(a, 0, 0.4, { freq: 8000, q: 2, gain: 0.06 });
      break;
    case "joker":
      tone(a, 392, 0, 0.12, { type: "square", gain: 0.06 });
      tone(a, 523.25, 0.12, 0.2, { type: "square", gain: 0.06 });
      break;
    case "jokerCall":
      for (let i = 0; i < 2; i++) {
        tone(a, 880, i * 0.18, 0.09, { type: "square", gain: 0.06 });
        tone(a, 660, i * 0.18 + 0.09, 0.09, { type: "square", gain: 0.06 });
      }
      break;
    case "friend":
      tone(a, 1318.5, 0, 0.7, { gain: 0.1 });
      tone(a, 1760, 0.08, 0.7, { gain: 0.07 });
      break;
    case "trick":
      noise(a, 0, 0.25, { freq: 600, sweepTo: 2400, q: 1.2, gain: 0.18 });
      break;
    case "shuffle":
      for (let i = 0; i < 14; i++)
        noise(a, i * 0.045 + (i > 6 ? 0.2 : 0), 0.04, {
          freq: 2800,
          gain: 0.22,
        });
      break;
    case "win":
      [C5, E5, G5, C5 * 2, G5, C5 * 2].forEach((f, i) => {
        tone(a, f, i * 0.1, 0.25, { type: "triangle", gain: 0.13 });
      });
      break;
    case "lose":
      [G5, 622.25, C5, 392].forEach((f, i) => {
        tone(a, f, i * 0.16, 0.3, { type: "triangle", gain: 0.1 });
      });
      break;
    case "dealMiss":
      tone(a, 140, 0, 0.35, { type: "sawtooth", gain: 0.05, endFreq: 90 });
      break;
    case "invalid":
      tone(a, 130, 0, 0.12, { gain: 0.15, endFreq: 90 });
      break;
  }
}
