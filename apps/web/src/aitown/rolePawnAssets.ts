import type { RolePawnKey } from './types';

export const ROLE_PAWN_TEXTURE_URLS: Record<RolePawnKey, string> = {
  app_eng: '/assets/generated/sprites/agent-normal/idle-1.png',
  growth: '/assets/generated/sprites/vagrant-hacker/idle-1.png',
  lead: '/assets/generated/sprites/agent-upgraded/idle-1.png',
  market_intel: '/assets/generated/sprites/black-market-merchant/idle-1.png',
  product_pmf: '/assets/generated/sprites/data-ghost/hover-1.png',
  protocol_eng: '/assets/generated/sprites/corporate-security-robot/idle-1.png',
  tokenomics: '/assets/generated/sprites/agent-low-energy/idle-1.png'
};

export function resolveRolePawnAssetUrl(rolePawnKey: RolePawnKey | undefined) {
  return rolePawnKey ? ROLE_PAWN_TEXTURE_URLS[rolePawnKey] : null;
}
