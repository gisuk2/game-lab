// 한 바다의 지도 (SEA-2): 슬더스식 갈림길. 아래(0층)에서 위(보스)로 올라감.
// 규칙: direction.md §2·§6, 칸 비율은 2026-11-19 합의(전투 4~5 · 정예 1~2 · 이벤트 2~3 · 항구 1~2 · 보물 1 · 보스).
import { Rng } from '../sim/battle';

export type NodeKind = 'battle' | 'elite' | 'event' | 'port' | 'treasure' | 'boss';
export interface MapNode { id: string; floor: number; col: number; kind: NodeKind; next: string[] }
export interface MapEdge { from: string; to: string; fog: boolean }
export interface SeaMap { seed: number; floors: number; cols: number; nodes: MapNode[]; edges: MapEdge[] }

export const KIND_NAME: Record<NodeKind, string> = { battle: '전투', elite: '정예', event: '이벤트', port: '항구', treasure: '보물', boss: '보스' };
export const KIND_ICON: Record<NodeKind, string> = { battle: '⚔', elite: '💀', event: '❓', port: '⚓', treasure: '💰', boss: '🏯' };

export const MAP_RULES = {
  floors: 10, // 0~8 일반, 9 보스
  cols: 5,
  walks: 6, // 아래에서 위로 그어 보는 항로 수
  treasureFloor: 4, // 중간: 보물 고정
  portFloor: 8, // 보스 바로 앞: 항구 고정
  midPort: [3, 7] as const, // 이 층 사이에 항구가 하나 이상 지나가야 함 (어느 길로 가든)
  eliteFrom: 3,
  weights: { battle: 0.5, event: 0.27, elite: 0.13, port: 0.1 } as Record<'battle' | 'event' | 'elite' | 'port', number>,
  fogRate: 0.2,
};

const nid = (f: number, c: number) => `${f}-${c}`;

/** 두 간선이 엇갈리는가 (같은 층 사이에서 좌우가 뒤바뀜) */
function crosses(a: [number, number], b: [number, number]): boolean {
  return (a[0] < b[0] && a[1] > b[1]) || (a[0] > b[0] && a[1] < b[1]);
}

export function generateMap(seed: number): SeaMap {
  for (let attempt = 0; attempt < 200; attempt++) {
    const m = tryGenerate(seed * 31 + attempt);
    if (m && everyPathHasPort(m)) return { ...m, seed };
  }
  // 거의 일어나지 않음: 마지막 시도에서 중간 층 하나를 항구로 강제
  const m = tryGenerate(seed * 31 + 999)!;
  for (const n of m.nodes) if (n.floor === 6) n.kind = 'port';
  return { ...m, seed };
}

function tryGenerate(seed: number): Omit<SeaMap, 'seed'> | null {
  const R = MAP_RULES; const rng = new Rng(seed);
  const edges = new Map<string, Set<string>>(); // from -> to
  const pairs: [number, number, number][] = []; // floor, fromCol, toCol
  const used = new Set<string>();
  const starts: number[] = [];
  for (let w = 0; w < R.walks; w++) {
    let c = w < 2 ? [1, 3][w] : Math.floor(rng.next() * R.cols); // 처음 두 항로는 시작점이 다르게
    starts.push(c);
    used.add(nid(0, c));
    for (let f = 0; f < R.floors - 2; f++) {
      const opts = [c - 1, c, c + 1].filter((x) => x >= 0 && x < R.cols)
        .filter((x) => !pairs.some(([pf, a, b]) => pf === f && crosses([c, x], [a, b])));
      if (!opts.length) return null;
      const nx = rng.pick(opts);
      pairs.push([f, c, nx]);
      const k = nid(f, c);
      if (!edges.has(k)) edges.set(k, new Set());
      edges.get(k)!.add(nid(f + 1, nx));
      used.add(nid(f + 1, nx));
      c = nx;
    }
  }
  const boss = nid(R.floors - 1, Math.floor(R.cols / 2));
  const nodes: MapNode[] = [];
  for (const id of used) {
    const [f, c] = id.split('-').map(Number);
    nodes.push({ id, floor: f, col: c, kind: 'battle', next: [...(edges.get(id) ?? [])] });
  }
  for (const n of nodes) if (n.floor === R.floors - 2) n.next = [boss];
  nodes.push({ id: boss, floor: R.floors - 1, col: Math.floor(R.cols / 2), kind: 'boss', next: [] });
  // 칸 종류
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = (n: MapNode) => nodes.filter((p) => p.next.includes(n.id));
  for (const n of [...nodes].sort((a, b) => a.floor - b.floor)) {
    if (n.kind === 'boss') continue;
    if (n.floor === 0) { n.kind = 'battle'; continue; }
    if (n.floor === R.treasureFloor) { n.kind = 'treasure'; continue; }
    if (n.floor === R.portFloor) { n.kind = 'port'; continue; }
    for (let tries = 0; tries < 10; tries++) {
      let r = rng.next(); let kind: NodeKind = 'battle';
      for (const [k, w] of Object.entries(R.weights) as [NodeKind, number][]) { if (r < w) { kind = k; break; } r -= w; }
      if (kind === 'elite' && n.floor < R.eliteFrom) continue;
      if (kind === 'port' && n.floor < 2) continue;
      // 정예·항구는 바로 이어서 두 번 나오지 않게
      if ((kind === 'elite' || kind === 'port') && parents(n).some((p) => p.kind === kind)) continue;
      if (kind === 'port' && n.floor === R.portFloor - 1) continue;
      n.kind = kind; break;
    }
  }
  const edgeList: MapEdge[] = [];
  for (const n of nodes) for (const t of n.next) {
    const fog = byId.get(t)!.kind !== 'boss' && n.floor > 0 && rng.chance(R.fogRate);
    edgeList.push({ from: n.id, to: t, fog });
  }
  return { floors: R.floors, cols: R.cols, nodes, edges: edgeList };
}

/** 어느 길로 가든 중간(3~7층)에 항구를 하나 이상 지나는가 */
export function everyPathHasPort(m: Omit<SeaMap, 'seed'>): boolean {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const [lo, hi] = MAP_RULES.midPort;
  const ok = (id: string, seen: boolean): boolean => {
    const n = byId.get(id)!;
    const s = seen || (n.kind === 'port' && n.floor >= lo && n.floor <= hi);
    if (n.kind === 'boss') return s;
    return n.next.every((t) => ok(t, s));
  };
  return m.nodes.filter((n) => n.floor === 0).every((n) => ok(n.id, false));
}

/** 처음부터 보스까지 가능한 모든 길 (테스트·봇용) */
export function allPaths(m: SeaMap): string[][] {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const out: string[][] = [];
  const walk = (id: string, acc: string[]) => {
    const n = byId.get(id)!; const p = [...acc, id];
    if (!n.next.length) out.push(p); else for (const t of n.next) walk(t, p);
  };
  for (const n of m.nodes.filter((x) => x.floor === 0)) walk(n.id, []);
  return out;
}

export function edgeOf(m: SeaMap, from: string | null, to: string): MapEdge | null {
  if (from === null) { const n = m.nodes.find((x) => x.id === to); return n && n.floor === 0 ? { from: '', to, fog: false } : null; }
  return m.edges.find((e) => e.from === from && e.to === to) ?? null;
}
