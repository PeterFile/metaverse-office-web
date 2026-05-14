import { Assets, Spritesheet, type SpritesheetData as PixiSpritesheetData, type Texture } from 'pixi.js';

import campfire from './data/animations/campfire.json';
import gentlesparkle from './data/animations/gentlesparkle.json';
import gentlesplash from './data/animations/gentlesplash.json';
import gentlewaterfall from './data/animations/gentlewaterfall.json';
import { AI_TOWN_GENERATED_MAPS } from './mapData';
import { ROLE_PAWN_TEXTURE_URLS } from './rolePawnAssets';
import windmill from './data/animations/windmill.json';
import type { AiTownMapLayerUrls, CharacterKey, Facing, RolePawnKey } from './types';

type CharacterAnimations = Record<Facing, Texture[]>;
type GeneratedMapLayerTextures = Pick<Record<keyof AiTownMapLayerUrls, Texture>, 'groundBase' | 'propsTransparent'> &
  Partial<Record<keyof AiTownMapLayerUrls, Texture>>;
type SharedAiTownAssets = Omit<AiTownAssets, 'generatedMapTextures'>;

export type AiTownAssetLoadOptions = {
  mapIds?: string[];
  evictExceptMapIds?: string[];
};

export interface AiTownAssets {
  characterAnimations: Record<CharacterKey, CharacterAnimations>;
  rolePawnTextures: Partial<Record<RolePawnKey, Texture>>;
  tileSetTexture: Texture;
  animationSheets: Record<string, Spritesheet>;
  generatedMapTextures: Record<string, GeneratedMapLayerTextures>;
}

const animationManifests: Record<string, { data: PixiSpritesheetData; url: string }> = {
  'campfire.json': {
    data: campfire as PixiSpritesheetData,
    url: '/ai-town/assets/spritesheets/campfire.png'
  },
  'gentlesparkle.json': {
    data: gentlesparkle as PixiSpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlesparkle32.png'
  },
  'gentlesplash.json': {
    data: gentlesplash as PixiSpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png'
  },
  'gentlewaterfall.json': {
    data: gentlewaterfall as PixiSpritesheetData,
    url: '/ai-town/assets/spritesheets/gentlewaterfall32.png'
  },
  'windmill.json': {
    data: windmill as PixiSpritesheetData,
    url: '/ai-town/assets/spritesheets/windmill.png'
  }
};

const GENERATED_CHARACTER_TEXTURE_URLS: Record<CharacterKey, string> = {
  f1: '/assets/generated/sprites/agent-normal/walk-cycle-sheet-transparent.png',
  f2: '/assets/generated/sprites/agent-low-energy/walk-cycle-sheet-transparent.png',
  f3: '/assets/generated/sprites/agent-upgraded/walk-cycle-sheet-transparent.png',
  f4: '/assets/generated/sprites/agent-infected/walk-cycle-sheet-transparent.png',
  f5: '/assets/generated/sprites/corporate-security-robot/walk-cycle-sheet-transparent.png',
  f6: '/assets/generated/sprites/black-market-merchant/walk-cycle-sheet-transparent.png',
  f7: '/assets/generated/sprites/vagrant-hacker/walk-cycle-sheet-transparent.png',
  f8: '/assets/generated/sprites/data-ghost/walk-cycle-sheet-transparent.png'
};

const GENERATED_WALK_DIRECTIONS: Facing[] = ['down', 'left', 'right', 'up'];
const GENERATED_WALK_FRAMES_PER_DIRECTION = 4;
const GENERATED_WALK_FRAME_SIZE = 256;
const GENERATED_MAP_RENDER_LAYER_KEYS = [
  'groundBase',
  'propsTransparent'
] as const satisfies Array<keyof AiTownMapLayerUrls>;
const GENERATED_MAP_BY_ID = new Map(AI_TOWN_GENERATED_MAPS.map((map) => [map.id, map]));

function buildGeneratedWalkSpritesheetData(imageUrl: string): PixiSpritesheetData {
  const frames: PixiSpritesheetData['frames'] = {};
  const animations: PixiSpritesheetData['animations'] = {};

  GENERATED_WALK_DIRECTIONS.forEach((direction, row) => {
    const frameNames: string[] = [];

    for (let column = 0; column < GENERATED_WALK_FRAMES_PER_DIRECTION; column += 1) {
      const frameName = `${direction}-${column + 1}.png`;
      frameNames.push(frameName);
      frames[frameName] = {
        frame: {
          x: column * GENERATED_WALK_FRAME_SIZE,
          y: row * GENERATED_WALK_FRAME_SIZE,
          w: GENERATED_WALK_FRAME_SIZE,
          h: GENERATED_WALK_FRAME_SIZE
        },
        rotated: false,
        trimmed: false,
        spriteSourceSize: {
          x: 0,
          y: 0,
          w: GENERATED_WALK_FRAME_SIZE,
          h: GENERATED_WALK_FRAME_SIZE
        },
        sourceSize: {
          w: GENERATED_WALK_FRAME_SIZE,
          h: GENERATED_WALK_FRAME_SIZE
        }
      };
    }

    animations[direction] = frameNames;
  });

  return {
    frames,
    animations,
    meta: {
      image: imageUrl,
      format: 'RGBA8888',
      size: {
        w: GENERATED_WALK_FRAME_SIZE * GENERATED_WALK_FRAMES_PER_DIRECTION,
        h: GENERATED_WALK_FRAME_SIZE * GENERATED_WALK_DIRECTIONS.length
      },
      scale: '1'
    }
  };
}

let sharedCache: SharedAiTownAssets | null = null;
let sharedLoading: Promise<SharedAiTownAssets> | null = null;
const generatedMapTextureCache = new Map<string, GeneratedMapLayerTextures>();
const generatedMapLoading = new Map<string, Promise<GeneratedMapLayerTextures | null>>();

async function loadTexture(url: string) {
  const texture = Assets.cache.has(url) ? Assets.cache.get<Texture>(url)! : await Assets.load<Texture>(url);

  if (texture.source) {
    texture.source.scaleMode = 'nearest';
  }

  return texture;
}

function normalizeMapIds(mapIds: string[] | undefined) {
  return [...new Set((mapIds ?? []).filter((mapId) => mapId.trim().length > 0))];
}

async function loadSharedAiTownAssets() {
  if (sharedCache) {
    return sharedCache;
  }

  if (sharedLoading) {
    return sharedLoading;
  }

  sharedLoading = (async () => {
    const tileSetTexture = await loadTexture('/assets/generated/maps/neon-commercial-district/neon-commercial-district_preview.webp');

    const characterAnimations = {} as Record<CharacterKey, CharacterAnimations>;

    for (const [characterKey, characterTextureUrl] of Object.entries(GENERATED_CHARACTER_TEXTURE_URLS) as Array<
      [CharacterKey, string]
    >) {
      const characterTexture = await loadTexture(characterTextureUrl);
      const spritesheet = new Spritesheet(characterTexture, buildGeneratedWalkSpritesheetData(characterTextureUrl));
      await spritesheet.parse();

      characterAnimations[characterKey] = {
        down: spritesheet.animations.down,
        left: spritesheet.animations.left,
        right: spritesheet.animations.right,
        up: spritesheet.animations.up
      };
    }

    const animationSheets = {} as Record<string, Spritesheet>;
    const rolePawnTextures: Partial<Record<RolePawnKey, Texture>> = {};

    for (const [rolePawnKey, url] of Object.entries(ROLE_PAWN_TEXTURE_URLS) as Array<[RolePawnKey, string]>) {
      rolePawnTextures[rolePawnKey] = await loadTexture(url);
    }

    for (const [sheetName, manifest] of Object.entries(animationManifests)) {
      const texture = await loadTexture(manifest.url);
      const spritesheet = new Spritesheet(texture, manifest.data);
      await spritesheet.parse();
      animationSheets[sheetName] = spritesheet;
    }

    sharedCache = {
      characterAnimations,
      rolePawnTextures,
      tileSetTexture,
      animationSheets
    };

    return sharedCache;
  })();

  try {
    return await sharedLoading;
  } catch (error) {
    sharedLoading = null;
    throw error;
  }
}

async function loadGeneratedMapTextures(mapId: string) {
  const cachedTextures = generatedMapTextureCache.get(mapId);
  if (cachedTextures) {
    return cachedTextures;
  }

  const existingLoad = generatedMapLoading.get(mapId);
  if (existingLoad) {
    return existingLoad;
  }

  const map = GENERATED_MAP_BY_ID.get(mapId);
  if (!map) {
    return null;
  }

  const loading = (async () => {
    const entries = await Promise.all(
      GENERATED_MAP_RENDER_LAYER_KEYS.map(async (layerKey) => [
        layerKey,
        await loadTexture(map.layerUrls[layerKey])
      ] as const)
    );
    const textures = Object.fromEntries(entries) as GeneratedMapLayerTextures;
    generatedMapTextureCache.set(mapId, textures);
    generatedMapLoading.delete(mapId);
    return textures;
  })();

  generatedMapLoading.set(mapId, loading);

  try {
    return await loading;
  } catch (error) {
    generatedMapLoading.delete(mapId);
    throw error;
  }
}

async function unloadTextureUrl(url: string, texture?: Texture) {
  try {
    await Assets.unload(url);
  } catch {
    texture?.source?.unload?.();
  }
}

async function evictGeneratedMapTexturesExcept(retainedMapIds: Set<string>) {
  const evictions = [...generatedMapTextureCache.entries()].filter(([mapId]) => !retainedMapIds.has(mapId));

  await Promise.all(
    evictions.map(async ([mapId, textures]) => {
      const map = GENERATED_MAP_BY_ID.get(mapId);
      if (map) {
        await Promise.all(
          GENERATED_MAP_RENDER_LAYER_KEYS.map((layerKey) => unloadTextureUrl(map.layerUrls[layerKey], textures[layerKey]))
        );
      }

      generatedMapTextureCache.delete(mapId);
    })
  );
}

function snapshotGeneratedMapTextures() {
  return Object.fromEntries(generatedMapTextureCache.entries()) as Record<string, GeneratedMapLayerTextures>;
}

export async function loadAiTownAssets(options: AiTownAssetLoadOptions = {}) {
  const sharedAssets = await loadSharedAiTownAssets();
  const mapIds = normalizeMapIds(options.mapIds);

  await Promise.all(mapIds.map((mapId) => loadGeneratedMapTextures(mapId)));

  if (options.evictExceptMapIds) {
    await evictGeneratedMapTexturesExcept(new Set(normalizeMapIds(options.evictExceptMapIds)));
  }

  return {
    ...sharedAssets,
    generatedMapTextures: snapshotGeneratedMapTextures()
  };
}
