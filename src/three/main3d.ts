import { Game3D } from './Game3D';

/**
 * 3D 시험판 진입점 (3d.html). 2D 버전(index.html)과 같은 로직을 3D 화면으로 보여준다.
 * 목적: 2D와 3D 중 어느 쪽으로 갈지 비교해서 정하기 (docs/adr 예정)
 */
const el = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`3d.html에 #${id} 요소가 없습니다.`);
  return found;
};

const game = new Game3D(
  el('view'),
  {
    hp: el('hp-fill'),
    gauge: el('gauge-fill'),
    potions: el('potions'),
    view: el('view-mode'),
    stamina: el('stamina-fill'),
    bossHp: el('boss-hp-fill'),
    bossPosture: el('boss-posture-fill'),
    retries: el('retries'),
    debug: el('debug'),
    toast: el('toast'),
    camera: el('camera-mode'),
    overlay: el('overlay'),
    reticle: el('lock-reticle'),
    vhs: el('vhs'),
  },
  960,
  540,
);
game.start();
