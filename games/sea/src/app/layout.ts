// 배 단면을 화면 좌표로 바꾸는 순수 함수 (그리기·클릭 판정·테스트 공용)
import type { Battle, Crew, Ship } from '../sim/battle';

export interface Rect { x: number; y: number; w: number; h: number }
export interface ShipView { ox: number; oy: number; cell: number; floorH: number; flip: boolean }

export function shipSize(s: Ship, v: ShipView) {
  const cols = Math.max(...s.rooms.map((r) => r.col + r.w));
  return { w: cols * v.cell, h: 2 * v.floorH, cols };
}

/** 방 사각형. flip이면 좌우를 뒤집어 뱃머리가 왼쪽(적 배) */
export function roomRect(s: Ship, id: string, v: ShipView): Rect {
  const r = s.rooms.find((x) => x.id === id)!;
  const { cols } = shipSize(s, v);
  const col = v.flip ? cols - r.col - r.w : r.col;
  return { x: v.ox + col * v.cell, y: v.oy + r.floor * v.floorH, w: r.w * v.cell, h: v.floorH };
}

export function ladderX(s: Ship, col: number, v: ShipView): number {
  const { cols } = shipSize(s, v);
  return v.ox + ((v.flip ? cols - col - 1 : col) + 0.5) * v.cell;
}

export function roomAt(s: Ship, v: ShipView, px: number, py: number): string | null {
  for (const r of s.rooms) {
    const q = roomRect(s, r.id, v);
    if (px >= q.x && px < q.x + q.w && py >= q.y && py < q.y + q.h) return r.id;
  }
  return null;
}

/** 선원 위치: 방 안에서는 바닥을 따라 나란히, 이동 중이면 두 방 사이를 보간 */
export function crewPos(b: Battle, s: Ship, c: Crew, v: ShipView): { x: number; y: number } {
  const foot = (id: string, slot: number, n: number) => {
    const q = roomRect(s, id, v);
    return { x: q.x + (q.w * (slot + 1)) / (n + 1), y: q.y + q.h - v.floorH * 0.22 };
  };
  const here = s.crew.filter((x) => x.alive && x.room === c.room && x.path.length === 0);
  if (!c.path.length) return foot(c.room, Math.max(0, here.indexOf(c)), here.length);
  const a = foot(c.room, 0, 1); const z = foot(c.path[0], 0, 1);
  const ladder = b.neighbors(s, c.room).find((n) => n.to === c.path[0])?.ladder;
  if (ladder) {
    const l = s.def.ladders.find((L) => (L.up === c.room && L.down === c.path[0]) || (L.down === c.room && L.up === c.path[0]))!;
    const lx = ladderX(s, l.col, v); const p = c.prog;
    if (p < 0.25) return { x: a.x + (lx - a.x) * (p / 0.25), y: a.y };
    if (p < 0.75) return { x: lx, y: a.y + (z.y - a.y) * ((p - 0.25) / 0.5) };
    return { x: lx + (z.x - lx) * ((p - 0.75) / 0.25), y: z.y };
  }
  return { x: a.x + (z.x - a.x) * c.prog, y: a.y };
}
