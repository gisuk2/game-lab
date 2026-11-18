import { circleHitsShape, type AttackShape } from '../utils/shapes';

/**
 * 시점 투영 (순수 로직). 로직 세계는 바닥 (x, y) + 높이 z.
 *  - 3D 시점: 바닥 모양 + 높이로 판정 (지금까지와 같음)
 *  - 2D 시점: 옆에서 본 평면 → 깊이(y)를 무시. 바닥 모양을 "x축 구간"으로 바꿔 좌우·높이만 본다.
 * 같은 공격이 시점에 따라 피할 수 있거나 없게 되는 것이 시점 전환 전투의 핵심.
 */
export type View = '2d' | '3d';

/** 높이 구간 [bottom, top] */
export interface HeightBand {
  bottom: number;
  top: number;
}

/** 기본 높이: 바닥부터 아주 높이까지 (점프로 못 넘음) */
export const FULL_HEIGHT: HeightBand = { bottom: 0, top: 10_000 };

/** 바닥 모양을 옆에서 봤을 때 차지하는 좌우 구간 [min, max] */
export function shapeXRange(shape: AttackShape): [number, number] {
  switch (shape.kind) {
    case 'circle':
      return [shape.cx - shape.radius, shape.cx + shape.radius];
    case 'rect': {
      const c = Math.cos(shape.angle);
      const s = Math.sin(shape.angle);
      const hw = shape.width / 2;
      const xs = [
        shape.x - s * hw,
        shape.x + s * hw,
        shape.x + c * shape.length - s * hw,
        shape.x + c * shape.length + s * hw,
      ];
      // (옆 방향 벡터 = (-sin, cos) → x 성분 -sin)
      return [Math.min(...xs), Math.max(...xs)];
    }
    case 'sector': {
      const { cx, radius, angle, arcRad } = shape;
      const a0 = angle - arcRad / 2;
      const a1 = angle + arcRad / 2;
      const xs = [cx, cx + Math.cos(a0) * radius, cx + Math.cos(a1) * radius];
      // 호가 0(오른쪽 끝) 또는 π(왼쪽 끝) 방향을 지나면 그 끝도 포함
      for (const k of [0, Math.PI]) {
        if (arcContains(angle, arcRad, k)) xs.push(cx + Math.cos(k) * radius);
      }
      return [Math.min(...xs), Math.max(...xs)];
    }
  }
}

function arcContains(center: number, arcRad: number, a: number): boolean {
  if (arcRad >= Math.PI * 2) return true;
  const d = Math.atan2(Math.sin(a - center), Math.cos(a - center));
  return Math.abs(d) <= arcRad / 2;
}

export interface Body {
  x: number;
  y: number;
  /** 발이 있는 높이 (점프) */
  z: number;
  radius: number;
  /** 키 */
  height: number;
}

/** 두 높이 구간이 겹치는가 */
export function heightOverlaps(b: Body, band: HeightBand): boolean {
  return b.z <= band.top && b.z + b.height >= band.bottom;
}

/** 몸이 공격 모양에 맞는가 (시점에 따라) */
export function bodyHitsShape(view: View, b: Body, shape: AttackShape, band: HeightBand = FULL_HEIGHT): boolean {
  if (!heightOverlaps(b, band)) return false;
  if (view === '3d') return circleHitsShape(b.x, b.y, b.radius, shape);
  const [lo, hi] = shapeXRange(shape);
  return b.x + b.radius >= lo && b.x - b.radius <= hi;
}
