// 한 바다 항해 봇 (SEA-2): 길·보상·항구를 고르고 전투는 전투 봇이 함. 완주율로 밸런스를 봄.
import { Battle, Rng, specActive } from '../sim/battle';
import { SKILL, runBotBattle } from '../sim/bot';
import { WEAPONS, type Distance, type SystemId } from '../sim/data';
import { DISTANCES, rollScout } from '../sim/encounter';
import { enemyBot } from './enemies';
import { edgeOf, type MapNode } from './map';
import {
  battleOptions, buyFood, buyWeapon, closeEvent, enemyFor, equip, finishBattle, healAll, leavePort, move, newRun,
  reachable, repair, shipDef, takeReward, upgrade, upgradeCost, weaponDef, type RunState,
} from './run';

export type Skill = keyof typeof SKILL;

/** 이 거리에서 켜지는 우리 특화 수 (정찰 성공 때 거리 고르기) */
export function bestDistance(run: RunState): Distance {
  const ws = shipDef(run).weapons.map((m) => m.def ?? WEAPONS[m.id]);
  let best: Distance = 'far'; let score = -1;
  for (const d of DISTANCES) { const s = ws.filter((w) => specActive(w, d)).length + (d === 'far' ? 0.5 : 0); if (s > score) { score = s; best = d; } }
  return best;
}

function pickNode(run: RunState, skill: Skill, rng: Rng): MapNode {
  const opts = reachable(run);
  if (skill === 'idle') return opts[0];
  const hp = run.hull / run.maxHull;
  const score = (n: MapNode) => {
    const fog = edgeOf(run.map, run.at, n.id)?.fog ? (run.threat > 40 ? 1.5 : 0.3) : 0;
    const k = { battle: 1, elite: hp > 0.7 ? 1.5 : -3, event: 0.6, port: hp < 0.6 || run.food < 2 ? 3 : 0.4, treasure: 2, boss: 0 }[n.kind];
    return k + fog + (skill === 'novice' ? rng.next() * 2 : rng.next() * 0.3);
  };
  return [...opts].sort((a, b) => score(b) - score(a))[0];
}

function fight(run: RunState, skill: Skill, seed: number): void {
  const foe = enemyFor(run); const me = shipDef(run);
  const boss = foe.id === 'wae-flagship';
  let d: Distance = 'mid';
  if (!boss) {
    const sc = rollScout(new Rng(seed), foe, { scope: run.systems.scope ?? 0 });
    d = sc.success ? (skill === 'expert' ? bestDistance(run) : 'mid') : sc.forced!;
  }
  const form = skill === 'expert' ? run.formations[0] ?? null : null;
  const b = new Battle(me, foe, d, { seed, formation: [form, null], ...battleOptions(run) });
  runBotBattle(b, [SKILL[skill], enemyBot(foe)], 900);
  finishBattle(run, b);
}

function chooseReward(run: RunState, skill: Skill): number | null {
  const rw = run.rewards!;
  if (skill === 'idle') return null;
  if (skill === 'novice') { const rep = rw.findIndex((r) => r.type === 'repair'); return run.hull < run.maxHull * 0.5 && rep >= 0 ? rep : 0; }
  const hp = run.hull / run.maxHull;
  const value = (i: number) => {
    const r = rw[i];
    if (r.type === 'repair') return hp < 0.6 ? 5 : 0.5;
    if (r.type === 'crew') return run.crew.filter((c) => c.hp > 0).length < 4 ? 4 : 1.5;
    if (r.type === 'book') return 2;
    if (r.type === 'relic') return 4.5;
    const w = weaponDef(r.item);
    const dps = (w.dmg * w.shots) / w.charge / w.power;
    return 2 + dps * 20 + (r.item.tier ? 1 : 0);
  };
  return rw.map((_, i) => i).sort((a, b) => value(b) - value(a))[0];
}

/** 쓸모없는 총통을 내리고 좋은 총통을 다는 간단한 정리 */
function arrangeWeapons(run: RunState) {
  const dps = (i: number) => { const w = weaponDef(run.weapons[i]); return (w.dmg * w.shots) / w.charge; };
  const order = run.weapons.map((_, i) => i).sort((a, b) => dps(b) - dps(a));
  for (const i of order) equip(run, i, null);
  for (const i of order) for (const m of ['guns', 'gunsR'] as SystemId[]) if (equip(run, i, m)) break;
}

function shop(run: RunState, skill: Skill) {
  if (skill === 'idle') return leavePort(run);
  repair(run, Math.ceil(run.maxHull * 0.8) - run.hull);
  // 초보: 고치고 남는 돈으로 눈에 띄는 것 하나 (결계)
  if (skill === 'novice' && upgradeCost(run, 'ward') !== null && run.gold >= (upgradeCost(run, 'ward') ?? 0)) upgrade(run, 'ward');
  if (skill === 'expert') {
    healAll(run);
    while (run.food < 3 && buyFood(run)) { /* 군량 */ }
    for (const k of ['ward', 'guns', 'reactor', 'oars']) if (upgradeCost(run, k) !== null && run.gold >= (upgradeCost(run, k) ?? 0) + 10) upgrade(run, k);
    if (run.offers[1] && run.gold >= run.offers[1].price + 10) buyWeapon(run, 1);
    arrangeWeapons(run);
  }
  leavePort(run);
}

export interface RunReport { won: boolean; floor: number; battles: number; battleTime: number; hull: number; gold: number; threat: number; crew: number }

export function playRun(seed: number, skill: Skill): RunReport {
  const run = newRun(seed); const rng = new Rng(seed * 3 + 1);
  let guard = 0;
  while (run.phase !== 'won' && run.phase !== 'lost' && guard++ < 100) {
    if (run.phase === 'map') move(run, pickNode(run, skill, rng).id);
    else if (run.phase === 'battle') fight(run, skill, seed * 1000 + run.battles);
    else if (run.phase === 'reward') { takeReward(run, chooseReward(run, skill)); if (skill === 'expert') arrangeWeapons(run); }
    else if (run.phase === 'port') shop(run, skill);
    else if (run.phase === 'event') closeEvent(run);
  }
  const floor = run.at ? run.map.nodes.find((n) => n.id === run.at)!.floor : -1;
  return { won: run.phase === 'won', floor, battles: run.battles, battleTime: run.battleTime, hull: run.hull, gold: run.gold, threat: run.threat, crew: run.crew.filter((c) => c.hp > 0).length };
}
