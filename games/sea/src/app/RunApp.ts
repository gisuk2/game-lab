// 이세계 수군 — 한 바다 항해 화면 (SEA-2): 해도 지도 · 보상 · 항구 · 이벤트 · 결과. 전투는 SeaApp에 맡김.
import { Rng } from '../sim/battle';
import { FORMATIONS, WEAPONS, type SystemId } from '../sim/data';
import { enemyBot } from '../run/enemies';
import { KIND_ICON, KIND_NAME, edgeOf, type MapNode } from '../run/map';
import {
  aliveCrew, battleOptions, buyFood, buyWeapon, closeEvent, enemyFor, equip, finishBattle, healAll, leavePort, move, newRun,
  node, reachable, repair, repairCost, RUN_RULES, shipDef, takeReward, upgrade, upgradeCost, weaponDef, weaponName,
  type Reward, type RunState,
} from '../run/run';
import { SeaApp } from './SeaApp';

const W = 1280; const H = 720;
const MAP = { x0: 330, colW: 150, yBottom: 640, floorH: 58 };
const UPGRADE_NAME: Record<string, string> = { reactor: '마력로 +1칸', ward: '결계실 +2 (결계 한 겹)', guns: '포갑판(좌현) +1', gunsR: '포갑판(우현) +1', oars: '격군실 +1', medic: '의원실 +1' };

export class RunApp {
  run!: RunState;
  battle: SeaApp;
  private stage: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private side: HTMLDivElement;
  private modal: HTMLDivElement;
  private tip: HTMLDivElement;
  private runRoot: HTMLDivElement;
  private battleRoot: HTMLDivElement;
  private hover: string | null = null;
  private seed: number;

  constructor(root: HTMLElement, seed = Math.floor(Math.random() * 1e6)) {
    root.innerHTML = `<div id="runRoot"><div id="rstage"><canvas id="mapcv" width="${W}" height="${H}"></canvas>
      <div id="rside"></div><div id="rtip" hidden></div><div id="rmodal" hidden></div></div></div><div id="battleRoot" hidden></div>`;
    this.runRoot = root.querySelector('#runRoot')!;
    this.battleRoot = root.querySelector('#battleRoot')!;
    this.stage = root.querySelector('#rstage')!;
    this.cv = root.querySelector('#mapcv')!;
    this.ctx = this.cv.getContext('2d')!;
    this.side = root.querySelector('#rside')!;
    this.modal = root.querySelector('#rmodal')!;
    this.tip = root.querySelector('#rtip')!;
    this.battle = new SeaApp(this.battleRoot, false);
    this.battle.active = false;
    const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); this.stage.style.transform = `scale(${k})`; };
    addEventListener('resize', fit); fit();
    this.cv.addEventListener('mousemove', (e) => { const p = this.toStage(e); this.hover = this.nodeAt(p.x, p.y); this.updateTip(p); });
    this.cv.addEventListener('mouseleave', () => { this.hover = null; this.tip.hidden = true; });
    this.cv.addEventListener('click', (e) => { const p = this.toStage(e); const id = this.nodeAt(p.x, p.y); if (id) this.go(id); });
    this.seed = seed;
    this.newRun(seed);
    requestAnimationFrame((t) => this.frame(t));
  }

  newRun(seed = this.seed) { this.seed = seed; this.run = newRun(seed); this.showRun(); this.render(); }

  // ── 좌표 ──
  private toStage(ev: MouseEvent) { const r = this.cv.getBoundingClientRect(); return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H }; }
  pos(n: MapNode) {
    const j = new Rng(this.run.seed * 977 + n.floor * 31 + n.col);
    const jx = n.kind === 'boss' ? 0 : (j.next() - 0.5) * 36; const jy = n.kind === 'boss' ? 0 : (j.next() - 0.5) * 14;
    return { x: MAP.x0 + n.col * MAP.colW + jx, y: MAP.yBottom - n.floor * MAP.floorH + jy };
  }
  private nodeAt(x: number, y: number): string | null {
    for (const n of this.run.map.nodes) { const p = this.pos(n); if (Math.hypot(p.x - x, p.y - y) < (n.kind === 'boss' ? 28 : 18)) return n.id; }
    return null;
  }

  // ── 진행 ──
  go(id: string) {
    if (this.run.phase !== 'map' || !move(this.run, id)) return;
    this.after();
  }
  /** 이동·보상 뒤 다음 화면 */
  private after() {
    const run = this.run;
    if (run.phase === 'battle') return this.fight();
    this.render();
  }
  private fight() {
    const run = this.run; const foe = enemyFor(run); const n = node(run, run.at!);
    this.runRoot.hidden = true; this.battleRoot.hidden = false; this.battle.active = true;
    this.battle.encounterWith({
      me: shipDef(run), foe, seed: run.seed * 1000 + run.battles + 1, start: battleOptions(run).start,
      formations: run.formations, enemyOpts: enemyBot(foe), fixed: n.kind === 'boss' ? 'mid' : undefined,
      onEnd: (b) => { finishBattle(run, b); this.showRun(); this.render(); },
    });
  }
  private showRun() { this.battle.active = false; this.battleRoot.hidden = true; this.runRoot.hidden = false; }

  // ── 그리기 ──
  private frame(t: number) {
    if (!this.runRoot.hidden) this.draw(t);
    requestAnimationFrame((n) => this.frame(n));
  }

  private draw(t: number) {
    const c = this.ctx; const run = this.run;
    c.fillStyle = '#0d1b2e'; c.fillRect(0, 0, W, H);
    // 해도 (양피지)
    const px = 250; const py = 14; const pw = 1010; const ph = 700;
    c.fillStyle = '#e9dcc0'; c.strokeStyle = '#8b6b3e'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(px, py, pw, ph, 12); c.fill(); c.stroke();
    c.strokeStyle = '#b89a6a'; c.lineWidth = 1; c.setLineDash([2, 5]); c.strokeRect(px + 12, py + 12, pw - 24, ph - 24); c.setLineDash([]);
    c.strokeStyle = 'rgba(160,130,80,0.35)'; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = py + 60 + i * 72; const x = px + 40 + ((i * 137) % 700);
      c.beginPath(); for (let k = 0; k <= 6; k++) { const xx = x + k * 18; const yy = y + Math.sin(k * 1.4 + t / 900) * 3; k ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
    }
    // 대함대 물결 (위협)
    const tide = 20 + (run.threat / 100) * 260;
    c.fillStyle = 'rgba(178,58,42,0.45)';
    c.beginPath(); c.moveTo(px, py + ph);
    for (let x = px; x <= px + pw; x += 20) c.lineTo(x, py + ph - tide + Math.sin(x / 50 + t / 600) * 6);
    c.lineTo(px + pw, py + ph); c.closePath(); c.fill();
    c.fillStyle = '#5a1209'; c.font = '13px sans-serif'; c.textAlign = 'right';
    c.fillText(`왜 수군 대함대 — 위협 ${run.threat}`, px + pw - 20, py + ph - 10);
    // 항로
    const visitedEdge = (a: string, b: string) => { const i = run.visited.indexOf(b); return i > 0 && run.visited[i - 1] === a; };
    for (const e of run.map.edges) {
      const a = this.pos(node(run, e.from)); const b = this.pos(node(run, e.to));
      const done = visitedEdge(e.from, e.to);
      c.strokeStyle = done ? '#3a2a18' : '#7a5a30'; c.lineWidth = done ? 3.5 : 2; c.setLineDash(done ? [] : [6, 5]);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    }
    for (const e of run.map.edges) if (e.fog) {
      const a = this.pos(node(run, e.from)); const b = this.pos(node(run, e.to));
      c.fillStyle = 'rgba(250,248,240,0.75)';
      c.beginPath(); c.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, 30, 14, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#7a7a7a'; c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillText('안개', (a.x + b.x) / 2, (a.y + b.y) / 2 + 4);
    }
    // 칸
    const can = new Set(reachable(run).map((n) => n.id));
    for (const n of run.map.nodes) {
      const p = this.pos(n); const r = n.kind === 'boss' ? 28 : 17;
      const visited = run.visited.includes(n.id);
      const glow = can.has(n.id);
      c.fillStyle = n.kind === 'boss' ? '#3a2a18' : visited ? '#d8c8a0' : '#f7eedb';
      c.strokeStyle = glow ? `rgba(201,162,58,${0.6 + 0.4 * Math.sin(t / 200)})` : n.kind === 'boss' ? '#b23a2a' : '#7a5a30';
      c.lineWidth = glow ? 4 : n.kind === 'boss' ? 3 : 1.5;
      c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      if (this.hover === n.id && glow) { c.strokeStyle = '#3a2a18'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, r + 6, 0, Math.PI * 2); c.stroke(); }
      c.font = `${n.kind === 'boss' ? 24 : 16}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = visited && run.at !== n.id ? 0.45 : 1;
      if (n.kind === 'battle') { // ⚔ 글꼴이 없는 환경이 있어서 직접 그림
        c.strokeStyle = '#3a2a18'; c.lineWidth = 2.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x - 7, p.y - 7); c.lineTo(p.x + 7, p.y + 7); c.moveTo(p.x + 7, p.y - 7); c.lineTo(p.x - 7, p.y + 7); c.stroke();
        c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - 7, p.y + 2); c.lineTo(p.x - 2, p.y + 7); c.moveTo(p.x + 7, p.y + 2); c.lineTo(p.x + 2, p.y + 7); c.stroke(); c.lineCap = 'butt';
      } else c.fillText(KIND_ICON[n.kind], p.x, p.y + 1);
      c.globalAlpha = 1; c.textBaseline = 'alphabetic';
    }
    const boss = run.map.nodes.find((n) => n.kind === 'boss')!; const bp = this.pos(boss);
    c.fillStyle = '#3a2a18'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText('왜 수군 장수의 대장선', bp.x, bp.y - 38);
    // 우리 배
    const here = run.at ? this.pos(node(run, run.at)) : { x: MAP.x0 + 2 * MAP.colW, y: MAP.yBottom + 48 };
    const bob = Math.sin(t / 400) * 2;
    c.save(); c.translate(here.x + 22, here.y - 6 + bob);
    c.fillStyle = '#5a3a22'; c.beginPath(); c.moveTo(-12, 6); c.lineTo(14, 6); c.lineTo(9, 13); c.lineTo(-8, 13); c.closePath(); c.fill();
    c.strokeStyle = '#3a2a18'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -12); c.stroke();
    c.fillStyle = '#f7eedb'; c.beginPath(); c.moveTo(1, -11); c.lineTo(11, 0); c.lineTo(1, 0); c.closePath(); c.fill();
    c.restore();
    if (run.phase === 'map') {
      c.fillStyle = '#3a2a18'; c.font = '14px sans-serif'; c.textAlign = 'center';
      c.fillText(run.at ? '반짝이는 칸을 눌러 다음 항로로' : '첫 칸을 골라 출항', px + pw / 2, py + 34);
    }
  }

  private updateTip(p: { x: number; y: number }) {
    const id = this.hover; if (!id) { this.tip.hidden = true; return; }
    const run = this.run; const n = node(run, id);
    const lines = [`<b>${KIND_ICON[n.kind]} ${KIND_NAME[n.kind]}</b> · ${n.floor + 1}층`];
    const e = edgeOf(run.map, run.at, id);
    const scope = run.systems.scope ?? 0;
    if (n.kind === 'battle' || n.kind === 'elite' || n.kind === 'boss') {
      if (e?.fog) lines.push('🌫 안개 속이라 안 보임');
      else if (scope >= 1 || n.kind === 'boss') lines.push(`🔭 ${enemyFor(run, n).name}`);
      else lines.push('🔭 망원경이 없어 안 보임');
    }
    if (e?.fog) lines.push(`🌫 안개 항로: 위협 ${RUN_RULES.threatFog}`);
    else if (e) lines.push(`위협 +${RUN_RULES.threatMove}`);
    if (e) lines.push(`🍚 군량 −1${run.food === 0 ? ' (없음! 선원이 다침)' : ''}`);
    if (n.kind === 'port') lines.push(`⚓ 들르면 위협 +${RUN_RULES.threatPort} (지체)`);
    this.tip.innerHTML = lines.join('<br>'); this.tip.hidden = false;
    this.tip.style.left = `${Math.min(W - 230, p.x + 16)}px`; this.tip.style.top = `${p.y + 12}px`;
  }

  // ── 옆 패널과 창 (DOM) ──
  render() {
    const run = this.run;
    const crew = run.crew.map((c) => `<div class="rc ${c.hp <= 0 ? 'dead' : ''}">${c.name}<i style="width:${Math.max(0, c.hp)}%"></i></div>`).join('');
    const guns = run.weapons.map((w, i) => {
      const d = weaponDef(w);
      const btn = (m: SystemId | null, label: string) => `<button data-eq="${i}" data-m="${m ?? ''}" class="${w.mount === m ? 'on' : ''}">${label}</button>`;
      return `<div class="rw ${w.mount ? '' : 'stored'}"><b>${d.name}</b> <span class="pw">${'◆'.repeat(d.power)}</span>
        <small>${DIST(d.spec.at)} 특화</small><span class="eq">${btn('guns', '좌현')}${btn('gunsR', '우현')}${btn(null, '창고')}</span></div>`;
    }).join('');
    const load = (m: SystemId) => run.weapons.filter((w) => w.mount === m).reduce((n, w) => n + WEAPONS[w.id].power, 0);
    this.side.innerHTML = `
      <h3>판옥선</h3>
      <div class="rs">⛵ 선체 <b>${run.hull}</b>/${run.maxHull}</div>
      <div class="rs">🪙 금화 <b>${run.gold}</b> · 🍚 군량 <b>${run.food}</b></div>
      <div class="rs">⚠ 위협 <b>${run.threat}</b> <span class="bar"><i style="width:${run.threat}%"></i></span></div>
      <div class="rs small">마력로 ${run.reactor}칸 · 결계실 ${run.systems.ward} · 좌현 ${load('guns')}/${run.systems.guns} · 우현 ${load('gunsR')}/${run.systems.gunsR}</div>
      <h4>선원</h4>${crew}
      <h4>총통</h4>${guns}
      <h4>진법</h4><div class="small">${run.formations.map((f) => FORMATIONS[f].name).join(' · ')}</div>
      <h4>항해 기록</h4><div class="rlog">${run.log.slice(-5).map((l) => `<div>${l}</div>`).join('')}</div>`;
    this.side.querySelectorAll<HTMLButtonElement>('[data-eq]').forEach((el) => el.onclick = () => {
      const m = (el.dataset.m || null) as SystemId | null;
      if (!equip(run, Number(el.dataset.eq), m)) this.flash('그 포갑판에 자리가 없음 (마력 칸 부족)');
      this.render();
    });
    this.renderModal();
  }

  private flash(t: string) { this.run.log.push(`⚠ ${t}`); }

  private renderModal() {
    const run = this.run; const m = this.modal;
    if (run.phase === 'reward' && run.rewards) {
      const cards = run.rewards.map((r, i) => `<button class="card" data-rw="${i}">${rewardHtml(r)}</button>`).join('');
      m.innerHTML = `<div class="box"><h2>⚔ 전리품</h2><p class="small">${run.log.slice(-1)[0] ?? ''} — 하나를 고르거나 건너뛰세요.</p>
        <div class="cards">${cards}</div><button class="skip" id="skip">건너뛰기</button></div>`;
      m.hidden = false;
      m.querySelectorAll<HTMLButtonElement>('[data-rw]').forEach((el) => el.onclick = () => { takeReward(run, Number(el.dataset.rw)); this.render(); });
      m.querySelector<HTMLButtonElement>('#skip')!.onclick = () => { takeReward(run, null); this.render(); };
    } else if (run.phase === 'port') {
      const need = run.maxHull - run.hull;
      const ups = Object.keys(RUN_RULES.upgrades).map((k) => {
        const cost = upgradeCost(run, k);
        return `<button data-up="${k}" ${cost === null || run.gold < cost ? 'disabled' : ''}>${UPGRADE_NAME[k]}<small>${cost === null ? '최대' : `🪙 ${cost}`}</small></button>`;
      }).join('');
      const offers = run.offers.map((o, i) => `<button data-buy="${i}" ${o.sold || run.gold < o.price ? 'disabled' : ''}>${o.sold ? '팔림' : weaponName(o.item)}<small>${o.sold ? '' : `🪙 ${o.price} · ${DIST(weaponDef(o.item).spec.at)} 특화`}</small></button>`).join('');
      m.innerHTML = `<div class="box wide"><h2>⚓ 항구</h2><p class="small">🪙 금화 <b>${run.gold}</b> · ⛵ 선체 ${run.hull}/${run.maxHull} · 🍚 군량 ${run.food}</p>
        <div class="grid">
          <div><h4>수리</h4>
            <button id="rep5" ${need <= 0 || run.gold < 10 ? 'disabled' : ''}>선체 +5<small>🪙 ${repairCost(run, Math.min(5, need))}</small></button>
            <button id="repAll" ${need <= 0 || run.gold < 2 ? 'disabled' : ''}>전부 (+${need})<small>🪙 ${repairCost(run)}</small></button>
            <button id="heal" ${run.gold < 10 || aliveCrew(run).every((c) => c.hp >= 100) ? 'disabled' : ''}>의원: 선원 모두 회복<small>🪙 10</small></button>
            <h4>군량</h4><button id="food" ${run.gold < RUN_RULES.foodPrice ? 'disabled' : ''}>군량 +1<small>🪙 ${RUN_RULES.foodPrice}</small></button></div>
          <div><h4>총통</h4>${offers}</div>
          <div><h4>배 고치기 (등급)</h4>${ups}</div>
        </div><button class="skip" id="leave">출항</button></div>`;
      m.hidden = false;
      const on = (id: string, f: () => unknown) => { const el = m.querySelector<HTMLButtonElement>(id); if (el) el.onclick = () => { f(); this.render(); }; };
      on('#rep5', () => repair(run, 5)); on('#repAll', () => repair(run, need)); on('#heal', () => healAll(run)); on('#food', () => buyFood(run));
      on('#leave', () => leavePort(run));
      m.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((el) => el.onclick = () => { buyWeapon(run, Number(el.dataset.buy)); this.render(); });
      m.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((el) => el.onclick = () => { upgrade(run, el.dataset.up!); this.render(); });
    } else if (run.phase === 'event') {
      m.innerHTML = `<div class="box"><h2>❓ 바다 위에서</h2><p>${run.eventText}</p><p class="small">(임시 이벤트 — 이순신의 눈 대사가 들어간 이벤트는 다음 묶음)</p><button class="skip" id="ok">계속</button></div>`;
      m.hidden = false;
      m.querySelector<HTMLButtonElement>('#ok')!.onclick = () => { closeEvent(run); this.render(); };
    } else if (run.phase === 'won' || run.phase === 'lost') {
      const won = run.phase === 'won';
      const floor = run.at ? node(run, run.at).floor + 1 : 0;
      m.innerHTML = `<div class="box"><h2>${won ? '🏆 바다를 빠져나왔다!' : '💀 항해 끝'}</h2>
        <p>${won ? '왜 수군 장수의 대장선을 꺾었다. 귀환의 길이 한 걸음 가까워졌다.' : '판옥선이 이 바다를 넘지 못했다.'}</p>
        <p class="small">${floor}층까지 · 전투 ${run.battles}번 · 전투 시간 ${Math.round(run.battleTime / 60)}분 · 남은 금화 ${run.gold} · 위협 ${run.threat}</p>
        <button class="skip" id="again">새 항해</button></div>`;
      m.hidden = false;
      m.querySelector<HTMLButtonElement>('#again')!.onclick = () => this.newRun(Math.floor(Math.random() * 1e6));
    } else { m.hidden = true; }
  }
}

const DIST = (d: string) => ({ far: '원거리', mid: '중거리', near: '근접' } as Record<string, string>)[d];

function rewardHtml(r: Reward): string {
  if (r.type === 'weapon') {
    const d = weaponDef(r.item);
    return `<span class="ic">💥</span><b>${d.name}</b><small>${d.blurb}</small><small>마력 ${d.power} · ${d.shots}발 · 충전 ${d.charge}초</small><small class="spec">${DIST(d.spec.at)} 특화: ${d.spec.text}</small>`;
  }
  if (r.type === 'crew') return `<span class="ic">🧑</span><b>선원 ${r.name}</b><small>조선 수군 장졸. 배에 한 명 더.</small>`;
  if (r.type === 'book') return `<span class="ic">📜</span><b>병서: ${FORMATIONS[r.formation].name}</b><small>${FORMATIONS[r.formation].effect}</small><small>역사: ${FORMATIONS[r.formation].history}</small>`;
  return `<span class="ic">🔨</span><b>선체 수리 +${r.hull}</b><small>부서진 판재를 갈아 끼움</small>`;
}
