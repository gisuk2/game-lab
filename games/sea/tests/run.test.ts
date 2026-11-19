import { describe, expect, it } from 'vitest';
import { Battle } from '../src/sim/battle';
import { allPaths, everyPathHasPort, generateMap, MAP_RULES } from '../src/run/map';
import {
  buyFood, buyWeapon, canMount, closeEvent, enemyFor, equip, finishBattle, leavePort, move, newRun, node, reachable,
  repair, RUN_RULES, shipDef, takeReward, upgrade, battleOptions, type RunState,
} from '../src/run/run';
import { scaleEnemy, WAE_MUSKET } from '../src/run/enemies';
import { playRun } from '../src/run/runbot';

const PANOKSEON_HULL = newRun(1).maxHull;
const seeds = Array.from({ length: 30 }, (_, i) => i + 1);

describe('지도: 슬더스식 갈림길', () => {
  it('모든 길이 보스까지 이어지고, 같은 시드면 같은 지도', () => {
    for (const s of seeds) {
      const m = generateMap(s);
      const boss = m.nodes.filter((n) => n.kind === 'boss');
      expect(boss.length).toBe(1);
      for (const n of m.nodes) if (n.kind !== 'boss') expect(n.next.length > 0).toBe(true);
      for (const p of allPaths(m)) expect(p.length).toBe(MAP_RULES.floors);
    }
    expect(JSON.stringify(generateMap(7))).toBe(JSON.stringify(generateMap(7)));
  });
  it('같은 층 사이 길이 서로 엇갈리지 않음', () => {
    for (const s of seeds) {
      const m = generateMap(s); const col = new Map(m.nodes.map((n) => [n.id, n]));
      const es = m.edges.map((e) => [col.get(e.from)!, col.get(e.to)!] as const);
      for (const [a1, b1] of es) for (const [a2, b2] of es) {
        if (a1.floor !== a2.floor || b1.kind === 'boss') continue;
        const cross = (a1.col < a2.col && b1.col > b2.col) || (a1.col > a2.col && b1.col < b2.col);
        expect(cross).toBe(false);
      }
    }
  });
  it('고정 층: 1층 전투, 중간 보물, 보스 앞 항구 — 어느 길이든 중간에 항구가 있음', () => {
    for (const s of seeds) {
      const m = generateMap(s);
      for (const n of m.nodes) {
        if (n.floor === 0) expect(n.kind).toBe('battle');
        if (n.floor === MAP_RULES.treasureFloor) expect(n.kind).toBe('treasure');
        if (n.floor === MAP_RULES.portFloor) expect(n.kind).toBe('port');
        if (n.floor < MAP_RULES.eliteFrom) expect(n.kind === 'elite').toBe(false);
      }
      expect(everyPathHasPort(m)).toBe(true);
    }
  });
  it('칸 비율: 한 길에서 전투 3~6 · 정예 0~2 · 항구 1~3 · 보물 1 (30개 지도 평균)', () => {
    let battle = 0; let port = 0; let n = 0;
    for (const s of seeds) for (const p of allPaths(generateMap(s)).slice(0, 5)) {
      const m = generateMap(s); const kinds = p.map((id) => m.nodes.find((x) => x.id === id)!.kind);
      battle += kinds.filter((k) => k === 'battle').length; port += kinds.filter((k) => k === 'port').length; n++;
      expect(kinds.filter((k) => k === 'treasure').length).toBe(1);
    }
    expect(battle / n).toBeGreaterThanOrEqual(3); expect(battle / n).toBeLessThanOrEqual(6);
    expect(port / n).toBeGreaterThanOrEqual(1); expect(port / n).toBeLessThanOrEqual(3);
  });
  it('안개 항로가 섞여 있음', () => {
    const fog = seeds.reduce((k, s) => k + generateMap(s).edges.filter((e) => e.fog).length, 0);
    expect(fog).toBeGreaterThan(30);
  });
});

/** 첫 칸(전투)으로 가서 이긴 것으로 침 */
function winFirst(run: RunState) {
  move(run, reachable(run)[0].id);
  const b = new Battle(shipDef(run), enemyFor(run), 'mid', { seed: 1, ...battleOptions(run) });
  b.ships[0].hull = run.hull - 3; b.ships[0].crew[0].hp = 40;
  b.result = { winner: 0, reason: 'hull' };
  finishBattle(run, b);
}

describe('항해: 군량·위협·상태 이어 가기', () => {
  it('이동하면 군량 −1, 위협 +; 안개 항로는 위협이 내려감', () => {
    const run = newRun(3);
    move(run, reachable(run)[0].id);
    expect(run.food).toBe(RUN_RULES.startFood - 1);
    expect(run.threat).toBe(RUN_RULES.threatMove);
    // 안개 간선을 찾아 그 시작점에서 출발
    const e = run.map.edges.find((x) => x.fog)!;
    run.phase = 'map'; run.at = e.from; run.threat = 50;
    move(run, e.to);
    expect(run.threat).toBe(50 + RUN_RULES.threatFog);
  });
  it('군량이 없으면 이동할 때마다 선원이 다침', () => {
    const run = newRun(3); run.food = 0;
    move(run, reachable(run)[0].id);
    expect(run.crew[0].hp).toBe(100 - RUN_RULES.starveDmg);
  });
  it('전투 결과(선체·선원 피)가 이어지고 다음 전투에 그대로 들어감', () => {
    const run = newRun(4); winFirst(run);
    expect(run.hull).toBe(PANOKSEON_HULL - 3);
    expect(run.crew[0].hp).toBe(40);
    expect(run.phase).toBe('reward');
    takeReward(run, null);
    const b = new Battle(shipDef(run), enemyFor(run, node(run, run.at!)), 'mid', battleOptions(run));
    expect(b.ships[0].hull).toBe(run.hull);
    expect(b.ships[0].crew[0].hp).toBe(40);
  });
  it('전투에서 지면 항해 끝', () => {
    const run = newRun(4); move(run, reachable(run)[0].id);
    const b = new Battle(shipDef(run), enemyFor(run), 'mid', { seed: 1 });
    b.result = { winner: 1, reason: 'hull' }; b.ships[0].hull = 0;
    finishBattle(run, b);
    expect(run.phase).toBe('lost');
  });
  it('위협이 높으면 적이 셈', () => {
    expect(scaleEnemy(WAE_MUSKET, 80).hull).toBeGreaterThan(scaleEnemy(WAE_MUSKET, 0).hull);
    expect(scaleEnemy(WAE_MUSKET, 80).crew.length).toBeGreaterThan(WAE_MUSKET.crew.length);
  });
});


describe('보상: 셋 중 하나 또는 건너뛰기', () => {
  it('전투에서 이기면 금화를 받고 보상 3개가 뜸', () => {
    const run = newRun(5); const g = run.gold; winFirst(run);
    expect(run.gold).toBeGreaterThan(g);
    expect(run.rewards!.length).toBe(3);
  });
  it('건너뛰면 아무것도 안 바뀌고 지도로', () => {
    const run = newRun(5); winFirst(run); const w = run.weapons.length;
    takeReward(run, null);
    expect(run.weapons.length).toBe(w); expect(run.phase).toBe('map');
  });
  it('총통 보상은 빈 칸이 없으면 창고로', () => {
    const run = newRun(6); winFirst(run);
    run.rewards = [{ type: 'weapon', item: { id: 'cheonja', tier: 0, mount: null } }];
    takeReward(run, 0);
    expect(run.weapons[run.weapons.length - 1].mount).toBe(null);
  });
});

describe('총통 칸과 항구', () => {
  it('포갑판 등급보다 많은 총통은 못 닮', () => {
    const run = newRun(1);
    run.weapons.push({ id: 'jija', tier: 0, mount: null });
    expect(canMount(run, 2, 'guns')).toBe(false); // 좌현 2칸에 지자(2)가 이미 있음
    expect(equip(run, 0, null)).toBe(true);
    expect(equip(run, 2, 'guns')).toBe(true);
    expect(shipDef(run).weapons.length).toBe(2);
  });
  it('항구: 수리·군량·총통·등급 올리기, 돈이 모자라면 안 됨', () => {
    const run = newRun(1); run.phase = 'port'; run.gold = 100; run.hull = 20;
    run.offers = [{ item: { id: 'hwangja', tier: 0, mount: null }, price: 35, sold: false }];
    expect(repair(run, 5)).toBe(true); expect(run.hull).toBe(25); expect(run.gold).toBe(90);
    expect(buyFood(run, 2)).toBe(true); expect(run.food).toBe(RUN_RULES.startFood + 2);
    expect(buyWeapon(run, 0)).toBe(true); expect(buyWeapon(run, 0)).toBe(false);
    expect(upgrade(run, 'ward')).toBe(false); // 49 < 60
    run.gold = 60; expect(upgrade(run, 'ward')).toBe(true); expect(run.systems.ward).toBe(4);
    leavePort(run); expect(run.phase).toBe('map');
  });
  it('이벤트는 결과를 적용하고 닫으면 지도로', () => {
    const run = newRun(2); run.phase = 'event'; run.eventText = 'x';
    closeEvent(run); expect(run.phase).toBe('map');
  });
});

describe('봇이 한 바다를 끝까지 항해 (실력별 완주율)', () => {
  it('손 놓은 봇은 못 깨고, 숙련 봇은 대부분 깨고, 초보는 그 사이', () => {
    const rate = (k: 'idle' | 'novice' | 'expert') => seeds.slice(0, 20).filter((s) => playRun(s, k).won).length;
    const idle = rate('idle'); const novice = rate('novice'); const expert = rate('expert');
    expect(idle).toBe(0);
    expect(expert).toBeGreaterThanOrEqual(11);
    expect(novice).toBeLessThan(expert);
  });
});
