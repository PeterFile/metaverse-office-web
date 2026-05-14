import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  assetCache,
  assetLoadMock,
  assetUnloadMock,
  textureSourceUnloadMock
} = vi.hoisted(() => {
  const assetCache = new Map<string, { source: { url: string; scaleMode?: string; unload: () => void } }>();
  const textureSourceUnloadMock = vi.fn();
  const assetLoadMock = vi.fn(async (url: string) => {
    const texture = {
      source: {
        url,
        scaleMode: undefined,
        unload: textureSourceUnloadMock
      }
    };
    assetCache.set(url, texture);
    return texture;
  });
  const assetUnloadMock = vi.fn(async (url: string) => {
    assetCache.delete(url);
  });

  return {
    assetCache,
    assetLoadMock,
    assetUnloadMock,
    textureSourceUnloadMock
  };
});

function layerUrl(mapId: string, layer: string) {
  return `/assets/generated/maps/${mapId}/${mapId}_${layer}.webp`;
}

function makeMap(id: string) {
  return {
    id,
    label: id,
    renderMode: 'layered-raster' as const,
    width: 40,
    height: 30,
    pixelWidth: 1280,
    pixelHeight: 960,
    tileSetUrl: '',
    tileSetDimX: 0,
    tileSetDimY: 0,
    tileDim: 32,
    bgTiles: [],
    objectTiles: [],
    animatedSprites: [],
    layerUrls: {
      groundBase: layerUrl(id, 'ground_base'),
      dressedRef: layerUrl(id, 'dressed_ref'),
      propPack: layerUrl(id, 'prop_pack'),
      propsTransparent: layerUrl(id, 'props_transparent'),
      collision: layerUrl(id, 'collision'),
      regions: layerUrl(id, 'regions'),
      preview: layerUrl(id, 'preview')
    },
    ySortProps: []
  };
}

vi.mock('pixi.js', () => {
  class Spritesheet {
    animations: Record<string, unknown[]> = {};

    constructor(
      private readonly texture: { source: unknown },
      private readonly data: { animations?: Record<string, string[]> }
    ) {}

    async parse() {
      this.animations = Object.fromEntries(
        Object.entries(this.data.animations ?? {}).map(([name, frames]) => [
          name,
          frames.map((frame) => ({ frame, source: this.texture.source }))
        ])
      );
    }
  }

  return {
    Assets: {
      cache: {
        has: (url: string) => assetCache.has(url),
        get: (url: string) => assetCache.get(url)
      },
      load: assetLoadMock,
      unload: assetUnloadMock
    },
    Spritesheet
  };
});

vi.mock('./mapData', () => ({
  AI_TOWN_GENERATED_MAPS: [makeMap('map-a'), makeMap('map-b')]
}));

describe('loadAiTownAssets', () => {
  beforeEach(() => {
    vi.resetModules();
    assetCache.clear();
    assetLoadMock.mockClear();
    assetUnloadMock.mockClear();
    textureSourceUnloadMock.mockClear();
  });

  it('loads only requested generated map layers', async () => {
    const { loadAiTownAssets } = await import('./assetLoader');

    const assets = await loadAiTownAssets({
      evictExceptMapIds: ['map-a'],
      mapIds: ['map-a']
    });

    expect(Object.keys(assets.generatedMapTextures)).toEqual(['map-a']);
    expect(assetLoadMock).toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_ground_base.webp');
    expect(assetLoadMock).toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_props_transparent.webp');
    expect(assetLoadMock).not.toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_dressed_ref.webp');
    expect(assetLoadMock).not.toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_collision.webp');
    expect(assetLoadMock).not.toHaveBeenCalledWith('/assets/generated/maps/map-b/map-b_ground_base.webp');
    expect(assetLoadMock).not.toHaveBeenCalledWith('/assets/generated/maps/map-b/map-b_props_transparent.webp');
  });

  it('evicts generated map layers outside the retained map set', async () => {
    const { loadAiTownAssets } = await import('./assetLoader');

    await loadAiTownAssets({
      evictExceptMapIds: ['map-a'],
      mapIds: ['map-a']
    });
    assetUnloadMock.mockClear();

    const assets = await loadAiTownAssets({
      evictExceptMapIds: ['map-b'],
      mapIds: ['map-b']
    });

    expect(Object.keys(assets.generatedMapTextures)).toEqual(['map-b']);
    expect(assetUnloadMock).toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_ground_base.webp');
    expect(assetUnloadMock).toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_props_transparent.webp');
    expect(assetUnloadMock).not.toHaveBeenCalledWith('/assets/generated/maps/map-a/map-a_dressed_ref.webp');
    expect(assetCache.has('/assets/generated/maps/map-a/map-a_ground_base.webp')).toBe(false);
  });
});
