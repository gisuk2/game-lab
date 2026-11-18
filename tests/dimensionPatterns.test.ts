import { describe, expect, it } from 'vitest';
import { BossModel, choosePattern, type BossEvent } from '../src/entities/boss/BossModel';
import { BOSS } from '../src/config/bossBalance';
import { BLADE_WALL, BOSS_DIMENSION, CURTAIN, HIGH_BULLET_Z, LOW_BULLET_Z } from '../src/config/dimensionPatterns';
import { bodyHitsShape } from '../src/dimension/projection';
import { DIMENSION } from '../src/dimension/DimensionState';
import { ProjectileSystem } from '../src/combat/Projectiles';
import type { CombatBoss, CombatPlayer } from '../src/combat/CombatSystem';
import { PLAYER } from '../src/config/balance';

const BOUNDS = { width: 960, height: 540 };
const STEP = 10;
function runUntil(boss: BossModel, target: () => { x: number; y: number }, ok: () => boolean, maxMs = 12000): BossEvent[] {
  const all: BossEvent[] = [];
  for (let t = 0; t < maxMs && !ok(); t += STEP) all.push(...boss.update(target(), STEP));
  return all;
}
const body = (x: number, y: number, z = 0) => ({ x, y, z, radius: PLAYER.radius, height: PLAYER.height! });

describe('칼날 벽 (3D 강제)', () => {
  const cfg = { ...BOSS, patterns: [BLADE_WALL] };

  it('조준 고정 전엔 플레이어 깊이를 따라오고, 고정 뒤엔 멈춤', () => {
    const boss = new BossModel(480, 120, BOUNDS, cfg, () => 0);
    let target = { x: 480, y: 300 };
    runUntil(boss, () => target, () => boss.attack?.phase === 'telegraph');
    target = { x: 480, y: 340 };
    runUntil(boss, () => target, () => !!boss.attack?.locked);
    const s = boss.attack!.shape;
    expect(s.kind === 'rect' && s.y).toBe(340);
    target = { x: 480, y: 420 };
    runUntil(boss, () => target, () => boss.attack?.phase === 'active');
    const a = boss.attack!.shape;
    expect(a.kind === 'rect' && a.y).toBe(340);
  });

  it('판정 순간: 2D에서는 경기장 어디에 있든 맞고, 3D에서는 깊이로 한 걸음 비키면 피함', () => {
    const boss = new BossModel(480, 120, BOUNDS, cfg, () => 0);
    const target = { x: 480, y: 300 };
    runUntil(boss, () => target, () => boss.attack?.phase === 'active');
    const wall = boss.attack!.shape;
    for (const x of [10, 480, 950]) {
      for (const y of [30, 300, 520]) expect(bodyHitsShape('2d', body(x, y), wall)).toBe(true);
    }
    expect(bodyHitsShape('3d', body(480, 300), wall)).toBe(true);
    const step = BLADE_WALL.steps[0].shape!.width / 2 + PLAYER.radius + 1;
    expect(bodyHitsShape('3d', body(480, 300 + step), wall)).toBe(false);
    expect(bodyHitsShape('3d', body(480, 300 - step), wall)).toBe(false);
  });

  it('공정성: 조준 고정 뒤 남은 시간 안에 전환(무방비) + 한 걸음이 들어감', () => {
    const s = BLADE_WALL.steps[0];
    const afterLock = s.telegraphMs * (1 - s.trackRatio);
    const stepMs = ((s.shape!.width / 2 + PLAYER.radius) / PLAYER.moveSpeed) * 1000 + PLAYER.moveAccelMs;
    expect(afterLock).toBeGreaterThan(DIMENSION.switchMs + stepMs + 200); // 반응 여유 0.2초 이상
  });

  it('패링 불가(강패턴)', () => {
    expect(BLADE_WALL.category).toBe('heavy');
  });
});

describe('탄막 (2D 유리, 시련이 2D로 바꿔 줌)', () => {
  it('2D로 강제 전환하는 패턴이다', () => {
    expect(CURTAIN.forceView).toBe('2d');
  });

  it('한 타에 3발, 낮은 탄 → 높은 탄 순서로 번갈아 쏜다', () => {
    const boss = new BossModel(480, 120, BOUNDS, { ...BOSS, patterns: [CURTAIN] }, () => 0);
    const target = { x: 480, y: 420 };
    const events = runUntil(boss, () => target, () => boss.state === 'watch');
    const fires = events.filter((e): e is Extract<BossEvent, { type: 'fire' }> => e.type === 'fire');
    expect(fires.length).toBe(12);
    expect(fires.map((f) => f.z)).toEqual([...Array(3).fill(LOW_BULLET_Z), ...Array(3).fill(HIGH_BULLET_Z), ...Array(3).fill(LOW_BULLET_Z), ...Array(3).fill(HIGH_BULLET_Z)]);
    const angles = fires.slice(0, 3).map((f) => f.angle);
    expect(angles[0]).toBeLessThan(angles[1]);
    expect(angles[1]).toBeLessThan(angles[2]);
  });

  it('2D: 서 있으면 높은 탄은 머리 위로, 낮은 탄은 맞음 / 점프하면 낮은 탄을 넘음', () => {
    const hits = (z: number, playerZ: number) => {
      const ps = new ProjectileSystem({ width: 2000, height: 2000 });
      ps.view = '2d';
      ps.spawn({ kind: 'bullet', x: 500, y: 100, angle: 0, speed: 0, radius: 8, damage: 12, parryable: true, patternId: 'curtain', z });
      let n = 0;
      const player: CombatPlayer = {
        x: 500, y: 900, z: playerZ, height: PLAYER.height, radius: PLAYER.radius, isDead: false, isInvulnerable: false, isParryActive: false, attack: null,
        applyHit: () => { n++; return { died: false }; },
      };
      const boss: CombatBoss = {
        x: 0, y: 0, z: 0, radius: 40, isDead: false, attackSerial: 0, attack: null,
        applyHit: (d: number) => ({ died: false, staggerStarted: false, dealt: d }), onParried: () => ({ staggerStarted: false }),
      };
      ps.update(10, player, boss);
      return n;
    };
    expect(hits(HIGH_BULLET_Z, 0)).toBe(0);
    expect(hits(LOW_BULLET_Z, 0)).toBe(1);
    expect(hits(LOW_BULLET_Z, 30)).toBe(0);
    // 점프 최고 높이로 낮은 탄을 넘을 수 있음
    const apex = PLAYER.jump!.velocity ** 2 / (2 * PLAYER.jump!.gravity);
    expect(apex).toBeGreaterThan(LOW_BULLET_Z + 8 + 10);
  });
});

describe('시점 학습: 머무는 시점에서 불리한 패턴을 더 고름', () => {
  const freq = (view: '2d' | '3d' | null) => {
    let wall = 0;
    for (let i = 0; i < 2000; i++) {
      const r = (i + 0.5) / 2000;
      if (choosePattern(BOSS_DIMENSION, 200, null, () => r, view).id === 'bladeWall') wall++;
    }
    return wall / 2000;
  };
  it('2D에 머물면 칼날 벽이 3D일 때보다 훨씬 자주 나옴', () => {
    expect(freq('2d')).toBeGreaterThan(freq('3d') * 4);
    expect(freq('2d')).toBeGreaterThan(freq(null));
  });
  it('기존 11개 패턴 설정(BOSS)은 그대로 (실험 패턴은 3D 게임에서만)', () => {
    expect(BOSS.patterns.some((p) => p.id === 'bladeWall' || p.id === 'curtain')).toBe(false);
    expect(BOSS_DIMENSION.patterns.length).toBe(BOSS.patterns.length + 2);
  });
});
