// Tiny WebAudio beeps (no audio files). Off by default: controlled by app settings `sound`.
// Call playSound('liftoff' | 'stage' | 'success' | 'fail' | 'click'). It never throws and does nothing when sound is off.
let ctx = null, enabled = false;

/** Called by main.js whenever settings.sound changes. */
export function setSoundEnabled(on) { enabled = !!on; }
export const soundEnabled = () => enabled;

const PATTERNS = {
  liftoff: { wave: 'sawtooth', notes: [[110, 0, 0.5], [165, 0.25, 0.6]], vol: 0.06 },
  stage: { wave: 'square', notes: [[440, 0, 0.08], [330, 0.1, 0.12]], vol: 0.05 },
  success: { wave: 'triangle', notes: [[523, 0, 0.14], [659, 0.15, 0.14], [784, 0.3, 0.3]], vol: 0.12 },
  fail: { wave: 'sawtooth', notes: [[294, 0, 0.2], [220, 0.22, 0.2], [147, 0.44, 0.4]], vol: 0.08 },
  click: { wave: 'sine', notes: [[660, 0, 0.05]], vol: 0.06 },
};

export function playSound(name) {
  if (!enabled) return false;
  const p = PATTERNS[name]; if (!p) return false;
  try {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext; if (!AC) return false;
    ctx ??= new AC(); if (ctx.state === 'suspended') ctx.resume?.();
    const t0 = ctx.currentTime;
    for (const [freq, at, len] of p.notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = p.wave; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(p.vol, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(ctx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
    }
    return true;
  } catch { return false; }
}

// ---- 2.6: engine rumble and countdown beeps (all of it obeys the same sound switch)
let rumble = null;
/** Start (or retune) the low engine rumble. level 0..1 follows the throttle. Does nothing when sound is off. */
export function setRumble(level) {
  if (!enabled) { stopRumble(); return false; }
  try {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext; if (!AC) return false;
    ctx ??= new AC(); if (ctx.state === 'suspended') ctx.resume?.();
    if (!rumble) {
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // brown noise
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp).connect(g).connect(ctx.destination); src.start(); rumble = { src, g, lp };
    }
    const l = Math.max(0, Math.min(1, level));
    rumble.g.gain.setTargetAtTime(0.5 * l, ctx.currentTime, 0.15); rumble.lp.frequency.setTargetAtTime(120 + 260 * l, ctx.currentTime, 0.2);
    return true;
  } catch { return false; }
}
export function stopRumble() { try { if (rumble) { rumble.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); const r = rumble; rumble = null; setTimeout(() => { try { r.src.stop(); } catch { /* already stopped */ } }, 600); } } catch { /* optional */ } }
PATTERNS.tick = { wave: 'sine', notes: [[880, 0, 0.09]], vol: 0.08 };
PATTERNS.go = { wave: 'triangle', notes: [[440, 0, 0.1], [880, 0.1, 0.4]], vol: 0.12 };
