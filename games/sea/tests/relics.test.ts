import { describe, expect, it } from 'vitest';
import { Battle, type ShipMods } from '../src/sim/battle';
import { PANOKSEON, RULES, WAESEON, WEAPONS } from '../src/sim/data';
import { LIVE_RELICS, modsOf, RELICS } from '../src/run/relics';
import { battleOptions, finishBattle, gainRelic, move, newRun, reachable, rollRewards, shipDef, enemyFor } from '../src/run/run';

const run = (b: Battle, sec: number) => { for (let t = 0; t < sec; t += RULES.dt) b.step(); };
const withMods = (m: ShipMods, d: 'far' | 'mid' | 'near' = 'mid') => new Battle(PANOKSEON, WAESEON, d, { seed: 1, mods: [m, undefined] });
const calm = (b: Battle) => { for (const s of b.ships) for (const c of s.crew) c.room = s.side === 0 ? 'empty1' : 'deck'; };

describe('유물 목록', () => {
  it('50개, 번호·id가 겹치지 않고, 보스 유물은 대가가 있음', () => {
    expect(RELICS.length).toBe(50);
    expect(new Set(RELICS.map((r) => r.id)).size).toBe(50);
    expect(RELICS.map((r) => r.no).sort((a, b) => a - b).join(',')).toBe(Array.from({ length: 50 }, (_, i) => i + 1).join(','));
    for (const r of RELICS.filter((x) => x.tier === 'boss')) expect(!!r.cost).toBe(true);
  });
  it('지금 효과가 들어간 유물은 10개, 아직 없는 시스템이 필요한 유물은 live가 아님', () => {
    expect(LIVE_RELICS.length).toBe(10);
    for (const r of RELICS) if (r.needs) expect(!!r.live).toBe(false);
  });
});

describe('유물 효과 (전투)', () => {
  it('염초 상자: 총통이 30% 충전된 채로 시작', () => {
    const b = withMods(modsOf(['saltpeter']));
    for (const w of b.ships[0].weapons) expect(w.charge).toBeCloseTo(w.def.charge * 0.3, 5);
  });
  it('화승 다발: 충전 8% 빠름', () => {
    const plain = withMods({}); const fast = withMods(modsOf(['matchCord']));
    for (const b of [plain, fast]) { calm(b); b.toggleWeapon(0, 0, true); run(b, 5); }
    expect(fast.ships[0].weapons[0].charge / plain.ships[0].weapons[0].charge).toBeCloseTo(1.08, 1);
  });
  it('엘프 별자리 망원경: 원거리에서 적 회피 −15%p, 첫 일제 사격은 피해 2배', () => {
    const plain = withMods({}, 'far'); const scope = withMods(modsOf(['elfScope']), 'far');
    for (const b of [plain, scope]) { b.setPower(1, 'helm', 1); b.setPower(1, 'oars', 3); b.step(); }
    expect(scope.hitChance(0, WEAPONS.jija)).toBeGreaterThan(plain.hitChance(0, WEAPONS.jija));
    const b = withMods(modsOf(['elfScope']), 'far'); calm(b);
    b.toggleWeapon(0, 0, true); b.setTarget(0, 0, 'deck');
    run(b, WEAPONS.jija.charge + 0.3);
    expect(b.projectiles[0].mul).toBe(2);
  });
  it('송진 통: 구멍을 더 빨리 막음', () => {
    const t = (m: ShipMods) => {
      const b = withMods(m); const s = b.ships[0]; b.room(s, 'helm').breach = true;
      let k = 0; while (b.room(s, 'helm').breach && k++ < 200) b.step(); return k;
    };
    expect(t(modsOf(['resin']))).toBeLessThan(t({}) * 0.75);
  });
  it('거북 등껍질 판: 맞을수록 결계 재충전이 빨라짐 (최대 +100%)', () => {
    const b = new Battle(WAESEON, PANOKSEON, 'far', { seed: 1, mods: [undefined, modsOf(['turtleShell'])] });
    const T = b.ships[1]; T.crew.forEach((c) => { c.room = 'medic'; });
    for (let i = 0; i < 12; i++) { b.projectiles.push({ from: 0, weapon: { ...WEAPONS.hwangja, acc: 1 }, target: 'empty1', t: 0, total: 0.05 }); b.step(); }
    expect(T.wardBonus).toBe(1);
  });
  it('소화 모래: 불을 2배 빨리 끔', () => {
    const t = (m: ShipMods) => {
      const b = withMods(m); const s = b.ships[0]; b.room(s, 'helm').fire = 1;
      let k = 0; while (b.room(s, 'helm').fire > 0 && k++ < 300) b.step(); return k;
    };
    expect(t(modsOf(['sand']))).toBeLessThan(t({}) * 0.7);
  });
  it('어인의 물항아리: 배에 물이 찰수록 충전이 빠름', () => {
    const dry = withMods(modsOf(['waterJar'])); const wet = withMods(modsOf(['waterJar']));
    wet.room(wet.ships[0], 'oars').water = 3; // 4칸짜리 방 75%
    for (const b of [dry, wet]) { calm(b); b.toggleWeapon(0, 0, true); b.step(); }
    expect(wet.ships[0].weapons[0].charge).toBeGreaterThan(dry.ships[0].weapons[0].charge * 1.05);
  });
  it('오행 부채: 진법을 바꾸면 3초 동안 충전 2배', () => {
    const b = withMods(modsOf(['fan'])); calm(b); b.toggleWeapon(0, 0, true);
    b.step(); const c0 = b.ships[0].weapons[0].charge;
    b.setFormation(0, 'jangsa'); b.step();
    expect(b.ships[0].burst).toBeGreaterThan(2.5);
    expect(b.ships[0].weapons[0].charge - c0).toBeGreaterThan(RULES.dt * 1.5);
  });
});

describe('유물 효과 (항해)', () => {
  it('엽전 꾸러미: 전투 금화 +5', () => {
    const gold = (relics: string[]) => {
      const r = newRun(9); r.relics = relics; move(r, reachable(r)[0].id);
      const b = new Battle(shipDef(r), enemyFor(r), 'mid', { seed: 1, ...battleOptions(r) });
      b.result = { winner: 0, reason: 'hull' }; finishBattle(r, b); return r.gold;
    };
    expect(gold(['coins']) - gold([])).toBe(5);
  });
  it('왜 수군 암호문: 얻는 순간 위협 +10', () => {
    const r = newRun(1); gainRelic(r, 'cipher');
    expect(r.threat).toBe(10); expect(r.relics.includes('cipher')).toBe(true);
  });
  it('정예·보물 전리품에는 유물이 하나 있음', () => {
    for (let s = 1; s <= 10; s++) {
      const r = newRun(s);
      expect(rollRewards(r, 'elite').some((x) => x.type === 'relic')).toBe(true);
      expect(rollRewards(r, 'treasure').some((x) => x.type === 'relic')).toBe(true);
    }
  });
});
