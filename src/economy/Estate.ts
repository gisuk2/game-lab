import { ACTIONS, DISTRICTS, ECONOMY, GAUGE_MAX, actionById, districtOf, type ActionDef, type ActionId, type DistrictId, type GaugeId, type Reason } from './content';

/**
 * 영지 경제 (순수 로직, 화면 없음). 한 턴 = 1주.
 * 낮: 결재 서류 최대 3장 → 밤(주말) 정산: 기본 수입 − 유지비 + 돌아오는 돈 + 집사
 * 승리: 12주차 마지막 감찰 때 금고 0 이하 (파산 선고). 중간에 0원이 돼도 수입이 다시 들어온다
 * 패배: 의심도 한계(태만죄), 번영도 한계 또는 왕실 관심 2(소환), 12주가 끝나도 금고가 남음
 * 월말 마감: 4·8주차에 금고가 상한을 넘으면 왕실 관심 +1
 */
export type Status = 'playing' | 'bankrupt' | 'caught' | 'summoned' | 'timeUp';

export interface LedgerLine {
  label: string;
  amount: number;
  /** 돌아오는 돈의 이유 (구역 화면 대사용). 기본 수입·유지비는 없음 */
  reason?: Reason;
  district?: DistrictId;
  /** 이 돈을 만든 서류 (돌아오는 돈·집사) */
  action?: ActionId;
}

export interface WeekReport {
  week: number;
  lines: LedgerLine[];
  goldAfter: number;
  unlocked: DistrictId[];
  /** 이번 주가 마감이었다면 결과 */
  deadline?: { cap: number; passed: boolean };
}

interface Scheduled {
  week: number;
  amount: number;
  label: string;
  reason: Reason;
  district: DistrictId;
  promo: boolean;
  action: ActionId;
}

export type TakeResult = 'ok' | 'notPlaying' | 'limit' | 'locked' | 'noGold' | 'already' | 'usedUp' | 'condition';

export class Estate {
  week = 1;
  gold: number = ECONOMY.startGold;
  suspicion = 0;
  prosperity: number = ECONOMY.startProsperity;
  /** 던전 명성 배율 */
  reputation = 1;
  upkeep = 0;
  royalAttention = 0;
  status: Status = 'playing';
  readonly gauges: Record<GaugeId, number> = { luxury: 0, fun: 0, fame: 0 };
  /** 서류별 사용 횟수 */
  readonly uses: Partial<Record<ActionId, number>> = {};
  /** 집사가 학습한 횟수 (비서 휴가로 초기화) */
  readonly learned: Partial<Record<ActionId, number>> = {};
  readonly unlocked = new Set<DistrictId>(DISTRICTS.filter((d) => d.open).map((d) => d.id));
  readonly reports: WeekReport[] = [];
  private takenThisWeek: ActionId[] = [];
  private scheduled: Scheduled[] = [];
  /** 이 주까지 던전 휴업 (입장료 없음) */
  private closedUntil = 0;
  private repAfterClose = 1;
  /** 이 주까지 홍보 효과가 막힘 */
  private promoBlockedUntil = 0;

  get thisWeek(): readonly ActionId[] {
    return this.takenThisWeek;
  }

  get prosperityMul(): number {
    return 1 + this.prosperity / ECONOMY.prosperityDiv;
  }

  get dungeonOpen(): boolean {
    return this.week > this.closedUntil;
  }

  /** 예약된 돌아오는 돈 (주차·서류별, 홍보 감소 전) — 화면 표시용 */
  get scheduledLines(): readonly { week: number; amount: number; label: string; reason: Reason; district: DistrictId; action: ActionId; promo: boolean }[] {
    return this.scheduled.filter((q) => q.week >= this.week).map((q) => ({ ...q }));
  }

  /** 지금 홍보 효과 배율 (휴업 0, 경고문으로 막힘 blockedPromoMul, 평소 1) */
  promoMulFor(week: number): number {
    if (week <= this.closedUntil) return 0;
    return week <= this.promoBlockedUntil ? ECONOMY.blockedPromoMul : 1;
  }

  /** 앞으로 들어올 돈 (예약된 돌아오는 돈 합계, 홍보 감소 전) */
  get pendingReturns(): number {
    return this.scheduled.filter((q) => q.week >= this.week).reduce((s, q) => s + q.amount, 0);
  }

  /** 다음 마감 (없으면 null) */
  get nextDeadline(): { week: number; cap: number } | null {
    return ECONOMY.deadlines.find((d) => d.week >= this.week) ?? null;
  }

  /** 열린 구역의 서류 (조건이 안 맞는 것 포함 — 화면에서 잠금 표시) */
  available(): ActionDef[] {
    return ACTIONS.filter((a) => this.unlocked.has(a.district));
  }

  check(id: ActionId): TakeResult {
    const a = actionById(id);
    if (this.status !== 'playing') return 'notPlaying';
    if (!this.unlocked.has(a.district)) return 'locked';
    if (this.takenThisWeek.length >= ECONOMY.actionsPerWeek) return 'limit';
    if (this.takenThisWeek.includes(id)) return 'already';
    if (a.maxUses !== undefined && (this.uses[id] ?? 0) >= a.maxUses) return 'usedUp';
    const r = a.requires;
    if (r) {
      if (r.goldMax !== undefined && this.gold > r.goldMax) return 'condition';
      if (r.goldMin !== undefined && this.gold < r.goldMin) return 'condition';
      if (r.suspicionMax !== undefined && this.suspicion > r.suspicionMax) return 'condition';
      if (r.gauge && this.gauges[r.gauge[0]] < r.gauge[1]) return 'condition';
    }
    if (this.gold < a.cost) return 'noGold';
    return 'ok';
  }

  /** 이 서류를 쓰면 의심도가 얼마나 바뀌나 (반복하면 눈치챔 / 기부는 덜 씻김) */
  suspicionDelta(id: ActionId, before = this.uses[id] ?? 0): number {
    const a = actionById(id);
    if (a.suspicion > 0) return a.suspicion + before * ECONOMY.repeatSuspicion;
    if (a.suspicion < 0) return Math.round(a.suspicion * Math.pow(ECONOMY.donationDecay, before));
    return 0;
  }

  take(id: ActionId): TakeResult {
    const r = this.check(id);
    if (r !== 'ok') return r;
    const a = actionById(id);
    const before = this.uses[id] ?? 0;
    this.gold -= a.cost + (a.debt ?? 0);
    this.suspicion = clamp(this.suspicion + this.suspicionDelta(id, before), 0, 1000);
    this.prosperity = clamp(this.prosperity + a.prosperity, 0, 1000);
    this.upkeep += a.upkeep ?? 0;
    // 구역 수치 (없으면 자기 구역 +1)
    const g = a.gauge ?? (districtOf(a.district).gauge ? { [districtOf(a.district).gauge!]: 1 } : {});
    for (const [k, v] of Object.entries(g) as [GaugeId, number][]) this.gauges[k] = clamp(this.gauges[k] + v, 0, GAUGE_MAX);
    if (a.reputationMul) this.reputation = clamp(this.reputation * a.reputationMul, ECONOMY.reputationMin, ECONOMY.reputationMax);
    if (a.dungeonClosed) {
      this.closedUntil = Math.max(this.closedUntil, this.week + a.dungeonClosed.weeks - 1);
      this.repAfterClose = a.dungeonClosed.afterRep ?? 1;
    }
    if (a.blocksPromo) this.promoBlockedUntil = Math.max(this.promoBlockedUntil, this.week + 1);
    if (a.returns) {
      const ret = a.returns;
      const scale = ret.scaleBy ? 1 + this.gauges[ret.scaleBy] * (ret.scalePer ?? 0) : 1;
      for (let k = 0; k < ret.weeks; k++) {
        this.scheduled.push({
          week: this.week + ret.delay - 1 + k,
          amount: Math.round(ret.perWeek * scale * this.prosperityMul),
          label: `${a.name}의 여파`,
          reason: ret.reason,
          district: ret.promo ? 'dungeon' : a.district,
          promo: !!ret.promo,
          action: id,
        });
      }
    }
    // 학습하는 집사 (비서 휴가로 초기화)
    if (a.resetsButler) {
      for (const k of Object.keys(this.learned) as ActionId[]) delete this.learned[k];
    } else {
      const learned = this.learned[id] ?? 0;
      const butler = Math.round(a.cost * ECONOMY.butlerRate * Math.min(learned, ECONOMY.butlerMaxUses));
      if (butler > 0) this.scheduled.push({ week: this.week, amount: butler, label: `집사의 준비 (${a.name})`, reason: 'butler', district: a.district, promo: false, action: id });
      this.learned[id] = learned + 1;
    }
    this.uses[id] = before + 1;
    this.takenThisWeek.push(id);
    return 'ok';
  }

  /** 이번 주말 기본 수입 (미리 보기) */
  passiveIncome(): LedgerLine[] {
    const m = this.prosperityMul;
    const per = ECONOMY.gaugeIncomePer;
    return [
      { label: '저택 임대료', amount: Math.round(ECONOMY.income.manorRent * (1 + this.gauges.luxury * per)), district: 'manor' },
      { label: '주점 세금', amount: Math.round(ECONOMY.income.tavern * m * (1 + this.gauges.fun * per)), district: 'tavern' },
      {
        label: this.dungeonOpen ? '던전 입장료' : '던전 입장료 (휴업)',
        amount: this.dungeonOpen ? Math.round(ECONOMY.income.dungeon * this.reputation * m * (1 + this.gauges.fame * per)) : 0,
        district: 'dungeon',
      },
    ];
  }

  /** 주말 정산 → 다음 주 */
  endWeek(): WeekReport {
    if (this.status !== 'playing') return this.reports[this.reports.length - 1];
    const lines: LedgerLine[] = [...this.passiveIncome()];
    if (this.upkeep > 0) lines.push({ label: '유지비', amount: -this.upkeep });
    const promoMul = !this.dungeonOpen ? 0 : this.week <= this.promoBlockedUntil ? ECONOMY.blockedPromoMul : 1;
    for (const s of this.scheduled.filter((q) => q.week === this.week)) {
      const amount = s.promo ? Math.round(s.amount * promoMul) : s.amount;
      lines.push({ label: s.label, amount, reason: s.reason, district: s.district, action: s.action });
    }
    this.scheduled = this.scheduled.filter((q) => q.week > this.week);
    for (const l of lines) this.gold += l.amount;

    if (this.closedUntil === this.week) this.reputation = clamp(this.reputation * this.repAfterClose, ECONOMY.reputationMin, ECONOMY.reputationMax);
    this.suspicion = Math.max(0, this.suspicion - ECONOMY.suspicionDecay);
    const unlocked = this.checkUnlocks();

    let deadline: WeekReport['deadline'];
    const dl = ECONOMY.deadlines.find((d) => d.week === this.week);
    if (dl) {
      const passed = this.gold <= dl.cap;
      if (!passed) this.royalAttention += 1;
      deadline = { cap: dl.cap, passed };
    }

    const report: WeekReport = { week: this.week, lines, goldAfter: this.gold, unlocked, deadline };
    this.reports.push(report);

    if (this.suspicion >= ECONOMY.suspicionLimit) this.status = 'caught';
    else if (this.prosperity >= ECONOMY.prosperityLimit || this.royalAttention >= ECONOMY.royalAttentionLimit) this.status = 'summoned';
    else if (this.week >= ECONOMY.weeks) this.status = this.gold <= 0 ? 'bankrupt' : 'timeUp';

    this.week += 1;
    this.takenThisWeek = [];
    return report;
  }

  clone(): Estate {
    const c = new Estate();
    c.week = this.week;
    c.gold = this.gold;
    c.suspicion = this.suspicion;
    c.prosperity = this.prosperity;
    c.reputation = this.reputation;
    c.upkeep = this.upkeep;
    c.royalAttention = this.royalAttention;
    c.status = this.status;
    Object.assign(c.gauges, this.gauges);
    Object.assign(c.uses, this.uses);
    Object.assign(c.learned, this.learned);
    c.unlocked.clear();
    for (const d of this.unlocked) c.unlocked.add(d);
    c.takenThisWeek = [...this.takenThisWeek];
    c.scheduled = this.scheduled.map((s) => ({ ...s }));
    c.closedUntil = this.closedUntil;
    c.repAfterClose = this.repAfterClose;
    c.promoBlockedUntil = this.promoBlockedUntil;
    return c;
  }

  private checkUnlocks(): DistrictId[] {
    const out: DistrictId[] = [];
    const open = (id: DistrictId, ok: boolean) => {
      if (ok && !this.unlocked.has(id)) {
        this.unlocked.add(id);
        out.push(id);
      }
    };
    open('square', (this.uses.banquet ?? 0) + (this.uses.party ?? 0) >= 2);
    open('chapel', this.suspicion >= 30);
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
