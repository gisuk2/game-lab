import { describe, expect, it } from 'vitest';
import { aimAngleFor, cameraRelativeMove } from '../src/three/DomInput';

/** -0과 0을 같게 보도록 숫자로 비교 */
const expectVec = (v: { x: number; y: number }, x: number, y: number) => {
  expect(v.x).toBeCloseTo(x, 10);
  expect(v.y).toBeCloseTo(y, 10);
};

const UP = { x: 0, y: -1 }; // 카메라가 화면 위쪽(모델 y 감소)을 바라봄
const RIGHT = { x: 1, y: 0 };

describe('카메라 기준 이동', () => {
  it('W는 카메라가 보는 쪽, S는 반대쪽', () => {
    expectVec(cameraRelativeMove(1, 0, UP), 0, -1);
    expectVec(cameraRelativeMove(-1, 0, RIGHT), -1, 0);
  });

  it('D는 카메라 기준 오른쪽, A는 왼쪽', () => {
    expectVec(cameraRelativeMove(0, 1, UP), 1, 0); // 위를 볼 때 오른쪽 = +x
    expectVec(cameraRelativeMove(0, 1, RIGHT), 0, 1); // 오른쪽을 볼 때 오른쪽 = 아래(+y)
    expectVec(cameraRelativeMove(0, -1, UP), -1, 0);
  });
});

describe('공격·구르기 방향', () => {
  const base = { forward: UP, lockTarget: null, facing: 1.23 };

  it('락온 중이면 이동과 상관없이 대상 쪽', () => {
    const a = aimAngleFor(0, 0, { x: -1, y: 0 }, { ...base, lockTarget: { x: 0, y: 100 } });
    expect(a).toBeCloseTo(Math.PI / 2, 10);
  });

  it('락온이 아니면 이동하는 쪽', () => {
    expect(aimAngleFor(0, 0, { x: 1, y: 0 }, base)).toBeCloseTo(0, 10);
  });

  it('가만히 있으면 지금 보는 쪽 그대로', () => {
    expect(aimAngleFor(0, 0, { x: 0, y: 0 }, base)).toBe(1.23);
  });
});
