// 이세계 수군 — 전투 화면 실험판 (SEA-1). 그림은 도형·아이콘만.
import { Battle, Rng, specActive, type BattleOptions, type BattleEvent, type CrewTask, type Ship, type Side } from '../sim/battle';
import { botThink, type BotOptions } from '../sim/bot';
import {
  DISTANCE_NAME, FORMATIONS, MAN_BONUS, PANOKSEON, RULES, SYSTEM_ICON, SYSTEM_NAME, SYSTEM_ORDER, WAESEON, WEAPONS,
  type Distance, type ShipDef, type FormationId, type SystemId,
} from '../sim/data';
import { DISTANCES, rollScout, type ScoutResult } from '../sim/encounter';
import { crewPos, doorRect, roomAt, roomRect, shipSize, type ShipView } from './layout';

const W = 1280; const H = 720;
const VIEWS: [ShipView, ShipView] = [
  { ox: 90, oy: 170, cell: 68, flip: false },
  { ox: 880, oy: 236, cell: 60, flip: true },
];
/** 이 거리에서 켜지는 무기 특화 보너스 목록 (조우 창) */
function distHint(me: ShipDef, foe: ShipDef, d: Distance): string {
  const list = (s: ShipDef) => s.weapons.map((m) => WEAPONS[m.id]).filter((w) => w.spec.at === d).map((w) => `${w.name}: ${w.spec.text}`);
  const ours = list(me); const theirs = list(foe);
  return `<span class="ours">✨ 우리 ${ours.length ? ours.join(' · ') : '— 없음'}</span><span class="theirs">⚠ 왜선 ${theirs.length ? theirs.join(' · ') : '— 없음'}</span>`;
}
const KIND_COLOR: Partial<Record<BattleEvent['kind'], string>> = {
  hit: '#ff6b5a', miss: '#b8b8b8', absorb: '#7fd0ff', breach: '#5fa8ff', fire: '#ffae3d', death: '#ff3d3d', sysdown: '#ffae3d',
};

const SHORT: Record<SystemId, string> = { helm: '장대', oars: '격군', ward: '결계', guns: '좌현포', gunsR: '우현포', pump: '배수', medic: '의원', scope: '망원경', doors: '빗장' };
const TASK_ICON: Partial<Record<CrewTask, string>> = { fire: '🧯', breach: '🪵', repair: '🔧', man: '⭐', heal: '💚' };
const TASK_NAME: Record<CrewTask, string> = { move: '이동 중', fire: '불 끄는 중', breach: '구멍 막는 중', repair: '수리 중', man: '자리를 지킴', heal: '치료 중', idle: '쉬는 중' };

/** 한 판(항해) 화면이 전투를 맡길 때 넘기는 것 */
export interface EncounterCtx {
  me: ShipDef; foe: ShipDef; seed: number;
  start?: BattleOptions['start'];
  mods?: BattleOptions['mods'];
  formations?: FormationId[];
  enemyOpts?: BotOptions;
  /** 보스처럼 거리가 정해진 전투 */
  fixed?: Distance;
  onEnd?: (b: Battle) => void;
}

interface Float { x: number; y: number; text: string; color: string; ttl: number }

export class SeaApp {
  private stage: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private panel: HTMLDivElement;
  private modal: HTMLDivElement;
  private tip: HTMLDivElement;
  private logEl: HTMLDivElement;
  b!: Battle;
  paused = true;
  speed = 1;
  selected = new Set<number>();
  aim: number | null = null;
  private floats: Float[] = [];
  private evIdx = 0;
  private enemyThink = 0;
  private acc = 0;
  private last = 0;
  private seed = 1;
  private scout: ScoutResult | null = null;
  private hover: { x: number; y: number } | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private dragged = false;
  private warned = new Set<number>();
  private logLines: string[] = [];
  private ec: EncounterCtx = { me: PANOKSEON, foe: WAESEON, seed: 1 };
  /** 화면에 보일 때만 키보드를 받음 */
  active = true;

  constructor(root: HTMLElement, standalone = true) {
    root.innerHTML = `
      <div id="stage">
        <canvas id="cv" width="${W}" height="${H}"></canvas>
        <div id="panel"></div>
        <div id="log"></div>
        <div id="tip" hidden></div>
        <div id="modal" hidden></div>
      </div>`;
    this.stage = root.querySelector('#stage')!;
    this.cv = root.querySelector('#cv')!;
    this.ctx = this.cv.getContext('2d')!;
    this.panel = root.querySelector('#panel')!;
    this.modal = root.querySelector('#modal')!;
    this.tip = root.querySelector('#tip')!;
    this.logEl = root.querySelector('#log')!;
    const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); this.stage.style.transform = `scale(${k})`; };
    addEventListener('resize', fit); fit();
    this.bindInput();
    if (standalone) this.encounter();
    else this.b = new Battle(PANOKSEON, WAESEON, 'mid');
    requestAnimationFrame((t) => this.frame(t));
  }

  // ── 조우: 정찰 판정 → 거리 ──
  encounter() { this.encounterWith({ me: PANOKSEON, foe: WAESEON, seed: this.seed }); }

  /** 정해진 두 배로 조우 → 거리 → 전투 (항해 화면에서 부름) */
  encounterWith(ec: EncounterCtx) {
    this.ec = ec; this.seed = ec.seed;
    const { me, foe } = ec;
    this.b = new Battle(me, foe, 'mid', { seed: this.seed, start: ec.start, mods: ec.mods });
    if (ec.fixed) {
      this.showModal(`<h2>🏯 ${foe.name}</h2><p class="say">"저 배만 꺾으면 이 바다를 빠져나갈 수 있다."</p>
        <div class="roll">보스전은 거리가 정해져 있음: <b>${DISTANCE_NAME[ec.fixed]}</b></div>
        <div class="choices"><button data-dist="${ec.fixed}"><b>싸운다</b><small>${distHint(me, foe, ec.fixed)}</small></button></div>`);
      this.modal.querySelectorAll<HTMLButtonElement>('[data-dist]').forEach((el) => el.onclick = () => this.start(el.dataset.dist as Distance));
      return;
    }
    const scope = this.b.ships[0].sys.scope?.level ?? 0;
    this.scout = rollScout(new Rng(this.seed * 7919), foe, { scope });
    const s = this.scout;
    const head = `<h2>⚓ ${foe.name}이(가) 나타났다!</h2>
      <p class="say">"${foe.prefers === 'near' ? '놈들은 붙으려 할 것이다.' : foe.prefers === 'far' ? '놈들은 멀리서 포를 쏘려 할 것이다.' : '놈들의 속셈을 먼저 읽어야 한다.'} 거리를 먼저 쥐는 쪽이 이긴다."</p>
      <div class="roll">정찰 판정 — 🔭 망원경 ${scope}등급 · 성공률 <b>${Math.round(s.chance * 100)}%</b><br>
      ${s.success ? '<span class="ok">성공!</span> 싸울 거리를 고르세요.' : `<span class="bad">실패…</span> 왜선이 먼저 다가왔다.`}</div>`;
    const btns = s.success
      ? DISTANCES.map((d) => `<button data-dist="${d}"><b>${DISTANCE_NAME[d]}</b><small>${distHint(me, foe, d)}</small></button>`).join('')
      : `<button data-dist="${s.forced}"><b>${DISTANCE_NAME[s.forced!]}에서 싸운다</b><small>${distHint(me, foe, s.forced!)}</small></button>`;
    this.showModal(`${head}<div class="choices">${btns}</div>`);
    this.modal.querySelectorAll<HTMLButtonElement>('[data-dist]').forEach((el) => el.onclick = () => this.start(el.dataset.dist as Distance));
  }

  start(d: Distance) {
    this.b = new Battle(this.ec.me, this.ec.foe, d, { seed: this.seed, start: this.ec.start, mods: this.ec.mods });
    const b = this.b;
    // 처음 마력: 결계 2 · 총통 · 장대 1 · 격군 2 (원작처럼 미리 꽂아 둠)
    b.setPower(0, 'ward', 99); b.ships[0].weapons.forEach((_, i) => b.toggleWeapon(0, i, true));
    b.setPower(0, 'helm', 1); b.setPower(0, 'oars', 99);
    b.ships[0].volley = true;
    botThink(b, 1, this.ec.enemyOpts);
    this.selected.clear(); this.warned.clear(); this.aim = null; this.floats = []; this.evIdx = 0; this.enemyThink = 0; this.logLines = [];
    this.paused = true; this.hideModal();
    this.say(`${DISTANCE_NAME[d]} 전투 시작 — 스페이스바로 시간을 움직이세요`);
    this.renderPanel();
  }

  // ── 루프 ──
  private frame(t: number) {
    if (!this.active) { this.last = t; requestAnimationFrame((n) => this.frame(n)); return; }
    const real = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t;
    if (!this.paused && !this.b.result && this.modal.hidden) {
      this.acc += real * this.speed;
      while (this.acc >= RULES.dt) { this.tick(); this.acc -= RULES.dt; }
    }
    for (const f of this.floats) { f.ttl -= real; f.y -= real * 22; }
    this.floats = this.floats.filter((f) => f.ttl > 0);
    this.draw();
    if (this.hover) this.updateTip();
    if (Math.floor(t / 250) !== Math.floor((t - real * 1000) / 250)) this.renderPanel();
    requestAnimationFrame((n) => this.frame(n));
  }

  /** 시간 한 칸 (테스트에서 직접 부름) */
  tick() {
    const b = this.b;
    if (b.t >= this.enemyThink) { botThink(b, 1, this.ec.enemyOpts); this.enemyThink = b.t + (this.ec.enemyOpts?.thinkEvery ?? 0.5); }
    b.step();
    for (; this.evIdx < b.events.length; this.evIdx++) this.onEvent(b.events[this.evIdx]);
    for (const c of b.ships[0].crew) {
      if (c.alive && c.hp < c.maxHp * 0.3 && !this.warned.has(c.id)) { this.warned.add(c.id); this.say(`❗ ${c.name} 위험! (피 ${Math.ceil(c.hp)}) — 의원실로 보내세요 (M)`); }
      if (c.hp > c.maxHp * 0.6) this.warned.delete(c.id);
    }
    if (b.result) this.finish();
  }

  private onEvent(e: BattleEvent) {
    if (e.kind === 'fired') return;
    const s = this.b.ships[e.side];
    const q = e.room ? roomRect(s, e.room, VIEWS[e.side]) : { x: VIEWS[e.side].ox, y: VIEWS[e.side].oy, w: 100, h: 40 };
    const stack = this.floats.filter((f) => Math.abs(f.x - (q.x + q.w / 2)) < 30 && f.ttl > 0.9).length;
    this.floats.push({ x: q.x + q.w / 2, y: q.y + 44 + Math.min(stack, 2) * 18, text: e.text, color: KIND_COLOR[e.kind] ?? '#fff', ttl: 1.4 });
    if (e.kind === 'breach' || e.kind === 'fire' || e.kind === 'death' || e.kind === 'sysdown') {
      const where = e.room ? this.roomName(s, e.room) : '';
      this.say(`${e.side === 0 ? '우리 배' : '왜선'}: ${e.text}${where && e.kind !== 'death' ? ` (${where})` : ''}`);
    }
  }

  private finish() {
    const r = this.b.result!; const win = r.winner === 0;
    const why = win ? (r.reason === 'hull' ? '왜선이 부서져 가라앉았다.' : '왜선의 선원이 모두 쓰러졌다.') : (r.reason === 'hull' ? '판옥선이 버티지 못했다…' : '선원을 모두 잃었다…');
    this.showModal(`<h2>${win ? '🏆 승리' : '💀 패배'}</h2><p>${why}</p>
      <p class="small">전투 시간 ${Math.round(this.b.t)}초 · ${DISTANCE_NAME[this.b.distance]} · 남은 선체 ${this.b.ships[0].hull}/${this.b.ships[0].maxHull}</p>
      <div class="choices"><button id="again"><b>${this.ec.onEnd ? (win ? '전리품 챙기기' : '항해 기록 보기') : '다음 왜선과 싸우기'}</b><small>${this.ec.onEnd ? '' : '정찰 판정부터 다시'}</small></button></div>`);
    const end = this.ec.onEnd;
    this.modal.querySelector<HTMLButtonElement>('#again')!.onclick = () => { if (end) { this.hideModal(); end(this.b); } else { this.seed++; this.encounter(); } };
  }

  // ── 입력 ──
  private toStage(ev: MouseEvent) {
    const r = this.cv.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  }
  private bindInput() {
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
      if (e.code === 'Escape') { this.aim = null; this.selected.clear(); this.renderPanel(); }
      if (e.code === 'KeyM') this.sendInjured();
      const n = /^Digit([1-9])$/.exec(e.code); // 숫자키: 그 총통 켜기·조준 (원작처럼)
      if (n && Number(n[1]) <= this.b.ships[0].weapons.length) this.weaponClick(Number(n[1]) - 1);
    });
    this.cv.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.aim !== null) return;
      const p = this.toStage(e); this.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    });
    addEventListener('mouseup', (e) => {
      const d = this.drag; this.drag = null; if (!d) return;
      if (Math.abs(d.x1 - d.x0) < 10 && Math.abs(d.y1 - d.y0) < 10) return;
      // 드래그: 상자 안의 선원을 모두 고름
      const me = this.b.ships[0]; const [xa, xb] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)]; const [ya, yb] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
      if (!e.shiftKey) this.selected.clear();
      for (const c of me.crew) { if (!c.alive) continue; const q = crewPos(this.b, me, c, VIEWS[0]); if (q.x >= xa && q.x <= xb && q.y - 12 >= ya - 12 && q.y - 12 <= yb + 12) this.selected.add(c.id); }
      this.dragged = true; this.renderPanel();
    });
    this.cv.addEventListener('contextmenu', (e) => { e.preventDefault(); this.aim = null; this.selected.clear(); this.renderPanel(); });
    this.cv.addEventListener('mousemove', (e) => { this.hover = this.toStage(e); if (this.drag) { this.drag.x1 = this.hover.x; this.drag.y1 = this.hover.y; } this.updateTip(); });
    this.cv.addEventListener('mouseleave', () => { this.hover = null; this.tip.hidden = true; });
    this.cv.addEventListener('click', (e) => { if (this.dragged) { this.dragged = false; return; } this.clickAt(this.toStage(e), e.shiftKey); });
  }
  togglePause() { if (!this.b.result && this.modal.hidden) { this.paused = !this.paused; this.renderPanel(); } }

  clickAt(p: { x: number; y: number }, add = false) {
    const b = this.b; const me = b.ships[0]; const foe = b.ships[1];
    // 1) 조준 중이면 적 방을 고름
    if (this.aim !== null) {
      const r = roomAt(foe, VIEWS[1], p.x, p.y);
      if (r) { b.setTarget(0, this.aim, r); this.say(`${me.weapons[this.aim].def.name} → ${this.roomName(foe, r)} 조준`); this.aim = null; this.renderPanel(); }
      return;
    }
    // 2) 선원 고르기
    const hit = me.crew.find((c) => c.alive && Math.hypot(crewPos(b, me, c, VIEWS[0]).x - p.x, crewPos(b, me, c, VIEWS[0]).y - 12 - p.y) < 16);
    if (hit) { if (!add) this.selected.clear(); this.selected.add(hit.id); this.renderPanel(); return; }
    // 3) 문 여닫기
    const door = me.doors.find((d) => { const q = doorRect(me, d, VIEWS[0]); return p.x >= q.x - 7 && p.x <= q.x + q.w + 7 && p.y >= q.y - 7 && p.y <= q.y + q.h + 7; });
    if (door) { if (!b.toggleDoor(0, door.id)) this.say('빗장실에 마력이 없어서 문을 못 움직임');
      else if (door.b === null) this.say(door.open ? `배수구 열림 — ${this.roomName(me, door.a)} 물이 바다로 빠짐 (구멍 나면 물이 더 빨리 참)` : '배수구 닫힘');
      return; }
    // 4) 고른 선원을 방으로 보냄
    const r = roomAt(me, VIEWS[0], p.x, p.y);
    if (r && this.selected.size) { for (const id of this.selected) b.moveCrew(0, id, r); return; }
    if (!r) { this.selected.clear(); this.renderPanel(); }
  }

  /** 고른 선원(없으면 피가 70% 아래인 선원)을 의원실로 */
  sendInjured() {
    const b = this.b; const me = b.ships[0]; const med = b.roomOf(me, 'medic'); if (!med) return;
    const who = this.selected.size ? me.crew.filter((c) => this.selected.has(c.id)) : me.crew.filter((c) => c.alive && c.hp < c.maxHp * 0.7);
    if (!who.length) { this.say('다친 선원이 없음'); return; }
    for (const c of who) b.moveCrew(0, c.id, med.id);
    this.say(`⚕ ${who.map((c) => c.name).join('·')} → 의원실${b.ships[0].sys.medic!.power ? '' : ' (의원실에 마력을 꽂아야 치료됨)'}`);
  }

  powerUp(sys: SystemId, d: 1 | -1) { this.b.addPower(0, sys, d); this.renderPanel(); }
  weaponClick(i: number) {
    const w = this.b.ships[0].weapons[i];
    if (!w.powered) { if (!this.b.toggleWeapon(0, i, true)) this.say('마력이 모자라거나 포갑판이 망가짐'); }
    else this.aim = this.aim === i ? null : i;
    this.renderPanel();
  }
  weaponOff(i: number) { this.b.toggleWeapon(0, i, false); this.b.setTarget(0, i, null); if (this.aim === i) this.aim = null; this.renderPanel(); }
  formation(f: FormationId) {
    if (this.b.setFormation(0, f)) this.say(`${FORMATIONS[f].name}! — ${FORMATIONS[f].effect}`);
    this.renderPanel();
  }

  // ── 아래 패널 (DOM) ──
  renderPanel() {
    const b = this.b; if (!b) return; const s = b.ships[0];
    const free = b.freePower(s);
    const reactor = Array.from({ length: s.reactor }, (_, i) => `<i class="${i < free ? 'on' : ''}"></i>`).join('');
    const sysBtns = SYSTEM_ORDER.filter((k) => s.sys[k]).map((k) => {
      const x = s.sys[k]!; const off = b.eff(s, k) === 0 && x.power > 0;
      const pips = Array.from({ length: x.level }, (_, i) => `<i class="${i >= x.level - x.damage ? 'dmg' : i < x.power ? 'on' : ''}"></i>`).reverse().join('');
      return `<button class="sys ${off ? 'off' : ''}" data-sys="${k}" title="${SYSTEM_NAME[k]} — 클릭 +1 · 우클릭 −1"><span class="pips">${pips}</span><span class="ic">${SYSTEM_ICON[k]}</span><small>${SHORT[k]}</small></button>`;
    }).join('');
    const weapons = s.weapons.map((w, i) => {
      const full = w.charge >= w.def.charge;
      const stalled = w.powered && !b.gunLive(s, i);
      const tgt = !w.powered ? (w.want ? '⏳ 고치면 다시 켜짐' : '꺼짐 · 클릭해서 켜기') : stalled ? `⚠ ${SYSTEM_NAME[w.mount]} 고장·침수 — 충전 멈춤` : w.target ? `→ ${this.roomName(b.ships[1], w.target)}` : w.powered ? '클릭해서 조준' : (w.want ? '⏳ 고치면 다시 켜짐' : '꺼짐 · 클릭해서 켜기');
      return `<button class="wpn ${w.powered ? 'on' : ''} ${this.aim === i ? 'aim' : ''} ${full ? 'ready' : ''}" data-w="${i}" title="${w.def.blurb}&#10;${DISTANCE_NAME[w.def.spec.at]} 특화: ${w.def.spec.text}">
        <b>${i + 1}. ${w.def.name} <span class="pw">${'◆'.repeat(w.def.power)}</span></b><small>${SYSTEM_NAME[w.mount]} · <span class="spec ${specActive(w.def, b.distance) ? 'on' : ''}">${specActive(w.def, b.distance) ? '✨ 특화 켜짐' : `${DISTANCE_NAME[w.def.spec.at]} 특화`}</span></small>
        <span class="bar"><i data-charge="${i}"></i></span><small>${tgt}</small></button>`;
    }).join('');
    const forms = (this.ec.formations ?? (Object.keys(FORMATIONS) as FormationId[])).map((f) => {
      const F = FORMATIONS[f]; const on = s.formation === f;
      return `<button class="frm ${on ? 'on' : ''}" data-f="${f}" ${s.formationCd > 0 && !on ? 'disabled' : ''} title="역사: ${F.history}">
        <b>${F.name}</b><small>${F.effect}</small></button>`;
    }).join('');
    const cd = s.formationCd > 0 ? `<small class="cd">진법 바꾸기 ${Math.ceil(s.formationCd)}초 뒤</small>` : '<small class="cd">진법: 언제든 바꿀 수 있음</small>';
    const crew = s.crew.map((c) => `<span class="cm ${c.alive ? '' : 'dead'} ${this.selected.has(c.id) ? 'sel' : ''}" data-c="${c.id}">${c.name} <i data-hp="${c.id}"></i></span>`).join('');
    const html = `
      <div class="col reactor"><div class="lbl">마력로 <b>${free}</b>/${s.reactor} 남음</div><div class="rbar">${reactor}</div><div class="crew">${crew}</div></div>
      <div class="col systems">${sysBtns}</div>
      <div class="col weapons"><div class="lbl">총통 (클릭·숫자키: 켜기·조준 · 우클릭: 끄기)</div><div class="wrow">${weapons}</div></div>
      <div class="col forms"><div class="lbl">진법</div>${forms}${cd}</div>
      <div class="col ctrl"><label class="vol" title="결계가 있으면 한 발씩은 다 막힘. 켜 두면 조준한 총통이 다 찰 때까지 기다렸다 한꺼번에 쏨"><input type="checkbox" id="volley" ${s.volley ? 'checked' : ''}> 일제 사격</label><button id="medic" title="고른 선원, 없으면 피가 70% 아래인 선원을 의원실로">⚕ 다친 선원 의원실로</button><div class="row2"><button id="pause">${this.paused ? '▶ 계속' : '⏸ 멈춤'}</button><button id="speed">×${this.speed}</button></div><small class="cd">Space 멈춤 · M 의원실</small></div>`;
    // 내용이 바뀔 때만 다시 그림 (클릭 도중에 버튼이 바뀌어 클릭이 사라지지 않게)
    if (html !== this.panelHtml) { this.panelHtml = html; this.panel.innerHTML = html; this.bindPanel(); }
    s.weapons.forEach((w, i) => { const el = this.panel.querySelector<HTMLElement>(`[data-charge="${i}"]`); if (el) el.style.width = `${Math.round((w.charge / w.def.charge) * 100)}%`; });
    s.crew.forEach((c) => { const el = this.panel.querySelector<HTMLElement>(`[data-hp="${c.id}"]`); if (el) el.style.width = `${Math.max(0, c.hp)}%`; });
    this.logEl.innerHTML = this.logLines.slice(-4).map((l) => `<div>${l}</div>`).join('');
  }

  private panelHtml = '';
  private bindPanel() {
    const s = this.b.ships[0];
    this.panel.querySelectorAll<HTMLButtonElement>('[data-sys]').forEach((el) => {
      el.onclick = () => this.powerUp(el.dataset.sys as SystemId, 1);
      el.oncontextmenu = (e) => { e.preventDefault(); this.powerUp(el.dataset.sys as SystemId, -1); };
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((el) => {
      el.onclick = () => this.weaponClick(Number(el.dataset.w));
      el.oncontextmenu = (e) => { e.preventDefault(); this.weaponOff(Number(el.dataset.w)); };
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((el) => el.onclick = () => this.formation(el.dataset.f as FormationId));
    this.panel.querySelectorAll<HTMLElement>('[data-c]').forEach((el) => el.onclick = (e) => {
      const id = Number(el.dataset.c); if (!e.shiftKey) this.selected.clear(); this.selected.add(id); this.renderPanel();
    });
    this.panel.querySelector<HTMLInputElement>('#volley')!.onchange = (e) => { s.volley = (e.target as HTMLInputElement).checked; };
    this.panel.querySelector<HTMLButtonElement>('#medic')!.onclick = () => this.sendInjured();
    this.panel.querySelector<HTMLButtonElement>('#pause')!.onclick = () => this.togglePause();
    this.panel.querySelector<HTMLButtonElement>('#speed')!.onclick = () => { this.speed = this.speed === 1 ? 2 : 1; this.renderPanel(); };
  }

  private say(t: string) { this.logLines.push(t); if (this.logLines.length > 30) this.logLines.shift(); }
  private showModal(html: string) { this.modal.innerHTML = `<div class="card">${html}</div>`; this.modal.hidden = false; }
  private hideModal() { this.modal.hidden = true; }
  private roomName(s: Ship, id: string) { const r = s.rooms.find((x) => x.id === id); return r?.name ?? (r?.sys ? SYSTEM_NAME[r.sys] : id); }

  private updateTip() {
    const p = this.hover; if (!p || !this.b) { this.tip.hidden = true; return; }
    for (const side of [0, 1] as Side[]) {
      const s = this.b.ships[side]; const id = roomAt(s, VIEWS[side], p.x, p.y);
      if (!id) continue;
      const r = s.rooms.find((x) => x.id === id)!; const x = r.sys ? s.sys[r.sys] : undefined;
      const lines = [`<b>${side === 0 ? '' : '왜선 '}${this.roomName(s, id)}</b>`];
      if (x) lines.push(`마력 ${x.power}/${x.level}${x.damage ? ` · 고장 ${x.damage}` : ''}`);
      if (r.water > 0.01) lines.push(`물 ${Math.round((r.water / r.w) * 100)}%`);
      if (r.fire > 0) lines.push('🔥 불');
      if (r.breach) lines.push(`🕳 구멍 — 선원이 막아야 함${r.breachRepair > 0 ? ` (${Math.round(r.breachRepair * 100)}%)` : ''}`);
      if (x && x.damage > 0 && x.repair > 0) lines.push(`🔧 수리 ${Math.round(x.repair * 100)}%`);
      if (side === 0 || this.b.eff(this.b.ships[0], 'scope') > 0) {
        const here = s.crew.filter((c) => c.alive && c.room === id && !c.path.length);
        for (const c of here) lines.push(`${c.name}: ${TASK_NAME[this.b.crewTask(s, c)]}${this.b.crewTask(s, c) === 'man' && r.sys ? ` → ${MAN_BONUS[r.sys]}` : ''}`);
        if (!here.length && r.sys && MAN_BONUS[r.sys] && side === 0) lines.push(`<span style="color:#b8a888">비어 있음 · 선원이 서 있으면: ${MAN_BONUS[r.sys]}</span>`);
      }
      if (side === 1 && this.aim !== null) lines.push('<i>클릭해서 조준</i>');
      this.tip.innerHTML = lines.join('<br>'); this.tip.hidden = false;
      this.tip.style.left = `${Math.min(W - 200, p.x + 14)}px`; this.tip.style.top = `${p.y + 14}px`;
      return;
    }
    this.tip.hidden = true;
  }

  // ── 그리기 (캔버스) ──
  private draw() {
    const c = this.ctx; const b = this.b;
    c.fillStyle = '#0f2f4d'; c.fillRect(0, 0, W, H);
    if (!b) return;
    this.drawSea();
    for (const side of [0, 1] as Side[]) this.drawShip(b.ships[side], side);
    this.drawProjectiles();
    this.drawTop();
    for (const f of this.floats) { c.globalAlpha = Math.min(1, f.ttl); c.fillStyle = f.color; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeText(f.text, f.x, f.y); c.fillText(f.text, f.x, f.y); }
    c.globalAlpha = 1;
    if (this.paused && this.modal.hidden && !b.result) {
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, W, 540);
      c.fillStyle = '#f2d98a'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText('⏸ 일시정지 — 스페이스바로 계속', W / 2, 108);
    }
    if (this.drag && (Math.abs(this.drag.x1 - this.drag.x0) > 10 || Math.abs(this.drag.y1 - this.drag.y0) > 10)) {
      const d = this.drag; c.strokeStyle = '#ffd36b'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      c.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); c.setLineDash([]);
    }
    const me = b.ships[0];
    if (this.selected.size && this.aim === null && !b.result) {
      const names = me.crew.filter((x) => this.selected.has(x.id) && x.alive).map((x) => x.name).join('·');
      c.fillStyle = '#ffd36b'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center';
      c.fillText(`👆 ${names} — 갈 방을 클릭 (우클릭 취소 · M 의원실)`, VIEWS[0].ox + 250, 134);
    }
    if (!b.result && this.modal.hidden && !b.manned(me, 'helm')) {
      const blink = Math.floor(performance.now() / 500) % 2 === 0;
      c.fillStyle = blink ? '#ff6b5a' : '#c84a3a'; c.font = 'bold 15px sans-serif'; c.textAlign = 'left';
      c.fillText('⚠ 장대가 비었음 — 회피 0', VIEWS[0].ox, 112);
    }
    if (this.aim !== null) { c.fillStyle = '#ffd36b'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.fillText('🎯 왜선의 방을 클릭해서 조준 (우클릭 취소)', 1030, 180); }
  }

  private drawShip(s: Ship, side: Side) {
    const c = this.ctx; const v = VIEWS[side]; const b = this.b; const { w, h } = shipSize(s, v);
    const fog = side === 1 && b.eff(b.ships[0], 'scope') < 1;
    // 선체: 위에서 본 배 — 고물은 둥글고 이물(뱃머리)은 적 쪽으로 뾰족
    const x0 = v.ox; const x1 = v.ox + w; const y0 = v.oy - 12; const y1 = v.oy + h + 12; const ym = v.oy + h / 2;
    const dir = side === 0 ? 1 : -1; const stern = side === 0 ? x0 - 12 : x1 + 12; const bowBase = side === 0 ? x1 + 4 : x0 - 4;
    c.fillStyle = '#6a4528'; c.strokeStyle = '#2b1a0e'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(stern, y0);
    c.lineTo(bowBase, y0); c.quadraticCurveTo(bowBase + dir * 50, y0 + 6, bowBase + dir * 72, ym);
    c.quadraticCurveTo(bowBase + dir * 50, y1 - 6, bowBase, y1); c.lineTo(stern, y1);
    c.quadraticCurveTo(stern - dir * 22, ym, stern, y0); c.closePath(); c.fill(); c.stroke();
    // 갑판 널빤지
    c.strokeStyle = 'rgba(40,24,12,0.35)'; c.lineWidth = 1;
    for (let yy = y0 + 10; yy < y1; yy += 12) { c.beginPath(); c.moveTo(Math.min(stern, bowBase), yy); c.lineTo(Math.max(stern, bowBase), yy); c.stroke(); }
    c.fillStyle = '#c9a23a'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center';
    c.fillText(`${s.def.name}${side === 1 && fog ? ' (망원경 꺼짐: 안이 안 보임)' : ''}`, x0 + w / 2, y0 - 10);
    // 방
    for (const r of s.rooms) {
      const q = roomRect(s, r.id, v); const x = r.sys ? s.sys[r.sys] : undefined;
      c.fillStyle = fog ? '#1d1712' : '#3a291b';
      c.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
      if (!fog) {
        const lv = b.waterLevel(r);
        if (lv > 0.01) {
          // 위에서 본 물: 깊을수록 진한 파랑 + 잔물결, 30% 넘으면 숫자
          c.fillStyle = `rgba(50,130,225,${0.15 + lv * 0.6})`; c.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
          c.strokeStyle = 'rgba(170,220,255,0.5)'; c.lineWidth = 1.5;
          for (let k = 1; k <= Math.ceil(lv * 3); k++) {
            const yy = q.y + (q.h * k) / (Math.ceil(lv * 3) + 1); c.beginPath();
            for (let i = 0; i <= 10; i++) { const xx = q.x + 4 + ((q.w - 8) * i) / 10; const y2 = yy + Math.sin(i + b.t * 4 + k) * 2; i ? c.lineTo(xx, y2) : c.moveTo(xx, y2); }
            c.stroke();
          }
          if (lv >= 0.3) { c.fillStyle = '#bfe3ff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'right'; c.fillText(`💧${Math.round(lv * 100)}%`, q.x + q.w - 6, q.y + 16); }
        }
        if (r.fire > 0) {
          c.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 60)},40,${0.25 + r.fire * 0.4})`;
          c.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
          c.font = `${18 + r.fire * 10}px sans-serif`; c.textAlign = 'center'; c.fillText('🔥', q.x + q.w / 2, q.y + q.h - 10);
        }
        if (r.breach) { c.font = '22px sans-serif'; c.textAlign = 'right'; c.fillText('🕳', q.x + q.w - 6, q.y + q.h - 8); }
      }
      // 이름·아이콘·마력
      c.textAlign = 'left'; c.fillStyle = x && x.damage > 0 ? '#ff8a7a' : '#e8d8b8';
      const narrow = q.w < 110;
      c.font = `${narrow ? 11 : side === 0 ? 14 : 12}px sans-serif`;
      if (narrow) { // 좁은 방: 아이콘 한 줄, 이름 한 줄
        if (r.sys) c.fillText(SYSTEM_ICON[r.sys], q.x + 6, q.y + 15);
        c.fillText(this.roomName(s, r.id), q.x + (r.sys ? 22 : 6), q.y + 15);
      } else c.fillText(`${r.sys ? SYSTEM_ICON[r.sys] + ' ' : ''}${this.roomName(s, r.id)}`, q.x + 7, q.y + 18);
      if (x) for (let i = 0; i < x.level; i++) {
        c.fillStyle = i >= x.level - x.damage ? '#d44' : i < Math.min(x.power, x.level - x.damage) ? (b.eff(s, r.sys!) > 0 ? '#7ee07e' : '#4a7') : '#555';
        c.fillRect(q.x + 8 + i * 10, q.y + 25, 7, 7);
      }
      if (side === 1 && b.ships[0].weapons.some((wp) => wp.powered && wp.target === r.id)) { c.strokeStyle = '#ffd36b'; c.lineWidth = 3; c.strokeRect(q.x + 4, q.y + 4, q.w - 8, q.h - 8); }
      if (side === 1 && this.hover && this.aim !== null) {
        const hv = roomAt(s, v, this.hover.x, this.hover.y);
        if (hv === r.id) { c.strokeStyle = '#ffae3d'; c.lineWidth = 3; c.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6); }
      }
      c.strokeStyle = '#1a120b'; c.lineWidth = 2; c.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
    }
    // 문 (배수구는 바깥 벽의 파란 문)
    for (const d of s.doors) {
      const q = doorRect(s, d, v);
      if (d.b === null) c.fillStyle = d.open ? '#5fd0ff' : '#2e5a78';
      else c.fillStyle = d.open ? '#7ee07e' : '#a06a32';
      if (d.open) { c.globalAlpha = 0.55; } c.fillRect(q.x, q.y, q.w, q.h); c.globalAlpha = 1;
      if (d.b === null) { c.strokeStyle = '#9fd8ff'; c.lineWidth = 1; c.strokeRect(q.x, q.y, q.w, q.h); }
    }
    // 선원
    if (!fog) for (const cr of s.crew) {
      if (!cr.alive) continue;
      const p = crewPos(b, s, cr, v); const r = side === 0 ? 12 : 10;
      c.fillStyle = side === 0 ? '#e9d3a0' : '#c8584a';
      c.beginPath(); c.arc(p.x, p.y - r, r, 0, Math.PI * 2); c.fill();
      if (this.selected.has(cr.id) && side === 0) {
        const pulse = 4 + Math.sin(performance.now() / 150) * 2;
        c.strokeStyle = '#ffd36b'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - r, r + pulse, 0, Math.PI * 2); c.stroke();
      }
      c.fillStyle = '#222'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.fillText(cr.name.slice(0, 1), p.x, p.y - r + 4);
      c.fillStyle = '#300'; c.fillRect(p.x - 12, p.y + 2, 24, 4);
      c.fillStyle = cr.hp > 50 ? '#6c6' : cr.hp > 25 ? '#dc4' : '#e44'; c.fillRect(p.x - 12, p.y + 2, 24 * (cr.hp / cr.maxHp), 4);
      // 하는 일 아이콘 · 위험 표시
      const icon = TASK_ICON[b.crewTask(s, cr)];
      c.font = '14px sans-serif';
      if (icon) c.fillText(icon, p.x, p.y - 2 * r - 6);
      if (cr.hp < cr.maxHp * 0.3) { c.fillStyle = '#ff4a3a'; c.font = 'bold 16px sans-serif'; c.fillText('❗', p.x + r + 4, p.y - 2 * r); }
    }
    // 수리·구멍 막기 진행 막대
    if (!fog) for (const r of s.rooms) {
      const x = r.sys ? s.sys[r.sys] : undefined;
      const prog = r.breach ? r.breachRepair : x && x.damage > 0 ? x.repair : 0;
      if (prog <= 0) continue;
      const q = roomRect(s, r.id, v);
      c.fillStyle = '#222'; c.fillRect(q.x + 8, q.y + q.h - 10, q.w - 16, 5);
      c.fillStyle = r.breach ? '#5fa8ff' : '#e0c060'; c.fillRect(q.x + 8, q.y + q.h - 10, (q.w - 16) * prog, 5);
    }
    // 고른 선원이 있을 때 마우스 올린 방
    if (side === 0 && this.selected.size && this.hover && this.aim === null) {
      const hv = roomAt(s, v, this.hover.x, this.hover.y);
      if (hv) { const q = roomRect(s, hv, v); c.strokeStyle = '#ffd36b'; c.lineWidth = 2; c.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6); }
    }
  }

  /** 바다: 잔물결이 흘러감 */
  private drawSea() {
    const c = this.ctx; const t = this.b.t;
    c.strokeStyle = 'rgba(120,180,230,0.12)'; c.lineWidth = 1.5;
    for (let y = 100; y < 540; y += 26) {
      c.beginPath();
      for (let x = 0; x <= W; x += 16) { const yy = y + Math.sin(x / 50 + t * 1.2 + y) * 3; x ? c.lineTo(x, yy) : c.moveTo(x, yy); }
      c.stroke();
    }
  }

  private drawProjectiles() {
    const c = this.ctx; const b = this.b;
    for (const p of b.projectiles) {
      if (p.t < 0) continue;
      const k = p.t / p.total;
      const fromShip = b.ships[p.from]; const toShip = b.ships[p.from === 0 ? 1 : 0];
      const gun = b.roomOf(fromShip, 'guns'); const a = roomRect(fromShip, gun ? gun.id : fromShip.rooms[0].id, VIEWS[p.from]);
      const z = roomRect(toShip, p.target, VIEWS[toShip.side]);
      const ax = a.x + a.w / 2; const ay = a.y + 20; const zx = z.x + z.w / 2; const zy = z.y + z.h / 2;
      const x = ax + (zx - ax) * k; const y = ay + (zy - ay) * k - Math.sin(k * Math.PI) * 90;
      c.fillStyle = p.weapon.fire > 0.3 ? '#ffae3d' : p.from === 0 ? '#f6f0d8' : '#ff9a8a';
      c.beginPath(); c.arc(x, y, p.weapon.dmg >= 2 ? 6 : 4, 0, Math.PI * 2); c.fill();
    }
  }

  private drawTop() {
    const c = this.ctx; const b = this.b;
    const bar = (x: number, s: Ship, label: string) => {
      c.textAlign = 'left'; c.fillStyle = '#e8d8b8'; c.font = 'bold 15px sans-serif'; c.fillText(`${label} 선체 ${s.hull}/${s.maxHull}`, x, 30);
      const cw = Math.min(12, 330 / s.maxHull);
      for (let i = 0; i < s.maxHull; i++) { c.fillStyle = i < s.hull ? (s.hull / s.maxHull > 0.35 ? '#6cc36c' : '#e05a4a') : '#333'; c.fillRect(x + i * cw, 38, cw - 2, 14); }
      const ml = b.maxLayers(s);
      for (let i = 0; i < ml; i++) { c.strokeStyle = '#7fd0ff'; c.lineWidth = 3; c.beginPath(); c.arc(x + 12 + i * 28, 72, 10, 0, Math.PI * 2); c.stroke(); if (i < s.wardLayers) { c.fillStyle = 'rgba(127,208,255,0.6)'; c.fill(); } }
      c.fillStyle = '#9fb8d0'; c.font = '13px sans-serif';
      c.fillText(`🛡 결계 ${s.wardLayers}/${ml}   회피 ${Math.round(b.evasion(s) * 100)}%`, x + (ml ? ml * 28 + 6 : 0), 77);
    };
    bar(60, b.ships[0], '판옥선'); bar(880, b.ships[1], '왜선');
    c.textAlign = 'center'; c.fillStyle = '#f2d98a'; c.font = 'bold 18px sans-serif';
    c.fillText(`${DISTANCE_NAME[b.distance]}`, W / 2, 34);
    c.fillStyle = '#9fb8d0'; c.font = '13px sans-serif'; c.fillText(`${Math.floor(b.t)}초${this.speed > 1 ? ' · ×2' : ''}`, W / 2, 54);
    const f = b.ships[0].formation;
    if (f) { c.fillStyle = '#c9a23a'; c.fillText(`진법: ${FORMATIONS[f].name}`, W / 2, 74); }
  }
}
