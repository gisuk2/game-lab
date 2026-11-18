import type { WeaponPose } from './weaponPose';

/**
 * 보스 몸 자세 (순수 로직, 테스트 가능). 3D 화면이 이 값대로 거대한 관절 몸체를 움직인다.
 * 무기 방향은 2D와 같은 weaponPose를 따르고, 몸은 그 무기를 "들고 있는" 자세를 만든다.
 *
 * 몸짓 규칙 (바닥 예고 없이도 읽히게):
 *  - 준비: 무기를 점점 높이 들어 올리고(무거워 보이게 처음 빠르고 끝에서 느리게) 몸을 낮춤. 강패턴은 더 깊이 낮추고 눈이 밝아짐
 *  - 판정: 앞으로 숙이며 무기 끝이 바닥 가까이를 쓸고 지나감
 *  - 경직: 천천히 원래 자세로 / 자세 붕괴: 무릎 꿇고 고개 숙임 (반격 기회)
 *  - 무기 교체: 고개를 들고 몸을 세움 / 점프: 다리를 접음 / 사망: 앞으로 쓰러짐
 *
 * 각도 기준은 playerPose와 같음 (몸 기준, 팔 pitch 0 = 아래로, π/2 = 수평).
 */

/** 몸 치수 (화면과 공유). 아래 치수 × scale = 실제 크기 → 키 ≈ 274 = 플레이어(63)의 약 4.3배 */
export const BOSS_BODY = {
  /** 몸 전체 배율 (부품 치수는 배율 1 기준) */
  scale: 1.2,
  hipY: 100,
  thigh: 52,
  shin: 50,
  torso: 82,
  headR: 20,
  /** 어깨 높이 (엉덩이 기준) */
  shoulderY: 70,
  shoulderZ: 36,
  upperArm: 46,
  foreArm: 44,
  /** 무기 모양(2D 길이 기준)을 3D에서 키우는 배율 */
  weaponScale: 1.42,
  /** 2D 무기 자세의 (손 거리 + 길이) → 3D에서 무기 끝이 닿는 수평 거리 배율 */
  reachScale: 1.5,
};
export const BOSS_HEIGHT = (BOSS_BODY.hipY + BOSS_BODY.torso + 6 + BOSS_BODY.headR * 2) * BOSS_BODY.scale;
/** 어깨의 바닥 기준 높이 (서 있을 때, 실제 크기) */
export const SHOULDER_H = (BOSS_BODY.hipY + BOSS_BODY.shoulderY) * BOSS_BODY.scale;

export interface BossBodyInput {
  state: 'watch' | 'approach' | 'swap' | 'telegraph' | 'active' | 'recovery' | 'rest' | 'flinch' | 'staggered' | 'dead';
  stateMs: number;
  facing: number;
  /** 점프 높이 */
  z: number;
  /** 0~1 */
  moveRatio: number;
  walkPhase: number;
  timeMs: number;
  weapon: 'greatsword' | 'spear' | 'hammer' | 'twinblades' | 'gun' | 'bare';
  pose: WeaponPose;
  attack: { phase: 'telegraph' | 'active' | 'recovery'; phaseProgress: number; parryable: boolean; ranged: boolean } | null;
  /** 플레이어 방향 - 몸 방향 (고개 돌리기용) */
  lookRel: number;
  /** 플레이어까지 거리 (원거리 공격 때 총구를 플레이어에게 겨눔) */
  targetDist: number;
}

export interface Limb {
  yaw: number;
  pitch: number;
}
export interface Leg {
  hip: number;
  knee: number;
}
export interface BossBodyPose {
  crouch: number;
  lean: number;
  twist: number;
  fall: number;
  armR: Limb;
  armL: Limb;
  legL: Leg;
  legR: Leg;
  headYaw: number;
  headPitch: number;
  /** 눈 밝기 0~1 */
  eye: number;
  /** 손에서 무기 길이 배율 (weaponPose.len / 기준) — 화면이 곱함 */
  weaponLen: number;
}

export const BOSS_FALL_MS = 900;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 무기를 든 팔: 어깨에서 "무기 끝이 닿을 점"을 향함. (height = 그 점의 높이) */
export function armToward(rel: number, reach: number, height: number, shoulderH: number): Limb {
  return { yaw: rel, pitch: Math.atan2(reach, shoulderH - height) };
}

export function bossBodyPose(i: BossBodyInput): BossBodyPose {
  const B = BOSS_BODY;
  const out: BossBodyPose = {
    crouch: 0,
    lean: Math.sin(i.timeMs / 900) * 0.02, // 숨쉬기
    twist: 0,
    fall: 0,
    armR: { yaw: 0.2, pitch: 0.2 },
    armL: { yaw: -0.2, pitch: 0.15 },
    legL: { hip: 0, knee: 0 },
    legR: { hip: 0, knee: 0 },
    headYaw: clamp(wrap(i.lookRel), -0.7, 0.7),
    headPitch: 0,
    eye: 0.55,
    weaponLen: i.pose.len,
  };

  // 걷기 (무거운 걸음)
  const m = i.moveRatio;
  const s = Math.sin(i.walkPhase);
  out.legL.hip = 0.45 * m * s;
  out.legR.hip = -0.45 * m * s;
  out.legL.knee = 0.6 * m * Math.max(0, -s);
  out.legR.knee = 0.6 * m * Math.max(0, s);
  out.crouch = 0.04 * m * Math.abs(Math.cos(i.walkPhase));

  const rel = wrap(i.pose.wa - i.facing);
  const atk = i.attack;
  const reach = atk?.ranged ? Math.max(60, i.targetDist) : (i.pose.hand + i.pose.len) * B.reachScale;
  let tipH = 12; // 무기 끝 높이: 기본은 바닥 가까이 (끝을 끌고 다님)
  if (atk) {
    const t = atk.phaseProgress;
    const e = 1 - (1 - t) * (1 - t);
    const heavy = !atk.parryable;
    if (atk.phase === 'telegraph') {
      out.crouch = (heavy ? 0.22 : 0.12) * e;
      out.lean = i.pose.raised ? -0.18 * e : 0.08 * e; // 치켜들 땐 뒤로 젖힘
      out.twist = clamp(rel * 0.35, -0.6, 0.6) * e;
      tipH = atk.ranged ? 45 : 12 + 120 * e; // 점점 높이 들어 올림
      if (heavy) out.eye = 0.55 + 0.45 * e;
    } else if (atk.phase === 'active') {
      out.crouch = 0.18;
      out.lean = 0.3;
      out.twist = clamp(rel * 0.35, -0.6, 0.6);
      tipH = atk.ranged ? 45 : 8;
      out.eye = 1;
    } else {
      out.crouch = 0.18 * (1 - t);
      out.lean = 0.3 * (1 - t);
      out.twist = clamp(rel * 0.35, -0.6, 0.6) * (1 - t);
      tipH = atk.ranged ? 45 : 8;
    }
    // 내딛는 다리 (공격 중엔 넓게 버팀)
    out.legL.hip = 0.35;
    out.legL.knee = 0.35 + out.crouch;
    out.legR.hip = -0.3;
    out.legR.knee = 0.2 + out.crouch;
  }

  // 무기를 든 오른팔 (몸통이 비튼 만큼 빼서 팔 방향을 맞춤)
  if (i.pose.raised) {
    out.armR = { yaw: rel - out.twist, pitch: 2.75 };
  } else {
    const a = armToward(rel, reach, tipH, SHOULDER_H * (1 - 0.45 * out.crouch));
    out.armR = { yaw: a.yaw - out.twist, pitch: a.pitch };
  }
  // 왼팔: 쌍검·맨손은 대칭, 해머·대검을 치켜들 땐 같이, 아니면 균형
  if (i.weapon === 'twinblades' || i.weapon === 'bare') {
    const mirror = wrap(2 * (i.pose.axis - i.facing) - rel);
    const a = armToward(mirror, reach, tipH, SHOULDER_H);
    out.armL = { yaw: a.yaw - out.twist, pitch: i.pose.raised ? 2.75 : a.pitch };
  } else if (i.pose.raised) {
    out.armL = { ...out.armR };
  } else if (atk) {
    out.armL = { yaw: -0.8, pitch: 0.6 };
  }

  // 점프: 다리를 접음
  if (i.z > 0) {
    const k = clamp(i.z / 80, 0, 1);
    out.legL = { hip: 1.0 * k, knee: 1.6 * k };
    out.legR = { hip: 0.7 * k, knee: 1.4 * k };
  }

  switch (i.state) {
    case 'staggered':
      out.crouch = 0.5;
      out.lean = 0.55;
      out.headPitch = 0.5;
      out.twist = 0;
      out.armR = { yaw: 0.4, pitch: 0.25 };
      out.armL = { yaw: -0.4, pitch: 0.25 };
      out.legL = { hip: 0.9, knee: 1.6 }; // 한쪽 무릎을 꿇음
      out.legR = { hip: -0.2, knee: 1.9 };
      out.eye = 0.15;
      break;
    case 'rest':
      out.crouch = 0.12;
      out.lean = 0.12;
      out.headPitch = 0.2;
      out.eye = 0.35;
      break;
    case 'flinch':
      out.lean = -0.2;
      out.headPitch = -0.15;
      break;
    case 'swap': {
      out.lean = -0.06;
      out.headPitch = -0.25; // 고개를 들고 위압
      out.eye = 0.9;
      break;
    }
    case 'dead': {
      const f = clamp(i.stateMs / BOSS_FALL_MS, 0, 1);
      out.fall = (Math.PI / 2) * f * f;
      out.crouch = 0.3 * f;
      out.eye = 0.55 * (1 - f);
      out.legL = { hip: 0.6 * f, knee: 1.2 * f };
      out.legR = { hip: 0.2 * f, knee: 0.5 * f };
      break;
    }
  }
  return out;
}
