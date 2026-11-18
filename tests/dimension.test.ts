import { describe, expect, it } from 'vitest';
import { bodyHitsShape, FULL_HEIGHT, shapeXRange, type Body } from '../src/dimension/projection';
import { DIMENSION, DimensionState } from '../src/dimension/DimensionState';
import { CombatSystem, type CombatBoss, type CombatPlayer } from '../src/combat/CombatSystem';
import { ProjectileSystem } from '../src/combat/Projectiles';
import { PlayerModel } from '../src/entities/player/PlayerModel';
import { PLAYER } from '../src/config/balance';
import { NO_INPUT, type PlayerInput } from '../src/input/types';

const body = (x: number, y: number, z = 0): Body => ({ x, y, z, radius: 12, height: 60 });

describe('판정 투영 (2D = 깊이 무시)', () => {
  it('원·직사각형·부채꼴을 옆에서 본 좌우 구간', () => {
    expect(shapeXRange({ kind: 'circle', cx: 100, cy: 50, radius: 30 })).toEqual([70, 130]);
    const r = shapeXRange({ kind: 'rect', x: 0, y: 0, angle: 0, length: 100, width: 20 });
    expect(r[0]).toBeCloseTo(0, 9);
    expect(r[1]).toBeCloseTo(100, 9);
    // 깊이 방향(아래)으로 뻗은 직사각형 → 좌우 폭은 width뿐
    const down = shapeXRange({ kind: 'rect', x: 0, y: 0, angle: Math.PI / 2, length: 300, width: 20 });
    expect(down[0]).toBeCloseTo(-10, 9);
    expect(down[1]).toBeCloseTo(10, 9);
    // 오른쪽을 향한 90° 부채꼴: 왼쪽 끝 = 중심, 오른쪽 끝 = 반지름 (호가 0°를 지남)
    const s = shapeXRange({ kind: 'sector', cx: 0, cy: 0, radius: 50, angle: 0, arcRad: Math.PI / 2 });
    expect(s[0]).toBeCloseTo(0, 9);
    expect(s[1]).toBeCloseTo(50, 9);
    // 한 바퀴(360°) → 양쪽 끝 모두
    const full = shapeXRange({ kind: 'sector', cx: 0, cy: 0, radius: 50, angle: 1, arcRad: Math.PI * 2 });
    expect(full[0]).toBeCloseTo(-50, 9);
    expect(full[1]).toBeCloseTo(50, 9);
  });

  it('깊이가 달라도 2D에서는 맞고, 3D에서는 피한다', () => {
    const circle = { kind: 'circle' as const, cx: 0, cy: 0, radius: 40 };
    const farInDepth = body(10, 300);
    expect(bodyHitsShape('3d', farInDepth, circle)).toBe(false);
    expect(bodyHitsShape('2d', farInDepth, circle)).toBe(true);
    // 좌우로 벗어나면 2D에서도 피함
    expect(bodyHitsShape('2d', body(100, 0), circle)).toBe(false);
  });

  it('높이: 낮게 쓸기는 점프로 넘는다 (두 시점 모두)', () => {
    const low = { bottom: 0, top: 22 };
    const circle = { kind: 'circle' as const, cx: 0, cy: 0, radius: 40 };
    for (const view of ['2d', '3d'] as const) {
      expect(bodyHitsShape(view, body(0, 0, 0), circle, low)).toBe(true);
      expect(bodyHitsShape(view, body(0, 0, 30), circle, low)).toBe(false);
      expect(bodyHitsShape(view, body(0, 0, 30), circle, FULL_HEIGHT)).toBe(true);
    }
  });
});

describe('시점 상태 (게이지·잠금·무방비)', () => {
  it('처음엔 한 번 바꿀 수 있고, 게이지가 모자라면 못 바꾼다', () => {
    const d = new DimensionState('3d');
    expect(d.requestSwitch()).toBe('switched');
    expect(d.view).toBe('2d');
    d.update(DIMENSION.switchMs);
    expect(d.requestSwitch()).toBe('noGauge');
    expect(d.view).toBe('2d');
  });

  it('전환 직후 switchMs 동안은 무방비(전환 중)이고 다시 못 바꾼다', () => {
    const d = new DimensionState('3d');
    d.gauge = 100;
    d.requestSwitch();
    expect(d.switching).toBe(true);
    expect(d.requestSwitch()).toBe('busy');
    d.update(DIMENSION.switchMs - 1);
    expect(d.switching).toBe(true);
    d.update(1);
    expect(d.switching).toBe(false);
    expect(d.requestSwitch()).toBe('switched');
  });

  it('공격 적중·패링으로 게이지가 차고 최대를 넘지 않는다', () => {
    const d = new DimensionState('3d');
    d.gauge = 0;
    d.onPlayerHit();
    expect(d.gauge).toBe(DIMENSION.gainOnHit);
    d.onParry();
    expect(d.gauge).toBe(DIMENSION.gainOnHit + DIMENSION.gainOnParry);
    for (let i = 0; i < 20; i++) d.onParry();
    expect(d.gauge).toBe(DIMENSION.gaugeMax);
  });

  it('보스 강제 전환: 게이지 소모 없이 바뀌고, 그 공격이 끝날 때까지 잠금', () => {
    const d = new DimensionState('3d');
    d.gauge = 100;
    d.force('2d', 7);
    expect(d.view).toBe('2d');
    expect(d.gauge).toBe(100);
    d.update(DIMENSION.switchMs);
    expect(d.requestSwitch()).toBe('locked');
    d.releaseIfDone(7); // 같은 공격 진행 중
    expect(d.locked).toBe(true);
    d.releaseIfDone(null); // 공격 끝
    expect(d.locked).toBe(false);
    expect(d.requestSwitch()).toBe('switched');
  });

  it('선호 시점: 한쪽에 1.3배 이상 오래 머물면 그 시점', () => {
    const d = new DimensionState('3d');
    expect(d.preferred).toBe(null);
    d.update(6000);
    expect(d.preferred).toBe('3d');
    d.gauge = 100;
    d.requestSwitch();
    d.update(5000);
    expect(d.preferred).toBe(null); // 6000 vs 5000 → 비슷함
    d.update(4000);
    expect(d.preferred).toBe('2d');
  });
});

const STEP = 10;
const run = (p: PlayerModel, input: Partial<PlayerInput>, ms: number) => {
  for (let t = 0; t < ms; t += STEP) p.update({ ...NO_INPUT, ...input }, STEP);
};
const press = (p: PlayerModel, input: Partial<PlayerInput>) => p.update({ ...NO_INPUT, ...input }, STEP);

describe('플레이어 점프·회복약', () => {
  it('점프: 최고 높이 ≈ v²/2g, 다시 땅에 내려옴', () => {
    const p = new PlayerModel(500, 500, { width: 2000, height: 2000 });
    press(p, { jump: true });
    let top = 0;
    for (let t = 0; t < 1000; t += STEP) {
      press(p, {});
      top = Math.max(top, p.z);
    }
    const { velocity, gravity } = PLAYER.jump!;
    expect(top).toBeGreaterThan((velocity * velocity) / (2 * gravity) * 0.95);
    expect(top).toBeLessThan((velocity * velocity) / (2 * gravity) * 1.02);
    expect(p.z).toBe(0);
    expect(p.grounded).toBe(true);
  });

  it('공중에서는 구르기·두 번 점프 불가', () => {
    const p = new PlayerModel(500, 500, { width: 2000, height: 2000 });
    press(p, { jump: true });
    run(p, {}, 50);
    press(p, { dash: true });
    expect(p.state).not.toBe('dash');
    // 꼭대기 근처에서 다시 점프를 눌러도 더 높이 올라가지 않음
    run(p, {}, 240);
    press(p, { jump: true });
    let top = p.z;
    for (let t = 0; t < 600; t += STEP) {
      press(p, {});
      top = Math.max(top, p.z);
    }
    const { velocity, gravity } = PLAYER.jump!;
    expect(top).toBeLessThan((velocity * velocity) / (2 * gravity) * 1.02);
  });

  it('회복약: 마시는 시간이 끝나야 회복, 개수가 줄어듦', () => {
    const p = new PlayerModel(500, 500, { width: 2000, height: 2000 }, { ...PLAYER, oneHitKill: false });
    p.hp = 30;
    const before = p.potions;
    press(p, { heal: true });
    expect(p.state).toBe('heal');
    expect(p.potions).toBe(before - 1);
    run(p, {}, PLAYER.potion!.drinkMs - 50);
    expect(p.hp).toBe(30);
    run(p, {}, 100);
    expect(p.hp).toBe(30 + PLAYER.potion!.heal);
    expect(p.state).toBe('idle');
  });

  it('마시다 맞으면 회복 없음 (약은 이미 씀), 최대 체력을 넘지 않음, 다 쓰면 못 마심', () => {
    const p = new PlayerModel(500, 500, { width: 2000, height: 2000 }, { ...PLAYER, oneHitKill: false });
    p.hp = 80;
    press(p, { heal: true });
    run(p, {}, 200);
    p.applyHit(10, 400, 500);
    run(p, {}, PLAYER.potion!.drinkMs);
    expect(p.hp).toBe(70);
    run(p, {}, 600);
    press(p, { heal: true });
    run(p, {}, PLAYER.potion!.drinkMs + 20);
    expect(p.hp).toBe(PLAYER.maxHp);
    p.potions = 0;
    press(p, { heal: true });
    expect(p.state).not.toBe('heal');
  });
});

function fakePlayer(over: Partial<CombatPlayer> = {}): CombatPlayer & { hits: number[] } {
  const hits: number[] = [];
  return {
    x: 0, y: 0, z: 0, height: 60, radius: 12, isDead: false, isInvulnerable: false, isParryActive: false, attack: null, hits,
    applyHit(d: number) { hits.push(d); return { died: false }; },
    ...over,
  };
}
function fakeBoss(attack: CombatBoss['attack']): CombatBoss {
  return {
    x: 300, y: 0, z: 0, radius: 40, isDead: false, attackSerial: 1, attack,
    applyHit: (d: number) => ({ died: false, staggerStarted: false, dealt: d }),
    onParried: () => ({ staggerStarted: false }),
  };
}

describe('전투 판정이 시점을 따름', () => {
  // 화면 좌우 전체를 덮지만 깊이로는 얇은 "칼날 벽": 2D에서는 못 피하고 3D에서는 옆으로 비키면 피함
  const wall = {
    phase: 'active' as const, parryable: false, melee: true,
    pattern: { id: 'sweep' as const, damage: 30 },
    shape: { kind: 'rect' as const, x: -2000, y: 0, angle: 0, length: 4000, width: 30 },
  };
  it('칼날 벽: 2D에서는 맞고, 3D에서 깊이로 비키면 피함', () => {
    const p2 = fakePlayer({ y: 120 });
    new CombatSystem({ bossHittableMaxZ: 20 }).resolve(p2, fakeBoss(wall), '2d');
    expect(p2.hits).toEqual([30]);
    const p3 = fakePlayer({ y: 120 });
    new CombatSystem({ bossHittableMaxZ: 20 }).resolve(p3, fakeBoss(wall), '3d');
    expect(p3.hits).toEqual([]);
  });

  it('낮게 쓸기는 점프 중이면 지나감', () => {
    const low = { ...wall, pattern: { id: 'sweep' as const, damage: 30, height: { bottom: 0, top: 22 } } };
    const jumping = fakePlayer({ z: 40 });
    new CombatSystem({ bossHittableMaxZ: 20 }).resolve(jumping, fakeBoss(low), '2d');
    expect(jumping.hits).toEqual([]);
  });

  it('플레이어 공격: 2D에서는 깊이가 달라도 보스에게 닿음', () => {
    const swing = {
      serial: 1, phase: 'active' as const, damage: 10, postureMultiplier: 1,
      shape: { kind: 'sector' as const, cx: 0, cy: 0, radius: 290, angle: 0, arcRad: 0.3 },
    };
    let hits = 0;
    const boss = { ...fakeBoss(null), y: 200, applyHit: (d: number) => { hits++; return { died: false, staggerStarted: false, dealt: d }; } };
    new CombatSystem({ bossHittableMaxZ: 20 }).resolve(fakePlayer({ attack: swing }), boss, '3d');
    expect(hits).toBe(0);
    new CombatSystem({ bossHittableMaxZ: 20 }).resolve(fakePlayer({ attack: swing }), boss, '2d');
    expect(hits).toBe(1);
  });

  it('탄: 2D에서는 깊이 무시, 높이는 봄 (점프로 낮은 탄을 넘음)', () => {
    const shoot = (view: '2d' | '3d', player: CombatPlayer, z = 30) => {
      const ps = new ProjectileSystem({ width: 2000, height: 2000 });
      ps.view = view;
      ps.spawn({ kind: 'bullet', x: 100, y: 500, angle: 0, speed: 0, radius: 8, damage: 10, parryable: true, patternId: 'shot', z });
      return ps.update(10, player, fakeBoss(null)).filter((e) => e.type === 'bossHitPlayer').length;
    };
    const p = () => fakePlayer({ x: 100, y: 800 }); // 탄과 깊이가 300 다름
    expect(shoot('3d', p())).toBe(0);
    expect(shoot('2d', p())).toBe(1);
    expect(shoot('2d', fakePlayer({ x: 100, y: 800, z: 50 }), 10)).toBe(0); // 낮은 탄 위로 점프
  });
});
