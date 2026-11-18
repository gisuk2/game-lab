# 이세계 수군 (가제)

> 판타지 이세계의 바다에 떨어진 이순신이 조선으로 돌아가는 여정. FTL의 규칙(실시간 + 일시정지 함선 운영)을 뼈대로, 조선 수군 고증 무기와 바다만의 상호작용(침수, 등선 육박전, 날씨)을 더한다.

| 항목 | 내용 |
|---|---|
| 상태 | 🛠 개발 중 — SEA-1 전투 한 판 실험판 ✅, 다음: SEA-2 한 바다 |
| 결정 | [ADR 0005](../../docs/adr/0005-genre-pirate-ship.md) |
| 설계 | [핵심 설계](../../docs/sea/design/core.md) |
| 할 일 | [추후 패치 예정](../../docs/sea/backlog.md) |
| 개발 일지 | [SEA-1 전투 실험판](../../docs/sea/devlog/2026-11-19-sea1-battle.md) |

## 구조
- `src/sim/` 순수 로직 (화면 없음): `data.ts` 배·무기·진법 데이터, `battle.ts` 전투 한 판, `encounter.ts` 정찰 판정, `bot.ts` 봇
- `src/app/` 캔버스 화면: `SeaApp.ts`, `layout.ts`(단면 좌표), `sea.css`
- `tests/` 로직 테스트 · `scripts/sim-battle.ts` 봇 대결 (`npx tsx games/sea/scripts/sim-battle.ts 1000`)

실행: `npm run dev` → http://localhost:5173/games/sea/
