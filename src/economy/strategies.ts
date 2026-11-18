import { ACTIONS, ECONOMY, type ActionId } from './content';
import { Estate, type Status } from './Estate';

/**
 * 밸런스 확인용 자동 플레이 전략 (봇). 매주 서류를 고른다.
 * 좋은 설계라면: 아무것도 안 함·한 가지 반복·대놓고 낭비·무작위는 대부분 실패, 생각해서 고르는 전략만 성공.
 */
export type Strategy = (e: Estate, rng: () => number) => ActionId[];

export const idle: Strategy = () => [];
export const mostExpensive: Strategy = (e) => [...e.available()].sort((a, b) => b.cost - a.cost).map((a) => a.id);
export const spamParty: Strategy = () => ['party'];
export const obviousWaste: Strategy = (e) => [...e.available()].sort((a, b) => b.suspicion - a.suspicion).map((a) => a.id);
export const random: Strategy = (e, rng) => {
  const ids = e.available().map((a) => a.id);
  return Array.from({ length: ECONOMY.actionsPerWeek }, () => ids[Math.floor(rng() * ids.length)]);
};

/**
 * 한 장씩 계산: "끝날 때까지 실제로 사라지는 돈"(비용 − 돌아올 돈 − 집사 + 남은 주 × 유지비 …)이 큰 순서.
 * 마감이 가까우면 "이번 마감 전에 사라지는 돈"을 더 중요하게 본다 (함정이라도 고를 이유).
 */
export const thoughtful: Strategy = (e) => {
  const weeksLeft = ECONOMY.weeks - e.week + 1;
  const dl = e.nextDeadline;
  const urgent = dl && e.gold > dl.cap * 0.8 && dl.week - e.week <= 1;
  const dungeonNow = ECONOMY.income.dungeon * e.reputation * e.prosperityMul;
  const score = (id: ActionId): number => {
    const a = ACTIONS.find((x) => x.id === id)!;
    const ret = a.returns;
    const retTotal = ret ? ret.perWeek * Math.min(ret.weeks, Math.max(0, weeksLeft - ret.delay + 1)) * e.prosperityMul : 0;
    const butler = a.cost * ECONOMY.butlerRate * Math.min(e.learned[id] ?? 0, ECONOMY.butlerMaxUses);
    const upkeep = (a.upkeep ?? 0) * weeksLeft;
    const repLoss = a.reputationMul ? dungeonNow * (1 - a.reputationMul) * weeksLeft : 0;
    const closed = a.dungeonClosed ? dungeonNow * Math.min(a.dungeonClosed.weeks, weeksLeft) - dungeonNow * ((a.dungeonClosed.afterRep ?? 1) - 1) * Math.max(0, weeksLeft - a.dungeonClosed.weeks) : 0;
    const prosperityCost = a.prosperity * 40 * weeksLeft;
    const longRun = a.cost + (a.debt ?? 0) - retTotal - butler + upkeep + repLoss + closed - prosperityCost;
    const now = a.cost + (a.debt ?? 0) - butler; // 이번 주에 바로 사라지는 돈
    return urgent ? now : longRun;
  };
  const picks: ActionId[] = [];
  let sus = e.suspicion;
  let pros = e.prosperity;
  if (sus >= 55 && e.check('donation') === 'ok') {
    picks.push('donation');
    sus += e.suspicionDelta('donation');
  }
  for (const id of e.available().map((a) => a.id).sort((x, y) => score(y) - score(x))) {
    if (picks.length >= ECONOMY.actionsPerWeek) break;
    const a = ACTIONS.find((x) => x.id === id)!;
    if (picks.includes(id) || score(id) <= 0 || e.check(id) !== 'ok') continue;
    if (sus + e.suspicionDelta(id) >= 80) continue;
    if (pros + a.prosperity >= 90) continue;
    picks.push(id);
    sus += e.suspicionDelta(id);
    pros += a.prosperity;
  }
  return picks;
};

function rollout(e: Estate): number {
  const c = e.clone();
  while (c.status === 'playing') {
    for (const id of thoughtful(c, () => 0.5)) c.take(id);
    c.endWeek();
  }
  if (c.status === 'bankrupt') return 100_000 - Math.abs(c.gold);
  return -Math.max(0, c.gold) - (c.status === 'caught' || c.status === 'summoned' ? 60_000 : 0);
}

/** 내다보기: 이번 주 가능한 조합(최대 3장)을 전부 시험 → 남은 주는 thoughtful로 끝까지 */
export const planner: Strategy = (e) => {
  const ids = e.available().map((a) => a.id).filter((id) => e.check(id) === 'ok');
  const combos: ActionId[][] = [[]];
  for (let i = 0; i < ids.length; i++) {
    combos.push([ids[i]]);
    for (let j = i + 1; j < ids.length; j++) {
      combos.push([ids[i], ids[j]]);
      for (let k = j + 1; k < ids.length; k++) combos.push([ids[i], ids[j], ids[k]]);
    }
  }
  let best: ActionId[] = [];
  let bestScore = -Infinity;
  for (const combo of combos) {
    const c = e.clone();
    if (combo.some((id) => c.take(id) !== 'ok')) continue;
    c.endWeek();
    const sc = c.status === 'bankrupt' ? 200_000 - Math.abs(c.gold) : c.status === 'playing' ? rollout(c) : -100_000;
    if (sc > bestScore) {
      bestScore = sc;
      best = combo;
    }
  }
  return best;
};

export interface RunResult {
  status: Status;
  week: number;
  gold: number;
  suspicion: number;
  prosperity: number;
  royalAttention: number;
  picks: ActionId[][];
}

export function play(strategy: Strategy, seed = 1): RunResult {
  const e = new Estate();
  const rng = mulberry32(seed);
  const picks: ActionId[][] = [];
  while (e.status === 'playing') {
    const p = strategy(e, rng).filter((id) => e.take(id) === 'ok');
    picks.push(p);
    e.endWeek();
  }
  return { status: e.status, week: e.week - 1, gold: e.gold, suspicion: e.suspicion, prosperity: e.prosperity, royalAttention: e.royalAttention, picks };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
