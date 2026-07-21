# @skill/engine — 공유 결정론적 게임 엔진

멀티플레이의 토대. 지금 `apps/client/src/chess/controller.ts`에 UI와 뒤엉켜 있는
"행동 → 상태" 로직을 **순수 함수(reducer)**로 뽑아낸 것. 서버와 클라이언트가
**같은 `reduce()`를 호출**하므로 두 화면이 절대 갈라지지 않는다.

## 핵심 개념

```
reduce(state: MatchState, action: Action, rng: Rng) → ReduceResult
```

- **`MatchState`** — 직렬화 가능한 전체 게임 상태(보드 + 양측 스킬 런타임 + 거신병 +
  타이머 + 무덤…). `structuredClone`으로 복제되며 reducer는 입력을 절대 변형하지 않음.
- **`Action`** — 클라가 보내는 의도(직렬화 가능). 다단계 스킬(희생·부활 배치·왕의 귀환)은
  한 단계에 하나씩 액션을 보낸다.
- **`Rng`** — 결정론적 난수원. **도박꾼(진화·부활)은 서버가 소유한 rng로 처리**해서
  양쪽 결과가 일치한다. (`reduce.test.ts`에서 증명)
- **`ReduceResult`** — `{ok:true, state, events}` 또는 `{ok:false, error}`.
  잘못된/불법 액션은 거부된다(서버 권위).

## 멀티플레이 흐름

```
[클라 A] action ──► [서버] reduce(권위적, rng 소유) ──► 상태/이벤트 브로드캐스트 ──► [클라 A·B] 렌더
```

- 서버는 방(room)마다 `MatchState`를 들고, 받은 액션을 `reduce`로 검증·적용 후 결과를
  양쪽에 보냄.
- **은닉 정보**(선견지명·은폐)는 서버가 각 클라에게 **다른 뷰**를 보내면 됨
  (상대 덱은 개수만, revealed된 것만 공개).

## 포팅 현황 — **20/20 스킬 전부 완료** ✅

| 분류 | Action | 비고 |
|------|--------|------|
| 일반 수 | `move` | 포획→무덤, 보호/해방퀸 추적, 무르기 스냅샷 |
| 기권 | `resign` | |
| 이동 변형 | `retreat` · `cross-diagonal` · `raid-march` · `phantom-move` | 킹안전 검증, 기습행군은 턴 유지 |
| 버프/메타 | `iron-guard` · `one-more` · `cloak` · `foresight` | |
| 순간이동 | `teleport` | |
| 도박꾼 | `evolve` · `revive`(+`revive-place`) | **rng 주입 → 결정론** |
| 다단계 | `sacrifice-start/move/end` | `pending`으로 단계 진행 |
| 무르기 | `undo` | `state.undo` 복원 + 상대 기물 잠금 |
| 해방 | `liberation` | tempQueens + 5턴 타이머(onTurnStart) |
| 사망 인터셉트 | (자동) `loyal-vassal` / `kings-return`(+place) | `resolveEnding`에서 훅 |
| 거신병 | `titan-fuse` · `titan-move` | 피격은 `move`가 titan 칸 감지→`titanHit` |
| 패시브 | — | 혼란/민첩/농민: `deriveRules`에서 자동 |

`reduce.test.ts` 19개로 검증 (결정론·불변·다단계·사망인터셉트·거신병 격파 포함).

## 다음 단계

1. **`packages/server`** — Node + `ws`. 방/매칭, 액션 검증(`reduce`), 브로드캐스트, 재접속.
   서버가 rng 소유(도박꾼 결정론), 은닉정보(선견/은폐)는 클라별 뷰 필터.
2. **`apps/client` 리팩터** — 컨트롤러가 로컬 상태를 직접 만지는 대신 **액션 발행**
   (싱글: 인프로세스 `reduce`, 멀티: 서버 전송) → **받은 `MatchState` 렌더**.
   ⚠️ 지금 클라의 controller.ts는 아직 옛 방식(로컬 상태 직접 조작)이라, 이 리팩터 전까진
   싱글 플레이는 기존 코드로 동작하고 엔진은 병행 존재.
