import {
  AnimatedSprite,
  Container,
  NineSliceSprite,
  Graphics,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import type { Ticker } from 'pixi.js';
import type { WorldAgent } from '../../world/types';
import type { LoadedAssets } from '../AssetLoader';

const IDLE_FRAMES = [
  'character_idle_1.png',
  'character_idle_2.png',
  'character_idle_3.png',
  'character_idle_4.png',
  'character_idle_5.png',
  'character_idle_6.png',
];

const WALK_FRAMES = [
  'character_run_1.png',
  'character_run_2.png',
  'character_run_3.png',
];

const TALK_FRAMES = [
  'character_talk_1.png',
  'character_talk_2.png',
  'character_talk_3.png',
  'character_talk_4.png',
];

const PHASE_TO_FRAMES: Record<string, string[]> = {
  idle: IDLE_FRAMES,
  sleeping: IDLE_FRAMES,
  recovered: IDLE_FRAMES,
  reboot_recommended: IDLE_FRAMES,
  unknown: IDLE_FRAMES,
  active: WALK_FRAMES,
  blocked: WALK_FRAMES,
  waiting: WALK_FRAMES,
  handoff_pending: WALK_FRAMES,
  handoff_done: WALK_FRAMES,
  rebooting: WALK_FRAMES,
  handoff_active: TALK_FRAMES,
  reviewing: TALK_FRAMES,
};

const PHASE_COLORS: Record<string, number> = {
  idle: 0x56cfe1,
  sleeping: 0x577590,
  recovered: 0x90be6d,
  reboot_recommended: 0xf6bd60,
  active: 0x43aa8b,
  blocked: 0xe76f51,
  waiting: 0xf4a261,
  reviewing: 0x8ecae6,
  handoff_pending: 0xffb703,
  handoff_active: 0x9b5de5,
  handoff_done: 0x52b788,
  rebooting: 0xef476f,
  unknown: 0x94a3b8,
};

const HALO_COLORS: Record<string, number> = {
  normal: 0x34d399,
  yellow: 0xfacc15,
  orange: 0xfb923c,
  red: 0xf87171,
};

const PHASE_LABELS: Record<string, string> = {
  idle: 'IDLE',
  sleeping: 'SLEEP',
  recovered: 'RECOVER',
  reboot_recommended: 'REBOOT?',
  active: 'ACTIVE',
  blocked: 'BLOCK',
  waiting: 'WAIT',
  reviewing: 'REVIEW',
  handoff_pending: 'HANDOFF',
  handoff_active: 'HANDOFF+',
  handoff_done: 'DONE',
  rebooting: 'REBOOT',
  unknown: 'UNKNOWN',
};

const ROLE_COLORS: Record<WorldAgent['kind'], number> = {
  lead: 0x38bdf8,
  employee: 0x64748b,
};

export interface AgentSpriteMeta {
  roleLabel: string;
  locationLabel: string;
  atHome: boolean;
  accentColor: number;
}

export class AgentSprite {
  readonly container: Container;
  readonly agentId: string;

  private sprite: AnimatedSprite;
  private footShadow: Graphics;
  private halo: Graphics;
  private phaseRing: Graphics;
  private stateBadge: Text;
  private stateBadgeBg: Graphics;
  private metaBadge: Text;
  private metaBadgeBg: Graphics;
  private nameLabel: Text;
  private nameLabelBg: Graphics;
  private textures: Record<string, Texture>;
  private uiTextures: Record<string, Texture>;
  private kind: WorldAgent['kind'];
  private meta: AgentSpriteMeta;

  private selected = false;
  private phase: string;
  private severity: string;
  private pulseClockMs = 0;
  private phaseFlashMs = 0;

  constructor(agent: WorldAgent, assets: LoadedAssets, meta: AgentSpriteMeta) {
    this.agentId = agent.agent_id;
    this.container = new Container();
    this.textures = assets.playerTextures;
    this.uiTextures = assets.uiTextures;
    this.kind = agent.kind;
    this.meta = meta;

    const initialFrames = this.resolveFrames(agent.phase);
    this.sprite = new AnimatedSprite(initialFrames);
    this.sprite.animationSpeed = 0.08;
    this.sprite.anchor.set(0.5, 1.0);
    this.sprite.scale.set(0.65); // adjust scale to compensate for higher res pixel art
    this.sprite.play();

    this.footShadow = new Graphics();
    this.halo = new Graphics();
    this.halo.blendMode = 'add';

    this.phaseRing = new Graphics();

    this.stateBadgeBg = new Graphics();
    this.stateBadgeBg.visible = false;
    this.stateBadge = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3, join: 'round' },
      }),
      resolution: 4,
    });
    this.stateBadge.anchor.set(0.5, 1);

    this.metaBadgeBg = new Graphics();
    this.metaBadgeBg.visible = false;
    this.metaBadge = new Text({
      text: '',
      style: new TextStyle({
        fontSize: 10,
        fill: 0xe2e8f0,
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3, join: 'round' },
      }),
      resolution: 4,
    });
    this.metaBadge.anchor.set(0.5, 1);

    this.nameLabelBg = new Graphics();
    this.nameLabelBg.visible = false;
    this.nameLabel = new Text({
      text: agent.display_name,
      style: new TextStyle({
        fontSize: 12,
        fill: 0xffffff,
        fontFamily: '"Segoe UI", Arial, sans-serif',
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 3, join: 'round' },
      }),
      resolution: 4,
    });
    this.nameLabel.anchor.set(0.5, 1);

    this.nameLabel.visible = true;
    this.nameLabelBg.visible = true;
    this.metaBadge.visible = true;
    this.metaBadgeBg.visible = true;

    this.container.addChild(
      this.footShadow,
      this.halo,
      this.phaseRing,
      this.sprite,
      this.stateBadgeBg,
      this.stateBadge,
      this.metaBadgeBg,
      this.metaBadge,
      this.nameLabelBg,
      this.nameLabel,
    );
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';

    this.phase = agent.phase;
    this.severity = agent.severity;

    this.updateStateBadge(agent.phase);
    this.updateSeverity(agent.severity);
    this.updateMeta(meta);
    this.layoutLabels();
  }

  private resolveFrames(phase: string): Texture[] {
    const roleMap: Record<string, string> = {
      'LEAD': 'pawn_lead.png',
      'MARKET': 'pawn_market_intel.png',
      'PMF': 'pawn_product_pmf.png',
      'TOKEN': 'pawn_tokenomics.png',
      'PROTO': 'pawn_protocol_eng.png',
      'APP ENG': 'pawn_app_eng.png',
      'GROWTH': 'pawn_growth.png',
    };
    const key = roleMap[this.meta.roleLabel] ?? 'pawn_lead.png';
    const tex = this.textures[key];

    // If not found, fallback to player.png idle frames
    if (!tex) {
      const frames = PHASE_TO_FRAMES[phase] ?? IDLE_FRAMES;
      return frames.map((k) => this.textures[k] ?? Texture.WHITE);
    }
    return [tex];
  }

  private updateAnimation(phase: string): void {
    const textures = this.resolveFrames(phase);
    this.sprite.textures = textures;
    this.sprite.animationSpeed = phase === 'reviewing' || phase === 'handoff_active' ? 0.11 : 0.08;
    if (!this.sprite.playing) {
      this.sprite.play();
    }
  }

  private updateStateBadge(phase: string): void {
    const phaseColor = PHASE_COLORS[phase] ?? PHASE_COLORS.unknown;
    const label = PHASE_LABELS[phase] ?? phase.toUpperCase();

    this.stateBadge.text = label;
    this.stateBadge.style.fill = phaseColor;

    const isCritical = this.severity === 'red' || this.severity === 'orange';
    const showState = this.selected || isCritical;
    this.stateBadge.visible = showState;
  }

  private updateMeta(meta: AgentSpriteMeta): void {
    this.meta = meta;
    this.metaBadge.text = `${meta.roleLabel} · ${meta.locationLabel}`;
  }

  private updateSeverity(severity: string): void {
    this.severity = severity;
    const color = HALO_COLORS[severity] ?? HALO_COLORS.normal;
    // Minimize visual clutter for normal states, only highlight issues
    const alpha = severity === 'normal' ? 0.0 : severity === 'yellow' ? 0.08 : severity === 'orange' ? 0.12 : 0.15;
    const radius = severity === 'normal' ? 10 : severity === 'yellow' ? 12 : severity === 'orange' ? 14 : 16;

    this.footShadow.clear();
    this.footShadow.ellipse(0, -2, 12, 4).fill({ color: 0x020617, alpha: 0.5 });

    this.halo.clear();
    if (alpha > 0) {
      this.halo.circle(0, -12, radius).fill({ color, alpha });
      this.halo.circle(0, -12, radius * 0.62).fill({ color, alpha: alpha * 0.66 });
    }

    const phaseColor = PHASE_COLORS[this.phase] ?? PHASE_COLORS.unknown;
    this.phaseRing.clear();

    // Only show phase ring if selected or if there is a severe condition
    if (this.selected || severity !== 'normal') {
      this.phaseRing
        .ellipse(0, -2, Math.max(7, radius - 1), Math.max(3, (radius - 1) * 0.42))
        .stroke({ color: phaseColor, width: 1.0, alpha: 0.6 });
    }
  }

  private layoutLabels(): void {
    const topY = -this.sprite.height - 2;
    this.stateBadge.y = topY;

    const metaY = topY - 12;
    this.metaBadge.y = metaY;

    const nameY = metaY - 12;
    this.nameLabel.y = nameY;
  }

  sync(agent: WorldAgent, meta: AgentSpriteMeta, _ticker: Ticker): void {
    if (agent.phase !== this.phase) {
      this.phase = agent.phase;
      this.phaseFlashMs = 900;
      this.updateAnimation(agent.phase);
      this.updateStateBadge(agent.phase);
    }

    if (agent.severity !== this.severity || this.phaseFlashMs > 0) {
      this.updateSeverity(agent.severity);
    }

    if (
      meta.roleLabel !== this.meta.roleLabel ||
      meta.locationLabel !== this.meta.locationLabel ||
      meta.atHome !== this.meta.atHome ||
      meta.accentColor !== this.meta.accentColor
    ) {
      this.updateMeta(meta);
    }

    this.updateStateBadge(agent.phase);
    this.layoutLabels();
  }

  tick(deltaMs: number): void {
    this.pulseClockMs += deltaMs;
    this.phaseFlashMs = Math.max(0, this.phaseFlashMs - deltaMs);

    const amp = this.severity === 'normal' ? 0.00 : this.severity === 'yellow' ? 0.01 : 0.015;
    const pulse = 1 + Math.sin(this.pulseClockMs / 210) * amp;
    this.halo.scale.set(pulse);
    this.footShadow.alpha = 0.6 + Math.sin(this.pulseClockMs / 240) * 0.03;

    // RimWorld bobbing effect (if active phase, bounce the sprite slightly)
    if (this.phase === 'active' || this.phase === 'reviewing' || this.phase === 'handoff_active') {
      this.sprite.y = -(Math.abs(Math.sin(this.pulseClockMs / 120)) * 2);
    } else {
      this.sprite.y = 0;
    }

    const flashBoost = this.phaseFlashMs > 0 ? this.phaseFlashMs / 900 : 0;
    this.phaseRing.alpha = 0.5 + flashBoost * 0.3;
    this.stateBadge.alpha = this.selected ? 1 : 0.86;
    this.metaBadge.alpha = this.selected ? 0.96 : 0.84;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.container.scale.set(selected ? 1.05 : 1);
    this.nameLabel.visible = true;
    this.metaBadge.visible = true;
    this.updateStateBadge(this.phase);

    if (selected) {
      this.phaseFlashMs = Math.max(this.phaseFlashMs, 360);
    }
  }

  destroy(): void {
    this.sprite.stop();
    this.container.destroy({ children: true });
  }

  get pixiSprite(): AnimatedSprite {
    return this.sprite;
  }
}

export function createAgentSprite(
  agent: WorldAgent,
  assets: LoadedAssets,
  meta?: AgentSpriteMeta,
): AgentSprite {
  return new AgentSprite(agent, assets, meta ?? {
    roleLabel: agent.kind === 'lead' ? 'LEAD' : 'AGENT',
    locationLabel: 'HOME',
    atHome: true,
    accentColor: ROLE_COLORS[agent.kind],
  });
}
