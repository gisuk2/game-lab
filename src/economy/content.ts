/**
 * 나태한 귀족의 영지 — 구역·구역 수치·결재 서류 (데모: 12주 = 한 분기, 약 10분).
 * 한 턴 = 1주. 수치는 전부 [추정] — scripts/sim-economy.ts 전략 비교로 조정.
 * 설계: docs/design/economy.md §4
 */

export type DistrictId = 'manor' | 'tavern' | 'dungeon' | 'square' | 'chapel';
/** 구역 수치: 그 구역 서류를 고를수록 오름 → 강한 서류가 열리고, 그 구역 함정도 세짐 (양날의 칼) */
export type GaugeId = 'luxury' | 'fun' | 'fame';
export type ActionId =
  | 'banquet' | 'artCollection' | 'renovate' | 'chef' | 'boldWaste' | 'secretaryLeave' | 'birthdayWeek'
  | 'party' | 'bard' | 'forgiveTabs' | 'debtFeast' | 'duelTourney'
  | 'fountain' | 'freeEntry' | 'warningSigns' | 'railings' | 'goldChest' | 'remodel'
  | 'festival' | 'statue'
  | 'donation';

/** 서류 유형 (설계 문서 §4.4) */
export type Kind = '손해' | '함정' | '상쇄' | '세탁' | '대형' | '마무리';

/** 돌아오는 돈의 이유 (구역 화면에서 대사로 보여줄 태그) */
export type Reason =
  | 'gifts' | 'artPrice' | 'recipe' | 'promo' | 'fountainRest' | 'chestRumor' | 'merchants' | 'gratitude' | 'tourists' | 'butler';

export interface ActionDef {
  id: ActionId;
  district: DistrictId;
  name: string;
  kind: Kind;
  /** 바로 나가는 돈 */
  cost: number;
  /** 매주 나가는 유지비 (영구) */
  upkeep?: number;
  suspicion: number;
  prosperity: number;
  /** 구역 수치 변화 (없으면 자기 구역 수치 +1) */
  gauge?: Partial<Record<GaugeId, number>>;
  /**
   * 돌아오는 돈: delay주 뒤부터 weeks주 동안 매주 perWeek.
   * scaleBy: 이 구역 수치 1당 scalePer만큼 커짐 (양날의 칼). promo: 던전이 손님을 받을 때만 (휴업·경고문이면 줄어듦)
   */
  returns?: { perWeek: number; weeks: number; delay: number; reason: Reason; scaleBy?: GaugeId; scalePer?: number; promo?: boolean };
  /** 던전 명성 배율 (던전 수입에 곱해짐) */
  reputationMul?: number;
  /** 던전 휴업 (입장료 없음) n주. afterRep: 끝나면 명성 배율 (무료 입장 = 소문 함정) */
  dungeonClosed?: { weeks: number; afterRep?: number };
  /** 이번 주·다음 주 던전 홍보 효과를 줄임 (경고문) */
  blocksPromo?: boolean;
  /** 금고에서 바로 빠지는 빚 (빚내서 잔치) */
  debt?: number;
  /** 비서 휴가: 집사의 학습 초기화 */
  resetsButler?: boolean;
  maxUses?: number;
  /** 결재 조건 */
  requires?: { goldMax?: number; goldMin?: number; suspicionMax?: number; gauge?: [GaugeId, number] };
  flavor: string;
}

export interface DistrictDef {
  id: DistrictId;
  name: string;
  open: boolean;
  gauge?: GaugeId;
  unlockText?: string;
}

export const GAUGE_NAMES: Record<GaugeId, string> = { luxury: '사치 소문', fun: '흥', fame: '명성' };
export const GAUGE_MAX = 5;

export const DISTRICTS: readonly DistrictDef[] = [
  { id: 'manor', name: '저택', open: true, gauge: 'luxury' },
  { id: 'tavern', name: '주점', open: true, gauge: 'fun' },
  { id: 'dungeon', name: '던전 입구', open: true, gauge: 'fame' },
  { id: 'square', name: '광장', open: false, unlockText: '연회·술 파티를 합쳐 2번' },
  { id: 'chapel', name: '성당', open: false, unlockText: '의심도 30 이상' },
];

export const ACTIONS: readonly ActionDef[] = [
  // ── 저택 (사치 소문)
  { id: 'banquet', district: 'manor', name: '호화 연회', kind: '함정', cost: 2400, suspicion: 4, prosperity: 2,
    returns: { perWeek: 1100, weeks: 1, delay: 1, reason: 'gifts', scaleBy: 'luxury', scalePer: 0.2 }, flavor: '귀족들이 답례품을 들고 온다' },
  { id: 'artCollection', district: 'manor', name: '미술품 수집', kind: '함정', cost: 3500, suspicion: 2, prosperity: 0,
    returns: { perWeek: 700, weeks: 3, delay: 2, reason: 'artPrice' }, flavor: '그림값이 오른다는 소문…' },
  { id: 'renovate', district: 'manor', name: '저택 개축', kind: '손해', cost: 4500, upkeep: 500, suspicion: 7, prosperity: 0, maxUses: 2,
    flavor: '쓸데없이 큰 방이 늘어난다' },
  { id: 'chef', district: 'manor', name: '전속 요리사', kind: '함정', cost: 1000, upkeep: 400, suspicion: 1, prosperity: 1, maxUses: 1,
    returns: { perWeek: 600, weeks: 4, delay: 1, reason: 'recipe' }, flavor: '요리사가 주점에 레시피를 판다' },
  { id: 'boldWaste', district: 'manor', name: '대담한 낭비', kind: '손해', cost: 4000, suspicion: 12, prosperity: 0,
    requires: { suspicionMax: 20 }, flavor: '의심받지 않을 때만 가능한 과감함' },
  { id: 'secretaryLeave', district: 'manor', name: '비서에게 휴가', kind: '상쇄', cost: 1500, suspicion: 2, prosperity: 0, gauge: {},
    resetsButler: true, maxUses: 2, flavor: '비서가 없으면 아무도 깊은 뜻을 읽지 못한다' },
  { id: 'birthdayWeek', district: 'manor', name: '일주일 생일 연회', kind: '대형', cost: 9000, suspicion: 6, prosperity: 4,
    returns: { perWeek: 1500, weeks: 1, delay: 1, reason: 'gifts' }, requires: { gauge: ['luxury', 3] }, maxUses: 1, flavor: '일주일 내내 먹고 마신다' },
  // ── 주점 (흥)
  { id: 'party', district: 'tavern', name: '공짜 술 파티', kind: '함정', cost: 2000, suspicion: 2, prosperity: 3,
    returns: { perWeek: 1300, weeks: 2, delay: 1, reason: 'promo', scaleBy: 'fun', scalePer: 0.25, promo: true }, flavor: '소문이 던전까지 퍼진다' },
  { id: 'bard', district: 'tavern', name: '음유시인 고용', kind: '함정', cost: 800, upkeep: 250, suspicion: 1, prosperity: 2, maxUses: 1,
    reputationMul: 1.1, flavor: '영지 노래가 퍼진다' },
  { id: 'forgiveTabs', district: 'tavern', name: '외상 탕감', kind: '손해', cost: 2500, suspicion: 0, prosperity: 5,
    flavor: '주민들이 영주를 칭송한다' },
  { id: 'debtFeast', district: 'tavern', name: '빚내서 잔치', kind: '마무리', cost: 0, debt: 6000, suspicion: 3, prosperity: 2,
    requires: { goldMax: 3000 }, maxUses: 1, flavor: '돈이 없을 때만 가능한 잔치' },
  { id: 'duelTourney', district: 'tavern', name: '주점 결투 대회', kind: '대형', cost: 7000, suspicion: 3, prosperity: 4,
    returns: { perWeek: 1200, weeks: 1, delay: 1, reason: 'promo', promo: true }, requires: { gauge: ['fun', 3] }, maxUses: 1, flavor: '우승 상금이 어마어마하다' },
  // ── 던전 입구 (명성)
  { id: 'fountain', district: 'dungeon', name: '던전 분수', kind: '함정', cost: 3000, upkeep: 150, suspicion: 3, prosperity: 1, maxUses: 1,
    returns: { perWeek: 900, weeks: 3, delay: 1, reason: 'fountainRest', scaleBy: 'fame', scalePer: 0.15 }, flavor: '쓸데없이 화려한 분수' },
  { id: 'freeEntry', district: 'dungeon', name: '무료 입장', kind: '함정', cost: 0, suspicion: 3, prosperity: 2,
    dungeonClosed: { weeks: 2, afterRep: 1.35 }, flavor: '입장료를 안 받는다. 그다음은…?' },
  { id: 'warningSigns', district: 'dungeon', name: '무서운 경고문', kind: '상쇄', cost: 1200, suspicion: 6, prosperity: -2, gauge: { fame: -1 },
    reputationMul: 0.75, blocksPromo: true, maxUses: 2, flavor: '모험가가 줄고, 홍보도 헛방' },
  { id: 'railings', district: 'dungeon', name: '안전 난간', kind: '손해', cost: 2500, suspicion: 0, prosperity: 0, gauge: { fame: -1 },
    reputationMul: 0.85, maxUses: 2, flavor: '스릴이 없어진다 (그럴듯해서 안 수상)' },
  { id: 'goldChest', district: 'dungeon', name: '보물 상자에 진짜 금화', kind: '함정', cost: 5000, suspicion: 4, prosperity: 1, maxUses: 2,
    returns: { perWeek: 2000, weeks: 3, delay: 1, reason: 'chestRumor' }, flavor: '돈을 던전에 버린다' },
  { id: 'remodel', district: 'dungeon', name: '던전 리모델링 (한 달 휴업)', kind: '대형', cost: 6000, suspicion: 2, prosperity: -1, gauge: {},
    dungeonClosed: { weeks: 4 }, requires: { gauge: ['fame', 3] }, maxUses: 1, flavor: '공사 중. 손님이 없다' },
  // ── 광장 (해금)
  { id: 'festival', district: 'square', name: '축제', kind: '함정', cost: 5000, suspicion: 0, prosperity: 6, gauge: { fun: 1 },
    returns: { perWeek: 2800, weeks: 2, delay: 1, reason: 'merchants' }, flavor: '상인들이 몰려온다' },
  { id: 'statue', district: 'square', name: '영주 동상', kind: '손해', cost: 6500, upkeep: 300, suspicion: 6, prosperity: 0, gauge: { luxury: 1 }, maxUses: 1,
    returns: { perWeek: 300, weeks: 6, delay: 2, reason: 'tourists' }, flavor: '거대하고 쓸모없다 (관광객이 조금…)' },
  // ── 성당 (해금)
  { id: 'donation', district: 'chapel', name: '기부', kind: '세탁', cost: 3000, suspicion: -15, prosperity: 1, gauge: {},
    returns: { perWeek: 600, weeks: 1, delay: 1, reason: 'gratitude' }, flavor: '의심을 씻는다 (반복하면 덜 씻김)' },
];

export const ECONOMY = {
  weeks: 12,
  startGold: 15000,
  actionsPerWeek: 3,
  /** 기본 주간 수입 */
  income: { manorRent: 700, tavern: 800, dungeon: 2200 },
  /** 번영도 → 수입 배율 1 + prosperity / prosperityDiv */
  prosperityDiv: 120,
  startProsperity: 20,
  /** 구역 수치 1당 그 구역 기본 수입 증가 */
  gaugeIncomePer: 0.12,
  prosperityLimit: 100,
  suspicionLimit: 100,
  suspicionDecay: 4,
  butlerRate: 0.3,
  butlerMaxUses: 3,
  repeatSuspicion: 2,
  donationDecay: 0.6,
  reputationMin: 0.4,
  reputationMax: 3,
  /** 경고문이 걸린 주의 홍보 효과 배율 */
  blockedPromoMul: 0.25,
  /** 월말 마감 (주차 → 금고 상한). 넘기면 왕실 관심 +1 */
  deadlines: [
    { week: 4, cap: 8000 },
    { week: 8, cap: 4500 },
  ],
  /** 왕실 관심이 이만큼이면 소환 */
  royalAttentionLimit: 2,
} as const;

export const actionById = (id: ActionId): ActionDef => ACTIONS.find((a) => a.id === id)!;
export const districtOf = (id: DistrictId): DistrictDef => DISTRICTS.find((d) => d.id === id)!;
