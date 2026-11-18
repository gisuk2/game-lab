import { describe, expect, it } from 'vitest';
import { BIG_REACH, cameraBias, isBigAttack, reachOf, type DirectorBoss } from '../src/three/cameraDirector';
import { RewindHistory, rewindIndex } from '../src/three/RewindHistory';
import type { AttackShape } from '../src/utils/shapes';

const calm: DirectorBoss = { z: 0, isStaggered: false, attack: null, weaponSwap: null };
const bigCircle = { kind: 'circle' as const, cx: 0, cy: 0, radius: 160 };
const smallSector = { kind: 'sector' as const, cx: 0, cy: 0, radius: 60, angle: 0, arcRad: 1 };
const atk = (phase: 'telegraph' | 'active' | 'recovery', phaseProgress: number, shape: AttackShape = bigCircle, parryable = true) => ({
  phase, phaseProgress, parryable, shape,
});

describe('패턴에 반응하는 카메라', () => {
  it('평소에는 아무것도 더하지 않는다', () => {
    expect(cameraBias(calm)).toEqual({ distance: 0, pitch: 0, lookHeight: 0 });
  });

  it('큰 기술: 준비가 진행될수록 더 뒤로 빠지고, 판정 때 가장 멀고, 경직 동안 돌아온다', () => {
    const early = cameraBias({ ...calm, attack: atk('telegraph', 0.2) }).distance;
    const late = cameraBias({ ...calm, attack: atk('telegraph', 0.9) }).distance;
    const hit = cameraBias({ ...calm, attack: atk('active', 0.5) }).distance;
    const back = cameraBias({ ...calm, attack: atk('recovery', 0.9) }).distance;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
    expect(hit).toBeGreaterThanOrEqual(late);
    expect(back).toBeLessThan(hit);
  });

  it('작은 패링 가능 기술은 카메라를 빼지 않고, 작아도 패링 불가면 뺀다', () => {
    expect(reachOf(smallSector)).toBeLessThan(BIG_REACH);
    expect(cameraBias({ ...calm, attack: atk('active', 0.5, smallSector, true) }).distance).toBe(0);
    expect(cameraBias({ ...calm, attack: atk('active', 0.5, smallSector, false) }).distance).toBeGreaterThan(0);
  });

  it('보스가 뛰어오르면 위로 들리고, 자세가 무너지면 다가가고, 무기 교체 때는 낮게 올려다본다', () => {
    const air = cameraBias({ ...calm, z: 120 });
    expect(air.lookHeight).toBeGreaterThan(0);
    expect(air.pitch).toBeGreaterThan(0);
    expect(cameraBias({ ...calm, isStaggered: true }).distance).toBeLessThan(0);
    expect(cameraBias({ ...calm, weaponSwap: { progress: 0.5 } }).pitch).toBeLessThan(0);
  });
});

describe('되감기 기록', () => {
  it('거꾸로 재생: 진행률 0은 마지막(죽은 순간), 1은 처음(되감기 지점)', () => {
    const h = new RewindHistory<number>();
    for (let i = 0; i < 10; i++) h.push(i);
    expect(h.frameAt(0)).toBe(9);
    expect(h.frameAt(1)).toBe(0);
    expect(h.frameAt(0.5)).toBe(rewindIndex(10, 0.5));
  });

  it('최대 개수를 넘으면 오래된 것부터 버리고, 비우면 아무것도 없다', () => {
    const h = new RewindHistory<number>(3);
    for (let i = 0; i < 5; i++) h.push(i);
    expect(h.length).toBe(3);
    expect(h.frameAt(1)).toBe(2);
    h.clear();
    expect(h.frameAt(0)).toBeNull();
  });

  it('진행률이 범위를 벗어나도 안전하다', () => {
    expect(rewindIndex(10, -1)).toBe(9);
    expect(rewindIndex(10, 2)).toBe(0);
  });
});

describe('isBigAttack', () => {
  it('멀리 닿거나 패링 불가면 큰 기술', () => {
    const base = { phase: 'active' as const, phaseProgress: 0 };
    expect(isBigAttack({ ...base, parryable: true, shape: { kind: 'circle', radius: 60 } as never })).toBe(false);
    expect(isBigAttack({ ...base, parryable: true, shape: { kind: 'circle', radius: 120 } as never })).toBe(true);
    expect(isBigAttack({ ...base, parryable: false, shape: { kind: 'circle', radius: 60 } as never })).toBe(true);
  });
});
