// The bell's sound in the page: four recorded files and fifteen recipes synthesised from the approved mockup.
// Silent until the reader's first tap or key press, since browsers only let audio start after one.

export const SOUND_KEYS = [
    'pluck',
    'ping',
    'double',
    'knock',
    'chime',
    'ding',
    'bell',
    'pop',
    'two_note',
    'glass',
    'marimba',
    'bubble',
    'blip',
    'tri_tone',
    'rise',
    'fall',
    'soft',
    'click',
    'harp',
] as const;

export type SoundKey = (typeof SOUND_KEYS)[number];

export const DEFAULT_SOUND: SoundKey = 'pluck';

const FILE_KEYS: ReadonlySet<string> = new Set<SoundKey>(['pluck', 'ping', 'double', 'knock']);

const SOUND_NAMES: Record<SoundKey, string> = {
    pluck: 'Pluck',
    ping: 'Ping',
    double: 'Double',
    knock: 'Knock',
    chime: 'Chime',
    ding: 'Ding',
    bell: 'Bell',
    pop: 'Pop',
    two_note: 'Two-note',
    glass: 'Glass',
    marimba: 'Marimba',
    bubble: 'Bubble',
    blip: 'Blip',
    tri_tone: 'Tri-tone',
    rise: 'Rise',
    fall: 'Fall',
    soft: 'Soft',
    click: 'Click',
    harp: 'Harp',
};

export function isSoundKey(key: string): key is SoundKey {
    return (SOUND_KEYS as readonly string[]).includes(key);
}

/** The sound's display name; never translated. */
export function soundName(key: string): string {
    return isSoundKey(key) ? SOUND_NAMES[key] : key;
}

// d delay s, f Hz, l length s, g gain, w wave, fm [ratio, index], a attack s, cut low-pass Hz, glide Hz, detune cents
interface Note {
    d: number;
    f: number;
    l: number;
    g: number;
    w?: OscillatorType;
    fm?: [number, number];
    a?: number;
    cut?: number;
    glide?: number;
    detune?: number;
}

const RECIPES: Record<string, Note[]> = {
    chime: [
        { d: 0, f: 1046.5, l: 0.9, g: 0.22, fm: [3.5, 1.2] },
        { d: 0.09, f: 1568, l: 0.8, g: 0.14, fm: [3.5, 0.8] },
    ],
    ding: [{ d: 0, f: 1318.5, l: 0.45, g: 0.24, fm: [2, 0.6], cut: 5000 }],
    bell: [{ d: 0, f: 880, l: 1.1, g: 0.2, fm: [1.4, 2.2], cut: 4500 }],
    pop: [{ d: 0, f: 900, l: 0.12, g: 0.3, glide: 300, cut: 2500 }],
    two_note: [
        { d: 0, f: 784, l: 0.32, g: 0.2, detune: -4 },
        { d: 0, f: 784, l: 0.32, g: 0.1, detune: 6 },
        { d: 0.13, f: 1046.5, l: 0.5, g: 0.2, detune: -4 },
        { d: 0.13, f: 1046.5, l: 0.5, g: 0.1, detune: 6 },
    ],
    glass: [
        { d: 0, f: 2093, l: 0.6, g: 0.14, fm: [7, 0.9] },
        { d: 0.06, f: 3136, l: 0.45, g: 0.07, fm: [7, 0.5] },
    ],
    marimba: [
        { d: 0, f: 523.3, l: 0.4, g: 0.3, fm: [4, 2.5], cut: 3500 },
        { d: 0.1, f: 784, l: 0.4, g: 0.22, fm: [4, 2.5], cut: 3500 },
    ],
    bubble: [
        { d: 0, f: 420, l: 0.11, g: 0.24, glide: 1200, cut: 3000 },
        { d: 0.1, f: 520, l: 0.12, g: 0.22, glide: 1500, cut: 3000 },
    ],
    blip: [{ d: 0, f: 1320, l: 0.09, g: 0.2, w: 'triangle', cut: 3000 }],
    tri_tone: [
        { d: 0, f: 659.3, l: 0.25, g: 0.18, fm: [2, 0.4] },
        { d: 0.1, f: 784, l: 0.25, g: 0.18, fm: [2, 0.4] },
        { d: 0.2, f: 1046.5, l: 0.5, g: 0.2, fm: [2, 0.4] },
    ],
    rise: [
        { d: 0, f: 880, l: 0.25, g: 0.2, w: 'triangle', cut: 2800 },
        { d: 0.12, f: 1318.5, l: 0.45, g: 0.2, w: 'triangle', cut: 2800 },
    ],
    fall: [
        { d: 0, f: 1318.5, l: 0.25, g: 0.2, w: 'triangle', cut: 2800 },
        { d: 0.12, f: 880, l: 0.5, g: 0.2, w: 'triangle', cut: 2800 },
    ],
    soft: [
        { d: 0, f: 659.3, l: 0.8, g: 0.14, a: 0.05, cut: 2000 },
        { d: 0, f: 661.5, l: 0.8, g: 0.1, a: 0.05, cut: 2000 },
    ],
    click: [
        { d: 0, f: 2400, l: 0.03, g: 0.18, w: 'triangle', cut: 5000 },
        { d: 0.045, f: 1700, l: 0.035, g: 0.15, w: 'triangle', cut: 5000 },
    ],
    harp: [
        { d: 0, f: 523.3, l: 0.6, g: 0.13, w: 'triangle', cut: 3000 },
        { d: 0.06, f: 659.3, l: 0.6, g: 0.13, w: 'triangle', cut: 3000 },
        { d: 0.12, f: 784, l: 0.6, g: 0.13, w: 'triangle', cut: 3000 },
        { d: 0.18, f: 1046.5, l: 0.7, g: 0.14, w: 'triangle', cut: 3000 },
    ],
};

const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'touchend'] as const;

let unlocked = false;
let listening = false;
let audioPrimed = false;
let sharedCtx: AudioContext | null = null;
let out: GainNode | null = null;
let audio: HTMLAudioElement | null = null;

function audioContextClass(): typeof AudioContext | undefined {
    const w = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return w.AudioContext ?? w.webkitAudioContext;
}

function context(): AudioContext | null {
    if (sharedCtx) return sharedCtx;
    const Ctx = audioContextClass();
    if (!Ctx) return null;
    sharedCtx = new Ctx();
    return sharedCtx;
}

function resume(ctx: AudioContext): Promise<void> {
    return ctx.state === 'suspended' ? ctx.resume().catch(() => undefined) : Promise.resolve();
}

// Master chain: soft compressor plus a short filtered echo for an airy tail
function bus(ctx: AudioContext): GainNode {
    if (out) return out;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.13;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const tint = ctx.createBiquadFilter();
    tint.type = 'lowpass';
    tint.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    master.connect(comp);
    master.connect(delay);
    delay.connect(tint);
    tint.connect(fb);
    fb.connect(delay);
    tint.connect(wet);
    wet.connect(comp);
    comp.connect(ctx.destination);
    out = master;
    return master;
}

// One voice: optional FM bell timbre, soft attack, gentle low-pass, exponential tail
function voice(ctx: AudioContext, at: number, n: Note): void {
    const output = bus(ctx);
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = n.cut || 6000;
    lp.Q.value = 0.4;
    osc.type = n.w || 'sine';
    osc.frequency.setValueAtTime(n.f, at);
    if (n.glide) osc.frequency.exponentialRampToValueAtTime(n.glide, at + n.l * 0.7);
    if (n.detune) osc.detune.value = n.detune;
    if (n.fm) {
        const mod = ctx.createOscillator();
        const depth = ctx.createGain();
        mod.frequency.value = n.f * n.fm[0];
        depth.gain.setValueAtTime(n.f * n.fm[1], at);
        depth.gain.exponentialRampToValueAtTime(1, at + n.l);
        mod.connect(depth).connect(osc.frequency);
        mod.start(at);
        mod.stop(at + n.l + 0.05);
    }
    const attack = n.a || 0.006;
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(n.g, at + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + n.l);
    osc.connect(lp).connect(amp).connect(output);
    osc.start(at);
    osc.stop(at + n.l + 0.05);
}

function playRecipe(key: string): void {
    const ctx = context();
    if (!ctx) return;
    void resume(ctx);
    const t = ctx.currentTime + 0.02;
    const notes = RECIPES[key] || RECIPES.chime;
    notes.forEach((n) => voice(ctx, t + n.d, n));
}

function playFile(key: string): void {
    audio ??= new Audio();
    const src = `/sounds/${key}.mp3`;
    if (!audio.src.endsWith(src)) audio.src = src;
    audio.muted = false;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
}

// Inside a gesture: start the shared context and let the one audio element play later
function prime(): void {
    const ctx = context();
    if (ctx) {
        void resume(ctx).then(() => {
            if (ctx.state === 'running' && audioPrimed) stopListening();
        });
    }
    if (audioPrimed) return;
    audio ??= new Audio();
    audio.muted = true;
    audio.src = `/sounds/${DEFAULT_SOUND}.mp3`;
    audio
        .play()
        .then(() => {
            audio?.pause();
            if (audio) audio.muted = false;
            audioPrimed = true;
            if (!ctx || ctx.state === 'running') stopListening();
        })
        .catch(() => undefined);
}

function onGesture(): void {
    unlocked = true;
    try {
        prime();
    } catch {
        stopListening();
    }
}

function stopListening(): void {
    GESTURES.forEach((name) => window.removeEventListener(name, onGesture, true));
    listening = false;
}

/** Arms the player on the reader's first tap or key press; a page already interacted with is armed at once. */
export function unlockSoundOnFirstGesture(): void {
    if (typeof window === 'undefined' || listening) return;
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (activation?.hasBeenActive) unlocked = true;
    if (audioPrimed && sharedCtx?.state === 'running') return;
    listening = true;
    GESTURES.forEach((name) => window.addEventListener(name, onGesture, { capture: true, passive: true }));
}

/** Plays a bell sound by key (unknown keys play the default); does nothing before the first gesture and never throws. */
export function playNotificationSound(key: string): void {
    if (!unlocked || typeof window === 'undefined') return;
    try {
        const sound = isSoundKey(key) ? key : DEFAULT_SOUND;
        if (FILE_KEYS.has(sound)) {
            playFile(sound);
        } else {
            playRecipe(sound);
        }
    } catch {
        // Audio is best effort
    }
}
