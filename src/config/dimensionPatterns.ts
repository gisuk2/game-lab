import { BOSS, type BossConfig, type BossPatternConfig } from './bossBalance';

/**
 * 시점 전환 실험판 전용 패턴 (설계: docs/design/dimension-switch.md §4).
 * 기존 11개 패턴(BOSS)은 그대로 두고, 3D 게임(Game3D)에서만 이 두 개를 더한다.
 */

/**
 * 칼날 벽 — 3D 강제 상황.
 * 경기장 좌우 전체·높이 전체를 덮지만 깊이로는 얇다(44).
 *  - 2D: 깊이가 사라지므로 피할 곳이 없음 → 예고 중에 시점을 3D로 바꿔야 함 (게이지 필요)
 *  - 3D: 조준이 고정된 뒤 깊이 방향(W/S)으로 한 걸음 비키면 피함
 * 플레이어가 2D에 오래 머물수록 더 자주 나온다 (viewBias).
 */
export const BLADE_WALL: BossPatternConfig = {
  id: 'bladeWall',
  name: '칼날 벽',
  category: 'heavy',
  weapon: 'greatsword',
  shape: 'rect',
  length: 0,
  width: 0,
  steps: [
    // 앞 55%는 플레이어 깊이를 따라오고, 나머지 765ms 동안 고정 → 전환(0.3초) + 한 걸음이 들어갈 시간
    { telegraphMs: 1700, trackRatio: 0.55, lungeDistance: 0, activeMs: 160, recoveryMs: 1400, shape: { kind: 'wall', width: 44 } },
  ],
  restMs: 600,
  damage: 35,
  minDistance: 0,
  maxDistance: 700,
  weight: 1,
  viewBias: { '2d': 4, '3d': 0.6 },
};

/**
 * 탄막 — 2D 유리 상황 (1막: 시련이 "정직하게" 2D로 바꿔 줌 = 가르침).
 * 낮은 탄(점프로 넘음)과 높은 탄(서 있으면 머리 위로 지나감)을 번갈아 3발씩 부채꼴로.
 *  - 2D: 높이 차이가 한 줄로 또렷이 보임
 *  - 3D: 깊이로 흩어지고 높이 거리감이 어려움
 * (2막 이후 오염된 버전은 반대로 3D로 강제하는 식으로 배신 — 미구현)
 */
const volley = (z: number, first: boolean, last: boolean) => ({
  telegraphMs: first ? 1100 : 520,
  trackRatio: 0.7,
  lungeDistance: 0,
  activeMs: 60,
  recoveryMs: last ? 900 : 140,
  fire: { kind: 'bullet' as const, speed: 420, radius: 8, z, count: 3, spreadDeg: 26 },
});
export const CURTAIN: BossPatternConfig = {
  id: 'curtain',
  name: '탄막',
  category: 'normal',
  weapon: 'gun',
  shape: 'rect',
  length: 0,
  width: 0,
  steps: [volley(12, true, false), volley(88, false, false), volley(12, false, false), volley(88, false, true)],
  restMs: 0,
  damage: 12,
  minDistance: 150,
  maxDistance: Number.POSITIVE_INFINITY,
  weight: 1.2,
  forceView: '2d',
};

/** 낮은 탄 높이 / 높은 탄 높이 (테스트·설계 문서와 맞춤) */
export const LOW_BULLET_Z = 12;
export const HIGH_BULLET_Z = 88;

export const BOSS_DIMENSION: BossConfig = { ...BOSS, patterns: [...BOSS.patterns, BLADE_WALL, CURTAIN] };
