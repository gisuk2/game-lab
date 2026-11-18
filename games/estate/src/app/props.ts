import type { ActionId } from '../economy/content';
import type { Estate } from '../economy/Estate';

/**
 * 영지 전경에 결재 결과가 보이게 하는 작은 소품 (임시 도트, 원본 480×270 좌표).
 * 지은 것(분수·동상·난간…)은 계속, 한 주짜리 행사(파티·축제)는 그다음 주에만.
 */
export function drawProps(c: CanvasRenderingContext2D, e: Estate, lastWeek: readonly ActionId[], t: number): void {
  const used = (id: ActionId) => (e.uses[id] ?? 0) > 0;
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  // 던전 분수 (던전 입구 왼쪽)
  if (used('fountain')) {
    const x = 350;
    const y = 214;
    px(x - 8, y + 2, 17, 4, '#5a6070');
    px(x - 7, y + 1, 15, 2, '#8a96a8');
    px(x - 6, y + 2, 13, 2, '#4a8ad0');
    px(x - 1, y - 8, 3, 9, '#8a96a8');
    px(x - 4, y - 9, 9, 2, '#8a96a8');
    const f = Math.floor(t / 180) % 3;
    px(x, y - 12 - f, 1, 3, '#a8d8ff');
    px(x - 3 - f, y - 7, 1, 2, '#a8d8ff');
    px(x + 3 + f, y - 7, 1, 2, '#a8d8ff');
  }
  // 진짜 금화 보물 상자: 던전 입구에 반짝임
  if (used('goldChest')) {
    px(414, 222, 9, 6, '#7a4a20');
    px(414, 221, 9, 2, '#a8702a');
    px(417, 223, 3, 2, '#f0c040');
    if (Math.floor(t / 250) % 2) px(424, 216, 1, 1, '#fff2a0');
    else px(411, 217, 1, 1, '#fff2a0');
  }
  // 무서운 경고문
  if (used('warningSigns')) {
    px(380, 210, 1, 14, '#5a3a20');
    px(375, 206, 12, 7, '#d8c8a0');
    px(377, 208, 8, 1, '#a02020');
    px(377, 210, 6, 1, '#a02020');
  }
  // 안전 난간
  if (used('railings')) {
    px(396, 224, 46, 1, '#c8a060');
    for (let x = 396; x <= 442; x += 6) px(x, 224, 1, 5, '#c8a060');
  }
  // 저택 개축: 비계
  if (used('renovate')) {
    for (let x = 280; x <= 296; x += 8) px(x, 96, 1, 70, '#a07840');
    for (let y = 104; y <= 160; y += 14) px(278, y, 21, 1, '#a07840');
  }
  // 영주 동상 (광장)
  if (used('statue')) {
    px(184, 236, 15, 4, '#7a7a80');
    px(189, 220, 5, 16, '#a8a8b0');
    px(188, 214, 7, 7, '#c8c8d0');
    px(186, 222, 3, 2, '#a8a8b0');
    px(194, 222, 4, 2, '#a8a8b0');
    px(197, 216, 1, 7, '#e0c050');
  }
  // 음유시인: 주점 위 음표
  if (used('bard')) {
    const k = (t / 40) % 30;
    c.globalAlpha = 1 - k / 30;
    px(150 + k / 3, 134 - k, 2, 2, '#f2e6cf');
    px(152 + k / 3, 129 - k, 1, 6, '#f2e6cf');
    c.globalAlpha = 1;
  }
  // 지난주 공짜 술 파티: 주점 깃발
  if (lastWeek.includes('party') || lastWeek.includes('duelTourney')) {
    const cols = ['#d04040', '#e0b040', '#40a0d0', '#60b050'];
    for (let i = 0; i < 12; i++) {
      const x = 80 + i * 7;
      const y = 150 + Math.round(Math.sin(i / 2) * 2);
      px(x, y, 4, 3, cols[i % 4]);
      px(x + 1, y + 3, 2, 1, cols[i % 4]);
    }
  }
  // 지난주 축제: 광장 등불
  if (lastWeek.includes('festival')) {
    for (let i = 0; i < 6; i++) px(170 + i * 8, 232 + (i % 2), 3, 3, Math.floor(t / 300 + i) % 2 ? '#ffd060' : '#ff9040');
  }
  // 지난주 호화 연회: 저택 창문이 더 밝게
  if (lastWeek.includes('banquet') || lastWeek.includes('birthdayWeek')) {
    c.globalAlpha = 0.35 + 0.15 * Math.sin(t / 300);
    px(196, 100, 70, 60, '#ffe080');
    c.globalAlpha = 1;
  }
}
