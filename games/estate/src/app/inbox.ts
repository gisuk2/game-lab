import { ACTIONS, type ActionId } from '../economy/content';
import type { Estate } from '../economy/Estate';

/**
 * 결재함: 매주 구역에서 결재 요청이 올라옴 (장부로 들어오는 서류).
 * 같은 서류를 구역 안에서 직접 골라도 됨 — 결재함은 "이번 주 추천 + 거절할 수 있는 요청".
 * 고르는 규칙 (순수 함수, 시드 고정 → 테스트 가능):
 * - 열린 구역의 서류 중 지금 결재할 수 있는 것(ok)만
 * - 지난주에 올라왔던 서류는 이번 주엔 빼기 (다양하게)
 * - 대형·마무리 서류는 결재함에 안 올림 (구역에서 직접 찾게)
 */
export const INBOX_SIZE = 2;

export function weeklyInbox(estate: Estate, rng: () => number, lastWeek: readonly ActionId[] = []): ActionId[] {
  const pool = ACTIONS.filter(
    (a) => a.kind !== '대형' && a.kind !== '마무리' && !lastWeek.includes(a.id) && estate.check(a.id) === 'ok',
  ).map((a) => a.id);
  const out: ActionId[] = [];
  while (out.length < INBOX_SIZE && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
