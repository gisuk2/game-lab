import { describe, expect, it } from 'vitest';
import { BOSS_FALL_MS, BOSS_HEIGHT, SHOULDER_H, bossBodyPose, type BossBodyInput } from '../src/entities/boss/bossBodyPose';
import { MANNEQUIN_HEIGHT } from '../src/three/Mannequin';
import type { WeaponPose } from '../src/entities/boss/weaponPose';

const wp = (wa: number, extra: Partial<WeaponPose> = {}): WeaponPose => ({ wa, hand: 30, len: 58, glow: false, raised: false, axis: 0, ...extra });
const base: BossBodyInput = {
  state: 'approach', stateMs: 0, facing: 0, z: 0, moveRatio: 0, walkPhase: 0, timeMs: 0,
  weapon: 'greatsword', pose: wp(1.1), attack: null, lookRel: 0, targetDist: 300,
};
type Atk = NonNullable<BossBodyInput['attack']>;
const atk = (phase: Atk['phase'], t: number, parryable = true, ranged = false): Atk => ({ phase, phaseProgress: t, parryable, ranged });

describe('보스 몸 (거대 관절 로봇)', () => {
  it('키가 플레이어의 4~5배', () => {
    const ratio = BOSS_HEIGHT / MANNEQUIN_HEIGHT;
    expect(ratio).toBeGreaterThanOrEqual(4);
    expect(ratio).toBeLessThanOrEqual(5);
  });

  it('팔 방향 + 몸 비틀기 = 무기 방향 (2D weaponPose와 어긋나지 않음)', () => {
    for (const [phase, t] of [['telegraph', 0.5], ['active', 0.3], ['recovery', 0.8]] as const) {
      const p = bossBodyPose({ ...base, state: phase, pose: wp(0.9), attack: atk(phase, t) });
      expect(p.armR.yaw + p.twist).toBeCloseTo(0.9, 6);
    }
  });

  it('준비 동작: 무기를 점점 높이 들고 몸을 낮춘다', () => {
    const at = (t: number) => bossBodyPose({ ...base, state: 'telegraph', pose: wp(1.4), attack: atk('telegraph', t) });
    expect(at(1).armR.pitch).toBeGreaterThan(at(0.5).armR.pitch);
    expect(at(0.5).armR.pitch).toBeGreaterThan(at(0).armR.pitch);
    expect(at(1).crouch).toBeGreaterThan(at(0).crouch);
  });

  it('강패턴(패링 불가) 준비는 더 깊이 낮추고 눈이 더 밝다', () => {
    const normal = bossBodyPose({ ...base, state: 'telegraph', attack: atk('telegraph', 1, true) });
    const heavy = bossBodyPose({ ...base, state: 'telegraph', attack: atk('telegraph', 1, false) });
    expect(heavy.crouch).toBeGreaterThan(normal.crouch);
    expect(heavy.eye).toBeGreaterThan(normal.eye);
  });

  it('판정 순간 앞으로 숙이고 무기 끝이 바닥 가까이로', () => {
    const tele = bossBodyPose({ ...base, state: 'telegraph', attack: atk('telegraph', 1) });
    const act = bossBodyPose({ ...base, state: 'active', attack: atk('active', 0.5) });
    expect(act.lean).toBeGreaterThan(tele.lean);
    expect(act.armR.pitch).toBeLessThan(tele.armR.pitch);
  });

  it('치켜드는 기술(내려찍기 등)은 두 팔을 머리 위로', () => {
    const p = bossBodyPose({ ...base, weapon: 'hammer', state: 'telegraph', pose: wp(-1.5, { raised: true }), attack: atk('telegraph', 1, false) });
    expect(p.armR.pitch).toBeGreaterThan(2.5);
    expect(p.armL.pitch).toBeGreaterThan(2.5);
    expect(p.lean).toBeLessThan(0); // 뒤로 젖힘
  });

  it('사격: 총구를 플레이어에게 겨눈다 (멀수록 수평에 가깝게)', () => {
    const near = bossBodyPose({ ...base, weapon: 'gun', state: 'telegraph', pose: wp(0), attack: atk('telegraph', 1, true, true), targetDist: 150 });
    const far = bossBodyPose({ ...base, weapon: 'gun', state: 'telegraph', pose: wp(0), attack: atk('telegraph', 1, true, true), targetDist: 600 });
    expect(far.armR.pitch).toBeGreaterThan(near.armR.pitch);
    expect(far.armR.pitch).toBeLessThan(Math.PI / 2);
    expect(far.armR.pitch).toBeGreaterThan(Math.atan2(600, SHOULDER_H) - 0.05); // 바닥이 아니라 가슴 높이를 겨눔
  });

  it('쌍검·맨손: 왼팔은 조준축을 기준으로 대칭', () => {
    const p = bossBodyPose({ ...base, weapon: 'twinblades', state: 'active', pose: wp(0.7, { axis: 0.2 }), attack: atk('active', 0.5) });
    expect(p.armL.yaw + p.twist).toBeCloseTo(2 * 0.2 - 0.7, 6);
  });

  it('자세 붕괴: 무릎 꿇고 고개 숙이고 눈이 어두워짐', () => {
    const p = bossBodyPose({ ...base, state: 'staggered' });
    expect(p.crouch).toBeGreaterThanOrEqual(0.5);
    expect(p.headPitch).toBeGreaterThan(0);
    expect(p.legR.knee).toBeGreaterThan(1.5);
    expect(p.eye).toBeLessThan(0.3);
  });

  it('점프하면 다리를 접는다', () => {
    const ground = bossBodyPose(base);
    const air = bossBodyPose({ ...base, z: 100 });
    expect(air.legL.knee).toBeGreaterThan(1);
    expect(ground.legL.knee).toBeCloseTo(0, 9);
  });

  it('걸을 때 두 다리는 반대로', () => {
    const p = bossBodyPose({ ...base, moveRatio: 1, walkPhase: Math.PI / 2 });
    expect(p.legL.hip).toBeGreaterThan(0);
    expect(p.legR.hip).toBeCloseTo(-p.legL.hip, 6);
  });

  it('죽으면 BOSS_FALL_MS에 걸쳐 앞으로 쓰러지고 눈이 꺼진다', () => {
    const f = (ms: number) => bossBodyPose({ ...base, state: 'dead', stateMs: ms });
    expect(f(0).fall).toBe(0);
    expect(f(BOSS_FALL_MS / 2).fall).toBeLessThan(Math.PI / 4);
    expect(f(BOSS_FALL_MS).fall).toBeCloseTo(Math.PI / 2, 6);
    expect(f(BOSS_FALL_MS).eye).toBeCloseTo(0, 6);
  });
});
