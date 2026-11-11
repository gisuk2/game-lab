import { Estate, type WeekReport } from '../economy/Estate';
import { ACTIONS, DISTRICTS, ECONOMY, actionById, type ActionId, type DistrictId, type Reason } from '../economy/content';
import { mulberry32 } from '../economy/strategies';
import { weeklyInbox } from './inbox';
import { MEMO, TUTORIAL_INBOX, TutorialRunner, fillText, type TutorialAction } from './tutorial';

/**
 * 영지 화면 (실험판): 영지 전경 ↔ 구역 안 ↔ 장부(결재함·정산·현황) ↔ 집사 수첩 + 튜토리얼.
 * 그림: public/estate/* (tools/art/estate_art.py로 만든 임시 그림, 원본 480×270 → 2배)
 */
const W = 480;
const H = 270;
const SCALE = 2;
const BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

const ART_TO_DISTRICT: Record<string, DistrictId | null> = {
  manor: 'manor', tavern: 'tavern', dungeon: 'dungeon', square: 'square', chapel: 'chapel', tower: null, guild: null, market: null,
};
const ART_NAMES: Record<string, string> = {
  manor: '저택', tavern: '주점', dungeon: '던전 입구', square: '광장', chapel: '성당', tower: '마탑', guild: '모험가 길드', market: '시장',
};
const DRAW_ORDER = ['chapel', 'tower', 'manor', 'tavern', 'guild', 'market', 'square', 'dungeon'];
const PATHS: [number, number][][] = [
  [[236, 266], [238, 230], [236, 196], [232, 178]],
  [[236, 214], [190, 214], [150, 214], [132, 214]],
  [[244, 210], [300, 216], [340, 218], [370, 218]],
];
/** 결재 서류를 올린 사람 */
const REQUESTER: Record<DistrictId, string> = { manor: '저택 서기', tavern: '주점 주인', dungeon: '던전 관리인', square: '광장 상인회', chapel: '성당 신부' };
/** 결재함 요청서 문구 (없으면 서류 설명) */
const REQUEST_TEXT: Partial<Record<ActionId, string>> = {
  secretaryLeave: '한 주만 쉬고 오겠습니다. 장부는 집사님께 맡겨 두겠습니다.',
  fountain: '모험가들이 쉬어 갈 곳이 필요합니다.',
};
/** 지난주에 돈이 들어온 이유 → 집사의 소식 한 줄 */
const NEWS_LINE: Record<Reason, string> = {
  fountainRest: '던전 분수대 덕분에 모험가들이 쉬어 가며 더 오래 머뭅니다!',
  promo: '공짜 술 소문을 듣고 던전 손님이 늘었습니다!',
  gifts: '연회 손님들이 답례품을 보내 왔습니다.',
  artPrice: '사 두신 미술품 값이 올랐습니다!',
  recipe: '요리사가 주점에 레시피를 팔았습니다.',
  chestRumor: '진짜 금화 소문에 모험가가 몰려듭니다!',
  merchants: '축제를 보고 상인들이 몰려왔습니다.',
  gratitude: '영지민들이 감사의 뜻으로 세금을 더 냈습니다.',
  tourists: '동상을 보러 관광객이 찾아옵니다.',
  butler: '도련님 뜻을 헤아려, 제가 알아서 조금 불려 두었습니다.',
};
const TIPS = [
  '결재는 한 주에 세 건까지입니다. 결재함 요청이든, 건물 안에서 벌인 일이든 같은 칸을 씁니다.',
  `매달 말(4·8주차)에 금고가 상한을 넘으면 왕실 관심이 쌓입니다. ${ECONOMY.royalAttentionLimit}번이면 왕도로 부르시지요. 영광입니다!`,
  '같은 일을 자꾸 하시면 감찰관이 수상히 여깁니다.',
  '저는 도련님의 결정을 배웁니다. 같은 서류를 거듭 하시면, 제가 알아서 돈을 불려 드리지요.',
  '장부 정산의 ? 표시를 누르시면, 그 돈이 들어온 곳으로 모셔다 드립니다.',
  '광장은 연회·술 파티를 합쳐 두 번 여시면 열립니다. 성당은… 감찰관의 눈초리가 꽤 따가워지면 찾게 되실 겁니다.',
];
const SPEAKER_NAME = { butler: '집사', inner: '(속마음)', outer: '나', system: '' } as const;

type Building = { id: string; img: HTMLImageElement; mask: Uint8ClampedArray; outline: HTMLCanvasElement; box: { x0: number; y0: number; x1: number; y1: number } };
type Line = { label: string; amount: number; reason?: Reason; district?: DistrictId };
type News = { week: number; net: number; lines: string[] };
type LedgerTab = 'inbox' | 'result' | 'status';
type ButlerTab = 'news' | 'tips' | 'log';

export class EstateApp {
  readonly estate = new Estate();
  readonly tut = new TutorialRunner();
  estateName = '느긋한 바람 영지';
  view: 'estate' | 'district' = 'estate';
  district: DistrictId | null = null;
  ledgerOpen = false;
  ledgerTab: LedgerTab = 'inbox';
  butlerOpen = false;
  butlerTab: ButlerTab = 'news';
  butlerBadge = false;
  /** 연출 중 (모든 입력 무시) */
  busy = false;
  /** 이번 주 결재함 요청과 처리 결과 */
  inbox: ActionId[] = [...TUTORIAL_INBOX];
  decided = new Map<ActionId, 'approved' | 'rejected'>();
  paperOpen: ActionId | null = null;
  readonly news: News[] = [];
  readonly log: { who: string; text: string }[] = [];
  private loggedStep = -1;
  private readonly spent = new Map<number, Line[]>();
  private readonly rng = mulberry32(20261112);
  private hover: string | null = null;
  private buildings: Building[] = [];
  private bg!: HTMLImageElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly $: Record<string, HTMLElement> = {};
  private time = 0;
  private walkers = Array.from({ length: 9 }, (_, i) => ({ path: i % PATHS.length, t: (i * 0.37) % 1, speed: 0.03 + (i % 4) * 0.01, color: ['#a33a3a', '#3b5b9a', '#4f7a3a', '#c9a23a', '#6a4a8a'][i % 5] }));

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
    drawPortrait(this.$['butler-face'] as HTMLCanvasElement);
    drawPortrait(this.$['butler-btn-face'] as HTMLCanvasElement);
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

  /** 튜토리얼 중엔 지정된 행동만 통과. 통과하면 fn 실행 후 다음 단계 */
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

  private bindEvents(): void {
    const $ = this.$;
    $['dlg'].addEventListener('click', () => this.act('next'));
    $['name-ok'].addEventListener('click', () => {
      const v = ($['name-input'] as HTMLInputElement).value.trim();
      this.act('name', () => (this.estateName = v || this.estateName));
    });
    $['memo-ok'].addEventListener('click', () => this.act('memo'));
    $['ledger-btn'].addEventListener('click', () => this.act('openLedger', () => this.openLedger()));
    $['ledger-close'].addEventListener('click', () => this.act('closeLedger', () => (this.ledgerOpen = false)));
    $['ledger-sign'].addEventListener('click', () => this.act('sign', () => void this.endWeekSequence()));
    for (const t of ['inbox', 'result', 'status'] as const) {
      const act = ({ inbox: 'tabInbox', result: 'tabResult', status: 'tabStatus' } as const)[t];
      $[`ledger-tab-${t}`].addEventListener('click', () => this.act(act, () => (this.ledgerTab = t)));
    }
    $['ledger-inbox'].addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-paper]');
      if (row) {
        const id = row.dataset.paper as ActionId;
        this.act(`open:${id}`, () => (this.paperOpen = id));
      }
    });
    $['ledger-result'].addEventListener('click', (e) => {
      const q = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
      if (q && this.tut.done) {
        this.ledgerOpen = false;
        this.enterDistrict(q.dataset.goto as DistrictId);
        this.render();
      }
    });
    $['paper-approve'].addEventListener('click', () => this.act('approve', () => this.decide('approved')));
    $['paper-reject'].addEventListener('click', () => this.act('reject', () => this.decide('rejected')));
    $['paper-close'].addEventListener('click', () => {
      if (!this.tut.done || this.busy) return this.nudge();
      this.paperOpen = null;
      this.render();
    });
    $['butler-btn'].addEventListener('click', () => this.act('openButler', () => this.openButler()));
    $['butler-close'].addEventListener('click', () => this.act('closeButler', () => (this.butlerOpen = false)));
    for (const t of ['news', 'tips', 'log'] as const) {
      $[`butler-tab-${t}`].addEventListener('click', () => {
        if (!this.tut.done || this.busy) return this.nudge();
        this.butlerTab = t;
        this.render();
      });
    }
    $['district-back'].addEventListener('click', () => this.act('leaveDistrict', () => this.leaveDistrict()));
    $['district-papers'].addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-take]');
      if (b) this.takeInDistrict(b.dataset.take as ActionId);
    });
    $['result-again'].addEventListener('click', () => location.reload());
    const canvas = $['view'] as HTMLCanvasElement;
    canvas.addEventListener('mousemove', (e) => {
      if (this.view !== 'estate' || this.ledgerOpen) return;
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
      if (this.view !== 'estate' || this.ledgerOpen) return;
      const p = this.toArt(e);
      const id = this.hitTest(p.x, p.y);
      if (id) this.clickBuilding(id);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.ledgerOpen) this.act('closeLedger', () => (this.ledgerOpen = false));
        else this.act('openLedger', () => this.openLedger());
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (document.activeElement === $['name-input']) return;
        e.preventDefault();
        this.act('next');
      }
    });
  }

  private openLedger(): void {
    this.ledgerOpen = true;
    this.butlerOpen = false;
  }

  private openButler(): void {
    this.butlerOpen = true;
    this.butlerTab = 'news';
    this.butlerBadge = false;
    this.ledgerOpen = false;
  }

  private decide(d: 'approved' | 'rejected'): void {
    const id = this.paperOpen;
    if (!id) return;
    if (d === 'approved' && this.estate.take(id) !== 'ok') return;
    this.decided.set(id, d);
    this.paperOpen = null;
  }

  private takeInDistrict(id: ActionId): void {
    if (!this.tut.done || this.busy) return this.nudge();
    if (this.estate.take(id) === 'ok' && this.inbox.includes(id)) this.decided.set(id, 'approved');
    this.render();
  }

  private clickBuilding(artId: string): void {
    const d = ART_TO_DISTRICT[artId];
    if (!d || !this.estate.unlocked.has(d)) return;
    const action: TutorialAction | null = d === 'tavern' ? 'enterTavern' : d === 'dungeon' ? 'enterDungeon' : null;
    if (!this.tut.done) {
      if (action) this.act(action, () => this.enterDistrict(d));
      else this.nudge();
      return;
    }
    if (this.busy) return;
    this.enterDistrict(d);
    this.render();
  }

  enterDistrict(d: DistrictId): void {
    this.view = 'district';
    this.district = d;
    this.hover = null;
    this.butlerOpen = false;
  }

  private leaveDistrict(): void {
    this.view = 'estate';
    this.district = null;
  }

  // ───────────────────────── 한 주 마치기 연출 ─────────────────────────

  /** 서명 → 장부 덮임 → 시간 흐름 → "N주차" → 우상단으로 → 집사 수첩 알림 */
  private async endWeekSequence(): Promise<void> {
    this.busy = true;
    const $ = this.$;
    this.render();
    // 1. 서명 (아직 이번 주 그대로)
    const sig = $['sig'];
    sig.classList.remove('draw');
    void sig.getBoundingClientRect();
    sig.classList.add('draw');
    await wait(1000);
    // 2. 장부 덮기
    this.ledgerOpen = false;
    this.render();
    await wait(450);
    // 3. 밤이 되고, 그사이 한 주가 정산됨
    $['night'].classList.add('on');
    await wait(700);
    this.settleWeek();
    sig.classList.remove('draw');
    this.render();
    await wait(800);
    $['night'].classList.remove('on');
    await wait(650);
    // 4. N주차 → 오른쪽 위 주차 표시로 날아감
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
    // 5. 집사 수첩에 알림
    this.butlerBadge = true;
    this.busy = false;
    this.render();
  }

  /** 한 주 정산: 장부 기록 → 경제 모델 → 집사 소식 → 다음 주 결재함 */
  private settleWeek(): void {
    const week = this.estate.week;
    this.spent.set(week, this.estate.thisWeek.map((id) => {
      const a = actionById(id);
      return { label: a.name, amount: -(a.cost + (a.debt ?? 0)) };
    }));
    const report = this.estate.endWeek();
    this.news.unshift(this.makeNews(report));
    const last = this.inbox;
    this.inbox = this.estate.status === 'playing' ? weeklyInbox(this.estate, this.rng, last) : [];
    this.decided.clear();
    this.paperOpen = null;
    this.ledgerTab = 'inbox';
  }

  private makeNews(r: WeekReport): News {
    const lines: string[] = [];
    const reasons = new Set(r.lines.filter((l) => l.amount > 0 && l.reason).map((l) => l.reason!));
    for (const reason of reasons) lines.push(NEWS_LINE[reason]);
    for (const d of r.unlocked) lines.push(`${DISTRICTS.find((x) => x.id === d)!.name} 구역이 열렸습니다.`);
    if (r.deadline) lines.push(!r.deadline.passed ? `월말 보고: 금고가 넉넉하다고 왕실이 주목하셨습니다! (왕실 관심 ${this.estate.royalAttention})` : '월말 보고: 왕실은 별말씀이 없으셨습니다.');
    if (lines.length === 0) lines.push('조용한 한 주였습니다.');
    const spent = (this.spent.get(r.week) ?? []).reduce((s, l) => s + l.amount, 0);
    return { week: r.week, net: r.lines.reduce((s, l) => s + l.amount, 0) + spent, lines };
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
    this.renderHud();
    // 창
    show($['decree'], step?.show === 'decree');
    show($['memo'], step?.show === 'memo');
    if (step?.show === 'decree') $['decree-text'].textContent = step.text;
    // 대사 (기록에도 남김)
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
    // 장부
    $['stage'].classList.toggle('ledger-open', this.ledgerOpen);
    this.renderLedger();
    this.renderPaper();
    // 집사 수첩
    show($['butler-panel'], this.butlerOpen);
    $['butler-btn'].classList.toggle('alert', this.butlerBadge);
    show($['butler-badge'], this.butlerBadge);
    if (this.butlerOpen) this.renderButler();
    // 구역
    show($['district-ui'], this.view === 'district');
    if (this.view === 'district') this.renderDistrict();
    // 결과
    const over = e.status !== 'playing' && !this.busy;
    show($['result'], over);
    if (over) this.renderResult();
    this.renderLabels();
    this.renderTooltip();
  }

  private renderHud(): void {
    const $ = this.$;
    const e = this.estate;
    $['hud-name'].textContent = this.estateName;
    $['hud-gold-v'].textContent = e.gold.toLocaleString();
    $['hud-week'].textContent = `${Math.min(e.week, ECONOMY.weeks)}주차 / ${ECONOMY.weeks}`;
    $['hud-royal'].textContent = e.royalAttention > 0 ? `👑 왕실 관심 ${e.royalAttention}/${ECONOMY.royalAttentionLimit}` : '';
    show($['hud-royal'], e.royalAttention > 0);
    const pending = this.inbox.filter((id) => !this.decided.has(id)).length;
    $['ledger-btn-count'].textContent = pending > 0 ? String(pending) : '';
    show($['ledger-btn-count'], pending > 0);
  }

  private renderLedger(): void {
    const e = this.estate;
    const $ = this.$;
    for (const t of ['inbox', 'result', 'status'] as const) {
      $[`ledger-tab-${t}`].classList.toggle('on', this.ledgerTab === t);
      show($[`ledger-${t}`], this.ledgerTab === t);
    }
    // 결재함
    const rows = this.inbox.map((id) => {
      const a = actionById(id);
      const d = this.decided.get(id);
      const chip = d === 'approved' ? '<span class="chip ok">승인</span>' : d === 'rejected' ? '<span class="chip no">반려</span>' : '<span class="chip wait">대기</span>';
      return `<div class="row paper-line ${d ? 'done' : ''}" ${d ? '' : `data-paper="${id}"`} id="inbox-${id}"><span class="nm">📜 ${a.name}<small> · ${REQUESTER[a.district]}</small></span><span class="minus">−${a.cost.toLocaleString()}</span>${chip}</div>`;
    });
    if (rows.length === 0) rows.push('<div class="row empty">올라온 요청이 없습니다</div>');
    const own = e.thisWeek.filter((id) => !this.inbox.includes(id));
    $['ledger-inbox-rows'].innerHTML = rows.join('');
    $['ledger-own-rows'].innerHTML = own.length
      ? own.map((id) => `<div class="row"><span class="nm">🏠 ${actionById(id).name}</span><span class="minus">−${actionById(id).cost.toLocaleString()}</span></div>`).join('')
      : '<div class="row empty">건물을 눌러 직접 일을 벌일 수 있습니다</div>';
    const used = e.thisWeek.length;
    $['ledger-slots'].innerHTML = `<span class="cap2">이번 주 결재</span>${Array.from({ length: ECONOMY.actionsPerWeek }, (_, i) => `<i class="slot ${i < used ? 'used' : ''}"></i>`).join('')}<b>${used} / ${ECONOMY.actionsPerWeek}</b>`;
    const dl = e.nextDeadline;
    $['ledger-deadline'].innerHTML = dl
      ? `다음 마감 <b>${dl.week}주차</b> · 금고 <b>${dl.cap.toLocaleString()}</b> 이하<br><small>지금 ${e.gold > dl.cap ? `<span class="plus">${(e.gold - dl.cap).toLocaleString()} 초과</span>` : '<span class="minus">통과</span>'}</small>`
      : `마지막 감찰 <b>${ECONOMY.weeks}주차</b> · 금고 0 이하`;
    // 지난주 정산
    const r: WeekReport | undefined = e.reports[e.reports.length - 1];
    if (!r) {
      $['ledger-result-rows'].innerHTML = '<div class="row empty">아직 지난 기록이 없습니다</div>';
      $['ledger-net'].textContent = '';
      show($['ledger-stamp'], false);
    } else {
      const lines: Line[] = [...(this.spent.get(r.week) ?? []), ...r.lines].filter((l) => l.amount !== 0);
      const net = lines.reduce((s, l) => s + l.amount, 0);
      $['ledger-result-rows'].innerHTML = lines
        .slice(0, 8)
        .map((l) => `<div class="row"><span class="nm">${l.label}</span><span class="${l.amount > 0 ? 'plus' : 'minus'}">${l.amount > 0 ? '+' : '−'}${Math.abs(l.amount).toLocaleString()}</span>${l.reason && l.reason !== 'butler' && l.district ? `<span class="q" data-goto="${l.district}" title="이 돈이 들어온 곳으로">?</span>` : ''}</div>`)
        .join('');
      $['ledger-net'].innerHTML = `<small>${r.week}주차 합계</small> <span class="${net > 0 ? 'plus' : 'minus'}">${net > 0 ? '+' : '−'}${Math.abs(net).toLocaleString()}</span>`;
      show($['ledger-stamp'], true);
      $['ledger-stamp'].textContent = net > 0 ? '실패' : '성공';
      $['ledger-stamp'].className = net > 0 ? 'stamp bad' : 'stamp good';
    }
    // 현황
    const bar = (v: number, cls: string) => `<i class="bar"><i class="fill ${cls}" style="width:${Math.min(100, Math.max(0, v))}%"></i></i>`;
    $['status-sus'].innerHTML = `<span class="nm">감찰관의 의심</span>${bar(e.suspicion, 'sus')}<b>${Math.round(e.suspicion)}/100</b><small>끝까지 차면 태만죄</small>`;
    $['status-pros'].innerHTML = `<span class="nm">영지 번영도</span>${bar(e.prosperity, 'pros')}<b>${Math.round(e.prosperity)}/100</b><small>끝까지 차면 왕도행</small>`;
    const g = e.gauges;
    $['status-gauges'].innerHTML = (['luxury', 'fun', 'fame'] as const)
      .map((k) => `<span class="gauge">${{ luxury: '사치', fun: '흥', fame: '던전 명성' }[k]} ${'●'.repeat(g[k])}${'○'.repeat(Math.max(0, 5 - g[k]))}</span>`)
      .join('');
    $['status-royal'].textContent = `왕실 관심 ${e.royalAttention} / ${ECONOMY.royalAttentionLimit} (다 차면 소환)`;
    const frac = Math.max(0, Math.min(1, e.gold / ECONOMY.startGold));
    ($['ledger-gold-bar'] as HTMLElement).style.width = `${frac * 100}%`;
    $['ledger-gold-v'].textContent = `${e.gold.toLocaleString()} → 0`;
  }

  private renderPaper(): void {
    const $ = this.$;
    const id = this.paperOpen;
    show($['paper'], !!id);
    if (!id) return;
    const a = actionById(id);
    const st = this.estate.check(id);
    $['paper-name'].textContent = a.name;
    $['paper-from'].textContent = `${DISTRICTS.find((d) => d.id === a.district)!.name} · ${REQUESTER[a.district]}`;
    $['paper-cost'].innerHTML = `비용 <b class="minus">${a.cost.toLocaleString()}</b>${a.upkeep ? ` · 매주 유지비 ${a.upkeep}` : ''}${a.debt ? ` · 빚 ${a.debt.toLocaleString()}` : ''}`;
    $['paper-quote'].textContent = REQUEST_TEXT[id] ? `"${REQUEST_TEXT[id]}"` : a.flavor;
    const why = st === 'ok' ? '' : st === 'limit' ? '이번 주 결재 3칸을 다 썼습니다' : st === 'noGold' ? '금고가 모자랍니다' : st === 'condition' ? '조건이 맞지 않습니다' : st === 'usedUp' ? '더는 할 수 없습니다' : st === 'already' ? '이번 주에 이미 했습니다' : '';
    $['paper-why'].textContent = why;
    ($['paper-approve'] as HTMLButtonElement).disabled = st !== 'ok';
    $['paper-reject'].classList.toggle('locked', !this.tut.done);
    show($['paper-close'], this.tut.done);
  }

  private renderButler(): void {
    const $ = this.$;
    for (const t of ['news', 'tips', 'log'] as const) $[`butler-tab-${t}`].classList.toggle('on', this.butlerTab === t);
    let html = '';
    if (this.butlerTab === 'news') {
      html = this.news.length
        ? this.news.map((n, i) => `<div class="news ${i === 0 ? 'latest' : ''}"><div class="cap2">${n.week}주차 소식 <span class="${n.net > 0 ? 'plus' : 'minus'}">${n.net > 0 ? '+' : '−'}${Math.abs(n.net).toLocaleString()}</span></div>${n.lines.map((l) => `<p>${l}</p>`).join('')}</div>`).join('')
        : '<p class="empty">아직 전해 드릴 소식이 없습니다.</p>';
    } else if (this.butlerTab === 'tips') {
      html = TIPS.map((t) => `<p>· ${t}</p>`).join('');
    } else {
      html = this.log.map((l) => `<p><b>${l.who}</b> ${l.text}</p>`).join('');
    }
    $['butler-news'].innerHTML = html;
    if (this.butlerTab === 'log') $['butler-news'].scrollTop = 1e6;
  }

  private renderDistrict(): void {
    const d = this.district!;
    const e = this.estate;
    this.$['district-name'].textContent = DISTRICTS.find((x) => x.id === d)!.name;
    this.$['district-papers'].innerHTML = ACTIONS.filter((a) => a.district === d)
      .map((a) => {
        const st = e.check(a.id);
        const why = st === 'ok' ? '' : st === 'condition' ? '조건 미달' : st === 'usedUp' ? '더 못 함' : st === 'noGold' ? '돈 부족' : st === 'already' ? '이번 주 함' : st === 'limit' ? '칸 없음' : '';
        return `<div class="paper-row"><div><b>${a.name}</b> <span class="cost">${a.cost.toLocaleString()}</span><br><small>${a.flavor}</small></div><button data-take="${a.id}" ${st === 'ok' && this.tut.done ? '' : 'disabled'}>${why || '하기'}</button></div>`;
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

  /** 튜토리얼 스포트라이트: 화면을 살짝 어둡게, 눌러야 할 곳만 밝게 (매 프레임 위치 맞춤) */
  private placeSpot(): void {
    const spot = this.$['spot'];
    const step = this.busy ? null : this.tut.step;
    if (!step?.target) return show(spot, false);
    const stage = this.$['stage'].getBoundingClientRect();
    let r: { x: number; y: number; w: number; h: number };
    if (step.target.startsWith('b-')) {
      const b = this.buildings.find((q) => q.id === step.target!.slice(2));
      if (!b || this.view !== 'estate' || this.ledgerOpen) return show(spot, false);
      r = { x: b.box.x0 * SCALE, y: b.box.y0 * SCALE, w: (b.box.x1 - b.box.x0) * SCALE, h: (b.box.y1 - b.box.y0) * SCALE };
    } else {
      const el = this.$[step.target] ?? document.getElementById(step.target);
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
    if (!this.hover || this.view !== 'estate' || this.ledgerOpen) return show(tip, false);
    const b = this.buildings.find((q) => q.id === this.hover);
    if (!b) return show(tip, false);
    const d = ART_TO_DISTRICT[b.id];
    const open = d ? this.estate.unlocked.has(d) : false;
    const cond = d ? DISTRICTS.find((x) => x.id === d)!.unlockText : '본편에서 열림';
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
    for (const w of this.walkers) {
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

  /** 구역 안 (2단계에서 제대로 그림 — 지금은 임시) */
  protected drawDistrict(_dt: number): void {
    const c = this.ctx;
    c.fillStyle = '#1e1622';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#3a2a22';
    c.fillRect(20, 30, 290, 190);
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

  /** 테스트·디버그용: 튜토리얼 건너뛰기 */
  skipTutorial(): void {
    this.tut.skip();
    this.ledgerOpen = false;
    this.render();
  }
}

// ───────────────────────── 도우미 ─────────────────────────

function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

/** 마우스를 올렸을 때 보이는 노란 테두리 */
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

/** 집사 초상 (작은 도트) */
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
  <div id="tooltip" class="tooltip" hidden></div>
  <div class="hud top-left"><span id="hud-name"></span></div>
  <div class="hud top-right">
    <span id="hud-gold" class="item gold">🪙 <b id="hud-gold-v"></b></span>
    <span id="hud-week" class="item"></span>
    <span id="hud-royal" class="item royal" hidden></span>
  </div>
  <button id="butler-btn" class="butler-btn"><canvas id="butler-btn-face"></canvas><span>집사</span><i id="butler-badge" class="badge" hidden>!</i></button>
  <button id="ledger-btn" class="ledger-btn">📖 장부 <i id="ledger-btn-count" class="count" hidden></i></button>

  <div id="district-ui" class="district-ui" hidden>
    <div class="district-head"><button id="district-back">← 영지로</button> <b id="district-name"></b></div>
    <div id="district-papers" class="district-papers"></div>
  </div>

  <div id="ledger" class="ledger">
    <div class="tabs">
      <button id="ledger-tab-inbox" class="tab">결재함</button>
      <button id="ledger-tab-result" class="tab">지난주 정산</button>
      <button id="ledger-tab-status" class="tab">영지 현황</button>
    </div>
    <div id="ledger-inbox" class="sheet two">
      <div class="page left">
        <div class="cap">올라온 결재 요청</div>
        <div id="ledger-inbox-rows"></div>
        <div class="cap small">건물에서 벌인 일</div>
        <div id="ledger-own-rows"></div>
      </div>
      <div class="page right">
        <div id="ledger-slots" class="slots"></div>
        <div id="ledger-deadline" class="deadline"></div>
        <button id="ledger-sign" class="sign">✒ 서명하고 한 주 마치기</button>
        <div class="sig-line"><small>영주 서명</small><svg id="sig" class="sig" viewBox="0 0 220 70"><path d="M8 52 C 30 10, 40 10, 44 40 S 60 64, 74 30 S 96 8, 100 40 C 104 60, 120 58, 130 34 C 138 18, 150 22, 148 44 C 146 60, 168 56, 184 30 L 212 26" /></svg></div>
      </div>
    </div>
    <div id="ledger-result" class="sheet">
      <div class="page">
        <div id="ledger-result-rows"></div>
        <div id="ledger-net" class="net"></div>
        <div id="ledger-stamp" class="stamp" hidden></div>
      </div>
    </div>
    <div id="ledger-status" class="sheet">
      <div class="page">
        <div id="status-pros" class="stat"></div>
        <div id="status-sus" class="stat"></div>
        <div id="status-gauges" class="gauges"></div>
        <div id="status-royal" class="royal-line"></div>
      </div>
    </div>
    <div class="foot">
      <span>금고</span><i class="bar wide"><i id="ledger-gold-bar" class="fill gold"></i></i><span id="ledger-gold-v"></span>
      <button id="ledger-close" class="close">장부 덮기</button>
    </div>
  </div>

  <div id="butler-panel" class="butler-panel" hidden>
    <div class="tabs">
      <button id="butler-tab-news" class="tab">이번 주 소식</button>
      <button id="butler-tab-tips" class="tab">집사의 조언</button>
      <button id="butler-tab-log" class="tab">대화 기록</button>
    </div>
    <div id="butler-news" class="butler-body"></div>
    <button id="butler-close" class="close">수첩 닫기</button>
  </div>

  <div id="paper" class="modal paper" hidden>
    <button id="paper-close" class="x" hidden>✕</button>
    <div class="cap">결재 서류</div>
    <p class="from" id="paper-from"></p>
    <p><b id="paper-name"></b></p>
    <p id="paper-cost"></p>
    <p class="quote" id="paper-quote"></p>
    <p class="why" id="paper-why"></p>
    <div class="btns"><button id="paper-approve">승인</button><button id="paper-reject">반려</button></div>
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
    <button id="name-ok">영지에 도착하기</button>
  </div>
  <div id="memo" class="modal memo" hidden>
    <div id="memo-title" class="cap"></div>
    <div id="memo-body" class="memo-body"></div>
    <div class="goal-box"><div class="cap small">목표</div><ul id="memo-goals"></ul></div>
    <button id="memo-ok">좋아, 시작하지</button>
  </div>
  <div id="result" class="modal" hidden>
    <div id="result-title" class="cap"></div>
    <p id="result-body"></p>
    <button id="result-again">처음부터</button>
  </div>
</div>`;
