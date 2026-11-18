import type { AttackShape } from '../utils/shapes';

/**
 * 패턴에 반응하는 카메라 (순수 로직, 테스트 가능).
 * 보스 상태를 보고 기본 카메라에 더할 값(거리·각도·바라보는 높이)을 계산한다. 부드럽게 따라가는 건 화면 쪽에서.
 *
 *   큰 기술 준비   → 뒤로 빠져서 범위가 보이게 (준비가 진행될수록 더)
 *   보스 점프      → 보스를 따라 위로 들림
 *   자세 붕괴      → 살짝 다가감 (반격 기회)
 *   무기 교체      → 낮은 각도에서 올려다봄 (위압감)
 */
export interface DirectorBoss {
  z: number;
  isStaggered: boolean;
  attack: {
    phase: 'telegraph' | 'active' | 'recovery';
    phaseProgress: number;
    parryable: boolean;
    shape: AttackShape;
  } | null;
  weaponSwap: { progress: number } | null;
}

export interface CameraBias {
  /** 카메라 거리에 더함 (+ = 뒤로 빠짐) */
  distance: number;
  /** 내려다보는 각도에 더함 (+ = 더 위에서, - = 낮게 올려다봄) */
  pitch: number;
  /** 바라보는 높이에 더함 */
  lookHeight: number;
}

/** 이 정도보다 넓게 닿는 공격이면 "큰 기술"로 보고 카메라를 뺀다 */
export const BIG_REACH = 120;
const MAX_PULL = 160;

/** 공격이 닿는 거리 (모양별) */
export function reachOf(shape: AttackShape): number {
  switch (shape.kind) {
    case 'sector':
      return shape.radius;
    case 'rect':
      return Math.min(shape.length, 420); // 조준선(경기장 끝까지)은 너무 길어서 제한
    case 'circle':
      return shape.radius;
  }
}

/** 큰 기술인가: 멀리 닿거나 패링이 안 되는 공격 */
export function isBigAttack(atk: NonNullable<DirectorBoss['attack']>): boolean {
  return reachOf(atk.shape) >= BIG_REACH || !atk.parryable;
}

export function cameraBias(b: DirectorBoss): CameraBias {
  const bias: CameraBias = { distance: 0, pitch: 0, lookHeight: 0 };
  const atk = b.attack;
  if (atk) {
    const reach = reachOf(atk.shape);
    if (isBigAttack(atk)) {
      const pull = Math.min(MAX_PULL, Math.max(40, reach - 80));
      const t = atk.phaseProgress;
      // 준비: 점점 빠짐(처음 느리게) / 판정: 다 빠짐 / 경직: 천천히 돌아옴
      const amount = atk.phase === 'telegraph' ? t * t : atk.phase === 'active' ? 1 : 1 - t;
      bias.distance += pull * amount;
    }
  }
  if (b.z > 0) {
    bias.lookHeight += b.z * 0.8;
    bias.pitch += Math.min(0.25, b.z / 600);
  }
  if (b.isStaggered) bias.distance -= 50;
  if (b.weaponSwap) {
    const s = Math.sin(b.weaponSwap.progress * Math.PI);
    bias.pitch -= 0.1 * s;
    bias.lookHeight += 25 * s;
  }
  return bias;
}
