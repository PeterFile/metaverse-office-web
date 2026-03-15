import { Assets } from 'pixi.js';
import type { Spritesheet, Texture } from 'pixi.js';

export interface LoadedAssets {
  playerTextures: Record<string, Texture>;
  interiorTextures: Record<string, Texture>;
  tilesetTextures: Record<string, Texture>;
  uiTextures: Record<string, Texture>;
  wallAndFloorBase: Texture;
}

let cache: LoadedAssets | null = null;
let loading: Promise<LoadedAssets> | null = null;

export async function loadGameAssets(): Promise<LoadedAssets> {
  if (cache) return cache;
  // Guard against StrictMode double-mount calling this twice
  if (loading) return loading;

  loading = (async () => {
    // Avoid re-registering already-cached assets (StrictMode double-mount)
    const loadOrGet = async (url: string) => {
      if (Assets.cache.has(url)) {
        return Assets.cache.get<Spritesheet>(url);
      }
      return Assets.load<Spritesheet>(url);
    };
    
    const loadOrGetTexture = async (url: string) => {
      if (Assets.cache.has(url)) {
        return Assets.cache.get<Texture>(url);
      }
      return Assets.load<Texture>(url);
    };

    const [
      playerSheet, interiorSheet, tilesetSheet, uiSheet,
      pawnLead, pawnMarket, pawnPmf, pawnTokenomics, pawnProtocol, pawnApp, pawnGrowth,
      rwDesk, rwBed, rwServer
    ] = await Promise.all([
      loadOrGet('/assets/player.json'),
      loadOrGet('/assets/pixel-cyberpunk-interior.json'),
      loadOrGet('/assets/tileset.json'),
      loadOrGet('/assets/UI_Flat.json').catch(() => loadOrGet('/assets/ui.json')),
      loadOrGetTexture('/assets/generated/pawn_lead.png'),
      loadOrGetTexture('/assets/generated/pawn_market_intel.png'),
      loadOrGetTexture('/assets/generated/pawn_product_pmf.png'),
      loadOrGetTexture('/assets/generated/pawn_tokenomics.png'),
      loadOrGetTexture('/assets/generated/pawn_protocol_eng.png'),
      loadOrGetTexture('/assets/generated/pawn_app_eng.png'),
      loadOrGetTexture('/assets/generated/pawn_growth.png'),
      loadOrGetTexture('/assets/generated/rw_desk.png'),
      loadOrGetTexture('/assets/generated/rw_bed.png'),
      loadOrGetTexture('/assets/generated/rw_server.png')
    ]);

    const extractTextures = (sheet: Spritesheet | undefined): Record<string, Texture> => {
      const result: Record<string, Texture> = {};
      if (!sheet || !sheet.textures) return result;
      
      const isArrayFrames = Array.isArray(sheet.data?.frames);
      
      if (isArrayFrames) {
        // Map index to filename
        const frames = sheet.data.frames as unknown as any[];
        frames.forEach((frame: any, index: number) => {
          const tex = sheet.textures[String(index)];
          if (tex) result[frame.filename] = tex;
        });
      } else {
        // Standard Hash format
        Object.assign(result, sheet.textures);
      }
      return result;
    };

    const playerTextures = extractTextures(playerSheet);
    const interiorTextures = extractTextures(interiorSheet);
    const tilesetTextures = extractTextures(tilesetSheet);
    const uiTextures = extractTextures(uiSheet);
    
    playerTextures['pawn_lead.png'] = pawnLead;
    playerTextures['pawn_market_intel.png'] = pawnMarket;
    playerTextures['pawn_product_pmf.png'] = pawnPmf;
    playerTextures['pawn_tokenomics.png'] = pawnTokenomics;
    playerTextures['pawn_protocol_eng.png'] = pawnProtocol;
    playerTextures['pawn_app_eng.png'] = pawnApp;
    playerTextures['pawn_growth.png'] = pawnGrowth;
    
    interiorTextures['rw_desk.png'] = rwDesk;
    interiorTextures['rw_bed.png'] = rwBed;
    interiorTextures['rw_server.png'] = rwServer;

    // Enforce nearest-neighbor scaling for all textures
    const applyNearest = (dict: Record<string, Texture>) => {
      Object.values(dict).forEach((tex) => {
        if (tex && tex.source) {
          tex.source.scaleMode = 'nearest';
        }
      });
    };
    applyNearest(playerTextures);
    applyNearest(interiorTextures);
    applyNearest(tilesetTextures);
    applyNearest(uiTextures);

    // Normalize keys: if keys lack .png, create aliases with .png and vice versa
    const normalize = (dict: Record<string, Texture>) => {
      const result: Record<string, Texture> = { ...dict };
      for (const [k, v] of Object.entries(dict)) {
        if (k.endsWith('.png')) {
          result[k.replace('.png', '')] = v;
        } else {
          result[`${k}.png`] = v;
        }
      }
      return result;
    };

    cache = {
      playerTextures: normalize(playerTextures),
      interiorTextures: normalize(interiorTextures),
      tilesetTextures: normalize(tilesetTextures),
      uiTextures: normalize(uiTextures),
      wallAndFloorBase:
        normalize(interiorTextures)['wall_and_floor_base.png'] ??
        Object.values(interiorTextures)[0] ??
        ({} as Texture),
    };
    return cache;
  })();

  return loading;
}
