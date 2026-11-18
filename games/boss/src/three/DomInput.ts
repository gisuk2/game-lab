import { ClickQueue } from '../input/ClickQueue';
import type { PlayerInput } from '../input/types';
import type { Vec2 } from '../utils/geometry';

/**
 * 3D 입력 (소울류 조작, Phaser 없이 브라우저 이벤트로 직접).
 *
 *   WASD          3D: 카메라 기준 이동 (W = 화면 앞쪽) / 2D: A·D 좌우만
 *   마우스         카메라 돌리기 (3D만. 화면을 클릭하면 마우스가 화면에 잡힘 = 포인터 잠금)
 *   좌클릭         공격 (꾹 = 연속)
 *   우클릭         패링
 *   Space         점프
 *   Shift         구르기
 *   F             회복약
 *   E             시점 전환 (Game이 직접 읽음)
 *   Q / 휠 클릭    락온 켜기·끄기 (3D)
 *
 * 공격·구르기 방향: 락온 중이면 보스 쪽, 아니면 이동하는 쪽 (가만히 있으면 지금 보는 쪽).
 */
export interface AimContext {
  /** 카메라가 바라보는 바닥 방향 (단위 벡터) */
  forward: Vec2;
  /** 락온 대상 위치 (없으면 null) */
  lockTarget: Vec2 | null;
  /** 지금 캐릭터가 보는 방향 */
  facing: number;
  /** 시점 (없으면 3D) */
  view?: '2d' | '3d';
}

export class DomInput {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly clicks = new ClickQueue();
  private leftDown = false;
  private mouseDx = 0;
  private mouseDy = 0;
  private lockToggled = false;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'KeyQ') this.lockToggled = true;
      if (e.code === 'Space' || e.code === 'Tab' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.leftDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      // 마우스가 아직 잡히지 않았으면: 이번 클릭은 잡기만 하고 공격으로 쓰지 않음
      if (!this.isPointerLocked) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 2) this.clicks.pushParry();
      if (e.button === 1) {
        this.lockToggled = true;
        e.preventDefault();
      }
      if (e.button === 0) {
        this.clicks.pushAttack();
        this.leftDown = true;
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.leftDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    });
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined); // 거절돼도 게임은 계속
    } catch {
      /* 지원하지 않는 환경 */
    }
  }

  /** 이 키가 이번 프레임에 눌렸는가 (한 번 확인하면 사라짐) */
  justPressed(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  /** 락온 키(Q·휠 클릭)가 눌렸는가 (한 번 확인하면 사라짐) */
  takeLockToggle(): boolean {
    const t = this.lockToggled;
    this.lockToggled = false;
    return t;
  }

  /** 지난 프레임 이후 마우스 이동량 (카메라 돌리기) */
  takeMouseDelta(): Vec2 {
    const d = { x: this.mouseDx, y: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return d;
  }

  read(playerX: number, playerY: number, ctx: AimContext): PlayerInput {
    const k = this.held;
    const ahead = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const move = ctx.view === '2d' ? sideMove(side) : cameraRelativeMove(ahead, side, ctx.forward);
    const clicks = this.clicks.take();
    return {
      moveX: move.x,
      moveY: move.y,
      aimAngle: ctx.view === '2d' ? sideAim(side, ctx.facing) : aimAngleFor(playerX, playerY, move, ctx),
      attack: clicks.attack,
      attackHeld: this.leftDown,
      parry: clicks.parry,
      dash: this.justPressed('ShiftLeft') || this.justPressed('ShiftRight'),
      jump: this.justPressed('Space'),
      heal: this.justPressed('KeyF'),
    };
  }

  /** 일시정지·되감기 뒤: 쌓인 클릭·"눌린 순간"·마우스 이동을 버린다 */
  reset(): void {
    this.clicks.clear();
    this.pressed.clear();
    this.lockToggled = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
  }
}

/**
 * 카메라 기준 이동 (순수 함수): 앞(+1)/뒤(-1), 오른쪽(+1)/왼쪽(-1) → 모델 좌표의 이동 벡터.
 * 모델 좌표는 y가 아래로 커지므로, 앞 방향 f의 오른쪽은 (-f.y, f.x).
 */
export function cameraRelativeMove(ahead: number, side: number, forward: Vec2): Vec2 {
  return {
    x: forward.x * ahead + -forward.y * side,
    y: forward.y * ahead + forward.x * side,
  };
}

/** 공격·구르기 방향 (순수 함수): 락온이면 대상 쪽, 아니면 이동하는 쪽, 가만히 있으면 지금 보는 쪽 */
export function aimAngleFor(px: number, py: number, move: Vec2, ctx: AimContext): number {
  if (ctx.lockTarget) return Math.atan2(ctx.lockTarget.y - py, ctx.lockTarget.x - px);
  if (move.x !== 0 || move.y !== 0) return Math.atan2(move.y, move.x);
  return ctx.facing;
}

/** 2D 이동 (순수 함수): 좌우만. 화면 오른쪽 = 모델 +x */
export function sideMove(side: number): Vec2 {
  return { x: side, y: 0 };
}

/** 2D 방향 (순수 함수): 움직이는 쪽, 가만히 있으면 지금 보는 쪽을 왼쪽/오른쪽으로 맞춤 */
export function sideAim(side: number, facing: number): number {
  if (side > 0) return 0;
  if (side < 0) return Math.PI;
  return Math.cos(facing) >= 0 ? 0 : Math.PI;
}
