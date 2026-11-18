// 전략별 결과 비교: npx tsx games/estate/scripts/sim-economy.ts [--trace]
import { ACTIONS } from '../src/economy/content';
import { idle, mostExpensive, obviousWaste, planner, play, random, spamParty, thoughtful, type Strategy } from '../src/economy/strategies';

const rows: [string, Strategy, number][] = [
  ['아무것도 안 함', idle, 1],
  ['가장 비싼 것만', mostExpensive, 1],
  ['술 파티만 반복', spamParty, 1],
  ['대놓고 낭비', obviousWaste, 1],
  ['무작위 (300판)', random, 300],
  ['한 장씩 계산', thoughtful, 1],
  ['내다보기', planner, 1],
];
for (const [name, s, n] of rows) {
  const counts: Record<string, number> = {};
  let last = play(s, 1);
  for (let i = 1; i <= n; i++) {
    last = play(s, i);
    counts[last.status] = (counts[last.status] ?? 0) + 1;
  }
  const dist = Object.entries(counts).map(([k, v]) => `${k} ${Math.round((v / n) * 100)}%`).join(', ');
  console.log(`${name.padEnd(12)} | ${dist.padEnd(38)} | ${last.week}주, 금고 ${last.gold}, 의심 ${last.suspicion}, 번영 ${last.prosperity}, 왕실 ${last.royalAttention}`);
}
for (const [name, s] of [['한 장씩 계산', thoughtful], ['내다보기', planner]] as const) {
  const r = play(s, 1);
  const kinds: Record<string, number> = {};
  for (const id of r.picks.flat()) { const k = ACTIONS.find((a) => a.id === id)!.kind; kinds[k] = (kinds[k] ?? 0) + 1; }
  console.log(`  ${name} 유형별 사용: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
if (process.argv.includes('--trace')) {
  const r = play(planner, 1);
  r.picks.forEach((p, i) => console.log(`${i + 1}주: ${p.join(', ') || '(쉼)'}`));
}
