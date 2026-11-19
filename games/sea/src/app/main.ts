import { RunApp } from './RunApp';
import { SeaApp } from './SeaApp';

// 기본 = 한 바다 항해. ?mode=battle 이면 전투 한 판 실험판(SEA-1)
const root = document.querySelector<HTMLElement>('#app')!;
const params = new URLSearchParams(location.search);
const w = window as unknown as { __sea: SeaApp; __run?: RunApp };
if (params.get('mode') === 'battle') w.__sea = new SeaApp(root);
else {
  const seed = params.get('seed');
  const app = new RunApp(root, seed ? Number(seed) : undefined);
  w.__run = app; w.__sea = app.battle;
}
