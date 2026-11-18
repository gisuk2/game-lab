import { describe, expect, it } from 'vitest';
import { MEMO, TUTORIAL, TUTORIAL_INBOX, TutorialRunner, fillText } from '../src/estate/tutorial';
import { weeklyInbox, INBOX_SIZE } from '../src/estate/inbox';
import { Estate } from '../src/economy/Estate';
import { actionById } from '../src/economy/content';
import { mulberry32 } from '../src/economy/strategies';

describe('튜토리얼 진행', () => {
  it('지정된 행동만 받고, 다른 행동은 무시', () => {
    const t = new TutorialRunner();
    expect(t.step!.wait).toBe('name');
    expect(t.handle('next')).toBe(false);
    expect(t.handle('openLedger')).toBe(false);
    expect(t.index).toBe(0);
    expect(t.handle('name')).toBe(true);
    expect(t.index).toBe(1);
    expect(t.allows('next')).toBe(true);
    expect(t.allows('sign')).toBe(false);
  });

  it('행동을 기다리는 단계에는 비출 대상이 있음', () => {
    for (const s of TUTORIAL) if (s.wait && s.wait !== 'next') expect(typeof s.target).toBe('string');
  });

  it('서류 열기는 그 서류만: 분수대 차례에 다른 서류를 열면 무시', () => {
    const i = TUTORIAL.findIndex((s) => s.wait === 'open:fountain');
    const t = new TutorialRunner();
    t.index = i;
    expect(t.handle('open:secretaryLeave')).toBe(false);
    expect(t.handle('open:fountain')).toBe(true);
  });

  it('승인 단계에선 반려가 잠김 (평범한 서류·분수대 둘 다)', () => {
    const idx = TUTORIAL.map((s, i) => (s.wait === 'approve' ? i : -1)).filter((i) => i >= 0);
    expect(idx.length).toBe(2);
    for (const i of idx) {
      const t = new TutorialRunner();
      t.index = i;
      expect(t.handle('reject')).toBe(false);
      expect(t.handle('approve')).toBe(true);
    }
  });

  it('대본 순서: 속마음 글 → 장부 결재함 → 평범한 서류 → 분수대 → 주점 → 서명 → 집사 신문 → 가 보기로 던전', () => {
    const waits = TUTORIAL.filter((s) => s.wait).map((s) => s.wait);
    expect(waits).toEqual([
      'name', 'memo', 'openLedger', 'open:secretaryLeave', 'approve', 'open:fountain', 'approve',
      'closeLedger', 'enterTavern', 'leaveDistrict', 'openLedger', 'sign', 'openButler', 'enterDungeon',
    ]);
  });

  it('던전에는 신문의 [가 보기]로 감', () => {
    expect(TUTORIAL.find((s) => s.wait === 'enterDungeon')!.target).toBe('news-goto-fountain');
  });

  it('속마음은 한 장: 하나씩 넘기는 독백 대신 글 단계 하나 + 목표 3개', () => {
    expect(TUTORIAL.filter((s) => s.show === 'memo').length).toBe(1);
    const memoAt = TUTORIAL.findIndex((s) => s.show === 'memo');
    expect(TUTORIAL[memoAt - 1].text.includes('잘 부탁하네')).toBe(true);
    expect(MEMO.goals.length).toBe(3);
    expect(MEMO.body.includes('12주')).toBe(true);
  });

  it('결재 3칸을 설명하는 단계가 있음', () => {
    expect(TUTORIAL.some((s) => s.target === 'ledger-slots' && s.text.includes('세 건'))).toBe(true);
  });

  it('끝까지 가면 모든 행동 허용', () => {
    const t = new TutorialRunner();
    for (const s of TUTORIAL) t.handle(s.wait ?? 'next');
    expect(t.done).toBe(true);
    expect(t.allows('sign')).toBe(true);
  });

  it('영지 이름이 대사에 들어감', () => {
    expect(fillText(TUTORIAL[1].text, '느긋한 바람 영지').includes('느긋한 바람 영지')).toBe(true);
  });
});

describe('튜토리얼 반전이 경제 모델과 맞음', () => {
  it('1주차 결재함 두 장을 승인하고 서명하면: 서명 전엔 줄고, 2주차엔 오히려 늘고, 분수대 여파가 찍힘', () => {
    const e = new Estate();
    const start = e.gold;
    for (const id of TUTORIAL_INBOX) expect(e.take(id)).toBe('ok');
    expect(e.gold).toBeLessThan(start);
    const costs = TUTORIAL_INBOX.reduce((s, id) => s + actionById(id).cost, 0);
    const r = e.endWeek();
    expect(e.gold).toBeGreaterThan(start); // 반전
    // 장부 '지난주 정산' 합계(서류 비용 포함)도 + → 실패 도장
    expect(r.lines.reduce((s, l) => s + l.amount, 0) - costs).toBeGreaterThan(0);
    const line = r.lines.find((l) => l.reason === 'fountainRest');
    expect(line && line.amount > 0).toBe(true);
    expect(line!.district).toBe('dungeon');
  });
});

describe('결재함', () => {
  it('매주 결재 가능한 서류만 2건, 겹치지 않음, 대형·마무리는 안 올라옴', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const e = new Estate();
      const box = weeklyInbox(e, mulberry32(seed));
      expect(box.length).toBe(INBOX_SIZE);
      expect(new Set(box).size).toBe(box.length);
      for (const id of box) {
        expect(e.check(id)).toBe('ok');
        expect(['대형', '마무리'].includes(actionById(id).kind)).toBe(false);
      }
    }
  });

  it('지난주에 올라온 서류는 이번 주에 다시 안 올라옴', () => {
    const e = new Estate();
    const last = weeklyInbox(e, mulberry32(7));
    for (let seed = 1; seed <= 30; seed++) for (const id of weeklyInbox(e, mulberry32(seed), last)) expect(last.includes(id)).toBe(false);
  });

  it('잠긴 구역 서류는 안 올라옴 (광장·성당은 처음에 잠김)', () => {
    const e = new Estate();
    for (let seed = 1; seed <= 40; seed++) for (const id of weeklyInbox(e, mulberry32(seed))) expect(['square', 'chapel'].includes(actionById(id).district)).toBe(false);
  });

  it('결재 가능한 서류가 없으면 빈 결재함', () => {
    const e = new Estate();
    e.take('chef'); e.take('bard'); e.take('railings'); // 3칸 다 씀
    expect(weeklyInbox(e, mulberry32(1)).length).toBe(0);
  });
});
