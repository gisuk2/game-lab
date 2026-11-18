/**
 * 되감기 연출용 기록 (순수 로직). 되감기 지점부터 매 프레임 상태를 쌓아 두었다가, 죽으면 거꾸로 재생한다.
 * 이후 "시도 기억 → 보스의 되감기 역이용"(docs/design/learning-feedback.md §8)의 재료가 된다.
 */
export class RewindHistory<T> {
  private frames: T[] = [];

  constructor(
    /** 최대 프레임 수 (넘으면 오래된 것부터 버림) */
    private readonly capacity = 600,
  ) {}

  get length(): number {
    return this.frames.length;
  }

  push(frame: T): void {
    this.frames.push(frame);
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  clear(): void {
    this.frames = [];
  }

  /**
   * 거꾸로 재생: progress 0 = 마지막(죽은 순간), 1 = 처음(되감기 지점)
   */
  frameAt(progress: number): T | null {
    const n = this.frames.length;
    if (n === 0) return null;
    return this.frames[rewindIndex(n, progress)];
  }
}

/** 거꾸로 재생할 때 진행률(0~1)에 해당하는 프레임 번호 */
export function rewindIndex(n: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round((1 - p) * (n - 1));
}
