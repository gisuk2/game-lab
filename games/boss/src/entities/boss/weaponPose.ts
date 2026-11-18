import type { BossModel } from './BossModel';

/** 무기 기준 길이 (자세 계산용. 실제 길이는 무기마다 다름) */
export const WEAPON_LEN = 58;

/**
 * 보스 무기 자세 (순수 로직). 2D(BossView)와 3D 시험판이 같은 자세를 쓰도록 분리했다.
 *
 * 몸짓 규칙 (바닥 예고 없이도 읽히도록):
 *  - 패턴마다 다른 준비 자세 (휘두르기 = 뒤로 젖힘, 찌르기 = 뒤로 당김, 회전 = 감아 돌림, 내려찍기 = 치켜듦)
 *  - 연속 베기는 타마다 젖히는 방향이 좌우로 바뀜
 *  - 강패턴(패링 불가)은 준비 중 무기가 붉게 빛남 (glow)
 */
export interface WeaponPose {
  /** 무기 방향 (바닥 평면의 각도) */
  wa: number;
  /** 손 위치 = 몸 중심에서의 거리 */
  hand: number;
  /** 자세에 따른 길이 (WEAPON_LEN 기준) */
  len: number;
  /** 패링 불가 공격 준비 중: 붉게 빛남 */
  glow: boolean;
  /**
   * 무기를 머리 위로 치켜든 상태 (내려찍기·지면 파동 준비).
   * 2D에서는 wa가 화면 위쪽(-90°)을 가리키는 것으로 표현하고, 3D에서는 무기를 세운다.
   */
  raised: boolean;
  /** 쌍검의 다른 한 자루가 대칭되는 축 (조준 방향) */
  axis: number;
}

export function weaponPose(m: BossModel, radius: number): WeaponPose {
  const r = radius;
  const atk = m.attack;
  let wa = m.facing + 1.1;
  let hand = r * 0.75;
  let len = WEAPON_LEN;
  let glow = false;
  let raised = false;

  if (m.state === 'flinch') wa = m.facing + 2.3;
  if (m.isStaggered) wa = m.facing + Math.PI * 0.8;

  const aim = atk && (atk.shape.kind === 'sector' || atk.shape.kind === 'rect') ? atk.shape.angle : m.facing;

  if (atk) {
    const p = atk.pattern;
    const t = atk.phaseProgress;
    const e = 1 - (1 - t) * (1 - t); // 처음엔 빠르게, 끝에서 천천히 (준비 동작이 점점 무거워짐)
    glow = !atk.parryable && atk.phase === 'telegraph';

    const isDashStep = p.shape === 'sector' && atk.shape.kind === 'rect';
    if (atk.fire === 'wave') {
      // 지면 파동: 해머를 치켜들었다가(준비) 앞으로 내리침
      if (atk.phase === 'telegraph') {
        wa = -Math.PI / 2 + (aim + Math.PI / 2) * 0.15 * e;
        hand = r * 0.6;
        raised = true;
      } else {
        wa = aim;
        len = WEAPON_LEN + 10;
      }
    } else if (atk.fire === 'bullet') {
      // 사격: 총을 조준 방향으로 들고, 쏠 때 살짝 반동
      wa = aim;
      if (atk.phase === 'active') hand = r * 0.75 - 8;
    } else if (isDashStep) {
      // 돌진: 무기를 앞으로 모아 당겼다가 몸째 돌파
      wa = aim;
      if (atk.phase === 'telegraph') hand = r * 0.75 - 20 * e;
    } else if (p.shape === 'sector') {
      const side = atk.step % 2 === 0 ? 1 : -1;
      const half = (p.arcDeg * Math.PI) / 360;
      const back = half + 0.5;
      if (atk.phase === 'telegraph') wa = aim + side * (half * 0.6 + 0.5 * e + 0.2);
      else if (atk.phase === 'active') wa = aim + side * back - side * (back + half) * t;
      else wa = aim - side * half;
    } else if (p.shape === 'rect') {
      wa = aim;
      if (atk.phase === 'telegraph') hand = r * 0.75 - 30 * e;
      else if (atk.phase === 'active') {
        hand = r * 0.75 + 25;
        len = WEAPON_LEN + 25;
      }
    } else if (p.anchor === 'self') {
      if (atk.phase === 'telegraph') wa = m.facing + 1.1 + 1.6 * e;
      else if (atk.phase === 'active') wa = m.facing + 2.7 + Math.PI * 2 * t;
      else wa = m.facing + 2.7;
    } else {
      // 점프 내려찍기: 공중에서는 치켜들고, 착지하면 앞으로 내려놓음
      if (atk.phase === 'telegraph') {
        wa = -Math.PI / 2;
        hand = r * 0.6;
        raised = true;
      } else {
        wa = m.facing;
        len = WEAPON_LEN + 10;
      }
    }
  }
  return { wa, hand, len, glow, raised, axis: aim };
}
