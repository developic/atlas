'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  blendStates,
  clamp01,
  ERROR_COLOR_FROM,
  ERROR_COLOR_TO,
  hexToRgb,
  orbVars,
  type OrbProps,
} from '../../lib/orb-state';
import { mixRgb, rgba, type Rgb } from '../../lib/orb-color';
import {
  createSearchRanks,
  SEARCH_LIGHT,
  SEARCH_PHASE_START,
  SEARCH_WEIGHT_FLOOR,
  searchAlphaGain,
  searchBand,
  searchDotGain,
  searchHighlight,
  searchScan,
  searchToneBucket,
  type SearchFrame,
} from '../../lib/status/searching';
import { orbStatusParams as STATES } from '../../lib/status';
import { useOrbAnimator, type OrbFrame } from '../../lib/use-orb-animator';

const PARTICLE_COUNT = 960;
const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TIME_OFFSET = 1.7;
const TONE_BUCKETS = 6;
const ALPHA_BUCKETS = 16;
const BUCKETS = TONE_BUCKETS * ALPHA_BUCKETS;
const ANGLE_X = 0.32;

/**
 * The searching constellation: a fixed pseudo-random set of dots. Selection
 * happens once when the module loads, so the pattern never changes between
 * frames or renders. Ranks keep the reveal ordered from top to bottom.
 */
const SEARCH_RANKS = createSearchRanks(PARTICLE_COUNT);

const ERROR_FROM_RGB = hexToRgb(ERROR_COLOR_FROM);
const ERROR_TO_RGB = hexToRgb(ERROR_COLOR_TO);



interface Sphere {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  ringFrac: Float32Array;
  seed: Float32Array;
  toneBucket: Uint8Array;
  tone: Float32Array;
}

const buildSphere = (count: number): Sphere => {
  const sphere: Sphere = {
    x: new Float32Array(count),
    y: new Float32Array(count),
    z: new Float32Array(count),
    ringFrac: new Float32Array(count),
    seed: new Float32Array(count),
    toneBucket: new Uint8Array(count),
    tone: new Float32Array(count),
  };
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = GOLDEN_ANGLE * i;
    const tone = (i * 0.5436890126) % 1;
    sphere.x[i] = Math.cos(theta) * radiusAtY;
    sphere.y[i] = y;
    sphere.z[i] = Math.sin(theta) * radiusAtY;
    sphere.ringFrac[i] = (i * 0.61803398875) % 1;
    sphere.seed[i] = ((i * 0.7548776662) % 1) * TWO_PI;
    sphere.tone[i] = tone;
    sphere.toneBucket[i] = Math.min(TONE_BUCKETS - 1, Math.floor(tone * TONE_BUCKETS));
  }
  return sphere;
};

const SPHERE = buildSphere(PARTICLE_COUNT);

/** Per-count caches so a denser hero orb never rebuilds every frame. */
const sphereCache = new Map<number, Sphere>([[PARTICLE_COUNT, SPHERE]]);
const rankCache = new Map<number, Uint16Array>([[PARTICLE_COUNT, SEARCH_RANKS]]);

const sphereFor = (count: number): Sphere => {
  const hit = sphereCache.get(count);
  if (hit) return hit;
  const built = buildSphere(count);
  sphereCache.set(count, built);
  return built;
};

const ranksFor = (count: number): Uint16Array => {
  const hit = rankCache.get(count);
  if (hit) return hit;
  const built = createSearchRanks(count);
  rankCache.set(count, built);
  return built;
};

const DEFAULT_COLOR_FROM = '#f0abfc';
const DEFAULT_COLOR_TO = '#818cf8';

export const ParticlesOrb = ({
  state = 'idle',
  size = 168,
  speed = 1,
  colorFrom,
  colorTo,
  particles = PARTICLE_COUNT,
  levelRef,
  progress = 0.5,
  label = 'Assistant orb',
  className,
  ref: forwardedRef,
}: OrbProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(clamp01(progress));
  const colorRef = useRef<{ from: string; to: string }>({
    from: colorFrom ?? DEFAULT_COLOR_FROM,
    to: colorTo ?? DEFAULT_COLOR_TO,
  });
  const motionRef = useRef({
    clock: 0,
    pulseClock: 0,
    angleY: 0,
    ringPhase: 0,
    scanPhase: SEARCH_PHASE_START,
    searchElapsed: 0,
    searchLit: false,
  });
  const drawRef = useRef<((frame: OrbFrame) => void) | null>(null);

  const setHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      hostRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  const onFrame = useCallback((frame: OrbFrame) => drawRef.current?.(frame), []);
  const { frameRef } = useOrbAnimator(hostRef, { state, levelRef, speed, onFrame });

  useEffect(() => {
    progressRef.current = clamp01(progress);
    drawRef.current?.(frameRef.current);
  }, [progress, frameRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const syncColors = () => {
      const styles = getComputedStyle(host);
      colorRef.current = {
        from: styles.getPropertyValue('--orb-color-from').trim() || colorFrom || DEFAULT_COLOR_FROM,
        to: styles.getPropertyValue('--orb-color-to').trim() || colorTo || DEFAULT_COLOR_TO,
      };
      drawRef.current?.(frameRef.current);
    };

    syncColors();

    const observer = new MutationObserver(syncColors);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => observer.disconnect();
  }, [colorFrom, colorTo, frameRef]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const center = size / 2;
    const smallness = Math.min(1, size / 140);
    const dotScale = 0.55 + 0.45 * smallness;
    const alphaScale = smallness * smallness;
    const baseRadius = center * 0.7;
    const n = particles;
    const sphere = sphereFor(n);
    const ranks = ranksFor(n);
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pr = new Float32Array(n);
    const bucketOf = new Uint8Array(n);
    const order = new Uint16Array(n);
    const counts = new Uint16Array(BUCKETS);
    const starts = new Uint16Array(BUCKETS);
    const toneStyles: string[] = new Array<string>(TONE_BUCKETS).fill('#fff');

    let paletteKey = '';
    let baseFrom: Rgb = [255, 255, 255];
    let baseTo: Rgb = [255, 255, 255];
    let additive = false;
    let glowStyle: CanvasGradient | null = null;
    let lastPhase = frameRef.current.phase;
    let lastLevelText = '';
    const motion = motionRef.current;
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let tiltX = 0;
    let tiltY = 0;

    const ensurePalette = (errorW: number) => {
      const { from, to } = colorRef.current;
      const errKey = Math.round(errorW * 64);
      const key = `${from}|${to}|${errKey}`;
      if (key === paletteKey) return;
      paletteKey = key;
      baseFrom = hexToRgb(from);
      baseTo = hexToRgb(to);
      const e = errKey / 64;
      const f = mixRgb(baseFrom, ERROR_FROM_RGB, e);
      const t = mixRgb(baseTo, ERROR_TO_RGB, e);
      for (let b = 0; b < TONE_BUCKETS; b += 1) {
        toneStyles[b] = rgba(mixRgb(f, t, (b + 0.5) / TONE_BUCKETS), 1);
      }

      // Light dots on a dark page like additive blending; dark dots on a light
      // page read cleaner with plain alpha compositing.
      const luminance = (f[0] * 0.2126 + f[1] * 0.7152 + f[2] * 0.0722) / 255;
      additive = luminance > 0.55;
      glowStyle = null;
      if (additive) {
        const glow = ctx.createRadialGradient(center, center, 0, center, center, baseRadius * 1.55);
        glow.addColorStop(0, rgba(f, 0.07));
        glow.addColorStop(0.55, rgba(t, 0.025));
        glow.addColorStop(1, rgba(t, 0));
        glowStyle = glow;
      }
    };

    const draw = (frame: OrbFrame) => {
      const w = frame.weights;
      const p = blendStates(w, STATES);
      const dPhase = Math.max(0, frame.phase - lastPhase);
      lastPhase = frame.phase;
      const level = frame.reduced ? p.rest : frame.level;
      const levelText = frame.level.toFixed(3);
      if (levelText !== lastLevelText) {
        lastLevelText = levelText;
        host.style.setProperty('--orb-level', levelText);
      }

      motion.clock += dPhase * p.tempo;
      motion.pulseClock += dPhase * p.tempo * p.pulseRate;
      motion.angleY += dPhase * p.spin * (1 + p.ripple * level * 1.8);
      motion.ringPhase = (motion.ringPhase + dPhase * 0.7) % TWO_PI;
      motion.scanPhase = (motion.scanPhase + dPhase * p.scanRate) % 1;
      const t = motion.clock + TIME_OFFSET;
      const pt = motion.pulseClock + TIME_OFFSET;

      // Damped pointer parallax and a slow wobble keep the sphere reading as a
      // volume instead of a flat disc. Both are frame-rate independent.
      const ease = frame.reduced ? 0 : 1 - Math.exp(-2.6 * frame.dt);
      tiltX += (pointerTargetY * 0.22 - tiltX) * ease;
      tiltY += (pointerTargetX * 0.32 - tiltY) * ease;
      const wobbleX = frame.reduced ? 0 : 0.05 * Math.sin(t * 0.33 + 1.1);
      const wobbleY = frame.reduced ? 0 : 0.04 * Math.sin(t * 0.27 + 0.6);
      const ax = ANGLE_X + wobbleX + tiltX;
      const ay = motion.angleY + wobbleY + tiltY;

      const beat = Math.sin(pt * 2.6) * 0.5 + 0.5;
      const beatSharp = beat * beat * beat;
      const breathe = p.breathe * Math.sin(t * 1.1);
      const conv = p.pulse * (0.06 + 0.12 * beatSharp);
      const radius = baseRadius * (1 + breathe + level * p.swell - conv);

      const shakeAmp = p.shake * radius * 0.05;
      const shakeX = shakeAmp * (Math.sin(t * 26) + 0.5 * Math.sin(t * 15.7));
      const shakeY = shakeAmp * (Math.cos(t * 22.5) + 0.5 * Math.sin(t * 13.1));

      const driftAmp = p.drift * radius * 0.055;
      const jitterAmp = p.jitter * radius * (0.012 + level * 0.07);
      const rippleAmp = p.ripple * (0.04 + level * 0.22);
      const pulseAmp = p.pulse * 0.16 * (0.4 + 0.6 * beat);
      const flowAmp = p.flow * (0.18 + level * 0.4);
      const swirlAmp = p.swirl * (0.35 + level * 0.9);
      const ringW = clamp01(p.ring);
      const ringBreath = 1 + p.pulse * 0.4 * Math.sin(pt * 2.6);
      const scanW = clamp01(p.scan);
      // Start the constellation from zero whenever searching settles in, but
      // never reset while the state is still fading or active: a redraw or a
      // neighbouring state must not restart the reveal.
      const searching = scanW > SEARCH_WEIGHT_FLOOR;
      if (searching && !motion.searchLit) {
        motion.searchElapsed = 0;
        motion.searchLit = true;
      } else if (!searching && motion.searchLit) {
        motion.searchLit = false;
        motion.searchElapsed = 0;
      }
      if (searching) motion.searchElapsed += dPhase;
      const scan = searchScan(motion.scanPhase, p.scanWidth);
      const searchFx: SearchFrame | null = searching
        ? {
            elapsed: motion.searchElapsed,
            time: t,
            weight: scanW,
            reduced: frame.reduced,
          }
        : null;
      const terminatorW = clamp01(p.terminator);
      const boundary = 1 - 2 * clamp01(progressRef.current);

      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      counts.fill(0);

      for (let i = 0; i < n; i += 1) {
        const sx = sphere.x[i];
        const sy = sphere.y[i];
        const sz = sphere.z[i];
        const seed = sphere.seed[i];
        const ringFrac = sphere.ringFrac[i];

        const twist = swirlAmp > 0.002 ? ay + swirlAmp * Math.sin(sy * 2.4 + t * 1.6) : ay;
        const cy = Math.cos(twist);
        const sny = Math.sin(twist);
        const x1 = sx * cy - sz * sny;
        const z1 = sx * sny + sz * cy;
        const y1 = sy * cosX - z1 * sinX;
        const z2 = sy * sinX + z1 * cosX;

        const depth = (z2 + 1) / 2;
        const perspective = 0.62 + depth * 0.5;

        const highlight = searchFx
          ? searchHighlight(ranks[i], searchFx)
          : 0;

        // The scan band is a horizontal slice in view space. Dots inside it
        // grow and stay bright; everything else dims back so the sweep reads.
        const scanBand = searchFx ? searchBand(y1, scan, depth) : 0;

        let pointRadius = radius;
        if (rippleAmp > 0.002) {
          pointRadius *= 1 + rippleAmp * (0.5 + 0.5 * Math.sin(sy * 4.5 - t * 6.5));
        }
        if (pulseAmp > 0.002) {
          pointRadius *= 1 - pulseAmp * (0.5 + 0.5 * Math.sin(ringFrac * TWO_PI + pt * 3.1));
        }
        if (flowAmp > 0.002) {
          const stream = 0.5 + 0.5 * Math.sin(seed * 3 - t * 3.4);
          pointRadius *= 1 - flowAmp * stream * stream;
        }

        let ox = shakeX;
        let oy = shakeY;
        if (driftAmp > 0.01) {
          ox += driftAmp * (Math.sin(t * 0.55 + seed * 3.7) + 0.5 * Math.sin(t * 1.3 + seed * 1.3));
          oy += driftAmp * (Math.cos(t * 0.62 + seed * 2.9) + 0.5 * Math.sin(t * 1.05 + seed * 5.1));
        }
        if (jitterAmp > 0.01) {
          ox += jitterAmp * Math.sin(t * 14 + seed * 9.3);
          oy += jitterAmp * Math.cos(t * 17 + seed * 6.1);
        }

        let screenX = center + x1 * pointRadius * perspective + ox;
        let screenY = center + y1 * pointRadius * perspective + oy;
        let alpha = 0.18 + Math.pow(depth, 1.7) * 0.8;
        let dot = 0.55 + Math.pow(depth, 1.5) * 2;

        if (ringW > 0.004) {
          const tone = sphere.tone[i];
          const ringAngle = (i / n) * TWO_PI + motion.ringPhase + 0.05 * Math.sin(t * 1.3 + seed);
          const ringR =
            center * (0.58 + 0.13 * ringFrac) * (1 + 0.05 * Math.sin(t + seed * 1.7)) * ringBreath;
          const circleX = center + Math.cos(ringAngle) * ringR;
          const circleY = center + Math.sin(ringAngle) * ringR;
          screenX += (circleX - screenX) * ringW;
          screenY += (circleY - screenY) * ringW;
          alpha += (0.35 + tone * 0.5 - alpha) * ringW;
          dot += (0.75 + tone * 0.9 - dot) * ringW;
        }

        if (searchFx) {
          dot *= searchDotGain(scanBand, scanW, p.scanBoost);
          alpha *= searchAlphaGain(scanBand, scanW, p.scanDim);
        }

        if (terminatorW > 0.002) {
          // `x1` is screen-space x after the spin, so the lit side always grows
          // from the left edge while the sphere turns underneath.
          const sweep = -x1;
          const lit = sweep > boundary;
          const edge = Math.max(0, 1 - Math.abs(sweep - boundary) * 6);
          const alphaMul = lit ? 1 : 0.3 + 0.25 * edge;
          const dotMul = lit ? 1 + 0.5 * edge : 0.9 + 0.5 * edge;
          alpha *= 1 + (alphaMul - 1) * terminatorW;
          dot *= 1 + (dotMul - 1) * terminatorW;
        }

        if (highlight > 0) {
          // Additive only: a lit dot never dims, so the scan band and the
          // popup dots keep their existing opacity while the constellation
          // grows. The tone still comes from the theme palette: it climbs
          // toward the palette's bright end as the dot lights up.
          alpha += Math.max(0, SEARCH_LIGHT.alpha - alpha) * highlight;
          dot *= 1 + SEARCH_LIGHT.grow * highlight;
        }

        px[i] = screenX;
        py[i] = screenY;
        pr[i] = dot * dotScale;
        alpha *= (0.92 + 0.08 * Math.sin(t * 1.7 + seed * 5.3)) * alphaScale;
        const ab = Math.min(ALPHA_BUCKETS - 1, Math.floor(alpha * ALPHA_BUCKETS));
        const toneBucket =
          highlight > 0
            ? searchToneBucket(sphere.toneBucket[i], highlight, TONE_BUCKETS)
            : sphere.toneBucket[i];
        const b = toneBucket * ALPHA_BUCKETS + ab;
        bucketOf[i] = b;
        counts[b] += 1;
      }

      let acc = 0;
      for (let b = 0; b < BUCKETS; b += 1) {
        starts[b] = acc;
        acc += counts[b];
      }
      for (let i = 0; i < n; i += 1) {
        const b = bucketOf[i];
        order[starts[b]] = i;
        starts[b] += 1;
      }

      ensurePalette(w.error);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      if (glowStyle) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = glowStyle;
        ctx.fillRect(0, 0, size, size);
      }

      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';

      let cursor = 0;
      for (let b = 0; b < BUCKETS; b += 1) {
        const count = counts[b];
        if (count === 0) continue;
        const ab = b % ALPHA_BUCKETS;
        ctx.globalAlpha = clamp01(((ab + 0.5) / ALPHA_BUCKETS) * p.alpha);
        ctx.fillStyle = toneStyles[(b - ab) / ALPHA_BUCKETS];
        ctx.beginPath();
        for (let k = cursor; k < cursor + count; k += 1) {
          const i = order[k];
          ctx.moveTo(px[i] + pr[i], py[i]);
          ctx.arc(px[i], py[i], pr[i], 0, TWO_PI);
        }
        ctx.fill();
        cursor += count;
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const halfW = Math.max(1, window.innerWidth / 2);
      const halfH = Math.max(1, window.innerHeight / 2);
      pointerTargetX = Math.max(
        -1,
        Math.min(1, (event.clientX - rect.left - rect.width / 2) / halfW),
      );
      pointerTargetY = Math.max(
        -1,
        Math.min(1, (event.clientY - rect.top - rect.height / 2) / halfH),
      );
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    drawRef.current = draw;
    draw({ ...frameRef.current, dt: 0 });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      drawRef.current = null;
    };
  }, [size, particles, frameRef]);

  return (
    <div
      ref={setHostRef}
      role="img"
      aria-label={label}
      data-state={state}
      className={className}
      style={{
        ...orbVars({ size, speed, colorFrom, colorTo }),
        width: size,
        height: size,
        display: 'grid',
        placeItems: 'center',
        opacity: state === 'disabled' ? 0.5 : 1,
        filter: state === 'disabled' ? 'grayscale(0.85)' : 'grayscale(0)',
        transition: 'opacity 0.4s ease, filter 0.4s ease',
      }}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
};
