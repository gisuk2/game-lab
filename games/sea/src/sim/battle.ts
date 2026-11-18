// 이세계 수군 — 전투 한 판의 순수 로직 (화면 없음). 고정 시간 간격으로 step(dt)을 부른다.
// 규칙: core.md §6.2(방), §7(물·불·구멍), §8(전투·거리·진법). 물은 아래로 흐르고 불은 위로 번진다.
import {
  FORMATIONS, FORMATION_COOLDOWN, MANNED, RULES, SYSTEM_NAME, WEAPONS,
  type Distance, type FormationId, type RoomDef, type ShipDef, type SystemId, type WeaponDef,
} from './data';

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
}

export type Side = 0 | 1;
export interface SysState { level: number; power: number; damage: number; repair: number; burn: number }
export interface Room extends RoomDef { water: number; fire: number; breach: boolean; breachRepair: number }
export interface Door { id: string; a: string; b: string; open: boolean }
export interface Crew { id: number; name: string; hp: number; maxHp: number; room: string; path: string[]; prog: number; alive: boolean }
export interface Weapon { def: WeaponDef; powered: boolean; charge: number; target: string | null }
export interface Ship {
  side: Side; def: ShipDef; hull: number; maxHull: number; reactor: number;
  rooms: Room[]; doors: Door[];
  sys: Partial<Record<SystemId, SysState>>;
  weapons: Weapon[]; crew: Crew[];
  wardLayers: number; wardTimer: number;
  formation: FormationId | null; formationCd: number;
  /** 일제 사격: 조준한 총통이 모두 차야 한꺼번에 쏨 (결계 뚫기용) */
  volley: boolean;
}
export interface Projectile { from: Side; weapon: WeaponDef; target: string; t: number; total: number }
export type EventKind = 'hit' | 'miss' | 'absorb' | 'breach' | 'fire' | 'death' | 'sysdown' | 'fired';
export interface BattleEvent { t: number; side: Side; room?: string; kind: EventKind; text: string }
export interface Result { winner: Side; reason: 'hull' | 'crew' }

export interface BattleOptions { seed?: number; formation?: [FormationId | null, FormationId | null] }

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const level = (r: Room) => r.water / r.w;

/** 처음 자리: 장대 → 포갑판 → 격군실 → 결계실 순 */
function startRoom(def: ShipDef, i: number): string {
  const order: SystemId[] = ['helm', 'guns', 'oars', 'ward'];
  const want = order[i % order.length];
  return (def.rooms.find((r) => r.sys === want) ?? def.rooms[0]).id;
}

export function makeShip(def: ShipDef, side: Side): Ship {
  const rooms: Room[] = def.rooms.map((r) => ({ ...r, water: 0, fire: 0, breach: false, breachRepair: 0 }));
  const doors: Door[] = [];
  for (const a of rooms) for (const b of rooms)
    if (a.floor === b.floor && a.col + a.w === b.col) doors.push({ id: `${a.id}|${b.id}`, a: a.id, b: b.id, open: false });
  const sys: Partial<Record<SystemId, SysState>> = {};
  for (const [k, lv] of Object.entries(def.systems) as [SystemId, number][]) sys[k] = { level: lv, power: 0, damage: 0, repair: 0, burn: 0 };
  return {
    side, def, hull: def.hull, maxHull: def.hull, reactor: def.reactor, rooms, doors, sys,
    weapons: def.weapons.map((id) => ({ def: WEAPONS[id], powered: false, charge: 0, target: null })),
    crew: def.crew.map((name, i) => ({ id: side * 100 + i, name, hp: 100, maxHp: 100, room: startRoom(def, i), path: [], prog: 0, alive: true })),
    wardLayers: 0, wardTimer: 0, formation: null, formationCd: 0, volley: false,
  };
}

export class Battle {
  t = 0;
  readonly rng: Rng;
  readonly ships: [Ship, Ship];
  projectiles: Projectile[] = [];
  events: BattleEvent[] = [];
  result: Result | null = null;

  constructor(a: ShipDef, b: ShipDef, readonly distance: Distance, opts: BattleOptions = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.ships = [makeShip(a, 0), makeShip(b, 1)];
    if (opts.formation) this.ships.forEach((s, i) => { s.formation = opts.formation![i]; });
  }

  // ── 조회 ──
  room(s: Ship, id: string): Room { const r = s.rooms.find((x) => x.id === id); if (!r) throw new Error('방 없음: ' + id); return r; }
  roomOf(s: Ship, sys: SystemId): Room | undefined { return s.rooms.find((r) => r.sys === sys); }
  usedPower(s: Ship): number { return Object.values(s.sys).reduce((n, x) => n + (x?.power ?? 0), 0); }
  freePower(s: Ship): number { return s.reactor - this.usedPower(s); }
  maxPower(s: Ship, sys: SystemId): number { const x = s.sys[sys]; return x ? x.level - x.damage : 0; }
  /** 실제로 일하는 마력: 고장·물에 잠김(60%↑)을 뺀 값 */
  eff(s: Ship, sys: SystemId): number {
    const x = s.sys[sys]; const r = this.roomOf(s, sys);
    if (!x || !r || level(r) >= RULES.offWater) return 0;
    return Math.min(x.power, x.level - x.damage);
  }
  crewIn(s: Ship, roomId: string): Crew[] { return s.crew.filter((c) => c.alive && c.room === roomId && c.path.length === 0); }
  manned(s: Ship, sys: SystemId): boolean {
    const r = this.roomOf(s, sys); if (!r || !MANNED.includes(sys)) return false;
    const x = s.sys[sys];
    const busy = r.fire > 0 || r.breach || (x?.damage ?? 0) > 0;
    return !busy && this.crewIn(s, r.id).length > 0;
  }
  evasion(s: Ship): number {
    if (this.eff(s, 'helm') < 1 || !this.manned(s, 'helm')) return 0;
    const e = this.eff(s, 'oars') * 0.06 + (this.manned(s, 'oars') ? 0.05 : 0) + 0.05;
    return Math.min(0.6, e);
  }
  maxLayers(s: Ship): number { return Math.floor(this.eff(s, 'ward') / 2); }
  hitChance(attacker: Side, w: WeaponDef): number { return w.acc[this.distance] * (1 - this.evasion(this.ships[other(attacker)])); }
  canToggleDoors(s: Ship): boolean { return this.eff(s, 'doors') >= 1; }

  // ── 명령 ──
  setPower(side: Side, sys: SystemId, n: number): void {
    if (sys === 'guns') return; // 포갑판 마력 = 켠 총통 마력 합 (toggleWeapon)
    const s = this.ships[side]; const x = s.sys[sys]; if (!x) return;
    x.power = Math.max(0, Math.min(n, this.maxPower(s, sys), x.power + this.freePower(s)));
  }
  addPower(side: Side, sys: SystemId, d: number): void {
    const x = this.ships[side].sys[sys]; if (x) this.setPower(side, sys, x.power + d);
  }
  toggleWeapon(side: Side, i: number, on?: boolean): boolean {
    const s = this.ships[side]; const w = s.weapons[i]; const g = s.sys.guns; if (!w || !g) return false;
    const want = on ?? !w.powered;
    if (want === w.powered) return true;
    if (!want) { w.powered = false; g.power -= w.def.power; return true; }
    if (g.power + w.def.power > this.maxPower(s, 'guns') || w.def.power > this.freePower(s)) return false;
    w.powered = true; g.power += w.def.power; return true;
  }
  setTarget(side: Side, i: number, roomId: string | null): void { const w = this.ships[side].weapons[i]; if (w) w.target = roomId; }
  moveCrew(side: Side, crewId: number, roomId: string): void {
    const s = this.ships[side]; const c = s.crew.find((x) => x.id === crewId && x.alive); if (!c) return;
    const from = c.path.length ? c.path[0] : c.room; // 이동 중이면 다음 방에서 다시 길을 찾음
    const rest = this.path(s, from, roomId);
    if (!rest) return;
    if (c.path.length) c.path = [c.path[0], ...rest];
    else { c.path = rest; c.prog = 0; }
  }
  toggleDoor(side: Side, doorId: string): boolean {
    const s = this.ships[side]; if (!this.canToggleDoors(s)) return false;
    const d = s.doors.find((x) => x.id === doorId); if (!d) return false;
    d.open = !d.open; return true;
  }
  setFormation(side: Side, f: FormationId): boolean {
    const s = this.ships[side];
    if (s.formationCd > 0 || s.formation === f) return false;
    s.formation = f; s.formationCd = FORMATION_COOLDOWN; return true;
  }

  // ── 길찾기: 문(같은 층 옆방)과 사다리(위아래) ──
  neighbors(s: Ship, id: string): { to: string; time: number; ladder: boolean; door?: Door }[] {
    const out: { to: string; time: number; ladder: boolean; door?: Door }[] = [];
    const cx = (r: Room) => r.col + r.w / 2;
    for (const d of s.doors) {
      if (d.a !== id && d.b !== id) continue;
      const a = this.room(s, d.a); const b = this.room(s, d.b);
      out.push({ to: d.a === id ? d.b : d.a, time: RULES.walkPerCol * Math.abs(cx(a) - cx(b)), ladder: false, door: d });
    }
    for (const l of s.def.ladders) {
      if (l.up === id) out.push({ to: l.down, time: RULES.ladderTime, ladder: true });
      if (l.down === id) out.push({ to: l.up, time: RULES.ladderTime, ladder: true });
    }
    return out;
  }
  path(s: Ship, from: string, to: string): string[] | null {
    if (from === to) return [];
    const dist = new Map<string, number>([[from, 0]]); const prev = new Map<string, string>();
    const open = new Set([from]);
    while (open.size) {
      let cur = ''; let best = Infinity;
      for (const o of open) if ((dist.get(o) ?? Infinity) < best) { best = dist.get(o)!; cur = o; }
      open.delete(cur);
      if (cur === to) break;
      for (const n of this.neighbors(s, cur)) {
        const nd = best + n.time;
        if (nd < (dist.get(n.to) ?? Infinity)) { dist.set(n.to, nd); prev.set(n.to, cur); open.add(n.to); }
      }
    }
    if (!prev.has(to)) return null;
    const p: string[] = []; let c = to;
    while (c !== from) { p.unshift(c); c = prev.get(c)!; }
    return p;
  }
  edgeTime(s: Ship, a: string, b: string): number { return this.neighbors(s, a).find((n) => n.to === b)?.time ?? 1; }

  private log(side: Side, kind: EventKind, text: string, room?: string) { this.events.push({ t: this.t, side, kind, text, room }); }

  // ── 한 틱 ──
  step(dt = RULES.dt): void {
    if (this.result) return;
    this.t += dt;
    for (const s of this.ships) this.stepShip(s, dt);
    this.stepProjectiles(dt);
    this.checkEnd();
  }

  private stepShip(s: Ship, dt: number) {
    // 고장으로 줄어든 최대치에 맞춰 마력 회수
    for (const [k, x] of Object.entries(s.sys) as [SystemId, SysState][]) {
      const max = x.level - x.damage;
      if (k === 'guns') {
        for (let i = s.weapons.length - 1; i >= 0 && x.power > max; i--) if (s.weapons[i].powered) this.toggleWeapon(s.side, i, false);
      } else if (x.power > max) x.power = max;
    }
    // 결계
    const maxL = this.maxLayers(s);
    if (s.wardLayers > maxL) s.wardLayers = maxL;
    if (s.wardLayers < maxL) {
      s.wardTimer += dt * (this.manned(s, 'ward') ? 1.25 : 1);
      if (s.wardTimer >= RULES.wardRecharge) { s.wardLayers++; s.wardTimer = 0; }
    } else s.wardTimer = 0;
    // 총통 충전·발사
    const f = s.formation ? FORMATIONS[s.formation] : null;
    const budget = this.eff(s, 'guns'); let cum = 0;
    const gunBonus = this.manned(s, 'guns') ? 1.1 : 1;
    let c2 = 0;
    const holding = s.volley && s.weapons.some((w) => { if (w.powered) c2 += w.def.power; return w.powered && w.target && c2 <= budget && w.charge < w.def.charge; });
    s.weapons.forEach((w) => {
      if (w.powered) cum += w.def.power;
      if (w.powered && cum <= budget) w.charge = Math.min(w.def.charge, w.charge + dt * (f?.charge ?? 1) * gunBonus);
      else w.charge = Math.max(0, w.charge - dt * 2);
      if (w.powered && w.charge >= w.def.charge && w.target && cum <= budget && !holding) {
        const total = RULES.travel[this.distance];
        for (let k = 0; k < w.def.shots; k++) this.projectiles.push({ from: s.side, weapon: w.def, target: w.target, t: -k * 0.2, total });
        w.charge = 0;
        this.log(other(s.side), 'fired', w.def.name, w.target);
      }
    });
    if (s.formationCd > 0) s.formationCd = Math.max(0, s.formationCd - dt);
    this.stepCrew(s, dt);
    this.stepWater(s, dt);
    this.stepFire(s, dt);
    // 의원실
    const heal = this.eff(s, 'medic'); const mr = this.roomOf(s, 'medic');
    if (heal > 0 && mr) for (const c of this.crewIn(s, mr.id)) c.hp = Math.min(c.maxHp, c.hp + RULES.heal * heal * dt);
    for (const c of s.crew) if (c.alive && c.hp <= 0) { c.alive = false; c.hp = 0; this.log(s.side, 'death', `${c.name} 쓰러짐`, c.room); }
  }

  private stepCrew(s: Ship, dt: number) {
    const f = s.formation ? FORMATIONS[s.formation] : null;
    for (const c of s.crew) {
      if (!c.alive) continue;
      if (c.path.length) {
        const here = this.room(s, c.room);
        const mul = (f?.move ?? 1) * (level(here) >= RULES.slowWater ? 0.6 : 1);
        c.prog += (dt * mul) / this.edgeTime(s, c.room, c.path[0]);
        if (c.prog >= 1) { c.room = c.path.shift()!; c.prog = 0; }
        continue;
      }
      // 제자리 일: 불 끄기 → 구멍 막기 → 고장 수리
      const r = this.room(s, c.room); const rep = f?.repair ?? 1;
      if (r.fire > 0) { r.fire = Math.max(0, r.fire - RULES.fireFightCrew * dt); continue; }
      if (r.breach) {
        r.breachRepair += RULES.repairBreach * dt * rep;
        if (r.breachRepair >= 1) { r.breach = false; r.breachRepair = 0; }
        continue;
      }
      const x = r.sys ? s.sys[r.sys] : undefined;
      if (x && x.damage > 0) {
        x.repair += RULES.repairSys * dt * rep;
        if (x.repair >= 1) { x.damage--; x.repair = 0; }
      }
    }
  }

  private stepWater(s: Ship, dt: number) {
    for (const r of s.rooms) if (r.breach) r.water = Math.min(r.w, r.water + RULES.inflow[r.floor] * dt);
    // 열린 문: 수위 맞추기
    for (const d of s.doors) {
      if (!d.open) continue;
      const a = this.room(s, d.a); const b = this.room(s, d.b);
      const diff = level(a) - level(b);
      const amt = RULES.doorFlow * diff * Math.min(a.w, b.w) * dt * 0.5;
      a.water -= amt; b.water += amt;
    }
    // 사다리 구멍: 위층 물이 아래층으로 떨어짐
    for (const l of s.def.ladders) {
      const up = this.room(s, l.up); const dn = this.room(s, l.down);
      if (up.water <= 0) continue;
      const amt = Math.min(up.water, Math.max(RULES.fall * up.water, 0.05) * dt, dn.w - dn.water);
      up.water -= amt; dn.water += amt;
    }
    // 배수실: 물 많은 방부터 퍼냄 (아래층 우선)
    let left = this.eff(s, 'pump') * RULES.pump * dt;
    const order = [...s.rooms].sort((a, b) => b.floor - a.floor || b.water - a.water);
    for (const r of order) { if (left <= 0) break; const take = Math.min(r.water, left); r.water -= take; left -= take; }
    for (const r of s.rooms) {
      r.water = Math.max(0, Math.min(r.w, r.water));
      const lv = level(r);
      const dmg = lv >= RULES.fullWater ? RULES.waterCrewDmg[1] : lv >= RULES.offWater ? RULES.waterCrewDmg[0] : 0;
      if (dmg) for (const c of this.crewIn(s, r.id)) c.hp -= dmg * dt;
    }
  }

  private stepFire(s: Ship, dt: number) {
    const ignite: string[] = [];
    for (const r of s.rooms) {
      if (r.fire <= 0) continue;
      if (level(r) >= RULES.slowWater) { r.fire = Math.max(0, r.fire - RULES.fireDouse * dt); continue; }
      r.fire = Math.min(1, r.fire + RULES.fireGrow * dt);
      const x = r.sys ? s.sys[r.sys] : undefined;
      if (x) {
        x.burn += RULES.fireSysDmg * r.fire * dt;
        if (x.burn >= 1) { x.burn = 0; if (x.damage < x.level) { x.damage++; this.log(s.side, 'sysdown', `${SYSTEM_NAME[r.sys!]} 불에 탐`, r.id); } }
      }
      for (const c of this.crewIn(s, r.id)) c.hp -= RULES.fireCrewDmg * r.fire * dt;
      // 번짐: 열린 문 쉽게, 닫힌 문 어렵게, 사다리는 위로 쉽게(불은 위로)
      for (const n of this.neighbors(s, r.id)) {
        let p: number;
        if (n.ladder) p = this.room(s, n.to).floor < r.floor ? RULES.fireSpread : RULES.fireSpreadClosed;
        else p = n.door?.open ? RULES.fireSpread : RULES.fireSpreadClosed;
        if (this.rng.chance(p * r.fire * dt)) ignite.push(n.to);
      }
    }
    for (const id of ignite) {
      const r = this.room(s, id);
      if (r.fire === 0 && level(r) < RULES.slowWater) { r.fire = 0.2; this.log(s.side, 'fire', '불이 번짐', id); }
    }
  }

  private stepProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.t < p.total) { keep.push(p); continue; }
      this.resolve(p);
    }
    this.projectiles = keep;
  }

  private resolve(p: Projectile) {
    const T = this.ships[other(p.from)]; const w = p.weapon;
    if (!this.rng.chance(this.hitChance(p.from, w))) { this.log(T.side, 'miss', '빗나감', p.target); return; }
    let dmg = w.dmg;
    if (T.wardLayers > 0) {
      const through = Math.min(T.wardLayers, w.pierce ?? 0);
      if (T.wardLayers > through) { T.wardLayers--; this.log(T.side, 'absorb', '결계가 막음', p.target); return; }
      T.wardLayers -= through; dmg -= through; // 뚫고 들어감
      if (dmg <= 0) { this.log(T.side, 'absorb', '결계가 막음', p.target); return; }
    }
    const r = this.room(T, p.target);
    T.hull = Math.max(0, T.hull - dmg);
    this.log(T.side, 'hit', `-${dmg}`, r.id);
    const x = r.sys ? T.sys[r.sys] : undefined;
    if (x && x.damage < x.level) { x.damage = Math.min(x.level, x.damage + dmg); x.repair = 0; }
    for (const c of this.crewIn(T, r.id)) c.hp -= w.crewDmg;
    for (const c of T.crew) if (c.alive && c.path.length && c.room === r.id) c.hp -= w.crewDmg * 0.5;
    if (!r.breach && this.rng.chance(w.breach)) { r.breach = true; this.log(T.side, 'breach', '구멍!', r.id); }
    if (this.rng.chance(w.fire) && level(r) < RULES.slowWater) { r.fire = Math.max(r.fire, 0.3); this.log(T.side, 'fire', '불!', r.id); }
  }

  private checkEnd() {
    for (const s of this.ships) {
      if (s.hull <= 0) { this.result = { winner: other(s.side), reason: 'hull' }; return; }
      if (s.crew.every((c) => !c.alive || c.hp <= 0)) { this.result = { winner: other(s.side), reason: 'crew' }; return; }
    }
  }
}
