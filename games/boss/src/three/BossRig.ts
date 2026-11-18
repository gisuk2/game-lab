import * as THREE from 'three';
import type { WeaponId } from '../config/bossBalance';
import { BOSS_BODY, BOSS_HEIGHT, type BossBodyPose, type Leg, type Limb } from '../entities/boss/bossBodyPose';
import { WEAPON_LEN } from '../entities/boss/weaponPose';

/**
 * 보스 몸체 (거대 관절 로봇, 홀로그램 스타일). bossBodyPose 값대로 관절을 돌린다.
 * 로컬 좌표: +X = 정면, +Y = 위, +Z = 오른쪽. 몸 방향(yaw)은 바깥 그룹이 정한다.
 *
 * 홀로그램: 어두운 반투명 몸 + 붉은 윤곽선 + 가끔 깜빡임. 등장할 때는 아래에서 위로 "그려지며" 나타난다(잘라내기 평면).
 */
const BODY = 0x14161a;
const EDGE = 0xd62828;
const EYE = 0xff2a2a;
const yaw = (a: number) => -a;

interface ArmRig {
  yaw: THREE.Group;
  pitch: THREE.Group;
  /** 손: 무기를 붙이는 곳 (무기는 +X 방향으로 만들어져 있으므로 아래(-Y)로 향하게 돌려 둠) */
  hand: THREE.Group;
}
interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

export class BossRig {
  readonly root = new THREE.Group();
  private readonly fall = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly legR: LegRig;
  private readonly legL: LegRig;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  readonly weaponMat: THREE.MeshStandardMaterial;
  private readonly weaponEdgeMat: THREE.LineBasicMaterial;
  private readonly weapons: Record<WeaponId, THREE.Group>;
  private readonly offhand: Partial<Record<WeaponId, THREE.Group>>;
  /** 등장 연출용: 이 높이보다 위는 아직 안 그려짐 */
  private readonly clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);

  constructor() {
    const B = BOSS_BODY;
    const clippingPlanes = [this.clip];
    this.bodyMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.86, emissive: 0x1a0000, clippingPlanes });
    this.edgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.9, clippingPlanes });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: EYE, clippingPlanes });
    this.weaponMat = new THREE.MeshStandardMaterial({ color: BODY, roughness: 0.5, transparent: true, emissive: 0x000000, clippingPlanes });
    this.weaponEdgeMat = new THREE.LineBasicMaterial({ color: EDGE, transparent: true, clippingPlanes });

    this.root.scale.setScalar(B.scale);
    this.root.add(this.fall);
    this.fall.add(this.hips);
    this.hips.position.y = B.hipY;

    // 골반·몸통 (위로 넓어지는 역삼각형 가슴) + 등의 판
    this.hips.add(this.body(new THREE.BoxGeometry(34, 22, 56), 0, 0, 0), this.torso);
    this.torso.add(
      this.body(new THREE.CylinderGeometry(20, 14, 26, 6), 0, 18, 0), // 허리
      this.body(new THREE.BoxGeometry(46, 46, 78), 0, 52, 0), // 가슴
      this.body(new THREE.BoxGeometry(14, 30, 50), -26, 56, 0), // 등 판
    );
    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(7), this.eyeMat);
    chestCore.position.set(23.5, 56, 0);
    this.torso.add(chestCore);

    // 머리: 투구 + 외눈 띠
    this.head.position.y = B.torso + 6;
    this.head.add(this.body(new THREE.BoxGeometry(34, 38, 30), 0, B.headR, 0));
    this.head.add(this.body(new THREE.ConeGeometry(10, 22, 4), -6, B.headR * 2 + 10, 0)); // 볏
    const eye = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 24), this.eyeMat);
    eye.position.set(17.5, B.headR + 4, 0);
    this.head.add(eye);
    this.torso.add(this.head);

    this.armR = this.arm(+1);
    this.armL = this.arm(-1);
    this.legR = this.leg(+1);
    this.legL = this.leg(-1);

    this.weapons = {
      greatsword: this.makeGreatsword(),
      spear: this.makeSpear(),
      hammer: this.makeHammer(),
      twinblades: this.makeShortBlade(),
      gun: this.makeGun(),
      bare: this.makeFist(),
    };
    this.offhand = { twinblades: this.makeShortBlade(), bare: this.makeFist() };
    for (const w of Object.values(this.weapons)) this.armR.hand.add(w);
    for (const w of Object.values(this.offhand)) this.armL.hand.add(w!);
    this.root.traverse((o) => {
      o.castShadow = o instanceof THREE.Mesh;
    });
  }

  apply(p: BossBodyPose): void {
    const B = BOSS_BODY;
    this.fall.rotation.z = -p.fall; // 앞으로 쓰러짐
    this.hips.position.y = B.hipY * (1 - 0.45 * p.crouch);
    this.torso.rotation.y = yaw(p.twist);
    this.torso.rotation.z = -p.lean;
    this.head.rotation.y = yaw(p.headYaw);
    this.head.rotation.z = -p.headPitch;
    setArm(this.armR, p.armR);
    setArm(this.armL, p.armL);
    setLeg(this.legR, p.legR);
    setLeg(this.legL, p.legL);
    const len = (B.weaponScale * p.weaponLen) / WEAPON_LEN;
    this.armR.hand.scale.set(len, B.weaponScale, B.weaponScale);
    this.armL.hand.scale.set(len, B.weaponScale, B.weaponScale);
    this.eyeMat.color.setRGB(0.35 + 0.65 * p.eye, 0.08 * p.eye, 0.08 * p.eye);
  }

  /** 들고 있는 무기 (교체 중 깜빡임은 alpha로) */
  showWeapon(id: WeaponId, alpha: number, glow: boolean): void {
    for (const [k, g] of Object.entries(this.weapons)) g.visible = k === id;
    for (const [k, g] of Object.entries(this.offhand)) g!.visible = k === id;
    this.weaponMat.opacity = alpha;
    this.weaponEdgeMat.opacity = alpha;
    this.weaponMat.emissive.setHex(glow ? 0x880000 : 0x000000);
    this.weaponMat.color.setHex(glow ? EDGE : BODY);
  }

  /**
   * 몸 상태 표시
   * @param flicker 0~1 홀로그램 흔들림 (화면 쪽에서 난수로)
   */
  setLook(o: { hitFlash: boolean; dim: boolean; dead: boolean; flicker: number }): void {
    this.bodyMat.emissive.setHex(o.hitFlash ? 0x993333 : 0x1a0000);
    const base = o.dead ? 0.35 : o.dim ? 0.7 : 0.86;
    this.bodyMat.opacity = base * (1 - 0.25 * o.flicker);
    this.edgeMat.opacity = (o.dim ? 0.45 : 0.9) * (1 - 0.5 * o.flicker);
  }

  /** 등장 연출: progress 0 = 아무것도 없음, 1 = 다 그려짐 */
  setMaterialize(progress: number): void {
    const h = progress >= 1 ? 1e6 : this.root.position.y + (BOSS_HEIGHT + 40) * progress;
    this.clip.constant = h;
  }

  // ───────── 부품 ─────────

  private body(geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.bodyMat);
    m.position.set(x, y, z);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), this.edgeMat));
    return m;
  }

  private arm(side: 1 | -1): ArmRig {
    const B = BOSS_BODY;
    const yawG = new THREE.Group();
    yawG.position.set(0, B.shoulderY, side * B.shoulderZ);
    const pitchG = new THREE.Group();
    yawG.add(pitchG);
    pitchG.add(
      this.body(new THREE.BoxGeometry(34, 22, 30), 0, 4, side * 4), // 어깨 갑옷
      this.body(new THREE.CylinderGeometry(9, 8, B.upperArm, 6), 0, -B.upperArm / 2, 0),
      this.body(new THREE.CylinderGeometry(9, 11, B.foreArm, 6), 0, -B.upperArm - B.foreArm / 2, 0),
    );
    const hand = new THREE.Group();
    hand.position.y = -B.upperArm - B.foreArm;
    hand.rotation.z = -Math.PI / 2; // 무기의 +X → 팔 방향(-Y)
    pitchG.add(hand);
    this.torso.add(yawG);
    return { yaw: yawG, pitch: pitchG, hand };
  }

  private leg(side: 1 | -1): LegRig {
    const B = BOSS_BODY;
    const hip = new THREE.Group();
    hip.position.set(0, -6, side * 18);
    const knee = new THREE.Group();
    knee.position.y = -B.thigh;
    hip.add(this.body(new THREE.CylinderGeometry(13, 10, B.thigh, 6), 0, -B.thigh / 2, 0));
    knee.add(
      this.body(new THREE.BoxGeometry(18, 14, 20), 4, 0, 0), // 무릎 판
      this.body(new THREE.CylinderGeometry(10, 13, B.shin, 6), 0, -B.shin / 2, 0),
      this.body(new THREE.BoxGeometry(40, 10, 22), 8, -B.shin + 2, 0), // 발
    );
    hip.add(knee);
    this.hips.add(hip);
    return { hip, knee };
  }

  private part(geo: THREE.BufferGeometry, x: number, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, this.weaponMat);
    m.position.set(x, y, z);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), this.weaponEdgeMat));
    return m;
  }

  private alongX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    return geo.rotateZ(-Math.PI / 2);
  }

  private makeGreatsword(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(62, 3, 11), 37), this.part(new THREE.BoxGeometry(4, 4, 24), 5), this.part(new THREE.BoxGeometry(8, 3, 3), 0));
    return g;
  }

  private makeSpear(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(this.alongX(new THREE.CylinderGeometry(1.6, 1.6, 90, 6)), 30));
    g.add(this.part(this.alongX(new THREE.ConeGeometry(5, 18, 4)), 84));
    return g;
  }

  private makeHammer(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(this.alongX(new THREE.CylinderGeometry(2.2, 2.2, 54, 6)), 25));
    g.add(this.part(new THREE.BoxGeometry(18, 20, 30), 56));
    return g;
  }

  private makeShortBlade(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(40, 3, 6), 22), this.part(new THREE.BoxGeometry(3, 3, 12), 2));
    return g;
  }

  private makeGun(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(22, 10, 9), 8));
    g.add(this.part(this.alongX(new THREE.CylinderGeometry(2.2, 2.2, 30, 6)), 33, 2));
    return g;
  }

  private makeFist(): THREE.Group {
    const g = new THREE.Group();
    g.add(this.part(new THREE.BoxGeometry(10, 9, 9), 4));
    return g;
  }
}

function setArm(r: ArmRig, l: Limb): void {
  r.yaw.rotation.y = yaw(l.yaw);
  r.pitch.rotation.z = l.pitch;
}

function setLeg(r: LegRig, l: Leg): void {
  r.hip.rotation.z = l.hip;
  r.knee.rotation.z = -l.knee;
}
