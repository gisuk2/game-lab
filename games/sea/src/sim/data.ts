// 이세계 수군 — 전투 데이터 (SEA-1). 수치는 전부 [추정], 봇 대결로 맞춘다.
// 배는 옆에서 자른 단면: floor 0 = 위층(싸우는 곳), floor 1 = 아래층(일하는 곳, 물에 잠긴 쪽).

export type SystemId = 'helm' | 'oars' | 'ward' | 'guns' | 'pump' | 'medic' | 'scope' | 'doors';
export type Distance = 'far' | 'mid' | 'near';
export type FormationId = 'hakik' | 'jangsa';

export const SYSTEM_NAME: Record<SystemId, string> = {
  helm: '장대', oars: '격군실', ward: '결계실', guns: '포갑판',
  pump: '배수실', medic: '의원실', scope: '망원경', doors: '빗장실',
};
export const SYSTEM_ICON: Record<SystemId, string> = {
  helm: '🏯', oars: '🚣', ward: '🛡', guns: '💥', pump: '💧', medic: '⚕', scope: '🔭', doors: '🔒',
};
/** 마력을 꽂는 순서(화면 아래 막대 순서) */
export const SYSTEM_ORDER: SystemId[] = ['ward', 'guns', 'oars', 'helm', 'pump', 'medic', 'scope', 'doors'];
/** 선원이 서 있으면 주는 보너스 (화면 설명용, 실제 계산은 battle.ts) */
export const MAN_BONUS: Partial<Record<SystemId, string>> = {
  helm: '회피 +5% · 장대가 비면 회피 0', oars: '회피 +5%', ward: '결계 재충전 +25%', guns: '총통 충전 +10%',
};
/** 선원이 붙어 있으면 보너스가 있는 방 */
export const MANNED: SystemId[] = ['helm', 'oars', 'ward', 'guns'];

export const DISTANCE_NAME: Record<Distance, string> = { far: '원거리', mid: '중거리', near: '근접' };

export interface RoomDef { id: string; sys?: SystemId; name?: string; floor: 0 | 1; col: number; w: number }
export interface LadderDef { up: string; down: string; col: number }

export interface WeaponDef {
  id: string; name: string; power: number; charge: number;
  dmg: number; shots: number; breach: number; fire: number; crewDmg: number;
  /** 결계를 몇 겹 뚫는지 (뚫을 때마다 피해 −1) */
  pierce?: number;
  /** 거리별 명중 배율 */
  acc: Record<Distance, number>;
  blurb: string;
}

export interface ShipDef {
  id: string; name: string; hull: number; reactor: number;
  rooms: RoomDef[]; ladders: LadderDef[];
  systems: Partial<Record<SystemId, number>>;
  weapons: string[]; crew: string[];
  /** 정찰 실패 때 끌려가는 거리 */
  prefers: Distance;
}

export const WEAPONS: Record<string, WeaponDef> = {
  // 조선 총통: 이름·크기 순서는 고증(천>지>현>황), 수치는 게임 설정
  cheonja: { id: 'cheonja', name: '천자총통', power: 3, charge: 18, dmg: 3, shots: 1, breach: 0.7, fire: 0, crewDmg: 15, pierce: 1,
    acc: { far: 1, mid: 0.95, near: 0.7 }, blurb: '가장 큰 총통. 결계 한 겹을 뚫고 큰 구멍을 냄. 충전이 아주 느림' },
  jija: { id: 'jija', name: '지자총통', power: 2, charge: 12, dmg: 2, shots: 1, breach: 0.5, fire: 0, crewDmg: 12,
    acc: { far: 0.95, mid: 0.95, near: 0.8 }, blurb: '두 번째로 큰 총통. 피해 큼, 충전 느림' },
  hyeonja: { id: 'hyeonja', name: '현자총통', power: 2, charge: 14, dmg: 1, shots: 2, breach: 0.2, fire: 0, crewDmg: 8,
    acc: { far: 0.8, mid: 0.95, near: 0.9 }, blurb: '세 번째 크기. 두 발씩 쏘는 균형형' },
  hwangja: { id: 'hwangja', name: '황자총통', power: 1, charge: 13, dmg: 1, shots: 1, breach: 0.1, fire: 0, crewDmg: 8,
    acc: { far: 0.75, mid: 0.95, near: 0.95 }, blurb: '가장 작은 총통. 빠르게 결계를 두드림' },
  // 왜선 무기: 일반 명칭만 씀
  jochong: { id: 'jochong', name: '조총 일제사격', power: 2, charge: 12, dmg: 1, shots: 3, breach: 0, fire: 0, crewDmg: 8,
    acc: { far: 0.35, mid: 0.7, near: 0.9 }, blurb: '조총을 한꺼번에 쏨. 가까울수록 무서움' },
  waepo: { id: 'waepo', name: '왜 대포', power: 2, charge: 15, dmg: 2, shots: 1, breach: 0.4, fire: 0, crewDmg: 12,
    acc: { far: 0.8, mid: 0.9, near: 0.9 }, blurb: '왜선에 실은 대포' },
  bulhwasal: { id: 'bulhwasal', name: '불화살', power: 1, charge: 10, dmg: 1, shots: 1, breach: 0, fire: 0.5, crewDmg: 5,
    acc: { far: 0.6, mid: 0.9, near: 0.95 }, blurb: '불을 붙인 화살. 맞은 방에 불이 잘 붙음' },
};

export const PANOKSEON: ShipDef = {
  id: 'panokseon', name: '판옥선', hull: 30, reactor: 8, prefers: 'far',
  rooms: [
    { id: 'helm', sys: 'helm', floor: 0, col: 0, w: 1 },
    { id: 'guns', sys: 'guns', floor: 0, col: 1, w: 2 },
    { id: 'scope', sys: 'scope', floor: 0, col: 3, w: 1 },
    { id: 'empty1', name: '빈 방', floor: 0, col: 4, w: 2 },
    { id: 'oars', sys: 'oars', floor: 1, col: 0, w: 2 },
    { id: 'ward', sys: 'ward', floor: 1, col: 2, w: 1 },
    { id: 'pump', sys: 'pump', floor: 1, col: 3, w: 1 },
    { id: 'medic', sys: 'medic', floor: 1, col: 4, w: 1 },
    { id: 'doors', sys: 'doors', floor: 1, col: 5, w: 1 },
  ],
  ladders: [
    { up: 'helm', down: 'oars', col: 0 },
    { up: 'guns', down: 'ward', col: 2 },
    { up: 'empty1', down: 'doors', col: 5 },
  ],
  systems: { helm: 1, oars: 2, ward: 2, guns: 3, pump: 1, medic: 1, scope: 1, doors: 1 },
  weapons: ['jija', 'hwangja'],
  crew: ['돌쇠', '막동', '언년'],
};

export const WAESEON: ShipDef = {
  id: 'waeseon', name: '왜선', hull: 12, reactor: 8, prefers: 'near',
  rooms: [
    { id: 'helm', sys: 'helm', floor: 0, col: 0, w: 1 },
    { id: 'guns', sys: 'guns', floor: 0, col: 1, w: 2 },
    { id: 'deck', name: '빈 방', floor: 0, col: 3, w: 1 },
    { id: 'oars', sys: 'oars', floor: 1, col: 0, w: 2 },
    { id: 'ward', sys: 'ward', floor: 1, col: 2, w: 1 },
    { id: 'pump', sys: 'pump', floor: 1, col: 3, w: 1 },
  ],
  ladders: [
    { up: 'helm', down: 'oars', col: 0 },
    { up: 'deck', down: 'pump', col: 3 },
  ],
  systems: { helm: 1, oars: 3, ward: 2, guns: 3, pump: 1 },
  weapons: ['jochong', 'bulhwasal'],
  crew: ['왜병 1', '왜병 2', '왜병 3'],
};

export interface FormationDef { id: FormationId; name: string; history: string; effect: string;
  charge: number; move: number; repair: number }

/** 진법: 이름·역사 한 줄은 고증, 효과는 게임 설정 (core.md §8.6) */
export const FORMATIONS: Record<FormationId, FormationDef> = {
  hakik: { id: 'hakik', name: '학익진', history: '한산도 해전에서 이순신이 써서 크게 이긴 진형',
    effect: '총통 충전 +20% / 선원 이동 −20%', charge: 1.2, move: 0.8, repair: 1 },
  jangsa: { id: 'jangsa', name: '장사진', history: '부산포 해전에서 조선 수군이 장사진으로 공격을 시작함',
    effect: '선원 이동 +30%, 수리 +20% / 총통 충전 −10%', charge: 0.9, move: 1.3, repair: 1.2 },
};
export const FORMATION_COOLDOWN = 20;

/** 규칙 상수 [추정] */
export const RULES = {
  dt: 0.1,
  inflow: [0.03, 0.08] as const, // 구멍 하나당 물 들어오는 양(칸/초): 위층, 아래층
  doorFlow: 0.6, // 열린 문으로 수위 차를 메우는 속도
  fall: 0.8, // 위층 물이 사다리 구멍으로 떨어지는 비율(/초)
  pump: 0.05, // 배수실 마력 1당 퍼내는 양(칸/초)
  slowWater: 0.3, offWater: 0.6, fullWater: 0.98,
  fireGrow: 0.05, fireSpread: 0.06, fireSpreadClosed: 0.015, fireFightCrew: 0.25, fireDouse: 0.8,
  fireSysDmg: 0.1, fireCrewDmg: 3,
  waterCrewDmg: [1.5, 4] as const,
  repairBreach: 1 / 6, repairSys: 1 / 4,
  heal: 8,
  wardRecharge: 2,
  travel: { far: 2.4, mid: 1.6, near: 1.0 } as Record<Distance, number>,
  walkPerCol: 0.7, ladderTime: 1.0,
  scoutBase: 0.35, scoutPerScope: 0.15,
};
