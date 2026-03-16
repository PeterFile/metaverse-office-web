import { data as f1 } from './characters/spritesheets/f1';
import { data as f2 } from './characters/spritesheets/f2';
import { data as f3 } from './characters/spritesheets/f3';
import { data as f4 } from './characters/spritesheets/f4';
import { data as f5 } from './characters/spritesheets/f5';
import { data as f6 } from './characters/spritesheets/f6';
import { data as f7 } from './characters/spritesheets/f7';
import { data as f8 } from './characters/spritesheets/f8';
import type { SpritesheetData } from './characters/spritesheets/types';
import type { CharacterKey } from './types';

export const CHARACTER_KEYS: CharacterKey[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

export const characterSpritesheets: Record<CharacterKey, SpritesheetData> = {
  f1,
  f2,
  f3,
  f4,
  f5,
  f6,
  f7,
  f8
};
