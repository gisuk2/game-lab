/**
 * 플레이어 마네킹 자세 (순수 로직, 테스트 가능). 3D 화면이 이 값대로 관절을 돌린다.
 * 판정과는 무관 — 보이는 모양만 정한다.
 *
 * 각도 기준 (모두 몸 기준, 라디안):
 *   armX.yaw   = 팔이 향하는 수평 방향 (0 = 정면, + = 모델 좌표에서 반시계)
 *   armX.pitch = 팔을 든 정도 (0 = 아래로 늘어뜨림, π/2 = 수평, π = 머리 위)
 *   legX.hip   = 허벅지를 앞으로 든 정도 (+ = 앞, - = 뒤), legX.knee = 무릎 굽힘 (0 이상)
 *   twist      = 허리 비틀기 (yaw와 같은 방향), lean = 앞으로 숙임 (+)
 *   roll       = 몸 전체 앞구르기 회전 (0 → 2π), fall = 쓰러짐 (0 → π/2, 뒤로)
 *   swordTilt  = 손목에서 칼이 팔 방향보다 앞으로 꺾인 정도 (0 = 팔의 연장선)
 */
export interface PoseAttack {
  kind: 'combo' | 'dash';
  comboIndex: number;
  phase: 'startup' | 'active' | 'recovery';
  phaseProgress: number;
  arcRad: number;
  /** 공격 방향 - 몸 방향 (라디안) */
  rel: number;
}

export interface PoseInput {
  state: 'idle' | 'move' | 'dash' | 'attack' | 'parry' | 'hit' | 'heal' | 'dead';
  /** 발 높이 (점프 중이면 다리를 접음) */
  z?: number;
  stateMs: number;
  /** 0~1 */
  moveRatio: number;
  /** 걸음 위상 (라디안, 화면 쪽에서 이동 거리로 쌓음) */
  walkPhase: number;
  dashProgress: number | null;
  invulnerable: boolean;
  attack: PoseAttack | null;
  /** 숨쉬기 등 상시 흔들림용 시계 (ms) */
  timeMs: number;
}

export interface Limb {
  yaw: number;
  pitch: number;
}
export interface Leg {
  hip: number;
  knee: number;
}
export interface PlayerPose {
  /** 웅크림 (0 = 서 있음, 1 = 최대로 낮춤) */
  crouch: number;
  lean: number;
  twist: number;
  roll: number;
  fall: number;
  armR: Limb;
  armL: Limb;
  swordTilt: number;
  legL: Leg;
  legR: Leg;
  /** 투명도 (구르기 무적 중엔 반투명) */
  alpha: number;
}

/** 쓰러지는 데 걸리는 시간 */
export const FALL_MS = 350;
/** 3타(한 바퀴 베기) 준비 때 허리를 뒤로 감는 최대 각도 */
export const SPIN_WINDUP = 1.2;

const STAND: PlayerPose = {
  crouch: 0,
  lean: 0,
  twist: 0,
  roll: 0,
  fall: 0,
  armR: { yaw: 0.25, pitch: 0.25 },
  armL: { yaw: -0.2, pitch: 0.12 },
  swordTilt: 1.1,
  legL: { hip: 0, knee: 0 },
  legR: { hip: 0, knee: 0 },
  alpha: 1,
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 콤보 칼끝 방향: 준비 때 뒤로 젖힘 → 판정 동안 호를 그림 → 끝에 머묾 (2D 그리기와 같은 흐름) */
export function swingAngle(atk: PoseAttack): number {
  const half = atk.arcRad / 2;
  const side = atk.comboIndex === 1 ? -1 : 1;
  const from = atk.rel - side * half;
  const to = atk.rel + side * half;
  if (atk.phase === 'startup') return from - side * 0.6 * atk.phaseProgress;
  if (atk.phase === 'active') return from + (to - from) * atk.phaseProgress;
  return to;
}

export function playerPose(i: PoseInput): PlayerPose {
  const pose: PlayerPose = {
    ...STAND,
    armR: { ...STAND.armR },
    armL: { ...STAND.armL },
    legL: { ...STAND.legL },
    legR: { ...STAND.legR },
  };
  // 숨쉬기 (아주 작게)
  pose.lean = Math.sin(i.timeMs / 650) * 0.025;

  switch (i.state) {
    case 'idle':
    case 'move': {
      const m = i.moveRatio;
      const s = Math.sin(i.walkPhase);
      pose.legL.hip = 0.65 * m * s;
      pose.legR.hip = -0.65 * m * s;
      pose.legL.knee = 0.9 * m * Math.max(0, -s);
      pose.legR.knee = 0.9 * m * Math.max(0, s);
      // 팔은 다리와 반대로
      pose.armL.pitch = STAND.armL.pitch + 0.5 * m * Math.max(0, -s);
      pose.armR.pitch = STAND.armR.pitch + 0.35 * m * Math.max(0, s);
      pose.lean += 0.18 * m;
      pose.crouch = 0.06 * m * Math.abs(Math.cos(i.walkPhase)); // 걸음마다 살짝 출렁
      break;
    }
    case 'dash': {
      const t = i.dashProgress ?? 1;
      // 이동과 같은 곡선 (처음 빠르고 끝에서 느림)으로 한 바퀴
      pose.roll = 2 * Math.PI * (1 - (1 - t) * (1 - t));
      const tuck = Math.sin(Math.PI * Math.min(1, t * 1.15));
      pose.crouch = 0.55 * tuck + (t >= 1 ? 0.25 : 0); // 끝 경직: 낮게 착지
      pose.legL.hip = pose.legR.hip = 1.4 * tuck;
      pose.legL.knee = pose.legR.knee = 2.0 * tuck + (t >= 1 ? 0.6 : 0);
      pose.armL.pitch = pose.armR.pitch = 0.3 + 1.0 * tuck;
      pose.lean = 1.1 * tuck; // 머리를 무릎 쪽으로 말아 공처럼
      pose.alpha = i.invulnerable ? 0.55 : 1;
      break;
    }
    case 'attack': {
      const atk = i.attack;
      if (!atk) break;
      if (atk.kind === 'dash') {
        // 구르기 공격: 낮게 찌르기
        const p = atk.phaseProgress;
        const drive = atk.phase === 'startup' ? 0 : atk.phase === 'active' ? 1 : 1 - p * 0.6;
        pose.armR = { yaw: atk.rel, pitch: Math.PI / 2 - 0.1 };
        pose.swordTilt = 0;
        pose.twist = atk.phase === 'startup' ? -0.45 * p : 0.3 * drive;
        pose.lean = 0.15 + 0.35 * drive;
        pose.crouch = 0.3;
        pose.legL.hip = 0.6 * drive + 0.2;
        pose.legL.knee = 0.7;
        pose.legR.hip = -0.5 * drive;
        pose.legR.knee = 0.3;
        break;
      }
      const a = swingAngle(atk);
      if (atk.comboIndex === 2) {
        // 3타 한 바퀴 베기: 허리를 뒤로 감았다가 몸 전체가 칼과 함께 돈다
        // 판정 동안: 감은 만큼 풀리면서 + 칼이 돈 만큼 → 끝나면 정확히 한 바퀴 돌아 정면
        const from = swingAngle({ ...atk, phase: 'startup', phaseProgress: 0 });
        pose.twist =
          atk.phase === 'startup'
            ? -SPIN_WINDUP * atk.phaseProgress
            : atk.phase === 'active'
              ? -SPIN_WINDUP * (1 - atk.phaseProgress) + (a - from)
              : a - from;
        pose.armR = { yaw: 0, pitch: Math.PI / 2 };
        pose.swordTilt = 0;
        pose.crouch = atk.phase === 'startup' ? 0.35 * atk.phaseProgress : 0.35;
      } else {
        pose.twist = a * 0.35;
        pose.armR = { yaw: a - pose.twist, pitch: atk.phase === 'startup' ? Math.PI / 2 + 0.35 * atk.phaseProgress : Math.PI / 2 };
        pose.swordTilt = 0;
        pose.crouch = 0.12;
      }
      pose.lean = atk.phase === 'active' ? 0.25 : 0.12;
      pose.armL = { yaw: -0.9, pitch: 0.7 }; // 균형
      pose.legL.hip = 0.45; // 앞발
      pose.legL.knee = 0.4;
      pose.legR.hip = -0.35; // 뒷발
      pose.legR.knee = 0.15;
      break;
    }
    case 'parry':
      pose.armR = { yaw: 0.5, pitch: 1.3 };
      pose.swordTilt = -1.1; // 칼을 세워 막음
      pose.armL = { yaw: 0.2, pitch: 1.0 };
      pose.crouch = 0.15;
      break;
    case 'heal': {
      // 회복약: 왼손으로 병을 입에 대고 고개를 젖힘
      const t = Math.min(1, i.stateMs / 250);
      pose.armL = { yaw: 0.3, pitch: 2.4 * t };
      pose.lean = -0.15 * t;
      pose.crouch = 0.08;
      break;
    }
    case 'hit':
      pose.lean = -0.35;
      pose.armR.pitch = 0.6;
      pose.armL.pitch = 0.6;
      break;
    case 'dead': {
      const f = clamp01(i.stateMs / FALL_MS);
      pose.fall = (Math.PI / 2) * f * f; // 점점 빨리 쓰러짐
      pose.armR.pitch = 0.9 * f;
      pose.armL.pitch = 1.1 * f;
      pose.legL.knee = 0.4 * f;
      break;
    }
  }
  // 점프: 다리를 접고 팔을 벌림 (공격 자세는 유지)
  if ((i.z ?? 0) > 2 && i.state !== 'dash' && i.state !== 'dead') {
    const k = Math.min(1, (i.z ?? 0) / 30);
    pose.legL = { hip: 0.9 * k, knee: 1.3 * k };
    pose.legR = { hip: 0.2 * k, knee: 1.0 * k };
  }
  return pose;
}
