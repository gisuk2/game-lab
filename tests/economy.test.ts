import { describe, expect, it } from 'vitest';
import { Estate } from '../src/economy/Estate';
import { ACTIONS, ECONOMY, actionById } from '../src/economy/content';
import { idle, obviousWaste, planner, play, random, spamParty } from '../src/economy/strategies';

const lineOf = (e: Estate, pred: (label: string) => boolean) =>
  e.reports[e.reports.length - 1].lines.filter((l) => pred(l.label)).reduce((s, l) => s + l.amount, 0);
const rich = () => {
  const e = new Estate();
  e.gold = 999_999;
  return e;
};

describe('결재 서류', () => {
  it('돈은 바로 나가고, 의심도·번영도·유지비·구역 수치가 바뀜', () => {
    const e = new Estate();
    const g = e.gold;
    expect(e.take('renovate')).toBe('ok');
    const a = actionById('renovate');
    expect(e.gold).toBe(g - a.cost);
    expect(e.suspicion).toBe(a.suspicion);
    expect(e.upkeep).toBe(a.upkeep);
    expect(e.gauges.luxury).toBe(1); // 저택 서류 → 사치 소문 +1
  });

  it('한 주 3장, 같은 서류는 한 주 한 번, 잠긴 구역·돈 부족·횟수 초과 거절', () => {
    const e = rich();
    expect(e.take('banquet')).toBe('ok');
    expect(e.take('banquet')).toBe('already');
    e.take('party');
    e.take('bard');
    expect(e.take('renovate')).toBe('limit');
    expect(new Estate().take('festival')).toBe('locked');
    const poor = new Estate();
    poor.gold = 100;
    expect(poor.take('banquet')).toBe('noGold');
    const r = rich();
    for (let w = 0; w < 2; w++) {
      expect(r.take('renovate')).toBe('ok');
      r.endWeek();
      r.gold = 999_999;
    }
    expect(r.take('renovate')).toBe('usedUp');
  });

  it('조건 서류: 금고가 적을 때만 / 의심이 낮을 때만 / 구역 수치가 쌓여야', () => {
    const e = new Estate();
    expect(e.check('debtFeast')).toBe('condition');
    e.gold = ECONOMY.startGold > 3000 ? 3000 : e.gold;
    expect(e.check('debtFeast')).toBe('ok');
    const s = rich();
    s.suspicion = 25;
    expect(s.check('boldWaste')).toBe('condition');
    s.suspicion = 20;
    expect(s.check('boldWaste')).toBe('ok');
    const g = rich();
    expect(g.check('duelTourney')).toBe('condition');
    g.gauges.fun = 3;
    expect(g.check('duelTourney')).toBe('ok');
  });

  it('빚내서 잔치: 금고를 마이너스로 (파산을 앞당김)', () => {
    const e = new Estate();
    e.gold = 1000;
    e.take('debtFeast');
    expect(e.gold).toBe(1000 - actionById('debtFeast').debt!);
  });
});

describe('돌아오는 돈 (함정)', () => {
  it('delay주 뒤부터 weeks주 동안, 이유 태그와 함께 장부에 찍힘', () => {
    const e = rich();
    const a = actionById('artCollection'); // delay 2, weeks 3
    e.take('artCollection');
    const art = () => lineOf(e, (l) => l.includes('미술품'));
    e.endWeek();
    expect(art()).toBe(0);
    for (let k = 0; k < a.returns!.weeks; k++) {
      e.endWeek();
      expect(art()).toBeGreaterThan(0);
      expect(e.reports[e.reports.length - 1].lines.find((l) => l.label.includes('미술품'))!.reason).toBe('artPrice');
    }
    e.endWeek();
    expect(art()).toBe(0);
  });

  it('양날의 칼: 구역 수치가 높을수록 그 구역 함정이 커짐', () => {
    const low = rich();
    const high = rich();
    high.gauges.fun = 4;
    low.take('party');
    high.take('party');
    low.endWeek();
    high.endWeek();
    low.endWeek();
    high.endWeek();
    expect(lineOf(high, (l) => l.includes('술 파티'))).toBeGreaterThan(lineOf(low, (l) => l.includes('술 파티')) * 1.5);
  });

  it('술 파티 홍보는 던전으로 돌아오고, 경고문이 걸린 주에는 헛방, 휴업이면 0', () => {
    const normal = rich();
    normal.take('party');
    normal.endWeek();
    normal.endWeek();
    const promo = normal.reports[1].lines.find((l) => l.label.includes('술 파티'))!;
    expect(promo.district).toBe('dungeon');
    expect(promo.reason).toBe('promo');

    const blocked = rich();
    blocked.take('party');
    blocked.take('warningSigns');
    blocked.endWeek();
    blocked.endWeek();
    expect(lineOf(blocked, (l) => l.includes('술 파티'))).toBeLessThan(promo.amount * 0.5);

    const closed = rich();
    closed.take('party');
    closed.take('freeEntry');
    closed.endWeek();
    closed.endWeek();
    expect(lineOf(closed, (l) => l.includes('술 파티'))).toBe(0);
  });

  it('무료 입장: 휴업 동안 던전 수입 0, 끝나면 명성 상승', () => {
    const e = rich();
    const rep = e.reputation;
    e.take('freeEntry');
    const weeks = actionById('freeEntry').dungeonClosed!.weeks;
    for (let k = 0; k < weeks; k++) {
      expect(e.passiveIncome().find((l) => l.district === 'dungeon')!.amount).toBe(0);
      e.endWeek();
    }
    expect(e.reputation).toBeCloseTo(rep * actionById('freeEntry').dungeonClosed!.afterRep!, 6);
  });

  it('학습하는 집사: 같은 서류를 반복하면 돈을 벌어 옴 (최대 3회분), 비서 휴가로 초기화', () => {
    const e = rich();
    const butler = () => lineOf(e, (l) => l.startsWith('집사'));
    const cost = actionById('banquet').cost;
    const got: number[] = [];
    for (let i = 0; i < 5; i++) {
      e.gold = 999_999;
      e.take('banquet');
      e.endWeek();
      got.push(butler());
    }
    expect(got).toEqual([0, 1, 2, 3, 3].map((n) => Math.round(cost * ECONOMY.butlerRate * n)));
    expect(got[1]).toBeGreaterThan(0);
    e.gold = 999_999;
    e.take('secretaryLeave');
    e.take('banquet');
    e.endWeek();
    expect(butler()).toBe(0);
  });

  it('반복하면 의심이 더 오르고, 기부는 반복할수록 덜 씻김, 의심은 매주 조금 잊힘', () => {
    const e = new Estate();
    expect(e.suspicionDelta('banquet', 2)).toBeGreaterThan(e.suspicionDelta('banquet', 0) + 2);
    expect(Math.abs(e.suspicionDelta('donation', 2))).toBeLessThan(Math.abs(e.suspicionDelta('donation', 0)));
    e.suspicion = 20;
    e.endWeek();
    expect(e.suspicion).toBe(20 - ECONOMY.suspicionDecay);
    expect(e.suspicion).toBeLessThan(20);
  });
});

describe('마감·해금·승패', () => {
  it('월말 마감: 상한을 넘기면 왕실 관심 +1, 2가 되면 소환', () => {
    const e = new Estate();
    e.gold = 999_999;
    for (let w = 1; w <= 4; w++) e.endWeek();
    expect(e.royalAttention).toBe(1);
    expect(e.reports[3].deadline).toEqual({ cap: ECONOMY.deadlines[0].cap, passed: false });
    for (let w = 5; w <= 8; w++) e.endWeek();
    expect(e.status).toBe('summoned');
    const ok = new Estate();
    for (let w = 1; w <= 4; w++) {
      ok.gold = 0;
      ok.endWeek();
    }
    expect(ok.royalAttention).toBe(0);
  });

  it('파산 선고는 12주차 마지막 감찰에서만 (중간에 0원이어도 계속)', () => {
    const e = new Estate();
    e.gold = -5000;
    e.endWeek();
    expect(e.status).toBe('playing');
    const end = new Estate();
    end.week = ECONOMY.weeks;
    end.gold = -9000;
    end.endWeek();
    expect(end.status).toBe('bankrupt');
    const fail = new Estate();
    fail.week = ECONOMY.weeks;
    fail.endWeek();
    expect(fail.status).toBe('timeUp');
  });

  it('의심도 한계 = 태만죄, 번영도 한계 = 소환', () => {
    const c = new Estate();
    c.suspicion = ECONOMY.suspicionLimit + ECONOMY.suspicionDecay;
    c.endWeek();
    expect(c.status).toBe('caught');
    const p = new Estate();
    p.prosperity = ECONOMY.prosperityLimit;
    p.endWeek();
    expect(p.status).toBe('summoned');
  });

  it('해금: 연회·술 파티 2번 → 광장, 의심도 30 → 성당', () => {
    const e = rich();
    e.take('banquet');
    e.endWeek();
    expect(e.unlocked.has('square')).toBe(false);
    e.take('party');
    expect(e.endWeek().unlocked.includes('square')).toBe(true);
    const c = new Estate();
    c.suspicion = 30 + ECONOMY.suspicionDecay;
    expect(c.endWeek().unlocked.includes('chapel')).toBe(true);
  });

  it('복사본은 원본과 따로', () => {
    const e = rich();
    e.take('party');
    const c = e.clone();
    c.endWeek();
    c.take('bard');
    c.gauges.fun = 5;
    expect(e.week).toBe(1);
    expect(e.thisWeek).toEqual(['party']);
    expect(e.gauges.fun).toBe(1);
  });
});

describe('밸런스 (전략 봇)', () => {
  it('아무것도 안 함·한 가지 반복·대놓고 낭비는 실패', () => {
    expect(play(idle).status).toBe('summoned');
    expect(play(spamParty).status).not.toBe('bankrupt');
    expect(play(obviousWaste).status).toBe('caught');
  });
  it('무작위는 거의 못 이김 (300판 중 5% 이하)', () => {
    let wins = 0;
    for (let s = 1; s <= 300; s++) if (play(random, s).status === 'bankrupt') wins++;
    expect(wins / 300).toBeLessThanOrEqual(0.05);
  });
  it('내다보면 이길 수 있고, 함정 서류도 상황에 따라 고르며, 여러 서류를 씀', () => {
    const r = play(planner, 1);
    expect(r.status).toBe('bankrupt');
    const kinds = r.picks.flat().map((id) => ACTIONS.find((a) => a.id === id)!.kind);
    expect(kinds.filter((k) => k === '함정').length).toBeGreaterThanOrEqual(5);
    expect(new Set(r.picks.flat()).size).toBeGreaterThanOrEqual(10);
  });
});
