// 배 평면을 화면 좌표로 바꾸는 순수 함수 (그리기·클릭 판정 공용). flip이면 좌우를 뒤집어 뱃머리가 왼쪽(적 배)
import type { Battle, Crew, Door, Ship } from '../sim/battle';

export interface Rect { x: number; y: number; w: number; h: number }
export interface ShipView { ox: number; oy: number; cell: number; flip: boolean }

export function gridSize(s: Ship) {
  return { cols: Math.max(...s.rooms.map((r) => r.x + r.w)), rows: Math.max(...s.rooms.map((r) => r.y + r.h)) };
}
export function shipSize(s: Ship, v: ShipView) { const g = gridSize(s); return { w: g.cols * v.cell, h: g.rows * v.cell, ...g }; }

/** 칸 좌표 → 화면 좌표 */
export function toScreen(s: Ship, v: ShipView, gx: number, gy: number) {
  const { cols } = gridSize(s);
  return { x: v.ox + (v.flip ? cols - gx : gx) * v.cell, y: v.oy + gy * v.cell };
}

export function roomRect(s: Ship, id: string, v: ShipView): Rect {
  const r = s.rooms.find((x) => x.id === id)!;
  const a = toScreen(s, v, r.x, r.y); const b = toScreen(s, v, r.x + r.w, r.y + r.h);
  return { x: Math.min(a.x, b.x), y: a.y, w: Math.abs(b.x - a.x), h: b.y - a.y };
}

export function doorRect(s: Ship, d: Door, v: ShipView): Rect {
  const p = toScreen(s, v, d.x, d.y); const L = v.cell * 0.4; const T = 6;
  return d.vert ? { x: p.x - T / 2, y: p.y - L / 2, w: T, h: L } : { x: p.x - L / 2, y: p.y - T / 2, w: L, h: T };
}

export function roomAt(s: Ship, v: ShipView, px: number, py: number): string | null {
  for (const r of s.rooms) {
    const q = roomRect(s, r.id, v);
    if (px >= q.x && px < q.x + q.w && py >= q.y && py < q.y + q.h) return r.id;
  }
  return null;
}

/** 선원 위치: 방 안에서는 칸마다 자리, 이동 중이면 방 가운데 → 문 → 다음 방 가운데 */
export function crewPos(b: Battle, s: Ship, c: Crew, v: ShipView): { x: number; y: number } {
  const mid = (id: string) => { const q = roomRect(s, id, v); return { x: q.x + q.w / 2, y: q.y + q.h / 2 + 8 }; };
  if (c.path.length) {
    const n = b.neighbors(s, c.room).find((x) => x.to === c.path[0]);
    const a = mid(c.room); const z = mid(c.path[0]);
    if (!n) return a;
    const d = toScreen(s, v, n.door.x, n.door.y); const dd = { x: d.x, y: d.y + 8 };
    return c.prog < 0.5 ? { x: a.x + (dd.x - a.x) * c.prog * 2, y: a.y + (dd.y - a.y) * c.prog * 2 }
      : { x: dd.x + (z.x - dd.x) * (c.prog - 0.5) * 2, y: dd.y + (z.y - dd.y) * (c.prog - 0.5) * 2 };
  }
  const q = roomRect(s, c.room, v);
  const here = s.crew.filter((x) => x.alive && x.room === c.room && x.path.length === 0);
  const i = Math.max(0, here.indexOf(c)); const n = here.length;
  const cols = Math.max(1, Math.round(q.w / (v.cell * 0.5))); const rows = Math.ceil(n / cols);
  const col = i % cols; const row = Math.floor(i / cols);
  return { x: q.x + (q.w * (col + 0.5)) / Math.min(cols, n), y: q.y + q.h / 2 + 10 + (row - (rows - 1) / 2) * 26 };
}
