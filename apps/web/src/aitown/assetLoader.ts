import { Assets, Spritesheet, type SpritesheetData as PixiSpritesheetData, type Texture } from 'pixi.js';

import { characterSpritesheets } from './characters';
import campfire from './data/animations/campfire.json';
import gentlesparkle from './data/animations/gentlesparkle.json';
import gentlesplash from './data/animations/gentlesplash.json';
import gentlewaterfall from './data/animations/gentlewaterfall.json';
import windmill from './data/animations/windmill.json';
import type { CharacterKey, Facing } from './types';

type CharacterAnimations = Record<Facing, Texture[]>;

export interface AiTownAssets {
  characterAnimations: Record<CharacterKey, CharacterAnimations>;
  tileSetTexture: Texture;
  animationSheets: Record<string, Spritesheet>;
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

let cache: AiTownAssets | null = null;
let loading: Promise<AiTownAssets> | null = null;

async function loadTexture(url: string) {
  const texture = Assets.cache.has(url) ? Assets.cache.get<Texture>(url)! : await Assets.load<Texture>(url);

  if (texture.source) {
    texture.source.scaleMode = 'nearest';
  }

  return texture;
}

export async function loadAiTownAssets() {
  if (cache) {
    return cache;
  }

  if (loading) {
    return loading;
  }

  loading = (async () => {
    const tileSetTexture = await loadTexture('/ai-town/assets/gentle-obj.png');
    const characterTexture = await loadTexture('/ai-town/assets/32x32folk.png');

    const characterAnimations = {} as Record<CharacterKey, CharacterAnimations>;

    for (const [characterKey, spritesheetData] of Object.entries(characterSpritesheets) as Array<
      [CharacterKey, typeof characterSpritesheets[CharacterKey]]
    >) {
      const spritesheet = new Spritesheet(characterTexture, spritesheetData as unknown as PixiSpritesheetData);
      await spritesheet.parse();

      characterAnimations[characterKey] = {
        down: spritesheet.animations.down,
        left: spritesheet.animations.left,
        right: spritesheet.animations.right,
        up: spritesheet.animations.up
      };
    }

    const animationSheets = {} as Record<string, Spritesheet>;

    for (const [sheetName, manifest] of Object.entries(animationManifests)) {
      const texture = await loadTexture(manifest.url);
      const spritesheet = new Spritesheet(texture, manifest.data);
      await spritesheet.parse();
      animationSheets[sheetName] = spritesheet;
    }

    cache = {
      characterAnimations,
      tileSetTexture,
      animationSheets
    };

    return cache;
  })();

  try {
    return await loading;
  } catch (error) {
    loading = null;
    throw error;
  }
}
