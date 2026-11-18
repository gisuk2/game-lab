import { SeaApp } from './SeaApp';

const app = new SeaApp(document.querySelector<HTMLElement>('#app')!);
// 실험판 점검용 (헤드리스 자동 플레이에서 씀)
(window as unknown as { __sea: SeaApp }).__sea = app;
