import { EstateApp } from './EstateApp';

const app = new EstateApp(document.getElementById('app')!);
void app.start();
// 콘솔 확인용
(window as unknown as { estateApp: EstateApp }).estateApp = app;
