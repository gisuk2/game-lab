import type { BossEvent } from '../entities/boss/BossModel';
import type { PlayerEvent } from '../entities/player/PlayerModel';
import type { CombatEvent } from '../combat/CombatSystem';

/**
 * 게임 이벤트 → 효과음 이름 (순수 로직, 테스트 가능).
 * 소리 자체는 Sfx.ts가 Web Audio로 합성한다 (파일 없음).
 */
export type SfxName =
  | 'swing'
  | 'swingHeavy'
  | 'thrust'
  | 'dash'
  | 'denied'
  | 'hit'
  | 'parry'
  | 'dodge'
  | 'stagger'
  | 'death'
  | 'victory'
  | 'bossSwing'
  | 'lock'
  | 'swap'
  | 'gunshot'
  | 'slamGround'
  | 'rewind'
  | 'checkpoint'
  | 'hint';

/** 씬에서 직접 알리는 일 (모델 이벤트가 아닌 것) */
export type SceneSound = 'rewind' | 'checkpoint' | 'hint';

export interface FrameEvents {
  player?: readonly PlayerEvent[];
  boss?: readonly BossEvent[];
  combat?: readonly CombatEvent[];
  scene?: readonly SceneSound[];
}

/**
 * 한 프레임의 이벤트에서 낼 소리를 고른다 (같은 소리는 한 번만).
 * 플레이어가 쓰러진 프레임은 "맞음" 대신 "쓰러짐" 소리만.
 */
export function soundsFor(f: FrameEvents): SfxName[] {
  const out = new Set<SfxName>();
  const died = f.combat?.some((e) => e.type === 'playerDied') ?? false;

  for (const e of f.player ?? []) {
    if (e.type === 'dash') out.add('dash');
    else if (e.type === 'attackStart') out.add(e.kind === 'dash' ? 'thrust' : e.comboIndex === 2 ? 'swingHeavy' : 'swing');
    else if (e.type === 'staminaDenied') out.add('denied');
  }
  for (const e of f.boss ?? []) {
    if (e.type === 'weaponSwap') out.add('swap');
    else if (e.type === 'aimLocked') out.add('lock'); // 조준 고정 = "이제 움직여도 된다"는 소리 신호
    else if (e.type === 'fire') out.add(e.kind === 'bullet' ? 'gunshot' : 'slamGround');
    else if (e.type === 'attackActive') out.add('bossSwing');
  }
  for (const e of f.combat ?? []) {
    if (e.type === 'playerHitBoss') out.add('hit');
    else if (e.type === 'playerParried') out.add('parry');
    else if (e.type === 'playerDodged') out.add('dodge');
    else if (e.type === 'bossStaggered') out.add('stagger');
    else if (e.type === 'bossDied') out.add('victory');
    else if (e.type === 'playerDied') out.add('death');
    else if (e.type === 'bossHitPlayer' && !died) out.add('hit');
  }
  for (const s of f.scene ?? []) out.add(s);

  // 원거리 타는 판정(attackActive)과 발사가 같은 순간: 휘두르는 소리는 빼고 발사음만
  if (out.has('gunshot') || out.has('slamGround')) out.delete('bossSwing');
  return [...out];
}
