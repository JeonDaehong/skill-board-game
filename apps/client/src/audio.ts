/**
 * The game's voice — synthesised, not sampled.
 *
 * Every sound here is built out of oscillators and a noise buffer at play time.
 * That is a deliberate trade: a chess-and-cards set of thirteen samples is a
 * megabyte of assets to license, host and cache-bust, and this project has no
 * art pipeline for audio the way it has one for card faces. Synthesis costs a
 * few hundred lines once and nothing per sound after that, and a wooden piece
 * landing on a board is a filtered click — which is exactly what a synth is
 * good at.
 *
 * Two rules shape the palette:
 *
 *   Wood for the board, paper for the cards. Moves and captures are short
 *   noise-plus-thump; draws and plays are filtered noise sweeps with no pitch.
 *   Keeping the two families apart is what lets you hear, without looking,
 *   whether something happened on the board or in a hand.
 *
 *   Pitched sounds only where the game means something by them. Check, a card
 *   resolving, the end of the match. If every event chimed, none of them would
 *   read as a warning.
 */

const KEY = "skill-board:muted";

export type Sfx =
  /** A piece lands on a square. */
  | "move"
  /** A piece takes another. */
  | "capture"
  /** A piece is picked up, a menu item is chosen. */
  | "select"
  /** A card leaves the deck for a hand. */
  | "draw"
  /** A card is committed — the moment it starts resolving. */
  | "play"
  /** A piece card resolves onto the board (master mode). */
  | "summon"
  /** A card in play is destroyed, countered, blown away. */
  | "destroy"
  /** An enchant or a timed card runs out on its own. */
  | "expire"
  /** A piece dies to something that was not a capture. */
  | "slain"
  /** The counter window opens on us — answer it or lose it. */
  | "counter"
  /** The king is attacked. */
  | "check"
  /** 도박장's die. */
  | "dice"
  /** The match ends in our favour. */
  | "win"
  /** The match ends against us. */
  | "lose"
  /** The match ends level. */
  | "draw-game"
  // ── outside a match ───────────────────────────────────────
  /** The pointer crosses something clickable. */
  | "hover"
  /** Any ordinary button, anywhere in the app. */
  | "click"
  /** A button that goes back or closes. */
  | "back"
  /** Coins spent, something acquired. */
  | "buy"
  /** The action was refused — too expensive, already owned, deck not legal. */
  | "denied"
  /** A card pack splitting open. */
  | "pack";

// ── the context ─────────────────────────────────────────────
/**
 * Browsers will not start an AudioContext until the page has been interacted
 * with, and one created before that lands in "suspended" and stays there. So it
 * is built on the first sound we are actually asked to make, and `primeAudio`
 * nudges it awake from a real gesture.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // A browser with storage off still gets sound; it just forgets the choice.
  }
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
}

/** Overall loudness. Sound in this game is punctuation, not a soundtrack. */
const MASTER_GAIN = 0.5;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  master.connect(ctx.destination);

  // One second of white noise, reused by every percussive sound. Generating it
  // per hit would allocate 44k floats on the click of a piece.
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/**
 * Wake the audio context from inside a user gesture. Safe to call as often as
 * you like — it is a no-op once the context is running.
 */
export function primeAudio(): void {
  const c = audio();
  if (c && c.state === "suspended") void c.resume();
}

// ── voices ──────────────────────────────────────────────────
/**
 * A pitched blip. `type` picks the timbre, the envelope is a plain
 * attack-and-decay, and `slide` bends the pitch over the note's life — which is
 * the difference between a chime and an alarm.
 */
function tone(
  at: number,
  opts: {
    freq: number;
    slide?: number;
    dur: number;
    gain?: number;
    type?: OscillatorType;
    attack?: number;
  },
): void {
  const c = ctx;
  if (!c || !master) return;
  const { freq, slide, dur, gain = 0.2, type = "sine", attack = 0.008 } = opts;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slide !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slide), at + dur);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/**
 * A burst of filtered noise — every wooden and papery sound in the game.
 * `band` is the filter type: a lowpass burst is a piece hitting a board, a
 * bandpass sweep is a card sliding over another card.
 */
function hit(
  at: number,
  opts: {
    dur: number;
    freq: number;
    sweepTo?: number;
    gain?: number;
    band?: BiquadFilterType;
    q?: number;
  },
): void {
  const c = ctx;
  if (!c || !master || !noise) return;
  const { dur, freq, sweepTo, gain = 0.2, band = "lowpass", q = 1 } = opts;
  const src = c.createBufferSource();
  src.buffer = noise;
  // A random window into the buffer, so ten moves in a row are not ten
  // identical clicks — the repetition is what makes a synthesised sound read as
  // synthesised.
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = c.createBiquadFilter();
  filter.type = band;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, at);
  if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), at + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(env).connect(master);
  const offset = Math.random() * 0.5;
  src.start(at, offset, dur + 0.05);
}

// ── the set ─────────────────────────────────────────────────
/** Each sound, as a recipe against `now`. */
const VOICES: Record<Sfx, (t0: number) => void> = {
  // Wood on wood: a click with a body under it. The body is what stops it
  // sounding like a mouse button.
  move: (t0) => {
    hit(t0, { dur: 0.055, freq: 2600, sweepTo: 700, gain: 0.22 });
    tone(t0, { freq: 190, slide: 96, dur: 0.09, gain: 0.16, type: "triangle" });
  },
  // The same landing, but something was standing there: a scrape before the
  // click, and a lower, longer body after it.
  capture: (t0) => {
    hit(t0, { dur: 0.1, freq: 3400, sweepTo: 420, gain: 0.3, q: 0.7 });
    tone(t0 + 0.01, { freq: 150, slide: 62, dur: 0.17, gain: 0.24, type: "triangle" });
    tone(t0 + 0.02, { freq: 88, slide: 50, dur: 0.2, gain: 0.14, type: "sine" });
  },
  select: (t0) => {
    hit(t0, { dur: 0.03, freq: 3000, gain: 0.11, band: "bandpass", q: 2 });
  },
  // Paper leaving paper — a bandpass sweep upward, no pitch at all.
  draw: (t0) => {
    hit(t0, { dur: 0.17, freq: 900, sweepTo: 3600, gain: 0.17, band: "bandpass", q: 1.4 });
  },
  // A card meeting the table, then the effect taking hold.
  play: (t0) => {
    hit(t0, { dur: 0.08, freq: 2200, sweepTo: 600, gain: 0.24 });
    tone(t0 + 0.03, { freq: 520, slide: 780, dur: 0.2, gain: 0.13, type: "triangle" });
  },
  // Something arriving that was not there: a rising fifth with a knock under it.
  summon: (t0) => {
    tone(t0, { freq: 330, dur: 0.16, gain: 0.14, type: "triangle" });
    tone(t0 + 0.07, { freq: 494, dur: 0.24, gain: 0.15, type: "triangle" });
    hit(t0 + 0.07, { dur: 0.09, freq: 1400, sweepTo: 400, gain: 0.16 });
  },
  // A card being torn out of play. Downward, with grit.
  destroy: (t0) => {
    hit(t0, { dur: 0.22, freq: 2400, sweepTo: 200, gain: 0.26, q: 0.6 });
    tone(t0, { freq: 240, slide: 70, dur: 0.26, gain: 0.16, type: "sawtooth" });
  },
  // A card running out on its own is not a defeat — a soft step down, no grit.
  expire: (t0) => {
    tone(t0, { freq: 620, slide: 380, dur: 0.2, gain: 0.1, type: "sine" });
  },
  // A piece removed by something other than a capture: the body without the
  // click, so a card killing a piece does not sound like a move.
  slain: (t0) => {
    tone(t0, { freq: 170, slide: 55, dur: 0.28, gain: 0.2, type: "triangle" });
    hit(t0 + 0.02, { dur: 0.16, freq: 700, sweepTo: 160, gain: 0.16 });
  },
  // The one sound that is asking for something: two rising notes, urgent, and
  // deliberately the least wooden thing in the set.
  counter: (t0) => {
    tone(t0, { freq: 740, dur: 0.11, gain: 0.16, type: "square" });
    tone(t0 + 0.11, { freq: 988, dur: 0.16, gain: 0.16, type: "square" });
  },
  // A warning, not an event: a minor second is the interval that will not sit
  // still, which is the whole point of check.
  check: (t0) => {
    tone(t0, { freq: 880, dur: 0.15, gain: 0.15, type: "triangle" });
    tone(t0 + 0.005, { freq: 932, dur: 0.22, gain: 0.11, type: "triangle" });
  },
  // Dice in a cup: four scattered clicks, no two the same.
  dice: (t0) => {
    for (let i = 0; i < 4; i++) {
      hit(t0 + i * 0.045 + Math.random() * 0.02, {
        dur: 0.035, freq: 2400 + Math.random() * 1600, gain: 0.14, band: "bandpass", q: 2.5,
      });
    }
  },
  // A major triad walking up, and the octave to land on.
  win: (t0) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(t0 + i * 0.1, { freq: f, dur: i === 3 ? 0.6 : 0.24, gain: 0.16, type: "triangle" });
    });
  },
  // The same shape, minor and descending.
  lose: (t0) => {
    [440, 349.23, 293.66, 220].forEach((f, i) => {
      tone(t0 + i * 0.12, { freq: f, dur: i === 3 ? 0.7 : 0.28, gain: 0.15, type: "triangle" });
    });
  },
  // Level: two notes that neither rise nor fall.
  "draw-game": (t0) => {
    tone(t0, { freq: 392, dur: 0.3, gain: 0.14, type: "triangle" });
    tone(t0 + 0.16, { freq: 392, dur: 0.45, gain: 0.12, type: "triangle" });
  },

  // ── outside a match ───────────────────────────────────────
  // Hover fires on nearly every pointer move across a menu, so it is the
  // quietest thing in the game by a wide margin — a hint that something is
  // live, not an event. Anything louder here becomes a rattle within seconds.
  hover: (t0) => {
    hit(t0, { dur: 0.022, freq: 4200, gain: 0.035, band: "bandpass", q: 3 });
  },
  // The confirming click: a tick with a short pitched tail, so it reads as
  // "taken" rather than as a stray noise.
  click: (t0) => {
    hit(t0, { dur: 0.035, freq: 2800, gain: 0.13, band: "bandpass", q: 2 });
    tone(t0 + 0.008, { freq: 760, slide: 1020, dur: 0.07, gain: 0.075, type: "triangle" });
  },
  // The same shape, falling — leaving instead of entering.
  back: (t0) => {
    hit(t0, { dur: 0.035, freq: 2200, gain: 0.11, band: "bandpass", q: 2 });
    tone(t0 + 0.008, { freq: 620, slide: 430, dur: 0.09, gain: 0.075, type: "triangle" });
  },
  // Coins. Two bright partials a fifth apart, which is what makes metal sound
  // like metal rather than like a bell.
  buy: (t0) => {
    tone(t0, { freq: 1245, dur: 0.13, gain: 0.11, type: "triangle" });
    tone(t0 + 0.045, { freq: 1865, dur: 0.22, gain: 0.09, type: "triangle" });
    hit(t0, { dur: 0.05, freq: 5200, gain: 0.07, band: "bandpass", q: 3 });
  },
  // A refusal has to be unmistakable and over immediately: low, flat, no tail.
  denied: (t0) => {
    tone(t0, { freq: 196, dur: 0.1, gain: 0.14, type: "square" });
    tone(t0 + 0.09, { freq: 165, dur: 0.14, gain: 0.12, type: "square" });
  },
  // Foil tearing, then the cards inside.
  pack: (t0) => {
    hit(t0, { dur: 0.24, freq: 1200, sweepTo: 5200, gain: 0.2, band: "bandpass", q: 0.9 });
    tone(t0 + 0.14, { freq: 523.25, dur: 0.18, gain: 0.11, type: "triangle" });
    tone(t0 + 0.24, { freq: 783.99, dur: 0.3, gain: 0.11, type: "triangle" });
  },
};

/**
 * How close together the same sound may fire. A card that kills three pawns
 * raises three `slain` events in the same tick, and three identical envelopes
 * stacked on the same sample sum into a clip, not a sound — so repeats inside
 * the window are nudged apart rather than dropped. Dropping them would lose the
 * count, which is exactly what the player is listening for.
 */
const REPEAT_GAP = 0.07;
const lastAt = new Map<Sfx, number>();

// ── the interface's own noises ──────────────────────────────
/**
 * Hover and click for every screen outside a match, wired once at the document
 * level rather than per screen. Screens here are rebuilt from scratch on every
 * navigation, so a per-button listener would be a line in twenty files and a
 * missing line in the twenty-first.
 *
 * What counts as clickable is not a list of class names — that list rots the
 * first time a screen adds a tile. It is whatever the stylesheet already gives
 * a pointer cursor, which is the same rule the player is going by.
 */
export function installUiSounds(root: Document | HTMLElement = document): void {
  let hovered: Element | null = null;

  root.addEventListener("pointerover", (e) => {
    if (muted) return;
    const hit = clickable(e.target);
    if (hit === hovered) return;
    hovered = hit;
    if (hit) playSfx("hover");
  }, { capture: true, passive: true });

  root.addEventListener("pointerdown", (e) => {
    const hit = clickable(e.target);
    if (!hit) return;
    // Leaving makes a different noise from arriving. The app marks its way out
    // with a leading arrow on every back / leave / cancel label, so that is
    // what this reads rather than a list of class names.
    const label = (hit.textContent ?? "").trim();
    playSfx(label.startsWith("←") || hit.classList.contains("back-btn") ? "back" : "click");
  }, { capture: true, passive: true });
}

/** The nearest ancestor the stylesheet treats as clickable, if any. */
function clickable(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof Element ? target : null;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hasAttribute("disabled")) return null;
    const cursor = getComputedStyle(node).cursor;
    if (cursor === "pointer") return node;
    // `not-allowed` is a deliberate "you cannot press this" — it is still the
    // end of the search, so a blocked card does not fall through to the panel
    // behind it and click.
    if (cursor === "not-allowed") return null;
  }
  return null;
}

export function playSfx(name: Sfx): void {
  if (muted) return;
  const c = audio();
  if (!c || c.state === "closed") return;
  if (c.state === "suspended") {
    // Not primed yet — a sound made now would never be heard, and queueing it
    // means the first click of the session plays a backlog.
    void c.resume();
    return;
  }
  const voice = VOICES[name];
  if (!voice) return;
  const at = Math.max(c.currentTime, (lastAt.get(name) ?? 0) + REPEAT_GAP);
  lastAt.set(name, at);
  voice(at);
}
