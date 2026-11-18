import type { ActionId } from '../economy/content';
import type { Estate, TakeResult } from '../economy/Estate';

/**
 * 이번 주 결재 계획: 서명 전까지는 장부에 "적어 두기만" 함 → 자유롭게 적고 뺄 수 있음.
 * 미리보기 = 지금 영지를 복사해서 적어 둔 서류를 차례로 결재해 본 결과.
 * 서명(commit)할 때 진짜 영지에 반영.
 */
export class WeekPlan {
  ids: ActionId[] = [];

  constructor(private readonly base: Estate) {}

  /** 적어 둔 서류를 모두 결재했다고 치면 영지가 어떻게 되나 */
  preview(): Estate {
    const c = this.base.clone();
    for (const id of this.ids) c.take(id);
    return c;
  }

  has(id: ActionId): boolean {
    return this.ids.includes(id);
  }

  check(id: ActionId): TakeResult {
    if (this.has(id)) return 'already';
    return this.preview().check(id);
  }

  add(id: ActionId): TakeResult {
    const r = this.check(id);
    if (r === 'ok') this.ids.push(id);
    return r;
  }

  /** 빼기. 뺀 탓에 조건이 깨진 서류(예: 금고 3천 이하일 때만)도 같이 빠짐 → 빠진 목록 */
  remove(id: ActionId): ActionId[] {
    if (!this.has(id)) return [];
    const rest = this.ids.filter((x) => x !== id);
    const c = this.base.clone();
    const kept: ActionId[] = [];
    const dropped: ActionId[] = [id];
    for (const x of rest) (c.take(x) === 'ok' ? kept : dropped).push(x);
    this.ids = kept;
    return dropped;
  }

  /** 마지막 서명 때 서류마다 실제로 바뀐 의심·번영 (신문용) */
  lastDeltas: { id: ActionId; suspicion: number; prosperity: number }[] = [];

  /** 서명: 진짜 영지에 결재 (순서대로) */
  commit(): ActionId[] {
    const done: ActionId[] = [];
    this.lastDeltas = [];
    for (const id of this.ids) {
      const sus = this.base.suspicion;
      const pros = this.base.prosperity;
      if (this.base.take(id) !== 'ok') continue;
      done.push(id);
      this.lastDeltas.push({ id, suspicion: this.base.suspicion - sus, prosperity: this.base.prosperity - pros });
    }
    this.ids = [];
    return done;
  }
}
