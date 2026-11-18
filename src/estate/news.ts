import { DISTRICTS, actionById, type ActionId, type DistrictId, type Reason } from '../economy/content';
import type { WeekReport } from '../economy/Estate';

/**
 * 영지 신문: 지난주 결재가 "얼마 써서 얼마 벌었나" + 관련된 영지민 한마디(인터뷰).
 * 인터뷰하는 사람은 구역마다 직업·성·이름을 섞어 매번 다르게.
 */
export interface Interview {
  who: string;
  line: string;
}
export interface NewsRow {
  action: ActionId;
  name: string;
  district: DistrictId;
  /** 지난주에 쓴 돈 (0이면 예전에 결재한 서류의 여파) */
  spent: number;
  /** 지난주에 이 서류 덕에 들어온 돈 */
  earned: number;
  /** 예전 결재면 그 주차 */
  fromWeek?: number;
  /** 번 돈 − 쓴 돈 (음수 = 돈이 빠짐 = 주인공에게 좋음) */
  net: number;
  /** 이 서류 덕에 앞으로 더 들어올 돈 (다음 주부터) */
  later: number;
  laterWeeks: number;
  /** 결재할 때 실제로 바뀐 의심·번영 (지난주 결재한 서류만) */
  suspicion: number;
  prosperity: number;
  interview: Interview;
}
export interface Newspaper {
  week: number;
  headline: string;
  rows: NewsRow[];
  /** 기본 수입 등 나머지 */
  baseIncome: number;
  net: number;
  notes: string[];
}

export const SURNAMES = ['박', '김', '최', '이', '정', '한', '오', '윤', '강', '조', '황', '서', '배', '마', '구'];
export const GIVEN = ['무식', '덕배', '말자', '순돌', '두식', '갑돌', '꽃분', '만수', '복남', '춘삼', '칠복', '삼순', '봉팔', '영심', '똘이', '개똥'];
export const ROLES: Record<DistrictId, string[]> = {
  tavern: ['주정뱅이', '주점 단골', '바텐더', '떠돌이 악사', '외상 장부 1번', '술통 나르는'],
  dungeon: ['초짜 모험가', '베테랑 용사', '짐꾼', '던전 관리인', '길 잃은 마법사', '함정 수리공', '은퇴한 궁수'],
  manor: ['조리장', '하인', '정원사', '저택 서기', '하녀장', '마부', '집사 견습생'],
  square: ['노점상', '광장 상인', '구경꾼', '동네 꼬마', '풍선 장수'],
  chapel: ['수녀', '종지기', '순례자', '성가대원'],
};
export const BY_REASON: Partial<Record<Reason, string[]>> = {
  fountainRest: ['던전에 쉼터가 생겨서 숨 좀 돌립니다.', '분수 물맛이 끝내줘요. 한 층 더 내려가 보렵니다.', '쉬었다 가니까 오래 버티게 되더라고요. 입장료가 안 아깝네요.', '분수 앞에서 동료를 세 명이나 새로 사귀었어요!'],
  promo: ['공짜 술 얘기 듣고 왔다가 던전까지 구경하러 왔죠.', '이 동네 인심 좋다길래 짐 싸서 왔습니다!', '술 먹은 김에 던전 한 바퀴! 크하하.'],
  gifts: ['연회 손님들 선물 상자 나르느라 허리가 휘었습니다.', '남작님이 두고 간 은수저가 열두 벌이에요.', '답례품 창고가 모자라요. 창고를 하나 더 지어야…'],
  artPrice: ['그 그림 말인데요, 요즘 수도에서 값이 세 배래요.', '화상이 다시 와서 그림 좀 팔라고 조르던데요?'],
  recipe: ['요리사 양반이 준 레시피로 안주를 냈더니 대박이 났어요.', '스튜 맛이 달라졌다고 손님이 늘었수다.'],
  chestRumor: ['진짜 금화가 나온다며? 나도 한번 들어가 봐야지!', '상자 열었더니 금화가! 친구들 다 불렀어요.', '금화 소문 듣고 옆 왕국에서 왔습니다.'],
  merchants: ['축제 자릿세 냈습니다. 그래도 남는 장사예요!', '이렇게 손님 많은 축제는 처음이에요.'],
  gratitude: ['영주님 은혜 잊지 않으려고 헌금 좀 했어요.', '기부 소식 듣고 눈물이 났습니다.'],
  tourists: ['동상 보러 사흘을 걸어왔어요. 생각보다… 크네요.', '동상 앞에서 초상화 그려 주는 장사가 쏠쏠해요.'],
};
export const BY_ACTION: Partial<Record<ActionId, string[]>> = {
  secretaryLeave: ['휴가 감사합니다! 바다 보고 오겠습니다.', '서기님 없으니 저택이 조용하네요.'],
  renovate: ['방이 또 늘었어요. 청소는 누가 하죠?', '새 방에 들어갔다가 길을 잃었습니다.'],
  boldWaste: ['창밖에서 금화가 떨어지던데… 꿈이었나?', '영주님이 뭘 던지시는 걸 봤어요. 못 본 걸로 할게요.'],
  forgiveTabs: ['외상이 없어졌어요! 영주님 만세!', '오늘부터 새 외상 장부를 시작합니다.'],
  warningSigns: ['경고문 보고 그냥 돌아가는 사람이 많아요.', '"죽을 수 있음"이라니… 원래 그런 거 아니었어?'],
  railings: ['난간 생기니까 좀 심심하네요.', '떨어질 뻔했는데 난간 덕에 살았습니다. 감사하지만 재미는 없네요.'],
  freeEntry: ['공짜라길래 들어왔는데, 문이 닫혀 있네요?', '다음에 문 열면 꼭 다시 올게요!'],
  bard: ['그 노래 들었어요? 영주님이 용을 맨손으로 잡았다던데.', '노래 듣고 던전 구경 왔습니다!'],
  debtFeast: ['잔치 음식이 끝내줬어요. 근데 이거 누가 갚아요?'],
  donation: ['성당 지붕이 새로 덮였어요.'],
  statue: ['동상이 너무 커서 해가 가려요.'],
};
export const PLAIN: Record<DistrictId, string[]> = {
  manor: ['도련님 덕에 일거리가 늘었습니다.', '요즘 저택이 아주 시끌벅적해요.'],
  tavern: ['오늘 술은 영주님이 쏘신다며?', '영주님 만세! …근데 영주님이 누구더라?'],
  dungeon: ['던전이 좀 달라졌던데요?', '관리인이 뭔가 열심히 고치던데요.'],
  square: ['광장이 북적북적하네요.', '오늘 장사는 좀 되겠어요.'],
  chapel: ['신부님 표정이 밝아지셨어요.'],
};
const HEADLINE: Partial<Record<Reason, string>> = {
  fountainRest: '던전 분수, 모험가들의 새 명소로!',
  promo: '공짜 술 소문, 던전까지 번졌다',
  gifts: '연회 답례품 행렬, 저택 창고 가득',
  artPrice: '영주님 소장 그림, 값이 뛰었다',
  recipe: '전속 요리사의 레시피, 주점 메뉴 석권',
  chestRumor: '"진짜 금화 나온다" 던전 앞 장사진',
  merchants: '축제에 상인 몰려… 광장 자릿세 대박',
  gratitude: '영주님 기부에 영지민 감동',
  tourists: '영주 동상 보러 관광객 발길',
};

export function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function interviewFor(action: ActionId, reason: Reason | undefined, district: DistrictId, rng: () => number): Interview {
  const role = pick(ROLES[district], rng);
  const sur = pick(SURNAMES, rng);
  const who = rng() < 0.35 ? `${role} ${sur}씨` : `${role} ${sur}${pick(GIVEN, rng)}`;
  const pool = (reason && BY_REASON[reason]) || BY_ACTION[action] || PLAIN[district];
  return { who, line: pick(pool, rng) };
}

/**
 * @param report 지난주 정산
 * @param taken 지난주에 결재한 서류
 */
export interface NewsExtra {
  /** 서명 때 서류마다 바뀐 수치 (WeekPlan.lastDeltas) */
  deltas?: readonly { id: ActionId; suspicion: number; prosperity: number }[];
  /** 정산 뒤 영지의 예약된 돈 (앞으로 더 들어올 돈) */
  scheduled?: readonly { action: ActionId; amount: number; week: number }[];
}

export function buildNewspaper(report: WeekReport, taken: readonly ActionId[], estateName: string, rng: () => number, extra: NewsExtra = {}): Newspaper {
  const rows = new Map<ActionId, NewsRow & { reason?: Reason }>();
  const row = (id: ActionId, district: DistrictId) => {
    let r = rows.get(id);
    if (!r) {
      const a = actionById(id);
      r = { action: id, name: a.name, district, spent: 0, earned: 0, net: 0, later: 0, laterWeeks: 0, suspicion: 0, prosperity: 0, interview: { who: '', line: '' } };
      rows.set(id, r);
    }
    return r;
  };
  for (const id of taken) {
    const a = actionById(id);
    row(id, a.district).spent += a.cost + (a.debt ?? 0);
  }
  let baseIncome = 0;
  for (const l of report.lines) {
    if (l.action) {
      const r = row(l.action, l.district ?? actionById(l.action).district);
      r.earned += l.amount;
      if (l.reason && l.reason !== 'butler') {
        r.reason = l.reason;
        r.district = l.district ?? r.district;
      }
    } else baseIncome += l.amount;
  }
  for (const r of rows.values()) {
    r.net = r.earned - r.spent;
    const later = (extra.scheduled ?? []).filter((q) => q.action === r.action);
    r.later = later.reduce((x, q) => x + q.amount, 0);
    r.laterWeeks = new Set(later.map((q) => q.week)).size;
    const d = extra.deltas?.find((x) => x.id === r.action);
    if (d) {
      r.suspicion = d.suspicion;
      r.prosperity = d.prosperity;
    }
    r.interview = interviewFor(r.action, r.reason, r.district, rng);
  }
  const list = [...rows.values()].sort((a, b) => b.earned - a.earned || b.spent - a.spent);
  const top = list.find((r) => r.earned > 0 && r.reason);
  let headline = top?.reason ? HEADLINE[top.reason] ?? `${estateName}, 바쁜 한 주` : `${estateName}, 조용한 한 주`;
  const notes: string[] = [];
  if (report.deadline) {
    if (!report.deadline.passed) headline = `왕실, ${estateName}의 넉넉한 금고에 주목!`;
    notes.push(report.deadline.passed ? '월말 왕실 보고: 별말씀이 없으셨다.' : '월말 왕실 보고: 금고가 넉넉하다며 왕실이 주목했다.');
  }
  for (const d of report.unlocked) notes.push(`${DISTRICTS.find((x) => x.id === d)!.name} 구역이 열렸다.`);
  const spent = list.reduce((s, r) => s + r.spent, 0);
  const net = report.lines.reduce((s, l) => s + l.amount, 0) - spent;
  return { week: report.week, headline, rows: list.map(({ reason: _r, ...rest }) => rest), baseIncome, net, notes };
}
