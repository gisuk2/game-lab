import { describe, expect, it } from 'vitest';
import { FALL_MS, SPIN_WINDUP, playerPose, swingAngle, type PoseAttack, type PoseInput } from '../src/entities/player/playerPose';

const base: PoseInput = {
  state: 'idle', stateMs: 0, moveRatio: 0, walkPhase: 0, dashProgress: null, invulnerable: false, attack: null, timeMs: 0,
};
const combo = (comboIndex: number, phase: PoseAttack['phase'], phaseProgress: number, arcRad = 2): PoseAttack => ({
  kind: 'combo', comboIndex, phase, phaseProgress, arcRad, rel: 0,
});

describe('플레이어 자세 (마네킹)', () => {
  it('가만히 서 있으면 다리는 곧고 팔은 내려가 있다', () => {
    const p = playerPose(base);
    for (const v of [p.legL.hip, p.legL.knee, p.legR.hip, p.legR.knee]) expect(v).toBeCloseTo(0, 9); // (-0 포함)
    expect(p.armR.pitch).toBeLessThan(0.5);
    expect(p.roll).toBe(0);
    expect(p.alpha).toBe(1);
  });

  it('걸을 때 두 다리는 반대로, 속도에 비례해 크게 움직인다', () => {
    const half = playerPose({ ...base, state: 'move', moveRatio: 0.5, walkPhase: Math.PI / 2 });
    const full = playerPose({ ...base, state: 'move', moveRatio: 1, walkPhase: Math.PI / 2 });
    expect(full.legL.hip).toBeGreaterThan(0);
    expect(full.legR.hip).toBeCloseTo(-full.legL.hip, 6);
    expect(full.legL.hip).toBeCloseTo(half.legL.hip * 2, 6);
    expect(full.legR.knee).toBeGreaterThan(0); // 뒤로 간 다리의 무릎이 굽음
    expect(full.lean).toBeGreaterThan(half.lean);
  });

  it('구르기: 이동과 같은 곡선으로 정확히 한 바퀴, 중간에 웅크림, 무적일 때만 반투명', () => {
    const rolls = [0, 0.25, 0.5, 0.75, 1].map((t) => playerPose({ ...base, state: 'dash', dashProgress: t }).roll);
    for (let k = 1; k < rolls.length; k++) expect(rolls[k]).toBeGreaterThan(rolls[k - 1]);
    expect(rolls[0]).toBe(0);
    expect(rolls[4]).toBeCloseTo(2 * Math.PI, 6);
    expect(rolls[2]).toBeGreaterThan(Math.PI); // 절반 시간에 반 바퀴 넘게 (처음 빠름)
    const mid = playerPose({ ...base, state: 'dash', dashProgress: 0.45 });
    expect(mid.legL.knee).toBeGreaterThan(1.5);
    expect(mid.crouch).toBeGreaterThan(0.4);
    expect(mid.alpha).toBe(1);
    expect(playerPose({ ...base, state: 'dash', dashProgress: 0.45, invulnerable: true }).alpha).toBeLessThan(1);
  });

  it('1타와 2타는 반대쪽에서 휘두른다', () => {
    const a1 = swingAngle(combo(0, 'active', 0));
    const a2 = swingAngle(combo(1, 'active', 0));
    expect(Math.sign(a1)).toBe(-Math.sign(a2));
    // 칼(팔) 방향 = 몸 비틀기 + 팔 방향
    const p = playerPose({ ...base, state: 'attack', attack: combo(0, 'active', 0.5) });
    expect(p.twist + p.armR.yaw).toBeCloseTo(swingAngle(combo(0, 'active', 0.5)), 6);
    expect(p.armR.pitch).toBeCloseTo(Math.PI / 2, 6);
  });

  it('3타: 준비 때 허리를 뒤로 감고, 판정 동안 몸 전체가 한 바퀴 돌아 정면으로 끝난다', () => {
    const spin = (phase: PoseAttack['phase'], t: number) =>
      playerPose({ ...base, state: 'attack', attack: combo(2, phase, t, 2 * Math.PI) }).twist;
    expect(spin('startup', 1)).toBeCloseTo(-SPIN_WINDUP, 6);
    expect(spin('active', 0)).toBeCloseTo(-SPIN_WINDUP, 6); // 준비 끝과 이어짐
    expect(spin('active', 0.5)).toBeGreaterThan(spin('active', 0.25));
    expect(spin('active', 1)).toBeCloseTo(2 * Math.PI, 6);
    expect(spin('recovery', 0.5)).toBeCloseTo(2 * Math.PI, 6);
  });

  it('구르기 공격: 낮게 앞으로 찌른다 (판정 때 가장 숙임)', () => {
    const at = (phase: PoseAttack['phase']) =>
      playerPose({ ...base, state: 'attack', attack: { ...combo(0, phase, 0.5), kind: 'dash' } });
    expect(at('active').lean).toBeGreaterThan(at('startup').lean);
    expect(at('active').armR.yaw).toBe(0);
    expect(at('active').swordTilt).toBe(0);
  });

  it('죽으면 점점 빨리 뒤로 쓰러져 FALL_MS에 눕는다', () => {
    const f = (ms: number) => playerPose({ ...base, state: 'dead', stateMs: ms }).fall;
    expect(f(0)).toBe(0);
    expect(f(FALL_MS / 2)).toBeLessThan(Math.PI / 4); // 처음엔 천천히
    expect(f(FALL_MS)).toBeCloseTo(Math.PI / 2, 6);
    expect(f(FALL_MS * 3)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('구르기 웅크림', () => {
  it('구르는 중간엔 머리를 무릎 쪽으로 만다 (앞으로 크게 숙임)', () => {
    const mid = playerPose({ ...base, state: 'dash', dashProgress: 0.45 });
    expect(mid.lean).toBeGreaterThan(0.8);
  });
});
