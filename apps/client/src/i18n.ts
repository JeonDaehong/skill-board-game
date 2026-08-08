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

/**
 * Names and rules text for any card id, skill or piece. Screens that show cards
 * — the deck builder, the hand, the shop — never need to know which kind they
 * are holding, so they call these rather than branching themselves.
 */
export const cardName = (id: string) =>
  id.startsWith("piece:") ? pick(PIECE_CARD_NAME, id) : skillName(id);
export const cardDesc = (id: string) =>
  id.startsWith("piece:") ? pick(PIECE_CARD_DESC, id) : skillDesc(id);

function pick(table: Record<string, Entry>, id: string): string {
  const e = table[id];
  return e ? (current === "ko" ? e[1] : e[0]) : id;
}

const STRINGS = {
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
  "common.back": ["← Back", "← 뒤로"],
  "common.leave": ["← Leave", "← 나가기"],
  "common.cancel": ["← Cancel", "← 취소"],
  "common.menu": ["Menu", "메뉴로"],
  "common.join": ["Join", "입장"],
  "common.ok": ["OK", "확인"],
  "common.save": ["Save", "저장"],
  "common.soon": ["Soon", "준비중"],
  "common.password": ["Password", "비밀번호"],
  "mode.title": ["Select Mode", "모드 선택"],
  "mode.hint": ["Pick how you want to play chess", "체스를 어떤 방식으로 즐길지 고르세요"],
  "mode.deckNeeded": ["Deck not ready", "덱 미완성"],
  "mode.deckReady": ["Deck ready", "덱 준비 완료"],
  "mode.buildDeck": ["Build deck", "덱 만들기"],
  "mode.deckShort": [
    "Your {mode} deck needs exactly {want} cards — it has {have}.",
    "{mode} 덱은 정확히 {want}장이어야 해요 — 현재 {have}장.",
  ],
  "mode.board": ["Board", "보드"],
  "mode.deck": ["Deck", "덱"],
  "mode.noDeck": ["No deck", "덱 없음"],
  "picker.title": ["Select Game", "게임 선택"],
  "picker.select": ["Select", "선택"],
  "picker.hint": ["← → to browse, tap the center card to start", "← → 로 넘기고, 가운데 카드를 눌러 시작"],
  "picker.soon": [
    "This game is still in the works — chess is playable now",
    "아직 준비중인 게임입니다 — 지금은 체스만 플레이할 수 있어요",
  ],
  "setup.difficulty": ["Difficulty", "난이도"],
  "setup.side": ["Your Side", "진영"],
  "setup.start": ["Start", "시작"],
  "setup.first": ["moves first", "선공"],
  "setup.second": ["moves second", "후공"],
  "setup.clock": ["Time Control", "시간 설정"],
  "clock.subUntimed": ["No clock", "시간 제한 없음"],
  "clock.subMain": ["{min} min, sudden death", "{min}분, 추가 시간 없음"],
  "clock.subIncrement": ["{min} min + {sec}s per move", "{min}분 + 매 수 {sec}초"],
  "clock.subByoyomi": ["{min} min, then {sec}s per move", "{min}분 후 매 수 {sec}초"],
  "clock.noteUntimed": ["No clock — take as long as you like.", "시간 제한 없이 원하는 만큼 생각할 수 있어요."],
  "clock.noteSudden": ["Sudden death: run out and you lose.", "추가 시간 없음 — 다 쓰면 시간패."],
  "clock.noteIncrement": [
    "Every move you complete adds {step}s back, so you never drop below {step}s per move.",
    "한 수를 둘 때마다 {step}초가 더해져요. 본 시간을 다 써도 한 수당 {step}초는 남습니다.",
  ],
  "clock.noteByoyomi": [
    "When the main time runs out you get {step}s per move — unused time does not carry over.",
    "본 시간을 다 쓰면 매 수마다 {step}초 초읽기. 남은 초는 다음 수로 넘어가지 않아요.",
  ],
  "setup.think": ["max", "최대"],
  "setup.depth": ["Looks ahead up to", "내다보는 수"],
  "countdown.ready": ["GET READY", "준비"],
  "countdown.go": ["GO!", "시작!"],
  "multi.title": ["Online", "온라인 대전"],
  "multi.quick": ["Quick Match", "퀵 매치"],
  "multi.quickNormal": ["Quick Match — Normal", "퀵 매치 — 일반"],
  "multi.quickRanked": ["Quick Match — Ranked", "퀵 매치 — 랭크"],
  "multi.create": ["Create Room", "방 만들기"],
  "multi.join": ["Join Room", "참여하기"],
  "lobby.connecting": ["Connecting…", "서버에 연결 중…"],
  "lobby.waiting": ["Waiting for an opponent…", "상대를 기다리는 중…"],
  "lobby.hint": ["Matching you with another player in the same game", "같은 게임의 다른 플레이어와 매칭됩니다"],
  "lobby.timeControl": ["Time control", "시간 설정"],
  "room.name": ["Room name", "방 제목"],
  "room.passwordOptional": ["Password (optional — empty = public)", "비밀번호 (선택 — 비우면 공개방)"],
  "room.passwordIfAny": ["Password (if any)", "비밀번호 (있는 경우)"],
  "room.game": ["Game", "게임"],
  "room.mode": ["Mode", "모드"],
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
  "lobby.players": ["Players", "플레이어"],
  "lobby.stands": ["Spectators", "관전석"],
  "lobby.seatHost": ["Host", "방장"],
  "lobby.seatGuest": ["Player 2", "플레이어 2"],
  "lobby.seatWatch": ["Spectator", "관전"],
  "lobby.seatEmpty": ["Empty", "비어 있음"],
  "lobby.anon": ["Guest", "손님"],
  "lobby.you": ["You", "나"],
  "lobby.start": ["Start match", "대국 시작"],
  "lobby.toSeat": ["Take the seat", "플레이어로 참여"],
  "lobby.toStands": ["Move to the stands", "관전석으로"],
  "lobby.needGuest": ["Waiting for a second player.", "두 번째 플레이어를 기다리는 중입니다."],
  "lobby.readyHost": ["Everyone is seated — start when you like.", "자리가 찼습니다. 원할 때 시작하세요."],
  "lobby.waitHost": ["Waiting for the host to start.", "방장이 시작하기를 기다리는 중입니다."],
  "room.watch": ["Watch", "관전"],
  "room.watchFull": ["Full", "관전 마감"],
  "room.watchCount": ["in progress · {n}/{max} watching", "진행 중 · 관전 {n}/{max}"],
  "room.needCode": ["Enter an invite code", "초대코드를 입력하세요"],
  "net.unreachable": ["Can't reach the server", "서버에 연결할 수 없습니다"],
  "net.unreachableHint": [
    "Can't reach the server — run `pnpm server` first",
    "서버에 연결할 수 없습니다 — `pnpm server` 실행이 필요합니다",
  ],
  "net.closed": ["Connection closed", "연결이 종료되었습니다"],
  "game.yourTurn": ["Your turn", "당신 차례"],
  "game.turnMine": ["Your turn", "나의 턴"],
  "game.turnTheirs": ["Opponent's turn", "상대 턴"],
  "game.leaveTitle": ["Leave the match?", "나가시겠습니까?"],
  "game.leaveWarn": ["It will be recorded as a loss.", "패배로 기록됩니다."],
  "game.leaveYes": ["Leave", "나가기"],
  "game.oppTurn": ["Opponent's turn…", "상대 차례…"],
  "game.you": ["You", "나"],
  "game.opponent": ["Opponent", "상대"],
  "game.seatWhite": ["White", "백"],
  "game.seatBlack": ["Black", "흑"],
  "game.watching": ["Watching", "관전 중"],
  "game.watchers": ["{n} watching", "관전 {n}명"],
  "game.watchEnded": ["The match is over.", "대국이 끝났습니다."],
  "game.watchWon": ["{name} wins", "{name} 승리"],
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
  "play.hand": ["Hand", "손패"],
  "play.cost": ["Cost", "코스트"],
  "play.deckLeft": ["Deck", "덱"],
  "play.discard": ["Discard", "버린 카드"],
  "play.inPlay": ["In play", "지속 효과"],
  "play.phaseDraw": ["Draw", "드로우"],
  "play.phaseSummon": ["Summon", "기물 소환"],
  "play.phaseSkill": ["Skill card", "스킬 카드"],
  "play.phaseMove": ["Move & attack", "이동 및 공격"],
  "play.next": ["Next", "다음"],
  // What to actually do on the step you are on. The steps were labelled from
  // the start but never said what the click was, so knowing you were on "Skill
  // card" did not tell you that the card comes out of your own hand.
  "play.doDraw": ["Click your deck", "덱을 클릭하세요"],
  "play.doSummon": ["Play a piece card, or skip", "기물 카드를 내거나 넘기세요"],
  "play.doSkill": ["Play a card from hand, or skip", "손패에서 카드를 사용하거나 넘기세요"],
  "play.doMove": ["Move a piece", "기물을 움직이세요"],
  "play.waitTheirs": ["Waiting for the opponent", "상대를 기다리는 중"],
  "play.handEmpty": ["No cards in hand", "손패가 비었습니다"],
  "play.freeMovesTitle": ["Free moves", "추가 이동"],
  "play.arrangeTitle": ["Put them back", "덱에 되돌리기"],
  "play.speedNormal": ["Normal", "일반"],
  "play.speedQuick": ["Quick", "속공"],
  "play.speedCounter": ["Counter", "대응"],
  "play.moveSpent": [
    "You played a normal card — no piece move this turn.",
    "일반 카드를 사용해 이번 턴에는 기물을 움직일 수 없어요.",
  ],
  "play.notMoveStep": [
    "Pieces move on the Move & attack step — use Next to get there.",
    "기물은 '이동 및 공격' 단계에서만 움직일 수 있어요. '다음'을 눌러 진행하세요.",
  ],
  "play.refused": [
    "That could not be done — nothing changed.",
    "그 선택은 처리할 수 없어요. 판은 그대로입니다.",
  ],
  "play.tooExpensive": ["Not enough cost", "코스트 부족"],
  "play.counterOnly": ["Played on the opponent's turn", "상대 턴에 발동"],
  "play.summonSick": ["Summoned this turn", "이번 턴 소환됨"],
  "draw.title": ["Your hand is full", "손패가 가득 찼어요"],
  "draw.body": [
    "You hold {n} cards. Skip the draw, or draw one and pitch one.",
    "카드 {n}장을 들고 있어요. 드로우를 건너뛰거나, 뽑고 한 장을 버리세요.",
  ],
  "draw.skip": ["Skip the draw", "드로우 건너뛰기"],
  "draw.take": ["Draw, then discard", "뽑고 버리기"],
  "draw.pick": ["Pick a card to discard", "버릴 카드를 고르세요"],
  "draw.pickBody": ["Click a card in your hand to pitch it.", "손패에서 버릴 카드를 누르세요."],
  "summon.pick": ["Pick a square in your summoning zone", "소환 구역의 칸을 고르세요"],
  "summon.zone": ["Your back three ranks", "자신의 뒤쪽 3줄"],
  "summon.cannotMove": [
    "A piece summoned this turn cannot move until your next turn.",
    "이번 턴에 소환한 기물은 다음 턴부터 움직일 수 있어요.",
  ],
  "counter.title": ["Respond?", "대응할까요?"],
  "counter.body": ["The opponent's action can be answered with a counter card.", "상대의 행동에 대응 카드를 발동할 수 있어요."],
  "counter.pass": ["Let it happen", "그냥 넘기기"],
  "counter.waitTitle": ["Responding…", "상대가 대응 중"],
  "counter.waitingWatch": ["{name} is deciding whether to respond…", "{name}님이 대응할지 고르는 중이에요."],
  "counter.waiting": ["Opponent is deciding whether to respond…", "상대가 대응 카드로 대응할지 고르는 중이에요."],
  "counter.trigMove": ["they moved a piece", "상대가 기물을 움직였습니다"],
  "counter.trigCapture": ["they captured a piece", "상대가 기물을 잡았습니다"],
  "counter.trigSkill": ["they played a skill card", "상대가 스킬 카드를 냈습니다"],
  "counter.trigSummon": ["they summoned a piece", "상대가 기물을 소환했습니다"],
  "counter.trigCheck": ["they put your king in check", "상대가 체크를 걸었습니다"],
  "quoridor.move": ["🚶 Move", "🚶 이동"],
  "quoridor.hwall": ["▬ H wall", "▬ 가로 벽"],
  "quoridor.vwall": ["▮ V wall", "▮ 세로 벽"],
  "deck.title": ["Deck Builder", "덱 만들기"],
  "deck.save": ["Save deck", "덱 저장"],
  "deck.saved": ["Saved ✓", "저장됨 ✓"],
  "deck.yours": ["Your deck", "내 덱"],
  "deck.empty": ["Click a card to add it. Right-click to remove.", "카드를 누르면 추가, 우클릭하면 제거됩니다."],
  "deck.noMatch": ["No cards match these filters.", "조건에 맞는 카드가 없습니다."],
  "deck.all": ["All", "전체"],
  "deck.active": ["Active", "액티브"],
  "deck.passive": ["Passive", "패시브"],
  "deck.enchant": ["Enchant", "부여"],
  "deck.lasting": ["Lasting", "지속"],
  "deck.detail": ["Take a closer look", "자세히 보기"],
  "kind.normal": ["Normal", "일반"],
  "kind.quick": ["Quick", "속공"],
  "kind.enchant": ["Enchant", "부여"],
  "kind.lasting": ["Lasting", "지속"],
  "kind.counter": ["Counter", "대응"],
  "kind.normalNote": ["Uses your piece move for the turn", "사용하면 그 턴에 기물을 움직일 수 없음"],
  "kind.quickNote": ["Play it and still move a piece", "코스트만 있으면 기물도 움직일 수 있음"],
  "kind.enchantNote": ["Sticks to a piece until dispelled", "기물에 효과를 부여. 해제 전까지 유지"],
  "kind.lastingNote": ["Stays in play until destroyed", "파괴되기 전까지 효과가 유지됨"],
  "kind.counterNote": ["Held in hand, fired on their turn", "패에 든 채 상대 행동에 반응해 발동"],
  "log.played": ["{who} played {card}", "{who} — {card} 사용"],
  "log.summoned": ["{who} summoned {card}", "{who} — {card} 소환"],
  "log.drew": ["{who} drew {card}", "{who} — {card} 뽑음"],
  "log.drewHidden": ["{who} drew a card", "{who} — 카드 1장 뽑음"],
  "log.destroyed": ["{card} was destroyed", "{card} 파괴됨"],
  "log.dice": ["{who} rolled {n}", "{who} — 주사위 {n}"],
  "log.expired": ["{card} ran out", "{card} 효과 종료"],
  "log.slain": ["{piece} was destroyed", "{piece} 파괴됨"],
  "preview.before": ["Before", "사용 전"],
  "preview.after": ["After", "사용 후"],
  "preview.none": ["This card has no board effect to show.", "이 카드는 판 위에 보여줄 변화가 없습니다."],
  "deck.cost": ["Cost", "코스트"],
  "deck.type": ["Type", "종류"],
  "deck.speed": ["Speed", "속도"],
  "deck.owned": ["Owned", "보유"],
  "deck.skills": ["Skill cards", "스킬 카드"],
  "deck.pieces": ["Piece cards", "기물 카드"],
  "deck.notOwned": ["You don't own this card yet", "아직 보유하지 않은 카드예요"],
  "deck.getInShop": ["Get it in the shop", "상점에서 구할 수 있어요"],
  "deck.rules": [
    "{size}-card deck · max {skillCopies} of a skill, {pieceCopies} of a piece",
    "{size}장 덱 · 스킬 최대 {skillCopies}장, 기물 최대 {pieceCopies}장",
  ],
  "deck.full": ["Deck is full", "덱이 가득 찼어요"],
  "deck.autofill": ["Auto-fill", "자동 채우기"],
  "deck.clear": ["Clear", "비우기"],
  "deck.short": ["{n} more to go", "{n}장 더 필요"],
  "deck.over": ["{n} too many", "{n}장 초과"],
  "deck.complete": ["Ready to play", "출전 준비 완료"],
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
  "profile.pieceSkin": ["Piece skin", "기물 스킨"],
  "profile.boardTheme": ["Board theme", "보드 테마"],
  "profile.worn": ["Equipped", "착용 중"],
  "profile.wear": ["Equip", "착용"],
  "profile.locked": ["In the shop", "상점에서 구매"],
  "profile.noRecords": ["No records", "기록 없음"],
  // Sound lives under Options, not on the profile page — it is a property of
  // the machine, not of the player. (`option.sound` is the live one.)
  "sound.toggle": ["Sound on / off", "효과음 켜기 / 끄기"],
  "sound.on": ["Sound effects on", "효과음 켜짐"],
  "sound.off": ["Sound effects off", "효과음 꺼짐"],
  "profile.soon": ["Stats and ranking are coming soon.", "전적·랭킹 시스템은 준비 중입니다."],
  "shop.title": ["Shop", "상점"],
  "shop.pieces": ["Piece Cards", "기물 카드"],
  "shop.packs": ["Skill Card Packs", "스킬 카드팩"],
  "shop.pieceSkins": ["Piece Skins", "기물 스킨"],
  "shop.boardThemes": ["Board Themes", "보드 테마"],
  "shop.skinsNote": [
    "Cosmetic only — a skin changes nothing about how a piece moves.",
    "외형만 바뀝니다 — 스킨은 기물의 움직임에 영향을 주지 않아요.",
  ],
  "shop.themesNote": [
    "The material the board itself is made of.",
    "체스판을 이루는 재질을 바꿉니다.",
  ],
  "shop.owned": ["Owned", "보유 중"],
  "shop.equipAt": ["Change in My Info", "내 정보에서 변경"],
  "shop.skinBought": ["{name} bought — put it on in My Info.", "{name} 구매 완료 — 내 정보에서 착용하세요."],
  "shop.piecesNote": ["Collect up to {max} copies of each piece.", "기물마다 최대 {max}개까지 모을 수 있어요."],
  "shop.packsNote": ["Each pack opens into {n} random skill cards.", "카드팩 하나를 열면 스킬 카드 {n}장이 랜덤으로 나와요."],
  "shop.pieceCard": ["Collectible piece card", "수집형 기물 카드"],
  "shop.full": ["Collection full", "보유 한도 도달"],
  "shop.bought": ["{name} bought — you now hold {n}.", "{name} 구매 완료 — 이제 {n}개 보유."],
  "shop.atCap": ["You already hold {max} of those.", "이미 {max}개를 보유하고 있어요."],
  "shop.tooPoor": ["Not enough coins.", "코인이 부족합니다."],
  "shop.soon": ["More of the storefront opens up as the game grows.", "상점의 나머지 품목은 순차적으로 열립니다."],
  "shop.buy": ["Buy", "구매"],
  "shop.open": ["Open", "열기"],
  "shop.unopened": ["{n} unopened", "미개봉 {n}개"],
  "shop.packBought": ["Pack bought — open it below.", "카드팩 구매 완료 — 아래에서 열어보세요."],
  "shop.packResult": ["You pulled {n} cards", "카드 {n}장을 획득했어요"],
  "shop.packDone": ["Nice!", "확인"],
  "shop.newCard": ["NEW", "NEW"],
  "shop.starterGranted": [
    "Welcome! You've been given a full chess set of piece cards and a skill pack.",
    "환영합니다! 체스 한 세트 분량의 기물 카드와 스킬 카드팩 1개를 드렸어요.",
  ],
  "option.title": ["Option", "설정"],
  "option.sound": ["Sound", "사운드"],
  "option.boardTheme": ["Board theme", "보드 테마"],
  "option.language": ["Language", "언어"],
  "option.comingSoon": ["Coming soon", "준비중"],
  "option.coupon": ["Coupon code", "쿠폰번호"],
  "option.couponPlaceholder": ["Enter a code", "쿠폰번호 입력"],
  "option.couponRedeem": ["Redeem", "사용"],
  "option.couponOk": ["+{coins} coins! You now have {total}.", "{coins}원 지급! 현재 {total}원."],
  "option.couponBad": ["That code is not valid.", "사용할 수 없는 쿠폰번호입니다."],
  "option.couponUsed": ["That code has already been used.", "이미 사용한 쿠폰번호입니다."],
  "play.oneSkill": ["One skill card a turn", "턴당 스킬 1장"],
  "play.targeting": ["Another card is waiting", "다른 카드가 대상을 기다리는 중"],
  "play.freeMoves": ["Move a piece — {n} left, no captures", "기물을 움직이세요 — {n}회 남음, 공격 불가"],
  "play.arrange": ["Put these back — first click goes on top", "덱에 되돌릴 순서 — 먼저 누른 카드가 맨 위"],
  "play.discardEmpty": ["Nothing in the discard pile", "버린 카드가 없습니다"],
  "target.pick": ["pick a target", "대상을 고르세요"],
  "target.own": ["pick one of your pieces", "내 기물을 고르세요"],
  "target.enemy": ["pick an enemy piece", "적 기물을 고르세요"],
  "target.empty": ["pick an empty square", "빈 칸을 고르세요"],
  "target.ownHand": ["pick a card in your hand", "손패에서 고르세요"],
  "target.oppHand": ["pick a card in their hand", "상대 손패에서 고르세요"],
  "target.discard": ["pick a card from your discard pile", "버린 카드에서 고르세요"],
  "target.lasting": ["pick a lasting card in play", "발동 중인 지속 카드를 고르세요"],
  "target.choice": ["choose", "선택하세요"],
  "target.done": ["That's enough", "이걸로 충분"],
  "option.king-side": ["King side", "킹 쪽"],
  "option.queen-side": ["Queen side", "퀸 쪽"],
  "option.n": ["Knight", "나이트"],
  "option.b": ["Bishop", "비숍"],
  "option.r": ["Rook", "룩"],
  "counter.trigCheckmate": ["your king is being mated", "킹이 체크메이트 당하는 중입니다"],
  "counter.trigTerrain": ["your piece walked into terrain", "기물이 지형 효과에 걸렸습니다"],
  "counter.trigEnchant": ["they aimed an enchant at you", "상대가 부여를 걸려 합니다"],
  "rank.placements": ["Placements", "배치고사"],
  "rank.placementCount": ["{n} of {total} played", "{total}판 중 {n}판"],
  "rank.placementHint": [
    "Win your {total} placement matches to be given a starting rank.",
    "랭크 배치는 {total}판입니다. 다 치르면 시작 티어가 정해져요.",
  ],
  "rank.placed": ["Placement complete", "배치 완료"],
  "rank.promoted": ["Promoted!", "승급!"],
  "rank.demoted": ["Demoted", "강등"],
  "profile.draws": ["Draws", "무"],
  "zone.deck": ["Deck", "덱"],
  "zone.grave": ["Graveyard", "묘지"],
  "zone.field": ["In play", "지속 카드"],
  "zone.none": ["Nothing in play", "발동 중인 카드 없음"],
  "zone.empty": ["This pile is empty.", "비어 있습니다."],
  "zone.drawHint": ["Click your deck to draw", "덱을 클릭해 드로우"],
  "counter.none": ["No card in hand answers this.", "지금 대응할 수 있는 카드가 없습니다."],
  "zoom.play": ["Play this card", "이 카드 사용"],
  "zoom.summon": ["Summon this piece", "이 기물 소환"],
  "zoom.discard": ["Discard this card", "이 카드 버리기"],
  "zoom.counter": ["Respond with this", "이 카드로 대응"],
  "zoom.choose": ["Choose this card", "이 카드 선택"],
  "zoom.close": ["Close", "닫기"],
  "cutin.you": ["You", "나"],
  "cutin.them": ["Opponent", "상대"],
  "cutin.activated": ["activated", "카드 발동"],
  "cutin.summoned": ["summoned", "기물 소환"],
  "cutin.skip": ["Click to skip", "클릭하면 넘어갑니다"],
  "nick.title": ["What should we call you?", "닉네임을 정해주세요"],
  "nick.body": [
    "This is the name your opponents see. You can change it later in Profile.",
    "상대에게 보이는 이름이에요. 나중에 내 정보에서 바꿀 수 있습니다.",
  ],
  "nick.placeholder": ["Your nickname", "닉네임 입력"],
  "nick.confirm": ["Start playing", "시작하기"],
  "nick.tooShort": ["Pick 2–16 characters.", "2~16자로 입력해주세요."],

  // ── accounts ──────────────────────────────────────────────
  "auth.welcome": ["Sign in to play", "로그인하고 시작하세요"],
  "auth.signIn": ["Sign in", "로그인"],
  "auth.signUp": ["Sign up", "회원가입"],
  "auth.username": ["ID", "아이디"],
  "auth.usernamePlaceholder": ["Letters, numbers, underscore", "영문·숫자·밑줄"],
  "auth.password": ["Password", "비밀번호"],
  "auth.passwordPlaceholder": ["At least 6 characters", "6자 이상"],
  // Short enough to sit on one line in the label column beside its field.
  "auth.confirm": ["Confirm", "확인"],
  "auth.passwordAgain": ["Password again", "비밀번호 다시 입력"],
  "auth.createTitle": ["Create an account", "계정 만들기"],
  "auth.nickname": ["Nickname", "닉네임"],
  "auth.nicknamePlaceholder": ["Shown to opponents", "상대에게 보이는 이름"],
  "auth.working": ["Just a moment…", "잠시만요…"],
  "auth.noAccount": ["No account yet? Sign up", "계정이 없으신가요? 회원가입"],
  "auth.haveAccount": ["Already have an account? Sign in", "이미 계정이 있으신가요? 로그인"],
  "auth.offlineTitle": ["Cannot reach the server", "서버에 연결할 수 없습니다"],
  "auth.playOffline": ["Play offline", "오프라인으로 플레이"],
  "auth.offlineNote": [
    "Single player works offline. Progress stays on this device until you sign in.",
    "싱글 플레이는 오프라인에서도 됩니다. 로그인 전까지 진행 상황은 이 기기에만 저장됩니다.",
  ],
  "auth.signOut": ["Sign out", "로그아웃"],
  "auth.signedInAs": ["Signed in as {name}", "{name} 계정으로 로그인됨"],
  "auth.offlineMode": ["Playing offline", "오프라인 플레이 중"],
  "auth.signInCta": ["Sign in to save online", "로그인하고 온라인 저장"],
  "auth.saveReplaced": [
    "Progress from another device was loaded.",
    "다른 기기의 진행 상황을 불러왔습니다.",
  ],
  // Error codes come back from the server; the sentences are ours.
  "auth.err.username-length": ["ID must be 3–16 characters.", "아이디는 3~16자여야 합니다."],
  "auth.err.username-chars": [
    "ID can use letters, numbers and underscore only.",
    "아이디는 영문·숫자·밑줄만 쓸 수 있습니다.",
  ],
  "auth.err.username-taken": ["That ID is taken.", "이미 사용 중인 아이디입니다."],
  "auth.err.password-length": ["Password must be 6–72 characters.", "비밀번호는 6~72자여야 합니다."],
  "auth.err.password-mismatch": ["The passwords do not match.", "비밀번호가 서로 다릅니다."],
  "auth.err.nickname-length": ["Nickname must be 2–16 characters.", "닉네임은 2~16자여야 합니다."],
  "auth.err.nickname-taken": ["That nickname is taken.", "이미 사용 중인 닉네임입니다."],
  "auth.err.bad-credentials": ["Wrong ID or password.", "아이디 또는 비밀번호가 올바르지 않습니다."],
  "auth.err.rate-limited": [
    "Too many attempts. Try again in a few minutes.",
    "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  ],
  "auth.err.unauthorised": ["Please sign in again.", "다시 로그인해주세요."],
  "auth.err.offline": [
    "Could not reach the server. Check your connection.",
    "서버에 연결할 수 없습니다. 연결 상태를 확인해주세요.",
  ],
  "auth.err.server": ["Something went wrong. Try again.", "문제가 발생했습니다. 다시 시도해주세요."],
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
  checkmate: ["Checkmate", "체크메이트"],
  stalemate: ["Stalemate", "스테일메이트"],
  resign: ["Resigned", "기권"],
  timeout: ["Lost on time", "시간패"],
  "draw-fifty": ["Fifty-move rule", "50수 규칙"],
  "draw-material": ["Insufficient material", "기물 부족"],
  "draw-repetition": ["Threefold repetition", "3회 동형반복"],
  "titan-crush": ["Crushed by the Titan", "거신병에게 짓밟힘"],
  "titan-explode": ["The Titan exploded", "거신병 폭발"],

  // ── what the engine says as a card resolves ─────────────────
  // The engine has no language, so it reports these as keys. They used to be
  // English sentences written straight into the reducer, which meant every
  // effect that actually fired announced itself in the wrong language and then
  // vanished after a second and a half.
  "fx.counterWindow": ["Counter window", "대응 기회"],
  "fx.plague": ["The plague takes a pawn", "역병이 폰을 앗아갔다"],
  "fx.denPiece": ["The dice take a piece", "주사위가 기물을 앗아갔다"],
  "fx.denBottom": ["A card goes to the bottom of the deck", "카드 1장이 덱 맨 아래로"],
  "fx.doubleAgain": ["Double — move that piece again", "더블 — 같은 기물을 한 번 더"],
  "fx.swamp": ["Bogged down in the swamp", "늪지에 빠져 다음 턴 이동 불가"],
  "fx.mineKingBack": ["The king steps back from the mine", "킹이 지뢰를 피해 물러났다"],
  "fx.mine": ["Mine!", "지뢰 폭발!"],
  "fx.drawDeclined": ["Draw declined", "드로우를 넘겼다"],
  "fx.discarded": ["Card discarded", "카드를 버렸다"],
  "fx.summoned": ["Summoned!", "소환!"],
  "fx.insight": ["Insight — the card is undone", "간파 — 카드가 무효화됐다"],
  "fx.shield": ["The shield holds", "방패가 공격을 막았다"],
  "fx.evade": ["Evaded!", "회피 성공!"],
  "fx.ward": ["Warded", "지형 효과를 막았다"],
  "fx.sever": ["The enchant is cut short", "부여가 끊겼다"],
  "fx.bodyguard": ["The bodyguard falls in the king's place", "보디가드가 킹 대신 쓰러졌다"],
  "fx.lastStand": ["Last stand — the king vanishes", "최후의 저항 — 킹이 사라졌다"],
} as const satisfies Record<string, Entry>;

export const MODE_NAME: Record<string, Entry> = {
  classic: ["Classic", "클래식"],
  skill: ["Skill", "스킬"],
  master: ["Master", "마스터"],
};
export const MODE_TAGLINE: Record<string, Entry> = {
  classic: ["Chess, exactly as you know it", "우리가 아는 그 체스"],
  skill: ["Chess plus a 30-card skill deck", "체스 + 스킬 카드 30장 덱"],
  master: ["King and two pawns. Build the rest.", "킹과 폰 2개로 시작해 나머지는 소환"],
};
export const MODE_DESC: Record<string, Entry> = {
  classic: [
    "The standard 8x8 game. No cards, no cost, no skills — just chess.",
    "8x8 표준 체스. 카드도 코스트도 스킬도 없는 순수한 체스입니다.",
  ],
  skill: [
    "The standard 8x8 game, but each side also plays a 30-card skill deck. Draw one card a turn, bank one cost a turn, and bend the rules.",
    "8x8 체스에 스킬 카드 30장 덱이 더해집니다. 턴마다 1장 드로우, 코스트 1 충전으로 규칙을 비틀어 보세요.",
  ],
  master: [
    "A 10x10 board. You open with a king and two pawns, and summon your whole army out of a 50-card deck of pieces and skills.",
    "10x10 보드. 킹과 폰 2개로 시작해 기물·스킬 50장 덱에서 군대를 직접 소환합니다.",
  ],
};
export const modeName = (id: string) => pick(MODE_NAME, id);
export const modeTagline = (id: string) => pick(MODE_TAGLINE, id);
export const modeDesc = (id: string) => pick(MODE_DESC, id);

/** Piece cards are named after the piece they summon, not after a skill. */
const PIECE_CARD_NAME: Record<string, Entry> = {
  "piece:p": ["Pawn", "폰"],
  "piece:n": ["Knight", "나이트"],
  "piece:b": ["Bishop", "비숍"],
  "piece:r": ["Rook", "룩"],
  "piece:q": ["Queen", "퀸"],
};

/**
 * A piece by its letter, for the feed. The card table above is keyed by card id
 * and has no king in it — a king is never summoned, but it can still be the
 * thing a line of the feed is about.
 */
const PIECE_NAME: Record<string, Entry> = {
  p: ["Pawn", "폰"],
  n: ["Knight", "나이트"],
  b: ["Bishop", "비숍"],
  r: ["Rook", "룩"],
  q: ["Queen", "퀸"],
  k: ["King", "킹"],
};
export const pieceName = (type: string) => pick(PIECE_NAME, type);
const PIECE_CARD_DESC: Record<string, Entry> = {
  "piece:p": ["Summon a pawn into your back three ranks.", "뒤쪽 3줄에 폰을 소환한다."],
  "piece:n": ["Summon a knight into your back three ranks.", "뒤쪽 3줄에 나이트를 소환한다."],
  "piece:b": ["Summon a bishop into your back three ranks.", "뒤쪽 3줄에 비숍을 소환한다."],
  "piece:r": ["Summon a rook into your back three ranks.", "뒤쪽 3줄에 룩을 소환한다."],
  "piece:q": ["Summon a queen into your back three ranks.", "뒤쪽 3줄에 퀸을 소환한다."],
};

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
  "pack-premium": ["Premium Pack", "프리미엄 카드팩"],
  // Piece skins.
  classic: ["Classic Set", "클래식 세트"],
  demon: ["Infernal Host", "악마 군단"],
  angel: ["Celestial Host", "천사 군단"],
  ossuary: ["Ossuary Set", "유해 세트"],
  // Board themes.
  arcane: ["Arcane Observatory", "비전 천문대"],
  marble: ["Marble & Onyx", "대리석과 흑요석"],
  sandstone: ["Sandstone Temple", "사암 신전"],
};
export const SHOP_DESC: Record<string, Entry> = {
  "pack-starter": ["5 random skill cards", "스킬 카드 5장 랜덤"],
  "pack-premium": ["Higher rare card odds", "희귀 카드 확률 UP"],
  classic: ["The set the game ships with", "기본으로 제공되는 세트"],
  demon: ["Horned, ash and obsidian, molten cracks", "뿔 달린 재와 흑요석, 갈라진 틈의 용암"],
  angel: ["Folded wings, white marble and fallen bronze", "접힌 날개, 백대리석과 타락한 청동"],
  ossuary: ["Carved bone and antler, one side charred", "뼈와 뿔 조각, 한쪽은 그을린"],
  arcane: ["Dark stone inlaid with glowing runes", "빛나는 룬이 새겨진 검은 석재"],
  marble: ["Cream marble and veined black onyx", "크림 대리석과 결이 흐르는 흑요석"],
  sandstone: ["Sun-bleached sandstone and volcanic basalt", "빛에 바랜 사암과 화산 현무암"],
};
export const shopItem = (id: string) => pick(SHOP_ITEM, id);
export const shopDesc = (id: string) => pick(SHOP_DESC, id);

const SKILL_NAME: Record<string, Entry> = {
  scout: ["Scout", "정찰"],
  spy: ["Spy", "밀정"],
  divination: ["Divination", "점술"],
  meditate: ["Meditate", "명상"],
  offering: ["Offering", "헌납"],
  disguise: ["Disguise", "위장"],
  readiness: ["Readiness", "준비 태세"],
  bait: ["Bait", "미끼"],
  "small-sandbag": ["Small Sandbag", "작은 모래주머니"],
  vigilance: ["Vigilance", "경계"],
  dash: ["Dash", "질주"],
  shove: ["Shove", "밀쳐내기"],
  pull: ["Pull", "끌어당기기"],
  leap: ["Leap", "도약"],
  swamp: ["Swamp", "늪지"],
  "small-shield": ["Small Shield", "작은 방패"],
  clairvoyance: ["Clairvoyance", "천리안"],
  herald: ["Herald", "전령"],
  javelin: ["Javelin", "투창"],
  citadel: ["Citadel", "성채"],
  "large-sandbag": ["Large Sandbag", "큰 모래주머니"],
  beacon: ["Beacon", "봉화"],
  insight: ["Insight", "간파"],
  ward: ["Ward", "방어"],
  cleanse: ["Cleanse", "해주"],
  unbind: ["Unbind", "해금"],
  recall: ["Recall", "회수"],
  coerce: ["Coerce", "강제"],
  transpose: ["Transpose", "전환"],
  "guard-drill": ["Guard Drill", "위병 훈련"],
  disarm: ["Disarm", "무장해제"],
  mine: ["Mine", "지뢰"],
  hallucination: ["Hallucination", "환각"],
  espionage: ["Espionage", "첩보"],
  evade: ["Evade", "회피"],
  sever: ["Sever", "끊어내기"],
  double: ["Double", "더블"],
  "blood-price": ["Blood Price", "희생의 대가"],
  promotion: ["Promotion", "승진"],
  "double-image": ["Double Image", "분신"],
  "kings-strike": ["King's Strike", "비장의 한방"],
  rewind: ["Rewind", "무르기"],
  thrift: ["Thrift", "절약"],
  riposte: ["Riposte", "받아치기"],
  "last-stand": ["Last Stand", "최후의 저항"],
  shatter: ["Shatter", "파괴"],
  exchange: ["Exchange", "교환"],
  awaken: ["Awaken", "각성"],
  brainwash: ["Brainwash", "세뇌"],
  "bond-chain": ["Bond Chain", "동맹사슬"],
  "fate-chain": ["Fate Chain", "운명의 사슬"],
  "agile-knight": ["Agile Knight", "민첩한 나이트"],
  "muddy-water": ["Muddy Water", "흙탕물"],
  bodyguard: ["Bodyguard", "보디가드"],
  pandemonium: ["Pandemonium", "대혼란"],
  assassinate: ["Assassinate", "암살"],
  regicide: ["Queenslayer", "여왕암살"],
  sanctuary: ["Sanctuary", "성역"],
  plague: ["Plague", "역병"],
  "purifying-light": ["Purifying Light", "정화의 빛"],
  typhoon: ["Typhoon", "태풍"],
  earthquake: ["Earthquake", "지진"],
  "gambling-den": ["Gambling Den", "도박장"],
};

const SKILL_DESC: Record<string, Entry> = {
  scout: ["Look at one card in the opponent's hand.", "상대 패 1장을 확인한다."],
  spy: ["Look at the top card of their deck.", "상대 덱 맨 위 1장을 확인한다."],
  divination: [
    "Look at the top 3 of your deck and put them back in any order.",
    "내 덱 맨 위 3장을 보고 원하는 순서로 되돌린다.",
  ],
  meditate: ["Draw 2 cards (up to a hand of 5).", "카드 2장을 뽑는다 (패 5장 초과 불가)."],
  offering: ["Discard a card, then draw 2.", "패 1장을 버리고 2장을 뽑는다."],
  disguise: [
    "Shuffle up to 2 cards from hand into your deck, then draw that many.",
    "패에서 최대 2장을 덱에 넣고 섞은 뒤, 넣은 만큼 뽑는다.",
  ],
  readiness: ["+2 cost this turn.", "이번 턴 코스트 +2."],
  bait: ["Mark one of your pawns: when it dies, draw 2.", "내 폰 1개에 부여. 이 폰이 파괴되면 2장 드로우."],
  "small-sandbag": [
    "Weigh an enemy piece down for 2 of your turns (not the king).",
    "적 기물 1개에 모래주머니. 자신 턴 기준 2턴 지속 (킹 제외).",
  ],
  vigilance: ["Counter: when they play a card, draw 1.", "대응 — 상대가 카드를 사용하면 1장 드로우."],
  dash: ["Move one of your pieces a square. It cannot capture.", "내 기물 1개를 한 칸 이동. 공격 불가."],
  shove: ["Push an adjacent enemy one square straight back.", "인접한 적 기물 1개를 반대 방향으로 1칸 밀어낸다."],
  pull: [
    "Drag an enemy on your piece's line up to the square in front of it.",
    "같은 직선상의 적 기물 1개를 내 기물 바로 앞으로 끌어온다.",
  ],
  leap: ["For 3 of your turns, this pawn moves over other pieces.", "내 폰 1개에 부여. 자신 턴 기준 3턴간 다른 기물을 뛰어넘는다."],
  swamp: [
    "Mark an empty square: whatever steps in cannot move next turn.",
    "빈 칸 1개를 지정. 그 칸에 들어온 기물은 다음 턴 이동 불가.",
  ],
  "small-shield": ["Counter: turn away one attack on a pawn of yours.", "대응 — 내 폰을 노린 공격 1회를 무효화한다."],
  clairvoyance: ["See the opponent's whole hand.", "상대 패를 전부 확인한다."],
  herald: ["Shuffle a spent or destroyed card back into your deck.", "파괴·사용한 카드 1장을 덱에 넣고 섞는다."],
  javelin: [
    "Throw a pawn beside your king: it and the first enemy on that line both die.",
    "킹 옆의 폰을 던진다. 그 방향 일직선의 적 1개와 폰이 함께 파괴된다.",
  ],
  citadel: ["Castle immediately, ignoring the usual conditions.", "조건을 무시하고 캐슬링을 즉시 실행한다."],
  "large-sandbag": [
    "Weigh an enemy piece down for 5 of your turns (not the king).",
    "적 기물 1개에 모래주머니. 자신 턴 기준 5턴 지속 (킹 제외).",
  ],
  beacon: ["Lasting: draw a card whenever a piece of yours dies.", "지속 — 내 기물이 파괴될 때마다 1장 드로우."],
  insight: ["Counter: undo a quick or counter card they played.", "대응 — 상대가 쓴 속공 또는 대응 카드 1장을 무효화한다."],
  ward: ["Counter: shrug off a terrain effect once.", "대응 — 지형 효과(늪지·지뢰 등)를 1회 무효화한다."],
  cleanse: ["Lift the enchants off one of your own pieces.", "부여마법에 걸린 내 기물 1개의 부여를 해제한다."],
  unbind: ["Lift the enchants off one enemy piece.", "부여마법에 걸린 적 기물 1개의 부여를 해제한다."],
  recall: ["Take a spent or destroyed card back into your hand.", "파괴·사용한 카드 1장을 패로 회수한다."],
  coerce: ["Send 2 cards from their hand back into their deck.", "상대 패에서 2장을 골라 덱으로 되돌린다."],
  transpose: ["Swap two of your pieces (not the king).", "킹을 제외한 내 기물 2개의 위치를 맞바꾼다."],
  "guard-drill": [
    "This pawn moves one square in any direction and may capture.",
    "내 폰 1개에 부여. 1칸 이내 어디로든 이동하고 적을 잡을 수 있다.",
  ],
  disarm: [
    "For 5 of their turns this piece may move but not capture.",
    "적 기물 1개에 부여. 상대 턴 기준 5턴간 기물을 잡을 수 없다.",
  ],
  mine: [
    "Hide a mine on an empty square. It kills what steps on it (a king only turns back).",
    "빈 칸에 비공개 설치. 적 기물이 밟으면 파괴 (킹은 이동만 취소).",
  ],
  hallucination: [
    "For 5 of your turns every piece looks like a pawn to them.",
    "자신 턴 기준 5턴간 상대에게는 모든 기물이 폰으로 보인다.",
  ],
  espionage: [
    "Lasting: roll when they draw — on 4-6, you see the card.",
    "지속 — 상대가 드로우할 때 주사위. 4·5·6이면 그 카드를 확인한다.",
  ],
  evade: [
    "Counter: your attacked piece flees to a random empty square beside it.",
    "대응 — 공격당한 내 기물이 인접한 빈 칸으로 랜덤 도피한다.",
  ],
  sever: ["Counter: cancel an enchant aimed at one of your pieces.", "대응 — 내 기물을 대상으로 한 부여를 무효화한다."],
  double: ["One piece may move twice this turn.", "이번 턴 지정한 기물을 두 번 움직일 수 있다."],
  "blood-price": [
    "Destroy a piece of yours (not king or pawn) to move 3 pieces. No captures.",
    "킹·폰 외 내 기물 1개를 파괴하고 기물 3개를 이동. 공격 불가.",
  ],
  promotion: [
    "Promote a pawn where it stands to a knight, bishop or rook.",
    "내 폰 1개를 나이트·비숍·룩 중 하나로 즉시 승격한다.",
  ],
  "double-image": [
    "Copy a piece into an empty square beside it for 5 of your turns.",
    "옆칸이 빈 내 기물(킹 제외)의 분신을 소환. 자신 턴 기준 5턴 유지.",
  ],
  "kings-strike": [
    "Assassinate an enemy beside your king; the king takes its square.",
    "킹 주변 3×3의 적 기물 1개를 암살(적 킹 제외). 킹이 그 자리로 이동.",
  ],
  rewind: [
    "Undo their last move. That piece cannot move on their next turn.",
    "상대의 직전 움직임을 무효화. 상대는 다음 턴 그 기물을 못 움직인다.",
  ],
  thrift: [
    "Lasting: every card you play costs 1 less (never below 1).",
    "지속 — 이후 내가 쓰는 모든 카드의 코스트 −1 (최소 1).",
  ],
  riposte: [
    "Counter: undo a quick card of theirs and use it yourself.",
    "대응 — 상대의 속공 카드를 무효화하고 그 효과를 내가 발동한다.",
  ],
  "last-stand": [
    "Counter: as you are mated, teleport your king to any empty square.",
    "대응 — 체크메이트 시 킹을 임의의 빈 칸으로 순간이동시킨다.",
  ],
  shatter: ["Destroy a lasting card in play, or a card in their hand.", "발동 중인 지속 카드 1장, 또는 상대 패 1장을 파괴한다."],
  exchange: ["Trade a card in your hand for one in theirs.", "내 패 1장과 상대 패 1장을 교환한다."],
  awaken: ["One of your pieces becomes a queen for 5 of your turns.", "킹·퀸 외 내 기물 1개가 자신 턴 기준 5턴간 퀸이 된다."],
  brainwash: [
    "Turn up to 3 enemy pawns to your side until the enchant is lifted.",
    "상대 폰 최대 3개를 내 폰으로 전환. 부여가 풀리면 원래대로.",
  ],
  "bond-chain": [
    "Link one of your pieces to an enemy: they cannot attack each other.",
    "내 기물과 적 기물을 연결. 연결된 둘은 서로 공격할 수 없다.",
  ],
  "fate-chain": [
    "Link one of your pieces to an enemy: if one dies, so does the other.",
    "내 기물과 적 기물을 연결. 하나가 파괴되면 다른 하나도 파괴된다.",
  ],
  "agile-knight": ["Lasting: your knights also move like a Janggi elephant.", "지속 — 내 나이트가 장기의 상처럼도 움직인다."],
  "muddy-water": ["Lasting: every card they play costs 1 more.", "지속 — 상대가 쓰는 카드의 코스트가 모두 +1."],
  bodyguard: [
    "Counter: another piece dies in the king's place and the king takes its square.",
    "대응 — 킹이 공격당할 때 다른 기물이 대신 죽고 킹이 그 자리로 이동한다.",
  ],
  pandemonium: [
    "Scatter every piece but the kings at random across its own two home ranks.",
    "양측 킹을 제외한 모든 기물을 각자 진영 2줄 안에 랜덤 재배치한다.",
  ],
  assassinate: ["Destroy an enemy piece other than the king or queen.", "상대의 킹·퀸을 제외한 기물 1개를 파괴한다."],
  regicide: ["Destroy an enemy queen.", "상대의 퀸 1개를 지정해 파괴한다."],
  sanctuary: [
    "Lasting: your pieces around your king cannot be targeted by their cards.",
    "지속 — 내 킹 주변 3×3의 내 기물은 상대 카드의 대상이 되지 않는다.",
  ],
  plague: ["Lasting: every third turn, each side loses a pawn.", "지속 — 각 플레이어는 자신 턴 기준 3턴마다 폰 1개를 잃는다."],
  "purifying-light": ["Lift every enchant off all of your pieces.", "부여마법에 걸린 내 모든 기물의 부여를 해제한다."],
  typhoon: ["Destroy every lasting card on the field, yours included.", "필드 위 모든 지속 카드를 파괴한다 (아군·적군 전부)."],
  earthquake: ["Destroy every pawn on the board.", "양측의 폰을 전부 파괴한다."],
  "gambling-den": [
    "Lasting: both sides roll a die at the start of every turn.",
    "지속 — 양측 모두 턴 시작 시 주사위를 굴린다.",
  ],
};
