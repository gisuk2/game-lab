import { describe, expect, it } from 'vitest';
import { soundsFor } from '../src/audio/sfxMap';

describe('효과음 고르기', () => {
  it('평타 1·2타는 휘두름, 3타는 무거운 휘두름, 대시 찌르기는 찌름', () => {
    expect(soundsFor({ player: [{ type: 'attackStart', kind: 'combo', comboIndex: 0, angle: 0 }] })).toEqual(['swing']);
    expect(soundsFor({ player: [{ type: 'attackStart', kind: 'combo', comboIndex: 2, angle: 0 }] })).toEqual(['swingHeavy']);
    expect(soundsFor({ player: [{ type: 'attackStart', kind: 'dash', comboIndex: 0, angle: 0 }] })).toEqual(['thrust']);
  });

  it('쓰러진 프레임에서는 "맞음" 대신 "쓰러짐"만', () => {
    const s = soundsFor({ combat: [{ type: 'bossHitPlayer', damage: 10, patternId: 'sweep' }, { type: 'playerDied' }] });
    expect(s).toEqual(['death']);
  });

  it('원거리 타는 휘두름 소리 없이 발사음만 (탄 = 총소리, 충격파 = 땅울림)', () => {
    const fire = (kind: 'bullet' | 'wave') => ({
      type: 'fire' as const, patternId: 'shot' as const, x: 0, y: 0, angle: 0, kind, speed: 1, radius: 1, damage: 1, parryable: true,
    });
    const active = { type: 'attackActive' as const, patternId: 'shot' as const, step: 0 };
    expect(soundsFor({ boss: [active, fire('bullet')] })).toEqual(['gunshot']);
    expect(soundsFor({ boss: [active, fire('wave')] })).toEqual(['slamGround']);
  });

  it('조준 고정은 소리로도 알려준다', () => {
    expect(soundsFor({ boss: [{ type: 'aimLocked', patternId: 'sweep', step: 0 }] })).toEqual(['lock']);
  });

  it('같은 소리는 한 프레임에 한 번만', () => {
    const hit = { type: 'playerHitBoss' as const, damage: 10 };
    expect(soundsFor({ combat: [hit, hit] })).toEqual(['hit']);
  });

  it('이벤트가 없으면 소리도 없다', () => {
    expect(soundsFor({})).toEqual([]);
  });
});
