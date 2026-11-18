import { describe, expect, it } from 'vitest';
import { BOSS } from '../src/config/bossBalance';
import { BossModel } from '../src/entities/boss/BossModel';
import { weaponPose } from '../src/entities/boss/weaponPose';

const BOUNDS = { width: 1000, height: 1000 };
const only = (id: string) => ({ ...BOSS, startWeapon: BOSS.patterns.find((p) => p.id === id)!.weapon, patterns: [BOSS.patterns.find((p) => p.id === id)!] });

function untilTelegraph(boss: BossModel, target: { x: number; y: number }, step = 0): void {
  for (let t = 0; t < 20000; t += 10) {
    boss.update(target, 10);
    if (boss.attack?.phase === 'telegraph' && boss.attack.step === step) return;
  }
  throw new Error('예고가 시작되지 않음');
}

describe('보스 무기 자세 (2D·3D 공용)', () => {
  it('패링 불가 공격의 준비 중에는 무기가 붉게 빛나고, 패링 가능 공격은 아니다', () => {
    const heavy = new BossModel(500, 500, BOUNDS, only('spin'), () => 0);
    untilTelegraph(heavy, { x: 560, y: 500 });
    expect(weaponPose(heavy, BOSS.radius).glow).toBe(true);

    const normal = new BossModel(500, 500, BOUNDS, only('sweep'), () => 0);
    untilTelegraph(normal, { x: 560, y: 500 });
    expect(weaponPose(normal, BOSS.radius).glow).toBe(false);
  });

  it('내려찍기 준비 중에는 무기를 치켜든다 (3D에서는 세움)', () => {
    const boss = new BossModel(200, 500, BOUNDS, only('slam'), () => 0);
    untilTelegraph(boss, { x: 800, y: 500 });
    expect(weaponPose(boss, BOSS.radius).raised).toBe(true);
  });

  it('연속 베기는 타마다 젖히는 방향이 좌우로 바뀐다', () => {
    const target = { x: 900, y: 500 };
    const boss = new BossModel(400, 500, BOUNDS, only('combo'), () => 0);
    untilTelegraph(boss, target, 0);
    const p0 = weaponPose(boss, BOSS.radius);
    const side0 = Math.sign(p0.wa - p0.axis);
    untilTelegraph(boss, target, 1);
    const p1 = weaponPose(boss, BOSS.radius);
    const side1 = Math.sign(p1.wa - p1.axis);
    expect(side0).not.toBe(0);
    expect(side1).toBe(-side0);
  });
});
