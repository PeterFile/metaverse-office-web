import {
  animatedsprites,
  bgtiles,
  mapheight,
  mapwidth,
  objmap,
  tiledim,
  tilesetpath,
  tilesetpxh,
  tilesetpxw
} from './data/gentle';
import type { AiTownMapData } from './types';

export const GENTLE_MAP: AiTownMapData = {
  width: mapwidth,
  height: mapheight,
  tileSetUrl: tilesetpath,
  tileSetDimX: tilesetpxw,
  tileSetDimY: tilesetpxh,
  tileDim: tiledim,
  bgTiles: bgtiles as number[][][],
  objectTiles: objmap as number[][][],
  animatedSprites: animatedsprites
};
