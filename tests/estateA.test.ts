import { describe, expect, it } from 'vitest';
import { Estate } from '../src/economy/Estate';
import { ACTIONS, ECONOMY, actionById } from '../src/economy/content';
import { WeekPlan } from '../src/estate/plan';
import { CARD_TEXT, discover, effectsOf, hasHidden, limitsOf } from '../src/estate/cards';
import { buildNewspaper, interviewFor } from '../src/estate/news';
import { dangers } from '../src/estate/dangers';
import { mulberry32 } from '../src/economy/strategies';

describe('결재 계획 (장부에 적기 / 취소)', () => {
  it('적어 두기만 하면 진짜 금고는 그대로, 미리보기에만 반영', () => {
    const e = new Estate();
    const p = new WeekPlan(e);
    expect(p.add('fountain')).toBe('ok');
    expect(e.gold).toBe(ECONOMY.startGold);
    expect(p.preview().gold).toBe(ECONOMY.startGold - 3000);
    expect(p.preview().suspicion).toBe(3);
  });

  it('같은 서류 두 번 X, 3칸 넘게 X', () => {
    const p = new WeekPlan(new Estate());
    p.add('fountain');
    expect(p.add('fountain')).toBe('already');
    p.add('chef');
    p.add('bard');
    expect(p.add('party')).toBe('limit');
  });

  it('빼면 칸이 다시 비고, 다른 서류를 적을 수 있음', () => {
    const p = new WeekPlan(new Estate());
    p.add('fountain'); p.add('chef'); p.add('bard');
    expect(p.remove('chef')).toEqual(['chef']);
    expect(p.ids).toEqual(['fountain', 'bard']);
    expect(p.add('party')).toBe('ok');
  });

  it('빼서 조건이 깨진 서류는 같이 빠짐 (빚내서 잔치 = 금고 3천 이하일 때만)', () => {
    const e = new Estate();
    e.gold = 6000;
    const p = new WeekPlan(e);
    expect(p.add('goldChest')).toBe('ok'); // 6000 → 1000
    expect(p.add('debtFeast')).toBe('ok'); // 1000 ≤ 3000
    expect(p.remove('goldChest')).toEqual(['goldChest', 'debtFeast']);
    expect(p.ids).toEqual([]);
  });

  it('서명(commit)해야 진짜 영지에 반영, 계획은 비워짐', () => {
    const e = new Estate();
    const p = new WeekPlan(e);
    p.add('secretaryLeave'); p.add('fountain');
    expect(p.commit()).toEqual(['secretaryLeave', 'fountain']);
    expect(e.gold).toBe(ECONOMY.startGold - 4500);
    expect(p.ids).toEqual([]);
    expect(e.thisWeek).toEqual(['secretaryLeave', 'fountain']);
  });
});

describe('카드 글', () => {
  it('모든 서류에 올린 사람·한마디·집사 말이 있음', () => {
    for (const a of ACTIONS) {
      const t = CARD_TEXT[a.id];
      expect(t.from.length > 0 && t.request.length > 0 && t.butler.length > 0).toBe(true);
    }
  });

  it('돌아오는 돈·던전 명성처럼 안 보이는 효과가 있는 서류는 숨은 효과가 있음', () => {
    for (const a of ACTIONS) if (a.returns || a.reputationMul || a.blocksPromo || a.dungeonClosed?.afterRep) expect(hasHidden(a.id)).toBe(true);
  });

  it('효과: 돈·의심·번영·구역 수치가 보이고, 반복 의심이 반영됨', () => {
    const f = effectsOf(actionById('fountain'));
    expect(f.map((x) => x.label)).toEqual(['금고', '매주 유지비', '의심', '번영', '던전 명성']);
    expect(effectsOf(actionById('party'), 6).find((x) => x.label === '의심')!.value).toBe('+6');
    expect(limitsOf(actionById('debtFeast')).includes('금고 3,000 이하일 때만')).toBe(true);
  });

  it('숨은 효과는 그 서류 덕에 돈이 들어오면 풀림, 집사 몫은 아님', () => {
    const e = new Estate();
    e.take('fountain');
    const r = e.endWeek();
    expect(discover(r, ['fountain'], new Set())).toEqual(['fountain']);
    expect(discover(r, ['fountain'], new Set(['fountain']))).toEqual([]);
    const e2 = new Estate();
    e2.take('railings');
    expect(discover(e2.endWeek(), ['railings'], new Set())).toEqual(['railings']);
    const e3 = new Estate();
    e3.take('renovate');
    expect(discover(e3.endWeek(), ['renovate'], new Set())).toEqual([]);
  });
});

describe('영지 신문', () => {
  it('분수대: 3,000 쓰고 그 주에 벌어들인 돈이 한 줄에, 인터뷰는 던전 사람', () => {
    const e = new Estate();
    e.take('secretaryLeave'); e.take('fountain');
    const r = e.endWeek();
    const n = buildNewspaper(r, ['secretaryLeave', 'fountain'], '꿀잠 영지', mulberry32(3));
    const f = n.rows.find((x) => x.action === 'fountain')!;
    expect(f.spent).toBe(3000);
    expect(f.earned).toBeGreaterThan(0);
    expect(f.district).toBe('dungeon');
    expect(f.interview.who.length).toBeGreaterThan(0);
    expect(n.headline).toBe('던전 분수, 모험가들의 새 명소로!');
    expect(n.rows[0].action).toBe('fountain'); // 번 돈 많은 순
    const s = n.rows.find((x) => x.action === 'secretaryLeave')!;
    expect(s.spent).toBe(1500);
    expect(s.earned).toBe(0);
    // 합계 = 정산 줄 합 − 쓴 돈
    expect(n.net).toBe(r.lines.reduce((a, l) => a + l.amount, 0) - 4500);
  });

  it('예전 결재의 여파도 줄로 나옴 (이번 주엔 쓴 돈 0)', () => {
    const e = new Estate();
    e.take('fountain');
    e.endWeek();
    const r2 = e.endWeek();
    const n = buildNewspaper(r2, [], '꿀잠 영지', mulberry32(1));
    const f = n.rows.find((x) => x.action === 'fountain')!;
    expect(f.spent).toBe(0);
    expect(f.earned).toBeGreaterThan(0);
  });

  it('인터뷰 이름은 다양함 (같은 구역 30번 → 서로 다른 사람 15명 이상)', () => {
    const rng = mulberry32(9);
    const names = new Set(Array.from({ length: 30 }, () => interviewFor('fountain', 'fountainRest', 'dungeon', rng).who));
    expect(names.size).toBeGreaterThanOrEqual(15);
  });

  it('마감을 넘기면 헤드라인이 왕실 주목', () => {
    const e = new Estate();
    e.week = 4;
    const r = e.endWeek();
    expect(r.deadline!.passed).toBe(false);
    expect(buildNewspaper(r, [], 'X 영지', mulberry32(1)).headline.includes('왕실')).toBe(true);
  });
});

describe('위험 알림', () => {
  it('처음: 4주차 보고까지 줄여야 할 금액', () => {
    const d = dangers(new Estate());
    expect(d[0].text.includes('4주차')).toBe(true);
    expect(d[0].text.includes((ECONOMY.startGold - 8000).toLocaleString())).toBe(true);
  });

  it('의심 80% 이상은 높음, 반복·집사 학습은 정보', () => {
    const e = new Estate();
    e.take('banquet');
    e.endWeek();
    e.take('banquet');
    e.suspicion = 85;
    const d = dangers(e);
    expect(d.some((x) => x.level === 'high' && x.text.includes('의심'))).toBe(true);
    expect(d.some((x) => x.level === 'info' && x.text.includes('2번'))).toBe(true);
    expect(d.some((x) => x.text.includes('집사가'))).toBe(true);
  });

  it('다시 못 하는 서류(분수대 1번 한정)는 집사 학습 경고 안 함', () => {
    const e = new Estate();
    e.take('fountain');
    expect(dangers(e).some((x) => x.text.includes('던전 분수'))).toBe(false);
  });

  it('마감 아래면 마감 경고 없음', () => {
    const e = new Estate();
    e.gold = 5000;
    expect(dangers(e).some((x) => x.text.includes('왕실 보고'))).toBe(false);
  });
});
