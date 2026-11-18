import { ACTIONS, type ActionId, type DistrictId, type Reason } from '../economy/content';
import type { Estate } from '../economy/Estate';
import { BY_ACTION, BY_REASON, GIVEN, PLAIN, ROLES, SURNAMES, pick, type Newspaper } from './news';

/**
 * 구역 안 장면 (위에서 내려다봄, 원본 480×270): 배경 그림 + 돌아다니는 영지민 + 설치물 + 말풍선.
 * 영지민 대사는 신문 인터뷰·지난주 돈이 들어온 이유·지어 둔 시설에서 나옴 → "가 보기"로 오면 신문 속 사람이 실제로 있음.
 * 장면 계산(누가 몇 명, 무슨 말)은 순수 함수(planScene)로 분리해서 테스트.
 */

type Rect = [number, number, number, number];
type Style = 'adventurer' | 'veteran' | 'mage' | 'porter' | 'clerk' | 'drunk' | 'barkeep' | 'bard' | 'servant' | 'chef' | 'maid' | 'merchant' | 'kid' | 'nun' | 'pilgrim' | 'priest' | 'townsfolk';

interface Layout {
  /** 걸어 다닐 수 있는 곳 */
  walk: Rect[];
  /** 앉거나 서 있는 자리 */
  spots: [number, number][];
  /** 일하는 사람 고정 자리 (집사·바텐더…) */
  staff: { at: [number, number]; style: Style; role: string }[];
}

const LAYOUT: Record<DistrictId, Layout> = {
  dungeon: {
    walk: [[40, 90, 270, 200], [130, 196, 175, 262], [100, 70, 200, 92]],
    spots: [[70, 160], [96, 142], [200, 100], [230, 176], [60, 120], [180, 180], [150, 150]],
    staff: [{ at: [268, 168], style: 'clerk', role: '던전 관리인' }],
  },
  tavern: {
    walk: [[20, 92, 300, 262]],
    spots: [[60, 140], [92, 140], [76, 124], [162, 150], [194, 150], [178, 166], [256, 118], [288, 118], [94, 222], [126, 222], [220, 220], [252, 220], [48, 84], [92, 84], [136, 84]],
    staff: [{ at: [110, 50], style: 'barkeep', role: '바텐더' }],
  },
  manor: {
    walk: [[10, 52, 240, 262], [150, 52, 176, 262]],
    spots: [[42, 112], [70, 112], [98, 112], [42, 160], [70, 160], [98, 160], [200, 120], [220, 200]],
    staff: [{ at: [190, 70], style: 'servant', role: '하인' }],
  },
  square: {
    walk: [[10, 60, 310, 262]],
    spots: [[54, 60], [140, 60], [262, 60], [70, 196], [244, 192], [180, 160], [130, 170]],
    staff: [{ at: [54, 56], style: 'merchant', role: '노점상' }, { at: [262, 56], style: 'merchant', role: '광장 상인' }],
  },
  chapel: {
    walk: [[148, 66, 172, 262], [20, 240, 300, 262]],
    spots: [[60, 96], [100, 122], [220, 96], [250, 148], [80, 174], [230, 200], [110, 226]],
    staff: [{ at: [160, 70], style: 'priest', role: '신부' }],
  },
};

const ROLE_STYLE: Record<string, Style> = {
  '초짜 모험가': 'adventurer', '베테랑 용사': 'veteran', 짐꾼: 'porter', '던전 관리인': 'clerk', '길 잃은 마법사': 'mage', '함정 수리공': 'porter', '은퇴한 궁수': 'veteran',
  주정뱅이: 'drunk', '주점 단골': 'townsfolk', 바텐더: 'barkeep', '떠돌이 악사': 'bard', '외상 장부 1번': 'drunk', '술통 나르는': 'porter',
  조리장: 'chef', 하인: 'servant', 정원사: 'townsfolk', '저택 서기': 'clerk', 하녀장: 'maid', 마부: 'porter', '집사 견습생': 'servant',
  노점상: 'merchant', '광장 상인': 'merchant', 구경꾼: 'townsfolk', '동네 꼬마': 'kid', '풍선 장수': 'merchant',
  수녀: 'nun', 종지기: 'townsfolk', 순례자: 'pilgrim', 성가대원: 'nun',
};

/** 시설이 있을 때 영지민이 하는 말 */
const OBJECT_LINES: Partial<Record<ActionId, string[]>> = {
  fountain: ['분수 물 시원하다! 한 판 더 하고 와야지.', '여기서 쉬었다 가면 좀 덜 다치더라고.'],
  goldChest: ['상자에 진짜 금화가 있대!', '줄 서세요, 줄! 상자는 하나예요!'],
  warningSigns: ['"죽을 수 있음"… 원래 그런 데 아니었어?', '경고문 보고 그냥 돌아갈까 봐요.'],
  railings: ['난간이 생겨서 안전하긴 한데… 재미가 없어.', '떨어질 뻔했는데 난간 덕에 살았어.'],
  bard: ['저 노래 또 나오네. 영주님이 용을 맨손으로 잡았다나?', '♪ 동쪽 던전의 영주님은~'],
  chef: ['조리장 스튜 냄새 좀 봐.', '오늘 저녁은 뭘까요?'],
  renovate: ['방이 또 늘었어요. 청소는 누가 하죠?', '망치 소리 때문에 잠을 못 자요.'],
  artCollection: ['저 그림, 볼 때마다 값이 오른대요.', '그림 앞에서 손님들이 한참 서 있어요.'],
  statue: ['동상이 너무 커서 해가 가려요.', '동상 앞에서 초상화 그려 드려요~'],
  donation: ['영주님 기부 덕에 지붕이 새로 덮였어요.'],
};

export interface NpcPlan {
  style: Style;
  role: string;
  name: string;
  line: string;
  /** 신문 인터뷰에 나온 사람 */
  interviewed?: boolean;
  staff?: [number, number];
}

export interface ScenePlan {
  npcs: NpcPlan[];
  /** 그릴 설치물 */
  props: ActionId[];
  closed: boolean;
  /** 짧은 상태 한 줄 */
  status: string;
}

function personName(rng: () => number): string {
  return rng() < 0.35 ? `${pick(SURNAMES, rng)}씨` : `${pick(SURNAMES, rng)}${pick(GIVEN, rng)}`;
}

/**
 * 누가 몇 명 있고 무슨 말을 하나 (순수 함수)
 * - 사람 수: 던전은 입장료(모험가), 주점은 흥·번영, 저택은 사치, 광장은 번영, 성당은 의심
 * - 대사: ① 최신 신문의 이 구역 인터뷰(그 사람이 직접 있음) ② 지난주 이 구역에 돈이 들어온 이유 ③ 지어 둔 시설 ④ 평소 말
 */
export function planScene(d: DistrictId, e: Estate, lastWeek: readonly ActionId[], paper: Newspaper | undefined, rng: () => number): ScenePlan {
  const props = ACTIONS.filter((a) => a.district === d && (e.uses[a.id] ?? 0) > 0 && (a.maxUses || a.upkeep || ['party', 'festival', 'banquet', 'birthdayWeek', 'duelTourney', 'donation'].includes(a.id)))
    .map((a) => a.id)
    .filter((id) => !['party', 'festival', 'banquet', 'birthdayWeek', 'duelTourney'].includes(id) || lastWeek.includes(id));
  const closed = d === 'dungeon' && !e.dungeonOpen;
  const income = e.passiveIncome().find((l) => l.district === d)?.amount ?? 0;
  const count = d === 'dungeon' ? (closed ? 1 : Math.max(3, Math.min(14, Math.round(income / 320))))
    : d === 'tavern' ? Math.min(13, 4 + e.gauges.fun * 2 + Math.round(e.prosperity / 15))
      : d === 'manor' ? Math.min(8, 3 + e.gauges.luxury)
        : d === 'square' ? Math.min(12, 4 + Math.round(e.prosperity / 10) + (lastWeek.includes('festival') ? 4 : 0))
          : Math.min(8, 2 + Math.round(e.suspicion / 15));

  const reasons = new Set<Reason>();
  const last = e.reports[e.reports.length - 1];
  for (const l of last?.lines ?? []) if (l.district === d && l.reason && l.reason !== 'butler' && l.amount > 0) reasons.add(l.reason);
  const pool: string[] = [];
  for (const r of reasons) pool.push(...(BY_REASON[r] ?? []));
  for (const id of props) pool.push(...(OBJECT_LINES[id] ?? []), ...(BY_ACTION[id] ?? []));
  if (closed) pool.push('문이 닫혀 있네… 언제 연대요?', '휴업이라니, 헛걸음했다.');
  const plain = PLAIN[d];

  const npcs: NpcPlan[] = [];
  for (const s of LAYOUT[d].staff) npcs.push({ style: s.style, role: s.role, name: personName(rng), line: pick(pool.length ? pool : plain, rng), staff: s.at });
  // 신문 인터뷰에 나온 사람 (이 구역)
  for (const r of paper?.rows ?? []) {
    if (r.district !== d) continue;
    const [role, ...rest] = r.interview.who.split(' ');
    const roleFull = ROLES[d].find((x) => r.interview.who.startsWith(x)) ?? role;
    npcs.push({ style: ROLE_STYLE[roleFull] ?? 'townsfolk', role: roleFull, name: r.interview.who.slice(roleFull.length + 1) || rest.join(' '), line: r.interview.line, interviewed: true });
  }
  while (npcs.length < count + LAYOUT[d].staff.length) {
    const role = pick(ROLES[d], rng);
    const usePool = pool.length && rng() < 0.65;
    npcs.push({ style: ROLE_STYLE[role] ?? 'townsfolk', role, name: personName(rng), line: pick(usePool ? pool : plain, rng) });
  }
  const status = d === 'dungeon' ? (closed ? '휴업 중 · 입장료 0' : `모험가 ${count}명쯤 · 입장료 +${income.toLocaleString()}/주`)
    : d === 'tavern' ? `손님 ${count}명 · 주점 세금 +${income.toLocaleString()}/주`
      : d === 'manor' ? `저택 임대료 +${income.toLocaleString()}/주`
        : d === 'square' ? `구경꾼 ${count}명` : `신자 ${count}명`;
  return { npcs, props, closed, status };
}

// ───────────────────────── 움직이는 장면 ─────────────────────────

interface Npc extends NpcPlan {
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  speed: number;
  frame: number;
  sway: number;
  palette: Palette;
  talk: number;
}

export interface Bubble {
  x: number;
  y: number;
  who: string;
  text: string;
  hot: boolean;
}

export class DistrictScene {
  readonly npcs: Npc[] = [];
  private t = 0;
  private nextTalk = 800;

  constructor(readonly id: DistrictId, readonly plan: ScenePlan, private readonly rng: () => number) {
    const L = LAYOUT[id];
    plan.npcs.forEach((p, i) => {
      const at = p.staff ?? this.randomPoint();
      const palette = paletteFor(p.style, rng);
      this.npcs.push({ ...p, x: at[0], y: at[1], tx: at[0], ty: at[1], wait: 400 + rng() * 2500, speed: p.style === 'drunk' ? 9 : 14 + rng() * 8, frame: 0, sway: rng() * 6, palette, talk: 0 });
      // 신문에 나온 사람은 처음부터 한마디
      if (p.interviewed) this.npcs[this.npcs.length - 1].talk = 4200 + i * 300;
    });
    void L;
  }

  private randomPoint(): [number, number] {
    const L = LAYOUT[this.id];
    if (this.rng() < 0.4) return pick(L.spots, this.rng);
    const r = pick(L.walk, this.rng);
    return [r[0] + this.rng() * (r[2] - r[0]), r[1] + this.rng() * (r[3] - r[1])];
  }

  update(dt: number): void {
    this.t += dt;
    for (const n of this.npcs) {
      if (n.talk > 0) n.talk -= dt;
      if (n.staff) {
        n.frame += dt;
        continue;
      }
      const dx = n.tx - n.x;
      const dy = n.ty - n.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) {
        n.wait -= dt;
        if (n.wait <= 0) {
          [n.tx, n.ty] = this.randomPoint();
          n.wait = 800 + this.rng() * 3500;
        }
        continue;
      }
      const step = Math.min(dist, (n.speed * dt) / 1000);
      n.x += (dx / dist) * step + (n.style === 'drunk' ? Math.sin(this.t / 200 + n.sway) * 0.15 : 0);
      n.y += (dy / dist) * step;
      n.frame += dt;
    }
    // 가끔 누군가 한마디 (한 번에 최대 2명)
    this.nextTalk -= dt;
    if (this.nextTalk <= 0) {
      this.nextTalk = 1800 + this.rng() * 2200;
      const talking = this.npcs.filter((n) => n.talk > 0).length;
      const idle = this.npcs.filter((n) => n.talk <= 0);
      if (talking < 2 && idle.length) pick(idle, this.rng).talk = 3800;
    }
  }

  /** 누른 사람 (원본 좌표) */
  hit(x: number, y: number): Npc | null {
    let best: Npc | null = null;
    let bd = 9;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - x, n.y - 6 - y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  bubbles(): Bubble[] {
    return this.npcs.filter((n) => n.talk > 0).map((n) => ({ x: n.x, y: n.y - 15, who: `${n.role} ${n.name}`, text: n.line, hot: !!n.interviewed }));
  }

  draw(c: CanvasRenderingContext2D, bg: HTMLImageElement): void {
    c.drawImage(bg, 0, 0);
    drawInterior(c, this.id, this.plan, this.t);
    const sorted = [...this.npcs].sort((a, b) => a.y - b.y);
    for (const n of sorted) drawPerson(c, n, this.t);
  }
}

// ───────────────────────── 사람 도트 ─────────────────────────

interface Palette {
  skin: string;
  hair: string;
  body: string;
  body2: string;
  legs: string;
  extra?: string;
}

function paletteFor(style: Style, rng: () => number): Palette {
  const skin = pick(['#e8b48a', '#d89a70', '#c08060', '#f0c8a0', '#a8704a'], rng);
  const hair = pick(['#2a1a10', '#5a3418', '#a86a30', '#d8c060', '#888088', '#1a1a1a'], rng);
  const cloth = pick(['#3b5b9a', '#7a3a3a', '#4f7a3a', '#8a6a3a', '#5a4a7a', '#3a6a6a'], rng);
  const base = { skin, hair, body: cloth, body2: shade(cloth), legs: '#3a2a20' };
  switch (style) {
    case 'adventurer': return { ...base, body: '#8a8a98', body2: '#5a5a68', extra: cloth };
    case 'veteran': return { ...base, body: '#a8a8b8', body2: '#6a6a78', extra: '#b03a2a', hair: '#888088' };
    case 'mage': return { ...base, body: '#5a3a8a', body2: '#3a2a5a', extra: '#5a3a8a' };
    case 'porter': return { ...base, body: '#8a6a3a', body2: '#5a4428', extra: '#6a4a24' };
    case 'clerk': return { ...base, body: '#3a3a4a', body2: '#22222e' };
    case 'drunk': return { ...base, extra: '#d84a3a' };
    case 'barkeep': return { ...base, body: '#e8e0d0', body2: '#b8b0a0', extra: '#6a3a20' };
    case 'bard': return { ...base, body: '#b03a6a', body2: '#7a2a4a', extra: '#d8b040' };
    case 'servant': return { ...base, body: '#1e1a26', body2: '#e8e6f0' };
    case 'chef': return { ...base, body: '#efefef', body2: '#c8c8c8', extra: '#ffffff' };
    case 'maid': return { ...base, body: '#2a2a3a', body2: '#efefef' };
    case 'merchant': return { ...base, body: '#3a7a4a', body2: '#2a5a3a', extra: '#c8a040' };
    case 'kid': return { ...base, legs: '#5a4a3a' };
    case 'nun': return { ...base, body: '#1e1e24', body2: '#efefef', hair: '#1e1e24' };
    case 'pilgrim': return { ...base, body: '#8a7a5a', body2: '#6a5a40' };
    case 'priest': return { ...base, body: '#efe8d8', body2: '#c8a040' };
    default: return base;
  }
}

function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.65).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** 7×12 작은 사람 (발밑 = n.x, n.y) */
function drawPerson(c: CanvasRenderingContext2D, n: Npc, t: number): void {
  const p = n.palette;
  const small = n.style === 'kid';
  const x0 = Math.round(n.x) - 3;
  const y0 = Math.round(n.y) - (small ? 9 : 12);
  const walking = Math.abs(n.tx - n.x) + Math.abs(n.ty - n.y) > 1 && !n.staff;
  const step = walking ? Math.floor(n.frame / 160) % 2 : 0;
  const bob = !walking && Math.floor((t + n.sway * 300) / 600) % 2 ? 1 : 0;
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(x0 + x, y0 + y + bob, w, h);
  };
  // 그림자
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.fillRect(x0, Math.round(n.y), 7, 1);
  c.fillRect(x0 + 1, Math.round(n.y) + 1, 5, 1);
  const hy = small ? 0 : 0;
  // 다리
  if (n.style !== 'priest' && n.style !== 'nun') {
    const ly = small ? 7 : 9;
    r(1, ly, 2, small ? 2 : 3 - step, p.legs);
    r(4, ly, 2, small ? 2 : 2 + step, p.legs);
  }
  // 몸
  const by = small ? 4 : 4;
  const bh = small ? 3 : n.style === 'priest' || n.style === 'nun' ? 8 : 5;
  r(1, by, 5, bh, p.body);
  r(0, by + 1, 1, 3, p.body2);
  r(6, by + 1, 1, 3, p.body2);
  if (n.style === 'barkeep' || n.style === 'maid') r(2, by + 1, 3, bh - 1, p.body2 === '#efefef' ? '#efefef' : '#e8e0d0');
  if (n.style === 'servant' || n.style === 'clerk') r(3, by, 1, 3, '#e8e6f0');
  if (n.style === 'priest') r(3, by, 1, bh, p.body2);
  if (n.style === 'adventurer' || n.style === 'veteran') {
    r(0, by, 1, 4, p.extra!); // 망토
    r(7, by - 1, 1, 6, '#c8c8d8'); // 칼
  }
  if (n.style === 'porter') r(-1, by - 1, 2, 5, p.extra!);
  if (n.style === 'bard') r(6, by + 1, 2, 3, p.extra!);
  if (n.style === 'merchant') r(1, by + bh - 1, 5, 1, p.extra!);
  // 머리
  r(1, hy, 5, 4, p.skin);
  r(1, hy, 5, 1, p.hair);
  r(1, hy, 1, 2, p.hair);
  r(5, hy, 1, 2, p.hair);
  r(2, hy + 2, 1, 1, '#1a1010');
  r(4, hy + 2, 1, 1, '#1a1010');
  if (n.style === 'drunk') r(1, hy + 3, 5, 1, p.extra!);
  // 모자류
  if (n.style === 'mage') {
    r(0, hy - 1, 7, 1, p.extra!);
    r(2, hy - 3, 3, 2, p.extra!);
    r(3, hy - 4, 1, 1, p.extra!);
  }
  if (n.style === 'veteran') r(1, hy - 1, 5, 2, '#8a8a98');
  if (n.style === 'chef') {
    r(1, hy - 3, 5, 3, '#ffffff');
    r(2, hy - 4, 3, 1, '#ffffff');
  }
  if (n.style === 'nun') {
    r(0, hy - 1, 7, 2, '#1e1e24');
    r(0, hy, 1, 5, '#1e1e24');
    r(6, hy, 1, 5, '#1e1e24');
    r(1, hy, 5, 1, '#efefef');
  }
  if (n.style === 'maid') r(1, hy - 1, 5, 1, '#efefef');
  // 신문에 나온 사람: 머리 위 작은 별
  if (n.interviewed && Math.floor(t / 400) % 2) {
    c.fillStyle = '#ffe060';
    c.fillRect(x0 + 3, y0 - 4 + bob, 1, 1);
  }
}

// ───────────────────────── 설치물 ─────────────────────────

function drawInterior(c: CanvasRenderingContext2D, d: DistrictId, plan: ScenePlan, t: number): void {
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const has = (id: ActionId) => plan.props.includes(id);
  const sparkle = (x: number, y: number) => {
    if (Math.floor(t / 300 + x) % 3 === 0) px(x, y, 1, 1, '#fff6c0');
  };
  if (d === 'dungeon') {
    if (has('fountain')) {
      const x = 84;
      const y = 150;
      px(x - 16, y - 2, 33, 12, '#3a3a44');
      px(x - 15, y - 3, 31, 12, '#8a96a8');
      px(x - 13, y - 1, 27, 8, '#3a7ac0');
      px(x - 11, y, 23, 5, '#4a8ad0');
      px(x - 2, y - 14, 5, 13, '#a8b4c4');
      px(x - 6, y - 15, 13, 3, '#a8b4c4');
      const f = Math.floor(t / 150) % 4;
      px(x, y - 20 - (f % 2), 1, 5, '#c8e8ff');
      px(x - 5 - f, y - 12 + f, 1, 2, '#c8e8ff');
      px(x + 5 + f, y - 12 + f, 1, 2, '#c8e8ff');
      px(x - 8 + f * 3, y + 2, 2, 1, '#c8e8ff');
    }
    if (has('goldChest')) {
      px(196, 70, 16, 11, '#2a1a10');
      px(197, 71, 14, 9, '#8a5a28');
      px(197, 71, 14, 3, '#b07a38');
      px(202, 74, 4, 3, '#f0c040');
      sparkle(195, 66);
      sparkle(214, 70);
      sparkle(204, 64);
    }
    if (has('warningSigns')) {
      px(116, 72, 2, 18, '#5a3a20');
      px(104, 66, 26, 12, '#e8d8b0');
      px(104, 66, 26, 1, '#5a3a20');
      px(107, 69, 20, 2, '#a02020');
      px(107, 73, 14, 1, '#a02020');
    }
    if (has('railings')) {
      px(100, 86, 100, 2, '#c8a060');
      for (let x = 100; x <= 200; x += 10) px(x, 86, 2, 7, '#a07840');
    }
    if (plan.closed) {
      for (let i = 0; i < 4; i++) px(118, 26 + i * 9, 66, 4, '#7a5a34');
      px(134, 40, 34, 12, '#e8d8b0');
      px(138, 44, 26, 2, '#a02020');
    }
  }
  if (d === 'tavern') {
    if (has('party')) {
      const cols = ['#d04040', '#e0b040', '#40a0d0', '#60b050'];
      for (let i = 0; i < 40; i++) px(10 + i * 7, 46 + Math.round(Math.sin(i / 2) * 2), 4, 4, cols[i % 4]);
    }
    if (has('duelTourney')) {
      px(150, 180, 60, 2, '#a02020');
      px(150, 230, 60, 2, '#a02020');
    }
  }
  if (d === 'manor') {
    if (has('artCollection')) {
      for (const x of [22, 72, 188]) {
        px(x, 4, 34, 1, '#ffe080');
        sparkle(x + 2, 3);
        sparkle(x + 30, 33);
      }
    }
    if (has('renovate')) {
      for (let x = 220; x <= 240; x += 10) px(x, 60, 2, 100, '#a07840');
      for (let y = 70; y <= 150; y += 20) px(218, y, 26, 2, '#a07840');
      px(226, 150, 12, 6, '#c8b090');
    }
    if (has('banquet') || has('birthdayWeek')) {
      for (let x = 34; x < 118; x += 9) {
        px(x, 124, 5, 4, ['#c84a2a', '#e8c040', '#8ac04a', '#d8a070'][(x / 9) % 4 | 0]);
        px(x + 2, 144, 4, 3, '#e8e0d0');
      }
    }
  }
  if (d === 'square') {
    if (has('statue')) {
      px(146, 100, 28, 8, '#6a6a70');
      px(150, 70, 20, 30, '#a8a8b0');
      px(152, 56, 16, 16, '#c8c8d0');
      px(144, 74, 8, 4, '#a8a8b0');
      px(168, 74, 10, 4, '#a8a8b0');
      px(176, 62, 2, 16, '#e0c050');
    }
    if (has('festival')) {
      for (let i = 0; i < 16; i++) {
        const x = 20 + i * 18;
        px(x, 64 + Math.round(Math.sin(i) * 3), 4, 5, Math.floor(t / 300 + i) % 2 ? '#ffd060' : '#ff9040');
      }
    }
  }
  if (d === 'chapel' && has('donation')) {
    sparkle(204, 250);
    sparkle(210, 248);
  }
}
