/**
 * 튜토리얼 진행 (순수 로직). 대본: docs/design/tutorial-script.md
 * - 대사 단계: 말풍선을 누르면 다음 ('next')
 * - 행동 단계 (wait): 지정된 버튼(target)만 빛나고 손가락이 가리킴. 다른 행동은 무시
 */
export type Speaker = 'system' | 'butler' | 'inner' | 'outer';
/** 서류 열기는 `open:<서류 id>` (그 서류 줄만 눌러야 넘어감) */
export type TutorialAction =
  | 'next' | 'name' | 'memo' | 'openLedger' | 'closeLedger'
  | `open:${string}` | 'approve' | 'reject'
  | 'enterTavern' | 'enterDungeon' | 'leaveDistrict' | 'sign' | 'openButler' | 'closeButler';

export interface Step {
  speaker: Speaker;
  /** {estate} = 영지 이름 */
  text: string;
  /** 이 행동을 해야 넘어감 (없으면 'next') */
  wait?: TutorialAction;
  /** 밝게 비출 화면 요소 id (b-<건물>은 영지 그림 속 건물) */
  target?: string;
  /** 이 단계에서 띄울 창: 칙서, 속마음 글 */
  show?: 'decree' | 'memo';
}

/** 1주차 결재함 (튜토리얼 고정): 평범한 서류 하나 → 분수대 */
export const TUTORIAL_INBOX = ['secretaryLeave', 'fountain'] as const;

/** 속마음 글 (한 장으로 읽는 독백). 빈 줄 = 문단 */
export const MEMO = {
  title: '영주의 속마음',
  body: `왕도로 부른다고? 농담이겠지.

새벽 조회, 끝없는 연회, 귀족들의 눈치 싸움. 그곳에 가는 순간 내 낮잠 인생은 끝이다. 나는 이 조용한 시골 영지에서 평생 늘어지게 살 생각이다.

방법은 하나. 이 영지를… 조용히 망하게 만드는 것.

12주 뒤에 왕실 감찰관이 온다. 그때 금고가 텅 비어 있으면, 아무도 이 무능한 영주를 왕도로 부르지 않겠지.

단, 티가 나면 안 된다. 대놓고 돈을 버리다 들키면 태만죄로 끌려가고, 영지가 너무 잘나가도 왕실 눈에 띈다. 겉으로는 성실한 영주인 척, 속으로는 부지런히 돈을 쓰자.`,
  goals: ['12주 뒤 감찰 때 금고 0 이하', '의심도·번영도가 끝까지 차지 않게', '매달 말(4·8주차) 금고를 마감 상한 아래로'],
};

export const TUTORIAL: readonly Step[] = [
  // 0. 칙서와 이름
  { speaker: 'system', show: 'decree', wait: 'name', target: 'name-ok',
    text: '…하여, 동부의 던전 영지를 그대에게 맡기노라. 훌륭히 일구어 왕실에 보답하라.' },
  // 1. 집사
  { speaker: 'butler', text: '도련님, {estate}에 오신 것을 환영합니다.' },
  { speaker: 'butler', text: '오늘이 영지 운영 1주차입니다. 제가 차근차근 도와드리겠습니다.' },
  { speaker: 'butler', text: '이곳을 훌륭히 키워 내시면, 왕실에서 반드시 도련님을 왕도로 부르실 겁니다!' },
  { speaker: 'outer', text: '…그래. 잘 부탁하네.' },
  // 2. 속마음 — 한 장으로
  { speaker: 'inner', show: 'memo', wait: 'memo', target: 'memo-ok', text: '' },
  // 3. 위쪽 띠: 금고와 영지 형편
  { speaker: 'butler', target: 'hud-gold', text: '오른쪽 위가 금고입니다. 그 아래 줄은 다음 왕실 보고 날짜와 기준이지요.' },
  { speaker: 'butler', target: 'stat-pros', text: '가운데는 영지 형편입니다. 번영도가 높을수록 왕실의 칭찬이 쏟아지지요.' },
  { speaker: 'butler', target: 'stat-sus', text: '그리고 감찰관의 눈초리… 영주가 성실해 보이지 않으면 오릅니다. 뭐, 도련님께는 해당 없겠지요.' },
  // 4. 장부 — 결재함, 3칸, 평범한 서류
  { speaker: 'butler', wait: 'openLedger', target: 'ledger-btn', text: '이번 주 결재 서류가 2건 올라와 있습니다. 장부를 열어 보시지요.' },
  { speaker: 'butler', target: 'ledger-slots', text: '결재는 한 주에 세 건까지입니다. 이 칸이 다 차면 그 주 결재는 끝이지요.' },
  { speaker: 'butler', wait: 'open:secretaryLeave', target: 'inbox-secretaryLeave', text: '먼저 저택 서기의 휴가 신청입니다. 눌러서 살펴보시지요.' },
  { speaker: 'butler', target: 'paper-effects', text: '서류에는 드는 돈과, 영지에 미칠 영향이 적혀 있습니다.' },
  { speaker: 'butler', wait: 'approve', target: 'paper-approve', text: '평범한 건입니다. 장부에 적으시면 됩니다.' },
  { speaker: 'butler', target: 'ledger-slots', text: '한 칸 쓰셨습니다. 적어 둔 서류는 서명 전까지 다시 눌러 언제든 취소하실 수 있습니다.' },
  { speaker: 'butler', target: 'hud-gold', text: '금고 옆에는 서명하면 남을 금액이 미리 보입니다. 돈은 서명할 때 나가지요.' },
  // 5. 분수대
  { speaker: 'butler', wait: 'open:fountain', target: 'inbox-fountain', text: '다음은… 던전 쪽 요청이군요.' },
  { speaker: 'butler', text: '던전 입구에 분수대를 설치해 달라는 요청입니다. 운영에는 쓸모없는 시설이니, 반려하시면 됩니다.' },
  { speaker: 'butler', target: 'paper-hidden', text: '이 ❓는 아직 아무도 모르는 효과입니다. 직접 겪어 보시면 알게 되지요.' },
  { speaker: 'inner', wait: 'approve', target: 'paper-approve', text: '돈은 나가고 돌아오는 건 없다. 완벽하잖아.' },
  { speaker: 'outer', text: '설치하게.' },
  { speaker: 'butler', text: '…예? 아, 알겠습니다. 무언가 깊은 뜻이 있으시겠지요.' },
  // 6. 마감과 서명
  { speaker: 'butler', target: 'ledger-deadline', text: '매달 말에는 왕실에 장부를 보고합니다. 금고가 넉넉하면 왕실이 주목하시지요. 영광입니다!' },
  { speaker: 'inner', target: 'ledger-deadline', text: '주목 = 끝. 매달 말까지 금고를 기준 아래로 내려 둬야겠군.' },
  { speaker: 'butler', target: 'ledger-sign', text: '서명하시면 한 주가 지나갑니다. 남은 한 칸은 건물 안에서 쓰실 수도 있지요.' },
  // 7. 주점
  { speaker: 'butler', wait: 'closeLedger', target: 'ledger-btn', text: '서명 전에 영지를 둘러보시지요. 장부 버튼을 다시 누르시거나 장부 바깥을 누르시면 덮입니다.' },
  { speaker: 'butler', wait: 'enterTavern', target: 'b-tavern', text: '건물을 누르시면 안을 살펴보실 수 있습니다. 주점에 한번 가 보시지요.' },
  { speaker: 'butler', text: '영지 사람들의 이야기를 들으면, 무슨 일이 일어나는지 알 수 있습니다.' },
  { speaker: 'butler', target: 'district-papers', text: '건물 안에서도 일을 벌이실 수 있습니다. 서류를 누르시면 자세한 내용이 나오지요.' },
  { speaker: 'butler', wait: 'leaveDistrict', target: 'district-back', text: '아래 [영지로]를 누르시면 돌아갑니다. ESC 키도 됩니다.' },
  // 8. 첫 주 마치기
  { speaker: 'butler', wait: 'openLedger', target: 'ledger-btn', text: '장부에 서명하시고 첫 주를 마치시지요.' },
  { speaker: 'inner', wait: 'sign', target: 'ledger-sign', text: '쓸모없는 서류 두 장. 시작이 좋아.' },
  // 9. 2주차 — 영지 신문으로 반전
  { speaker: 'inner', wait: 'openButler', target: 'butler-btn', text: '집사가 뭔가 할 말이 있는 모양이군.' },
  { speaker: 'butler', target: 'news-paper', text: '도련님! 지난주 분수대 결정이 정말 탁월하셨습니다! 모험가들이 몰려들고 있습니다!' },
  { speaker: 'inner', target: 'news-row-fountain', text: '…뭐?' },
  { speaker: 'butler', target: 'news-row-fountain', text: '얼마를 써서 얼마를 벌었는지, 영지민들이 뭐라는지 매주 이 신문에 실립니다.' },
  { speaker: 'butler', wait: 'enterDungeon', target: 'news-goto-fountain', text: '[가 보기]를 누르시면 바로 그곳으로 모셔다 드리지요.' },
  { speaker: 'inner', text: '쓸모없는 걸 지었는데… 사람들이 좋아한다고?' },
  { speaker: 'inner', text: '겉보기에 쓸모없다고 다 돈 낭비는 아니구나. 어디서 돈이 새어 들어오는지 잘 보고 다녀야겠어.' },
  { speaker: 'butler', text: '분수 서류의 ❓도 풀렸습니다. 다른 서류의 숨은 사정도 이렇게 알게 되실 겁니다.' },
  // 10. 자유 플레이
  { speaker: 'butler', text: '이번 주 서류도 결재함에 올려 두었습니다. 앞으로도 탁월한 결정 기대하겠습니다!' },
  { speaker: 'inner', text: '기대하지 마. 이번엔 진짜로 망쳐 주지.' },
];

export class TutorialRunner {
  index = 0;

  constructor(private readonly steps: readonly Step[] = TUTORIAL) {}

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  get step(): Step | null {
    return this.steps[this.index] ?? null;
  }

  /** 지금 이 행동을 해도 되나 (튜토리얼이 끝났으면 무엇이든) */
  allows(action: TutorialAction): boolean {
    const s = this.step;
    if (!s) return true;
    return action === (s.wait ?? 'next');
  }

  /** 행동 처리: 허용된 행동이면 다음 단계로 (true), 아니면 무시 (false) */
  handle(action: TutorialAction): boolean {
    if (this.done) return true;
    if (!this.allows(action)) return false;
    this.index += 1;
    return true;
  }

  /** 튜토리얼 건너뛰기 */
  skip(): void {
    this.index = this.steps.length;
  }
}

export function fillText(text: string, estate: string): string {
  return text.replaceAll('{estate}', estate);
}
