import { ECONOMY, districtOf, type ActionDef, type ActionId, type GaugeId } from '../economy/content';
import type { WeekReport } from '../economy/Estate';

/**
 * 결재 서류(카드)의 글: 누가 올렸나, 집사의 한마디, 숨은 효과.
 * 숨은 효과(❓)는 겪어 보면 풀린다 (discover). 단서 캐릭터로 미리 푸는 건 B단계.
 */
export interface CardText {
  /** 서류를 올린 사람 */
  from: string;
  /** 올린 사람의 한마디 */
  request: string;
  /** 집사의 한마디 (겉으로 보이는 뜻) */
  butler: string;
  /** 숨은 효과 (풀렸을 때 보이는 글). 없으면 숨은 효과 없음 */
  hidden?: string;
}

export const CARD_TEXT: Record<ActionId, CardText> = {
  banquet: { from: '이웃 영지 남작들', request: '영주님 취임 축하연은 언제 여시나요? 저희 빈손으로는 안 갑니다!', butler: '연회는 귀족의 의무지요. 손님들께서 늘 무언가를 들고 오시긴 합니다만.', hidden: '손님들이 답례품을 두고 간다. 사치 수치가 높을수록 더 비싼 것을.' },
  artCollection: { from: '떠돌이 화상', request: '이 그림, 지금은 헐값이지만… 아, 아닙니다. 그냥 헐값입니다.', butler: '예술을 아시는군요! 걸어만 두셔도 품격이 오릅니다.', hidden: '2주 뒤부터 그림값이 올라, 3주 동안 조금씩 되팔린다.' },
  renovate: { from: '저택 목수', request: '방을 하나 더 내면… 아무도 안 쓰겠지만 멋질 겁니다.', butler: '쓸 일 없는 방이 늘겠습니다. 매주 관리비도 늘겠군요.' },
  chef: { from: '요리사 지망생', request: '매주 넉넉히만 주시면 도련님 입맛을 책임지겠습니다!', butler: '전속 요리사라니, 품위 있는 선택이십니다.', hidden: '요리사가 남는 시간에 주점에 레시피를 판다. 4주 동안 수입.' },
  boldWaste: { from: '저택 서기', request: '이… 이건 그냥 금화를 창밖으로 던지는 건데요?', butler: '아무 말도 듣지 못한 것으로 하겠습니다. 다만 감찰관의 귀는 밝습니다.' },
  secretaryLeave: { from: '저택 서기', request: '한 주만 쉬고 오겠습니다. 장부는 집사님께 맡겨 두겠습니다.', butler: '평범한 휴가 신청입니다. 서기가 없으면 저도 도련님 뜻을 처음부터 다시 헤아려야겠지요.' },
  birthdayWeek: { from: '저택 하인 일동', request: '도련님 생신 잔치를 일주일 내내요? …저희도 먹어도 되나요?', butler: '일주일 연회라니, 전설로 남겠습니다.', hidden: '하객들의 선물이 쏟아진다.' },
  party: { from: '주점 주인', request: '공짜 술이요? 하하, 사람들이 줄을 서겠군요!', butler: '영지민들이 좋아하겠습니다. 소문도 잘 나겠지요.', hidden: '공짜 술 소문이 던전까지 퍼져, 2주 동안 모험가가 늘어난다. 흥 수치가 높을수록 더.' },
  bard: { from: '떠돌이 음유시인', request: '영주님을 노래하겠습니다. 가사는… 지어내겠습니다.', butler: '노래는 멀리 퍼지는 법이지요.', hidden: '영지 노래가 퍼져 던전 명성이 오른다 (던전 입장료 증가).' },
  forgiveTabs: { from: '주점 단골들', request: '영주님, 외상값 좀… 없던 일로…?', butler: '자비로운 결정이 되겠습니다. 영지민들이 칭송하겠지요.' },
  debtFeast: { from: '수상한 대부업자', request: '금고가 비셨다고요? 걱정 마십쇼, 얼마든지 빌려드립니다.', butler: '빚까지 내시다니… 도련님의 배포에 경의를 표합니다.' },
  duelTourney: { from: '주점 주인', request: '상금만 크면 전국의 싸움꾼이 몰려옵니다!', butler: '구경꾼도 꽤 모이겠습니다.', hidden: '구경꾼들이 던전까지 흘러든다.' },
  fountain: { from: '던전 관리인', request: '모험가들이 쉬어 갈 곳이 필요합니다.', butler: '던전 운영에는 쓸모없는 시설입니다.', hidden: '모험가들이 분수 옆에서 쉬어 가며 더 오래 머문다. 3주 동안 수입.' },
  freeEntry: { from: '던전 관리인', request: '입장료를 안 받으면… 손님이 좀 늘겠죠?', butler: '2주 동안 입장료 수입이 없겠습니다.', hidden: '공짜였다는 소문 덕에, 입장료를 다시 받기 시작하면 손님이 더 몰린다.' },
  warningSigns: { from: '던전 관리인', request: "'여기서 죽을 수 있음'… 이렇게 써 붙일까요?", butler: '모험가들이 겁을 먹겠군요. 성실한 영주가 할 일인지는…', hidden: '모험가가 줄고, 이번 주와 다음 주 홍보 효과가 거의 사라진다.' },
  railings: { from: '안전 감독관', request: '추락 사고 예방은 영주의 의무입니다!', butler: '그럴듯한 안전 조치입니다. 아무도 의심하지 않겠지요.', hidden: '스릴이 줄어 던전 명성이 조금 떨어진다 (입장료 감소).' },
  goldChest: { from: '던전 관리인', request: '보물 상자가 비어 있다고 항의가 들어옵니다…', butler: '진짜 금화를요? 던전에 돈을 버리시는 거군요.', hidden: '진짜 금화 소문에 모험가가 몰려든다. 3주 동안 큰 수입.' },
  remodel: { from: '던전 건축가', request: '한 달만 문 닫으면 끝내주게 고쳐 드립니다.', butler: '한 달 동안 입장료가 없겠습니다.' },
  festival: { from: '광장 상인회', request: '축제를 여시면 저희가 장사를… 아니, 흥을 돋우겠습니다!', butler: '영지민들이 무척 기뻐하겠습니다.', hidden: '상인들이 몰려와 2주 동안 자릿세를 낸다.' },
  statue: { from: '광장 조각가', request: '영주님을 실물보다 세 배 크게!', butler: '…위풍당당하겠군요. 매주 관리비가 듭니다.', hidden: '먼 곳에서 동상을 구경하러 관광객이 조금씩 온다.' },
  donation: { from: '성당 신부', request: '신께서 영주님의 선행을 기억하실 겁니다.', butler: '감찰관의 눈초리도 조금 누그러지겠지요.', hidden: '감사한 영지민들이 헌금을 조금 돌려준다.' },
};

export function hasHidden(id: ActionId): boolean {
  return !!CARD_TEXT[id].hidden;
}

/** 서류에 적힌 효과 (보이는 것만) */
export interface Effect {
  icon: string;
  label: string;
  value: string;
  /** 'good' = 주인공에게 좋음(돈이 줄거나 수치가 안전), 'bad' = 나쁨 */
  tone: 'good' | 'bad' | 'plain';
}

const GAUGE_NAME: Record<GaugeId, string> = { luxury: '사치', fun: '흥', fame: '던전 명성' };

/** @param susDelta 실제 붙을 의심 (반복하면 커짐). 없으면 서류 기본값 */
export function effectsOf(a: ActionDef, susDelta: number = a.suspicion): Effect[] {
  const out: Effect[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  out.push({ icon: '🪙', label: '금고', value: `−${a.cost.toLocaleString()}`, tone: a.cost > 0 ? 'good' : 'plain' });
  if (a.debt) out.push({ icon: '💸', label: '빚', value: `−${a.debt.toLocaleString()}`, tone: 'good' });
  if (a.upkeep) out.push({ icon: '🔁', label: '매주 유지비', value: `−${a.upkeep}`, tone: 'good' });
  if (susDelta) out.push({ icon: '👁', label: '의심', value: sign(susDelta), tone: susDelta > 0 ? 'bad' : 'good' });
  if (a.prosperity) out.push({ icon: '🌾', label: '번영', value: sign(a.prosperity), tone: a.prosperity > 0 ? 'bad' : 'good' });
  const g = a.gauge ?? (districtOf(a.district).gauge ? { [districtOf(a.district).gauge!]: 1 } : {});
  for (const [k, v] of Object.entries(g) as [GaugeId, number][]) if (v) out.push({ icon: '★', label: GAUGE_NAME[k], value: sign(v), tone: 'plain' });
  if (a.dungeonClosed) out.push({ icon: '🚧', label: '던전 휴업', value: `${a.dungeonClosed.weeks}주`, tone: 'good' });
  if (a.resetsButler) out.push({ icon: '🎩', label: '집사가 배운 것', value: '초기화', tone: 'plain' });
  return out;
}

/** 결재 조건·횟수 제한 (보이는 글) */
export function limitsOf(a: ActionDef): string[] {
  const out: string[] = [];
  const r = a.requires;
  if (r?.goldMax !== undefined) out.push(`금고 ${r.goldMax.toLocaleString()} 이하일 때만`);
  if (r?.goldMin !== undefined) out.push(`금고 ${r.goldMin.toLocaleString()} 이상일 때만`);
  if (r?.suspicionMax !== undefined) out.push(`의심 ${r.suspicionMax} 이하일 때만`);
  if (r?.gauge) out.push(`${GAUGE_NAME[r.gauge[0]]} ${r.gauge[1]} 이상일 때만`);
  if (a.maxUses) out.push(`최대 ${a.maxUses}번`);
  else if (a.kind !== '세탁') out.push(`반복하면 의심 +${ECONOMY.repeatSuspicion}씩 더`);
  return out;
}

/**
 * 숨은 효과 풀기 (겪어 보면 앎):
 * - 그 서류 덕에 돈이 들어온 줄이 장부에 찍히면
 * - 돈이 아니라 던전 명성·휴업으로 드러나는 서류는 결재한 주가 지나면
 */
export function discover(report: WeekReport, takenThatWeek: readonly ActionId[], already: ReadonlySet<ActionId>): ActionId[] {
  const out = new Set<ActionId>();
  for (const l of report.lines) if (l.action && l.reason && l.reason !== 'butler' && l.amount > 0 && hasHidden(l.action)) out.add(l.action);
  for (const id of takenThatWeek) if (hasHidden(id) && ['bard', 'freeEntry', 'warningSigns', 'railings'].includes(id)) out.add(id);
  return [...out].filter((id) => !already.has(id));
}
