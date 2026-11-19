// 한 바다에서 만나는 적 배 (SEA-2). 일반 적 = 왜선(무기 구성만 다름), 보스만 따로.
// 이름 원칙: 실존 배 이름(아타케부네 등)은 출처 확인 뒤에만 씀 → 지금은 일반 명칭.
import type { BotOptions } from '../sim/bot';
import { WAESEON, WEAPONS, type ShipDef } from '../sim/data';

/** 작은 왜선: 첫 몇 층 (결계 없음, 조총만) */
export const WAE_SMALL: ShipDef = {
  ...WAESEON, id: 'wae-small', name: '작은 왜선', hull: 8, reactor: 6,
  systems: { ...WAESEON.systems, ward: 0, oars: 2 },
  weapons: [{ id: 'jochong', mount: 'guns' }],
};

/** 조총형: 붙으려 함 (기본 왜선) */
export const WAE_MUSKET: ShipDef = {
  ...WAESEON, id: 'wae-musket', name: '왜선 (조총)', hull: 10,
  // 항해 중 일반 전투는 짧고 덜 아프게: 조총 충전 13 → 15초 [추정]
  weapons: [{ id: 'jochong', mount: 'guns', def: { ...WEAPONS.jochong, charge: 15 } }, { id: 'bulhwasal', mount: 'guns' }],
};

/** 대포형: 멀리서 쏨 (백로그 A12) */
export const WAE_CANNON: ShipDef = {
  ...WAESEON, id: 'wae-cannon', name: '왜선 (대포)', prefers: 'far', hull: 12,
  weapons: [{ id: 'waepo', mount: 'guns' }, { id: 'bulhwasal', mount: 'guns' }],
};

/** 정예: 결계 두 겹, 조총 + 대포 */
export const WAE_ELITE: ShipDef = {
  ...WAESEON, id: 'wae-elite', name: '왜 정예선', hull: 14, reactor: 9, prefers: 'near',
  systems: { ...WAESEON.systems, ward: 4, guns: 3 },
  weapons: [{ id: 'jochong', mount: 'guns' }, { id: 'bulhwasal', mount: 'guns' }],
  crew: ['왜병 1', '왜병 2', '왜병 3', '왜병 4'],
};

/** 바다 보스: 큰 배, 좌우현 포갑판 (거리는 고정: 중거리 — 페이즈별 거리는 추후) */
export const WAE_FLAGSHIP: ShipDef = {
  id: 'wae-flagship', name: '왜 수군 장수의 대장선', hull: 26, reactor: 11, prefers: 'mid',
  rooms: [
    { id: 'oars', sys: 'oars', x: 0, y: 0, w: 2, h: 1 },
    { id: 'deck', name: '빈 방', x: 0, y: 1, w: 2, h: 1 },
    { id: 'hold', name: '빈 방', x: 0, y: 2, w: 2, h: 1 },
    { id: 'guns', sys: 'guns', name: '포갑판(좌현)', x: 2, y: 0, w: 3, h: 1 },
    { id: 'ward', sys: 'ward', x: 2, y: 1, w: 1, h: 1 },
    { id: 'pump', sys: 'pump', x: 3, y: 1, w: 1, h: 1 },
    { id: 'medic', sys: 'medic', x: 4, y: 1, w: 1, h: 1 },
    { id: 'gunsR', sys: 'gunsR', x: 2, y: 2, w: 3, h: 1 },
    { id: 'helm', sys: 'helm', x: 5, y: 0, w: 1, h: 3 },
  ],
  drains: [],
  systems: { helm: 1, oars: 3, ward: 2, guns: 4, gunsR: 2, pump: 2, medic: 1 },
  weapons: [{ id: 'jochong', mount: 'guns' }, { id: 'waepo', mount: 'gunsR' }],
  crew: ['왜병 1', '왜병 2', '왜병 3', '왜병 4', '왜병 5'],
};

/** 위협 수치에 따라 세짐: 0~33 그대로, 34~66 선체 +3·격군 +1, 67~ 선체 +6·격군 +1·충전 10% 빠름·선원 +1 */
export function scaleEnemy(def: ShipDef, threat: number): ShipDef {
  const tier = threat >= 67 ? 2 : threat >= 34 ? 1 : 0;
  if (tier === 0) return def;
  const oars = def.systems.oars ?? 0;
  return {
    ...def,
    name: def.name + (tier === 2 ? ' ⚠⚠' : ' ⚠'),
    hull: def.hull + tier * 3,
    systems: { ...def.systems, oars: Math.min(4, oars + 1) },
    weapons: tier === 2 ? def.weapons.map((m) => ({ ...m, def: { ...(m.def ?? WEAPONS[m.id]), charge: (m.def ?? WEAPONS[m.id]).charge * 0.9 } })) : def.weapons,
    crew: tier === 2 ? [...def.crew, `왜병 ${def.crew.length + 1}`] : def.crew,
  };
}

export const threatTier = (threat: number) => (threat >= 67 ? 2 : threat >= 34 ? 1 : 0);

/** 적 조종: 작은 왜선은 서툴고(일제 사격 모름), 나머지는 일제 사격 */
export function enemyBot(def: ShipDef): BotOptions {
  return def.id.startsWith('wae-small') ? { thinkEvery: 1.5 } : { volley: true };
}
