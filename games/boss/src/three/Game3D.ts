import { PLAYER } from '../config/balance';
import { BOSS, WEAPON_NAME, type BossPatternId } from '../config/bossBalance';
import { Sfx } from '../audio/Sfx';
import { soundsFor } from '../audio/sfxMap';
import { CombatSystem, separation, type CombatEvent } from '../combat/CombatSystem';
import { PROJECTILE_RULES, ProjectileSystem } from '../combat/Projectiles';
import { BossModel } from '../entities/boss/BossModel';
import { BOSS_HEIGHT } from '../entities/boss/bossBodyPose';
import { PlayerModel } from '../entities/player/PlayerModel';
import { restoreSnapshot, takeSnapshot, type Snapshot } from '../utils/snapshot';
import { DimensionState } from '../dimension/DimensionState';
import { BOSS_DIMENSION } from '../config/dimensionPatterns';
import { NO_INPUT } from '../input/types';
import { DomInput } from './DomInput';
import { RewindHistory } from './RewindHistory';
import { World3D } from './World3D';

const MAX_DT_MS = 50;
const REVIVE_DELAY_MS = 450;
/** 죽은 순간 멈춰 있는 시간 → 그다음 거꾸로 재생하는 시간 */
const REWIND_HOLD_MS = 300;
const REWIND_PLAY_MS = 700;
/** 보스 등장 연출 (이 동안 보스는 움직이지 않음) */
const ENTRANCE_MS = 2200;
const MAX_DEATHS = 5;
const KEEP_REFS = ['cfg', 'bounds'] as const;
/** 되감기용 한 프레임 기록 */
type Frame = { player: Snapshot; boss: Snapshot; projectiles: Snapshot; dim: Snapshot };
const FEEDBACK = {
  playerHitBoss: { hitstopMs: 60, shakeMs: 0, shake: 0 },
  playerParried: { hitstopMs: 130, shakeMs: 120, shake: 0.006 },
  bossHitPlayer: { hitstopMs: 90, shakeMs: 220, shake: 0.012 },
  bossStaggered: { hitstopMs: 160, shakeMs: 250, shake: 0.01 },
} as const;

/** 3D 시험판 HUD (3d.html의 요소) */
interface Hud {
  hp: HTMLElement;
  /** 시점 전환 게이지 */
  gauge: HTMLElement;
  potions: HTMLElement;
  /** 지금 시점 (2D/3D, 잠금) */
  view: HTMLElement;
  stamina: HTMLElement;
  bossHp: HTMLElement;
  bossPosture: HTMLElement;
  retries: HTMLElement;
  debug: HTMLElement;
  toast: HTMLElement;
  camera: HTMLElement;
  overlay: HTMLElement;
  /** 락온 표시 (보스 위에 뜨는 점) */
  reticle: HTMLElement;
  /** 되감기 화면 효과 (주사선 + ◀◀ REWIND) */
  vhs: HTMLElement;
}

/** 이보다 멀면 락온이 풀린다 */
const LOCK_RANGE = 1100;

/**
 * 3D 시험판 게임 루프. 2D GameScene과 같은 순서·같은 모델·같은 판정을 쓴다:
 *   입력 → 플레이어 → 보스 → (발사) → 근접 판정 + 날아가는 물체 → 몸 겹침 → 되감기 지점·사망 → 타격감·효과음 → 그리기
 *
 * 비교용이라 뺀 것: 헬퍼 안내·말풍선, 사망 지도·기록, 체크포인트. (5번째 사망이면 처음부터)
 */
export class Game3D {
  private player!: PlayerModel;
  private boss!: BossModel;
  private combat!: CombatSystem;
  private projectiles!: ProjectileSystem;
  /** 시점 (2D/3D) + 전환 게이지 */
  private dim!: DimensionState;
  private readonly world: World3D;
  private readonly input: DomInput;
  private readonly sfx = new Sfx();
  private readonly arena: { width: number; height: number };

  private rewindPoint: Frame | null = null;
  /** 되감기 지점부터 매 프레임 기록 (죽으면 거꾸로 재생) */
  private readonly history = new RewindHistory<Frame>(900);
  /** 거꾸로 재생 중이면 경과 시간 (ms) */
  private rewindPlayMs: number | null = null;
  private entranceMs = 0;
  private deaths = 0;
  private hitstopMs = 0;
  private pendingReviveMs: number | null = null;
  private paused = false;
  private ended = false;
  private toastMs = 0;
  private lastTime = 0;
  private lockedOn = false;
  /** 시작 전 (클릭해서 마우스를 잡아야 시작) */
  private waitingForClick = true;

  constructor(
    container: HTMLElement,
    private readonly hud: Hud,
    width: number,
    height: number,
  ) {
    this.arena = { width, height };
    this.world = new World3D(container, this.arena, width, height);
    this.input = new DomInput(this.world.renderer.domElement);
    this.reset();

    // 시작·재개: 화면을 클릭하면 마우스를 잡고 진행
    this.hud.overlay.addEventListener('click', () => {
      this.input.requestPointerLock();
      this.waitingForClick = false;
      this.paused = false;
      this.hud.overlay.hidden = !this.ended;
      this.input.reset();
    });
    // 마우스 잠금이 풀리면 (ESC 등) 일시정지
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.isPointerLocked && !this.ended && !this.waitingForClick) this.pause('일시정지 — 클릭해서 계속');
    });
    this.showOverlay('클릭해서 시작 (마우스가 화면에 잡힙니다)');
  }

  start(): void {
    const loop = (t: number) => {
      const dt = this.lastTime ? Math.min(t - this.lastTime, MAX_DT_MS) : 16;
      this.lastTime = t;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** 처음부터 (R, 5번째 사망, 승리 후) */
  private reset(): void {
    const { width, height } = this.arena;
    // 시점 전환 실험판: 한 방 사망 대신 체력 바 + 회복약
    this.player = new PlayerModel(width / 2, height - 150, this.arena, { ...PLAYER, oneHitKill: false });
    this.dim = new DimensionState('3d');
    this.world.setView('3d');
    this.boss = new BossModel(width / 2, 140, this.arena, BOSS_DIMENSION);
    this.combat = new CombatSystem({ bossHittableMaxZ: BOSS.hittableMaxZ });
    this.projectiles = new ProjectileSystem(this.arena, { ...PROJECTILE_RULES, bossHittableMaxZ: BOSS.hittableMaxZ });
    this.deaths = 0;
    this.hitstopMs = 0;
    this.pendingReviveMs = null;
    this.stopRewindFx();
    this.ended = false;
    this.lockedOn = false;
    if (!this.waitingForClick) this.hud.overlay.hidden = true;
    this.entranceMs = ENTRANCE_MS;
    this.world.startEntrance(ENTRANCE_MS);
    this.saveRewindPoint();
    this.world.snapCamera(this.player);
    this.input.reset();
  }

  private frame(dt: number): void {
    if (this.input.justPressed('KeyR')) {
      this.reset();
      if (this.ended || this.paused) this.hud.overlay.hidden = this.waitingForClick ? false : true;
      this.paused = false;
    }
    if (this.input.justPressed('KeyC')) this.showToast(this.world.toggleCamera() === 'overview' ? '카메라: 경기장 전체' : '카메라: 따라가기');
    if (this.input.justPressed('KeyN')) this.showToast(this.sfx.toggleMute() ? '효과음 끔' : '효과음 켬');
    if (this.input.justPressed('KeyP')) this.showToast(this.world.togglePixel() ? '도트 화면' : '보통 화면');
    // (마우스가 잡혀 있을 때 ESC는 브라우저가 잠금 해제에 쓰고, 그때 pointerlockchange로 일시정지됨)
    if (this.input.justPressed('Escape') && !this.ended && !this.waitingForClick && !this.paused) this.pause('일시정지 — 클릭해서 계속');
    this.updateToast(dt);

    if (this.input.takeLockToggle() && !this.paused) {
      this.lockedOn = !this.lockedOn && !this.boss.isDead;
      this.showToast(this.lockedOn ? '락온' : '락온 해제');
    }
    if (this.lockedOn && (this.boss.isDead || Math.hypot(this.boss.x - this.player.x, this.boss.y - this.player.y) > LOCK_RANGE)) {
      this.lockedOn = false;
    }
    const md = this.input.takeMouseDelta();
    if (!this.paused && this.dim.view === '3d') this.world.orbit(md.x, md.y);
    this.world.setLockTarget(this.lockedOn ? { x: this.boss.x, y: this.boss.y } : null);

    if (this.paused || this.ended || this.waitingForClick) {
      this.render(0);
      return;
    }
    if (this.rewindPlayMs !== null) {
      this.playRewind(dt);
      this.render(dt);
      return;
    }
    if (this.pendingReviveMs !== null) {
      this.pendingReviveMs -= dt;
      if (this.pendingReviveMs <= 0) {
        if (this.rewindPoint && this.history.length > 1) this.startRewind();
        else this.revive();
      }
      this.render(dt);
      return;
    }
    if (this.hitstopMs > 0) {
      this.hitstopMs -= dt;
      this.render(dt);
      return;
    }

    // 시점 전환 (E): 게이지 소모. 전환 중 0.3초는 무방비 (입력 없음)
    if (this.input.justPressed('KeyE')) {
      const r = this.dim.requestSwitch();
      if (r === 'switched') this.onViewChanged();
      else if (r === 'noGauge') this.showToast('전환 게이지 부족');
      else if (r === 'locked') this.showToast('지금은 시점을 바꿀 수 없다');
    }
    const read = this.input.read(this.player.x, this.player.y, {
      forward: this.world.forward,
      lockTarget: this.lockedOn && this.dim.view === '3d' ? { x: this.boss.x, y: this.boss.y } : null,
      facing: this.player.facing,
      view: this.dim.view,
    });
    const input = this.dim.switching ? { ...NO_INPUT, aimAngle: this.player.facing } : read;
    const playerEvents = this.player.update(input, dt);
    if (this.entranceMs > 0) this.entranceMs -= dt;
    // 시점 학습: 오래 머문 시점(없으면 지금 시점)을 보스에게 알려 줌 → 그 시점에서 불리한 패턴을 더 고름
    this.boss.viewHint = this.dim.preferred ?? this.dim.view;
    const bossEvents = this.entranceMs > 0 ? [] : this.boss.update({ x: this.player.x, y: this.player.y }, dt);
    for (const e of bossEvents) {
      if (e.type === 'fire') this.projectiles.spawn(e);
      // 보스가 시점을 강제로 바꾸는 패턴: 예고 시작에 전환 + 패턴이 끝날 때까지 잠금
      if (e.type === 'telegraphStart' && e.step === 0) {
        const force = this.boss.attack?.pattern.forceView;
        if (force) {
          const before = this.dim.view;
          this.dim.force(force, this.boss.attackSerial);
          if (before !== this.dim.view) this.onViewChanged(true);
        }
      }
    }
    this.dim.releaseIfDone(this.boss.attack ? this.boss.attackSerial : null);
    this.dim.update(dt);
    this.projectiles.view = this.dim.view;
    const combatEvents: CombatEvent[] = [
      ...this.combat.resolve(this.player, this.boss, this.dim.view),
      ...this.projectiles.update(dt, this.player, this.boss),
    ];
    for (const e of combatEvents) {
      if (e.type === 'playerHitBoss') this.dim.onPlayerHit();
      if (e.type === 'playerParried') this.dim.onParry();
    }
    this.pushPlayerOutOfBoss();

    if (!this.player.isDead && bossEvents.some((e) => e.type === 'telegraphStart' && e.step === 0)) this.saveRewindPoint();
    this.history.push(this.capture());
    for (const e of combatEvents) {
      if (e.type === 'playerHitBoss' || e.type === 'playerParried' || e.type === 'bossHitPlayer' || e.type === 'bossStaggered') {
        const f = FEEDBACK[e.type];
        this.hitstopMs = Math.max(this.hitstopMs, f.hitstopMs);
        if (f.shakeMs > 0) this.world.shake(f.shakeMs, f.shake);
      }
    }
    const died = combatEvents.find((e) => e.type === 'bossHitPlayer');
    if (combatEvents.some((e) => e.type === 'playerDied')) this.onDeath(died?.type === 'bossHitPlayer' ? died.patternId : null);
    if (combatEvents.some((e) => e.type === 'bossDied')) {
      this.ended = true;
      this.lockedOn = false;
      this.showOverlay('SIMULATION COMPLETE — R: 다시');
    }
    this.sfx.play(soundsFor({ player: playerEvents, boss: bossEvents, combat: combatEvents }));
    this.render(dt);
  }

  /** 시점이 바뀜: 화면 연출 + 안내 */
  private onViewChanged(forced = false): void {
    this.world.setView(this.dim.view);
    if (this.dim.view === '2d') this.lockedOn = false;
    this.showToast(`${forced ? '수문장이 시점을 바꿨다 · ' : ''}${this.dim.view === '2d' ? '2D: 정밀' : '3D: 공간'}`);
  }

  private onDeath(patternId: BossPatternId | null): void {
    this.deaths += 1;
    const p = BOSS_DIMENSION.patterns.find((q) => q.id === patternId);
    const cause = p ? `${p.name} (${WEAPON_NAME[p.weapon]})` : '알 수 없는 공격';
    if (this.deaths >= MAX_DEATHS) {
      this.showToast(`${cause}에 맞음 · 5번째 → 처음부터`);
      this.pendingReviveMs = REVIVE_DELAY_MS * 2;
      this.rewindPoint = null; // 되감기 대신 처음부터
      return;
    }
    this.showToast(`${cause}에 맞음 · 남은 재시도 ${MAX_DEATHS - this.deaths}`);
    this.pendingReviveMs = REWIND_HOLD_MS;
  }

  /** 거꾸로 재생 시작: 기록을 죽은 순간 → 되감기 지점 순으로 보여 준다 (보여 주기만, 판정 없음) */
  private startRewind(): void {
    this.pendingReviveMs = null;
    this.rewindPlayMs = 0;
    this.hud.vhs.hidden = false;
    document.body.classList.add('rewinding');
    this.world.rewinding = true;
    this.sfx.play(soundsFor({ scene: ['rewind'] }));
  }

  private playRewind(dt: number): void {
    this.rewindPlayMs = (this.rewindPlayMs ?? 0) + dt;
    const progress = this.rewindPlayMs / REWIND_PLAY_MS;
    const f = this.history.frameAt(progress);
    if (f) {
      restoreSnapshot(this.player, f.player);
      restoreSnapshot(this.boss, f.boss);
      restoreSnapshot(this.projectiles, f.projectiles);
      restoreSnapshot(this.dim, f.dim);
      this.world.setView(this.dim.view);
    }
    if (progress >= 1) this.revive(false);
  }

  private stopRewindFx(): void {
    this.rewindPlayMs = null;
    this.hud.vhs.hidden = true;
    document.body.classList.remove('rewinding');
    this.world.rewinding = false;
  }

  private revive(withSound = true): void {
    this.pendingReviveMs = null;
    this.stopRewindFx();
    if (!this.rewindPoint) {
      this.reset();
      return;
    }
    restoreSnapshot(this.player, this.rewindPoint.player);
    this.player.recoverAfterRewind();
    restoreSnapshot(this.boss, this.rewindPoint.boss);
    restoreSnapshot(this.projectiles, this.rewindPoint.projectiles);
    restoreSnapshot(this.dim, this.rewindPoint.dim);
    this.world.setView(this.dim.view);
    this.combat = new CombatSystem({ bossHittableMaxZ: BOSS.hittableMaxZ });
    this.hitstopMs = 0;
    this.input.reset();
    this.history.clear();
    this.history.push(this.capture());
    if (withSound) this.sfx.play(soundsFor({ scene: ['rewind'] }));
  }

  private capture(): Frame {
    return {
      player: takeSnapshot(this.player, KEEP_REFS),
      boss: takeSnapshot(this.boss, KEEP_REFS),
      projectiles: takeSnapshot(this.projectiles, ['bounds', 'rules']),
      dim: takeSnapshot(this.dim, KEEP_REFS),
    };
  }

  private saveRewindPoint(): void {
    this.rewindPoint = this.capture();
    this.history.clear();
    this.history.push(this.rewindPoint);
  }

  private pushPlayerOutOfBoss(): void {
    if (this.boss.isDead || this.boss.z > BOSS.hittableMaxZ) return;
    // 2D에서는 깊이를 무시하고 좌우로만 밀어냄 (보이지 않는 깊이로 밀리면 이상함)
    const by = this.dim.view === '2d' ? this.player.y : this.boss.y;
    const push = separation(this.player.x, this.player.y, PLAYER.radius, this.boss.x, by, BOSS.radius);
    if (push.dx !== 0 || push.dy !== 0) this.player.nudge(push.dx, push.dy);
  }

  private render(dt: number): void {
    this.world.draw(this.player, this.boss, this.projectiles.projectiles, dt);
    const h = this.hud;
    h.hp.style.width = `${(this.player.hp / PLAYER.maxHp) * 100}%`;
    h.gauge.style.width = `${this.dim.gauge}%`;
    h.gauge.classList.toggle('ready', this.dim.canSwitch);
    h.potions.textContent = '◆'.repeat(this.player.potions) + '◇'.repeat(Math.max(0, (PLAYER.potion?.count ?? 0) - this.player.potions));
    h.view.textContent = `${this.dim.view.toUpperCase()}${this.dim.locked ? ' 🔒' : ''}`;
    h.stamina.style.width = `${(this.player.stamina / PLAYER.maxStamina) * 100}%`;
    h.bossHp.style.width = `${(this.boss.hp / BOSS.maxHp) * 100}%`;
    h.bossPosture.style.width = `${(this.boss.posture / BOSS.posture.max) * 100}%`;
    h.retries.textContent = `재시도 ${'●'.repeat(MAX_DEATHS - this.deaths)}${'○'.repeat(this.deaths)}`;
    h.camera.textContent = this.world.cameraMode === 'overview' ? '카메라: 경기장 전체' : this.lockedOn ? '락온' : '자유 시점';
    // 락온 표시: 보스 가슴 높이에 점
    const mark = this.lockedOn ? this.world.project(this.boss.x, this.boss.y, this.boss.z + BOSS_HEIGHT * 0.68) : null; // 가슴 코어
    h.reticle.hidden = !mark;
    if (mark) h.reticle.style.transform = `translate(${mark.x}px, ${mark.y}px)`;
    const atk = this.boss.attack;
    h.debug.textContent = atk
      ? `보스: ${atk.pattern.name}${atk.stepCount > 1 ? ` ${atk.step + 1}/${atk.stepCount}타` : ''} (${atk.phase}${atk.phase === 'telegraph' ? (atk.locked ? ' 고정' : ' 추적') : ''})${atk.parryable ? '' : ' [패링 불가]'} · ${WEAPON_NAME[this.boss.weapon]}`
      : `보스: ${this.boss.state} · ${WEAPON_NAME[this.boss.weapon]}`;
  }

  private pause(text: string): void {
    this.paused = true;
    this.showOverlay(text);
  }

  private showOverlay(text: string): void {
    this.hud.overlay.textContent = text;
    this.hud.overlay.hidden = false;
  }

  private showToast(text: string): void {
    this.hud.toast.textContent = text;
    this.hud.toast.style.opacity = '1';
    this.toastMs = 1600;
  }

  private updateToast(dt: number): void {
    if (this.toastMs <= 0) return;
    this.toastMs -= dt;
    this.hud.toast.style.opacity = String(Math.max(0, Math.min(1, this.toastMs / 400)));
  }
}
