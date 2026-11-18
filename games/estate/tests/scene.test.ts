import { describe, expect, it } from 'vitest';
import { Estate } from '../src/economy/Estate';
import { planScene } from '../src/app/scene';
import { buildNewspaper } from '../src/app/news';
import { mulberry32 } from '../src/economy/strategies';

describe('구역 안 장면', () => {
  it('신문 인터뷰에 나온 사람이 그 구역에 실제로 있고, 같은 말을 함', () => {
    const e = new Estate();
    e.take('fountain');
    const r = e.endWeek();
    const paper = buildNewspaper(r, ['fountain'], 'X', mulberry32(4));
    const row = paper.rows.find((x) => x.action === 'fountain')!;
    const plan = planScene('dungeon', e, ['fountain'], paper, mulberry32(1));
    const v = plan.npcs.find((n) => n.interviewed)!;
    expect(`${v.role} ${v.name}`).toBe(row.interview.who);
    expect(v.line).toBe(row.interview.line);
  });

  it('지어 둔 시설이 보이고 (분수), 한 주짜리 행사(파티)는 그다음 주에만', () => {
    const e = new Estate();
    e.take('fountain');
    e.take('party');
    e.endWeek();
    expect(planScene('dungeon', e, ['fountain', 'party'], undefined, mulberry32(1)).props).toEqual(['fountain']);
    expect(planScene('tavern', e, ['fountain', 'party'], undefined, mulberry32(1)).props.includes('party')).toBe(true);
    expect(planScene('tavern', e, [], undefined, mulberry32(1)).props.includes('party')).toBe(false);
  });

  it('사람 수가 영지 상태를 따라감: 던전 휴업이면 관리인만, 흥이 높으면 주점이 북적', () => {
    const e = new Estate();
    e.take('freeEntry');
    const closed = planScene('dungeon', e, [], undefined, mulberry32(1));
    expect(closed.closed).toBe(true);
    expect(closed.npcs.length).toBe(2); // 관리인 + 1
    const quiet = planScene('tavern', new Estate(), [], undefined, mulberry32(1)).npcs.length;
    const busy = new Estate();
    busy.gauges.fun = 4;
    expect(planScene('tavern', busy, [], undefined, mulberry32(1)).npcs.length).toBeGreaterThan(quiet);
  });

  it('지난주 이 구역에 돈이 들어온 이유가 대사에 섞임 (분수 → 쉼터 얘기)', () => {
    const e = new Estate();
    e.take('fountain');
    e.endWeek();
    const lines = planScene('dungeon', e, ['fountain'], undefined, mulberry32(2)).npcs.map((n) => n.line);
    expect(lines.some((l) => l.includes('분수') || l.includes('쉼터') || l.includes('쉬'))).toBe(true);
  });
});
