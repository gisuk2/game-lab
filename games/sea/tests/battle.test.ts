import { describe, expect, it } from 'vitest';
import { Battle, Rng } from '../src/sim/battle';
import { FORMATION_COOLDOWN, PANOKSEON, RULES, WAESEON, WEAPONS } from '../src/sim/data';
import { fallbackWeights, rollScout, scoutChance } from '../src/sim/encounter';
import { runBotBattle } from '../src/sim/bot';

const fresh = (d: 'far' | 'mid' | 'near' = 'mid', seed = 1) => new Battle(PANOKSEON, WAESEON, d, { seed });
const run = (b: Battle, sec: number) => { for (let t = 0; t < sec; t += RULES.dt) b.step(); };
/** 선원을 빈 방으로 치워 둠 (한 가지만 시험하려고) */
const calm = (b: Battle) => { for (const s of b.ships) for (const c of s.crew) c.room = s.side === 0 ? 'empty1' : 'deck'; };

describe('판옥선 평면 구조', () => {
  it('붙은 방끼리 문 17개 + 바깥 배수구 3개', () => {
    const s = fresh().ships[0];
    expect(s.doors.filter((d) => d.b !== null).length).toBe(17);
    expect(s.doors.filter((d) => d.b === null).length).toBe(3);
    expect(s.doors.some((d) => d.id === 'oars|guns')).toBe(false); // 모서리만 닿으면 문 없음
  });
  it('바깥 벽에 닿은 방과 안쪽 방을 가림', () => {
    const s = fresh().ships[0];
    const inner = s.rooms.filter((r) => !r.outer).map((r) => r.id).sort().join(',');
    expect(inner).toBe('empty1,medic,pump,ward');
  });
  it('길찾기는 문을 따라감 (장대 → 격군실)', () => {
    const b = fresh(); const s = b.ships[0];
    const p = b.path(s, 'helm', 'oars')!;
    expect(p[p.length - 1]).toBe('oars');
    let cur = 'helm';
    for (const n of p) { expect(b.neighbors(s, cur).some((x) => x.to === n)).toBe(true); cur = n; }
  });
  it('선원은 처음에 장대·포갑판·격군실에 서 있음', () => {
    expect(fresh().ships[0].crew.map((c) => c.room).join(',')).toBe('helm,guns,oars');
  });
});

describe('마력', () => {
  it('마력로 막대(8칸)를 넘겨 꽂을 수 없음', () => {
    const b = fresh(); const s = b.ships[0];
    b.setPower(0, 'ward', 2); b.setPower(0, 'oars', 2); b.setPower(0, 'helm', 1); b.setPower(0, 'pump', 1); b.setPower(0, 'medic', 1); b.setPower(0, 'scope', 1);
    expect(b.freePower(s)).toBe(0);
    expect(b.toggleWeapon(0, 0, true)).toBe(false);
    b.setPower(0, 'scope', 0); b.setPower(0, 'medic', 0);
    expect(b.toggleWeapon(0, 0, true)).toBe(true); // 지자 2칸
    expect(b.usedPower(s)).toBe(8);
  });
  it('총통은 달린 포갑판 등급까지만 켬 (좌현 2칸)', () => {
    const b = fresh(); const s = b.ships[0];
    s.weapons.push({ def: WEAPONS.hwangja, mount: 'guns', powered: false, want: false, charge: 0, target: null });
    expect(b.toggleWeapon(0, 0, true)).toBe(true); // 지자 2칸 → 좌현 가득
    expect(b.toggleWeapon(0, 2, true)).toBe(false);
    expect(b.toggleWeapon(0, 1, true)).toBe(true); // 우현 황자는 따로
  });
  it('고장 나면 그만큼 마력이 빠짐', () => {
    const b = fresh(); const s = b.ships[0]; calm(b);
    b.setPower(0, 'ward', 2); s.sys.ward!.damage = 1; b.step();
    expect(s.sys.ward!.power).toBe(1);
    expect(b.maxLayers(s)).toBe(0);
  });
  it('고치면 원래 마력이 저절로 다시 꽂힘', () => {
    const b = fresh(); const s = b.ships[0]; calm(b);
    b.setPower(0, 'ward', 2); s.sys.ward!.damage = 2; b.step();
    expect(s.sys.ward!.power).toBe(0);
    s.sys.ward!.damage = 0; b.step();
    expect(s.sys.ward!.power).toBe(2);
  });
  it('총통도 고치면 다시 켜지고 조준은 그대로', () => {
    const b = fresh(); const s = b.ships[0]; calm(b);
    b.toggleWeapon(0, 0, true); b.setTarget(0, 0, 'ward');
    s.sys.guns!.damage = 2; b.step();
    expect(s.weapons[0].powered).toBe(false);
    s.sys.guns!.damage = 0; b.step();
    expect(s.weapons[0].powered).toBe(true);
    expect(s.weapons[0].target).toBe('ward');
  });
  it('마력로가 모자라면 남는 만큼만 돌아옴', () => {
    const b = fresh(); const s = b.ships[0]; calm(b);
    b.setPower(0, 'ward', 2); s.sys.ward!.damage = 2; b.step();
    b.setPower(0, 'oars', 2); b.setPower(0, 'helm', 1); b.setPower(0, 'pump', 1); b.setPower(0, 'medic', 1); b.setPower(0, 'scope', 1); b.toggleWeapon(0, 1, true);
    s.sys.ward!.damage = 0; b.step();
    expect(s.sys.ward!.power).toBe(1);
    expect(b.freePower(s)).toBe(0);
  });
});

describe('총통과 결계', () => {
  it('마력을 꽂아야 충전되고, 조준하면 다 찬 순간 발사', () => {
    const b = fresh('near'); calm(b);
    const w = b.ships[0].weapons[1]; // 황자 9초
    run(b, 3); expect(w.charge).toBe(0);
    b.toggleWeapon(0, 1, true); b.setTarget(0, 1, 'oars');
    run(b, w.def.charge - 0.5); expect(b.projectiles.length).toBe(0);
    run(b, 1); expect(b.projectiles.length).toBe(1);
  });
  it('일제 사격을 켜면 조준한 총통이 다 찰 때까지 기다렸다 같이 쏨', () => {
    const b = fresh('near'); calm(b); const s = b.ships[0]; s.volley = true;
    b.toggleWeapon(0, 0, true); b.toggleWeapon(0, 1, true); b.setTarget(0, 0, 'ward'); b.setTarget(0, 1, 'ward');
    run(b, s.weapons[0].def.charge - 0.3); // 지자(12초)가 아직 덜 참, 황자(13초)도 덜 참
    expect(b.projectiles.length).toBe(0);
    run(b, Math.max(s.weapons[0].def.charge, s.weapons[1].def.charge) - s.weapons[0].def.charge + 0.6);
    expect(b.projectiles.length).toBe(2);
  });
  it('천자총통은 결계 한 겹을 뚫고 피해 −1', () => {
    const b = fresh('far'); const e = b.ships[1]; e.crew.forEach((c) => { c.room = 'guns'; });
    e.wardLayers = 1; e.sys.ward!.power = 2;
    b.projectiles.push({ from: 0, weapon: WEAPONS.cheonja, target: 'deck', t: 0, total: 0.05 });
    b.step();
    expect(e.wardLayers).toBe(0);
    expect(e.hull).toBe(e.maxHull - 2);
  });
  it('결계 한 겹이 한 발을 막고, 2초 뒤 다시 참', () => {
    const b = fresh('near'); calm(b); const e = b.ships[1];
    b.setPower(1, 'ward', 2); run(b, RULES.wardRecharge + 0.2);
    expect(e.wardLayers).toBe(1);
    b.projectiles.push({ from: 0, weapon: b.ships[0].weapons[1].def, target: 'oars', t: 0, total: 0.05 });
    b.step();
    expect(e.wardLayers).toBe(0);
    expect(e.hull).toBe(e.maxHull);
    run(b, RULES.wardRecharge + 0.2); expect(e.wardLayers).toBe(1);
  });
  it('장대에 사람이 없으면 회피 0', () => {
    const b = fresh(); const s = b.ships[0];
    b.setPower(0, 'helm', 1); b.setPower(0, 'oars', 2); b.step();
    expect(b.evasion(s)).toBeGreaterThan(0);
    s.crew[0].alive = false; b.step();
    expect(b.evasion(s)).toBe(0);
  });
  it('거리마다 명중률이 다름: 조총은 원거리에서 약함', () => {
    const far = fresh('far'); const near = fresh('near');
    const j = WAESEON.weapons[0].id;
    expect(far.hitChance(1, far.ships[1].weapons[0].def)).toBeLessThan(near.hitChance(1, near.ships[1].weapons[0].def));
    expect(j).toBe('jochong');
  });
  it('맞으면 선체·시스템·선원 피해 (천자총통, 원거리 명중 100%)', () => {
    const b = fresh('far'); const e = b.ships[1];
    e.crew.forEach((c) => { c.room = 'guns'; }); // 장대가 비어 회피 0
    b.projectiles.push({ from: 0, weapon: WEAPONS.cheonja, target: 'guns', t: 0, total: 0.05 });
    b.step();
    expect(e.hull).toBe(e.maxHull - 3);
    expect(e.sys.guns!.damage).toBe(3);
    expect(e.crew[0].hp).toBeLessThan(100);
  });
});

describe('물: 바깥 벽 방과 배수구', () => {
  it('바깥 벽 방은 안쪽 방보다 구멍으로 물이 빨리 참', () => {
    const total = (id: string) => { const b = fresh(); calm(b); const s = b.ships[0]; b.room(s, id).breach = true; run(b, 5); return s.rooms.reduce((n, r) => n + r.water, 0); };
    expect(total('oars')).toBeGreaterThan(total('ward'));
  });
  it('배수구를 열면 그 방 물이 바다로 빠짐', () => {
    const b = fresh(); calm(b); const s = b.ships[0];
    b.room(s, 'oars').water = 2; b.setPower(0, 'doors', 1);
    expect(b.toggleDoor(0, 'oars|바다')).toBe(true);
    run(b, 3);
    expect(b.room(s, 'oars').water).toBeCloseTo(2 - RULES.drain * 3, 1);
  });
  it('배수구를 열어 둔 방에 구멍이 나면 물이 더 빨리 참', () => {
    const fill = (open: boolean) => {
      const b = fresh(); calm(b); const s = b.ships[0]; b.setPower(0, 'doors', 1);
      if (open) b.toggleDoor(0, 'guns|바다');
      b.room(s, 'guns').breach = true; b.room(s, 'guns').water = 3; run(b, 1); return b.room(s, 'guns').water;
    };
    expect(fill(true)).toBeLessThan(3); // 열면 빠지는 게 더 큼
    expect(RULES.drainSplash).toBeGreaterThan(1);
  });
  it('닫힌 문은 물을 막고, 열린 문으로는 퍼짐', () => {
    const b = fresh(); calm(b); const s = b.ships[0];
    b.room(s, 'pump').water = 1;
    run(b, 5); expect(b.room(s, 'medic').water).toBe(0);
    b.setPower(0, 'doors', 1);
    expect(b.toggleDoor(0, 'pump|medic')).toBe(true);
    run(b, 5); expect(b.room(s, 'medic').water).toBeGreaterThan(0.2);
  });
  it('빗장실에 마력이 없으면 문을 못 여닫음', () => {
    const b = fresh();
    expect(b.toggleDoor(0, 'pump|medic')).toBe(false);
  });
  it('배수실이 물을 퍼냄', () => {
    const b = fresh(); calm(b); const s = b.ships[0];
    b.room(s, 'oars').water = 1; b.setPower(0, 'pump', 1);
    run(b, 10);
    expect(b.room(s, 'oars').water).toBeCloseTo(1 - RULES.pump * 10, 1);
  });
  it('60% 넘게 잠기면 그 방 시스템이 꺼짐', () => {
    const b = fresh(); const s = b.ships[0];
    b.setPower(0, 'ward', 2);
    expect(b.eff(s, 'ward')).toBe(2);
    b.room(s, 'ward').water = 1.4; // 결계실 2칸 → 70%
    expect(b.eff(s, 'ward')).toBe(0);
  });
});

describe('불: 위로 번짐', () => {
  it('물이 30% 넘는 방에서는 불이 꺼짐', () => {
    const b = fresh(); calm(b); const s = b.ships[0];
    const r = b.room(s, 'medic'); r.fire = 0.5; r.water = 0.4;
    run(b, 1); expect(r.fire).toBe(0);
  });
  it('불은 시스템을 고장 내고, 선원이 있으면 꺼짐', () => {
    const b = fresh(); calm(b); const s = b.ships[0];
    const r = b.room(s, 'medic'); r.fire = 1;
    run(b, 12); expect(s.sys.medic!.damage).toBe(1);
    const c = s.crew[0]; c.alive = true; c.hp = 100; c.room = 'medic';
    run(b, 6); expect(r.fire).toBe(0);
  });
  it('열린 문으로 더 잘 번짐', () => {
    let open = 0; let closed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const a = fresh('mid', seed); calm(a); a.setPower(0, 'doors', 1); a.toggleDoor(0, 'ward|pump'); a.room(a.ships[0], 'ward').fire = 1; run(a, 5); if (a.room(a.ships[0], 'pump').fire > 0) open++;
      const d = fresh('mid', seed); calm(d); d.room(d.ships[0], 'ward').fire = 1; run(d, 5); if (d.room(d.ships[0], 'pump').fire > 0) closed++;
    }
    expect(open).toBeGreaterThan(closed);
  });
});

describe('선원', () => {
  it('구멍을 막고 고장을 고침', () => {
    const b = fresh(); const s = b.ships[0];
    const r = b.room(s, 'oars'); r.breach = true; s.sys.oars!.damage = 1;
    run(b, 1 / RULES.repairBreach + 1 / RULES.repairSys + 1);
    expect(r.breach).toBe(false);
    expect(s.sys.oars!.damage).toBe(0);
  });
  it('명령하면 문을 따라 걸어감', () => {
    const b = fresh(); const s = b.ships[0]; const c = s.crew[0];
    b.moveCrew(0, c.id, 'medic');
    run(b, 1); expect(c.room === 'medic').toBe(false);
    run(b, 6); expect(c.room).toBe('medic');
  });
  it('의원실에서 회복', () => {
    const b = fresh(); const s = b.ships[0]; const c = s.crew[0];
    c.room = 'medic'; c.hp = 40; b.setPower(0, 'medic', 1);
    run(b, 3); expect(c.hp).toBeGreaterThan(60);
  });
});

describe('진법', () => {
  it('바꾸면 대기시간 동안 다시 못 바꿈', () => {
    const b = fresh();
    expect(b.setFormation(0, 'hakik')).toBe(true);
    expect(b.setFormation(0, 'jangsa')).toBe(false);
    run(b, FORMATION_COOLDOWN + 0.1);
    expect(b.setFormation(0, 'jangsa')).toBe(true);
  });
  it('학익진은 총통 충전이 빠름', () => {
    const plain = fresh(); const hak = new Battle(PANOKSEON, WAESEON, 'mid', { seed: 1, formation: ['hakik', null] });
    for (const b of [plain, hak]) { calm(b); b.toggleWeapon(0, 0, true); run(b, 5); }
    expect(hak.ships[0].weapons[0].charge).toBeGreaterThan(plain.ships[0].weapons[0].charge);
  });
});

describe('조우: 정찰 판정', () => {
  it('망원경 등급만큼 성공률이 오르고 5~95% 안에 머묾', () => {
    expect(scoutChance({ scope: 1 })).toBeGreaterThan(scoutChance({ scope: 0 }));
    expect(scoutChance({ scope: 9 })).toBe(0.95);
    expect(scoutChance({ scope: 0, debuff: 1 })).toBe(0.05);
  });
  it('실패하면 적이 좋아하는 거리가 가장 자주 나옴', () => {
    const w = fallbackWeights('near');
    expect(w.near + w.mid + w.far).toBeCloseTo(1, 5);
    expect(w.near).toBe(0.6);
    const rng = new Rng(7); let near = 0; let fail = 0;
    for (let i = 0; i < 2000; i++) { const r = rollScout(rng, WAESEON, { scope: 0 }); if (!r.success) { fail++; if (r.forced === 'near') near++; } }
    expect(near / fail).toBeGreaterThan(0.5);
    expect(fail / 2000).toBeGreaterThan(0.55);
  });
});

describe('승패', () => {
  it('선체가 0이 되면 끝', () => {
    const b = fresh('far'); b.ships[1].hull = 1;
    const b2 = b; b2.ships[1].crew.forEach((c) => { c.room = 'deck'; });
    b.projectiles.push({ from: 0, weapon: WEAPONS.cheonja, target: 'deck', t: 0, total: 0.05 });
    b.step();
    expect(b.result?.winner).toBe(0);
  });
  it('봇끼리 싸우면 10분 안에 끝나고, 원거리가 근접보다 유리', () => {
    let farWin = 0; let nearWin = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const f = runBotBattle(new Battle(PANOKSEON, WAESEON, 'far', { seed }), [{ volley: true }, {}]);
      const n = runBotBattle(new Battle(PANOKSEON, WAESEON, 'near', { seed }), [{ volley: true }, {}]);
      expect(f.result === null).toBe(false); expect(n.result === null).toBe(false);
      if (f.result?.winner === 0) farWin++;
      if (n.result?.winner === 0) nearWin++;
    }
    expect(farWin).toBeGreaterThan(nearWin);
  });
});
