import type { AiTownGateway, AiTownLayeredMapData, AiTownYSortProp, ScenePoint } from './types';

export const DEFAULT_AI_TOWN_MAP_ID = 'neon-commercial-district';

function layerUrl(mapId: string, layer: string) {
  return `/assets/generated/maps/${mapId}/${mapId}_${layer}.webp`;
}

function makeLayeredMap(
  id: string,
  label: string,
  pixelWidth: number,
  pixelHeight: number,
  ySortProps: AiTownYSortProp[]
): AiTownLayeredMapData {
  return {
    id,
    label,
    renderMode: 'layered-raster',
    width: Math.ceil(pixelWidth / 32),
    height: Math.ceil(pixelHeight / 32),
    pixelWidth,
    pixelHeight,
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
    ySortProps
  };
}

function prop(
  mapId: string,
  index: number,
  { x, y, left, top, w, h, sortY }: Omit<AiTownYSortProp, 'id' | 'collision'>
): AiTownYSortProp {
  return {
    id: `${mapId}_prop_${index}`,
    x,
    y,
    left,
    top,
    w,
    h,
    sortY,
    collision: 'blocker'
  };
}

export const AI_TOWN_GENERATED_MAPS: AiTownLayeredMapData[] = [
  makeLayeredMap('vertical-city-overview', 'Vertical City Overview', 1024, 1535, [
    prop('vertical-city-overview', 2, { x: 737, y: 507, left: 657, top: 309, w: 161, h: 198, sortY: 507 }),
    prop('vertical-city-overview', 1, { x: 225, y: 522, left: 140, top: 392, w: 170, h: 130, sortY: 522 }),
    prop('vertical-city-overview', 3, { x: 348, y: 1059, left: 263, top: 939, w: 170, h: 120, sortY: 1059 }),
    prop('vertical-city-overview', 4, { x: 676, y: 1105, left: 598, top: 907, w: 156, h: 198, sortY: 1105 })
  ]),
  makeLayeredMap('corporate-cloud-district', 'Corporate Cloud District', 1536, 1024, [
    prop('corporate-cloud-district', 2, { x: 1106, y: 338, left: 1011, top: 140, w: 190, h: 198, sortY: 338 }),
    prop('corporate-cloud-district', 1, { x: 338, y: 348, left: 260, top: 150, w: 156, h: 198, sortY: 348 }),
    prop('corporate-cloud-district', 3, { x: 522, y: 707, left: 449, top: 509, w: 147, h: 198, sortY: 707 }),
    prop('corporate-cloud-district', 4, { x: 1014, y: 737, left: 915, top: 603, w: 198, h: 134, sortY: 737 })
  ]),
  makeLayeredMap('neon-commercial-district', 'Neon Commercial District', 1448, 1086, [
    prop('neon-commercial-district', 2, { x: 1043, y: 358, left: 970, top: 160, w: 147, h: 198, sortY: 358 }),
    prop('neon-commercial-district', 1, { x: 319, y: 369, left: 220, top: 235, w: 198, h: 134, sortY: 369 }),
    prop('neon-commercial-district', 3, { x: 492, y: 749, left: 395, top: 551, w: 194, h: 198, sortY: 749 }),
    prop('neon-commercial-district', 4, { x: 956, y: 782, left: 850, top: 570, w: 212, h: 212, sortY: 782 })
  ]),
  makeLayeredMap('scrap-slum-waste-street', 'Scrap Slum Waste Street', 1448, 1086, [
    prop('scrap-slum-waste-street', 2, { x: 1043, y: 358, left: 944, top: 216, w: 198, h: 142, sortY: 358 }),
    prop('scrap-slum-waste-street', 1, { x: 319, y: 369, left: 213, top: 157, w: 212, h: 212, sortY: 369 }),
    prop('scrap-slum-waste-street', 3, { x: 492, y: 749, left: 393, top: 559, w: 198, h: 190, sortY: 749 }),
    prop('scrap-slum-waste-street', 4, { x: 956, y: 782, left: 857, top: 593, w: 198, h: 189, sortY: 782 })
  ]),
  makeLayeredMap('old-net-ai-graveyard', 'Old Net AI Graveyard', 1448, 1086, [
    prop('old-net-ai-graveyard', 2, { x: 1043, y: 358, left: 960, top: 160, w: 166, h: 198, sortY: 358 }),
    prop('old-net-ai-graveyard', 1, { x: 319, y: 369, left: 220, top: 180, w: 198, h: 189, sortY: 369 }),
    prop('old-net-ai-graveyard', 3, { x: 492, y: 749, left: 388, top: 543, w: 208, h: 206, sortY: 749 }),
    prop('old-net-ai-graveyard', 4, { x: 956, y: 782, left: 892, top: 584, w: 128, h: 198, sortY: 782 })
  ]),
  makeLayeredMap('cybernetic-repair-clinic', 'Cybernetic Repair Clinic', 1484, 1060, [
    prop('cybernetic-repair-clinic', 2, { x: 1068, y: 350, left: 984, top: 152, w: 169, h: 198, sortY: 350 }),
    prop('cybernetic-repair-clinic', 1, { x: 326, y: 360, left: 262, top: 162, w: 128, h: 198, sortY: 360 }),
    prop('cybernetic-repair-clinic', 3, { x: 505, y: 731, left: 409, top: 533, w: 193, h: 198, sortY: 731 }),
    prop('cybernetic-repair-clinic', 4, { x: 979, y: 763, left: 889, top: 565, w: 180, h: 198, sortY: 763 })
  ]),
  makeLayeredMap('data-bar-safehouse', 'Data Bar Safehouse', 1443, 1090, [
    prop('data-bar-safehouse', 2, { x: 1039, y: 360, left: 937, top: 152, w: 204, h: 208, sortY: 360 }),
    prop('data-bar-safehouse', 1, { x: 317, y: 371, left: 227, top: 173, w: 180, h: 198, sortY: 371 }),
    prop('data-bar-safehouse', 3, { x: 491, y: 752, left: 394, top: 564, w: 194, h: 188, sortY: 752 }),
    prop('data-bar-safehouse', 4, { x: 952, y: 785, left: 853, top: 611, w: 198, h: 174, sortY: 785 })
  ]),
  makeLayeredMap('agent-sleep-pod-room', 'Agent Sleep Pod Room', 1448, 1086, [
    prop('agent-sleep-pod-room', 2, { x: 1043, y: 358, left: 948, top: 160, w: 191, h: 198, sortY: 358 }),
    prop('agent-sleep-pod-room', 1, { x: 319, y: 369, left: 220, top: 195, w: 198, h: 174, sortY: 369 }),
    prop('agent-sleep-pod-room', 3, { x: 492, y: 749, left: 393, top: 567, w: 198, h: 182, sortY: 749 }),
    prop('agent-sleep-pod-room', 4, { x: 956, y: 782, left: 853, top: 580, w: 207, h: 202, sortY: 782 })
  ]),
  makeLayeredMap('mission-wall-alley', 'Mission Wall Alley', 1536, 1024, [
    prop('mission-wall-alley', 2, { x: 1106, y: 338, left: 1045, top: 140, w: 123, h: 198, sortY: 338 }),
    prop('mission-wall-alley', 1, { x: 338, y: 348, left: 235, top: 146, w: 207, h: 202, sortY: 348 }),
    prop('mission-wall-alley', 3, { x: 522, y: 707, left: 423, top: 555, w: 198, h: 152, sortY: 707 }),
    prop('mission-wall-alley', 4, { x: 1014, y: 737, left: 934, top: 539, w: 161, h: 198, sortY: 737 })
  ]),
  makeLayeredMap('token-leaderboard-plaza', 'Token Leaderboard Plaza', 1448, 1086, [
    prop('token-leaderboard-plaza', 2, { x: 1043, y: 358, left: 944, top: 218, w: 198, h: 140, sortY: 358 }),
    prop('token-leaderboard-plaza', 1, { x: 319, y: 369, left: 239, top: 171, w: 161, h: 198, sortY: 369 }),
    prop('token-leaderboard-plaza', 3, { x: 492, y: 749, left: 414, top: 551, w: 156, h: 198, sortY: 749 }),
    prop('token-leaderboard-plaza', 4, { x: 956, y: 782, left: 861, top: 584, w: 190, h: 198, sortY: 782 })
  ]),
  makeLayeredMap('data-altar-chamber', 'Data Altar Chamber', 1536, 1024, [
    prop('data-altar-chamber', 2, { x: 1106, y: 338, left: 1033, top: 140, w: 147, h: 198, sortY: 338 }),
    prop('data-altar-chamber', 1, { x: 338, y: 348, left: 243, top: 150, w: 190, h: 198, sortY: 348 }),
    prop('data-altar-chamber', 3, { x: 522, y: 707, left: 423, top: 573, w: 198, h: 134, sortY: 707 }),
    prop('data-altar-chamber', 4, { x: 1014, y: 737, left: 941, top: 539, w: 147, h: 198, sortY: 737 })
  ])
];

export const AI_TOWN_MAP_BY_ID = new Map(AI_TOWN_GENERATED_MAPS.map((map) => [map.id, map]));

function gatewayPair(
  fromMapId: string,
  toMapId: string,
  label: string,
  fromEntry: ScenePoint,
  toEntry: ScenePoint
): AiTownGateway[] {
  return [
    {
      gatewayId: `${fromMapId}-to-${toMapId}`,
      label,
      fromMapId,
      toMapId,
      entry: fromEntry,
      arrival: toEntry,
      triggerRadius: 42
    },
    {
      gatewayId: `${toMapId}-to-${fromMapId}`,
      label,
      fromMapId: toMapId,
      toMapId: fromMapId,
      entry: toEntry,
      arrival: fromEntry,
      triggerRadius: 42
    }
  ];
}

export const AI_TOWN_GATEWAYS: AiTownGateway[] = [
  ...gatewayPair(
    'vertical-city-overview',
    'corporate-cloud-district',
    'Skybridge lift',
    { x: 760, y: 320 },
    { x: 180, y: 512 }
  ),
  ...gatewayPair(
    'vertical-city-overview',
    'neon-commercial-district',
    'Neon transit',
    { x: 515, y: 760 },
    { x: 90, y: 535 }
  ),
  ...gatewayPair(
    'vertical-city-overview',
    'scrap-slum-waste-street',
    'Waste elevator',
    { x: 330, y: 1130 },
    { x: 92, y: 780 }
  ),
  ...gatewayPair(
    'vertical-city-overview',
    'old-net-ai-graveyard',
    'Old net shaft',
    { x: 710, y: 1220 },
    { x: 94, y: 535 }
  ),
  ...gatewayPair(
    'neon-commercial-district',
    'cybernetic-repair-clinic',
    'Clinic door',
    { x: 1168, y: 405 },
    { x: 130, y: 520 }
  ),
  ...gatewayPair(
    'neon-commercial-district',
    'data-bar-safehouse',
    'Data bar door',
    { x: 1180, y: 690 },
    { x: 132, y: 540 }
  ),
  ...gatewayPair(
    'neon-commercial-district',
    'mission-wall-alley',
    'Mission alley',
    { x: 725, y: 1010 },
    { x: 768, y: 120 }
  ),
  ...gatewayPair(
    'neon-commercial-district',
    'token-leaderboard-plaza',
    'Token plaza',
    { x: 1288, y: 840 },
    { x: 120, y: 540 }
  ),
  ...gatewayPair(
    'scrap-slum-waste-street',
    'agent-sleep-pod-room',
    'Sleep pod hatch',
    { x: 1268, y: 730 },
    { x: 116, y: 540 }
  ),
  ...gatewayPair(
    'old-net-ai-graveyard',
    'data-altar-chamber',
    'Data altar stairs',
    { x: 1280, y: 540 },
    { x: 126, y: 512 }
  )
];

export const GENTLE_MAP = AI_TOWN_MAP_BY_ID.get(DEFAULT_AI_TOWN_MAP_ID)!;
