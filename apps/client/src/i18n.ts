/**
 * UI language. English is the default; Korean is picked in Options and kept in
 * localStorage. Switching re-runs the current screen (see AppContext.reload).
 *
 * Korean card copy is written short on purpose: the card frame's parchment panel
 * is a fixed box, so translations are kept to roughly the length of the English
 * line rather than reusing the longer rules text.
 */
export type Lang = "en" | "ko";

const KEY = "skill-board:lang";

let current: Lang = read();

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "ko" ? "ko" : "en";
  } catch {
    return "en";
  }
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
  applyLangAttrs();
}

/** Keeps `<html lang>` honest and gives CSS a hook for per-language tweaks. */
export function applyLangAttrs(): void {
  document.documentElement.lang = current;
  document.documentElement.dataset.lang = current;
}

type Entry = readonly [en: string, ko: string];

export function t(key: keyof typeof STRINGS): string {
  const e = STRINGS[key];
  return current === "ko" ? e[1] : e[0];
}

/** Server- and engine-supplied text, translated on the way to the screen. */
export function tPassthrough(text: string): string {
  const e = (PASSTHROUGH as Record<string, Entry>)[text];
  return e ? (current === "ko" ? e[1] : e[0]) : text;
}

export const skillName = (id: string) => pick(SKILL_NAME, id);
export const skillDesc = (id: string) => pick(SKILL_DESC, id);

function pick(table: Record<string, Entry>, id: string): string {
  const e = table[id];
  return e ? (current === "ko" ? e[1] : e[0]) : id;
}

const STRINGS = {
  // menu
  "menu.single": ["Single Play", "혼자 하기"],
  "menu.online": ["Online", "온라인"],
  "menu.deck": ["Deck Builder", "덱 만들기"],
  "menu.option": ["OPTION", "설정"],
  "menu.quit": ["QUIT", "종료"],
  "menu.quitConfirm": ["Quit the game?", "게임을 종료할까요?"],
  "menu.quitDone": ["Game closed. You can close this window.", "게임을 종료했습니다. 창을 닫아주세요."],
  "nav.home": ["Home", "홈"],
  "nav.profile": ["Profile", "내 정보"],
  "nav.shop": ["Shop", "상점"],

  // common
  "common.back": ["← Back", "← 뒤로"],
  "common.leave": ["← Leave", "← 나가기"],
  "common.cancel": ["← Cancel", "← 취소"],
  "common.menu": ["Menu", "메뉴로"],
  "common.join": ["Join", "입장"],
  "common.ok": ["OK", "확인"],
  "common.save": ["Save", "저장"],
  "common.soon": ["Soon", "준비중"],
  "common.password": ["Password", "비밀번호"],

  // game picker
  "picker.title": ["Select Game", "게임 선택"],
  "picker.select": ["Select", "선택"],
  "picker.hint": ["← → to browse, tap the center card to start", "← → 로 넘기고, 가운데 카드를 눌러 시작"],
  "countdown.ready": ["GET READY", "준비"],
  "countdown.go": ["GO!", "시작!"],

  // online
  "multi.title": ["Online", "온라인 대전"],
  "multi.quick": ["Quick Match", "퀵스타트"],
  "multi.create": ["Create Room", "방 만들기"],
  "multi.join": ["Join Room", "참여하기"],
  "lobby.connecting": ["Connecting…", "서버에 연결 중…"],
  "lobby.waiting": ["Waiting for an opponent…", "상대를 기다리는 중…"],
  "lobby.hint": ["Matching you with another player in the same game", "같은 게임의 다른 플레이어와 매칭됩니다"],
  "room.name": ["Room name", "방 제목"],
  "room.passwordOptional": ["Password (optional — empty = public)", "비밀번호 (선택 — 비우면 공개방)"],
  "room.passwordIfAny": ["Password (if any)", "비밀번호 (있는 경우)"],
  "room.game": ["Game", "게임"],
  "room.hostNote": ["The host plays white and moves first.", "호스트가 백(선공)으로 시작합니다."],
  "room.create": ["Create room", "방 만들기"],
  "room.waitingTitle": ["Waiting Room", "방 대기실"],
  "room.inviteCode": ["Invite code", "초대코드"],
  "room.copy": ["Copy", "복사"],
  "room.copied": ["Copied ✓", "복사됨 ✓"],
  "room.waitingJoin": ["Waiting for an opponent to join…", "상대의 입장을 기다리는 중…"],
  "room.shareHint": ["Share the invite code with a friend", "친구에게 초대코드를 공유하세요"],
  "room.leave": ["← Leave room", "← 방 나가기"],
  "room.joinByCode": ["Join with an invite code", "초대코드로 입장"],
  "room.inviteCodePlaceholder": ["Invite code", "초대코드"],
  "room.openRooms": ["Open rooms", "열린 방"],
  "room.refresh": ["Refresh", "새로고침"],
  "room.none": ["No open rooms. Try creating one!", "열린 방이 없습니다. 방을 만들어 보세요!"],
  "room.needCode": ["Enter an invite code", "초대코드를 입력하세요"],

  // net
  "net.unreachable": ["Can't reach the server", "서버에 연결할 수 없습니다"],
  "net.unreachableHint": ["Can't reach the server — run `pnpm server` first", "서버에 연결할 수 없습니다 — `pnpm server` 실행이 필요합니다"],
  "net.closed": ["Connection closed", "연결이 종료되었습니다"],

  // in game
  "game.yourTurn": ["Your turn", "당신 차례"],
  "game.oppTurn": ["Opponent's turn…", "상대 차례…"],
  "game.you": ["You", "나"],
  "game.opponent": ["Opponent", "상대"],
  "game.toMove": ["● to move", "● 차례"],
  "game.white": ["White", "백"],
  "game.black": ["Black", "흑"],
  "game.first": ["First", "선공"],
  "game.second": ["Second", "후공"],
  "game.victory": ["Victory! 🎉", "승리! 🎉"],
  "game.defeat": ["Defeat", "패배"],
  "game.draw": ["Draw", "무승부"],
  "game.rematch": ["Rematch", "다시하기"],
  "game.waitingOpp": ["Waiting for opponent…", "상대 대기 중…"],
  "game.oppLeft": ["Opponent left", "상대가 나갔습니다"],
  "game.endTurn": ["End turn", "턴 종료"],
  "game.oppSkills": ["Opponent skills:", "상대 스킬:"],
  "skill.alwaysOn": ["Always on", "상시"],
  "skill.spent": ["Spent", "소진"],
  "skill.ready": ["Ready", "발동 가능"],

  // quoridor controls
  "quoridor.move": ["🚶 Move", "🚶 이동"],
  "quoridor.hwall": ["▬ H wall", "▬ 가로 벽"],
  "quoridor.vwall": ["▮ V wall", "▮ 세로 벽"],

  // deck builder
  "deck.title": ["Deck Builder", "덱 만들기"],
  "deck.save": ["Save deck", "덱 저장"],
  "deck.saved": ["Saved ✓", "저장됨 ✓"],
  "deck.yours": ["Your deck", "내 덱"],
  "deck.empty": ["Click a card to add it. Right-click to remove.", "카드를 누르면 추가, 우클릭하면 제거됩니다."],
  "deck.noMatch": ["No cards match these filters.", "조건에 맞는 카드가 없습니다."],
  "deck.all": ["All", "전체"],
  "deck.active": ["Active", "액티브"],
  "deck.passive": ["Passive", "패시브"],
  "deck.cost": ["Cost", "코스트"],
  "deck.type": ["Type", "종류"],
  "deck.cooldown": ["Cooldown", "쿨타임"],
  "deck.uses": ["Uses", "사용"],
  "deck.rules": [
    "Hand {hand} · {min} min · {byo}s byoyomi · max {copies} copies — card effects coming soon",
    "손패 {hand}장 · {min}분 · 초읽기 {byo}초 · 같은 카드 최대 {copies}장 — 카드 효과는 준비 중",
  ],

  // profile / shop / options
  "profile.title": ["Profile", "내 정보"],
  "profile.edit": ["Edit name", "닉네임 수정"],
  "profile.cancelEdit": ["Cancel", "취소"],
  "profile.newPlayer": ["Lv.1 · New player", "Lv.1 · 신규 플레이어"],
  "profile.rank": ["Rank", "랭크"],
  "profile.wins": ["Wins", "승"],
  "profile.losses": ["Losses", "패"],
  "profile.winRate": ["Win rate", "승률"],
  "profile.unranked": ["Unranked", "언랭크"],
  "profile.recent": ["Recent matches", "최근 대전"],
  "profile.noRecords": ["No records", "기록 없음"],
  "profile.soon": ["Stats and ranking are coming soon.", "전적·랭킹 시스템은 준비 중입니다."],
  "shop.title": ["Shop", "상점"],
  "shop.soon": ["The shop opens alongside the card deck system.", "상점은 카드 덱 시스템과 함께 열립니다."],
  "option.title": ["Option", "설정"],
  "option.sound": ["Sound", "사운드"],
  "option.boardTheme": ["Board theme", "보드 테마"],
  "option.language": ["Language", "언어"],
  "option.comingSoon": ["Coming soon", "준비중"],
} as const satisfies Record<string, Entry>;

/** Text produced outside the client (server replies, engine events, results). */
const PASSTHROUGH = {
  "Five in a row": ["Five in a row", "5목"],
  "Board full": ["Board full", "무승부"],
  "General captured": ["General captured", "장 포획"],
  Checkmate: ["Checkmate", "외통"],
  "Reached the goal": ["Reached the goal", "골인"],
  "Room not found": ["Room not found", "방을 찾을 수 없습니다"],
  "Wrong password": ["Wrong password", "비밀번호가 틀렸습니다"],
} as const satisfies Record<string, Entry>;

export const GAME_NAME: Record<string, Entry> = {
  chess: ["Chess", "체스"],
  janggi: ["Janggi", "장기"],
  omok: ["Gomoku", "오목"],
};
export const GAME_TAGLINE: Record<string, Entry> = {
  chess: ["Classic", "클래식"],
  janggi: ["Korean chess", "궁성 대결"],
  omok: ["Five in a row", "5목 승부"],
};
export const gameName = (id: string) => pick(GAME_NAME, id);
export const gameTagline = (id: string) => pick(GAME_TAGLINE, id);

export const SHOP_ITEM: Record<string, Entry> = {
  "pack-starter": ["Starter Pack", "스타터 카드팩"],
  "queen-gold": ["Gold Piece Skin", "골드 기물 스킨"],
  "pack-premium": ["Premium Pack", "프리미엄 카드팩"],
  "theme-board": ["Neon Board Theme", "네온 보드 테마"],
  boost: ["Boost Pass", "부스트 패스"],
  trophy: ["Season Pass", "시즌 패스"],
};
export const SHOP_DESC: Record<string, Entry> = {
  "pack-starter": ["5 random skill cards", "스킬 카드 5장 랜덤"],
  "queen-gold": ["Premium chess piece set", "체스 기물 프리미엄 스킨"],
  "pack-premium": ["Higher rare card odds", "희귀 카드 확률 UP"],
  "theme-board": ["Board background theme", "보드 배경 테마"],
  boost: ["Double XP for 7 days", "경험치 2배 (7일)"],
  trophy: ["Unlocks the season reward track", "시즌 보상 트랙 해금"],
};
export const shopItem = (id: string) => pick(SHOP_ITEM, id);
export const shopDesc = (id: string) => pick(SHOP_DESC, id);

const SKILL_NAME: Record<string, Entry> = {
  retreat: ["Retreat", "물러서기"],
  "cross-diagonal": ["Cross & Diagonal", "십자와 대각"],
  "raid-march": ["Raid March", "기습 행군"],
  chaos: ["Chaos", "혼란"],
  "agile-knight": ["Agile Knight", "민첩한 나이트"],
  foresight: ["Foresight", "선견지명"],
  "iron-guard": ["Iron Guard", "철벽 방어"],
  "sacrifice-pact": ["Sacrifice Pact", "희생의 계약"],
  phantom: ["Phantom", "유령 기물"],
  teleport: ["Teleport", "순간이동"],
  cloak: ["Cloak", "은폐"],
  "loyal-vassal": ["Loyal Vassal", "용맹한 신하"],
  undo: ["Undo", "무르기"],
  "one-more": ["One More", "한번 더"],
  "revive-gamble": ["Revive (Gambler)", "부활 (도박)"],
  "evolve-gamble": ["Evolve (Gambler)", "진화 (도박)"],
  "peasant-revolt": ["Peasant Revolt", "농민 봉기"],
  "kings-return": ["King's Return", "왕의 귀환"],
  "titan-fusion": ["Fusion (Titan)", "융합 (거신병)"],
  liberation: ["Liberation", "해방"],
};

const SKILL_DESC: Record<string, Entry> = {
  retreat: [
    "Move a pawn one square back, left or right. Uses your turn.",
    "폰을 뒤·좌·우로 한 칸 옮긴다. 턴 소모.",
  ],
  "cross-diagonal": [
    "Move a bishop 1 square orthogonally, or a rook 1 square diagonally (may capture). Uses your turn.",
    "비숍은 직선, 룩은 대각으로 한 칸(포획 가능). 턴 소모.",
  ],
  "raid-march": [
    "Move one piece 1 square ignoring its move rules. It can't be captured this turn. Does not use your turn.",
    "기물 하나를 규칙 무시하고 한 칸. 이번 턴 포획 불가. 턴 유지.",
  ],
  chaos: [
    "For the rest of the game both sides' rooks and bishops swap roles (bishop = orthogonal, rook = diagonal).",
    "게임 내내 양측 룩·비숍의 이동이 뒤바뀐다.",
  ],
  "agile-knight": [
    "Knights may also move like a Janggi elephant: forward-diagonal-diagonal (normal moves still allowed).",
    "나이트가 장기 상처럼 앞-대각-대각으로도 움직인다.",
  ],
  foresight: [
    "Point at one of the opponent's skill cards to reveal what it is.",
    "상대 스킬 카드 한 장을 지목해 확인한다.",
  ],
  "iron-guard": [
    "Pick one piece other than the king. It can't be attacked until your next turn begins.",
    "킹 외 기물 하나가 내 다음 턴까지 공격받지 않는다.",
  ],
  "sacrifice-pact": [
    "Destroy one of your pieces to move three pieces instead (those pieces can't capture this turn).",
    "내 기물 하나를 잃고 기물 3개를 움직인다(포획 불가).",
  ],
  phantom: [
    "All your pieces except the king may jump over allies within their range (not over enemies). Uses your turn.",
    "킹 외 기물이 아군을 뛰어넘는다(적은 불가). 턴 소모.",
  ],
  teleport: [
    "Swap the positions of two of your pieces (not the king). Uses your turn and ends it.",
    "킹 외 기물 둘의 위치를 맞바꾼다. 턴 소모.",
  ],
  cloak: [
    "For 5 turns all your pieces look like pawns to the opponent.",
    "5턴 동안 내 기물이 상대에게 폰으로 보인다.",
  ],
  "loyal-vassal": [
    "When your king would be taken and a pawn is alive, they swap places and the pawn dies instead.",
    "킹이 잡힐 때 폰과 자리를 바꿔 폰이 대신 죽는다.",
  ],
  undo: [
    "Cancel the opponent's last turn and rewind one turn (that piece can't move this turn; captured pieces return).",
    "상대의 방금 턴을 무효화하고 한 턴 되돌린다.",
  ],
  "one-more": ["Take one extra turn.", "자신의 턴을 한 번 더 사용한다."],
  "revive-gamble": [
    "Pick a piece other than king or queen. Chance to revive a captured piece (on failure the picked piece explodes). Does not use your turn. Pawn 50% / minor·rook 30% / queen 15%.",
    "확률로 죽은 기물을 부활(실패 시 폭발). 턴 유지. 폰50·마이너30·퀸15%.",
  ],
  "evolve-gamble": [
    "Pick a piece other than king or queen. Chance to evolve it (on failure it explodes). Uses your turn. Pawn 25% → minor·rook, minor·rook 10% → queen.",
    "확률로 기물을 진화(실패 시 폭발). 턴 소모. 폰25%·마이너10%.",
  ],
  "peasant-revolt": [
    "Pawns may capture the enemy piece directly in front of them.",
    "폰이 바로 앞의 적 기물을 잡을 수 있다.",
  ],
  "kings-return": [
    "When your king dies it revives on a square you choose and summons 2 pawns beside it. It can't move on the revival turn.",
    "킹이 죽으면 원하는 칸에 부활하고 폰 2기를 부른다.",
  ],
  "titan-fusion": [
    "Cast with 2 rooks beside the king and the queen in front. They fuse into a 4-square Titan that moves up to 4 squares in any direction, wiping out enemies in range. Explodes on the 3rd hit — you lose.",
    "룩2·퀸을 킹 옆에 모아 거신병으로 융합. 4칸 이동하며 범위 내 적 전멸. 3회 피격 시 패배.",
  ],
  liberation: [
    "Every piece except kings and pawns becomes a queen. Queens made this way revert to pawns after 5 turns.",
    "킹·폰 외 모든 기물이 퀸이 된다. 5턴 후 폰으로.",
  ],
};
