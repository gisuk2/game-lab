/**
 * 게임 수치 모음. 모든 값은 임시값이며 플레이테스트로 조정한다.
 * 시간 단위: ms / 거리 단위: px / 각도 단위: 도(deg, 코드에서 라디안으로 변환)
 */

export interface AttackHitConfig {
  /** 공격 판정이 나오기 전 준비 시간 (이 동안도 취소 불가) */
  startupMs: number;
  /** 공격 판정이 켜져 있는 시간 */
  activeMs: number;
  /** 공격 후 경직 */
  recoveryMs: number;
  /**
   * 다음 타로 이어지는 시점 (경직 시간 대비 비율, 0~1).
   * 0.5 → 경직의 절반을 거친 뒤 다음 타가 나간다. 마지막 타에서는 쓰이지 않는다.
   * 공격 입력은 공격 중 언제든 예약되며, 실제로 나가는 시점만 이 값으로 정해진다.
   */
  comboLinkFrom: number;
  damage: number;
  /** 부채꼴 판정의 반지름 */
  range: number;
  /** 부채꼴 판정의 각도 (도) */
  arcDeg: number;
  staminaCost: number;
  /**
   * 공격 중 이동 속도 (평소 이동 속도 대비 비율). 0이면 제자리 고정.
   * 공격 방향은 움직여도 바뀌지 않는다.
   */
  moveSpeedRatio: number;
  /** 경직 중 대시 캔슬 허용 여부 (기본 true). 3타는 false = 하이리스크 */
  dashCancelable?: boolean;
  /** 보스 자세 게이지에 쌓이는 양의 배율 (기본 1). 3타는 2 = 하이리턴 */
  postureMultiplier?: number;
  /** 판정 모양 (기본 'sector'). 'rect'면 range = 길이, width = 폭 */
  shape?: 'sector' | 'rect';
  width?: number;
  /** 준비 동안 공격 방향으로 미끄러지는 거리 (기본 0) */
  lungeDistance?: number;
}

export interface PlayerConfig {
  radius: number;
  moveSpeed: number;
  /** 멈춤 → 최고 속도까지 걸리는 시간 (짧은 가속: 딱딱하지 않게) */
  moveAccelMs: number;
  /** 최고 속도 → 멈춤까지 걸리는 시간 */
  moveDecelMs: number;
  maxHp: number;
  /** 키 (높이 판정용: 점프로 낮은 공격 넘기) */
  height?: number;
  /** 점프: 처음 위로 속도(px/s), 중력(px/s²). 최고 높이 = velocity² / (2·gravity) */
  jump?: { velocity: number; gravity: number };
  /** 회복약: 개수, 회복량, 마시는 시간 (마시는 동안 못 움직이고 맞으면 끊김) */
  potion?: { count: number; heal: number; drinkMs: number };
  maxStamina: number;
  staminaRegenPerSec: number;
  /** 스태미나를 쓴 뒤 회복이 시작되기까지의 지연 */
  staminaRegenDelayMs: number;
  /**
   * 구르기 (코드에서는 예전 이름 dash를 그대로 쓴다).
   *   0 ─ invulnStartMs ─ (무적 invulnMs) ─ … durationMs(이동 끝) ─ recoveryMs(끝 경직) ─ 끝
   * 이동은 처음에 빠르고 끝에서 느려진다. 끝 경직 동안은 아무것도 못 한다 (구르기 공격만 예외).
   */
  dash: {
    distance: number;
    /** 이동하는 시간 */
    durationMs: number;
    /** 무적이 시작되는 시각 */
    invulnStartMs: number;
    /** 무적 시간 */
    invulnMs: number;
    /** 이동이 끝난 뒤의 경직 (커밋) */
    recoveryMs: number;
    staminaCost: number;
  };
  /** 콤보 순서대로 1타, 2타, 3타 */
  attackHits: AttackHitConfig[];
  /**
   * 대시 찌르기: 대시 중 클릭(대시가 끝나면 바로 나감) 또는 대시가 끝난 뒤 inputWindowMs 안에 클릭.
   * 콤보로 이어지지 않는다 (찌른 뒤 다시 공격하면 1타부터).
   */
  dashAttack: {
    inputWindowMs: number;
    hit: AttackHitConfig;
  };
  /**
   * 공격 경직(recovery) 중 대시로 캔슬할 수 있게 되는 시점 (경직 시간 대비 비율, 0~1).
   * 0.4 → 경직의 앞 40%는 캔슬 불가, 뒤 60%는 대시로 캔슬 가능.
   * 준비(startup)·판정(active) 중에는 항상 캔슬 불가 (동작 고정).
   */
  attackDashCancelFrom: number;
  parry: {
    /** 패링 판정이 켜져 있는 시간 */
    activeMs: number;
    /** 패링 후 경직 */
    recoveryMs: number;
    staminaCost: number;
  };
  /**
   * 한 방 사망: 보스의 모든 공격에 한 번 맞으면 쓰러진다 (docs/design/learning-feedback.md §5.1).
   * false면 예전처럼 피해만큼 체력이 준다 (쉬운 모드 등 대비).
   */
  oneHitKill: boolean;

  hit: {
    /** 맞았을 때 아무것도 못 하는 시간 */
    stunMs: number;
    /** 맞은 반대 방향으로 밀려나는 거리 */
    knockback: number;
  };
}

export const PLAYER: PlayerConfig = {
  radius: 12,
  moveSpeed: 220,
  moveAccelMs: 90,
  moveDecelMs: 70,
  maxHp: 100,
  height: 60,
  jump: { velocity: 430, gravity: 1450 },
  potion: { count: 3, heal: 45, drinkMs: 700 },
  maxStamina: 100,
  staminaRegenPerSec: 20,
  staminaRegenDelayMs: 500,
  dash: {
    distance: 120,
    durationMs: 400,
    invulnStartMs: 20,
    invulnMs: 300,
    recoveryMs: 150,
    staminaCost: 25,
  },
  attackHits: [
    { startupMs: 220, activeMs: 100, recoveryMs: 300, comboLinkFrom: 0.5, damage: 10, range: 56, arcDeg: 100, staminaCost: 6, moveSpeedRatio: 0.45 },
    { startupMs: 200, activeMs: 100, recoveryMs: 320, comboLinkFrom: 0.7, damage: 10, range: 56, arcDeg: 100, staminaCost: 6, moveSpeedRatio: 0.45 },
    // 3타: 한 바퀴 베기. 충전이 길고 경직 중 대시 캔슬 불가(리스크), 피해·자세 게이지가 큼(리턴)
    {
      startupMs: 550, activeMs: 140, recoveryMs: 700, comboLinkFrom: 1, damage: 35, range: 90, arcDeg: 360, staminaCost: 9,
      moveSpeedRatio: 0, dashCancelable: false, postureMultiplier: 2,
    },
  ],
  dashAttack: {
    inputWindowMs: 150,
    hit: {
      startupMs: 120, activeMs: 100, recoveryMs: 350, comboLinkFrom: 1, damage: 14, range: 80, arcDeg: 0, staminaCost: 6,
      moveSpeedRatio: 0, shape: 'rect', width: 26, lungeDistance: 30,
    },
  },
  attackDashCancelFrom: 0.4,
  parry: {
    activeMs: 150,
    recoveryMs: 250,
    staminaCost: 18,
  },
  oneHitKill: true,
  hit: {
    stunMs: 350,
    knockback: 36,
  },
};
