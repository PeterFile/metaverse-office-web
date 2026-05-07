import type { RolePawnKey } from './types';

export const ROLE_PAWN_TEXTURE_URLS: Record<RolePawnKey, string> = {
  app_eng: '/assets/generated/pawn_app_eng.png',
  growth: '/assets/generated/pawn_growth.png',
  lead: '/assets/generated/pawn_lead.png',
  market_intel: '/assets/generated/pawn_market_intel.png',
  product_pmf: '/assets/generated/pawn_product_pmf.png',
  protocol_eng: '/assets/generated/pawn_protocol_eng.png',
  tokenomics: '/assets/generated/pawn_tokenomics.png'
};

export function resolveRolePawnAssetUrl(rolePawnKey: RolePawnKey | undefined) {
  return rolePawnKey ? ROLE_PAWN_TEXTURE_URLS[rolePawnKey] : null;
}
