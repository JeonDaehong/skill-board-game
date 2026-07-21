/**
 * Skill definitions for the deck-building / draft screen.
 *
 * Deck rule: pick any set of cards whose total `cost` is ≤ 5.
 * `type`      — active(턴에 발동) / passive(상시).
 * `cooldown`  — 재사용까지 쉬어야 하는 턴 수. null = 쿨타임 없음.
 * `usesPerGame` — 한 게임에서 쓸 수 있는 횟수. null = 무제한.
 * `image`     — 카드 아트 경로. null이면 placeholder. 나중에 채우면 됨.
 *
 * NOTE: 여기 있는 건 규칙 스펙(메타데이터)만이고, 실제 효과 로직은 아직 미구현.
 * 효과는 skill-engine 단계에서 chess-core 훅에 붙인다. [[skill-system-spec]]
 */
export type SkillType = "active" | "passive";

export interface Skill {
  id: string;
  name: string;
  cost: number;
  type: SkillType;
  cooldown: number | null;
  usesPerGame: number | null;
  desc: string;
  icon: string;
  image: string | null;
  /** "도박꾼" 계열(확률 발동) 표시용. */
  gambler?: boolean;
}

export const SKILLS: Skill[] = [
  {
    id: "retreat", name: "물러서기", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "폰을 뒤/좌/우로 한 칸 이동. 턴을 소모해 상대 턴으로 넘어감.",
    icon: "↩", image: null,
  },
  {
    id: "cross-diagonal", name: "십자와 대각", cost: 1, type: "active", cooldown: 5, usesPerGame: null,
    desc: "비숍을 가로·세로 1칸, 룩을 대각 1칸 이동(적 포획 가능). 턴 소모.",
    icon: "✚", image: null,
  },
  {
    id: "raid-march", name: "기습 행군", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "기물 하나를 이동 규칙 무시하고 1칸 이동. 이번 턴 그 기물은 포획 불가. 턴 소모 안 함.",
    icon: "⚑", image: null,
  },
  {
    id: "chaos", name: "혼란", cost: 1, type: "passive", cooldown: null, usesPerGame: null,
    desc: "게임 끝까지 양측 룩·비숍의 이동 역할이 뒤바뀐다(비숍=가로세로, 룩=대각).",
    icon: "⇆", image: null,
  },
  {
    id: "agile-knight", name: "민첩한 나이트", cost: 1, type: "passive", cooldown: null, usesPerGame: null,
    desc: "나이트가 장기 '상'처럼 앞-대각-대각 이동 가능(기존 이동도 선택 가능).",
    icon: "♘", image: null,
  },
  {
    id: "foresight", name: "선견지명", cost: 1, type: "active", cooldown: 3, usesPerGame: null,
    desc: "상대 스킬 카드 한 장을 지목해 무엇인지 확인한다.",
    icon: "◉", image: null,
  },
  {
    id: "iron-guard", name: "철벽 방어", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "킹 제외 기물 하나 지정. 다음 내 턴 시작까지 그 기물은 공격받지 않는다.",
    icon: "🛡", image: null,
  },
  {
    id: "sacrifice-pact", name: "희생의 계약", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "내 기물 하나를 제거하고, 대신 기물 3개를 움직인다(움직인 기물은 이번 턴 공격 불가).",
    icon: "✖", image: null,
  },
  {
    id: "phantom", name: "유령 기물", cost: 2, type: "active", cooldown: 3, usesPerGame: null,
    desc: "킹 제외 내 모든 기물이 이동 범위 내 아군을 뛰어넘어 이동 가능(적은 못 넘음). 턴 소모.",
    icon: "👻", image: null,
  },
  {
    id: "teleport", name: "순간이동", cost: 2, type: "active", cooldown: 5, usesPerGame: null,
    desc: "킹 제외 기물 둘의 위치를 서로 교환. 턴을 소모하고 마친다.",
    icon: "✦", image: null,
  },
  {
    id: "cloak", name: "은폐", cost: 2, type: "active", cooldown: null, usesPerGame: 2,
    desc: "5턴 동안 내 모든 기물이 상대에게 폰으로 보인다.",
    icon: "☁", image: null,
  },
  {
    id: "loyal-vassal", name: "용맹한 신하", cost: 2, type: "passive", cooldown: null, usesPerGame: 1,
    desc: "킹이 잡힐 때 폰이 살아있으면 킹↔폰 위치를 바꿔 폰이 대신 죽는다.",
    icon: "♟", image: null,
  },
  {
    id: "undo", name: "무르기", cost: 3, type: "active", cooldown: 5, usesPerGame: 5,
    desc: "상대의 방금 턴을 무효화하고 1턴 되돌린다(그 기물은 이번 턴 이동 불가, 죽은 기물 부활).",
    icon: "⟲", image: null,
  },
  {
    id: "one-more", name: "한번 더", cost: 3, type: "active", cooldown: 5, usesPerGame: 5,
    desc: "자신의 턴을 한 번 더 사용한다.",
    icon: "⥁", image: null,
  },
  {
    id: "revive-gamble", name: "부활 (도박꾼)", cost: 3, type: "active", cooldown: 3, usesPerGame: null, gambler: true,
    desc: "킹·퀸 제외 기물 지정. 확률로 죽은 기물 하나 부활(실패 시 지정 기물 폭발). 턴 소모 안 함. 폰50/마이너·룩30/퀸15%.",
    icon: "🎲", image: null,
  },
  {
    id: "evolve-gamble", name: "진화 (도박꾼)", cost: 3, type: "active", cooldown: 3, usesPerGame: null, gambler: true,
    desc: "킹·퀸 제외 기물 지정. 확률로 진화(실패 시 폭발). 턴 소모. 폰25%→마이너·룩, 마이너·룩10%→퀸.",
    icon: "🎲", image: null,
  },
  {
    id: "peasant-revolt", name: "농민 봉기", cost: 4, type: "passive", cooldown: null, usesPerGame: null,
    desc: "폰이 바로 앞에 있는 적 기물을 잡을 수 있다.",
    icon: "⚔", image: null,
  },
  {
    id: "kings-return", name: "왕의 귀환", cost: 4, type: "passive", cooldown: null, usesPerGame: 1,
    desc: "킹이 죽으면 원하는 위치에 부활하고 옆에 폰 2기 소환. 부활 턴엔 이동 불가(상대 턴으로).",
    icon: "♔", image: null,
  },
  {
    id: "titan-fusion", name: "융합 (거신병)", cost: 4, type: "active", cooldown: null, usesPerGame: 1,
    desc: "킹 옆 룩2·앞 퀸 배치 후 발동. 4칸 거신병으로 융합, 상하좌우·대각 4칸 이동하며 범위 내 적 전멸. 3번 피격 시 폭발=패배.",
    icon: "◆", image: null,
  },
  {
    id: "liberation", name: "해방", cost: 5, type: "active", cooldown: null, usesPerGame: 1,
    desc: "킹·폰 제외 모든 기물이 퀸으로 변한다. 스킬로 생긴 퀸은 5턴 후 폰으로 변함.",
    icon: "♛", image: null,
  },
];

/** 덱 코스트 상한. */
export const MAX_DECK_COST = 5;

export function skillById(id: string): Skill | undefined {
  return SKILLS.find((s) => s.id === id);
}
