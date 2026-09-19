import { createRuinsScene } from './ruins-scene.js';
import { wristSteering } from './wrist.js';
import { ECHO_POSITION, observationTarget, observationViewport } from './observation-camera.js';
import { echoReading } from './echo.js';
import * as THREE from 'three';
import { createHandTracking } from './hand-tracking.js';
import { createExploration } from './exploration.js';

/* ==========================================================
 * 配置 & 主题
 * ========================================================== */
const compactDevice = matchMedia('(max-width: 900px), (pointer: coarse)').matches;
const lightweight = compactDevice || (navigator.hardwareConcurrency || 8) <= 4;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONFIG = {
    particleCount: lightweight ? 4200 : 12000,
    ringParticleCount: lightweight ? 1200 : 4000,
    starCount: lightweight ? 1000 : 2800,
    pixelRatio: Math.min(window.devicePixelRatio || 1, lightweight ? 1.25 : 1.75),
    minDistance: 90,
    defaultDistance: 320,
    rotationSpeedMultiplier: 0.05
};

// 主题：每个主题含星球/星环/核心/星云颜色（0~1 RGB）
const THEMES = [
    { name: '琥珀星云', planet: [1.0, 0.55, 0.12], ring: [1.0, 0.85, 0.45], core: [1.0, 0.65, 0.25], neb: [0.95, 0.35, 0.10] },
    { name: '冰蓝深空', planet: [0.25, 0.62, 1.0], ring: [0.55, 0.92, 1.0], core: [0.35, 0.75, 1.0], neb: [0.15, 0.40, 0.95] },
    { name: '紫罗兰幻境', planet: [0.72, 0.22, 1.0], ring: [1.0, 0.42, 0.92], core: [0.85, 0.35, 1.0], neb: [0.45, 0.12, 0.78] },
    { name: '翡翠星海', planet: [0.20, 1.0, 0.55], ring: [0.65, 1.0, 0.82], core: [0.30, 1.0, 0.55], neb: [0.10, 0.65, 0.35] },
    { name: '赤焰核心', planet: [1.0, 0.20, 0.25], ring: [1.0, 0.55, 0.45], core: [1.0, 0.30, 0.20], neb: [0.90, 0.15, 0.20] },
];
let themeIndex = 0;

/* ==========================================================
 * 全局对象
 * ========================================================== */
let scene, camera, renderer, composer, bloomPass;
let planetSystem, ringSystem1, ringSystem2, starField, nebulaGroup, coreSprite, coreSphere;
let particleTexture;
let time = 0;
let lastT = performance.now();
let running = false;
let animationId = 0;
let fitScale = 1;
const cameraFocus = new THREE.Vector3();
const originFocus = new THREE.Vector3();

// 相机控制状态
const cameraState = {
    radius: CONFIG.defaultDistance,
    theta: Math.PI / 2,
    phi: 0,
    zoomVelocity: 0,
    targetRadius: CONFIG.defaultDistance,
    handRotation: 0,
    isFist: false,
    isOpen: false,
    twoHandActive: false,
    baseFov: 60,
};

// 特效状态（倒计时）
const fxState = { warp: 0, collapse: 0, supernova: 0, bloomBoost: 0 };

const statusEl = document.getElementById('gesture-status');
const themeTagEl = document.getElementById('theme-tag');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const loadingHint = document.getElementById('loading-hint');
const flashEl = document.getElementById('flash');
const cameraBtn = document.getElementById('camera-btn');
const actionBar = document.getElementById('action-bar');
const container = document.getElementById('canvas-container');
const pointers = new Map();
let manualUntil = 0;
document.getElementById('help-panel').open = false;

/* ==========================================================
 * 音频引擎：星际穿越风格环境乐 + 手势音效
 * ========================================================== */
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.started = false;
        this.muted = false;
        this.musicVol = 0.55;
    }

    async start() {
        if (this.started) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        // 总线
        this.master = this.ctx.createGain();
        this.master.gain.value = this.musicVol;
        this.master.connect(this.ctx.destination);

        // 混响（合成脉冲响应）
        this.reverb = this._makeReverb(lightweight ? 2.0 : 5.0, 2.6);
        this.reverbSend = this.ctx.createGain();
        this.reverbSend.gain.value = 0.55;
        this.reverbReturn = this.ctx.createGain();
        this.reverbReturn.gain.value = 0.9;
        this.reverbSend.connect(this.reverb);
        this.reverb.connect(this.reverbReturn);
        this.reverbReturn.connect(this.master);

        // 音乐总线 / 音效总线
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.master);
        this.musicGain.connect(this.reverbSend);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.85;
        this.sfxGain.connect(this.master);
        this.sfxGain.connect(this.reverbSend);

        this._startMusic();
        this.musicGain.gain.setTargetAtTime(0.42, this.ctx.currentTime, 3.5);
        this.started = true;
    }

    _makeReverb(duration, decay) {
        const sr = this.ctx.sampleRate;
        const len = Math.floor(sr * duration);
        const buf = this.ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
            }
        }
        const conv = this.ctx.createConvolver();
        conv.buffer = buf;
        return conv;
    }

    // 环境乐：低音drone + 三振荡器pad + 缓慢和弦进行 + 高音琶音
    _startMusic() {
        // 和弦进行（Dm - Am - Bb - F），营造空旷辽阔感
        this.prog = [
            { bass: 73.42,  notes: [146.83, 174.61, 220.00] }, // Dm
            { bass: 55.00,  notes: [110.00, 130.81, 164.81] }, // Am
            { bass: 58.27,  notes: [116.54, 146.83, 174.61] }, // Bb
            { bass: 43.65,  notes: [87.31, 130.81, 174.61] },  // F
        ];
        this.chordIndex = 0;
        const chord0 = this.prog[0];

        // 低音管风琴 drone
        this.bassOsc = this.ctx.createOscillator();
        this.bassOsc.type = 'sine';
        this.bassOsc.frequency.value = chord0.bass;
        const bassGain = this.ctx.createGain();
        bassGain.gain.value = 0.16;
        // 低音也加一点上方泛音
        this.bassOsc2 = this.ctx.createOscillator();
        this.bassOsc2.type = 'triangle';
        this.bassOsc2.frequency.value = chord0.bass * 2;
        const bassGain2 = this.ctx.createGain();
        bassGain2.gain.value = 0.05;
        this.bassOsc.connect(bassGain).connect(this.musicGain);
        this.bassOsc2.connect(bassGain2).connect(this.musicGain);
        this.bassOsc.start(); this.bassOsc2.start();

        // Pad：三个振荡器 + 低通滤波（管风琴质感）
        this.padOscs = chord0.notes.map((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = i === 1 ? 'sawtooth' : 'triangle';
            osc.frequency.value = f;
            osc.detune.value = (Math.random() - 0.5) * 10;
            const g = this.ctx.createGain();
            g.gain.value = 0.07;
            const filt = this.ctx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = 700;
            filt.Q.value = 1.2;
            osc.connect(filt).connect(g);
            g.connect(this.musicGain);
            g.connect(this.reverbSend);
            osc.start();
            return { osc, gain: g, filt };
        });

        // LFO 缓慢扫滤波器，制造"呼吸感"
        this.lfo = this.ctx.createOscillator();
        this.lfo.frequency.value = 0.06;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 420;
        this.lfo.connect(lfoGain);
        this.padOscs.forEach(p => lfoGain.connect(p.filt.frequency));
        this.lfo.start();

        // 和弦进行调度（每 13 秒切换，带 portamento）
        this._chordTimer = setInterval(() => {
            this.chordIndex = (this.chordIndex + 1) % this.prog.length;
            const c = this.prog[this.chordIndex];
            const t = this.ctx.currentTime;
            this.bassOsc.frequency.setTargetAtTime(c.bass, t, 2.5);
            this.bassOsc2.frequency.setTargetAtTime(c.bass * 2, t, 2.5);
            c.notes.forEach((f, i) => {
                if (this.padOscs[i]) this.padOscs[i].osc.frequency.setTargetAtTime(f, t, 2.5);
            });
        }, 13000);

        // 高音琶音点缀（随机间隔）
        this._arpTimer = setInterval(() => this._arpNote(), 2200);
    }

    _arpNote() {
        if (!this.started || this.muted || this.ctx.state !== 'running') return;
        const c = this.prog[this.chordIndex];
        const f = c.notes[Math.floor(Math.random() * c.notes.length)] * 4; // 高两个八度
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
        osc.connect(g);
        g.connect(this.sfxGain);
        g.connect(this.reverbSend);
        osc.start(t);
        osc.stop(t + 3.1);
    }

    // 通用音色工具
    _tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
        if (!this.started || this.muted || this.ctx.state !== 'running') return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(this.sfxGain);
        g.connect(this.reverbSend);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    _noise(dur, vol = 0.3, filterType = 'lowpass', filterFreq = 1000) {
        if (!this.started || this.muted || this.ctx.state !== 'running') return;
        const t = this.ctx.currentTime;
        const sr = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const filt = this.ctx.createBiquadFilter();
        filt.type = filterType;
        filt.frequency.value = filterFreq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt).connect(g);
        g.connect(this.sfxGain);
        g.connect(this.reverbSend);
        src.start(t);
        src.stop(t + dur);
    }

    // 各手势音效
    sfxZoomIn()  { this._tone(330, 1.6, 'sine', 0.22, 880); this._tone(495, 1.6, 'triangle', 0.10, 1320); }
    sfxZoomOut() { this._tone(220, 1.3, 'sawtooth', 0.16, 70); this._tone(110, 1.3, 'sine', 0.12, 50); }
    sfxPinch()   { this._tone(2200, 0.18, 'sine', 0.16, 3400); this._tone(2800, 0.22, 'sine', 0.08); }
    sfxPeace()   {
        this._tone(523.25, 0.45, 'triangle', 0.16);
        setTimeout(() => this._tone(659.25, 0.5, 'triangle', 0.15), 130);
        setTimeout(() => this._tone(783.99, 0.6, 'triangle', 0.13), 260);
    }
    sfxPoint()   { this._tone(1200, 0.22, 'square', 0.10, 300); this._noise(0.18, 0.06, 'highpass', 1500); }
    sfxThree()   { this._tone(440, 0.5, 'triangle', 0.14, 880); this._noise(0.4, 0.05, 'bandpass', 2000); }
    sfxWarp()    { this._tone(80, 2.2, 'sawtooth', 0.22, 1800); this._noise(2.0, 0.10, 'lowpass', 600); }
    sfxCollapse(){ this._tone(500, 1.6, 'sine', 0.22, 40); this._noise(1.4, 0.12, 'lowpass', 400); }
    sfxSupernova(){
        this._tone(55, 2.5, 'sine', 0.30, 28);
        this._noise(1.8, 0.30, 'lowpass', 1200);
        setTimeout(() => this._tone(880, 1.2, 'sine', 0.16, 1760), 120);
    }

    setVolume(v) {
        this.musicVol = v;
        if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.1);
    }
    toggleMute() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.musicVol, this.ctx.currentTime, 0.1);
        return this.muted;
    }
}
const audio = new AudioEngine();

/* ==========================================================
 * Three.js 场景初始化
 * ========================================================== */
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x01030a, 0.0006);

    camera = new THREE.PerspectiveCamera(cameraState.baseFov, window.innerWidth / window.innerHeight, 1, 4000);
    camera.position.set(0, 0, CONFIG.defaultDistance);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: lightweight ? 'default' : 'high-performance' });
    renderer.setPixelRatio(CONFIG.pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);

    particleTexture = createParticleTexture();

    buildPlanet();
    buildRings();
    buildStarField();
    buildNebula();
    buildCore();

    applyTheme(themeIndex, true);

    window.addEventListener('resize', onWindowResize);
    window.visualViewport?.addEventListener('resize', onWindowResize);
    onWindowResize();
    renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        cancelAnimationFrame(animationId);
        stopHands();
        statusEl.textContent = '画面暂时中断，正在恢复…';
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => {
        lastT = performance.now();
        statusEl.textContent = '画面已恢复，可继续操作';
        if (running && !document.hidden) animate();
    });
}

// 圆形软光点纹理
function createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
}

// 星云云团纹理
function createNebulaTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
        const x = 128 + (Math.random() - 0.5) * 220;
        const y = 128 + (Math.random() - 0.5) * 220;
        const r = 18 + Math.random() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
    }
    // 手机不用 Bloom 时也要保留柔和边缘，避免云团纹理露出方形边界。
    ctx.globalCompositeOperation = 'destination-in';
    const edgeFade = ctx.createRadialGradient(128, 128, 24, 128, 128, 128);
    edgeFade.addColorStop(0, 'rgba(255,255,255,1)');
    edgeFade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = edgeFade;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
}

/* ---- 星球粒子（自定义 Shader：流动/呼吸/颜色渐变/闪烁） ---- */
const planetUniforms = {
    uTime: { value: 0 },
    uPulse: { value: 0 },     // 外部脉冲（特效）
    uCollapse: { value: 0 },  // 坍缩强度
    uColorCore: { value: new THREE.Vector3(1, 0.7, 0.2) },
    uColorOuter: { value: new THREE.Vector3(1.0, 0.55, 0.12) },
    uTexture: { value: null },
};

const planetVertex = `
    attribute float aSize;
    attribute float aPhase;
    attribute float aRadius;   // 粒子初始半径（归一化 0~1）
    uniform float uTime;
    uniform float uPulse;
    uniform float uCollapse;
    varying float vRad;
    varying float vTwinkle;

    void main() {
        vec3 pos = position;

        // 呼吸：整体半径周期性胀缩
        float breath = sin(uTime * 0.7) * 0.5 + 0.5;
        float scale = 1.0 + breath * 0.04 + uPulse * 0.12 - uCollapse * 0.45;
        pos *= scale;

        // 流动：基于相位与位置的微小扰动
        float ph = aPhase * 6.2831853;
        float sw = sin(uTime * 0.5 + ph + pos.y * 0.15);
        pos.x += sw * 0.6;
        pos.y += cos(uTime * 0.4 + ph + pos.z * 0.12) * 0.6;
        pos.z += sin(uTime * 0.45 + ph + pos.x * 0.12) * 0.6;

        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + ph * 3.0);
        vTwinkle = twinkle;
        vRad = aRadius;
        gl_PointSize = aSize * (340.0 / -mv.z) * (0.8 + breath * 0.4);
        gl_Position = projectionMatrix * mv;
    }
`;
const planetFragment = `
    uniform sampler2D uTexture;
    uniform vec3 uColorCore;
    uniform vec3 uColorOuter;
    varying float vRad;
    varying float vTwinkle;
    void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.01) discard;
        vec3 col = mix(uColorCore, uColorOuter, smoothstep(0.0, 1.0, vRad));
        gl_FragColor = vec4(col * vTwinkle, tex.a);
    }
`;

function buildPlanet() {
    const geo = new THREE.BufferGeometry();
    const pos = [], sizes = [], phases = [], radii = [];
    const baseR = 50;
    for (let i = 0; i < CONFIG.particleCount; i++) {
        const u = Math.random();
        const v = Math.random();
        const th = 2 * Math.PI * u;
        const ph = Math.acos(2 * v - 1);
        let r = baseR;
        if (Math.random() > 0.8) r = baseR * Math.random(); // 内部填充
        const x = r * Math.sin(ph) * Math.cos(th);
        const y = r * Math.sin(ph) * Math.sin(th);
        const z = r * Math.cos(ph);
        pos.push(x, y, z);
        sizes.push(Math.random() * 2.5 + 1.0);
        phases.push(Math.random());
        radii.push(r / baseR);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));

    planetUniforms.uTexture.value = particleTexture;
    const mat = new THREE.ShaderMaterial({
        uniforms: planetUniforms,
        vertexShader: planetVertex,
        fragmentShader: planetFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    planetSystem = new THREE.Points(geo, mat);
    scene.add(planetSystem);
}

/* ---- 星环（同样使用 shader，颜色与星球协调） ---- */
const ringUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Vector3(1, 0.85, 0.45) },
    uTexture: { value: null },
};
const ringVertex = `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime;
    varying float vTw;
    void main() {
        vec3 pos = position;
        // 环的波动
        float ph = aPhase * 6.2831853;
        pos.y += sin(uTime * 0.8 + ph + pos.x * 0.02) * 0.6;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        vTw = 0.6 + 0.4 * sin(uTime * 1.5 + ph * 2.0);
        gl_PointSize = aSize * (320.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const ringFragment = `
    uniform sampler2D uTexture;
    uniform vec3 uColor;
    varying float vTw;
    void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.01) discard;
        gl_FragColor = vec4(uColor * vTw, tex.a * 0.9);
    }
`;

function createRing(radiusInner, radiusOuter, count, tiltX, tiltZ) {
    const geo = new THREE.BufferGeometry();
    const pos = [], sizes = [], phases = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = THREE.MathUtils.lerp(radiusInner, radiusOuter, Math.random());
        pos.push(r * Math.cos(angle), (Math.random() - 0.5) * 2, r * Math.sin(angle));
        sizes.push(Math.random() * 2 + 0.8);
        phases.push(Math.random());
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    ringUniforms.uTexture.value = particleTexture;
    const mat = new THREE.ShaderMaterial({
        uniforms: ringUniforms,
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const sys = new THREE.Points(geo, mat);
    sys.rotation.x = tiltX;
    sys.rotation.z = tiltZ;
    return sys;
}

function buildRings() {
    ringSystem1 = createRing(70, 115, CONFIG.ringParticleCount, Math.PI / 3, Math.PI / 6);
    ringSystem2 = createRing(82, 150, CONFIG.ringParticleCount * 0.7, -Math.PI / 4, -Math.PI / 8);
    scene.add(ringSystem1, ringSystem2);
}

/* ---- 多层星空（带闪烁） ---- */
const starUniforms = {
    uTime: { value: 0 },
    uTexture: { value: null },
};
const starVertex = `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime;
    varying float vTw;
    void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTw = 0.4 + 0.6 * sin(uTime * 1.5 + aPhase * 12.0);
        gl_PointSize = aSize * (260.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
    }
`;
const starFragment = `
    uniform sampler2D uTexture;
    varying float vTw;
    void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        if (tex.a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0) * vTw, tex.a * vTw);
    }
`;
function buildStarField() {
    const geo = new THREE.BufferGeometry();
    const pos = [], sizes = [], phases = [];
    for (let i = 0; i < CONFIG.starCount; i++) {
        // 大球壳分布
        const r = 800 + Math.random() * 1800;
        const u = Math.random(), v = Math.random();
        const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
        sizes.push(Math.random() * 2.2 + 0.4);
        phases.push(Math.random());
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    starUniforms.uTexture.value = particleTexture;
    const mat = new THREE.ShaderMaterial({
        uniforms: starUniforms,
        vertexShader: starVertex,
        fragmentShader: starFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    starField = new THREE.Points(geo, mat);
    scene.add(starField);
}

/* ---- 星云云团（大精灵叠加） ---- */
function buildNebula() {
    nebulaGroup = new THREE.Group();
    const tex = createNebulaTexture();
    const theme = THEMES[themeIndex];
    const sprites = [];
    for (let i = 0; i < (lightweight ? 4 : 7); i++) {
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.5,
        });
        const sp = new THREE.Sprite(mat);
        const r = 600 + Math.random() * 900;
        const u = Math.random(), v = Math.random();
        const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        sp.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
        const s = 400 + Math.random() * 600;
        sp.scale.set(s, s, 1);
        sp.userData.phase = Math.random() * Math.PI * 2;
        sp.userData.colorName = 'neb';
        sprites.push(sp);
        nebulaGroup.add(sp);
    }
    scene.add(nebulaGroup);
    nebulaGroup.userData.sprites = sprites;
}

/* ---- 银河核心辉光 ---- */
function buildCore() {
    // 中心亮精灵
    const tex = particleTexture;
    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
    });
    coreSprite = new THREE.Sprite(mat);
    coreSprite.scale.set(120, 120, 1);
    scene.add(coreSprite);

    // 内核小球（实体感）
    const sphereGeo = new THREE.SphereGeometry(8, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    coreSphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(coreSphere);
}

function applyTheme(idx, immediate = false) {
    const t = THEMES[idx];
    planetUniforms.uColorCore.value.set(t.core[0], t.core[1], t.core[2]);
    planetUniforms.uColorOuter.value.set(t.planet[0], t.planet[1], t.planet[2]);
    ringUniforms.uColor.value.set(t.ring[0], t.ring[1], t.ring[2]);
    coreSprite.material.color = new THREE.Color(t.core[0], t.core[1], t.core[2]);
    // 星云精灵染色
    if (nebulaGroup) {
        nebulaGroup.userData.sprites.forEach(sp => {
            sp.material.color = new THREE.Color(t.neb[0], t.neb[1], t.neb[2]);
        });
    }
    themeTagEl.innerText = '主题：' + t.name;
}

function cycleTheme() {
    themeIndex = (themeIndex + 1) % THEMES.length;
    applyTheme(themeIndex);
}

function onWindowResize() {
    const width = container.clientWidth;
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    const nextFit = Math.max(1, 0.85 / camera.aspect);
    cameraState.radius = THREE.MathUtils.clamp(cameraState.radius * nextFit / fitScale, CONFIG.minDistance, 2200);
    cameraState.targetRadius = cameraState.radius;
    fitScale = nextFit;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer?.setSize(width, height);
}

/* ==========================================================
 * 特效系统：burst / comet / 状态特效
 * ========================================================== */
const activeEffects = [];

function spawnBurst(origin, color, count, speed, life, size = 4) {
    if (activeEffects.length >= 12) return;
    if (lightweight) count = Math.ceil(count * 0.55);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
        pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        vel.push(dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color, size, map: particleTexture, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    activeEffects.push({ pts, vel, life, age: 0, geo, mat, drag: 0.98 });
}

// 流星：定向高速粒子流
function spawnComet() {
    if (activeEffects.length >= 12) return;
    const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5).normalize();
    const start = dir.clone().multiplyScalar(-400);
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
        pos[i * 3] = start.x + (Math.random() - 0.5) * 6;
        pos[i * 3 + 1] = start.y + (Math.random() - 0.5) * 6;
        pos[i * 3 + 2] = start.z + (Math.random() - 0.5) * 6;
        vel.push(dir.clone().multiplyScalar(260 + Math.random() * 120));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffeecc, size: 5, map: particleTexture, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    activeEffects.push({ pts, vel, life: 2.5, age: 0, geo, mat, drag: 1.0 });
}

// 星爆环：环形扩散
function spawnRingBurst() {
    if (activeEffects.length >= 12) return;
    const count = lightweight ? 160 : 300;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        vel.push(dir.multiplyScalar(180 + Math.random() * 40));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const theme = THEMES[themeIndex];
    const col = new THREE.Color(theme.ring[0], theme.ring[1], theme.ring[2]);
    const mat = new THREE.PointsMaterial({
        color: col, size: 5, map: particleTexture, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1,
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    activeEffects.push({ pts, vel, life: 1.8, age: 0, geo, mat, drag: 0.99 });
}

function updateEffects(dt) {
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const e = activeEffects[i];
        e.age += dt;
        const arr = e.geo.attributes.position.array;
        for (let j = 0; j < e.vel.length; j++) {
            arr[j * 3] += e.vel[j].x * dt;
            arr[j * 3 + 1] += e.vel[j].y * dt;
            arr[j * 3 + 2] += e.vel[j].z * dt;
            e.vel[j].multiplyScalar(Math.pow(e.drag, dt * 60));
        }
        e.geo.attributes.position.needsUpdate = true;
        e.mat.opacity = Math.max(0, 1 - e.age / e.life);
        if (e.age >= e.life) {
            scene.remove(e.pts);
            e.geo.dispose();
            e.mat.dispose();
            activeEffects.splice(i, 1);
        }
    }
}

// 触发器：节流防止重复
const lastTrigger = {};
function trigger(name, fn, cooldown = 700) {
    const now = performance.now();
    if (lastTrigger[name] && now - lastTrigger[name] < cooldown) return;
    lastTrigger[name] = now;
    fn();
}

function doWarp() {
    audio.sfxWarp();
    fxState.warp = 2.4;
    fxState.bloomBoost = 1.2;
}
function doCollapse() {
    audio.sfxCollapse();
    fxState.collapse = 1.8;
    spawnBurst(new THREE.Vector3(0, 0, 0), 0x88aaff, 200, 60, 1.2, 3);
}
function doSupernova() {
    audio.sfxSupernova();
    fxState.supernova = 1.2;
    fxState.bloomBoost = 2.0;
    spawnBurst(new THREE.Vector3(0, 0, 0), 0xffffff, 600, 220, 2.2, 5);
    spawnBurst(new THREE.Vector3(0, 0, 0), 0xffddaa, 300, 120, 2.0, 4);
    // CSS 白闪
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '0.9';
    requestAnimationFrame(() => {
        flashEl.style.transition = 'opacity 1.2s';
        flashEl.style.opacity = '0';
    });
}

/* ==========================================================
 * 相机更新
 * ========================================================== */
function updateCamera(dt) {
    const step = dt * 60;
    const observationContext = exploration.context();
    const observingEcho = ['观测星海', '追寻回响'].includes(observationContext.route) && (!observationContext.scanned || observationContext.route === '追寻回响' && observationContext.shipStage < 2);
    const echoAngle = Math.abs(Math.atan2(Math.sin(cameraState.phi - .8), Math.cos(cameraState.phi - .8)));
    // 旋转
    if (Math.abs(cameraState.handRotation) > 0.1) {
        const assistance = observingEcho ? (echoAngle < .6 ? .22 : .55) : 1;
        cameraState.phi += cameraState.handRotation * CONFIG.rotationSpeedMultiplier * step * assistance;
    }

    // 缩放
    if (cameraState.twoHandActive) {
        // 双手模式直接 lerp 到目标半径
        const diff = cameraState.targetRadius - cameraState.radius;
        cameraState.radius += diff * (1 - Math.pow(0.94, step));
        cameraState.zoomVelocity = 0;
    } else if (cameraState.isFist) {
        cameraState.zoomVelocity = Math.min(24, cameraState.zoomVelocity + 0.5 * step);
    } else if (cameraState.isOpen) {
        const diff = cameraState.radius - CONFIG.minDistance;
        cameraState.zoomVelocity = -diff * 0.05;
        cameraState.targetRadius = CONFIG.minDistance;
    } else {
        cameraState.zoomVelocity *= Math.pow(0.9, step);
    }
    cameraState.radius += cameraState.zoomVelocity * step;

    if (cameraState.radius < CONFIG.minDistance) {
        cameraState.radius = CONFIG.minDistance; cameraState.zoomVelocity = 0;
    }
    if (cameraState.radius > 2200) cameraState.radius = 2200;

    // 闲置自转
    if (!observingEcho && !reducedMotion && !pointers.size && performance.now() > manualUntil && !cameraState.isFist && !cameraState.isOpen && !cameraState.twoHandActive && Math.abs(cameraState.handRotation) < 0.1) {
        cameraState.phi -= 0.0012 * step;
    }

    camera.position.x = cameraState.radius * Math.sin(cameraState.theta) * Math.sin(cameraState.phi);
    camera.position.y = cameraState.radius * Math.cos(cameraState.theta);
    camera.position.z = cameraState.radius * Math.sin(cameraState.theta) * Math.cos(cameraState.phi);
    // Orbit the discovered object, so approaching cannot carry the camera past it.
    const focusTarget = observationTarget(observationContext);
    cameraFocus.lerp(focusTarget || originFocus, dt === 0 ? 1 : 1 - Math.exp(-dt * 9));
    camera.position.add(cameraFocus);
    camera.lookAt(cameraFocus);
    document.body.classList.toggle('focused-observation', !!focusTarget);
    if (focusTarget) {
        const hud = document.getElementById('ui-layer').getBoundingClientRect();
        const center = observationViewport(innerWidth, innerHeight, hud);
        camera.setViewOffset(innerWidth, innerHeight, innerWidth / 2 - center.x, innerHeight / 2 - center.y, innerWidth, innerHeight);
    } else if (camera.view?.enabled) camera.clearViewOffset();

    // 曲速：FOV 脉冲
    const warpFov = fxState.warp > 0 ? 30 * (fxState.warp / 2.4) : 0;
    if (camera.fov !== cameraState.baseFov + warpFov) {
        camera.fov = cameraState.baseFov + warpFov;
        camera.updateProjectionMatrix();
    }

    // 坍缩：dolly 略前推
    if (fxState.collapse > 0) {
        camera.position.sub(cameraFocus).multiplyScalar(1 - 0.0008 * fxState.collapse * 60 * dt).add(cameraFocus);
    }
}

/* ==========================================================
 * 主循环
 * ========================================================== */
function animate() {
    if (!running || document.hidden) return;
    animationId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    time += dt;

    // 更新 shader 时间
    planetUniforms.uTime.value = time;
    ringUniforms.uTime.value = time;
    starUniforms.uTime.value = time;

    // 特效状态衰减
    if (fxState.warp > 0) fxState.warp = Math.max(0, fxState.warp - dt);
    if (fxState.collapse > 0) fxState.collapse = Math.max(0, fxState.collapse - dt);
    if (fxState.supernova > 0) fxState.supernova = Math.max(0, fxState.supernova - dt);
    if (fxState.bloomBoost > 0) fxState.bloomBoost = Math.max(0, fxState.bloomBoost - dt * 0.8);

    // 应用特效到 uniforms
    planetUniforms.uPulse.value = fxState.supernova * 0.6;
    planetUniforms.uCollapse.value = fxState.collapse;

    // 星球自转
    if (planetSystem) planetSystem.rotation.y = time * 0.08;
    if (ringSystem1) ringSystem1.rotation.z -= 0.15 * dt;
    if (ringSystem2) ringSystem2.rotation.z += 0.21 * dt;

    // 星云缓慢漂移
    if (nebulaGroup) {
        nebulaGroup.rotation.y = time * 0.01;
        nebulaGroup.userData.sprites.forEach(sp => {
            sp.material.opacity = 0.35 + 0.15 * Math.sin(time * 0.5 + sp.userData.phase);
        });
    }
    // 星空缓慢转
    if (starField) starField.rotation.y = time * 0.005;

    // 核心呼吸
    if (coreSprite) {
        const s = 110 + Math.sin(time * 1.2) * 14 + fxState.supernova * 80;
        coreSprite.scale.set(s, s, 1);
    }

    // Bloom 强度动态
    if (bloomPass) bloomPass.strength = 1.6 + fxState.bloomBoost + Math.sin(time * 0.6) * 0.1;

    updateCamera(dt);
    updateEffects(dt);
    updateEcho();

    if (composer) composer.render();
    else renderer.render(scene, camera);
}

/* ==========================================================
 * MediaPipe Hands 集成（双手 + 多手势）
 * ========================================================== */
const previewCanvas = document.getElementById('webcam-preview');
const previewCtx = previewCanvas.getContext('2d');

// 单手手势识别
function detectGesture(lm) {
    // 手指伸展判断（除拇指）：指尖 y 小于 PIP y（图像 y 向下为正）
    const indexExt = lm[8].y < lm[6].y - 0.02;
    const middleExt = lm[12].y < lm[10].y - 0.02;
    const ringExt = lm[16].y < lm[14].y - 0.02;
    const pinkyExt = lm[20].y < lm[18].y - 0.02;
    const extCount = [indexExt, middleExt, ringExt, pinkyExt].filter(Boolean).length;

    // 捏合：拇指尖与食指尖距离
    const pinchD = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    const isPinch = pinchD < 0.055 && !middleExt && !ringExt && !pinkyExt;

    if (isPinch) return 'pinch';
    if (extCount === 0) return 'fist';
    if (extCount >= 4) return 'open';
    if (indexExt && middleExt && !ringExt && !pinkyExt) return 'peace';
    if (indexExt && middleExt && ringExt && !pinkyExt) return 'three';
    if (indexExt && !middleExt && !ringExt && !pinkyExt) return 'point';
    return 'unknown';
}

// 手部中心（用于双手距离/旋转）
function handCenter(lm) {
    let x = 0, y = 0;
    for (const p of lm) { x += p.x; y += p.y; }
    return { x: x / lm.length, y: y / lm.length };
}

// 当前手势状态（用于去抖触发）
const curGesture = { left: 'none', right: 'none' };

function onResults(results) {
    previewCtx.save();
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(results.image, 0, 0, previewCanvas.width, previewCanvas.height);

    const hands = results.multiHandLandmarks || [];
    if (hands.length === 0) {
        cameraState.handRotation = 0;
        cameraState.zoomVelocity = 0;
        manualUntil = performance.now() + 1800;
        cameraState.isFist = false;
        cameraState.isOpen = false;
        cameraState.twoHandActive = false;
        statusEl.innerText = '手已移出画面，手势操作已暂停；伸手即可继续';
        statusEl.style.color = '#888';
        previewCtx.restore();
        return;
    }

    // 绘制骨架
    hands.forEach(lm => {
        previewCtx.strokeStyle = '#7fd0ff';
        previewCtx.lineWidth = 2;
        previewCtx.beginPath();
        for (const [a, b] of window.HAND_CONNECTIONS) {
            previewCtx.moveTo(lm[a].x * previewCanvas.width, lm[a].y * previewCanvas.height);
            previewCtx.lineTo(lm[b].x * previewCanvas.width, lm[b].y * previewCanvas.height);
        }
        previewCtx.stroke();
        previewCtx.fillStyle = '#ffcc66';
        for (const p of lm) {
            previewCtx.beginPath();
            previewCtx.arc(p.x * previewCanvas.width, p.y * previewCanvas.height, 2, 0, Math.PI * 2);
            previewCtx.fill();
        }
    });
    // 手动操作优先，避免摄像头在触摸缩放时抢夺视角。
    if (pointers.size || performance.now() < manualUntil) {
        previewCtx.restore();
        return;
    }

    if (hands.length >= 2) {
        // ===== 双手模式 =====
        const g0 = detectGesture(hands[0]);
        const g1 = detectGesture(hands[1]);
        const c0 = handCenter(hands[0]);
        const c1 = handCenter(hands[1]);
        const dist = Math.hypot(c0.x - c1.x, c0.y - c1.y); // 归一化距离

        // 用两手间水平距离映射相机半径：开合控制宇宙缩放
        const dx = Math.abs(c0.x - c1.x);
        const mapped = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(dx, 0.1, 0.6, CONFIG.minDistance, 1100), CONFIG.minDistance, 1100);
        cameraState.targetRadius = mapped;
        cameraState.twoHandActive = true;
        cameraState.isFist = false;
        cameraState.isOpen = false;

        // 旋转：用两手连线的倾斜角
        cameraState.handRotation = Math.atan2(c1.y - c0.y, c1.x - c0.x) * 0.3;

        // 双手手势组合
        if (g0 === 'pinch' && g1 === 'pinch') {
            statusEl.innerText = '双手捏合 → 超新星爆发 💥';
            statusEl.style.color = '#ffd0a0';
            trigger('supernova', doSupernova, 1200);
        } else if (g0 === 'fist' && g1 === 'fist') {
            statusEl.innerText = '双手握拳 → 引力坍缩 🕳️';
            statusEl.style.color = '#9fb8ff';
            trigger('collapse', doCollapse, 1200);
        } else if (g0 === 'open' && g1 === 'open') {
            statusEl.innerText = '双手张开 → 曲速穿越 🚀';
            statusEl.style.color = '#a0ffd0';
            trigger('warp', doWarp, 1500);
        } else {
            statusEl.innerText = `双手控制中 (${g0}/${g1}) ↔️ 缩放宇宙`;
            statusEl.style.color = '#00ffcc';
        }
    } else {
        // ===== 单手模式 =====
        cameraState.twoHandActive = false;
        const lm = hands[0];
        const observing = exploration.context().route === '观测星海';
        cameraState.handRotation = wristSteering(lm);

        const g = detectGesture(lm);
        // 单手势对应的相机状态
        cameraState.isFist = (g === 'fist');
        cameraState.isOpen = (g === 'open') && !observing;
        if (observing) {
            // Observation uses one hand for rotation only; zoom stays deliberate.
            cameraState.isFist = false;
            cameraState.zoomVelocity = 0;
            cameraState.handRotation = g === 'open' ? cameraState.handRotation : 0;
            statusEl.innerText = g !== 'open' ? '观测手势：张开手掌，向左右弯腕旋转；用按钮调整距离' : cameraState.handRotation ? '弯腕旋转观测中 · 手腕回正即停 · 距离保持不变' : '手腕回正 · 观测已停稳 · 向左右弯腕继续旋转';
            previewCtx.restore();
            return;
        }

        switch (g) {
            case 'open':
                statusEl.innerText = '张开 → 靠近星球 ✋';
                statusEl.style.color = '#7fff9f';
                trigger('zoomIn', () => audio.sfxZoomIn(), 800);
                break;
            case 'fist':
                statusEl.innerText = '握拳 → 远离星球 ✊';
                statusEl.style.color = '#ff8f8f';
                trigger('zoomOut', () => audio.sfxZoomOut(), 800);
                break;
            case 'peace':
                statusEl.innerText = '剪刀 → 切换主题 ✌️';
                statusEl.style.color = '#cfa6ff';
                trigger('peace', () => { cycleTheme(); audio.sfxPeace(); spawnBurst(new THREE.Vector3(0,0,0), 0xffffff, 180, 90, 1.4); }, 800);
                break;
            case 'point':
                statusEl.innerText = '食指 → 发射流星 ☝️';
                statusEl.style.color = '#ffe08a';
                trigger('point', () => { audio.sfxPoint(); spawnComet(); }, 500);
                break;
            case 'pinch':
                statusEl.innerText = '捏合 → 能量火花 🤏';
                statusEl.style.color = '#8fdfff';
                trigger('pinch', () => { audio.sfxPinch(); spawnBurst(new THREE.Vector3(0,0,0), 0x88ddff, 50, 45, 0.7, 3); }, 350);
                break;
            case 'three':
                statusEl.innerText = '三指 → 星爆环 🤟';
                statusEl.style.color = '#ff9fd0';
                trigger('three', () => { audio.sfxThree(); spawnRingBurst(); }, 700);
                break;
            default:
                statusEl.innerText = '旋转控制中 🤞';
                statusEl.style.color = '#00ffcc';
        }
    }
    previewCtx.restore();
}

function resetGestureMotion() {
    cameraState.isFist = cameraState.isOpen = cameraState.twoHandActive = false;
    cameraState.handRotation = cameraState.zoomVelocity = 0;
}

function manualControl(message) {
    manualUntil = performance.now() + 1800;
    resetGestureMotion();
    statusEl.textContent = message;
    statusEl.style.color = '#a6d2ff';
}

const handTracking = createHandTracking({
    video: document.getElementById('input-video'),
    preview: previewCanvas,
    lightweight,
    onResults,
    onState(state, message) {
        cameraBtn.textContent = state === 'loading' ? '取消手势加载' : state === 'on' ? '关闭手势' : '开启手势';
        cameraBtn.setAttribute('aria-pressed', String(state !== 'off'));
        statusEl.textContent = message;
        statusEl.style.color = '#a6d2ff';
        if (state === 'off') resetGestureMotion();
    },
});
function stopHands() { handTracking.stop(); }
cameraBtn.addEventListener('click', () => handTracking.toggle());

function zoomBy(factor) {
    cameraState.radius = THREE.MathUtils.clamp(cameraState.radius * factor, CONFIG.minDistance, 2200);
    cameraState.targetRadius = cameraState.radius;
}

container.addEventListener('pointerdown', event => {
    if (!running || (event.pointerType === 'mouse' && event.button !== 0)) return;
    manualControl('拖动旋转 · 双指缩放');
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    container.setPointerCapture(event.pointerId);
});
container.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const old = pointers.get(event.pointerId);
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    manualControl(pointers.size > 1 ? '双指缩放中' : '旋转视角中');
    if (pointers.size === 1) {
        cameraState.phi -= (event.clientX - old.x) * 0.006;
        cameraState.theta = THREE.MathUtils.clamp(cameraState.theta - (event.clientY - old.y) * 0.006, 0.2, Math.PI - 0.2);
    } else {
        const after = [...pointers.values()];
        const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
        const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
        if (oldDistance > 5 && newDistance > 5) zoomBy(oldDistance / newDistance);
    }
});
function releasePointer(event) {
    pointers.delete(event.pointerId);
    if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) container.addEventListener(name, releasePointer);
container.addEventListener('wheel', event => {
    if (!running) return;
    event.preventDefault();
    manualControl('滚轮缩放中');
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    zoomBy(Math.exp(THREE.MathUtils.clamp(delta * 0.0015, -0.5, 0.5)));
}, { passive: false });
container.addEventListener('keydown', event => {
    if (!running || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    manualControl('方向键旋转 · 加减键缩放');
    if (event.key === 'ArrowLeft') cameraState.phi -= 0.1;
    if (event.key === 'ArrowRight') cameraState.phi += 0.1;
    if (event.key === 'ArrowUp') cameraState.theta = Math.max(0.2, cameraState.theta - 0.1);
    if (event.key === 'ArrowDown') cameraState.theta = Math.min(Math.PI - 0.2, cameraState.theta + 0.1);
    if (['+', '='].includes(event.key)) zoomBy(0.9);
    if (event.key === '-') zoomBy(1.1);
});

const actions = {
    ship: () => { manualControl('已定位失联飞船'); cameraState.phi = Math.atan2(138,-25); cameraState.theta = Math.atan2(Math.hypot(138,25),115); cameraState.radius = cameraState.targetRadius = 300 * fitScale; },
    turn: () => {
        manualControl('绕核心观察');
        if (exploration.context().route === '观测星海') {
            const delta = Math.atan2(Math.sin(.8 - cameraState.phi), Math.cos(.8 - cameraState.phi));
            cameraState.phi += Math.max(-.2, Math.min(.2, delta));
            cameraState.theta += (Math.PI / 2 - cameraState.theta) * .5;
        } else cameraState.phi += .2;
    },
    near: () => { manualControl('靠近星云'); cameraState.zoomVelocity = 0; cameraState.radius = cameraState.targetRadius = Math.max(CONFIG.minDistance * fitScale, cameraState.targetRadius * .8); },
    far: () => { manualControl('远离星云'); cameraState.zoomVelocity = 0; cameraState.radius = cameraState.targetRadius = Math.min(900 * fitScale, cameraState.targetRadius * 1.2); },
    theme: () => { cycleTheme(); audio.sfxPeace(); },
    comet: () => { audio.sfxPoint(); spawnComet(); },
    spark: () => { audio.sfxPinch(); spawnBurst(new THREE.Vector3(), 0x88ddff, 50, 45, 0.7, 3); },
    reward: () => { audio.sfxPeace(); audio._tone(1046, 2.5, 'sine', .10); },
    ring: () => { audio.sfxThree(); spawnRingBurst(); },
    warp: doWarp,
    collapse: doCollapse,
    supernova: doSupernova,
    reset: () => {
        resetGestureMotion();
        cameraState.radius = cameraState.targetRadius = CONFIG.defaultDistance * fitScale;
        cameraState.phi = 0;
        cameraState.theta = Math.PI / 2;
    },
};
actionBar.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !running) return;
    const name = button.dataset.action;
    trigger(name, () => {
        manualControl(button.textContent + ' · 已触发');
        actions[name]();
    }, name === 'supernova' ? 1200 : 400);
});

// 切到后台停止绘制、音频和摄像头；回到页面时继续星云动画。
document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(animationId);
    pointers.clear();
    resetGestureMotion();
    if (document.hidden) {
        stopHands();
        audio.ctx?.suspend().catch(console.warn);
    } else if (running) {
        lastT = performance.now();
        animate();
        audio.ctx?.resume().catch(console.warn);
    }
});
window.addEventListener('pagehide', stopHands);

// 音频控制
const muteBtn = document.getElementById('mute-btn');
const volSlider = document.getElementById('vol-slider');
const volLabel = document.getElementById('vol-label');
muteBtn.addEventListener('click', async () => {
    if (!audio.started) {
        try { await audio.start(); muteBtn.textContent = '♪ 音乐开'; }
        catch { muteBtn.textContent = '重试音乐'; }
        return;
    }
    audio.ctx.resume().catch(console.warn);
    const muted = audio.toggleMute();
    muteBtn.innerText = muted ? '♪ 音乐关' : '♪ 音乐开';
});
volSlider.addEventListener('input', (e) => {
    const v = e.target.value / 100;
    audio.setVolume(v);
    volLabel.innerText = Math.round(v * 100) + '%';
});

// 先渲染一帧就绪画面；进入不等待音频、摄像头或后期特效。
const exploration = createExploration({
    getScene: () => ({ theme: THEMES[themeIndex].name, distance: Math.round(cameraState.radius / fitScale), azimuth: cameraState.phi, polar: cameraState.theta }),
    act: name => { if (running && Object.hasOwn(actions, name)) actions[name](); },
    travel: (stage, view) => {
        themeIndex = stage; applyTheme(stage); actions.reset();
        if (view) { cameraState.radius = cameraState.targetRadius = view.distance * fitScale; cameraState.phi = view.azimuth; cameraState.theta = view.polar; }
        doWarp();
    },
    capture: () => {
        // A separate camera frames the actual scene for the card, independent of
        // viewport, HUD offsets and the player's current observation angle.
        updateEcho();
        const nature = exploration.context().route === '观测星海';
        const target = nature ? new THREE.Vector3(60, 8, -35) : new THREE.Vector3(115, 98, -14);
        const portrait = new THREE.PerspectiveCamera(48, 1000 / 520, 1, 4000);
        portrait.position.copy(target).add(nature ? new THREE.Vector3(0, 18, 85) : new THREE.Vector3(38, 28, 105));
        portrait.lookAt(target);
        const output = new THREE.WebGLRenderTarget(1000, 520);
        const previous = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(output);renderer.render(scene, portrait);
            const pixels = new Uint8Array(1000 * 520 * 4);
            renderer.readRenderTargetPixels(output, 0, 0, 1000, 520, pixels);
            const canvas = document.createElement('canvas');canvas.width=1000;canvas.height=520;
            const ctx=canvas.getContext('2d'), frame=ctx.createImageData(1000,520);
            for(let y=0;y<520;y++)frame.data.set(pixels.subarray((519-y)*4000,(520-y)*4000),y*4000);
            ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png');
        } finally {renderer.setRenderTarget(previous);output.dispose();}
    },
});
let echoSprite, echoPlanet, ruinsScene;
let lastEchoTone = 0;
function updateEcho() {
    if (!echoSprite) return;
    const c = exploration.context();
    ruinsScene?.update(c);
    const active = c.route === '观测星海';
    echoSprite.visible = echoPlanet.visible = active;
    const marker = document.getElementById('echo-marker');
    marker.hidden = !active;
    if (!active) return;
    const reading = echoReading(c), found = c.discoveries.length > 0;
    const strength = found ? 1 : reading.clarity;
    echoSprite.material.opacity = .14 + strength * .75 + Math.sin(time * 3) * .08;
    echoSprite.scale.setScalar(found ? 32 : 14 + strength * 16);
    echoPlanet.visible = found;
    echoPlanet.rotation.y += .003;
    const screen = echoSprite.position.clone().project(camera);
    marker.hidden = screen.z > 1 || screen.z < -1 || Math.abs(screen.x) > .95 || Math.abs(screen.y) > .85;
    marker.style.left = `${(screen.x + 1) * 50}%`;
    marker.style.top = `${(1 - screen.y) * 50}%`;
    marker.textContent = found ? '回声源 · 冰蓝伴星' : reading.ready ? '两道信号已分离 · 可以扫描' : '微弱回声';
    if (reading.ready && !found && time - lastEchoTone > 2) {
        audio._tone(660, .25, 'sine', .08); audio._tone(990, .5, 'sine', .06); lastEchoTone = time;
    }
}
initThree();
ruinsScene = createRuinsScene(scene, camera, id => exploration.inspect(id), (kind,id) => exploration.port(kind,id));
echoSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: particleTexture, color: 0x72f2ff, transparent: true, depthWrite: false }));
echoSprite.position.copy(ECHO_POSITION); echoSprite.visible = false; scene.add(echoSprite);
echoPlanet = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 2), new THREE.MeshBasicMaterial({ color: 0x77ddee, wireframe: true }));
echoPlanet.position.copy(echoSprite.position); echoPlanet.visible = false; scene.add(echoPlanet);
updateCamera(0);
renderer.render(scene, camera);
performance.mark('nebula-ready');
loadingHint.textContent = '星图已就绪 · 无需摄像头即可游玩';
startBtn.textContent = '进 入 宇 宙';
startBtn.disabled = false;
startBtn.addEventListener('click', () => {
    if (running) return;
    running = true;
    exploration.start();
    startOverlay.hidden = true;
    document.getElementById('effects-drawer').hidden = false;
    cameraBtn.hidden = actionBar.hidden = document.getElementById('audio-ctrl').hidden = false;
    lastT = performance.now();
    animate();
    audio.start().catch(error => {
        console.warn('Audio unavailable:', error);
        muteBtn.textContent = '重试音乐';
    });
    if (!lightweight) {
        // 仅桌面按需追加辉光，加载失败仍保持基础渲染。
        setTimeout(async () => {
            try {
                const { createBloom } = await import('./bloom.js');
                ({ composer, bloomPass } = createBloom(renderer, scene, camera, container.clientWidth, container.clientHeight));
            } catch (error) { console.warn('Bloom unavailable:', error); }
        }, 500);
    }
}, { once: true });
