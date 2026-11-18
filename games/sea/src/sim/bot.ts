// 전투 봇: 밸런스 시험(봇끼리 대결)과 적 왜선 조종에 같이 쓴다.
import type { SystemId } from './data';
import type { Battle, Crew, Ship, Side } from './battle';

export interface BotOptions {
  /** 모든 총통이 충전될 때까지 기다렸다 한꺼번에 쏨 */
  volley?: boolean;
  /** 위험(불·구멍·고장)에 선원을 보냄 */
  repairs?: boolean;
  /** 마력 우선순위 */
  powerOrder?: SystemId[];
}

const DEFAULT_ORDER: SystemId[] = ['ward', 'helm', 'oars', 'pump', 'medic', 'scope', 'doors'];
const STATIONS: SystemId[] = ['helm', 'guns', 'oars', 'ward'];

export function botThink(b: Battle, side: Side, o: BotOptions = {}): void {
  const s = b.ships[side]; const enemy = b.ships[side === 0 ? 1 : 0];
  // 1) 마력: 결계를 먼저 1겹, 총통, 나머지
  let order = o.powerOrder ?? DEFAULT_ORDER;
  const flooding = s.rooms.some((r) => r.water / r.w > 0.25);
  if (flooding) order = ['pump', ...order.filter((k) => k !== 'pump')];
  for (const k of Object.keys(s.sys) as SystemId[]) if (k !== 'guns') b.setPower(side, k, 0);
  if (s.sys.ward) b.setPower(side, 'ward', 2);
  if (flooding) b.setPower(side, 'pump', 99);
  s.weapons.forEach((_, i) => b.toggleWeapon(side, i, true));
  for (const k of order) {
    const need = k === 'pump' ? (s.rooms.some((r) => r.water > 0.05) ? 99 : 1) : k === 'medic' ? (s.crew.some((c) => c.alive && c.hp < c.maxHp * 0.7) ? 99 : 0) : 99;
    b.setPower(side, k, need);
  }
  // 2) 조준: 적 결계가 살아 있으면 결계실, 아니면 포갑판
  const wardRoom = b.roomOf(enemy, 'ward'); const gunRoom = b.roomOf(enemy, 'guns');
  const tgt = (b.maxPower(enemy, 'ward') >= 2 && wardRoom ? wardRoom : gunRoom ?? enemy.rooms[0]).id;
  const powered = s.weapons.filter((w) => w.powered);
  const ready = powered.length > 0 && powered.every((w) => w.charge >= w.def.charge - 0.05);
  if (!o.volley) s.weapons.forEach((_, i) => b.setTarget(side, i, tgt));
  else if (!ready) s.weapons.forEach((_, i) => b.setTarget(side, i, null));
  else {
    // 일제 사격: 가벼운 총통이 먼저 결계를 벗기고, 무거운 총통은 다음 생각 때 쏨
    const minDmg = Math.min(...powered.map((w) => w.def.dmg));
    s.weapons.forEach((w, i) => b.setTarget(side, i, w.def.dmg === minDmg ? tgt : null));
  }
  if (o.volley && powered.some((w) => w.charge < w.def.charge * 0.3) && powered.some((w) => w.charge >= w.def.charge - 0.05))
    s.weapons.forEach((w, i) => { if (w.charge >= w.def.charge - 0.05) b.setTarget(side, i, tgt); });
  // 3) 선원
  if (o.repairs !== false) crewThink(b, s);
}

function crewThink(b: Battle, s: Ship) {
  const alive = s.crew.filter((c) => c.alive);
  const dest = (c: Crew) => (c.path.length ? c.path[c.path.length - 1] : c.room);
  const station = (i: number) => b.roomOf(s, STATIONS[i % STATIONS.length])?.id ?? s.rooms[0].id;
  // 위험한 방 (불 > 구멍 > 고장), 물에 잠긴 방은 피함
  const hazards = s.rooms
    .filter((r) => r.water / r.w < 0.6 && (r.fire > 0 || r.breach || (r.sys && (s.sys[r.sys]?.damage ?? 0) > 0)))
    .sort((a, b2) => (b2.fire > 0 ? 3 : b2.breach ? 2 : 1) - (a.fire > 0 ? 3 : a.breach ? 2 : 1));
  const medic = b.roomOf(s, 'medic');
  const taken = new Set<string>();
  alive.forEach((c, i) => {
    if (medic && b.eff(s, 'medic') > 0 && c.hp < c.maxHp * 0.35) { if (dest(c) !== medic.id) b.moveCrew(s.side, c.id, medic.id); return; }
    if (medic && dest(c) === medic.id && c.hp < c.maxHp * 0.95 && b.eff(s, 'medic') > 0) return;
    // 장대 지키는 선원(0번)은 남겨 둠, 나머지가 위험 처리
    const h = i === 0 && alive.length > 1 ? undefined : hazards.find((r) => !taken.has(r.id));
    if (h) { taken.add(h.id); if (dest(c) !== h.id) b.moveCrew(s.side, c.id, h.id); return; }
    const st = station(i);
    if (dest(c) !== st) b.moveCrew(s.side, c.id, st);
  });
}

/** 봇끼리 한 판을 끝까지 돌림 */
export function runBotBattle(b: Battle, opts: [BotOptions, BotOptions], maxT = 600): Battle {
  let think = 0;
  while (!b.result && b.t < maxT) {
    if (b.t >= think) { botThink(b, 0, opts[0]); botThink(b, 1, opts[1]); think = b.t + 0.5; }
    b.step();
  }
  return b;
}
