import { Estate } from '../economy/Estate';
import { ACTIONS, DISTRICTS, ECONOMY, actionById, type ActionId, type DistrictId } from '../economy/content';
import { mulberry32 } from '../economy/strategies';
import { CARD_TEXT, discover, effectsOf, hasHidden, limitsOf } from './cards';
import { dangers } from './dangers';
import { weeklyInbox } from './inbox';
import { buildNewspaper, type Newspaper } from './news';
import { incomeBreakdown, lastWeekMoney, statEffects, thisWeekMoney, upcoming, type BuildingMoney } from './money';
import { WeekPlan } from './plan';
import { drawProps } from './props';
import { DistrictScene, planScene } from './scene';
import { MEMO, TUTORIAL_INBOX, TutorialRunner, fillText, type TutorialAction } from './tutorial';

/**
 * 영지 화면 (실험판): 영지 전경 ↔ 구역 안 ↔ 장부(결재함·정산) ↔ 집사 수첩(신문·위험·조언·기록) + 튜토리얼.
 * 서류는 서명 전까지 "장부에 적어 두기"만 함 (WeekPlan) → 자유롭게 적고 뺌. 서명할 때 진짜 결재.
 */
const W = 480;
const H = 270;
const SCALE = 2;
const BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const ART_TO_DISTRICT: Record<string, DistrictId | null> = {
  manor: 'manor', tavern: 'tavern', dungeon: 'dungeon', square: 'square', chapel: 'chapel', tower: null, guild: null, market: null,
};
const DISTRICT_TO_ART: Record<DistrictId, string> = { manor: 'manor', tavern: 'tavern', dungeon: 'dungeon', square: 'square', chapel: 'chapel' };
const ART_NAMES: Record<string, string> = {
  manor: '저택', tavern: '주점', dungeon: '던전 입구', square: '광장', chapel: '성당', tower: '마탑', guild: '모험가 길드', market: '시장',
};
const DRAW_ORDER = ['chapel', 'tower', 'manor', 'tavern', 'guild', 'market', 'square', 'dungeon'];
const PATHS: [number, number][][] = [
  [[236, 266], [238, 230], [236, 196], [232, 178]],
  [[236, 214], [190, 214], [150, 214], [132, 214]],
  [[244, 210], [300, 216], [340, 218], [370, 218]],
];
const TIP_GROUPS: { title: string; icon: string; items: string[] }[] = [
  { title: '결재와 서명', icon: '✒', items: [
    '결재는 한 주에 세 건까지. 결재함 요청이든 건물 안 일이든 같은 칸을 씁니다.',
    '적어 둔 서류는 서명 전까지 다시 눌러 취소할 수 있습니다.',
    '돈은 서명할 때 나갑니다. 위쪽 금고 옆 "서명하면"이 그 결과입니다.',
  ] },
  { title: '돈과 왕실 보고', icon: '🪙', items: [
    '매주 저택·주점·던전에서 기본 수입이 들어옵니다. 장부 [금고] 탭에서 공식을 볼 수 있습니다.',
    `4·8주차 왕실 보고 때 금고가 기준을 넘으면 왕실 관심 +1. ${ECONOMY.royalAttentionLimit}이면 소환.`,
    '12주차 감찰 때 금고가 0 이하면 파산 선고 = 승리.',
  ] },
  { title: '의심과 번영', icon: '👁', items: [
    '위쪽 띠의 번영·의심을 누르면 무엇을 바꾸는지 나옵니다.',
    '번영이 높을수록 주점·던전 수입과 서류의 여파가 커집니다.',
    `의심은 매주 ${ECONOMY.suspicionDecay}씩 줄고, 같은 일을 반복할수록 더 붙습니다.`,
  ] },
  { title: '숨은 효과', icon: '❓', items: [
    '서류의 ❓는 아직 모르는 효과입니다. 겪어 보면 풀립니다.',
    '신문의 [가 보기]를 누르면 소문의 현장으로 갑니다.',
  ] },
  { title: '건물', icon: '🏠', items: [
    '광장: 연회·술 파티를 합쳐 두 번 열면 열립니다.',
    '성당: 의심이 30을 넘으면 열립니다. 기부로 의심을 씻을 수 있습니다.',
    '시장: 서류 상점 (준비 중).',
  ] },
  { title: '집사', icon: '🎩', items: [
    '집사는 도련님이 같은 서류를 다시 하면 미리 준비해 돈을 조금 되찾아 옵니다. 비서 휴가를 보내면 잊습니다. (곧 다듬을 예정)',
  ] },
];
const DISTRICT_ICON: Record<DistrictId, string> = { manor: '🏰', tavern: '🍺', dungeon: '🕳', square: '⛲', chapel: '⛪' };
const SPEAKER_NAME = { butler: '집사', inner: '(속마음)', outer: '나', system: '' } as const;
const KIND_LABEL: Record<string, string> = { 손해: '손해', 함정: '수상함', 상쇄: '수습', 세탁: '세탁', 대형: '대형', 마무리: '마무리' };

type Building = { id: string; img: HTMLImageElement; mask: Uint8ClampedArray; outline: HTMLCanvasElement; box: { x0: number; y0: number; x1: number; y1: number } };
type Line = { label: string; amount: number; reason?: string; district?: DistrictId };
type BookTab = 'news' | 'danger' | 'tips' | 'log';

export class EstateApp {
  readonly estate = new Estate();
  readonly plan = new WeekPlan(this.estate);
  readonly tut = new TutorialRunner();
  estateName = '느긋한 바람 영지';
  view: 'estate' | 'district' = 'estate';
  district: DistrictId | null = null;
  ledgerOpen = false;
  ledgerTab: 'inbox' | 'gold' = 'inbox';
  goldMode: 'now' | 'last' = 'now';
  statPop: 'pros' | 'sus' | 'royal' | null = null;
  tipOpen = 0;
  bookOpen = false;
  bookTab: BookTab = 'news';
  bookBadge = false;
  paperIndex = 0;
  busy = false;
  inbox: ActionId[] = [...TUTORIAL_INBOX];
  readonly rejected = new Set<ActionId>();
  paperOpen: { id: ActionId; from: 'inbox' | 'district' | 'ledger' } | null = null;
  confirmOpen = false;
  readonly discovered = new Set<ActionId>();
  readonly papers: Newspaper[] = [];
  readonly log: { who: string; text: string }[] = [];
  private loggedStep = -1;
  private readonly spent = new Map<number, Line[]>();
  private readonly rng = mulberry32(20261112);
  private hover: string | null = null;
  private buildings: Building[] = [];
  private bg!: HTMLImageElement;
  private readonly districtImg = new Map<DistrictId, HTMLImageElement>();
  scene: DistrictScene | null = null;
  private bubbleKey = '';
  private readonly ctx: CanvasRenderingContext2D;
  private readonly $: Record<string, HTMLElement> = {};
  private time = 0;
  private walkers = Array.from({ length: 16 }, (_, i) => ({ path: i % PATHS.length, t: (i * 0.37) % 1, speed: 0.03 + (i % 4) * 0.01, color: ['#a33a3a', '#3b5b9a', '#4f7a3a', '#c9a23a', '#6a4a8a'][i % 5] }));

  constructor(root: HTMLElement, private readonly assetBase = `${BASE}estate/`) {
    root.innerHTML = TEMPLATE;
    root.querySelectorAll<HTMLElement>('[id]').forEach((el) => (this.$[el.id] = el));
    const canvas = this.$['view'] as HTMLCanvasElement;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.$['memo-title'].textContent = MEMO.title;
    this.$['memo-body'].innerHTML = MEMO.body.split('\n\n').map((p) => `<p>${p}</p>`).join('');
    this.$['memo-goals'].innerHTML = MEMO.goals.map((g) => `<li>${g}</li>`).join('');
    this.bindEvents();
  }

  async start(): Promise<void> {
    const meta = (await (await fetch(`${this.assetBase}buildings.json`)).json()) as Record<string, Building['box']>;
    this.bg = await loadImage(`${this.assetBase}bg.png`);
    for (const id of DRAW_ORDER) {
      const img = await loadImage(`${this.assetBase}b_${id}.png`);
      this.buildings.push({ id, img, mask: alphaOf(img), outline: outlineOf(img), box: meta[id] });
    }
    for (const d of ['dungeon', 'tavern', 'manor', 'square', 'chapel'] as const) this.districtImg.set(d, await loadImage(`${this.assetBase}d_${d}.png`));
    for (const id of ['butler-face', 'book-face', 'confirm-face']) drawPortrait(this.$[id] as HTMLCanvasElement);
    this.render();
    const loop = (t: number) => {
      const dt = Math.min(50, t - this.time || 16);
      this.time = t;
      this.draw(dt);
      this.placeSpot();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ───────────────────────── 행동 (튜토리얼 문지기) ─────────────────────────

  act(action: TutorialAction, fn?: () => void): boolean {
    if (this.busy) return false;
    if (!this.tut.done && !this.tut.allows(action)) {
      this.nudge();
      return false;
    }
    fn?.();
    if (!this.tut.done) this.tut.handle(action);
    this.render();
    return true;
  }

  /** 튜토리얼 밖에서만 되는 자유 행동 */
  free(fn: () => void): void {
    if (this.busy) return;
    if (!this.tut.done) return this.nudge();
    fn();
    this.render();
  }

  private bindEvents(): void {
    const $ = this.$;
    $['dlg'].addEventListener('click', () => this.act('next'));
    $['name-ok'].addEventListener('click', () => {
      const v = ($['name-input'] as HTMLInputElement).value.trim();
      this.act('name', () => (this.estateName = v || this.estateName));
    });
    $['memo-ok'].addEventListener('click', () => this.act('memo'));
    $['dev-skip'].addEventListener('click', () => this.skipTutorial());
    // 장부: 버튼으로 열고 닫기
    $['ledger-btn'].addEventListener('click', () => {
      if (this.ledgerOpen) this.act('closeLedger', () => this.closeLedger());
      else this.act('openLedger', () => {
        this.openLedger();
        this.ledgerTab = 'inbox';
      });
    });
    $['ledger-tab-inbox'].addEventListener('click', () => this.free(() => (this.ledgerTab = 'inbox')));
    $['ledger-tab-gold'].addEventListener('click', () => this.free(() => (this.ledgerTab = 'gold')));
    $['ledger-gold'].addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const m = el.closest<HTMLElement>('[data-mode]');
      if (m) return this.free(() => (this.goldMode = m.dataset.mode as 'now' | 'last'));
      const q = el.closest<HTMLElement>('[data-goto]');
      if (q) this.free(() => this.goTo(q.dataset.goto as DistrictId));
    });
    $['ledger-sign'].addEventListener('click', () => this.trySign());
    $['ledger-inbox'].addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-paper]');
      if (!row) return;
      const id = row.dataset.paper as ActionId;
      this.act(`open:${id}`, () => (this.paperOpen = { id, from: row.dataset.from as 'inbox' | 'ledger' }));
    });
    // 서류 창
    $['paper-approve'].addEventListener('click', () => this.act('approve', () => this.writeDown()));
    $['paper-reject'].addEventListener('click', () => this.act('reject', () => this.reject()));
    $['paper-unplan'].addEventListener('click', () => this.free(() => this.unplan()));
    $['paper-close'].addEventListener('click', () => this.free(() => (this.paperOpen = null)));
    // 서명 확인
    $['confirm-yes'].addEventListener('click', () => {
      this.confirmOpen = false;
      this.act('sign', () => void this.endWeekSequence());
    });
    $['confirm-no'].addEventListener('click', () => {
      this.confirmOpen = false;
      this.render();
    });
    // 집사 수첩
    $['butler-btn'].addEventListener('click', () => {
      if (this.bookOpen) this.act('closeButler', () => (this.bookOpen = false));
      else this.act('openButler', () => this.openBook());
    });
    for (const t of ['news', 'danger', 'tips', 'log'] as const) $[`book-tab-${t}`].addEventListener('click', () => this.free(() => (this.bookTab = t)));
    $['book-body'].addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const go = el.closest<HTMLElement>('[data-goto]');
      if (go) {
        const d = go.dataset.goto as DistrictId;
        const action: TutorialAction = d === 'dungeon' ? 'enterDungeon' : d === 'tavern' ? 'enterTavern' : 'next';
        if (!this.tut.done) this.act(action, () => this.goTo(d));
        else this.free(() => this.goTo(d));
        return;
      }
      const tip = el.closest<HTMLElement>('[data-tip]');
      if (tip) return this.free(() => (this.tipOpen = Number(tip.dataset.tip)));
      const nav = el.closest<HTMLElement>('[data-issue]');
      if (nav) this.free(() => (this.paperIndex = Math.max(0, Math.min(this.papers.length - 1, this.paperIndex + Number(nav.dataset.issue)))));
    });
    // 금고 → 장부 금고 탭
    $['hud-gold'].addEventListener('click', () => this.free(() => {
      this.openLedger();
      this.ledgerTab = 'gold';
    }));
    // 수치 설명 창 (튜토리얼 중에도 볼 수 있음)
    for (const k of ['pros', 'sus', 'royal'] as const) {
      $[`stat-${k}`].addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.busy) return;
        this.statPop = this.statPop === k ? null : k;
        this.render();
      });
    }
    // 구역
    $['district-back'].addEventListener('click', () => this.act('leaveDistrict', () => this.leaveDistrict()));
    $['district-papers'].addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (b) this.free(() => (this.paperOpen = { id: b.dataset.card as ActionId, from: 'district' }));
    });
    $['pops'].addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
      if (b) this.free(() => this.goTo(b.dataset.goto as DistrictId));
    });
    $['result-again'].addEventListener('click', () => location.reload());
    // 바깥을 누르면 닫기 (서류 창 → 장부·수첩 순서)
    $['stage'].addEventListener('click', (e) => this.clickOutside(e.target as HTMLElement));
    // 화면 밖에 숨겨 둔 장부(아래로 내려간 상태)에 포커스가 가면 무대가 통째로 밀려 올라감 → 늘 0으로 고정
    $['stage'].addEventListener('scroll', () => {
      $['stage'].scrollTop = 0;
      $['stage'].scrollLeft = 0;
    });
    const canvas = $['view'] as HTMLCanvasElement;
    canvas.addEventListener('mousemove', (e) => {
      if (this.view === 'district' && this.scene) {
        const p = this.toArt(e);
        canvas.style.cursor = this.scene.hit(p.x, p.y) ? 'pointer' : 'default';
        return;
      }
      if (this.view !== 'estate' || this.anyPanel()) return;
      const p = this.toArt(e);
      this.hover = this.hitTest(p.x, p.y);
      canvas.style.cursor = this.hover ? 'pointer' : 'default';
      this.renderTooltip();
    });
    canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.renderTooltip();
    });
    canvas.addEventListener('click', (e) => {
      if (this.view === 'district' && this.scene && !this.anyPanel()) {
        const p = this.toArt(e);
        const n = this.scene.hit(p.x, p.y);
        if (n) n.talk = 4500;
        return;
      }
      if (this.view !== 'estate' || this.anyPanel()) return;
      const p = this.toArt(e);
      const id = this.hitTest(p.x, p.y);
      if (id) this.clickBuilding(id);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        $['ledger-btn'].click();
      } else if (e.code === 'Escape') {
        if (this.paperOpen) $['paper-close'].click();
        else if (this.ledgerOpen) $['ledger-btn'].click();
        else if (this.bookOpen) $['butler-btn'].click();
        else if (this.view === 'district') $['district-back'].click();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (document.activeElement === $['name-input']) return;
        e.preventDefault();
        this.act('next');
      }
    });
  }

  private anyPanel(): boolean {
    return this.ledgerOpen || this.bookOpen || !!this.paperOpen || this.confirmOpen;
  }

  private clickOutside(t: HTMLElement): void {
    if (this.statPop && !t.closest('#stat-pop')) {
      this.statPop = null;
      this.render();
    }
    if (this.pops) this.clearPops();
    if (this.busy || t.closest('.dlg, .modal, #ledger-btn, #butler-btn, #hud-gold, #stat-pop')) return;
    if (this.paperOpen) return;
    if (this.ledgerOpen && !t.closest('#ledger')) this.act('closeLedger', () => this.closeLedger());
    else if (this.bookOpen && !t.closest('#book')) this.act('closeButler', () => (this.bookOpen = false));
  }

  private openLedger(): void {
    this.ledgerOpen = true;
    this.bookOpen = false;
  }

  private closeLedger(): void {
    this.ledgerOpen = false;
    this.paperOpen = null;
  }

  private openBook(): void {
    this.bookOpen = true;
    this.bookTab = 'news';
    this.bookBadge = false;
    this.paperIndex = 0;
    this.ledgerOpen = false;
  }

  private writeDown(): void {
    if (!this.paperOpen) return;
    const id = this.paperOpen.id;
    if (this.plan.add(id) !== 'ok') return;
    this.rejected.delete(id);
    this.paperOpen = null;
  }

  private reject(): void {
    if (!this.paperOpen) return;
    this.rejected.add(this.paperOpen.id);
    this.plan.remove(this.paperOpen.id);
    this.paperOpen = null;
  }

  private unplan(): void {
    if (!this.paperOpen) return;
    this.plan.remove(this.paperOpen.id);
    this.paperOpen = null;
  }

  private trySign(): void {
    if (this.busy) return;
    if (this.tut.done && this.plan.ids.length === 0) {
      this.confirmOpen = true;
      this.$['confirm-text'].textContent = '도련님, 이번 주는 결재가 하나도 없습니다. 이대로 한 주를 마치시겠습니까?';
      this.render();
      return;
    }
    this.act('sign', () => void this.endWeekSequence());
  }

  private clickBuilding(artId: string): void {
    const d = ART_TO_DISTRICT[artId];
    if (!d || !this.estate.unlocked.has(d)) return;
    if (!this.tut.done) {
      const action: TutorialAction | null = d === 'tavern' ? 'enterTavern' : d === 'dungeon' ? 'enterDungeon' : null;
      if (action) this.act(action, () => this.enterDistrict(d));
      else this.nudge();
      return;
    }
    this.free(() => this.enterDistrict(d));
  }

  private goTo(d: DistrictId): void {
    this.closeLedger();
    this.bookOpen = false;
    this.enterDistrict(d);
  }

  enterDistrict(d: DistrictId): void {
    this.view = 'district';
    this.district = d;
    this.hover = null;
    this.clearPops();
    this.scene = new DistrictScene(d, planScene(d, this.estate, this.lastTaken, this.papers[0], this.rng), this.rng);
  }

  private leaveDistrict(): void {
    this.view = 'estate';
    this.district = null;
    this.scene = null;
    this.$['bubbles'].innerHTML = '';
    this.bubbleKey = '';
  }

  // ───────────────────────── 한 주 마치기 ─────────────────────────

  /** 서명 → 장부 덮임·영지 전경 → 밤(정산) → 건물 위 동전 → "N주차" → 집사 수첩 알림 */
  private async endWeekSequence(): Promise<void> {
    this.busy = true;
    const $ = this.$;
    this.paperOpen = null;
    this.render();
    const sig = $['sig'];
    sig.classList.remove('draw');
    void sig.getBoundingClientRect();
    sig.classList.add('draw');
    await wait(1000);
    this.ledgerOpen = false;
    this.bookOpen = false;
    this.leaveDistrict();
    this.render();
    await wait(450);
    $['night'].classList.add('on');
    await wait(700);
    const before = { gold: this.estate.gold };
    this.settleWeek();
    sig.classList.remove('draw');
    this.render();
    await wait(800);
    $['night'].classList.remove('on');
    await wait(500);
    this.showPops(before.gold);
    await wait(700);
    const banner = $['week-banner'];
    banner.textContent = this.estate.status === 'playing' ? `${this.estate.week}주차` : '감찰의 날';
    banner.className = 'week-banner in';
    show(banner, true);
    await wait(1000);
    const from = banner.getBoundingClientRect();
    const to = $['hud-week'].getBoundingClientRect();
    banner.style.transform = `translate(calc(-50% + ${to.left + to.width / 2 - (from.left + from.width / 2)}px), calc(-50% + ${to.top + to.height / 2 - (from.top + from.height / 2)}px)) scale(0.25)`;
    banner.classList.add('fly');
    await wait(650);
    show(banner, false);
    banner.style.transform = '';
    banner.className = 'week-banner';
    this.bookBadge = true;
    this.busy = false;
    this.render();
  }

  /** 정산: 계획 결재 → 경제 모델 → 신문 → 숨은 효과 발견 → 다음 주 결재함 */
  private settleWeek(): void {
    const week = this.estate.week;
    const taken = this.plan.commit();
    this.spent.set(week, taken.map((id) => {
      const a = actionById(id);
      return { label: a.name, amount: -(a.cost + (a.debt ?? 0)) };
    }));
    const report = this.estate.endWeek();
    this.papers.unshift(buildNewspaper(report, taken, this.estateName, this.rng, { deltas: this.plan.lastDeltas, scheduled: this.estate.scheduledLines }));
    this.lastTaken = taken;
    for (const id of discover(report, taken, this.discovered)) this.discovered.add(id);
    const last = this.inbox;
    this.inbox = this.estate.status === 'playing' ? weeklyInbox(this.estate, this.rng, last) : [];
    this.rejected.clear();
    this.ledgerTab = 'inbox';
  }

  private lastTaken: ActionId[] = [];

  /** 건물 위로 지난주 돈의 흐름 (들어온 돈 빨강 +, 쓴 돈 초록 −) */
  private showPops(_goldBefore: number): void {
    const r = this.estate.reports[this.estate.reports.length - 1];
    if (!r) return;
    const by = new Map<DistrictId, { plus: number; minus: number }>();
    const add = (d: DistrictId, v: number) => {
      const o = by.get(d) ?? { plus: 0, minus: 0 };
      if (v >= 0) o.plus += v;
      else o.minus += v;
      by.set(d, o);
    };
    for (const l of r.lines) if (l.district) add(l.district, l.amount);
    for (const id of this.lastTaken) add(actionById(id).district, -actionById(id).cost);
    const html: string[] = [];
    for (const [d, v] of by) {
      const b = this.buildings.find((q) => q.id === DISTRICT_TO_ART[d]);
      if (!b) continue;
      const x = ((b.box.x0 + b.box.x1) / 2) * SCALE;
      const y = b.box.y0 * SCALE + 10;
      html.push(`<button class="pop" data-goto="${d}" style="left:${x}px;top:${y}px"><small>${ART_NAMES[DISTRICT_TO_ART[d]]}</small>${v.minus ? `<span class="minus">−${Math.abs(v.minus).toLocaleString()}</span>` : ''}${v.plus ? `<span class="plus">+${v.plus.toLocaleString()}</span>` : ''}</button>`);
    }
    this.$['pops'].innerHTML = html.join('');
    window.setTimeout(() => (this.pops = true), 300);
  }

  /** 건물 위 동전: 다음에 화면을 누를 때까지 남김 (자세한 건 장부 금고 탭) */
  private pops = false;

  private clearPops(): void {
    this.pops = false;
    this.$['pops'].innerHTML = '';
  }

  private nudge(): void {
    const p = this.$['spot'];
    p.classList.remove('nudge');
    void p.offsetWidth;
    p.classList.add('nudge');
  }

  // ───────────────────────── 화면 갱신 ─────────────────────────

  render(): void {
    const $ = this.$;
    const e = this.estate;
    const step = this.busy ? null : this.tut.step;
    this.renderTop();
    show($['dev-skip'], !this.tut.done && !this.busy);
    show($['decree'], step?.show === 'decree');
    show($['memo'], step?.show === 'memo');
    if (step?.show === 'decree') $['decree-text'].textContent = step.text;
    const speaking = !!step && !step.show;
    show($['dlg'], speaking);
    if (step && speaking) {
      $['dlg'].className = `dlg ${step.speaker}${step.wait ? ' waiting' : ''}`;
      $['dlg-who'].textContent = SPEAKER_NAME[step.speaker];
      $['dlg-text'].textContent = fillText(step.text, this.estateName);
      show($['butler-face'], step.speaker === 'butler');
      show($['dlg-more'], !step.wait);
      if (this.loggedStep !== this.tut.index) {
        this.loggedStep = this.tut.index;
        this.log.push({ who: SPEAKER_NAME[step.speaker] || '·', text: fillText(step.text, this.estateName) });
      }
    }
    $['stage'].classList.toggle('ledger-open', this.ledgerOpen);
    $['stage'].classList.toggle('talking', speaking);
    this.renderLedger();
    this.renderPaper();
    show($['book'], this.bookOpen);
    $['butler-btn'].classList.toggle('alert', this.bookBadge);
    show($['butler-badge'], this.bookBadge);
    if (this.bookOpen) this.renderBook();
    show($['confirm'], this.confirmOpen);
    show($['stat-pop'], !!this.statPop);
    if (this.statPop) this.renderStatPop();
    show($['district-ui'], this.view === 'district');
    show($['district-back'], this.view === 'district');
    show($['district-title'], this.view === 'district' && !!this.scene);
    if (this.view === 'district' && this.scene) this.$['district-title'].innerHTML = `<b>${DISTRICT_ICON[this.scene.id]} ${DISTRICTS.find((x) => x.id === this.scene!.id)!.name}</b><span>${this.scene.plan.status}</span><small>영지민을 누르면 말을 걸 수 있습니다 · ★ 신문에 나온 사람</small>`;
    if (this.view === 'district') this.renderDistrict();
    const over = e.status !== 'playing' && !this.busy;
    show($['result'], over);
    if (over) this.renderResult();
    this.renderLabels();
    this.renderTooltip();
  }

  /** 위쪽 띠: 이름·주차 | 번영·의심·왕실 관심 (미리보기 겹침) | 금고·다음 보고 */
  private renderTop(): void {
    const $ = this.$;
    const e = this.estate;
    const p = this.plan.preview();
    $['hud-name'].textContent = this.estateName;
    $['hud-week'].textContent = `${Math.min(e.week, ECONOMY.weeks)}주차 / ${ECONOMY.weeks}`;
    $['hud-gold-v'].textContent = e.gold.toLocaleString();
    const planned = p.gold !== e.gold;
    $['hud-gold-plan'].textContent = planned ? `서명하면 ${p.gold.toLocaleString()}` : '';
    show($['hud-gold-plan'], planned);
    const dl = e.nextDeadline;
    $['hud-goal'].innerHTML = dl
      ? `${dl.week}주차 왕실 보고 · ${dl.cap.toLocaleString()} 이하 ${p.gold > dl.cap ? `<span class="plus">(${(p.gold - dl.cap).toLocaleString()} 초과)</span>` : '<span class="minus">(통과)</span>'}`
      : `${ECONOMY.weeks}주차 감찰 · 0 이하 ${p.gold > 0 ? `<span class="plus">(${p.gold.toLocaleString()} 남음)</span>` : '<span class="minus">(파산 준비 완료)</span>'}`;
    statBar($['stat-pros'], '🌾 번영', e.prosperity, p.prosperity, ECONOMY.prosperityLimit, 'pros');
    statBar($['stat-sus'], '👁 의심', e.suspicion, p.suspicion, ECONOMY.suspicionLimit, 'sus');
    $['stat-royal'].innerHTML = `👑 <span>${'●'.repeat(e.royalAttention)}${'○'.repeat(Math.max(0, ECONOMY.royalAttentionLimit - e.royalAttention))}</span>`;
    $['stat-royal'].title = `왕실 관심 ${e.royalAttention}/${ECONOMY.royalAttentionLimit} (다 차면 왕도로 소환)`;
    const pending = this.inbox.filter((id) => !this.plan.has(id) && !this.rejected.has(id)).length;
    $['ledger-btn-count'].textContent = pending > 0 ? String(pending) : '';
    show($['ledger-btn-count'], pending > 0);
    const high = dangers(p).filter((d) => d.level === 'high').length;
    $['book-tab-danger'].textContent = high > 0 ? `위험 알림 (${high})` : '위험 알림';
  }

  private renderLedger(): void {
    const e = this.estate;
    const $ = this.$;
    for (const t of ['inbox', 'gold'] as const) {
      $[`ledger-tab-${t}`].classList.toggle('on', this.ledgerTab === t);
      show($[`ledger-${t}`], this.ledgerTab === t);
    }
    const rows = this.inbox.map((id) => {
      const a = actionById(id);
      const st = this.plan.has(id) ? '<span class="chip ok">적음</span>' : this.rejected.has(id) ? '<span class="chip no">반려</span>' : '<span class="chip wait">대기</span>';
      return `<div class="row paper-line" data-paper="${id}" data-from="inbox" id="inbox-${id}"><span class="nm">📜 ${a.name}<small>${CARD_TEXT[id].from}</small></span><span class="minus">−${a.cost.toLocaleString()}</span>${st}</div>`;
    });
    if (rows.length === 0) rows.push('<div class="row empty">올라온 요청이 없습니다</div>');
    $['ledger-inbox-rows'].innerHTML = rows.join('');
    const own = this.plan.ids.filter((id) => !this.inbox.includes(id));
    $['ledger-own-rows'].innerHTML = own.length
      ? own.map((id) => `<div class="row paper-line" data-paper="${id}" data-from="ledger"><span class="nm">🏠 ${actionById(id).name}<small>${DISTRICTS.find((d) => d.id === actionById(id).district)!.name}</small></span><span class="minus">−${actionById(id).cost.toLocaleString()}</span><span class="chip ok">적음</span></div>`).join('')
      : '<div class="row empty">건물을 눌러 직접 일을 벌일 수 있습니다</div>';
    const used = this.plan.ids.length;
    $['ledger-slots'].innerHTML = `<span class="cap2">이번 주 결재</span>${Array.from({ length: ECONOMY.actionsPerWeek }, (_, i) => `<i class="slot ${i < used ? 'used' : ''}"></i>`).join('')}<b>${used} / ${ECONOMY.actionsPerWeek}</b>`;
    const p = this.plan.preview();
    const dl = e.nextDeadline;
    $['ledger-deadline'].innerHTML = dl
      ? `<b>${dl.week}주차 왕실 보고</b> · 금고 ${dl.cap.toLocaleString()} 이하<br>서명하면 ${p.gold.toLocaleString()} ${p.gold > dl.cap ? `<span class="plus">(${(p.gold - dl.cap).toLocaleString()} 초과)</span>` : '<span class="minus">(통과)</span>'}`
      : `<b>${ECONOMY.weeks}주차 마지막 감찰</b> · 금고 0 이하`;
    if (this.ledgerTab === 'gold') $['ledger-gold'].innerHTML = this.goldTabHtml();
  }

  /** 장부 '금고' 탭: 건물별 수지 | 기본 수입 공식 · 앞으로 들어올 돈 · 왕실 기준 그래프 */
  private goldTabHtml(): string {
    const e = this.estate;
    const p = this.plan.preview();
    const r = e.reports[e.reports.length - 1];
    const last = this.goldMode === 'last' && r;
    const book: BuildingMoney[] = last ? lastWeekMoney(r, this.lastTaken, e) : thisWeekMoney(p, this.plan.ids);
    const total = book.reduce((s, b) => s + b.net, 0);
    const maxAbs = Math.max(1, ...book.map((b) => Math.max(b.in, -b.out)));
    const kindIcon: Record<string, string> = { base: '🏛', return: '↩', butler: '🎩', card: '📜', upkeep: '🔁' };
    const buildings = book
      .map((b) => `<div class="bm">
        <div class="bm-head"><b>${b.name}</b><span class="bm-net ${b.net > 0 ? 'plus' : 'minus'}">${money(b.net)}</span><button class="mini" data-goto="${b.district}">가 보기</button></div>
        <div class="dual"><i class="out" style="width:${(-b.out / maxAbs) * 50}%"></i><i class="mid"></i><i class="in" style="width:${(b.in / maxAbs) * 50}%"></i></div>
        ${b.lines.map((l) => `<div class="bm-line"><i>${kindIcon[l.kind]}</i><span>${l.label}</span><b class="${l.amount > 0 ? 'plus' : 'minus'}">${money(l.amount)}</b></div>`).join('')}
      </div>`)
      .join('');
    const inc = incomeBreakdown(p)
      .map((l) => `<div class="inc"><div class="inc-top"><span>${l.label}</span><b class="plus">+${l.amount.toLocaleString()}</b></div><div class="chips"><span class="chip-f">기본 ${l.base.toLocaleString()}</span>${l.note ? `<span class="chip-f off">${l.note}</span>` : l.factors.map((f) => `<span class="chip-f ${f.mul > 1.001 ? 'up' : f.mul < 0.999 ? 'down' : ''}">× ${f.mul.toFixed(2)} <small>${f.label}</small></span>`).join('')}</div></div>`)
      .join('');
    const up = upcoming(p).slice(0, 5);
    const upHtml = up.length
      ? up.map((w) => `<div class="up"><b>${w.week === p.week ? '이번 주말' : `${w.week}주차`}</b><span>${w.items.map((i) => i.label.replace('의 여파', '')).join(', ')}</span><b class="plus">+${w.total.toLocaleString()}</b></div>`).join('')
      : '<p class="empty">예약된 돈이 없습니다</p>';
    return `<div class="gold-grid">
      <div class="page left">
        <div class="cap">건물별 수지 <span class="seg"><button data-mode="now" class="${this.goldMode === 'now' ? 'on' : ''}">이번 주 (서명하면)</button><button data-mode="last" class="${this.goldMode === 'last' ? 'on' : ''}" ${r ? '' : 'disabled'}>지난주 결과</button></span></div>
        <div class="legend"><span class="minus">■ 나간 돈 (좋음)</span><span class="plus">■ 들어온 돈 (나쁨)</span></div>
        ${buildings || '<p class="empty">아직 없음</p>'}
        <div class="bm-total">${last ? `${r.week}주차 금고 변화` : '서명하면 금고 변화'} <b class="${total > 0 ? 'plus' : 'minus'}">${money(total)}</b></div>
      </div>
      <div class="page right">
        <div class="cap small">매주 기본 수입 <small>(무엇이 이 돈을 바꾸나)</small></div>
        ${inc}
        <div class="cap small">앞으로 들어올 돈 <small>(지난 결재의 여파)</small></div>
        ${upHtml}
        <div class="cap small">금고 vs 왕실 기준</div>
        ${this.graphSvg()}
      </div>
    </div>`;
  }

  /** 서류(카드) 상세 — 어디서 열든 같은 틀 */
  private renderPaper(): void {
    const $ = this.$;
    const o = this.paperOpen;
    show($['paper'], !!o);
    if (!o) return;
    const id = o.id;
    const a = actionById(id);
    const t = CARD_TEXT[id];
    const planned = this.plan.has(id);
    const st = planned ? 'ok' : this.plan.check(id);
    const p = this.plan.preview();
    const dName = DISTRICTS.find((d) => d.id === a.district)!.name;
    $['paper-kind'].textContent = KIND_LABEL[a.kind] ?? a.kind;
    $['paper-kind'].className = `kind k-${a.kind}`;
    $['paper-from'].textContent = `${DISTRICT_ICON[a.district]} ${dName}`;
    $['paper-name'].textContent = a.name;
    $['paper-cost'].innerHTML = `<small>비용</small> ${a.cost ? a.cost.toLocaleString() : a.debt ? `빚 ${a.debt.toLocaleString()}` : '무료'}`;
    const eff = effectsOf(a, planned ? a.suspicion : p.suspicionDelta(id));
    $['paper-effects'].innerHTML = eff
      .map((f) => `<div class="eff ${f.tone}"><i>${f.icon}</i><span>${f.label}</span><b>${f.value}</b><em>${f.tone === 'good' ? '▼ 좋음' : f.tone === 'bad' ? '▲ 나쁨' : '·'}</em></div>`)
      .join('');
    const hidden = hasHidden(id);
    const known = this.discovered.has(id);
    $['paper-hidden'].className = `sec hidden-row ${!hidden ? 'none' : known ? 'known' : ''}`;
    $['paper-hidden'].innerHTML = !hidden ? '<b>숨은 효과</b> 없음' : known ? `<b>✔ 알게 된 숨은 효과</b><span>${t.hidden}</span>` : '<b>❓ 숨은 효과</b><span>아직 아무도 모른다. 겪어 보면 풀린다.</span>';
    const lim = limitsOf(a);
    $['paper-limits'].innerHTML = `<b>조건 · 제한</b><span>${lim.length ? lim.join(' · ') : '없음'}</span>`;
    $['paper-request'].innerHTML = `<i>💬</i><b>${t.from}</b><span>“${t.request}”</span>`;
    $['paper-butler'].innerHTML = `<i>🎩</i><b>집사</b><span>“${t.butler}”</span>`;
    const why = st === 'ok' ? '' : st === 'limit' ? '이번 주 결재 칸을 다 썼습니다' : st === 'noGold' ? '금고가 모자랍니다' : st === 'condition' ? '조건이 맞지 않습니다' : st === 'usedUp' ? '더는 할 수 없습니다' : st === 'already' ? '이미 적어 두었습니다' : st === 'locked' ? '아직 열리지 않은 구역입니다' : '';
    $['paper-why'].textContent = why;
    show($['paper-approve'], !planned);
    ($['paper-approve'] as HTMLButtonElement).disabled = st !== 'ok';
    show($['paper-unplan'], planned);
    show($['paper-reject'], o.from === 'inbox' && !planned && !this.rejected.has(id));
    $['paper-reject'].classList.toggle('locked', !this.tut.done);
    $['paper-close'].classList.toggle('locked', !this.tut.done);
  }

  private renderStatPop(): void {
    const k = this.statPop!;
    const info = statEffects(this.plan.preview())[k];
    const el = this.$['stat-pop'];
    el.innerHTML = `<b>${info.title}</b>${info.lines.map((l) => `<p>${l}</p>`).join('')}`;
    const src = this.$[`stat-${k}`].getBoundingClientRect();
    const stage = this.$['stage'].getBoundingClientRect();
    el.style.left = `${Math.min(stage.width - 330, Math.max(8, src.left - stage.left - 40))}px`;
  }

  private renderBook(): void {
    const $ = this.$;
    for (const t of ['news', 'danger', 'tips', 'log'] as const) $[`book-tab-${t}`].classList.toggle('on', this.bookTab === t);
    $['book'].classList.toggle('news-mode', this.bookTab === 'news');
    let html = '';
    if (this.bookTab === 'news') {
      const n = this.papers[this.paperIndex];
      $['book-say'].textContent = n ? (this.paperIndex === 0 ? '도련님, 이번 주 소식입니다!' : '지난 호입니다.') : '아직 첫 신문이 나오지 않았습니다.';
      html = n ? this.newspaperHtml(n) : '<div class="paper-sheet"><p class="empty">첫 주를 마치시면 신문이 나옵니다.</p></div>';
    } else if (this.bookTab === 'danger') {
      const list = dangers(this.plan.preview());
      html = `<div class="list">${list.length ? list.map((d) => `<p class="dg ${d.level}"><i>${d.level === 'high' ? '⚠' : d.level === 'warn' ? '!' : 'i'}</i>${d.text}</p>`).join('') : '<p class="empty">지금은 걱정할 일이 없습니다.</p>'}<p class="note">장부에 적어 둔 서류까지 반영한 예상입니다.</p></div>`;
    } else if (this.bookTab === 'tips') {
      html = `<div class="tips"><div class="tip-cats">${TIP_GROUPS.map((g, i) => `<button data-tip="${i}" class="${this.tipOpen === i ? 'on' : ''}"><i>${g.icon}</i>${g.title}</button>`).join('')}</div><div class="tip-body"><div class="cap">${TIP_GROUPS[this.tipOpen].icon} ${TIP_GROUPS[this.tipOpen].title}</div>${TIP_GROUPS[this.tipOpen].items.map((x) => `<p>${x}</p>`).join('')}</div></div>`;
    } else {
      html = `<div class="list log">${this.log.map((l) => `<p><b>${l.who}</b>${l.text}</p>`).join('')}</div>`;
    }
    $['book-body'].innerHTML = html;
    if (this.bookTab === 'log') $['book-body'].scrollTop = 1e6;
  }

  /** 영지 신문: 맨 위 요약 → 서류마다 판정 카드 → 영지 소식 */
  private newspaperHtml(n: Newspaper): string {
    const e = this.estate;
    const good = n.net <= 0;
    const dl = e.nextDeadline;
    const gap = dl ? e.gold - dl.cap : e.gold;
    const summary = `<div class="summary ${good ? 'good' : 'bad'}">
      <div class="sum-big">${good ? '✔' : '✘'} 지난주 금고 <b>${money(n.net)}</b></div>
      <div class="sum-sub">${good ? '돈이 줄었다 — 원하는 방향' : '돈이 늘었다 — 반대 방향'} · 기본 수입 +${n.baseIncome.toLocaleString()} 포함</div>
      <div class="sum-sub">${dl ? `${dl.week}주차 왕실 보고까지 ${gap > 0 ? `<b class="plus">${gap.toLocaleString()} 더 줄여야 함</b>` : '<b class="minus">기준 아래 (안전)</b>'}` : `감찰까지 금고 ${gap > 0 ? `<b class="plus">${gap.toLocaleString()} 남음</b>` : '<b class="minus">0 이하</b>'}`}</div>
    </div>`;
    const maxAbs = Math.max(1, ...n.rows.map((r) => Math.max(r.spent, r.earned)));
    const rows = n.rows
      .map((r) => {
        const total = r.net + r.later;
        const ok = total <= 0;
        const verdict = r.later > 0
          ? `${ok ? '✔ 결국 돈이 빠짐' : '✘ 결국 돈이 벌림'} <b>${money(total)}</b><small>앞으로 들어올 돈 포함</small>`
          : `${ok ? '✔ 돈이 빠졌다' : '✘ 돈이 벌렸다'} <b>${money(r.net)}</b>`;
        const chips = [
          r.suspicion ? `<span class="sc bad">👁 의심 ${r.suspicion > 0 ? '+' : ''}${r.suspicion} ${r.suspicion > 0 ? '▲' : '▼'}</span>` : '',
          r.prosperity ? `<span class="sc ${r.prosperity > 0 ? 'bad' : 'good'}">🌾 번영 ${r.prosperity > 0 ? '+' : ''}${r.prosperity} ${r.prosperity > 0 ? '▲' : '▼'}</span>` : '',
          r.later > 0 ? `<span class="sc bad">↩ 앞으로 ${r.laterWeeks}주 더 +${r.later.toLocaleString()}</span>` : '',
        ].join('');
        return `<div class="news-card ${ok ? 'good' : 'bad'}" id="news-row-${r.action}">
          <div class="nc-top"><b class="nc-name">📜 ${r.name}${r.spent ? '' : ' <small>(예전 결재)</small>'}</b><span class="nc-verdict">${verdict}</span></div>
          <div class="dual"><i class="out" style="width:${(r.spent / maxAbs) * 50}%"></i><i class="mid"></i><i class="in" style="width:${(r.earned / maxAbs) * 50}%"></i></div>
          <div class="nc-nums"><span>쓴 돈 <b class="minus">${r.spent.toLocaleString()}</b></span><span>지난주 번 돈 <b class="plus">${r.earned.toLocaleString()}</b></span>${chips}</div>
          <div class="nr-voice"><span class="who">${r.interview.who}</span>“${r.interview.line}”<button class="goto" id="news-goto-${r.action}" data-goto="${r.district}">가 보기 →</button></div>
        </div>`;
      })
      .join('');
    const nav = this.papers.length > 1 ? `<span class="issue-nav"><button data-issue="1" ${this.paperIndex >= this.papers.length - 1 ? 'disabled' : ''}>◀ 지난 호</button><button data-issue="-1" ${this.paperIndex === 0 ? 'disabled' : ''}>다음 호 ▶</button></span>` : '';
    return `<div class="paper-sheet" id="news-paper">
      <div class="masthead"><span>${this.estateName} 주보</span><small>${n.week}주차 소식</small>${nav}</div>
      <h2 class="headline">${n.headline}</h2>
      ${this.paperIndex === 0 ? summary : ''}
      ${rows || '<p class="empty">지난주에는 아무 결재도 없었다.</p>'}
      ${n.notes.length ? `<div class="news-foot">${n.notes.map((x) => `<span>📯 ${x}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  /** 금고 vs 왕실 기준 (가로 1~12주) */
  private graphSvg(): string {
    const e = this.estate;
    const pts = [ECONOMY.startGold, ...e.reports.map((r) => r.goldAfter)];
    const max = Math.max(ECONOMY.startGold * 1.3, ...pts) * 1.05;
    const W0 = 30, W1 = 300, H0 = 10, H1 = 120;
    const x = (w: number) => W0 + (w / ECONOMY.weeks) * (W1 - W0);
    const y = (g: number) => H1 - (Math.max(0, Math.min(max, g)) / max) * (H1 - H0);
    // 왕실 기준 계단: 1~4주 8000, 5~8주 4500, 9~12주 0
    let prev = 0;
    let stepPath = '';
    let danger = '';
    for (const d of [...ECONOMY.deadlines, { week: ECONOMY.weeks, cap: 0 }]) {
      stepPath += `M${x(prev)},${y(d.cap)} L${x(d.week)},${y(d.cap)} `;
      danger += `<rect x="${x(prev)}" y="${H0}" width="${x(d.week) - x(prev)}" height="${y(d.cap) - H0}" class="zone"/>`;
      prev = d.week;
    }
    const line = pts.map((g, i) => `${x(i)},${y(g)}`).join(' ');
    const ticks = [0, 4, 8, 12].map((w) => `<text x="${x(w)}" y="${H1 + 11}" text-anchor="middle">${w}주</text>`).join('');
    const yt = [0, Math.round(max / 2 / 1000) * 1000].map((g) => `<text x="${W0 - 3}" y="${y(g) + 3}" text-anchor="end">${g / 1000}천</text>`).join('');
    return `<svg class="gold-svg" viewBox="0 0 310 135">${danger}<path d="${stepPath}" class="cap"/><line x1="${W0}" x2="${W1}" y1="${H1}" y2="${H1}" class="axis"/>${ticks}${yt}
      <polyline points="${line}"/>${pts.map((g, i) => `<circle cx="${x(i)}" cy="${y(g)}" r="2.5"/>`).join('')}
      <line x1="${x(e.week - 1)}" x2="${x(e.week - 1)}" y1="${H0}" y2="${H1}" class="now"/></svg>
      <div class="legend"><span class="gl">━ 내 금고</span><span class="gc">┅ 왕실 기준</span><span class="gz">■ 기준 위 = 왕실이 주목</span><span>│ 지금</span></div>`;
  }

  private renderDistrict(): void {
    const d = this.district!;
    this.$['district-name'].textContent = DISTRICTS.find((x) => x.id === d)!.name;
    this.$['district-papers'].innerHTML = ACTIONS.filter((a) => a.district === d)
      .map((a) => {
        const planned = this.plan.has(a.id);
        const st = planned ? 'ok' : this.plan.check(a.id);
        const tag = planned ? '<span class="chip ok">적음</span>' : st === 'ok' ? '' : `<span class="chip off">${st === 'condition' ? '조건 미달' : st === 'usedUp' ? '끝' : st === 'noGold' ? '돈 부족' : st === 'limit' ? '칸 없음' : ''}</span>`;
        const q = hasHidden(a.id) && !this.discovered.has(a.id) ? '<span class="qmark">❓</span>' : '';
        return `<button class="card-row ${st === 'ok' || planned ? '' : 'dim'}" data-card="${a.id}"><span class="cr-name">${a.name}${q}</span><span class="cr-cost">${a.cost ? `−${a.cost.toLocaleString()}` : a.debt ? `빚 ${a.debt.toLocaleString()}` : '무료'}</span>${tag}</button>`;
      })
      .join('');
  }

  private renderResult(): void {
    const s = this.estate.status;
    const t: Record<string, [string, string]> = {
      bankrupt: ['파산 선고!', '감찰관이 텅 빈 금고를 보고 한숨을 쉬었다. 아무도 나를 왕도로 부르지 않는다. 낮잠의 승리다.'],
      caught: ['태만죄', '감찰관이 모든 걸 눈치챘다. 영주 자리에서 쫓겨나 왕도에서 반성문을 쓰게 되었다.'],
      summoned: ['왕실 소환', '영지가 너무 잘나간다는 소문이 왕도까지 퍼졌다. 내일부터 새벽 조회다.'],
      timeUp: ['성실한 영주', `12주가 지났지만 금고에 ${this.estate.gold.toLocaleString()}이 남았다. 감찰관은 크게 만족했다. 나는 크게 불만이다.`],
    };
    const [title, body] = t[s] ?? ['', ''];
    this.$['result-title'].textContent = title;
    this.$['result-body'].textContent = body;
    this.$['result'].className = s === 'bankrupt' ? 'modal win' : 'modal lose';
  }

  private placeSpot(): void {
    const spot = this.$['spot'];
    const step = this.busy ? null : this.tut.step;
    if (!step?.target) return show(spot, false);
    const stage = this.$['stage'].getBoundingClientRect();
    let r: { x: number; y: number; w: number; h: number };
    if (step.target.startsWith('b-')) {
      const b = this.buildings.find((q) => q.id === step.target!.slice(2));
      if (!b || this.view !== 'estate' || this.anyPanel()) return show(spot, false);
      r = { x: b.box.x0 * SCALE, y: b.box.y0 * SCALE, w: (b.box.x1 - b.box.x0) * SCALE, h: (b.box.y1 - b.box.y0) * SCALE };
    } else {
      const el = document.getElementById(step.target);
      if (!el || el.offsetParent === null) return show(spot, false);
      const q = el.getBoundingClientRect();
      r = { x: q.left - stage.left, y: q.top - stage.top, w: q.width, h: q.height };
    }
    const pad = 4;
    spot.style.left = `${r.x - pad}px`;
    spot.style.top = `${r.y - pad}px`;
    spot.style.width = `${r.w + pad * 2}px`;
    spot.style.height = `${r.h + pad * 2}px`;
    spot.classList.toggle('act', !!step.wait);
    show(spot, true);
  }

  private renderTooltip(): void {
    const tip = this.$['tooltip'];
    if (!this.hover || this.view !== 'estate' || this.anyPanel()) return show(tip, false);
    const b = this.buildings.find((q) => q.id === this.hover);
    if (!b) return show(tip, false);
    const d = ART_TO_DISTRICT[b.id];
    const open = d ? this.estate.unlocked.has(d) : false;
    const cond = d ? DISTRICTS.find((x) => x.id === d)!.unlockText : b.id === 'market' ? '서류 상점 (준비 중)' : '본편에서 열림';
    tip.innerHTML = open ? `<b>${ART_NAMES[b.id]}</b>` : `<b>${ART_NAMES[b.id]}</b> 🔒 <small>${cond ?? ''}</small>`;
    tip.style.left = `${((b.box.x0 + b.box.x1) / 2) * SCALE}px`;
    tip.style.top = `${b.box.y0 * SCALE - 30}px`;
    show(tip, true);
  }

  private renderLabels(): void {
    const box = this.$['labels'];
    if (this.view !== 'estate' || !this.buildings.length) return void (box.innerHTML = '');
    box.innerHTML = this.buildings
      .map((b) => {
        const d = ART_TO_DISTRICT[b.id];
        const open = d ? this.estate.unlocked.has(d) : false;
        return `<span class="lbl ${open ? '' : 'off'}" style="left:${((b.box.x0 + b.box.x1) / 2) * SCALE}px;top:${(b.box.y1 + 1) * SCALE}px">${ART_NAMES[b.id]}</span>`;
      })
      .join('');
  }

  // ───────────────────────── 그리기 ─────────────────────────

  private draw(dt: number): void {
    this.ctx.clearRect(0, 0, W, H);
    if (this.view === 'estate') this.drawEstate(dt);
    else this.drawDistrict(dt);
  }

  private drawEstate(dt: number): void {
    const c = this.ctx;
    c.drawImage(this.bg, 0, 0);
    for (const b of this.buildings) {
      const d = ART_TO_DISTRICT[b.id];
      const open = d ? this.estate.unlocked.has(d) : false;
      if (this.hover === b.id && open) c.drawImage(b.outline, 0, 0);
      c.filter = open ? 'none' : 'grayscale(0.85) brightness(0.5)';
      c.drawImage(b.img, 0, 0);
      c.filter = 'none';
    }
    drawProps(c, this.estate, this.lastTaken, this.time);
    // 번영할수록 길에 사람이 많아짐 (영지민 수는 B단계)
    const n = Math.min(this.walkers.length, 5 + Math.round(this.estate.prosperity / 6));
    for (const w of this.walkers.slice(0, n)) {
      w.t = (w.t + (w.speed * dt) / 1000) % 1;
      const p = along(PATHS[w.path], w.t);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      c.fillStyle = w.color;
      c.fillRect(x, y - 5, 3, 4);
      c.fillStyle = '#e0a682';
      c.fillRect(x + 1, y - 7, 1, 2);
      c.fillStyle = '#1a1218';
      c.fillRect(x, y - 1, 1, 1);
      c.fillRect(x + 2, y - 1, 1, 1);
    }
  }

  /** 구역 안: 배경 + 설치물 + 돌아다니는 영지민 + 말풍선 */
  protected drawDistrict(dt: number): void {
    const sc = this.scene;
    if (!sc) return;
    sc.update(dt);
    sc.draw(this.ctx, this.districtImg.get(sc.id)!);
    const bs = sc.bubbles();
    const key = bs.map((b) => b.who + b.text).join('|');
    const box = this.$['bubbles'];
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      box.innerHTML = bs.map((b) => `<div class="bub ${b.hot ? 'hot' : ''}"><b>${b.who}</b>${b.text}</div>`).join('');
    }
    const els = box.children;
    bs.forEach((b, i) => {
      const el = els[i] as HTMLElement | undefined;
      if (el) el.style.transform = `translate(${Math.round(b.x * SCALE)}px, ${Math.round(b.y * SCALE)}px) translate(-50%, -100%)`;
    });
  }

  private toArt(e: MouseEvent): { x: number; y: number } {
    const r = (this.$['view'] as HTMLCanvasElement).getBoundingClientRect();
    return { x: Math.floor(((e.clientX - r.left) / r.width) * W), y: Math.floor(((e.clientY - r.top) / r.height) * H) };
  }

  hitTest(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      if (this.buildings[i].mask[(y * W + x) * 4 + 3] > 0) return this.buildings[i].id;
    }
    return null;
  }

  /** 개발용: 튜토리얼을 끝낸 상태로 (2주차, 분수대 결재 후 던전 확인까지) */
  skipTutorial(): void {
    if (this.busy || this.tut.done) return;
    const name = (this.$['name-input'] as HTMLInputElement).value.trim();
    if (name) this.estateName = name;
    this.ledgerOpen = false;
    this.bookOpen = false;
    this.paperOpen = null;
    this.plan.ids = [];
    for (const id of TUTORIAL_INBOX) this.plan.add(id);
    this.settleWeek();
    this.tut.skip();
    this.log.push({ who: '·', text: '(튜토리얼을 건너뛰었습니다)' });
    this.enterDistrict('dungeon');
    this.render();
  }
}

// ───────────────────────── 도우미 ─────────────────────────

/** +1,234 / −1,234 */
function money(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString()}`;
}

function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 위쪽 띠의 작은 막대: 지금 값 + 계획대로면 바뀔 값(빗금) */
function statBar(el: HTMLElement, label: string, now: number, next: number, max: number, cls: string): void {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const lo = Math.min(now, next);
  const diff = Math.abs(next - now);
  el.innerHTML = `<span class="sl">${label}</span><i class="bar"><i class="fill ${cls}" style="width:${pct(lo)}%"></i>${diff ? `<i class="ghost ${next > now ? 'up' : 'down'}" style="left:${pct(lo)}%;width:${pct(diff)}%"></i>` : ''}</i><b>${Math.round(now)}${diff ? `<span class="${next > now ? 'plus' : 'minus'}">→${Math.round(next)}</span>` : ''}</b>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function alphaOf(img: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, W, H).data;
}

function outlineOf(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) x.drawImage(img, dx, dy);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#f0d060';
  x.fillRect(0, 0, W, H);
  return c;
}

function along(path: [number, number][], t: number): { x: number; y: number } {
  const u = t < 0.5 ? t * 2 : 2 - t * 2;
  const seg = Math.min(path.length - 2, Math.floor(u * (path.length - 1)));
  const k = u * (path.length - 1) - seg;
  const [a, b] = [path[seg], path[seg + 1]];
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
}

function drawPortrait(c: HTMLCanvasElement): void {
  const rows = [
    '....hhhhhh....', '...hhhhhhhh...', '..hhhhhhhhhh..', '..hssssssssh..', '..ssskssskss..', '..ssssssssss..', '..sssssmssss..', '...ssmmmmss...',
    '....ssssss....', '..bbbbwwbbbb..', '.bbbbbwwbbbbb.', '.bbbbbwkbbbbb.', '.bbbbbwwbbbbb.', '.bbbbbwkbbbbb.',
  ];
  const pal: Record<string, string> = { h: '#c8c8d0', s: '#e0a682', k: '#2a1a12', m: '#a8a8b0', b: '#1e1a26', w: '#e8e6f0' };
  c.width = 14;
  c.height = 14;
  const x = c.getContext('2d')!;
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.') return;
    x.fillStyle = pal[ch];
    x.fillRect(i, j, 1, 1);
  }));
}

const TEMPLATE = `
<div id="stage" class="stage">
  <canvas id="view"></canvas>
  <div id="labels"></div>
  <div id="pops"></div>
  <div id="bubbles" class="bubbles"></div>
  <div id="district-title" class="district-title" hidden></div>
  <div id="tooltip" class="tooltip" hidden></div>

  <div id="topbar" class="topbar">
    <div class="tb-left"><b id="hud-name"></b><span id="hud-week"></span></div>
    <div class="tb-mid"><div id="stat-pros" class="stat-mini"></div><div id="stat-sus" class="stat-mini"></div><div id="stat-royal" class="stat-royal"></div></div>
    <div id="hud-gold" class="tb-right" title="눌러서 금고 흐름 보기"><div class="g1">🪙 <b id="hud-gold-v"></b><span id="hud-gold-plan" class="gplan"></span></div><div id="hud-goal" class="goal"></div></div>
  </div>
  <div id="stat-pop" class="stat-pop" hidden></div>
  <button id="dev-skip" class="dev">DEV · 튜토리얼 건너뛰기</button>

  <button id="butler-btn" class="butler-btn"><span class="bb-icon">🎩</span><span>집사 수첩</span><i id="butler-badge" class="badge" hidden>!</i></button>
  <button id="ledger-btn" class="ledger-btn"><span class="bb-icon">📖</span><span>장부</span><i id="ledger-btn-count" class="count" hidden></i></button>
  <button id="district-back" class="district-back" hidden>⌂ 영지로</button>

  <div id="district-ui" class="district-ui" hidden>
    <div class="district-head"><b id="district-name"></b><small>서류를 누르면 자세히</small></div>
    <div id="district-papers" class="district-papers"></div>
  </div>

  <div id="ledger" class="ledger scroll">
    <div class="tabs">
      <button id="ledger-tab-inbox" class="tab">결재함</button>
      <button id="ledger-tab-gold" class="tab">금고 · 건물별 수지</button>
      <span class="tab-soon">영지 개발 · 서류 도감 (준비 중)</span>
    </div>
    <div id="ledger-inbox" class="sheet two">
      <div class="page left">
        <div class="cap">올라온 결재 요청</div>
        <div id="ledger-inbox-rows"></div>
        <div class="cap small">건물에서 적은 일</div>
        <div id="ledger-own-rows"></div>
      </div>
      <div class="page right">
        <div id="ledger-slots" class="slots"></div>
        <div id="ledger-deadline" class="deadline"></div>
        <button id="ledger-sign" class="sign">✒ 서명하고 한 주 마치기</button>
        <div class="sig-line"><small>영주 서명</small><svg id="sig" class="sig" viewBox="0 0 220 70"><path d="M8 52 C 30 10, 40 10, 44 40 S 60 64, 74 30 S 96 8, 100 40 C 104 60, 120 58, 130 34 C 138 18, 150 22, 148 44 C 146 60, 168 56, 184 30 L 212 26" /></svg></div>
      </div>
    </div>
    <div id="ledger-gold" class="sheet"></div>
  </div>

  <div id="book" class="book scroll" hidden>
    <div class="tabs">
      <button id="book-tab-news" class="tab">영지 신문</button>
      <button id="book-tab-danger" class="tab">위험 알림</button>
      <button id="book-tab-tips" class="tab">집사의 조언</button>
      <button id="book-tab-log" class="tab">대화 기록</button>
    </div>
    <div class="book-main">
      <div class="crier"><canvas id="book-face"></canvas><p id="book-say"></p></div>
      <div id="book-body" class="book-body"></div>
    </div>
  </div>

  <div id="paper" class="modal card scroll" hidden>
    <div class="card-head"><span id="paper-from" class="from"></span><span id="paper-kind" class="kind"></span></div>
    <div class="card-title"><h3 id="paper-name"></h3><span id="paper-cost" class="cost"></span></div>
    <div class="card-body">
      <div class="sec"><div class="sec-cap">확실한 효과</div><div id="paper-effects" class="effects"></div></div>
      <div class="right"><div class="sec-cap">숨은 효과 · 조건</div><div id="paper-hidden" class="sec hidden-row"></div><div id="paper-limits" class="sec limits"></div></div>
    </div>
    <div class="voices"><p id="paper-request"></p><p id="paper-butler"></p></div>
    <p id="paper-why" class="why"></p>
    <div class="btns">
      <button id="paper-approve" class="primary">장부에 적기</button>
      <button id="paper-unplan" class="warn">적은 것 취소하기</button>
      <button id="paper-reject">반려</button>
      <button id="paper-close">닫기</button>
    </div>
  </div>

  <div id="confirm" class="modal confirm" hidden>
    <canvas id="confirm-face"></canvas>
    <p id="confirm-text"></p>
    <div class="btns"><button id="confirm-no" class="primary">돌아가기</button><button id="confirm-yes">그래도 마친다</button></div>
  </div>

  <div id="night" class="night"><span>· · · 한 주가 지나간다 · · ·</span></div>
  <div id="week-banner" class="week-banner" hidden></div>
  <div id="spot" class="spot" hidden></div>

  <div id="dlg" class="dlg" hidden>
    <canvas id="butler-face" class="face"></canvas>
    <div class="body"><div id="dlg-who" class="who"></div><div id="dlg-text"></div></div>
    <span id="dlg-more" class="more">▼</span>
  </div>

  <div id="decree" class="modal decree" hidden>
    <div class="seal">왕의 칙서</div>
    <p id="decree-text"></p>
    <label>영지 이름 <input id="name-input" maxlength="12" placeholder="느긋한 바람 영지" /></label>
    <button id="name-ok" class="primary">영지에 도착하기</button>
  </div>
  <div id="memo" class="modal memo" hidden>
    <div id="memo-title" class="cap"></div>
    <div id="memo-body" class="memo-body"></div>
    <div class="goal-box"><div class="cap small">목표</div><ul id="memo-goals"></ul></div>
    <button id="memo-ok" class="primary">좋아, 시작하지</button>
  </div>
  <div id="result" class="modal" hidden>
    <div id="result-title" class="cap"></div>
    <p id="result-body"></p>
    <button id="result-again" class="primary">처음부터</button>
  </div>
</div>`;
