import * as THREE from 'three';
import type { WeaponId } from '../config/bossBalance';
import type { Projectile } from '../combat/Projectiles';
import type { BossModel } from '../entities/boss/BossModel';
import { weaponPose } from '../entities/boss/weaponPose';
import type { Bounds, PlayerModel } from '../entities/player/PlayerModel';
import { expandShape, shapeOutline, type AttackShape } from '../utils/shapes';
import { cameraBias, isBigAttack, type CameraBias } from './cameraDirector';
import { Mannequin } from './Mannequin';
import { shapeXRange, type View } from '../dimension/projection';
import { BossRig } from './BossRig';
import { BOSS_HEIGHT, bossBodyPose } from '../entities/boss/bossBodyPose';
import { playerPose } from '../entities/player/playerPose';
import type { Vec2 } from '../utils/geometry';

/**
 * 3D 시험판 화면 (Three.js). 로직은 2D와 같은 모델을 그대로 읽어서 그린다.
 *
 * 좌표: 모델의 (x, y) → 3D의 (X, Z). 모델의 높이 z(점프) → 3D의 Y. 1 단위 = 2D의 1px.
 * 모양: 흑백 + 빨강(위험). 플레이어 = 원기둥, 보스 = 육각기둥, 무기 = 단순한 입체.
 * 카메라 (소울류 3인칭):
 *   'follow'   = 플레이어 등 뒤에서 따라감. 마우스로 돌림 (orbit)
 *   락온        = 카메라가 플레이어 뒤에서 보스 쪽을 바라보도록 자동으로 돌아감 (플레이어와 보스를 한 화면에)
 *   'overview' = 경기장 전체 (페이즈 패턴 화면 전환 미리보기, C 키)
 */
export type CameraMode = 'follow' | 'overview';

/** 카메라 설정 */
const CAM = {
  fov: 55,
  distance: 240,
  /** 기본 내려다보는 각도 (라디안) */
  pitch: 0.34,
  pitchMin: 0.08,
  pitchMax: 0.95,
  /** 마우스 1px당 회전 (라디안) */
  sensitivity: 0.0032,
  /** 마우스 회전을 따라가는 시간 상수 (ms, 작을수록 즉각) — 툭툭 끊기지 않게 */
  mouseSmoothMs: 45,
  /** 어깨 너머: 카메라를 오른쪽으로 비킴 (플레이어가 화면 중앙을 가리지 않게) */
  shoulder: 26,
  /** 바라보는 높이 (플레이어 어깨쯤) */
  lookHeight: 40,
  /** 카메라 위치를 따라가는 시간 상수 (ms) */
  followMs: 110,
  /** 락온: 보스 쪽으로 도는 스프링 강도 (클수록 빠름). 감쇠는 임계 감쇠 → 처음·끝이 부드러움 */
  lockStiffness: 28,
  lockPitch: 0.3,
  /** 락온 프레이밍: 이 거리보다 가까우면 뒤로 빠지고 위로 들림 */
  lockCloseDist: 420,
  lockPullBack: 120,
  /** 락온 중 바라보는 높이를 보스 키에 맞춰 올림: 기본 + 가까울수록 더 (머리까지 담기게) */
  lockLookBase: 0.12,
  lockLookRaise: 0.22,
  /** 바꿔 넣는 값(보스 패턴 반응·충격)을 따라가는 시간 상수 (ms) */
  biasSmoothMs: 180,
};

/**
 * 2D 시점 카메라: 정면(경기장 앞쪽)에서 아주 멀리, 아주 좁은 화각 → 거의 평면(직교)처럼 보임.
 * 보이는 높이 ≈ 2 · distance · tan(fov/2) ≈ 360 (도트 기준 화면 높이), 가로 ≈ 640.
 */
const SIDE = {
  distance: 1800,
  fov: 11.4,
  lookHeight: 150,
  /** 플레이어와 보스 사이 어디를 볼지 (0 = 플레이어, 1 = 보스) */
  towardBoss: 0.3,
  /** 시점이 바뀌는 연출 시간 (ms) — 판정은 바로 바뀌고 화면만 따라감 */
  blendMs: 400,
};

/** 시간 상수 tau(ms)로 부드럽게 따라갈 때 이번 프레임 비율 */
const follow = (dtMs: number, tauMs: number) => 1 - Math.exp(-dtMs / Math.max(1, tauMs));
/** 플레이어 몸이 도는 최대 속도 (라디안/초) — 즉시 휙 돌지 않게 */
const PLAYER_TURN_SPEED = 14;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const BLACK = 0x111111;
const RED = 0xd62828;
const GREY = 0x888888;
/** 바닥 예고가 바닥과 겹쳐 깜빡이지 않도록 살짝 띄움 */
const DECAL_Y = 0.6;

/** 모델 각도(2D, y 아래쪽) → Three.js의 Y축 회전값 (+X를 그 방향으로 돌림) */
const yaw = (a: number) => -a;

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private readonly player = new THREE.Group();
  private readonly mannequin = new Mannequin();
  /** 걸음 위상 (이동 거리로 쌓음) */
  private walkPhase = 0;
  private lastPlayerPos: { x: number; y: number } | null = null;
  private clockMs = 0;
  private readonly boss = new THREE.Group();
  private readonly bossRig = new BossRig();
  private bossWalkPhase = 0;
  private bossMove = 0;
  private lastBossPos: { x: number; y: number } | null = null;
  /** 등장 연출 남은 시간 (ms) */
  private entranceMs = 0;

  /** 2D 시점에서 보이는 공격 범위 (세로 띠: 좌우 구간 × 높이) */
  private readonly sideDanger: THREE.Mesh;
  private readonly sideDangerMat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  /** 목표 시점과 화면 섞임 정도 (0 = 3D, 1 = 2D) */
  private viewTarget: View = '3d';
  private viewBlend = 0;
  /** 도트 렌더링 (낮은 해상도 + 픽셀 그대로 확대) */
  private pixel = true;
  private readonly telegraph: Decal;
  private readonly telegraphOuter: Decal;
  private readonly playerSwing: Decal;
  private readonly projectileMeshes = new Map<number, THREE.Mesh>();

  private mode: CameraMode = 'follow';
  /** 카메라가 바라보는 방향 (모델 좌표의 각도). 카메라는 플레이어의 반대편 뒤쪽에 있다 */
  private camYaw = -Math.PI / 2; // 시작: 위쪽(보스 쪽)을 바라봄
  private camPitch = CAM.pitch;
  /** 마우스가 가리키는 목표 각도 (실제 각도는 이걸 부드럽게 따라감) */
  private targetYaw = -Math.PI / 2;
  private targetPitch = CAM.pitch;
  private yawVel = 0;
  private lock: { x: number; y: number } | null = null;
  /** 패턴 반응 값 (부드럽게 따라가는 현재값) */
  private bias: CameraBias = { distance: 0, pitch: 0, lookHeight: 0 };
  /** 충격 때 화각을 잠깐 좁힘 (줌 펀치) */
  private punchMs = 0;
  private punchAmount = 0;
  /** 화면에 보이는 플레이어 몸 방향 (부드럽게 돌아감) */
  private playerYaw = -Math.PI / 2;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private lastDt = 16;
  private wasBigActive = false;
  private entranceTotal = 0;
  /** 되감기 재생 중 (거꾸로 지나가는 공격에 펀치가 터지지 않게) */
  rewinding = false;
  private shakeMs = 0;
  private shakeAmp = 0;

  constructor(
    container: HTMLElement,
    private readonly arena: Bounds,
    width: number,
    height: number,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.applyPixel();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // r187에서 PCFSoftShadowMap 제거됨 (콘솔 경고로 확인)
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xffffff);
    this.camera = new THREE.PerspectiveCamera(CAM.fov, width / height, 5, 8000);

    this.buildLights();
    this.buildArena();

    // 플레이어: 관절 마네킹 (자세는 playerPose)
    this.player.add(this.mannequin.root);
    this.scene.add(this.player);

    // 보스: 거대 관절 로봇 (홀로그램). 무기 방향은 2D와 같은 weaponPose, 몸은 bossBodyPose
    this.boss.add(this.bossRig.root);
    this.renderer.localClippingEnabled = true; // 등장 연출(아래에서 위로 그려짐)
    this.scene.add(this.boss);

    this.sideDanger = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.sideDangerMat);
    this.sideDanger.renderOrder = 10;
    this.sideDanger.visible = false;
    this.scene.add(this.sideDanger);
    this.telegraph = new Decal(this.scene, RED);
    this.telegraphOuter = new Decal(this.scene, RED);
    this.playerSwing = new Decal(this.scene, 0x000000);
  }

  get cameraMode(): CameraMode {
    return this.mode;
  }

  toggleCamera(): CameraMode {
    this.mode = this.mode === 'follow' ? 'overview' : 'follow';
    return this.mode;
  }

  shake(ms: number, amp: number): void {
    this.shakeMs = Math.max(this.shakeMs, ms);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  /** 마우스로 카메라 돌리기 (락온 중엔 무시) */
  orbit(dx: number, dy: number): void {
    if (this.lock || this.mode === 'overview') return;
    this.targetYaw += dx * CAM.sensitivity;
    this.targetPitch = Math.min(CAM.pitchMax, Math.max(CAM.pitchMin, this.targetPitch + dy * CAM.sensitivity));
  }

  /** 시점 바꾸기 (화면은 SIDE.blendMs 동안 넘어감) */
  setView(v: View): void {
    this.viewTarget = v;
  }

  /** 도트 렌더링 켜기/끄기 (P 키) */
  togglePixel(): boolean {
    this.pixel = !this.pixel;
    this.applyPixel();
    return this.pixel;
  }

  private applyPixel(): void {
    // 화면 크기는 그대로, 그리는 해상도만 절반 → 2배 확대된 큰 픽셀
    this.renderer.setPixelRatio(this.pixel ? 0.5 : Math.min(2, window.devicePixelRatio || 1));
  }

  /** 2D 시점 섞임 정도 (0 = 3D, 1 = 2D) */
  get sideAmount(): number {
    const t = this.viewBlend;
    return t * t * (3 - 2 * t);
  }

  /** 충격 연출: 화각을 잠깐 좁혔다가(다가간 느낌) 돌아옴 */
  punch(ms: number, degrees: number): void {
    this.punchMs = Math.max(this.punchMs, ms);
    this.punchAmount = Math.max(this.punchAmount, degrees);
  }

  /** 락온 대상 (보스 위치). null이면 해제 */
  setLockTarget(target: { x: number; y: number } | null): void {
    this.lock = target;
  }

  /** 카메라가 바라보는 바닥 방향 (모델 좌표 단위 벡터) → 카메라 기준 이동에 쓴다 */
  get forward(): Vec2 {
    return { x: Math.cos(this.camYaw), y: Math.sin(this.camYaw) };
  }

  /** 모델 좌표의 점(높이 h) → 화면 픽셀 (카메라 뒤면 null). 락온 표시용 */
  project(x: number, y: number, h: number): Vec2 | null {
    const v = new THREE.Vector3(x, h, y).project(this.camera);
    if (v.z > 1) return null;
    const size = this.renderer.getSize(new THREE.Vector2());
    return { x: ((v.x + 1) / 2) * size.x, y: ((1 - v.y) / 2) * size.y };
  }

  /** 정규화 화면 좌표 → 바닥(Y=0) 위의 점 (모델 좌표) */
  toGround(ndc: Vec2): Vec2 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  /** 카메라를 목표 위치로 바로 옮김 (시작·되감기) */
  snapCamera(p: PlayerModel): void {
    this.playerYaw = p.facing;
    const { pos, look } = this.cameraTarget(p);
    this.camPos.copy(pos);
    this.camLook.copy(look);
  }

  draw(p: PlayerModel, b: BossModel, projectiles: readonly Projectile[], dtMs: number): void {
    this.lastDt = dtMs;
    this.drawPlayer(p);
    this.drawBoss(b, p);
    this.drawTelegraph(b, p);
    this.drawPlayerSwing(p);
    this.drawProjectiles(projectiles);
    this.updateCamera(p, b, dtMs);
    this.renderer.render(this.scene, this.camera);
  }

  // ───────────────────────── 장면 ─────────────────────────

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(this.arena.width * 0.3, 900, -200);
    sun.target.position.set(this.arena.width / 2, 0, this.arena.height / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -700;
    c.right = 700;
    c.top = 600;
    c.bottom = -600;
    c.near = 100;
    c.far = 2500;
    this.scene.add(sun, sun.target);
  }

  private buildArena(): void {
    const { width: w, height: h } = this.arena;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(w / 2, 0, h / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 60px 격자 (거리감)
    const pts: number[] = [];
    for (let x = 0; x <= w; x += 60) pts.push(x, 0.2, 0, x, 0.2, h);
    for (let z = 0; z <= h; z += 60) pts.push(0, 0.2, z, w, 0.2, z);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0xdddddd })));

    // 낮은 벽 (경기장 경계)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const wall = (x: number, z: number, sx: number, sz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 16, sz), wallMat);
      m.position.set(x, 8, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    wall(w / 2, -6, w + 24, 12);
    wall(w / 2, h + 6, w + 24, 12);
    wall(-6, h / 2, 12, h);
    wall(w + 6, h / 2, 12, h);
  }

  // ───────────────────────── 플레이어 ─────────────────────────

  private drawPlayer(p: PlayerModel): void {
    this.player.position.set(p.x, p.z, p.y);
    // 몸은 목표 방향으로 부드럽게 돈다 (판정 방향은 모델의 facing 그대로 즉시)
    const maxTurn = PLAYER_TURN_SPEED * (this.lastDt / 1000);
    const turn = wrap(p.facing - this.playerYaw);
    this.playerYaw = wrap(this.playerYaw + Math.max(-maxTurn, Math.min(maxTurn, turn)));
    if (p.isDead || p.state === 'dash') this.playerYaw = p.facing; // 구르기·쓰러짐은 바로
    this.player.rotation.y = yaw(this.playerYaw);
    this.player.visible = true;

    // 걸음 위상: 실제로 움직인 거리만큼 (보폭 34마다 반 주기)
    if (this.lastPlayerPos) {
      const moved = Math.hypot(p.x - this.lastPlayerPos.x, p.y - this.lastPlayerPos.y);
      if (moved < 40) this.walkPhase += (moved / 34) * Math.PI; // 되감기 등 순간이동은 무시
    }
    this.lastPlayerPos = { x: p.x, y: p.y };
    this.clockMs += this.lastDt;

    const atk = p.attack;
    const pose = playerPose({
      state: p.state,
      z: p.z,
      stateMs: p.stateMs,
      moveRatio: p.moveRatio,
      walkPhase: this.walkPhase,
      dashProgress: p.dashProgress,
      invulnerable: p.isInvulnerable,
      attack: atk
        ? { kind: atk.kind, comboIndex: atk.comboIndex, phase: atk.phase, phaseProgress: atk.phaseProgress, arcRad: atk.arcRad, rel: wrap(atk.angle - this.playerYaw) }
        : null,
      timeMs: this.clockMs,
    });
    this.mannequin.apply(pose);
    this.mannequin.tint(p.state === 'hit' ? GREY : null);
  }

  private drawPlayerSwing(p: PlayerModel): void {
    const atk = p.attack;
    if (!atk || atk.phase !== 'active') {
      this.playerSwing.hide();
      return;
    }
    this.playerSwing.show(atk.shape, 0.16, null);
  }

  // ───────────────────────── 보스 ─────────────────────────

  /** 보스 등장 연출 시작 (아래에서 위로 그려지며 나타남) */
  startEntrance(ms: number): void {
    this.entranceMs = ms;
    this.entranceTotal = ms;
  }

  private drawBoss(b: BossModel, p: PlayerModel): void {
    this.boss.position.set(b.x, b.z, b.y);
    this.boss.rotation.y = yaw(b.facing);

    // 걸음: 실제로 움직인 거리로 (보폭 90마다 반 주기)
    if (this.lastBossPos && this.lastDt > 0) {
      const moved = Math.hypot(b.x - this.lastBossPos.x, b.y - this.lastBossPos.y);
      if (moved < 60 && b.z === 0) {
        this.bossWalkPhase += (moved / 90) * Math.PI;
        const speed = (moved / this.lastDt) * 1000;
        this.bossMove += (Math.min(1, speed / 160) - this.bossMove) * follow(this.lastDt, 120);
      }
    }
    this.lastBossPos = { x: b.x, y: b.y };

    const pose = weaponPose(b, b.radius);
    const swap = b.weaponSwap;
    // 무기 교체: 이전 무기가 깜빡이며 사라지고 새 무기가 나타남 (2D와 같은 흐름)
    let shown: WeaponId = b.weapon;
    let alpha = 1;
    if (swap) {
      const flicker = Math.floor(swap.progress * 20) % 2 === 0 ? 1 : 0.35;
      shown = swap.progress < 0.5 ? swap.from : swap.to;
      alpha = (swap.progress < 0.5 ? 1 - swap.progress * 2 : swap.progress * 2 - 1) * flicker;
    }
    const atk = b.attack;
    const body = bossBodyPose({
      state: b.state,
      stateMs: b.stateMs,
      facing: b.facing,
      z: b.z,
      moveRatio: atk ? 0 : this.bossMove,
      walkPhase: this.bossWalkPhase,
      timeMs: this.clockMs,
      weapon: shown,
      pose,
      attack: atk ? { phase: atk.phase, phaseProgress: atk.phaseProgress, parryable: atk.parryable, ranged: atk.fire !== null } : null,
      lookRel: Math.atan2(p.y - b.y, p.x - b.x) - b.facing,
      targetDist: Math.hypot(p.x - b.x, p.y - b.y),
    });
    this.bossRig.apply(body);
    this.bossRig.showWeapon(shown, b.isDead ? 0 : alpha, pose.glow);
    // 홀로그램 흔들림: 가끔 짧게
    const flicker = !b.isDead && Math.random() < 0.035 ? 0.4 + Math.random() * 0.6 : 0;
    this.bossRig.setLook({ hitFlash: b.hitFlashMs > 0, dim: b.isStaggered || b.isResting, dead: b.isDead, flicker });

    if (this.entranceMs > 0) this.entranceMs = Math.max(0, this.entranceMs - this.lastDt);
    this.bossRig.setMaterialize(this.entranceTotal > 0 ? 1 - this.entranceMs / this.entranceTotal : 1);
  }

  private drawTelegraph(b: BossModel, p: PlayerModel): void {
    const atk = b.attack;
    this.drawSideDanger(b, p);
    if (!atk || this.sideAmount > 0.6) {
      this.telegraph.hide();
      this.telegraphOuter.hide();
      return;
    }
    let fill = 0;
    let line = 0;
    if (atk.phase === 'telegraph') {
      fill = (0.05 + 0.18 * atk.phaseProgress) * (atk.locked ? 1 : 0.6);
      line = atk.locked ? 1 : 0.5;
    } else if (atk.phase === 'active') {
      fill = atk.melee ? 0.45 : 0;
      line = atk.melee ? 1 : 0;
    } else {
      fill = 0;
      line = 0.5 * (1 - atk.phaseProgress);
    }
    if (fill <= 0 && line <= 0) {
      this.telegraph.hide();
      this.telegraphOuter.hide();
      return;
    }
    this.telegraph.show(atk.shape, fill, line > 0 ? line : null);
    if (!atk.parryable && atk.phase === 'telegraph') this.telegraphOuter.show(expandShape(atk.shape, 6), 0, line);
    else this.telegraphOuter.hide();
  }

  /** 2D 시점: 바닥 범위는 옆에서 안 보이므로, 옆에서 본 범위(좌우 구간 × 높이)를 세로 띠로 그림 */
  private drawSideDanger(b: BossModel, p: PlayerModel): void {
    const atk = b.attack;
    const e = this.sideAmount;
    if (!atk || e < 0.3 || !atk.melee) {
      this.sideDanger.visible = false;
      return;
    }
    const alpha = atk.phase === 'telegraph' ? 0.08 + 0.2 * atk.phaseProgress : atk.phase === 'active' ? 0.5 : 0.15 * (1 - atk.phaseProgress);
    const [lo, hi] = shapeXRange(atk.shape);
    const band = atk.pattern.height ?? { bottom: 0, top: 320 };
    const top = Math.min(band.top, 340);
    this.sideDanger.visible = true;
    this.sideDangerMat.opacity = alpha * e;
    this.sideDanger.scale.set(Math.max(1, hi - lo), Math.max(1, top - band.bottom), 1);
    this.sideDanger.position.set((lo + hi) / 2, (band.bottom + top) / 2, p.y + 40);
  }

  // ───────────────────────── 날아가는 물체 ─────────────────────────

  private drawProjectiles(list: readonly Projectile[]): void {
    const alive = new Set<number>();
    for (const p of list) {
      alive.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh =
          p.kind === 'wave'
            ? new THREE.Mesh(
                new THREE.BoxGeometry(14, 10, p.radius * 2),
                new THREE.MeshStandardMaterial({ color: RED, transparent: true, opacity: 0.7, emissive: 0x330000 }),
              )
            : new THREE.Mesh(new THREE.SphereGeometry(p.radius, 16, 12), new THREE.MeshStandardMaterial({ color: BLACK }));
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.kind === 'wave' ? 5 : p.z, p.y);
      mesh.rotation.y = yaw(Math.atan2(p.vy, p.vx));
      if (p.kind === 'bullet') (mesh.material as THREE.MeshStandardMaterial).color.setHex(p.owner === 'player' ? 0xffffff : BLACK);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (alive.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.projectileMeshes.delete(id);
    }
  }

  // ───────────────────────── 카메라 ─────────────────────────

  private cameraTarget(p: PlayerModel): { pos: THREE.Vector3; look: THREE.Vector3 } {
    if (this.mode === 'overview') {
      const cx = this.arena.width / 2;
      const cz = this.arena.height / 2;
      return { pos: new THREE.Vector3(cx, 780, cz + 560), look: new THREE.Vector3(cx, 0, cz + 20) };
    }
    const f = this.forward;
    const right = { x: -f.y, y: f.x };
    let distance = CAM.distance + this.bias.distance;
    let lookHeight = CAM.lookHeight + this.bias.lookHeight;
    let lookAhead = 60;
    if (this.lock) {
      // 락온 프레이밍: 보스가 가까울수록 뒤로 빠지고 바라보는 점을 올려 둘 다 화면에 담음
      const d = Math.hypot(this.lock.x - p.x, this.lock.y - p.y);
      const close = Math.min(1, Math.max(0, (CAM.lockCloseDist - d) / (CAM.lockCloseDist - 80)));
      distance += CAM.lockPullBack * close;
      lookHeight += BOSS_HEIGHT * (CAM.lockLookBase + CAM.lockLookRaise * close);
      lookAhead = d * 0.5;
    }
    const pitch = this.camPitch + this.bias.pitch;
    const horiz = distance * Math.cos(pitch);
    const height = distance * Math.sin(pitch) + lookHeight;
    const pos = new THREE.Vector3(
      p.x - f.x * horiz + right.x * CAM.shoulder,
      height,
      p.y - f.y * horiz + right.y * CAM.shoulder,
    );
    const look = new THREE.Vector3(
      p.x + f.x * lookAhead + right.x * CAM.shoulder * 0.5,
      lookHeight,
      p.y + f.y * lookAhead + right.y * CAM.shoulder * 0.5,
    );
    return { pos, look };
  }

  private updateCamera(p: PlayerModel, b: BossModel, dtMs: number): void {
    const sec = dtMs / 1000;
    if (this.lock && this.mode === 'follow') {
      // 락온: "플레이어 → 보스" 방향으로 스프링처럼 돎 (임계 감쇠: 처음 천천히, 중간 빠르게, 끝 천천히)
      const want = Math.atan2(this.lock.y - p.y, this.lock.x - p.x);
      const err = wrap(want - this.camYaw);
      const k = CAM.lockStiffness;
      this.yawVel += (err * k - this.yawVel * 2 * Math.sqrt(k)) * sec;
      this.camYaw = wrap(this.camYaw + this.yawVel * sec);
      this.camPitch += (CAM.lockPitch - this.camPitch) * follow(dtMs, 250);
      // 락온을 풀었을 때 튀지 않도록 마우스 목표도 같이 맞춤
      this.targetYaw = this.camYaw;
      this.targetPitch = this.camPitch;
    } else {
      // 자유 시점: 마우스 목표를 부드럽게 따라감 (관성)
      this.yawVel = 0;
      const k = follow(dtMs, CAM.mouseSmoothMs);
      this.camYaw = wrap(this.camYaw + wrap(this.targetYaw - this.camYaw) * k);
      this.targetYaw = this.camYaw + wrap(this.targetYaw - this.camYaw);
      this.camPitch += (this.targetPitch - this.camPitch) * k;
    }

    // 큰 기술이 터지는 순간: 화각 펀치 + 흔들림
    const bigActive = !!b.attack && b.attack.phase === 'active' && isBigAttack(b.attack);
    if (bigActive && !this.wasBigActive && !this.rewinding) {
      this.punch(160, 5);
      this.shake(180, 0.008);
    }
    this.wasBigActive = bigActive;

    // 패턴 반응: 보스 상태에서 계산한 값을 부드럽게 따라감
    const want = cameraBias(b);
    const kb = follow(dtMs, CAM.biasSmoothMs);
    this.bias = {
      distance: this.bias.distance + (want.distance - this.bias.distance) * kb,
      pitch: this.bias.pitch + (want.pitch - this.bias.pitch) * kb,
      lookHeight: this.bias.lookHeight + (want.lookHeight - this.bias.lookHeight) * kb,
    };

    // 시점 전환: 3D 카메라 ↔ 2D(옆에서 멀리·좁은 화각) 카메라를 섞음 → 넘어가는 동안 공간이 납작해지는 느낌
    const dir = this.viewTarget === '2d' ? 1 : -1;
    this.viewBlend = Math.min(1, Math.max(0, this.viewBlend + (dir * dtMs) / SIDE.blendMs));
    const e = this.sideAmount;
    const t3 = this.cameraTarget(p);
    const lx = Math.min(this.arena.width - 200, Math.max(200, p.x + (b.x - p.x) * SIDE.towardBoss));
    const look2 = new THREE.Vector3(lx, SIDE.lookHeight, p.y);
    const pos2 = new THREE.Vector3(lx, SIDE.lookHeight + 30, p.y + SIDE.distance);
    const pos = t3.pos.clone().lerp(pos2, e);
    const look = t3.look.clone().lerp(look2, e);
    const kf = e > 0 && e < 1 ? 1 : follow(dtMs, this.mode === 'overview' ? 300 : CAM.followMs * (1 - e) + 60 * e);
    this.camPos.lerp(pos, kf);
    this.camLook.lerp(look, kf);
    this.camera.position.copy(this.camPos);
    if (this.shakeMs > 0) {
      this.shakeMs -= dtMs;
      const a = this.shakeAmp * 600;
      this.camera.position.x += (Math.random() * 2 - 1) * a;
      this.camera.position.y += (Math.random() * 2 - 1) * a;
      if (this.shakeMs <= 0) this.shakeAmp = 0;
    }
    // 줌 펀치
    let fov = CAM.fov + (SIDE.fov - CAM.fov) * e;
    if (this.punchMs > 0) {
      this.punchMs -= dtMs;
      fov -= this.punchAmount * Math.max(0, Math.min(1, this.punchMs / 120));
      if (this.punchMs <= 0) this.punchAmount = 0;
    }
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(this.camLook);
  }

  // ───────────────────────── 무기 모양 (+X 방향으로 뻗음) ─────────────────────────
}

/**
 * 바닥에 그리는 판 (예고·판정 범위): 반투명 채움 + 점선 테두리.
 * 모양이 바뀔 때마다 도형을 새로 만든다 (패턴 몇 개라 부담 없음).
 */
class Decal {
  private readonly fill: THREE.Mesh;
  private readonly outline: THREE.LineLoop;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly lineMat: THREE.LineDashedMaterial;
  private lastKey = '';

  constructor(scene: THREE.Scene, color: number) {
    this.fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.lineMat = new THREE.LineDashedMaterial({ color, dashSize: 10, gapSize: 6, transparent: true });
    this.fill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMat);
    this.outline = new THREE.LineLoop(new THREE.BufferGeometry(), this.lineMat);
    // 도형은 (x, y)평면 → X축으로 90° 돌려 (X, Z) 바닥에 눕힌다 (y → Z)
    this.fill.rotation.x = Math.PI / 2;
    this.outline.rotation.x = Math.PI / 2;
    this.fill.position.y = DECAL_Y;
    this.outline.position.y = DECAL_Y + 0.1;
    this.fill.renderOrder = 1;
    scene.add(this.fill, this.outline);
    this.hide();
  }

  /** @param lineAlpha null이면 테두리 없음 */
  show(shape: AttackShape, fillAlpha: number, lineAlpha: number | null): void {
    const key = JSON.stringify(shape);
    if (key !== this.lastKey) {
      this.lastKey = key;
      const pts = shapeOutline(shape);
      const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
      this.fill.geometry.dispose();
      this.fill.geometry = new THREE.ShapeGeometry(s);
      this.outline.geometry.dispose();
      this.outline.geometry = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, 0)));
      this.outline.computeLineDistances();
    }
    this.fillMat.opacity = fillAlpha;
    this.fill.visible = fillAlpha > 0;
    this.outline.visible = lineAlpha !== null;
    if (lineAlpha !== null) this.lineMat.opacity = lineAlpha;
  }

  hide(): void {
    this.fill.visible = false;
    this.outline.visible = false;
  }
}
