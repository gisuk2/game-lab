import { ECONOMY, actionById, type ActionId } from '../economy/content';
import type { Estate } from '../economy/Estate';

/** 집사 수첩 '위험 알림': 지금 영지에서 조심할 것 (계획을 반영한 미리보기 영지로 계산) */
export interface Danger {
  level: 'high' | 'warn' | 'info';
  text: string;
}

export function dangers(e: Estate): Danger[] {
  const out: Danger[] = [];
  const dl = e.nextDeadline;
  if (dl && e.gold > dl.cap) {
    const left = dl.week - e.week;
    out.push({
      level: left <= 1 ? 'high' : 'warn',
      text: `${dl.week}주차 왕실 보고까지 금고를 ${(e.gold - dl.cap).toLocaleString()} 더 줄여야 함 (${left <= 0 ? '이번 주가 마감' : `${left}주 남음`})`,
    });
  }
  const weeksLeft = ECONOMY.weeks - e.week;
  if (!dl && e.gold > 0) out.push({ level: weeksLeft <= 1 ? 'high' : 'warn', text: `마지막 감찰까지 ${weeksLeft + 1}주. 금고에 아직 ${e.gold.toLocaleString()}` });
  if (e.royalAttention > 0) out.push({ level: e.royalAttention >= ECONOMY.royalAttentionLimit - 1 ? 'high' : 'warn', text: `왕실 관심 ${e.royalAttention}/${ECONOMY.royalAttentionLimit}: 한 번 더 넘기면 왕도로 소환` });
  const sus = e.suspicion / ECONOMY.suspicionLimit;
  if (sus >= 0.6) out.push({ level: sus >= 0.8 ? 'high' : 'warn', text: `감찰관의 의심 ${Math.round(e.suspicion)}/${ECONOMY.suspicionLimit}: 끝까지 차면 태만죄` });
  const pros = e.prosperity / ECONOMY.prosperityLimit;
  if (pros >= 0.6) out.push({ level: pros >= 0.8 ? 'high' : 'warn', text: `영지 번영도 ${Math.round(e.prosperity)}/${ECONOMY.prosperityLimit}: 끝까지 차면 왕도행` });
  for (const [id, n] of Object.entries(e.uses) as [ActionId, number][]) {
    const a = actionById(id);
    if (n >= 2 && !a.maxUses && a.kind !== '세탁') out.push({ level: 'info', text: `'${a.name}'을(를) ${n}번 했음: 또 하면 의심이 ${ECONOMY.repeatSuspicion * n} 더 붙음` });
  }
  for (const [id, n] of Object.entries(e.learned) as [ActionId, number][]) {
    const a = actionById(id);
    if (a.maxUses && (e.uses[id] ?? 0) >= a.maxUses) continue; // 더 못 하는 서류는 경고할 필요 없음
    if (n >= 1 && a.cost > 0) out.push({ level: 'info', text: `집사가 '${actionById(id).name}'을(를) 배웠음: 다음에 하면 집사가 몰래 돈을 불려 둠 (비서 휴가로 잊게 할 수 있음)` });
  }
  const pending = e.pendingReturns;
  if (pending > 0) out.push({ level: 'info', text: `앞으로 들어올 돈 약 +${pending.toLocaleString()} (지난 결재들의 여파)` });
  const order = { high: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
