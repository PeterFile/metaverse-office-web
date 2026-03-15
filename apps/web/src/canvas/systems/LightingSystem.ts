import {
  Container,
  Graphics,
} from 'pixi.js';
import type { WorldAgent } from '../../world/types';

// ── LightingSystem: global ambient overlay + per-agent ADD-blend glow FX ──
export class LightingSystem {
  readonly lightingLayer: Container;
  readonly fxLayer: Container;

  private ambientOverlay: Graphics;
  private glows: Map<string, Graphics> = new Map();
  private screenW: number;
  private screenH: number;

  constructor(width: number, height: number) {
    this.screenW = width;
    this.screenH = height;
    this.lightingLayer = new Container();
    this.fxLayer = new Container();

    this.ambientOverlay = new Graphics();
    this.drawAmbient();
    this.lightingLayer.addChild(this.ambientOverlay);
  }

  private drawAmbient(): void {
    this.ambientOverlay.clear();
    this.ambientOverlay
      .rect(0, 0, this.screenW, this.screenH)
      .fill({ color: 0x070d18, alpha: 0.4 });
    this.ambientOverlay
      .rect(0, 0, this.screenW, 64)
      .fill({ color: 0x020617, alpha: 0.18 });
    this.ambientOverlay
      .rect(0, Math.max(0, this.screenH - 88), this.screenW, 88)
      .fill({ color: 0x020617, alpha: 0.22 });
  }

  resize(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
    this.drawAmbient();
  }

  syncAgents(
    agents: WorldAgent[],
    getPixelPos: (agentId: string) => { x: number; y: number } | null
  ): void {
    const seen = new Set<string>();

    for (const agent of agents) {
      if (agent.severity === 'normal') {
        this.removeGlow(agent.agent_id);
        continue;
      }
      seen.add(agent.agent_id);
      const pos = getPixelPos(agent.agent_id);
      if (!pos) continue;

      let glow = this.glows.get(agent.agent_id);
      if (!glow) {
        glow = new Graphics();
        // pixi.js v8: blendMode is a string
        glow.blendMode = 'add';
        this.fxLayer.addChild(glow);
        this.glows.set(agent.agent_id, glow);
      }
      this.drawGlow(glow, pos.x, pos.y, agent.severity);
    }

    for (const [id] of this.glows) {
      if (!seen.has(id)) this.removeGlow(id);
    }
  }

  private drawGlow(g: Graphics, x: number, y: number, severity: string): void {
    const configs: Record<string, { color: number; rx: number; ry: number; alpha: number }> = {
      yellow: { color: 0xfacc15, rx: 18, ry: 8, alpha: 0.1 },
      orange: { color: 0xfb923c, rx: 22, ry: 10, alpha: 0.13 },
      red: { color: 0xf87171, rx: 26, ry: 12, alpha: 0.16 },
    };
    const cfg = configs[severity] ?? configs['yellow'];
    g.clear();
    g.ellipse(x, y - 6, cfg.rx, cfg.ry).fill({ color: cfg.color, alpha: cfg.alpha });
    g.ellipse(x, y - 6, cfg.rx * 0.54, cfg.ry * 0.54).fill({
      color: cfg.color,
      alpha: cfg.alpha * 0.95,
    });
  }

  private removeGlow(agentId: string): void {
    const g = this.glows.get(agentId);
    if (g) {
      g.destroy();
      this.glows.delete(agentId);
    }
  }

  destroy(): void {
    this.lightingLayer.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
  }
}
