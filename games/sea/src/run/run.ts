// 한 바다 항해 (SEA-2): 지도 이동 · 위협 · 군량 · 전투 결과 이어 가기 · 보상 · 항구 · 임시 이벤트.
// 화면 없음. 화면(RunApp)과 봇(runbot)이 같이 씀. 수치는 전부 [추정].
import { Battle, Rng, type Result } from '../sim/battle';
import { PANOKSEON, WEAPONS, type FormationId, type ShipDef, type SystemId, type WeaponDef } from '../sim/data';
import { scaleEnemy, WAE_CANNON, WAE_ELITE, WAE_FLAGSHIP, WAE_MUSKET, WAE_SMALL } from './enemies';
import { edgeOf, generateMap, type MapNode, type NodeKind, type SeaMap } from './map';

export const RUN_RULES = {
  startGold: 20, startFood: 8,
  threatMove: 6, threatFog: -10, threatPort: 5, threatEliteWin: -15,
  starveDmg: 15,
  gold: { battle: [15, 25], elite: [35, 45], treasure: [40, 50] } as Record<string, [number, number]>,
  food: { battle: 1, elite: 2, treasure: 1 } as Record<string, number>,
  repairPerHull: 2, foodPrice: 3,
  weaponPrice: [35, 65] as const, // 일반, 개량
  upgrades: {
    reactor: { cost: 30, max: 12, add: 1 },
    ward: { cost: 60, max: 6, add: 2 },
    guns: { cost: 35, max: 4, add: 1 },
    gunsR: { cost: 30, max: 3, add: 1 },
    oars: { cost: 25, max: 4, add: 1 },
    medic: { cost: 20, max: 3, add: 1 },
  } as Record<string, { cost: number; max: number; add: number }>,
  rewardRepair: 8,
  maxCrew: 6,
  recruits: ['개똥', '삼돌', '마당쇠', '억쇠', '복실', '순돌', '칠복', '바우'],
  upgradeTier: 0.85, // 개량 총통 충전 배율
};

export type Phase = 'map' | 'battle' | 'reward' | 'port' | 'event' | 'won' | 'lost';
export interface WeaponItem { id: string; tier: 0 | 1; mount: SystemId | null }
export interface RunCrew { name: string; hp: number }
export type Reward =
  | { type: 'weapon'; item: WeaponItem }
  | { type: 'crew'; name: string }
  | { type: 'book'; formation: FormationId }
  | { type: 'repair'; hull: number };
export interface PortOffer { item: WeaponItem; price: number; sold: boolean }

export interface RunState {
  seed: number; map: SeaMap; at: string | null; visited: string[];
  hull: number; maxHull: number; gold: number; food: number; threat: number;
  crew: RunCrew[]; weapons: WeaponItem[]; formations: FormationId[];
  systems: Partial<Record<SystemId, number>>; reactor: number;
  phase: Phase; rewards: Reward[] | null; offers: PortOffer[]; eventText: string | null;
  step: number; log: string[]; battles: number; battleTime: number;
}

export function newRun(seed: number): RunState {
  return {
    seed, map: generateMap(seed), at: null, visited: [],
    hull: PANOKSEON.hull, maxHull: PANOKSEON.hull, gold: RUN_RULES.startGold, food: RUN_RULES.startFood, threat: 0,
    crew: PANOKSEON.crew.map((name) => ({ name, hp: 100 })),
    weapons: PANOKSEON.weapons.map((m) => ({ id: m.id, tier: 0, mount: m.mount })),
    formations: ['hakik'], systems: { ...PANOKSEON.systems }, reactor: PANOKSEON.reactor,
    phase: 'map', rewards: null, offers: [], eventText: null, step: 0, log: [], battles: 0, battleTime: 0,
  };
}

/** 판 안에서 쓰는 난수: 시드 + 지금까지의 단계로 정해짐 (다시 해도 같음) */
export function rngOf(run: RunState, tag: number): Rng { run.step++; return new Rng(run.seed * 7919 + run.step * 104729 + tag); }

export function weaponDef(it: WeaponItem): WeaponDef {
  const base = WEAPONS[it.id];
  return it.tier === 1 ? { ...base, name: `개량 ${base.name}`, charge: +(base.charge * RUN_RULES.upgradeTier).toFixed(1) } : base;
}
export const weaponName = (it: WeaponItem) => weaponDef(it).name;
export const aliveCrew = (run: RunState) => run.crew.filter((c) => c.hp > 0);

/** 지금 판 상태로 만든 우리 배 */
export function shipDef(run: RunState): ShipDef {
  return {
    ...PANOKSEON, hull: run.maxHull, reactor: run.reactor, systems: { ...run.systems },
    weapons: run.weapons.filter((w) => w.mount).map((w) => ({ id: w.id, mount: w.mount!, def: weaponDef(w) })),
    crew: aliveCrew(run).map((c) => c.name),
  };
}

export function node(run: RunState, id: string): MapNode { return run.map.nodes.find((n) => n.id === id)!; }
export function reachable(run: RunState): MapNode[] {
  if (run.phase !== 'map') return [];
  if (run.at === null) return run.map.nodes.filter((n) => n.floor === 0);
  return node(run, run.at).next.map((id) => node(run, id));
}

// ── 이동 ──
export function move(run: RunState, to: string): boolean {
  if (!reachable(run).some((n) => n.id === to)) return false;
  const e = edgeOf(run.map, run.at, to)!;
  if (run.food > 0) run.food--;
  else {
    for (const c of aliveCrew(run)) c.hp -= RUN_RULES.starveDmg;
    run.log.push(`🍚 군량이 없어 선원들이 굶주림 (피 −${RUN_RULES.starveDmg})`);
    if (!aliveCrew(run).length) { run.phase = 'lost'; return true; }
  }
  run.threat = clamp(run.threat + (e.fog ? RUN_RULES.threatFog : RUN_RULES.threatMove), 0, 100);
  if (e.fog) run.log.push('🌫 안개 항로로 숨어 감 — 위협 −');
  run.at = to; run.visited.push(to);
  const n = node(run, to);
  if (n.kind === 'battle' || n.kind === 'elite' || n.kind === 'boss') run.phase = 'battle';
  else if (n.kind === 'port') enterPort(run);
  else if (n.kind === 'treasure') { addLoot(run, 'treasure'); run.rewards = rollRewards(run, 'treasure'); run.phase = 'reward'; }
  else resolveEvent(run);
  return true;
}

// ── 전투 ──
/** 이 칸의 적 배 (위협 수치만큼 셈) */
export function enemyFor(run: RunState, n: MapNode = node(run, run.at!)): ShipDef {
  if (n.kind === 'boss') return WAE_FLAGSHIP;
  if (n.kind === 'elite') return scaleEnemy(WAE_ELITE, run.threat);
  const r = new Rng(run.seed * 131 + n.floor * 17 + n.col);
  if (n.floor <= 2) return scaleEnemy(WAE_SMALL, run.threat);
  return scaleEnemy(r.chance(0.4) ? WAE_CANNON : WAE_MUSKET, run.threat);
}

export function battleOptions(run: RunState) {
  return { start: { hull: run.hull, crewHp: aliveCrew(run).map((c) => c.hp) } };
}

/** 전투 결과를 판에 반영 */
export function finishBattle(run: RunState, b: Battle): Result | null {
  const me = b.ships[0]; const alive = aliveCrew(run);
  run.battles++; run.battleTime += b.t;
  run.hull = me.hull;
  alive.forEach((c, i) => { const bc = me.crew[i]; c.hp = bc && bc.alive ? Math.round(bc.hp) : 0; });
  for (const c of alive) if (c.hp <= 0) run.log.push(`💀 ${c.name} 쓰러짐`);
  if (!b.result || b.result.winner !== 0 || run.hull <= 0 || !aliveCrew(run).length) { run.phase = 'lost'; return b.result; }
  const n = node(run, run.at!);
  if (n.kind === 'boss') { run.phase = 'won'; return b.result; }
  if (n.kind === 'elite') { run.threat = clamp(run.threat + RUN_RULES.threatEliteWin, 0, 100); run.log.push('💀 정예를 꺾음 — 위협 −'); }
  addLoot(run, n.kind);
  run.rewards = rollRewards(run, n.kind);
  run.phase = 'reward';
  return b.result;
}

function addLoot(run: RunState, kind: NodeKind) {
  const r = rngOf(run, 1); const [lo, hi] = RUN_RULES.gold[kind] ?? [0, 0];
  const g = Math.round(lo + (hi - lo) * r.next()); const f = RUN_RULES.food[kind] ?? 0;
  run.gold += g; run.food += f;
  run.log.push(`🪙 금화 +${g}${f ? ` · 🍚 군량 +${f}` : ''}`);
}

// ── 보상: 셋 중 하나 또는 건너뛰기 ──
const GUN_IDS = ['cheonja', 'jija', 'hyeonja', 'hwangja'];
export function rollRewards(run: RunState, kind: NodeKind): Reward[] {
  const r = rngOf(run, 2); const out: Reward[] = [];
  const better = kind === 'elite' || kind === 'treasure';
  const weapon = (tier: 0 | 1): Reward => ({ type: 'weapon', item: { id: r.pick(GUN_IDS), tier, mount: null } });
  out.push(weapon(better || r.chance(0.2) ? 1 : 0));
  if (kind === 'treasure') out.push(weapon(1));
  const pool: Reward[] = [{ type: 'repair', hull: RUN_RULES.rewardRepair }];
  if (run.crew.length < RUN_RULES.maxCrew) {
    const free = RUN_RULES.recruits.filter((n) => !run.crew.some((c) => c.name === n));
    if (free.length) pool.push({ type: 'crew', name: r.pick(free) });
  }
  if (!run.formations.includes('jangsa')) pool.push({ type: 'book', formation: 'jangsa' });
  pool.push(weapon(0));
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]);
  return out;
}

export function takeReward(run: RunState, i: number | null): void {
  if (run.phase !== 'reward' || !run.rewards) return;
  const rw = i === null ? null : run.rewards[i];
  if (rw?.type === 'weapon') { run.weapons.push({ ...rw.item }); autoEquip(run, run.weapons.length - 1); run.log.push(`🎁 ${weaponName(rw.item)} 얻음`); }
  if (rw?.type === 'crew') { run.crew.push({ name: rw.name, hp: 100 }); run.log.push(`🎁 선원 ${rw.name} 합류`); }
  if (rw?.type === 'book') { run.formations.push(rw.formation); run.log.push('🎁 병서: 진법을 배움'); }
  if (rw?.type === 'repair') { run.hull = Math.min(run.maxHull, run.hull + rw.hull); run.log.push(`🎁 선체 수리 +${rw.hull}`); }
  run.rewards = null; run.phase = 'map';
}

// ── 총통 달기 ──
export function mountLoad(run: RunState, mount: SystemId, except = -1): number {
  return run.weapons.reduce((n, w, i) => n + (w.mount === mount && i !== except ? WEAPONS[w.id].power : 0), 0);
}
export function canMount(run: RunState, i: number, mount: SystemId): boolean {
  return mountLoad(run, mount, i) + WEAPONS[run.weapons[i].id].power <= (run.systems[mount] ?? 0);
}
export function equip(run: RunState, i: number, mount: SystemId | null): boolean {
  const w = run.weapons[i]; if (!w) return false;
  if (mount && !canMount(run, i, mount)) return false;
  w.mount = mount; return true;
}
function autoEquip(run: RunState, i: number) {
  for (const m of ['guns', 'gunsR'] as SystemId[]) if (canMount(run, i, m)) { run.weapons[i].mount = m; return; }
}

// ── 항구 ──
function enterPort(run: RunState) {
  run.threat = clamp(run.threat + RUN_RULES.threatPort, 0, 100);
  const r = rngOf(run, 3);
  run.offers = [0, 1].map((k) => { const tier = (k === 1 ? 1 : 0) as 0 | 1; return { item: { id: r.pick(GUN_IDS), tier, mount: null }, price: RUN_RULES.weaponPrice[tier], sold: false }; });
  run.phase = 'port';
}
export function repairCost(run: RunState, amount = run.maxHull - run.hull) { return Math.max(0, amount) * RUN_RULES.repairPerHull; }
export function repair(run: RunState, amount: number): boolean {
  amount = Math.min(amount, run.maxHull - run.hull, Math.floor(run.gold / RUN_RULES.repairPerHull));
  if (amount <= 0) return false;
  run.gold -= amount * RUN_RULES.repairPerHull; run.hull += amount; return true;
}
export function buyFood(run: RunState, n = 1): boolean {
  if (run.gold < RUN_RULES.foodPrice * n) return false;
  run.gold -= RUN_RULES.foodPrice * n; run.food += n; return true;
}
export function buyWeapon(run: RunState, k: number): boolean {
  const o = run.offers[k]; if (!o || o.sold || run.gold < o.price) return false;
  run.gold -= o.price; o.sold = true; run.weapons.push({ ...o.item }); autoEquip(run, run.weapons.length - 1); return true;
}
export function upgradeCost(run: RunState, k: string): number | null {
  const u = RUN_RULES.upgrades[k]; if (!u) return null;
  const cur = k === 'reactor' ? run.reactor : run.systems[k as SystemId] ?? 0;
  return cur + u.add > u.max ? null : u.cost;
}
export function upgrade(run: RunState, k: string): boolean {
  const cost = upgradeCost(run, k); if (cost === null || run.gold < cost) return false;
  run.gold -= cost; const u = RUN_RULES.upgrades[k];
  if (k === 'reactor') run.reactor += u.add; else run.systems[k as SystemId] = (run.systems[k as SystemId] ?? 0) + u.add;
  return true;
}
/** 의원에게 맡기기: 금화 10으로 모든 선원 회복 */
export function healAll(run: RunState): boolean {
  if (run.gold < 10 || aliveCrew(run).every((c) => c.hp >= 100)) return false;
  run.gold -= 10; for (const c of aliveCrew(run)) c.hp = 100; return true;
}
export function leavePort(run: RunState) { if (run.phase === 'port') { run.phase = 'map'; run.offers = []; } }

// ── 이벤트 (임시: 이순신의 눈 대사가 들어간 진짜 이벤트는 다음 묶음) ──
const EVENTS: { text: string; apply: (run: RunState) => void }[] = [
  { text: '떠다니는 상자를 건졌다. 금화가 들어 있다. (금화 +20)', apply: (r) => { r.gold += 20; } },
  { text: '물고기 떼를 만났다. 어부 출신 선원들이 그물을 던졌다. (군량 +2)', apply: (r) => { r.food += 2; } },
  { text: '숨은 암초에 배 밑이 긁혔다. (선체 −4)', apply: (r) => { r.hull = Math.max(1, r.hull - 4); } },
  { text: '조용한 바다. 선원들이 쉬었다. (모든 선원 피 +30)', apply: (r) => { for (const c of aliveCrew(r)) c.hp = Math.min(100, c.hp + 30); } },
  { text: '멀리서 왜 수군의 깃발이 보였다. 들킨 듯하다. (위협 +10)', apply: (r) => { r.threat = clamp(r.threat + 10, 0, 100); } },
];
function resolveEvent(run: RunState) {
  const r = rngOf(run, 4); const e = r.pick(EVENTS);
  e.apply(run); run.eventText = e.text; run.log.push(`❓ ${e.text}`); run.phase = 'event';
}
export function closeEvent(run: RunState) { if (run.phase === 'event') { run.phase = 'map'; run.eventText = null; } }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
