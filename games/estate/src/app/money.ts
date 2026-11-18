import { ACTIONS, DISTRICTS, ECONOMY, actionById, type ActionId, type DistrictId } from '../economy/content';
import type { Estate, WeekReport } from '../economy/Estate';

/**
 * 돈이 어디서 오고 어디로 가는지 (장부 '금고' 탭, 위쪽 띠 설명).
 * 숫자는 전부 Estate의 계산과 같아야 함 (테스트로 확인).
 */
export interface Factor {
  /** 무엇 때문에 */
  label: string;
  /** ×1.17 같은 배율 */
  mul: number;
}
export interface IncomeLine {
  district: DistrictId;
  label: string;
  base: number;
  factors: Factor[];
  amount: number;
  note?: string;
}

/** 매주 기본 수입 = 기본값 × 요인들 (passiveIncome과 같은 값) */
export function incomeBreakdown(e: Estate): IncomeLine[] {
  const m = e.prosperityMul;
  const per = ECONOMY.gaugeIncomePer;
  const g = e.gauges;
  const lines: IncomeLine[] = [
    { district: 'manor', label: '저택 임대료', base: ECONOMY.income.manorRent, factors: [{ label: `사치 ${g.luxury}단계`, mul: 1 + g.luxury * per }], amount: 0 },
    { district: 'tavern', label: '주점 세금', base: ECONOMY.income.tavern, factors: [{ label: `번영 ${Math.round(e.prosperity)}`, mul: m }, { label: `흥 ${g.fun}단계`, mul: 1 + g.fun * per }], amount: 0 },
    {
      district: 'dungeon', label: '던전 입장료', base: ECONOMY.income.dungeon,
      factors: [{ label: '던전 명성', mul: e.reputation }, { label: `번영 ${Math.round(e.prosperity)}`, mul: m }, { label: `명성 ${g.fame}단계`, mul: 1 + g.fame * per }],
      amount: 0, note: e.dungeonOpen ? undefined : '휴업 중: 0',
    },
  ];
  for (const l of lines) l.amount = l.note ? 0 : Math.round(l.base * l.factors.reduce((s, f) => s * f.mul, 1));
  return lines;
}

/** 위쪽 띠 수치가 바꾸는 것 (설명 창) */
export function statEffects(e: Estate): Record<'pros' | 'sus' | 'royal', { title: string; lines: string[] }> {
  const step = Math.round(ECONOMY.prosperityDiv / 10);
  return {
    pros: {
      title: `번영도 ${Math.round(e.prosperity)} / ${ECONOMY.prosperityLimit}`,
      lines: [
        `주점 세금·던전 입장료·서류의 여파 ×${e.prosperityMul.toFixed(2)} (번영 ${step}마다 +10%)`,
        `${ECONOMY.prosperityLimit}이 되면 영지가 너무 잘나가 왕도로 소환 (패배)`,
        '올리는 것: 술 파티·축제·외상 탕감 같은 인기 있는 일',
        '내리는 것: 무서운 경고문, 던전 리모델링',
      ],
    },
    sus: {
      title: `감찰관의 의심 ${Math.round(e.suspicion)} / ${ECONOMY.suspicionLimit}`,
      lines: [
        `${ECONOMY.suspicionLimit}이 되면 태만죄 (패배)`,
        `매주 저절로 −${ECONOMY.suspicionDecay}`,
        `같은 서류를 반복하면 한 번 할 때마다 +${ECONOMY.repeatSuspicion}씩 더`,
        '내리는 것: 성당 기부 (반복하면 효과가 줄어듦)',
        `의심 30 이상이면 성당이 열림`,
      ],
    },
    royal: {
      title: `왕실 관심 ${e.royalAttention} / ${ECONOMY.royalAttentionLimit}`,
      lines: [
        `매달 말 왕실 보고: ${ECONOMY.deadlines.map((d) => `${d.week}주차 금고 ${d.cap.toLocaleString()} 이하`).join(', ')}`,
        '기준을 넘기면 관심 +1',
        `${ECONOMY.royalAttentionLimit}이 되면 왕도로 소환 (패배)`,
      ],
    },
  };
}

export type MoneyKind = 'base' | 'return' | 'butler' | 'card' | 'upkeep';
export interface MoneyLine {
  label: string;
  amount: number;
  kind: MoneyKind;
}
export interface BuildingMoney {
  district: DistrictId;
  name: string;
  lines: MoneyLine[];
  in: number;
  out: number;
  net: number;
}

/** 서류별 유지비를 구역으로 나눔 */
function upkeepByDistrict(e: Estate): Map<DistrictId, number> {
  const m = new Map<DistrictId, number>();
  for (const a of ACTIONS) {
    const n = e.uses[a.id] ?? 0;
    if (a.upkeep && n) m.set(a.district, (m.get(a.district) ?? 0) + a.upkeep * n);
  }
  return m;
}

function finish(map: Map<DistrictId, MoneyLine[]>): BuildingMoney[] {
  return DISTRICTS.filter((d) => map.has(d.id))
    .map((d) => {
      const lines = map.get(d.id)!.filter((l) => l.amount !== 0);
      const inn = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
      const out = lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
      return { district: d.id, name: d.name, lines, in: inn, out, net: inn + out };
    })
    .filter((b) => b.lines.length > 0);
}

/**
 * 이번 주 예상 (서명하면): 적어 둔 서류 비용 + 기본 수입 + 이번 주말 들어올 여파 − 유지비
 * @param preview 계획을 반영한 영지 (WeekPlan.preview())
 * @param planned 적어 둔 서류
 */
export function thisWeekMoney(preview: Estate, planned: readonly ActionId[]): BuildingMoney[] {
  const map = new Map<DistrictId, MoneyLine[]>();
  const push = (d: DistrictId, l: MoneyLine) => map.set(d, [...(map.get(d) ?? []), l]);
  for (const id of planned) {
    const a = actionById(id);
    push(a.district, { label: a.name, amount: -(a.cost + (a.debt ?? 0)), kind: 'card' });
  }
  for (const l of preview.passiveIncome()) push(l.district!, { label: l.label, amount: l.amount, kind: 'base' });
  for (const s of preview.scheduledLines.filter((q) => q.week === preview.week)) {
    const amount = s.promo ? Math.round(s.amount * preview.promoMulFor(preview.week)) : s.amount;
    push(s.district, { label: s.label, amount, kind: s.reason === 'butler' ? 'butler' : 'return' });
  }
  for (const [d, v] of upkeepByDistrict(preview)) push(d, { label: '유지비', amount: -v, kind: 'upkeep' });
  return finish(map);
}

/** 지난주 결과 (정산 줄 + 그 주 서류 비용 + 유지비를 구역별로) */
export function lastWeekMoney(report: WeekReport, taken: readonly ActionId[], e: Estate): BuildingMoney[] {
  const map = new Map<DistrictId, MoneyLine[]>();
  const push = (d: DistrictId, l: MoneyLine) => map.set(d, [...(map.get(d) ?? []), l]);
  for (const id of taken) {
    const a = actionById(id);
    push(a.district, { label: a.name, amount: -(a.cost + (a.debt ?? 0)), kind: 'card' });
  }
  for (const l of report.lines) {
    if (!l.district) continue; // 유지비 합계 줄은 아래에서 구역별로
    push(l.district, { label: l.label, amount: l.amount, kind: l.reason === 'butler' ? 'butler' : l.reason ? 'return' : 'base' });
  }
  const upkeepTotal = -(report.lines.find((l) => !l.district && l.label === '유지비')?.amount ?? 0);
  if (upkeepTotal > 0) for (const [d, v] of upkeepByDistrict(e)) push(d, { label: '유지비', amount: -v, kind: 'upkeep' });
  return finish(map);
}

/** 앞으로 들어올 돈 (다음 주부터, 주차별) */
export function upcoming(e: Estate): { week: number; items: { label: string; amount: number; district: DistrictId }[]; total: number }[] {
  const byWeek = new Map<number, { label: string; amount: number; district: DistrictId }[]>();
  for (const s of e.scheduledLines) {
    if (s.week <= e.week - 1) continue;
    byWeek.set(s.week, [...(byWeek.get(s.week) ?? []), { label: s.label, amount: s.amount, district: s.district }]);
  }
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items, total: items.reduce((x, i) => x + i.amount, 0) }));
}
