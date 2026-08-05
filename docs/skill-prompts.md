# 스킬 카드 아트 프롬프트 — 63장 + UI 3세트

`docs/asset-prompts.md`와 **같은 규칙, 같은 화풍**이다. 각 블록은 그대로 복사해서 붙여넣으면 끝.

## 규칙 4개

1. **한 번에 하나씩.** 몰아서 요청하면 품질이 무너진다.
2. **S1을 제일 먼저 뽑고, 그 뒤로는 통과한 S1 이미지를 첨부**한 뒤 프롬프트 맨 앞에 이 줄을 추가:
   `Match the exact art style, palette, lighting and brushwork of the attached reference image.`
   → 63장을 한 톤으로 묶는 가장 확실한 방법.
3. 배경이 흰색이나 체커보드로 나오면 `background must be solid magenta #FF00FF` 를 강조해 재요청.
   마젠타로 나와야 내가 깔끔하게 지운다.
4. **나온 파일은 `apps/client/public/assets/raw/` 에 `s1-skills.png` 식으로 넣고 알려주면**
   자르기 · 배경 제거 · 파일명 배선(`public/assets/skills/<카드id>.png`)까지 내가 한다.

**추천 순서**: S1 → U1 → S2 → S3 → S4 → S5 → S6 → S7 → U2 → U3

> 아트가 없는 카드는 지금 이모지 글리프 카드로 대신 그려진다. 게임은 정상 동작하니 급하지 않은 시트는 뒤로 미뤄도 된다.

---

## S1 — 1코스트 10장 ★제일 먼저

`정찰 · 밀정 · 점술 · 명상 · 헌납 · 위장 · 준비 태세 · 미끼 · 작은 모래주머니 · 경계`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size. These are
the cheapest cards of the set: small, quiet, intimate scenes rather than spectacle.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a gloved hand tilting one card of an opponent's fanned hand just far enough to
    peek at its face, the rest still hidden
2.  a cloaked informant crouched behind a stack of face-down cards, lifting the top
    one with a knife tip
3.  three cards hovering above an open palm inside a ring of glowing rune circles,
    being reordered in mid-air
4.  a monk seated cross-legged before a candle, two cards drifting toward him on
    the rising smoke
5.  a card being fed into a brazier flame while two fresh cards rise from the smoke
    above it
6.  a figure in a featureless porcelain mask sliding cards back into a deck, the
    deck shuffling itself in a blur
7.  a soldier's gauntleted fist tightening on a leather strap, a bright surge of
    golden energy running up the forearm
8.  a lone chess pawn standing on an open square with a rusted iron bear trap
    yawning open behind it
9.  a heavy sandbag lashed to the base of a chess piece with rope, the piece
    tilting under the weight
10. a watchman's ear and raised lantern at a cracked door, a single card sliding
    out of the darkness toward him
```

---

## S2 — 2코스트 6장 + 3코스트 4장

`질주 · 밀쳐내기 · 끌어당기기 · 도약 · 늪지 · 작은 방패 · 천리안 · 전령 · 투창 · 성채`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a stone chess piece sliding one square with a hard streak of motion blur and
    grit spraying from its base
2.  an armored shoulder slamming into an enemy chess piece, the piece tipping
    backwards off its square
3.  a heavy iron grapple hook biting into an enemy chess piece, the chain snapping
    taut toward the viewer
4.  a chess pawn caught mid-leap in a high arc over another piece, a glowing arc
    trail marking the jump
5.  a sunken patch of black bog between board squares, reeds and bubbles, a stone
    piece sunk to its knees in the muck
6.  a small round buckler raised over a lone pawn, an incoming blade skidding off
    its boss in sparks
7.  a great glass eye set in a brass orrery ring, an entire fanned hand of cards
    reflected across its curved surface
8.  a courier in a torn tabard sprinting with a sealed scroll, a burnt card
    reassembling itself from ash beside him
9.  a pawn hurled like a spear across the board, spinning, an enemy piece
    shattering where it lands
10. a castle keep and its rook tower sliding into place beside a crowned king,
    stone grinding on stone
```

---

## S3 — 3코스트 4장 + 4코스트 6장

`큰 모래주머니 · 봉화 · 간파 · 방어 · 해주 · 해금 · 회수 · 강제 · 전환 · 위병 훈련`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a massive iron-banded weight chained around a chess queen's neck, the piece
    buckling forward under it
2.  a lit signal brazier on a high stone tower at night, embers streaming into the
    dark, a card caught in the updraft
3.  a hand catching an incoming card in mid-flight and crushing it to cinders
    between the fingers
4.  a translucent green ward dome flaring over a single board square as bog water
    and shrapnel break against it
5.  a priest's hand passing over a chained chess piece, the chains dissolving into
    gold light
6.  an iron key turning in a lock set into the chest of an enemy chess piece, the
    lock springing open
7.  a spectral hand reaching up out of a pile of burnt cards, dragging one intact
    card back into the light
8.  two cards being pried out of a clenched enemy fist and forced back down into a
    deck
9.  two allied chess pieces trading places in a swirl of dark smoke, their forms
    half-dissolved into each other
10. a pawn drilling with a short sword and buckler under a sergeant's shadow,
    stance corrected, chalk marks on the ground
```

---

## S4 — 4코스트 6장 + 5코스트 4장

`무장해제 · 지뢰 · 환각 · 첩보 · 회피 · 끊어내기 · 더블 · 희생의 대가 · 승진 · 분신`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a knight's sword wrenched from his grip and hanging in the air just out of
    reach, his empty hand still open
2.  a buried iron mine under a board square, only a thin trigger plate showing,
    faint red glow seeping from the seam
3.  a battlefield of chess pieces seen through a warped violet haze in which every
    piece has become an identical pawn silhouette
4.  a spy's eye at a keyhole with a pair of bone dice tumbling in the foreground,
    a drawn card lit in the gap
5.  a chess piece blurring sideways out of a sword's path, an afterimage left
    behind where it stood
6.  a pair of shears snipping a glowing rune thread an instant before it reaches a
    chess piece
7.  one chess piece rendered twice in a single stride, two overlapping strides of
    motion, doubled ember trail
8.  a knight kneeling and driving a dagger into his own chest as three other pieces
    surge forward past him, lit by his blood
9.  a pawn kneeling under the descending sword blade of knighthood, its silhouette
    already growing into a taller piece
10. a chess piece and its exact mirrored double standing on adjacent squares, the
    double faintly translucent and edged in blue light
```

---

## S5 — 5코스트 5장 + 6코스트 5장

`비장의 한방 · 무르기 · 절약 · 받아치기 · 최후의 저항 · 파괴 · 교환 · 각성 · 세뇌 · 동맹사슬`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size. These are
expensive cards: the scenes are larger and more violent than the earlier sheets.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a crowned king lunging off his square and running an adjacent enemy piece
    through with a longsword, taking its place
2.  an hourglass tipped back upright with the sand streaming upward, a chess piece
    sliding backwards along its own footprints
3.  a miser's hand sliding one gold coin back out of a pile toward a leather purse,
    candle guttering
4.  a duellist's blade catching an incoming bolt of blue fire and flinging it back
    the way it came
5.  a crowned king vanishing into a column of pale light as blades close on empty
    air from every side
6.  an armored fist smashing straight down through a floating enchanted card, the
    card splitting apart in shards
7.  two hands passing cards past each other across a candlelit table, one card
    going each way
8.  a stone chess piece cracking open from within, a crowned queen of molten gold
    rising out of the shell
9.  three enemy pawns turning their heads in unison toward a hooded figure, violet
    thread running from his fingers to their necks
10. two chess pieces of opposite colours bound wrist to wrist by a heavy gold
    chain, both weapons lowered
```

---

## S6 — 6코스트 4장 + 7코스트 5장 + 8코스트 1장

`운명의 사슬 · 민첩한 나이트 · 흙탕물 · 보디가드 · 대혼란 · 암살 · 여왕암살 · 성역 · 역병 · 정화의 빛`

```
A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, the scene centered and filling its cell
edge to edge, never overlapping a neighboring cell. Background visible in the gutters
between cells must be perfectly uniform flat solid magenta #FF00FF. Each illustration
is a single dramatic focal scene, dark and moody, readable at small size. These are
the most expensive cards: the biggest, most dramatic scenes of the whole set.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  two chess pieces of opposite colours bound by a chain of red-hot iron, both
    cracking apart at the same instant
2.  an armored warhorse head from a chess knight bounding along a diagonal path of
    glowing hoofprints, elegant and fast
3.  a churned pit of thick brown mud swallowing a scatter of cards, hands straining
    to pull one free
4.  a huge shield-bearer throwing himself into a blade meant for the king behind
    him, the blade going through him instead
5.  an entire board of chess pieces thrown into the air in a whirlwind, tumbling,
    dust and splinters everywhere
6.  a black-gloved assassin's dagger sliding between the shoulders of a chess piece
    from behind, one clean thrust
7.  a chess queen's crowned head struck from her body, the crown spinning away
    through the air, gold and blood
8.  a ring of pale golden light standing like a wall around a king and the pieces
    beside him, dark hands recoiling from it
9.  a plague doctor's beaked mask above a row of chess pawns rotting and crumbling
    to grey ash one after another
10. a blinding vertical shaft of pure golden light burning every chain, brand and
    rune off a group of chess pieces at once
```

---

## S7 — 8코스트 3장 (마지막 시트, 1행 3열)

`태풍 · 지진 · 도박장`

```
A wide sprite sheet of 3 fantasy card illustrations, arranged in a single row of 3
evenly spaced cells. Each cell is landscape orientation, roughly 4:3.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: all three cells exactly the same size, the scene centered and filling its
cell edge to edge, never overlapping a neighbor. Background visible in the gutters
must be perfectly uniform flat solid magenta #FF00FF. These are the three most
expensive cards in the game — apocalyptic scale, the biggest images of the set.

THE 3 SCENES, left to right:
1.  a black cyclone tearing across a chessboard, ripping every banner, chain and
    enchanted card off the field and up into the funnel
2.  the board splitting along a jagged fault line, every pawn on both sides falling
    into the chasm, columns of dust rising
3.  a smoky underground gambling den: a pair of huge bone dice slamming down on a
    board-square table, chess pieces stacked as betting chips, hooded figures
    leaning in from the dark
```

---

# UI 애셋 — 새 시스템 때문에 새로 필요해진 것

## U1 — 유형 배지 5종 + 페이즈 아이콘 4종 + 기타 7종 ★스킬 다음으로 중요

지금 카드 유형(일반/속공/부여/지속/대응)과 턴 페이즈가 **글자로만** 구분된다.

```
A single square sprite sheet of 16 fantasy game UI icons, arranged in a perfectly
even 4 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, subject centered with at least 12% empty
padding on all four sides, subjects never touching or overlapping a neighboring cell.
Background: one perfectly uniform flat solid magenta #FF00FF across the entire canvas
and every gutter. Each icon must still read clearly as a silhouette at 48×48 pixels.
Any glow stays tight inside the subject and never bleeds into the background.

THE 16 ICONS, in reading order (left to right, top to bottom):
1.  a heavy iron gauntlet fist, blunt and straightforward
2.  a single feathered arrow in flight with a sharp speed streak behind it
3.  a hand sprinkling glowing dust down onto a small chess piece
4.  an hourglass wrapped in ivy that has grown into the glass itself
5.  a raised open palm behind a small round buckler, a blocking gesture
6.  a stack of face-down cards with the top one lifting off
7.  a small chess pawn rising out of a glowing summoning circle
8.  a lit brazier with a single spark leaping upward
9.  a boot mid-stride over a chessboard square
10. a plain round gold coin with a faceted gem set into its center
11. an ornate spiral seashell horn being sounded
12. a pair of bone dice at rest, pips glowing faintly
13. a burning card curling into ash
14. a sandbag hanging from a short rope
15. a closed iron bear trap
16. an eye inside a triangle, half-lidded and watchful
```

**배선**: 1~5 = 일반 / 속공 / 부여 / 지속 / 대응 배지, 6~9 = 드로우 / 소환 / 스킬 / 이동 페이즈 아이콘,
10 = 코스트 젬, 11 = 대응 윈도우 배너, 12 = 주사위(도박장·첩보), 13 = 카드 파괴 연출,
14~16 = 보드 상태 표식 예비.

## U2 — 보드 위 상태 토큰 8종

부여·지형이 걸린 칸에 얹는 작은 토큰. **지금은 이모지 글리프로 임시 표시 중**이라 이게 들어오면 바로 좋아진다.

```
A single square sprite sheet of 8 fantasy game tokens, arranged in a perfectly even
4 columns × 2 rows grid. Each token is a small round enameled metal counter seen
flat-on from directly above, as if lying on a game board.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Aged enameled metal, worn edges,
warm candlelight from the upper left.
PALETTE (use only these): deep brown #150e0a, oiled wood #2e2016, aged parchment
#e7d3a6, gold leaf #d8b45a / #8a6a2e, ember orange #d9532e, blood red #b03a34,
arcane blue #5a83c4, poison green #7fae4a. Warm, desaturated, aged.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders.

LAYOUT: every cell exactly the same size, each token centered with 15% padding,
never overlapping a neighbor. Background across the whole canvas and every gutter:
perfectly uniform flat solid magenta #FF00FF. Each token must read at 28×28 pixels.

THE 8 TOKENS, in reading order (left to right, top to bottom):
1.  a sandbag on a chain — green enamel rim
2.  a coiled spring under a boot — green enamel rim
3.  a crossed-out sword — red enamel rim
4.  a patch of black bog water with reeds — red enamel rim
5.  a buried mine trigger plate — red enamel rim
6.  two linked rings of a gold chain — blue enamel rim
7.  a skull inside a broken chain link — red enamel rim
8.  a crowned pawn head — gold enamel rim
```

**배선**: 순서대로 모래주머니 / 도약 / 무장해제 / 늪지 / 지뢰 / 동맹사슬 / 운명의 사슬 / 세뇌·각성.

## U3 — 모드 선택 일러스트 3종

클래식 / 스킬 / 마스터. **지금은 체스 오브젝트 아트 하나를 3개 타일에 돌려쓰고 있어서 셋이 똑같이 보인다.**

```
A wide sheet of 3 fantasy game-mode illustrations, arranged in a single row of 3
evenly spaced square cells.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: all three cells exactly the same size, subject centered, never overlapping a
neighbor. Background across the whole canvas and every gutter: perfectly uniform flat
solid magenta #FF00FF. The three read as a clear progression: plain, then enchanted,
then vast.

THE 3 SCENES, left to right:
1.  a plain wooden chessboard on a table with the pieces set up for a normal game,
    a single candle beside it, no magic at all
2.  the same board, but with three glowing enchanted cards fanned above it and
    threads of arcane light running down into the pieces
3.  an enormous 10x10 stone board stretching away into the dark, only a lone king
    and two pawns standing on it, a towering deck of cards at its edge waiting to
    be summoned from
```

---

---

# 받은 시트 처리 결과 (2026-08-05)

`public/assets/new/` 의 S1~S7, U1~U3 전부 잘라서 배선 완료. **63장 전부 들어갔고 누락·오배치 없음.**
자르는 스크립트는 `tools/slice-new.py` — 다시 뽑은 시트를 같은 이름으로 덮어쓰고 이 스크립트만 돌리면 재적용된다.

| 시트 | 요청 | 실제 | 처리 |
|---|---|---|---|
| S1 | 2×5 (10) | **3×4 (12)** | 위장·미끼가 두 번 그려져 각각 하나만 사용, 2칸 폐기 |
| S2 | 2×5 (10) | **3×4 (12)** | 천리안·작은 방패 중복 2칸 폐기 |
| S3 | 2×5 (10) | 2×5 (10) ✓ | 그대로 |
| S4 | 2×5 (10) | 2×5 (10) | 칸마다 금색 아치 테두리 → **RE_S4로 재요청, 해결** (3×4로 왔고 중복 2칸 폐기) |
| S5 | 2×5 (10) | **3×4 (12)** | 교환·세뇌 중복 2칸 폐기 |
| S6 | 2×5 (10) | **3×4 (12)** | 보디가드·여왕암살 중복 2칸 폐기 |
| S7 | 1×3 (3) | 1×3 (3) ✓ | 그대로 |
| U1 | 4×4 (16) | 4×4 (16) | 아이콘이 어두운 사각 타일 위에 → **RE_U1으로 재요청, 해결** (배경 없이 떠 있음. 카드 얼굴 배지로도 사용 중) |
| U2 | 4×2 (8) | **4×4 (16)** | 앞 8칸만 사용, 나머지는 같은 토큰의 변형이라 폐기 |
| U3 | 1×3 (3) | 1×3 (3) ✓ | 그대로 |

**다음에 시트를 요청할 때** 이 두 줄을 프롬프트 LAYOUT 문단 끝에 붙이면 위 문제가 대부분 사라진다:

```
The grid must be EXACTLY 2 rows by 5 columns — ten cells, no more and no fewer.
Every cell must show a DIFFERENT scene; never repeat or mirror a scene in another cell.
Do NOT paint any border, arch, pillar or ornamental frame inside a cell — the cells
are bare illustrations that will be framed by the game itself.
```

---

# 재요청 프롬프트 (완료 — 기록용)

**둘 다 이미 받아서 적용했다** (`RE_S4.png`, `RE_U1.png`). 아래는 다음에 같은 문제가 생겼을 때 재사용하려고 남겨둔다.

## R1 — S4 다시 (칸 안의 금색 아치 제거) ✅ 적용됨

```
Match the exact art style, palette, lighting and brushwork of the attached reference image.

A wide sprite sheet of 10 fantasy card illustrations, arranged in a perfectly even
2 rows × 5 columns grid. Each cell is LANDSCAPE orientation, roughly 4:3 — wider
than it is tall.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament, occult undertone.
Dramatic chiaroscuro lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, or any shadow or gradient on the background.
CRITICAL: do NOT paint any border, arch, pillar, corner ornament or decorative frame
inside a cell. Each cell is a bare illustration bleeding to its own edges — the game
puts its own frame around it later. A painted frame inside the art is a frame inside
a frame and must not appear.

LAYOUT: the grid must be EXACTLY 2 rows by 5 columns — ten cells, no more and no
fewer. Every cell must show a DIFFERENT scene; never repeat or mirror a scene in
another cell. Every cell exactly the same size, the scene centered and filling its
cell edge to edge. Background visible in the gutters between cells must be perfectly
uniform flat solid magenta #FF00FF.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a knight's sword wrenched from his grip and hanging in the air just out of
    reach, his empty hand still open
2.  a buried iron mine under a board square, only a thin trigger plate showing,
    faint red glow seeping from the seam
3.  a battlefield of chess pieces seen through a warped violet haze in which every
    piece has become an identical pawn silhouette
4.  a spy's eye at a keyhole with a pair of bone dice tumbling in the foreground,
    a drawn card lit in the gap
5.  a chess piece blurring sideways out of a sword's path, an afterimage left
    behind where it stood
6.  a pair of shears snipping a glowing rune thread an instant before it reaches a
    chess piece
7.  one chess piece rendered twice in a single stride, two overlapping strides of
    motion, doubled ember trail
8.  a knight kneeling and driving a dagger into his own chest as three other pieces
    surge forward past him, lit by his blood
9.  a pawn kneeling under the descending sword blade of knighthood, its silhouette
    already growing into a taller piece
10. a chess piece and its exact mirrored double standing on adjacent squares, the
    double faintly translucent and edged in blue light
```

## R2 — U1 다시 (어두운 타일 없이 떠 있는 아이콘으로) ✅ 적용됨

```
Match the exact art style, palette, lighting and brushwork of the attached reference image.

A single square sprite sheet of 16 fantasy game UI icons, arranged in a perfectly
even 4 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged metal, dark oiled wood, gold leaf ornament. Dramatic chiaroscuro
lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders.

CRITICAL — THE BACKGROUND: every icon must be a single object FLOATING FREELY on the
magenta. Do NOT paint a dark tile, plate, roundel, card, panel, vignette or any
backdrop shape behind an icon. Do NOT paint a floor, a table, a wall or a chessboard
under it. The magenta must run right up to the painted edge of the object itself on
all four sides. One perfectly uniform flat solid magenta #FF00FF across the entire
canvas and every gutter.

LAYOUT: every cell exactly the same size, subject centered with at least 18% empty
magenta padding on all four sides, subjects never touching or overlapping a
neighboring cell. Each icon must read clearly as a silhouette at 48×48 pixels.
Any glow stays tight inside the subject and never bleeds into the background.

THE 16 ICONS, in reading order (left to right, top to bottom):
1.  a heavy iron gauntlet fist, blunt and straightforward
2.  a single feathered arrow in flight with a sharp speed streak behind it
3.  a hand sprinkling glowing dust down onto a small chess piece
4.  an hourglass wrapped in ivy that has grown into the glass itself
5.  a raised open palm behind a small round buckler, a blocking gesture
6.  a stack of face-down cards with the top one lifting off
7.  a small chess pawn rising out of a glowing summoning circle
8.  a lit brazier with a single spark leaping upward
9.  a riding boot mid-stride, no floor beneath it
10. a plain round gold coin with a faceted gem set into its center
11. an ornate spiral seashell horn being sounded
12. a pair of bone dice at rest, pips glowing faintly
13. a burning card curling into ash
14. a sandbag hanging from a short rope
15. a closed iron bear trap
16. an eye inside a triangle, half-lidded and watchful
```

---

## 코드 쪽은 이미 대비되어 있다

- 아트가 없는 카드는 **자동으로 이모지 글리프 카드**로 그려진다(`.tcg-glyph`). 시트가 늦어도 게임은 돈다.
- 파일이 `apps/client/public/assets/skills/<카드id>.png` 로 들어오면 **코드 수정 없이** 바로 뜬다.
- 재요청한 시트는 `public/assets/new/` 에 **같은 이름으로 덮어쓰고** `python tools/slice-new.py` 만 돌리면 된다.
- 카드 id 63개 (`docs/skill.md` 순서 그대로):

| 코스트 | 카드 id |
|---|---|
| 1 | `scout` `spy` `divination` `meditate` `offering` `disguise` `readiness` `bait` `small-sandbag` `vigilance` |
| 2 | `dash` `shove` `pull` `leap` `swamp` `small-shield` |
| 3 | `clairvoyance` `herald` `javelin` `citadel` `large-sandbag` `beacon` `insight` `ward` |
| 4 | `cleanse` `unbind` `recall` `coerce` `transpose` `guard-drill` `disarm` `mine` `hallucination` `espionage` `evade` `sever` |
| 5 | `double` `blood-price` `promotion` `double-image` `kings-strike` `rewind` `thrift` `riposte` `last-stand` |
| 6 | `shatter` `exchange` `awaken` `brainwash` `bond-chain` `fate-chain` `agile-knight` `muddy-water` `bodyguard` |
| 7 | `pandemonium` `assassinate` `regicide` `sanctuary` `plague` |
| 8 | `purifying-light` `typhoon` `earthquake` `gambling-den` |
