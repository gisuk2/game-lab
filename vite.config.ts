import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// GitHub Pages는 https://<사용자>.github.io/<저장소 이름>/ 경로에서 서비스된다.
// GitHub Actions는 실행 시 GITHUB_REPOSITORY 환경 변수에 "<사용자>/<저장소 이름>"을 넣어주므로,
// 거기서 저장소 이름을 읽어 base 경로로 쓴다. → 저장소 이름을 바꿔도 이 파일은 고칠 필요가 없다.
// 로컬 개발(npm run dev)에서는 이 변수가 없으므로 '/'를 그대로 쓴다.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];

/** 페이지 목록: 첫 화면(게임 목록) + 게임별 페이지. 새 게임은 여기에 한 줄 추가 */
const GAMES: Record<string, string> = {
  main: './index.html',
  boss: './games/boss/index.html',
  boss3d: './games/boss/3d.html',
  estate: './games/estate/index.html',
  sea: './games/sea/index.html',
};

export default defineConfig({
  base: repoName ? `/${repoName}/` : '/',
  build: {
    // Vite 8부터 rollupOptions → rolldownOptions
    rolldownOptions: {
      input: Object.fromEntries(Object.entries(GAMES).map(([k, p]) => [k, fileURLToPath(new URL(p, import.meta.url))])),
    },
  },
});
