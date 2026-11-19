// 봇 대결 시뮬레이터 (SEA-1): npx tsx games/sea/scripts/sim-battle.ts [판 수]
// 1) 판옥선끼리: 총통 조합 공정성  2) 판옥선 vs 왜선: 거리 × 진법  3) 정찰 판정을 거친 실제 조우
import { Battle, Rng } from '../src/sim/battle';
import { DISTANCE_NAME, FORMATIONS, PANOKSEON, WAESEON, WEAPONS, type Distance, type FormationId, type ShipDef } from '../src/sim/data';
import { runBotBattle, SKILL } from '../src/sim/bot';
import { rollScout } from '../src/sim/encounter';

const N = Number(process.argv[2] ?? 300);
const pct = (x: number) => `${Math.round(x * 100)}%`;
// 조합 비교용: 총통을 모두 좌현 포갑판(3칸)에 담
const withGuns = (ids: string[]): ShipDef => ({ ...PANOKSEON, systems: { ...PANOKSEON.systems, guns: 3, gunsR: 0 }, weapons: ids.map((id) => ({ id, mount: 'guns' as const })) });
const gunsName = (ids: string[]) => ids.map((i) => WEAPONS[i].name.replace('총통', '')).join('+');

interface Stat { win: number; t: number; hull: number; timeout: number }
function play(a: ShipDef, b: ShipDef, d: Distance, f: FormationId | null, n: number, seed0 = 1): Stat {
  const st: Stat = { win: 0, t: 0, hull: 0, timeout: 0 };
  for (let i = 0; i < n; i++) {
    const bt = runBotBattle(new Battle(a, b, d, { seed: seed0 + i, formation: [f, null] }), [{ volley: true }, { volley: b.id === 'panokseon' }]);
    if (!bt.result) st.timeout++;
    else if (bt.result.winner === 0) { st.win++; st.hull += bt.ships[0].hull / bt.ships[0].maxHull; }
    st.t += bt.t;
  }
  return st;
}

console.log(`# SEA-1 봇 대결 (${N}판씩)\n`);

console.log('## 1. 판옥선끼리 — 총통 조합 (중거리, 진법 없음)\n');
const loadouts = [['jija', 'hwangja'], ['hyeonja', 'hwangja'], ['cheonja'], ['hwangja', 'hwangja', 'hwangja']];
console.log('| 왼쪽 \\ 오른쪽 | ' + loadouts.map(gunsName).join(' | ') + ' |');
console.log('|---|' + loadouts.map(() => '---').join('|') + '|');
for (const a of loadouts) {
  const row = loadouts.map((b) => { const s = play(withGuns(a), withGuns(b), 'mid', null, N); return pct(s.win / N) + (s.timeout ? ` (무승부 ${s.timeout})` : ''); });
  console.log(`| ${gunsName(a)} | ${row.join(' | ')} |`);
}

console.log('\n## 2. 판옥선(지자+황자) vs 왜선 — 거리 × 진법\n');
console.log('| 거리 | 진법 | 승률 | 평균 전투 시간 | 이겼을 때 남은 선체 | 무승부 |');
console.log('|---|---|---|---|---|---|');
for (const d of ['far', 'mid', 'near'] as Distance[]) for (const f of [null, 'hakik', 'jangsa'] as (FormationId | null)[]) {
  const s = play(PANOKSEON, WAESEON, d, f, N);
  console.log(`| ${DISTANCE_NAME[d]} | ${f ? FORMATIONS[f].name : '없음'} | ${pct(s.win / N)} | ${Math.round(s.t / N)}초 | ${s.win ? pct(s.hull / s.win) : '-'} | ${s.timeout} |`);
}

console.log('\n## 3. 실제 조우 — 정찰 판정 후 (성공하면 원거리 고름, 학익진)\n');
console.log('| 망원경 | 정찰 성공률 | 승률 | 원거리·중거리·근접 비율 |');
console.log('|---|---|---|---|');
for (const scope of [0, 1, 2]) {
  const rng = new Rng(99); const cnt: Record<Distance, number> = { far: 0, mid: 0, near: 0 }; let win = 0; let ok = 0;
  for (let i = 0; i < N; i++) {
    const r = rollScout(rng, WAESEON, { scope });
    if (r.success) ok++;
    const d = r.forced ?? 'far'; cnt[d]++;
    const bt = runBotBattle(new Battle(PANOKSEON, WAESEON, d, { seed: 5000 + i, formation: ['hakik', null] }), [{ volley: true }, {}]);
    if (bt.result?.winner === 0) win++;
  }
  console.log(`| ${scope}등급 | ${pct(ok / N)} | ${pct(win / N)} | ${pct(cnt.far / N)} · ${pct(cnt.mid / N)} · ${pct(cnt.near / N)} |`);
}

console.log('\n## 4. 봇 실력 3단계 — 컨트롤이 얼마나 중요한가 (판옥선 vs 왜선, 진법 없음)\n');
console.log('| 실력 | 원거리 | 중거리 | 근접 |');
console.log('|---|---|---|---|');
for (const k of ['idle', 'novice', 'expert'] as const) {
  const row = (['far', 'mid', 'near'] as Distance[]).map((d) => {
    let w = 0;
    for (let i = 0; i < N; i++) if (runBotBattle(new Battle(PANOKSEON, WAESEON, d, { seed: 9000 + i }), [SKILL[k], {}]).result?.winner === 0) w++;
    return pct(w / N);
  });
  console.log(`| ${{ idle: '손 놓음', novice: '초보', expert: '숙련' }[k]} | ${row.join(' | ')} |`);
}
