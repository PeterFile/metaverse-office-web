import type { Ticker } from 'pixi.js';

interface TweenOptions {
  from: number;
  to: number;
  duration: number; // ms
  easing?: (t: number) => number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

interface ActiveTween {
  elapsed: number;
  options: TweenOptions;
}

// ── Easing functions ──
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function linear(t: number): number {
  return t;
}

// ── TweenManager: attached to PIXI Ticker ──
export class TweenManager {
  private tweens: Set<ActiveTween> = new Set();

  // Add a tween; returns a cancellation function
  add(options: TweenOptions): () => void {
    const tween: ActiveTween = { elapsed: 0, options };
    this.tweens.add(tween);
    return () => { this.tweens.delete(tween); };
  }

  // Call this from the PIXI Ticker callback
  update(ticker: Ticker): void {
    const dt = ticker.deltaMS;
    for (const tween of this.tweens) {
      tween.elapsed += dt;
      const { from, to, duration, easing = linear, onUpdate, onComplete } = tween.options;
      const raw = Math.min(tween.elapsed / duration, 1);
      const t = easing(raw);
      onUpdate(from + (to - from) * t);
      if (raw >= 1) {
        onComplete?.();
        this.tweens.delete(tween);
      }
    }
  }

  // Convenience: tween a 2D position object
  moveTo(
    target: { x: number; y: number },
    toX: number,
    toY: number,
    durationMs: number,
    onComplete?: () => void
  ): () => void {
    const fromX = target.x;
    const fromY = target.y;
    let cancelX: (() => void) | null = null;
    let cancelY: (() => void) | null = null;
    let xDone = false;

    cancelX = this.add({
      from: fromX,
      to: toX,
      duration: durationMs,
      easing: easeInOut,
      onUpdate: (v) => { target.x = v; },
      onComplete: () => {
        xDone = true;
        if (xDone) onComplete?.();
      },
    });

    cancelY = this.add({
      from: fromY,
      to: toY,
      duration: durationMs,
      easing: easeInOut,
      onUpdate: (v) => { target.y = v; },
    });

    return () => {
      cancelX?.();
      cancelY?.();
    };
  }

  clear(): void {
    this.tweens.clear();
  }
}
