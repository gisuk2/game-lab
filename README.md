# game-lab

> 혼자 취미로 만드는 브라우저 게임 실험실. 게임마다 `games/<이름>/` 폴더 하나.
> 아이디어 → 설계 문서 → 순수 로직 + 테스트 → 화면 순서로 만들고, 결정은 ADR로 남긴다.

| 항목 | 내용 |
|---|---|
| 플레이 | https://gisuk2.github.io/game-lab/ (게임 목록) |
| 기술 | TypeScript · Vite · Vitest · Canvas/DOM · Phaser(보스 2D) · Three.js(보스 3D) · GitHub Actions |
| 그림 | 임시 그림은 Python(Pillow)으로 생성 → 나중에 에셋으로 교체 |

## 게임

| 폴더 | 게임 | 상태 | 문서 |
|---|---|---|---|
| `games/sea/` | 이세계 수군 (가제) — 이순신이 판타지 이세계에서 조선으로 돌아가는 FTL식 함선 운영 로그라이크 | 🛠 설계 중 | [ADR 0005](docs/adr/0005-genre-pirate-ship.md) · [핵심 설계](docs/sea/design/core.md) |
| `games/estate/` | 게으른 영주 (영지를 몰래 망하게 하는 경영) | 🧊 얼림 | [설계](docs/estate/design/economy.md) · [튜토리얼](docs/estate/design/tutorial-script.md) · [개발 일지](docs/estate/devlog/) |
| `games/boss/` | 학습하는 보스 (2D 소울라이크 · 3D 시험판 · 차원 전환) | 🧊 얼림 | [README](games/boss/README.md) · [설계](docs/boss/design/) · [개발 일지](docs/boss/devlog/) |

방향 전환 기록: [ADR](docs/adr/) · 아이디어: [아이디어 노트](docs/ideas/idea-notes.md) · 전체 계획(이력): [프로젝트 계획서](docs/00_project-plan.md)

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm install` | 처음 한 번 |
| `npm run dev` | 개발 서버 → http://localhost:5173/ 에서 게임 목록 |
| `npm test` | 모든 게임의 테스트 |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 배포용 빌드 (`dist/`) |
| `npx tsx games/estate/scripts/sim-economy.ts` | 영주 게임 경제 전략 봇 비교 |

## 폴더 구조

```
game-lab/
├─ index.html              # 게임 목록 (첫 화면)
├─ games/
│  └─ <게임>/
│     ├─ index.html        # 그 게임 페이지
│     ├─ src/              # 코드 (순수 로직 / 화면)
│     ├─ tests/            # Vitest
│     ├─ scripts/ tools/   # 시뮬레이션·그림 생성 도구 (있으면)
├─ public/<게임>/          # 그림 등 정적 파일 (URL: /<게임>/...)
├─ docs/
│  ├─ adr/                 # 큰 결정 (번호는 저장소 전체에서 이어짐)
│  ├─ ideas/               # 아이디어 노트
│  └─ <게임>/design, devlog
└─ .github/workflows/deploy.yml   # main에 푸시하면 테스트 → 빌드 → GitHub Pages
```

새 게임 추가: `games/<이름>/index.html` 만들고 → `vite.config.ts`의 `GAMES`에 한 줄 → 첫 화면 `index.html` 목록에 카드 하나.

## 개발 방식

AI 코딩 도구와 함께 만들며, 과정을 개발 일지와 [AI vs 직접 작성 기록](docs/ai-vs-manual.md)에 남긴다. 이해하지 못한 채 넘어간 코드는 [이해 부채 목록](docs/understanding-debt.md)에.
