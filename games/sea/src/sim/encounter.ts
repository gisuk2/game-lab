// 조우 때 거리 정하기 (core.md §8.5): 정찰 판정 성공 → 플레이어가 고름, 실패 → 무작위(적이 좋아하는 쪽으로 기움)
import { RULES, type Distance, type ShipDef } from './data';
import type { Rng } from './battle';

export const DISTANCES: Distance[] = ['far', 'mid', 'near'];

export interface ScoutMods { scope: number; bonus?: number; debuff?: number }

export function scoutChance(m: ScoutMods): number {
  const p = RULES.scoutBase + RULES.scoutPerScope * m.scope + (m.bonus ?? 0) - (m.debuff ?? 0);
  return Math.max(0.05, Math.min(0.95, p));
}

/** 실패 때 거리: 적이 좋아하는 거리 60%, 바로 옆 거리 30%, 반대쪽 10% */
export function fallbackWeights(prefers: Distance): Record<Distance, number> {
  const i = DISTANCES.indexOf(prefers);
  const w = {} as Record<Distance, number>;
  DISTANCES.forEach((d, j) => { const k = Math.abs(i - j); w[d] = k === 0 ? 0.6 : k === 1 ? (i === 1 ? 0.2 : 0.3) : 0.1; });
  return w;
}

export interface ScoutResult { chance: number; success: boolean; /** 실패 때 정해진 거리 (성공이면 null: 플레이어가 고름) */ forced: Distance | null }

export function rollScout(rng: Rng, enemy: ShipDef, m: ScoutMods): ScoutResult {
  const chance = scoutChance(m);
  if (rng.chance(chance)) return { chance, success: true, forced: null };
  const w = fallbackWeights(enemy.prefers);
  let r = rng.next(); let forced: Distance = enemy.prefers;
  for (const d of DISTANCES) { if (r < w[d]) { forced = d; break; } r -= w[d]; }
  return { chance, success: false, forced };
}
