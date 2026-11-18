import type { View } from './projection';

/**
 * 시점 상태 (순수 로직).
 *  - 플레이어 전환: 게이지를 써서 바꿈 (공격 적중·패링 성공으로 참)
 *  - 강제 전환: 보스 패턴이 바꾸고, 그 패턴이 끝날 때까지 잠금 (게이지 소모 없음)
 *  - 바뀌는 동안 0.3초 무방비 (무적 아님: 맞으면 그대로 피해)
 */
export interface DimensionConfig {
  gaugeMax: number;
  switchCost: number;
  gainOnHit: number;
  gainOnParry: number;
  /** 전환 중 무방비 시간 (ms) */
  switchMs: number;
}

export const DIMENSION: DimensionConfig = {
  gaugeMax: 100,
  switchCost: 40,
  gainOnHit: 8,
  gainOnParry: 25,
  switchMs: 300,
};

export type SwitchResult = 'switched' | 'noGauge' | 'locked' | 'busy';

export class DimensionState {
  view: View;
  gauge: number;
  /** 전환 중이면 남은 시간 (ms) */
  private switchLeftMs = 0;
  /** 강제 전환을 건 보스 공격 번호 (그 공격이 끝날 때까지 잠금) */
  private lockedBy: number | null = null;
  /** 시점별로 머문 시간 (학습용) */
  readonly timeIn: Record<View, number> = { '2d': 0, '3d': 0 };
  /** 플레이어가 스스로 바꾼 횟수 */
  switches = 0;

  constructor(
    start: View = '3d',
    private readonly cfg: DimensionConfig = DIMENSION,
  ) {
    this.view = start;
    this.gauge = cfg.switchCost; // 처음엔 한 번은 바꿀 수 있게
  }

  /** 전환 중 (무방비) */
  get switching(): boolean {
    return this.switchLeftMs > 0;
  }

  /** 전환 진행률 0~1 (화면 연출용), 전환 중이 아니면 1 */
  get switchProgress(): number {
    return this.switchLeftMs > 0 ? 1 - this.switchLeftMs / this.cfg.switchMs : 1;
  }

  get locked(): boolean {
    return this.lockedBy !== null;
  }

  get canSwitch(): boolean {
    return !this.locked && !this.switching && this.gauge >= this.cfg.switchCost;
  }

  /** 플레이어가 전환 요청 */
  requestSwitch(): SwitchResult {
    if (this.switching) return 'busy';
    if (this.locked) return 'locked';
    if (this.gauge < this.cfg.switchCost) return 'noGauge';
    this.gauge -= this.cfg.switchCost;
    this.switches += 1;
    this.begin(this.view === '2d' ? '3d' : '2d');
    return 'switched';
  }

  /** 보스가 강제로 전환 (같은 시점이어도 잠금은 걸림) */
  force(view: View, attackSerial: number): void {
    this.lockedBy = attackSerial;
    if (this.view !== view) this.begin(view);
  }

  /** 지금 보스 공격 번호가 잠금을 건 공격이 아니면 잠금 해제 */
  releaseIfDone(currentAttackSerial: number | null): void {
    if (this.lockedBy !== null && currentAttackSerial !== this.lockedBy) this.lockedBy = null;
  }

  onPlayerHit(): void {
    this.gauge = Math.min(this.cfg.gaugeMax, this.gauge + this.cfg.gainOnHit);
  }

  onParry(): void {
    this.gauge = Math.min(this.cfg.gaugeMax, this.gauge + this.cfg.gainOnParry);
  }

  update(dtMs: number): void {
    this.timeIn[this.view] += dtMs;
    if (this.switchLeftMs > 0) this.switchLeftMs = Math.max(0, this.switchLeftMs - dtMs);
  }

  /** 지금 더 오래 머문 시점 (기록이 거의 없으면 null) */
  get preferred(): View | null {
    const a = this.timeIn['2d'];
    const b = this.timeIn['3d'];
    if (a + b < 5000) return null;
    if (a > b * 1.3) return '2d';
    if (b > a * 1.3) return '3d';
    return null;
  }

  private begin(view: View): void {
    this.view = view; // 판정은 바로 새 시점 (화면은 switchProgress로 따라감)
    this.switchLeftMs = this.cfg.switchMs;
  }
}
