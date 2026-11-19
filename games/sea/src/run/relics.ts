import type { ShipMods } from '../sim/battle';

// 유물 50개 (설계: docs/sea/design/relics.md). live = 지금 효과가 들어가 있는 것.
// 이름 원칙: real = 실존 물건 이름(쓰임새는 자유), 아니면 이세계 물건이라 자유.

export type RelicTier = 'common' | 'uncommon' | 'rare' | 'boss';
export type RelicGroup = 'far' | 'board' | 'flee' | 'trap' | 'tank' | 'water' | 'crew' | 'econ' | 'special';
export interface RelicDef {
  id: string; no: number; name: string; tier: RelicTier; group: RelicGroup; text: string;
  real?: boolean; engine?: boolean;
  /** 대가 (보스 유물 등) */
  cost?: string;
  /** 아직 없는 시스템이 필요 */
  needs?: string;
  live?: boolean;
}

export const TIER_NAME: Record<RelicTier, string> = { common: '일반', uncommon: '고급', rare: '희귀', boss: '보스' };

const R = (no: number, id: string, name: string, tier: RelicTier, group: RelicGroup, text: string, extra: Partial<RelicDef> = {}): RelicDef =>
  ({ no, id, name, tier, group, text, ...extra });

export const RELICS: RelicDef[] = [
  // A. 원거리 포격
  R(1, 'arrowBundle', '대장군전 묶음', 'common', 'far', '천자총통이 결계를 한 겹 더 뚫음', { real: true }),
  R(2, 'saltpeter', '염초 상자', 'common', 'far', '전투 시작 때 모든 총통이 30% 충전된 채로 시작', { real: true, live: true }),
  R(3, 'matchCord', '화승 다발', 'common', 'far', '총통 충전 +8%', { real: true, live: true }),
  R(4, 'dwarfMount', '드워프 포가', 'uncommon', 'far', '좌현 포갑판 칸 +1'),
  R(5, 'chainLoad', '연쇄 장전 비결', 'uncommon', 'far', '총통 하나를 쏠 때마다 다른 총통 충전 +10%'),
  R(6, 'sundial', '앙부일구', 'uncommon', 'far', '원거리 전투에서 30초마다 무작위 총통 하나가 바로 충전됨', { real: true }),
  R(7, 'elfScope', '엘프 별자리 망원경', 'rare', 'far', '원거리에서 적 회피 −15%, 매 전투 첫 일제 사격은 피해 2배', { engine: true, live: true }),
  R(8, 'echo', '포성의 메아리', 'boss', 'far', '모든 총통 피해 +1', { engine: true, cost: '근접 전투가 되면 충전 −30%' }),
  // B. 백병전
  R(9, 'nabal', '나발', 'common', 'board', '등선하는 순간 적 선원이 3초 멈칫함', { real: true, needs: '등선' }),
  R(10, 'hookLadder', '갈고리 사다리', 'common', 'board', '등선판 충전 −30%', { needs: '등선' }),
  R(11, 'orcDrum', '오크 전투 북', 'uncommon', 'board', '적 배에 넘어간 우리 선원 공격 +30%', { needs: '등선' }),
  R(12, 'prizeBook', '나포 장부', 'uncommon', 'board', '적 선원을 전멸시켜 이기면 전리품을 하나 더 고름'),
  R(13, 'bloodTattoo', '수인의 피 문신', 'rare', 'board', '적 선원을 쓰러뜨릴 때마다 우리 선원 전원 피 +15', { engine: true, needs: '등선' }),
  R(14, 'waegeom', '왜검', 'rare', 'board', '근접 전투에서는 등선판 없이도 적 배로 넘어갈 수 있음', { engine: true, real: true, needs: '등선' }),
  R(15, 'bloodFlag', '피에 젖은 깃발', 'boss', 'board', '백병전 공격 2배', { cost: '의원실 회복 절반', needs: '등선' }),
  // C. 퇴각·속도
  R(16, 'scoutLog', '사후선 정찰 기록', 'common', 'flee', '정찰 판정 +20%', { real: true }),
  R(17, 'oarDrum', '격군 장단 북', 'common', 'flee', '격군실에 선원이 있으면 회피 +5% 더'),
  R(18, 'windCharm', '바람 부적', 'common', 'flee', '전투 첫 10초 동안 회피 +30%'),
  R(19, 'currentChart', '해류 해도', 'uncommon', 'flee', '지도에 안개 항로가 2개 더 생김'),
  R(20, 'elfSail', '엘프 비단 돛', 'rare', 'flee', '도망치기 충전 2배, 도망쳐도 금화 절반을 받음', { engine: true, needs: '도망치기' }),
  // D. 함정
  R(21, 'steelBolt', '강철 빗장', 'common', 'trap', '우리 배 문이 3배 튼튼해짐', { needs: '등선' }),
  R(22, 'falseFlag', '거짓 깃발', 'uncommon', 'trap', '적이 전투 첫 15초 동안 빈 방만 노림'),
  R(23, 'caltrops', '마름쇠', 'uncommon', 'trap', '우리 배에 들어온 적은 이동 −50%, 초당 피 −2', { real: true, needs: '등선' }),
  R(24, 'decoy', '미끼 배', 'uncommon', 'trap', '바다마다 한 번, 위협을 0으로 되돌림'),
  R(25, 'thunderTrap', '비격진천뢰 덫', 'rare', 'trap', '등선한 적이 빈 방에 들어오면 폭발 (적 선원에게 큰 피해)', { engine: true, real: true, needs: '등선' }),
  // E. 버티기
  R(26, 'resin', '송진 통', 'common', 'tank', '구멍을 막는 속도 +50%', { live: true }),
  R(27, 'bulkhead', '방수 격벽', 'common', 'tank', '물이 문으로 퍼지는 속도 절반'),
  R(28, 'dwarfPlate', '드워프 철판', 'uncommon', 'tank', '선체 최대치 +8'),
  R(29, 'cottonArmor', '면제배갑', 'uncommon', 'tank', '선원이 받는 피해 −25%', { real: true }),
  R(30, 'turtleShell', '거북 등껍질 판', 'rare', 'tank', '맞을 때마다 결계 재충전 +10% (전투 동안 쌓여서 최대 +100%)', { engine: true, live: true }),
  R(31, 'lastStand', '벼랑 끝 의지', 'boss', 'tank', '선체가 30% 아래면 총통 충전 +40%', { cost: '항구 수리비 2배' }),
  // F. 물과 불
  R(32, 'sand', '소화 모래', 'common', 'water', '불 끄는 속도 2배', { live: true }),
  R(33, 'magazineDoor', '화약고 철문', 'common', 'water', '화약고 폭발 피해 절반', { needs: '화약고' }),
  R(34, 'pumpGear', '드워프 펌프 톱니', 'uncommon', 'water', '배수실 마력 1칸당 퍼내는 양 2배'),
  R(35, 'fireOil', '화공 기름', 'uncommon', 'water', '적 배에 붙은 불이 2배 빨리 커짐', { real: true }),
  R(36, 'waterJar', '어인의 물항아리', 'rare', 'water', '우리 배에 찬 물 1칸당 총통 충전 +3% (물이 오히려 힘이 됨)', { engine: true, live: true }),
  // G. 선원
  R(37, 'makgeolli', '막걸리 독', 'common', 'crew', '전투가 끝나면 선원 전원 피 +20'),
  R(38, 'needles', '의원의 침통', 'uncommon', 'crew', '의원실 회복 2배'),
  R(39, 'mapae', '마패', 'uncommon', 'crew', '항구 가격 −20%', { real: true }),
  R(40, 'shell', '통역 조개', 'common', 'crew', '이종족 선원 영입이 자주 나옴', { needs: '이종족 선원' }),
  R(41, 'diary', '난중일기', 'rare', 'crew', '전투가 끝날 때마다 무작위 선원 하나의 숙련 +1', { engine: true, real: true, needs: '숙련' }),
  // H. 경제·지도
  R(42, 'coins', '엽전 꾸러미', 'common', 'econ', '전투 금화 +5', { live: true }),
  R(43, 'saltFood', '소금 절임 군량', 'common', 'econ', '군량을 이동 2번에 1씩만 씀'),
  R(44, 'guildPass', '드워프 상인 조합 증서', 'uncommon', 'econ', '항구에 물건이 하나 더 나옴'),
  R(45, 'treasureMap', '보물 지도 조각', 'uncommon', 'econ', '보물 칸 보상 2배'),
  R(46, 'cipher', '왜 수군 암호문', 'rare', 'econ', '지도의 모든 칸과 적이 보임 (안개 속도)', { engine: true, cost: '얻는 순간 위협 +10', live: true }),
  // I. 진법·특수
  R(47, 'byeongbu', '병부', 'uncommon', 'special', '진법 대기시간 −50%', { real: true }),
  R(48, 'fan', '오행 부채', 'rare', 'special', '진법을 바꿀 때마다 3초 동안 총통 충전 2배', { engine: true, live: true }),
  R(49, 'tentacle', '크라켄의 촉수', 'boss', 'special', '30초마다 적 배의 무작위 방에 피해 2', { engine: true, cost: '10% 확률로 우리 배도 맞음' }),
  R(50, 'sujagi', '수자기', 'boss', 'special', '장대에 선원이 있으면 마력 1칸을 공짜로 더 씀', { engine: true, real: true, cost: '장대가 비면 회피 −10%' }),
];

export const RELIC = Object.fromEntries(RELICS.map((r) => [r.id, r])) as Record<string, RelicDef>;
export const LIVE_RELICS = RELICS.filter((r) => r.live);

export function modsOf(relics: string[]): ShipMods {
  const has = (id: string) => relics.includes(id);
  return {
    chargeStart: has('saltpeter') ? 0.3 : 0,
    chargeMul: has('matchCord') ? 1.08 : 1,
    farEvadeCut: has('elfScope') ? 0.15 : 0,
    firstVolleyX2: has('elfScope'),
    breachRepairMul: has('resin') ? 1.5 : 1,
    fireFightMul: has('sand') ? 2 : 1,
    wardStack: has('turtleShell'),
    waterCharge: has('waterJar') ? 0.03 : 0,
    formationBurst: has('fan'),
  };
}
