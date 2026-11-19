// 이세계 수군 — 전투 한 판의 순수 로직 (화면 없음). 고정 시간 간격으로 step(dt)을 부른다.
// 규칙: core.md §6.2(방), §7(물·불·구멍), §8(전투·거리·진법).
// 배는 위에서 내려다본 평면: 붙은 방끼리 문, 바깥 벽 방은 구멍 나면 물이 빨리 참, 배수구로 물을 뺌.
import {
  FORMATIONS, FORMATION_COOLDOWN, GUN_SYS, MANNED, RULES, SYSTEM_NAME, WEAPONS,
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
/** want = 플레이어가 원한 마력. 고장·침수로 빠졌다가 고쳐지면 저절로 다시 꽂힘 */
export interface SysState { level: number; power: number; want: number; damage: number; repair: number; burn: number }
export interface Room extends RoomDef { water: number; fire: number; breach: boolean; bigBreach: boolean; breachRepair: number; outer: boolean }
/** 문: b가 null이면 배수구(바깥 문). x, y = 문 가운데(칸 단위), vert = 세로 벽에 달린 문 */
export interface Door { id: string; a: string; b: string | null; open: boolean; x: number; y: number; vert: boolean }
export interface Crew { id: number; name: string; hp: number; maxHp: number; room: string; path: string[]; prog: number; alive: boolean }
export interface Weapon { def: WeaponDef; mount: SystemId; powered: boolean; want: boolean; charge: number; target: string | null }
export interface Ship {
  side: Side; def: ShipDef; hull: number; maxHull: number; reactor: number;
  rooms: Room[]; doors: Door[];
  sys: Partial<Record<SystemId, SysState>>;
  weapons: Weapon[]; crew: Crew[];
  wardLayers: number; wardTimer: number;
  formation: FormationId | null; formationCd: number;
  /** 일제 사격: 조준한 총통이 모두 차야 한꺼번에 쏨 (결계 뚫기용) */
  volley: boolean;
  /** 유물 효과 (run/relics.ts의 modsOf) */
  mods: ShipMods;
  /** 거북 등껍질 판: 맞을 때마다 쌓이는 결계 재충전 보너스 */
  wardBonus: number;
  /** 오행 부채: 남은 충전 2배 시간 */
  burst: number;
  /** 엘프 별자리 망원경: 첫 일제 사격 시각 */
  firstFireAt: number | null;
}

/** 유물이 전투에 주는 효과 */
export interface ShipMods {
  chargeStart?: number; chargeMul?: number;
  farEvadeCut?: number; firstVolleyX2?: boolean;
  breachRepairMul?: number; fireFightMul?: number;
  wardStack?: boolean; waterCharge?: number; formationBurst?: boolean;
}
export interface Projectile { from: Side; weapon: WeaponDef; target: string; t: number; total: number; spec?: boolean; mul?: number }

/** 이 거리에서 무기의 특화 보너스가 켜지는가 */
export const specActive = (w: WeaponDef, d: Distance) => w.spec.at === d;
export type EventKind = 'hit' | 'miss' | 'absorb' | 'breach' | 'fire' | 'death' | 'sysdown' | 'fired';
export interface BattleEvent { t: number; side: Side; room?: string; kind: EventKind; text: string }
export type CrewTask = 'move' | 'fire' | 'breach' | 'repair' | 'man' | 'heal' | 'idle';
export interface Result { winner: Side; reason: 'hull' | 'crew' }
export interface BattleOptions {
  seed?: number; formation?: [FormationId | null, FormationId | null];
  /** 한 판(항해)에서 이어지는 우리 배 상태: 선체, 선원 체력(0 이하면 이미 쓰러짐) */
  start?: { hull?: number; crewHp?: number[] };
  /** 유물 효과: [우리, 적] */
  mods?: [ShipMods | undefined, ShipMods | undefined];
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const area = (r: RoomDef) => r.w * r.h;
const level = (r: Room) => r.water / area(r);
const center = (r: RoomDef) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** 붙은 방 사이 문, 배수구, 바깥 벽 방 계산 */
export function buildDoors(def: ShipDef): { doors: Door[]; outer: Set<string> } {
  const doors: Door[] = [];
  const R = def.rooms;
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i]; const b = R[j];
    if (a.x + a.w === b.x || b.x + b.w === a.x) { // 세로 벽 공유
      const y0 = Math.max(a.y, b.y); const y1 = Math.min(a.y + a.h, b.y + b.h);
      if (y1 > y0) doors.push({ id: `${a.id}|${b.id}`, a: a.id, b: b.id, open: false, x: a.x + a.w === b.x ? b.x : a.x, y: (y0 + y1) / 2, vert: true });
    } else if (a.y + a.h === b.y || b.y + b.h === a.y) { // 가로 벽 공유
      const x0 = Math.max(a.x, b.x); const x1 = Math.min(a.x + a.w, b.x + b.w);
      if (x1 > x0) doors.push({ id: `${a.id}|${b.id}`, a: a.id, b: b.id, open: false, x: (x0 + x1) / 2, y: a.y + a.h === b.y ? b.y : a.y, vert: false });
    }
  }
  // 바깥 벽: 방 둘레의 칸 변 중 다른 방과 맞닿지 않은 것이 있으면 바깥 방
  const cell = new Set<string>();
  for (const r of R) for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) cell.add(`${x},${y}`);
  const outer = new Set<string>();
  for (const r of R) {
    let out = false;
    for (let x = r.x; x < r.x + r.w; x++) { if (!cell.has(`${x},${r.y - 1}`) || !cell.has(`${x},${r.y + r.h}`)) out = true; }
    for (let y = r.y; y < r.y + r.h; y++) { if (!cell.has(`${r.x - 1},${y}`) || !cell.has(`${r.x + r.w},${y}`)) out = true; }
    if (out) outer.add(r.id);
  }
  for (const d of def.drains) {
    const r = R.find((x) => x.id === d.room)!;
    const pos = d.side === 'n' ? { x: r.x + r.w / 2, y: r.y, vert: false } : d.side === 's' ? { x: r.x + r.w / 2, y: r.y + r.h, vert: false }
      : d.side === 'w' ? { x: r.x, y: r.y + r.h / 2, vert: true } : { x: r.x + r.w, y: r.y + r.h / 2, vert: true };
    doors.push({ id: `${r.id}|바다`, a: r.id, b: null, open: false, ...pos });
  }
  return { doors, outer };
}

/** 처음 자리: 장대 → 포갑판 → 격군실 → 결계실 순 */
function startRoom(def: ShipDef, i: number): string {
  const order: SystemId[] = ['helm', 'guns', 'oars', 'ward'];
  const want = order[i % order.length];
  return (def.rooms.find((r) => r.sys === want) ?? def.rooms[0]).id;
}

export function makeShip(def: ShipDef, side: Side): Ship {
  const { doors, outer } = buildDoors(def);
  const rooms: Room[] = def.rooms.map((r) => ({ ...r, water: 0, fire: 0, breach: false, bigBreach: false, breachRepair: 0, outer: outer.has(r.id) }));
  const sys: Partial<Record<SystemId, SysState>> = {};
  for (const [k, lv] of Object.entries(def.systems) as [SystemId, number][]) sys[k] = { level: lv, power: 0, want: 0, damage: 0, repair: 0, burn: 0 };
  return {
    side, def, hull: def.hull, maxHull: def.hull, reactor: def.reactor, rooms, doors, sys,
    weapons: def.weapons.map((w) => ({ def: w.def ?? WEAPONS[w.id], mount: w.mount, powered: false, want: false, charge: 0, target: null })),
    crew: def.crew.map((name, i) => ({ id: side * 100 + i, name, hp: 100, maxHp: 100, room: startRoom(def, i), path: [], prog: 0, alive: true })),
    wardLayers: 0, wardTimer: 0, formation: null, formationCd: 0, volley: false, mods: {}, wardBonus: 0, burst: 0, firstFireAt: null,
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
    opts.mods?.forEach((m, i) => {
      if (!m) return; const sh = this.ships[i]; sh.mods = m;
      if (m.chargeStart) sh.weapons.forEach((w) => { w.charge = w.def.charge * m.chargeStart!; });
    });
    const st = opts.start; const me = this.ships[0];
    if (st?.hull !== undefined) me.hull = Math.max(1, Math.min(me.maxHull, st.hull));
    st?.crewHp?.forEach((hp, i) => { const c = me.crew[i]; if (!c) return; c.hp = Math.min(c.maxHp, hp); if (hp <= 0) { c.alive = false; c.hp = 0; } });
  }

  // ── 조회 ──
  room(s: Ship, id: string): Room { const r = s.rooms.find((x) => x.id === id); if (!r) throw new Error('방 없음: ' + id); return r; }
  roomOf(s: Ship, sys: SystemId): Room | undefined { return s.rooms.find((r) => r.sys === sys); }
  usedPower(s: Ship): number { return Object.values(s.sys).reduce((n, x) => n + (x?.power ?? 0), 0); }
  freePower(s: Ship): number { return s.reactor - this.usedPower(s); }
  maxPower(s: Ship, sys: SystemId): number { const x = s.sys[sys]; return x ? x.level - x.damage : 0; }
  waterLevel(r: Room): number { return level(r); }
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
  /** 선원이 지금 하는 일 (화면 표시용, stepCrew와 같은 우선순위) */
  crewTask(s: Ship, c: Crew): CrewTask {
    if (!c.alive) return 'idle';
    if (c.path.length) return 'move';
    const r = this.room(s, c.room); const x = r.sys ? s.sys[r.sys] : undefined;
    if (r.fire > 0) return 'fire';
    if (r.breach) return 'breach';
    if (x && x.damage > 0) return 'repair';
    if (r.sys && MANNED.includes(r.sys)) return 'man';
    if (r.sys === 'medic' && this.eff(s, 'medic') > 0 && c.hp < c.maxHp) return 'heal';
    return 'idle';
  }
  evasion(s: Ship): number {
    if (this.eff(s, 'helm') < 1 || !this.manned(s, 'helm')) return 0;
    const e = this.eff(s, 'oars') * 0.06 + (this.manned(s, 'oars') ? 0.05 : 0) + 0.05;
    return Math.min(0.6, e);
  }
  maxLayers(s: Ship): number { return Math.floor(this.eff(s, 'ward') / 2); }
  hitChance(attacker: Side, w: WeaponDef): number {
    let ev = this.evasion(this.ships[other(attacker)]);
    const cut = this.ships[attacker].mods.farEvadeCut;
    if (cut && this.distance === 'far') ev = Math.max(0, ev - cut);
    return w.acc * (1 - ev);
  }
  /** 우리 배에 찬 물 칸 수 (어인의 물항아리) */
  waterCells(s: Ship): number { return s.rooms.reduce((n, r) => n + r.water, 0); }
  canToggleDoors(s: Ship): boolean { return this.eff(s, 'doors') >= 1; }
  /** 이 총통이 지금 충전될 수 있나: 달린 포갑판의 일하는 마력 안에 들어야 함 */
  gunLive(s: Ship, i: number): boolean {
    const w = s.weapons[i]; if (!w.powered) return false;
    let cum = 0;
    for (let k = 0; k <= i; k++) if (s.weapons[k].powered && s.weapons[k].mount === w.mount) cum += s.weapons[k].def.power;
    return cum <= this.eff(s, w.mount);
  }

  // ── 명령 ──
  /** 마력 정하기: 원하는 값(want)을 기억하고, 지금 꽂을 수 있는 만큼만 꽂음 */
  setPower(side: Side, sys: SystemId, n: number): void {
    if (GUN_SYS.includes(sys)) return; // 포갑판 마력 = 켠 총통 마력 합 (toggleWeapon)
    const s = this.ships[side]; const x = s.sys[sys]; if (!x) return;
    x.want = Math.max(0, Math.min(n, x.level));
    x.power = Math.max(0, Math.min(x.want, this.maxPower(s, sys), x.power + this.freePower(s)));
  }
  /** +1: 원하는 값을 하나 올림(고장으로 못 꽂힌 상태면 그대로) / −1: 원하는 값을 하나 내림 */
  addPower(side: Side, sys: SystemId, d: number): void {
    const x = this.ships[side].sys[sys]; if (!x) return;
    this.setPower(side, sys, d > 0 ? Math.max(x.want, x.power + 1) : x.want - 1);
  }
  toggleWeapon(side: Side, i: number, on?: boolean): boolean {
    const s = this.ships[side]; const w = s.weapons[i]; if (!w) return false;
    const want = on ?? !w.want;
    w.want = want;
    if (!want) { this.unpowerGun(s, i); return true; }
    return this.powerGun(s, i);
  }
  private powerGun(s: Ship, i: number): boolean {
    const w = s.weapons[i]; const g = s.sys[w.mount]; if (!g) return false;
    if (w.powered) return true;
    if (g.power + w.def.power > this.maxPower(s, w.mount) || w.def.power > this.freePower(s)) return false;
    w.powered = true; g.power += w.def.power; g.want = Math.max(g.want, g.power); return true;
  }
  private unpowerGun(s: Ship, i: number) {
    const w = s.weapons[i]; const g = s.sys[w.mount]; if (!g || !w.powered) return;
    w.powered = false; g.power -= w.def.power;
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
    s.formation = f; s.formationCd = FORMATION_COOLDOWN;
    if (s.mods.formationBurst) s.burst = 3;
    return true;
  }

  // ── 길찾기: 방 사이 문 (배수구 제외) ──
  neighbors(s: Ship, id: string): { to: string; time: number; door: Door }[] {
    const out: { to: string; time: number; door: Door }[] = [];
    for (const d of s.doors) {
      if (d.b === null || (d.a !== id && d.b !== id)) continue;
      const to = d.a === id ? d.b : d.a;
      const a = center(this.room(s, id)); const door = { x: d.x, y: d.y }; const b = center(this.room(s, to));
      const dist = Math.abs(a.x - door.x) + Math.abs(a.y - door.y) + Math.abs(b.x - door.x) + Math.abs(b.y - door.y);
      out.push({ to, time: RULES.walkPerCell * dist, door: d });
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
    this.stepPower(s);
    // 결계
    const maxL = this.maxLayers(s);
    if (s.wardLayers > maxL) s.wardLayers = maxL;
    if (s.wardLayers < maxL) {
      s.wardTimer += dt * (this.manned(s, 'ward') ? 1.25 : 1) * (1 + s.wardBonus);
      if (s.wardTimer >= RULES.wardRecharge) { s.wardLayers++; s.wardTimer = 0; }
    } else s.wardTimer = 0;
    // 총통 충전·발사
    const f = s.formation ? FORMATIONS[s.formation] : null;
    const relicCharge = (s.mods.chargeMul ?? 1) * (1 + (s.mods.waterCharge ?? 0) * this.waterCells(s)) * (s.burst > 0 ? 2 : 1);
    const live = s.weapons.map((_, i) => this.gunLive(s, i));
    const holding = s.volley && s.weapons.some((w, i) => live[i] && w.target && w.charge < w.def.charge);
    s.weapons.forEach((w, i) => {
      const sp = specActive(w.def, this.distance);
      const bonus = (this.manned(s, w.mount) ? 1.1 : 1) * (sp ? w.def.spec.charge ?? 1 : 1) * relicCharge;
      if (live[i]) w.charge = Math.min(w.def.charge, w.charge + dt * (f?.charge ?? 1) * bonus);
      else w.charge = Math.max(0, w.charge - dt * 2);
      if (live[i] && w.charge >= w.def.charge && w.target && !holding) {
        const total = RULES.travel[this.distance];
        const shots = sp ? w.def.spec.shots ?? w.def.shots : w.def.shots;
        // 일제 사격이면 큰 총통은 조금 늦게 도착: 가벼운 탄이 먼저 결계를 벗김
        const lag = s.volley && w.def.dmg > 1 ? 0.5 : 0;
        // 엘프 별자리 망원경: 처음 쏜 뒤 1초 안에 나간 탄(첫 일제 사격)은 피해 2배
        if (s.mods.firstVolleyX2 && s.firstFireAt === null) s.firstFireAt = this.t;
        const mul = s.mods.firstVolleyX2 && s.firstFireAt !== null && this.t - s.firstFireAt < 1 ? 2 : 1;
        for (let k = 0; k < shots; k++) this.projectiles.push({ from: s.side, weapon: w.def, target: w.target, t: -k * 0.2 - lag, total, spec: sp, mul });
        w.charge = 0;
        this.log(other(s.side), 'fired', w.def.name, w.target);
      }
    });
    if (s.formationCd > 0) s.formationCd = Math.max(0, s.formationCd - dt);
    if (s.burst > 0) s.burst = Math.max(0, s.burst - dt);
    this.stepCrew(s, dt);
    this.stepWater(s, dt);
    this.stepFire(s, dt);
    // 의원실
    const heal = this.eff(s, 'medic'); const mr = this.roomOf(s, 'medic');
    if (heal > 0 && mr) for (const c of this.crewIn(s, mr.id)) c.hp = Math.min(c.maxHp, c.hp + RULES.heal * heal * dt);
    for (const c of s.crew) if (c.alive && c.hp <= 0) { c.alive = false; c.hp = 0; this.log(s.side, 'death', `${c.name} 쓰러짐`, c.room); }
  }

  /** 고장으로 줄어든 최대치에 맞춰 마력을 빼고, 고쳐지면 원래(want)대로 다시 꽂음 */
  private stepPower(s: Ship) {
    for (const [k, x] of Object.entries(s.sys) as [SystemId, SysState][]) {
      const max = x.level - x.damage;
      if (GUN_SYS.includes(k)) {
        for (let i = s.weapons.length - 1; i >= 0 && x.power > max; i--) if (s.weapons[i].mount === k && s.weapons[i].powered) this.unpowerGun(s, i);
      } else if (x.power > max) x.power = max;
    }
    for (const k of Object.keys(s.sys) as SystemId[]) {
      const x = s.sys[k]!;
      if (GUN_SYS.includes(k)) continue;
      const target = Math.min(x.want, x.level - x.damage);
      if (x.power < target) x.power = Math.min(target, x.power + this.freePower(s));
    }
    s.weapons.forEach((w, i) => { if (w.want && !w.powered) this.powerGun(s, i); });
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
      if (r.fire > 0) { r.fire = Math.max(0, r.fire - RULES.fireFightCrew * dt * (s.mods.fireFightMul ?? 1)); continue; }
      if (r.breach) {
        r.breachRepair += RULES.repairBreach * dt * rep * (s.mods.breachRepairMul ?? 1);
        if (r.breachRepair >= 1) { r.breach = false; r.bigBreach = false; r.breachRepair = 0; }
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
    for (const r of s.rooms) {
      if (!r.breach) continue;
      const drainOpen = s.doors.some((d) => d.b === null && d.a === r.id && d.open);
      r.water += RULES.inflow[r.outer ? 1 : 0] * dt * (drainOpen ? RULES.drainSplash : 1) * (r.bigBreach ? 2 : 1);
    }
    for (const d of s.doors) {
      if (!d.open) continue;
      const a = this.room(s, d.a);
      if (d.b === null) { a.water = Math.max(0, a.water - RULES.drain * dt); continue; } // 배수구: 바다로 빠짐
      const b = this.room(s, d.b);
      const diff = level(a) - level(b);
      const amt = RULES.doorFlow * diff * Math.min(area(a), area(b)) * dt * 0.5;
      a.water -= amt; b.water += amt;
    }
    // 배수실: 물 많은 방부터 퍼냄
    let left = this.eff(s, 'pump') * RULES.pump * dt;
    const order = [...s.rooms].sort((a, b) => level(b) - level(a));
    for (const r of order) { if (left <= 0) break; const take = Math.min(r.water, left); r.water -= take; left -= take; }
    for (const r of s.rooms) {
      r.water = Math.max(0, Math.min(area(r), r.water));
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
        if (x.burn >= 1) { x.burn = 0; if (x.damage < x.level) { x.damage++; this.log(s.side, 'sysdown', `${r.name ?? SYSTEM_NAME[r.sys!]} 불에 탐`, r.id); } }
      }
      for (const c of this.crewIn(s, r.id)) c.hp -= RULES.fireCrewDmg * r.fire * dt;
      for (const n of this.neighbors(s, r.id)) {
        const p = n.door.open ? RULES.fireSpread : RULES.fireSpreadClosed;
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
    let dmg = w.dmg * (p.mul ?? 1); const sp = p.spec ? w.spec : null;
    if (T.wardLayers > 0) {
      const through = Math.min(T.wardLayers, sp?.pierce ?? w.pierce ?? 0);
      if (T.wardLayers > through) { T.wardLayers--; this.log(T.side, 'absorb', '결계가 막음', p.target); return; }
      T.wardLayers -= through; dmg -= through; // 뚫고 들어감
      if (dmg <= 0) { this.log(T.side, 'absorb', '결계가 막음', p.target); return; }
    }
    const r = this.room(T, p.target);
    T.hull = Math.max(0, T.hull - dmg);
    if (T.mods.wardStack) T.wardBonus = Math.min(1, T.wardBonus + 0.1);
    this.log(T.side, 'hit', `-${dmg}`, r.id);
    const x = r.sys ? T.sys[r.sys] : undefined;
    const extra = sp?.rooms && r.sys && sp.rooms.includes(r.sys) ? sp.extra ?? 0 : 0;
    if (x && x.damage < x.level) { x.damage = Math.min(x.level, x.damage + dmg + extra); x.repair = 0; }
    const crewDmg = w.crewDmg * (sp?.crewMul ?? 1);
    for (const c of this.crewIn(T, r.id)) c.hp -= crewDmg;
    for (const c of T.crew) if (c.alive && c.path.length && c.room === r.id) c.hp -= crewDmg * 0.5;
    if (!r.breach && this.rng.chance(sp?.breach ?? w.breach)) { r.breach = true; r.bigBreach = !!sp?.bigBreach; this.log(T.side, 'breach', r.bigBreach ? '큰 구멍!' : '구멍!', r.id); }
    if (this.rng.chance(w.fire * (sp?.fireMul ?? 1)) && level(r) < RULES.slowWater) { r.fire = Math.max(r.fire, 0.3); this.log(T.side, 'fire', '불!', r.id); }
  }

  private checkEnd() {
    for (const s of this.ships) {
      if (s.hull <= 0) { this.result = { winner: other(s.side), reason: 'hull' }; return; }
      if (s.crew.every((c) => !c.alive || c.hp <= 0)) { this.result = { winner: other(s.side), reason: 'crew' }; return; }
    }
  }
}
