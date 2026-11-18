import { describe, expect, it } from 'vitest';
import { Estate } from '../src/economy/Estate';
import { ECONOMY } from '../src/economy/content';
import { incomeBreakdown, lastWeekMoney, statEffects, thisWeekMoney, upcoming } from '../src/app/money';
import { WeekPlan } from '../src/app/plan';
import { buildNewspaper } from '../src/app/news';
import { mulberry32 } from '../src/economy/strategies';

const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);

describe('기본 수입 공식', () => {
  it('공식으로 계산한 값 = 경제 모델의 기본 수입 (여러 상태)', () => {
    const states: ((e: Estate) => void)[] = [
      () => {},
      (e) => { e.prosperity = 57; e.gauges.fun = 3; e.gauges.luxury = 2; e.gauges.fame = 4; e.reputation = 1.35; },
      (e) => { e.take('freeEntry'); }, // 휴업
      (e) => { e.prosperity = 0; e.reputation = 0.6; },
    ];
    for (const f of states) {
      const e = new Estate();
      f(e);
      const mine = incomeBreakdown(e).map((l) => l.amount);
      expect(mine).toEqual(e.passiveIncome().map((l) => l.amount));
    }
  });

  it('요인이 보임: 번영 배율, 흥 단계, 휴업 표시', () => {
    const e = new Estate();
    e.prosperity = 60;
    e.gauges.fun = 2;
    const t = incomeBreakdown(e).find((l) => l.district === 'tavern')!;
    expect(t.factors.map((f) => f.label)).toEqual(['번영 60', '흥 2단계']);
    expect(t.factors[0].mul).toBeCloseTo(1.5);
    e.take('freeEntry');
    expect(incomeBreakdown(e).find((l) => l.district === 'dungeon')!.note).toBe('휴업 중: 0');
  });

  it('수치 설명: 번영 배율이 지금 값과 맞음', () => {
    const e = new Estate();
    e.prosperity = 36;
    expect(statEffects(e).pros.lines[0].includes('×1.30')).toBe(true);
    expect(statEffects(e).sus.lines.some((l) => l.includes(`−${ECONOMY.suspicionDecay}`))).toBe(true);
  });
});

describe('건물별 수지', () => {
  it('이번 주 예상 합계 = 서명하고 정산했을 때 실제 금고 변화', () => {
    for (const ids of [[], ['fountain'], ['party', 'chef', 'renovate'], ['freeEntry', 'goldChest']] as const) {
      const e = new Estate();
      e.take('fountain'); // 지난 결재 여파·유지비가 있는 상태로
      e.endWeek();
      const plan = new WeekPlan(e);
      for (const id of ids) plan.add(id);
      const predicted = thisWeekMoney(plan.preview(), plan.ids).reduce((s, b) => s + b.net, 0);
      const before = e.gold;
      plan.commit();
      e.endWeek();
      expect(predicted).toBe(e.gold - before);
    }
  });

  it('지난주 결과 합계 = 실제 금고 변화, 구역별로 나뉨 (분수는 던전)', () => {
    const e = new Estate();
    const before = e.gold;
    e.take('secretaryLeave');
    e.take('fountain');
    const r = e.endWeek();
    const b = lastWeekMoney(r, ['secretaryLeave', 'fountain'], e);
    expect(b.reduce((s, x) => s + x.net, 0)).toBe(e.gold - before);
    const dungeon = b.find((x) => x.district === 'dungeon')!;
    expect(dungeon.lines.map((l) => l.kind)).toEqual(['card', 'base', 'return', 'upkeep']);
    expect(dungeon.out).toBe(-3150);
  });

  it('앞으로 들어올 돈: 분수는 다음 두 주', () => {
    const e = new Estate();
    e.take('fountain');
    e.endWeek();
    const u = upcoming(e);
    expect(u.map((w) => w.week)).toEqual([2, 3]);
    expect(sum(u[0].items)).toBeGreaterThan(0);
  });
});

describe('신문 판정', () => {
  it('서류마다 순손익·앞으로 더 들어올 돈·실제 수치 변화', () => {
    const e = new Estate();
    const plan = new WeekPlan(e);
    plan.add('secretaryLeave');
    plan.add('fountain');
    const taken = plan.commit();
    const r = e.endWeek();
    const n = buildNewspaper(r, taken, 'X', mulberry32(1), { deltas: plan.lastDeltas, scheduled: e.scheduledLines });
    const f = n.rows.find((x) => x.action === 'fountain')!;
    expect(f.net).toBe(f.earned - 3000);
    expect(f.net).toBeLessThan(0);
    expect(f.laterWeeks).toBe(2);
    expect(f.later).toBeGreaterThan(0);
    expect(f.suspicion).toBe(3);
    expect(f.prosperity).toBe(1);
    expect(n.rows.find((x) => x.action === 'secretaryLeave')!.net).toBe(-1500);
  });
});
