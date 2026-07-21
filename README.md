# Skill Board Game

스킬 보드게임. 1단계는 **정통 체스**를 코드로만(에디터 없이) 구현하고, 이후 스킬 시스템 → 멀티플레이어 → Steam(PC) / Google Play(모바일)로 확장한다.

## 기술 스택

- **TypeScript** 순수 코드 — GUI 에디터 없음
- **렌더링**: HTML Canvas (이미지 에셋 없이 유니코드 글리프)
- **빌드/개발**: Vite
- **테스트**: Vitest
- **패키지 관리**: pnpm workspace (모노레포)

향후: 멀티는 Node + WebSocket(`apps/server`), Steam은 Tauri/Electron 래핑, 모바일은 Capacitor.

## 구조

```
skill-board-game/
├── packages/
│   └── chess-core/     순수 체스 규칙 엔진 (DOM 없음, 완전 테스트됨)
│       └── src/
│           ├── types.ts    타입 정의 (Piece, Move, GameState...)
│           ├── board.ts     보드/FEN 파싱·직렬화, 좌표 변환
│           ├── moves.ts     이동 생성·공격 판정·이동 적용
│           ├── game.ts       ChessGame 클래스 + 승패/무승부 판정
│           └── perft.ts      이동생성 검증용 perft
└── apps/
    └── client/         Vite 앱 — 화면 라우터 기반 (프레임워크 없음, 순수 DOM/Canvas)
        └── src/
            ├── main.ts            부트스트랩 (라우터 → 메인 메뉴)
            ├── router.ts          화면 전환 라우터 + DOM 헬퍼
            ├── games.ts           캐러셀 게임 목록 (체스 외 6칸)
            ├── render.ts          Canvas 보드/말 렌더러
            ├── screens/
            │   ├── menu.ts        메인 메뉴 (Single/Multi/Option/Quit)
            │   ├── select.ts      coverflow 게임 선택 캐러셀
            │   ├── countdown.ts   3·2·1 카운트다운
            │   └── option.ts      설정(플레이스홀더)
            └── chess/
                ├── controller.ts  체스 화면 (입력·프로모션·게임오버·AI 연결)
                └── ai.ts          negamax + alpha-beta AI (chess-core 재사용)
```

**핵심 설계 원칙**: 규칙 로직(`chess-core`)은 렌더링·네트워크와 완전히 분리한다.
같은 엔진을 클라이언트 + 서버(멀티) + 모바일에서 재사용하고, GUI 없이 유닛
테스트로 규칙을 검증하며, 나중에 "스킬"을 붙일 때 로직만 확장한다.

## 실행

```bash
pnpm install
pnpm dev              # 클라이언트 개발 서버 (http://localhost:5173)
pnpm test             # 전체 테스트
pnpm build            # 전체 빌드
```

## 구현 현황

- [x] 정통 체스 규칙 (이동, 캐슬링, 앙파상, 프로모션)
- [x] 체크 / 체크메이트 / 스테일메이트 / 무승부(50수·기물부족) 판정
- [x] perft 검증 (start depth 4 = 197,281, Kiwipete depth 3 = 97,862 통과)
- [x] Canvas 렌더링 + 클릭 이동 + 합법수 하이라이트 + 보드 뒤집기
- [x] 메인 메뉴 + coverflow 게임 선택 캐러셀(7칸) + 3·2·1 카운트다운
- [x] AI 상대 (negamax + alpha-beta, 기물+위치 평가)
- [ ] 오목 등 나머지 게임 6종
- [ ] 스킬 시스템 (말에 능력 부여)
- [ ] 멀티플레이어 (서버 권위형)
- [ ] Steam(PC) 패키징 (Tauri/Electron)
- [ ] 모바일(Google Play) 패키징 (Capacitor)
