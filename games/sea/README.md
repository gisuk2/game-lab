# 이세계 수군 (가제)

> 판타지 이세계의 바다에 떨어진 이순신이 조선으로 돌아가는 여정. FTL의 규칙(실시간 + 일시정지 함선 운영)을 뼈대로, 조선 수군 고증 무기와 바다만의 상호작용(침수, 등선 육박전, 날씨)을 더한다.

| 항목 | 내용 |
|---|---|
| 상태 | 🛠 개발 중 — SEA-1 전투 ✅, SEA-2 한 바다 첫 묶음 ✅ (지도·보상·항구), 다음: 이벤트·유물 |
| 결정 | [ADR 0005](../../docs/adr/0005-genre-pirate-ship.md) |
| 설계 | [핵심 설계](../../docs/sea/design/core.md) · [방향: FTL에서 살릴 것·고칠 것](../../docs/sea/design/direction.md) · [유물 50개](../../docs/sea/design/relics.md) |
| 할 일 | [추후 패치 예정](../../docs/sea/backlog.md) |
| 개발 일지 | [SEA-1 전투 실험판](../../docs/sea/devlog/2026-11-19-sea1-battle.md) · [SEA-2 한 바다](../../docs/sea/devlog/2026-11-19-sea2-voyage.md) |

## 구조
- `src/sim/` 순수 로직 (화면 없음): `data.ts` 배·무기·진법 데이터, `battle.ts` 전투 한 판, `encounter.ts` 정찰 판정, `bot.ts` 봇
- `src/run/` 한 바다 항해 (화면 없음): `map.ts` 지도, `run.ts` 항해 상태, `enemies.ts` 적 배, `runbot.ts` 항해 봇
- `src/app/` 캔버스 화면: `RunApp.ts`(지도·보상·항구), `SeaApp.ts`, `layout.ts`(평면 좌표), `sea.css`
- `tests/` 로직 테스트 · `scripts/sim-battle.ts` 봇 대결 (`npx tsx games/sea/scripts/sim-battle.ts 1000`)

실행: `npm run dev` → http://localhost:5173/games/sea/ (한 바다 항해) · `?mode=battle` (전투 한 판) · `?seed=5` (같은 지도)
