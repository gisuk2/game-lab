import * as THREE from 'three';
import type { Leg, Limb, PlayerPose } from '../entities/player/playerPose';

/**
 * 플레이어 마네킹 (테스트 더미). 기본 도형을 관절로 이어 붙이고 playerPose 값대로 돌린다.
 * 로컬 좌표: +X = 정면, +Y = 위, +Z = 오른쪽. 몸 방향(yaw)은 바깥 그룹이 정한다.
 */
export const MANNEQUIN = {
  /** 엉덩이 높이 (= 다리 길이) */
  hipY: 28,
  thigh: 14,
  shin: 14,
  torso: 20,
  headR: 6.5,
  shoulderY: 21,
  shoulderZ: 9,
  upperArm: 11,
  foreArm: 11,
  blade: 36,
};
/** 키 ≈ 엉덩이 + 몸통 + 머리 */
export const MANNEQUIN_HEIGHT = MANNEQUIN.hipY + MANNEQUIN.torso + 2 + MANNEQUIN.headR * 2;

const BODY = 0xd5dade;
const JOINT = 0x13b5c8;
const BLADE = 0x2a2f33;

const yaw = (a: number) => -a;

interface ArmRig {
  yaw: THREE.Group;
  pitch: THREE.Group;
}
interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

export class Mannequin {
  readonly root = new THREE.Group();
  private readonly fall = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly armR: ArmRig;
  private readonly armL: ArmRig;
  private readonly legR: LegRig;
  private readonly legL: LegRig;
  private readonly sword = new THREE.Group();
  private readonly mats: THREE.MeshStandardMaterial[] = [];

  constructor() {
    const M = MANNEQUIN;
    const body = this.mat(BODY, 0.55);
    const joint = this.mat(JOINT, 0.35, 0x06363d);
    const blade = this.mat(BLADE, 0.3);

    this.root.add(this.fall);
    this.fall.add(this.hips);
    this.hips.position.y = M.hipY;

    const pelvis = this.mesh(new THREE.BoxGeometry(9, 7, 14), body);
    this.hips.add(pelvis, this.torso);

    // 몸통 (아래가 좁은 캡슐) + 목 관절 + 머리
    const chest = this.mesh(new THREE.CapsuleGeometry(7, M.torso - 10, 4, 10), body);
    chest.position.y = M.torso / 2 + 2;
    chest.scale.set(0.85, 1, 1.15);
    const neck = this.mesh(new THREE.SphereGeometry(2.6, 10, 8), joint);
    neck.position.y = M.torso + 3;
    const head = this.mesh(new THREE.SphereGeometry(M.headR, 16, 12), body);
    head.position.y = M.torso + 4 + M.headR;
    // 얼굴 쪽 표시 (테스트 더미의 눈 띠)
    const visor = this.mesh(new THREE.BoxGeometry(2, 2.2, 8), joint);
    visor.position.set(M.headR - 0.6, M.torso + 5 + M.headR, 0);
    this.torso.add(chest, neck, head, visor);

    this.armR = this.arm(+1, body, joint);
    this.armL = this.arm(-1, body, joint);
    this.legR = this.leg(+1, body, joint);
    this.legL = this.leg(-1, body, joint);

    // 칼: 오른손에. 기본은 팔의 연장선(아래 방향)
    const b = this.mesh(new THREE.BoxGeometry(1.6, M.blade, 4.5), blade);
    b.position.y = -M.blade / 2 - 3;
    const guard = this.mesh(new THREE.BoxGeometry(3, 2, 10), joint);
    guard.position.y = -2;
    this.sword.add(b, guard);
    this.sword.position.y = -(M.upperArm + M.foreArm + 2);
    this.armR.pitch.add(this.sword);
  }

  apply(p: PlayerPose): void {
    const M = MANNEQUIN;
    this.fall.rotation.z = p.fall; // 뒤로 쓰러짐 (발을 축으로)
    this.hips.position.y = M.hipY * (1 - 0.45 * p.crouch);
    this.hips.rotation.z = -p.roll; // 앞구르기
    this.torso.rotation.y = yaw(p.twist);
    this.torso.rotation.z = -p.lean;
    setArm(this.armR, p.armR);
    setArm(this.armL, p.armL);
    setLeg(this.legR, p.legR);
    setLeg(this.legL, p.legL);
    this.sword.rotation.z = p.swordTilt;
    const transparent = p.alpha < 1;
    for (const m of this.mats) {
      m.transparent = transparent;
      m.opacity = p.alpha;
    }
  }

  /** 맞았을 때 등 몸 색을 잠깐 바꿈 (null = 원래대로) */
  tint(hex: number | null): void {
    this.mats[0].color.setHex(hex ?? BODY);
  }

  private arm(side: 1 | -1, body: THREE.Material, joint: THREE.Material): ArmRig {
    const M = MANNEQUIN;
    const yawG = new THREE.Group();
    yawG.position.set(0, M.shoulderY, side * M.shoulderZ);
    const pitchG = new THREE.Group();
    yawG.add(pitchG);
    const shoulder = this.mesh(new THREE.SphereGeometry(3.2, 10, 8), joint);
    const upper = this.mesh(new THREE.CapsuleGeometry(2.4, M.upperArm - 4, 4, 8), body);
    upper.position.y = -M.upperArm / 2;
    const elbow = this.mesh(new THREE.SphereGeometry(2.3, 8, 6), joint);
    elbow.position.y = -M.upperArm;
    const fore = this.mesh(new THREE.CapsuleGeometry(2.1, M.foreArm - 4, 4, 8), body);
    fore.position.y = -M.upperArm - M.foreArm / 2;
    const hand = this.mesh(new THREE.SphereGeometry(2.4, 8, 6), joint);
    hand.position.y = -M.upperArm - M.foreArm;
    pitchG.add(shoulder, upper, elbow, fore, hand);
    this.torso.add(yawG);
    return { yaw: yawG, pitch: pitchG };
  }

  private leg(side: 1 | -1, body: THREE.Material, joint: THREE.Material): LegRig {
    const M = MANNEQUIN;
    const hip = new THREE.Group();
    hip.position.set(0, -2, side * 4.5);
    const knee = new THREE.Group();
    knee.position.y = -M.thigh;
    const ball = this.mesh(new THREE.SphereGeometry(3, 10, 8), joint);
    const thigh = this.mesh(new THREE.CapsuleGeometry(3, M.thigh - 5, 4, 8), body);
    thigh.position.y = -M.thigh / 2;
    const kneeBall = this.mesh(new THREE.SphereGeometry(2.6, 8, 6), joint);
    const shin = this.mesh(new THREE.CapsuleGeometry(2.5, M.shin - 5, 4, 8), body);
    shin.position.y = -M.shin / 2;
    const foot = this.mesh(new THREE.BoxGeometry(9, 3, 5), body);
    foot.position.set(2.5, -M.shin + 0.5, 0);
    knee.add(kneeBall, shin, foot);
    hip.add(ball, thigh, knee);
    this.hips.add(hip);
    return { hip, knee };
  }

  private mat(color: number, roughness: number, emissive = 0x000000): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, emissive });
    this.mats.push(m);
    return m;
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    return mesh;
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
