# Gemini UI 애셋 프롬프트 — 8개

각 프롬프트는 **그대로 복사해서 붙여넣으면 끝**이다. 스타일·기술 규칙이 이미 안에 다 들어있다.

## 규칙 3개

1. **한 번에 하나씩.** 몰아서 요청하면 품질이 무너진다.
2. **P1을 제일 먼저 뽑고, P2부터는 통과한 P1 이미지를 첨부**한 뒤 프롬프트 맨 앞에 이 줄을 추가:
   `Match the exact art style, palette, lighting and brushwork of the attached reference image.`
   → 전 애셋 톤을 묶는 가장 확실한 방법.
3. 배경이 흰색이나 체커보드로 나오면 "background must be solid magenta #FF00FF" 를 강조해서 재요청.
   마젠타로 나와야 내가 깔끔하게 지운다.

**나온 파일은 `apps/client/public/assets/raw/` 에 `p1-icons.png` 식으로 넣고 알려주면**
자르기 · 배경 제거 · 코드 배선까지 내가 한다.

**추천 순서**: P1 → P4 → P2 → P3 (여기까지가 체감의 90%) → P5 → P6 → P7 → P8

---

## P1 — UI 아이콘 16종 ★제일 먼저

```
A single square sprite sheet of 16 fantasy game UI icons, arranged in a perfectly even
4 rows × 4 columns grid.

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
and every gutter. Each icon must still read clearly as a silhouette at 64×64 pixels.
Any glow stays tight inside the subject and never bleeds into the background.

THE 16 ICONS, in reading order (left to right, top to bottom):
1.  a lit stone hearth fireplace with a small warm fire
2.  a hooded adventurer bust in three-quarter view, face in shadow
3.  a fat drawstring leather coin pouch with gold coins spilling out
4.  two crossed swords over a small checkered board
5.  a brass armillary sphere globe wrapped in glowing rune lines
6.  a fanned hand of five ornate playing cards, backs facing out
7.  an ornate brass clockwork gear with worn teeth
8.  a snuffed candle with a curl of smoke rising from the wick
9.  a jagged lightning bolt struck through a small hourglass
10. a heraldic banner on a pole bearing a bold plus-sign shape
11. a brass magnifying glass over a folded parchment map
12. a heavy closed iron padlock with a keyhole
13. a single thick gold coin at a slight angle, ornate stamped face
14. a snarling wolf head crest in profile, heraldic style
15. an ornate card back with a glowing question-mark-shaped rune
16. a pair of tumbling bone dice with glowing pips
```

---

## P2 — 스킬 카드 아트 1~10

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
1.  a chess pawn stepping backwards off its square, a trail of glowing ember
    footprints left behind it
2.  a bishop and a rook silhouette overlapping, a blazing golden cross of light and
    a diagonal X of light cutting through them
3.  a tattered war banner on a spear planted mid-charge, dust and sparks kicked up
    around its base
4.  a rook and a bishop caught mid-swap inside a swirling vortex of dark arcane
    smoke, their forms half-dissolved into each other
5.  a rearing armored horse head from a chess knight, leaping, glowing arc trails
    tracing its jump path
6.  a single arcane eye opening in the middle of an ornate card back, rays of violet
    sight streaming from the pupil
7.  a massive iron tower shield planted in the ground, sparks and shattered arrow
    shafts ricocheting off its face, faint green ward glow
8.  a curved dagger driven through a rolled parchment contract, a broken wax seal
    and a bead of dark blood
9.  a translucent ghostly chess piece passing straight through a solid stone piece,
    ectoplasmic trails, cold pale-green glow
10. two chess pieces dissolving into swirling motes of light, the motes crossing
    paths in an arc as they swap positions
```

---

## P3 — 스킬 카드 아트 11~20

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
is a single dramatic focal scene, dark and moody, readable at small size. The last
four scenes are the most epic and radiant of the set.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a hooded cloak billowing over a group of chess pieces, all of them reduced to
    identical anonymous pawn silhouettes inside the fog
2.  a pawn throwing itself in front of a crowned king, taking a descending blade
    through its body, the king untouched behind it
3.  an ornate hourglass with the sand streaming upward instead of down, glowing blue
    time runes orbiting the glass
4.  an ouroboros serpent biting its own tail, looping around a burning hourglass,
    blue flame
5.  a pair of tumbling bone dice, and above them a spectral chess piece reassembling
    itself from a swirl of ash and blue sparks
6.  a stone pawn cracking open like an egg, a larger crowned piece emerging in blue
    light, dice tumbling at its base
7.  a mob of pawn-shaped figures raising pitchforks and torches, violet firelight,
    angry uprising silhouette
8.  a crowned king rising inside a pillar of radiant violet light, two small pawns
    kneeling at his flanks
9.  a colossal armored titan built from fused stone chess pieces, glowing golden
    seams between its parts, towering low-angle heroic shot
10. heavy iron chains snapping apart, chess pieces mid-transformation into crowned
    queens, blinding gold radiance, the most epic image of the set
```

---

## P4 — 카드 프레임 5종 (레어도별) ★덱 빌더 핵심

```
A wide sheet showing 5 empty collectible card frames side by side in a single row,
evenly spaced, each in 5:7 portrait ratio, seen perfectly flat-on with zero
perspective and no tilt.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Ornate carved metal and gold
leaf filigree, aged and worn. Dramatic warm lighting from the upper left.
PALETTE: deep brown #150e0a, oiled wood #2e2016, aged parchment #e7d3a6, gold leaf
#d8b45a / #f2d98d / #8a6a2e. Warm, desaturated, aged.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures, or
any card art, illustration or icon inside the frames.

Background behind and between the cards: perfectly uniform flat solid magenta
#FF00FF, no gradient, no shadow.

ALL FIVE FRAMES SHARE THE IDENTICAL LAYOUT:
- an ornate outer border with filigree at all four corners,
- a large EMPTY inset art window occupying the upper 46% of the card — this window
  must be filled with FLAT SOLID MAGENTA #FF00FF so it can be cut out,
- below it a blank ornamental name banner, completely empty,
- below that a blank recessed parchment text panel, completely empty,
- an empty round gem socket set into the top-left corner.

THE FIVE FRAMES DIFFER ONLY IN METAL AND GEM COLOUR, cheapest to most ornate,
left to right:
1. plain worn brass #8f7c56, minimal filigree
2. verdigris bronze with green patina #6f9a56
3. polished silver with arcane blue enamel #5a83c4
4. dark iron with violet crystal inlay #9a63c8
5. heavy gold leaf #e0a33a, thickest filigree, faint radiant glow
```

---

## P5 — 체스 말 12종

```
A single square sprite sheet of 12 carved chess pieces, arranged in a perfectly even
3 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Hand-carved antique chess set,
ornate but readable. Dramatic chiaroscuro lighting, warm light from the upper left.
PALETTE: deep brown #150e0a, oiled wood #2e2016 / #3b2a1b, aged ivory #e7d3a6 /
#d2b985, gold leaf #d8b45a / #8a6a2e, blood red #b03a34. Warm, desaturated, aged.
NEVER include: text, letters, numbers, labels, watermarks, signatures, drawn grid
lines, a board, squares, or a frame around the whole image.

CRITICAL: all twelve pieces must be the SAME carved chess set — identical sculpting
language, identical camera angle (straight-on three-quarter view, slightly from
above), identical lighting, and correct relative scale (pawn shortest, king tallest).
They will sit side by side on one board, so consistency matters far more than
individuality.

LAYOUT: every cell exactly the same size, one piece centered per cell with at least
12% empty padding on all sides, never touching a neighboring cell. Background:
perfectly uniform flat solid magenta #FF00FF across the whole canvas. No cast shadow
on the background. Each piece must read as a clear silhouette at 64×64 pixels.

THE 12 PIECES, in reading order (left to right, top to bottom):
Cells 1–6 are the WHITE set, carved from pale aged ivory and bone with gold leaf
detailing: 1 king, 2 queen, 3 rook, 4 bishop, 5 knight, 6 pawn.
Cells 7–12 are the BLACK set, carved from dark obsidian and charred oak with blood
red inlay: 7 king, 8 queen, 9 rook, 10 bishop, 11 knight, 12 pawn.
```

---

## P6 — 게임 아이콘 4 + 상점 아이템 6

```
A wide sprite sheet of 10 fantasy game object icons, arranged in a perfectly even
2 rows × 5 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Candlelit medieval
mood: aged parchment, dark oiled wood, gold leaf ornament. Dramatic chiaroscuro
lighting, warm light source from the upper left.
PALETTE (use only these): deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b,
aged parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a. Warm,
desaturated, aged. No neon, no pastel, no pure white.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, or any shadow or
gradient on the background.

LAYOUT: every cell exactly the same size, subject centered with at least 12% empty
padding on all four sides, never touching a neighboring cell. Background: perfectly
uniform flat solid magenta #FF00FF across the entire canvas and every gutter. Each
icon must read clearly as a silhouette at 64×64 pixels.

THE 10 ICONS, in reading order (left to right, top to bottom):
1.  an ornate carved chess knight piece, three-quarter view, dark stone with gold
    leaf inlay
2.  a traditional Korean janggi general piece: an octagonal polished wooden disc
    with a deeply carved calligraphic glyph and red lacquer inlay
3.  three go stones on a wooden board, two black and glossy, one white, forming a
    diagonal line
4.  a pair of ornate dice resting on the folded corner of a game board
5.  a sealed paper card pack with a wax seal, slightly torn open
6.  a solid gold ornate chess queen standing on a small pedestal
7.  an ornate card pack wrapped in gold foil, light radiating from its seam
8.  a small framed painting of an abstract glowing board pattern
9.  an hourglass wrapped in a lightning bolt with doubled arrows around it
10. an ornate laurel-wreathed trophy cup with a ribbon
```

---

## P7 — 보드 텍스처 4종

```
A single square sheet split into an even 2 rows × 2 columns grid of four flat
material texture swatches, with no gap between them and no gutter.

STYLE: Dark-fantasy tabletop game material studies, hand-painted with visible
painterly brush texture — NOT flat vector, NOT 3D render, NOT photorealistic.
Aged, worn, warm, desaturated.
PALETTE: deep brown #150e0a, oiled wood #2e2016 / #3b2a1b, aged ivory #e7d3a6 /
#d2b985, warm parchment tones.
NEVER include: text, letters, numbers, labels, watermarks, signatures, borders,
frames, objects, or any focal detail.

CRITICAL: each swatch must be an EVENLY LIT flat material sample with NO vignette,
NO directional light falloff, NO drop shadow and NO single standout detail — it will
be tiled repeatedly, so any strong feature would visibly repeat. Keep every swatch
subtle, uniform and low contrast across its whole area.

THE 4 SWATCHES, in reading order (left to right, top to bottom):
1. pale aged ivory stone with subtle veining
2. dark oiled walnut wood grain
3. warm aged kaya wood with fine straight grain and no knots
4. aged parchment paper with subtle fiber and faint stains
```

---

## P8 — 패널 · 버튼 · 프레임 UI 킷

```
A single square sheet showing 6 empty dark-fantasy UI plates, stacked in 6 evenly
spaced horizontal rows, each centered, each separated by clear empty space. All are
seen perfectly flat-on with zero perspective.

STYLE: Dark-fantasy tabletop game UI in the style of Slay the Spire and Darkest
Dungeon. Hand-painted with visible painterly brush texture — NOT flat vector, NOT 3D
render, NOT photorealistic. Ornate carved wood and gold leaf filigree, aged and worn.
Warm light from the upper left.
PALETTE: deep brown #150e0a, oiled wood #2e2016 / #3b2a1b, aged parchment #e7d3a6,
gold leaf #d8b45a / #f2d98d / #8a6a2e.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures, or
any icon or content inside the plates.

CRITICAL: every plate's interior must stay visually FLAT and UNIFORM across its whole
area so it can be stretched — all decoration lives in the border and the corners.
Corner ornaments must be identical on all four corners. Edge decoration must be a
repeating motif that still reads correctly when the middle of an edge is stretched.
Background: perfectly uniform flat solid magenta #FF00FF everywhere around and
between the plates.

THE 6 PLATES, top to bottom:
1. a large wide rectangular panel: dark oiled wood interior with a gold leaf inset
   frame and riveted corners
2. a wide horizontal top bar plate: dark wood with a gold lower edge molding
3. a horizontal heraldic banner plaque with ornate gold ends and a blank parchment
   center
4. a wide pill-shaped button plate in embossed gold leaf, brushed warm metal with a
   soft top highlight
5. a wide pill-shaped button plate in dark oiled wood with a thin gold outline,
   recessed
6. a circular portrait frame with a gold leaf laurel border and a completely empty
   flat magenta interior circle
```

---

---

# 재생성분 (1차 결과 보정)

## P2b — 스킬 아트 1~10 다시 (가로형 + P3와 톤 통일)

1차 P2는 **세로형**으로 나왔는데 P3는 **가로형**이라 카드 아트창에 맞추면 P2만 크게 잘린다.
또 P3에만 촛대 모티프가 들어가 있어 20장이 두 가지 톤으로 갈린다.

**반드시 `3.png`(P3 결과물)를 첨부하고** 아래를 붙여넣을 것.

```
Match the attached reference image exactly: same hand-painted brush style, same
palette, same dramatic candlelit lighting, same cell shape and composition
language. The new sheet must look like it came from the same set.

A wide sprite sheet of 10 fantasy card illustrations in a perfectly even
2 rows × 5 columns grid. Every cell is LANDSCAPE, roughly 4:3 — wider than tall,
exactly like the reference. Each scene fills its cell edge to edge.

Like the reference, include a small lit wall candle sconce glowing in the upper
left of each scene, casting warm light across the subject.

PALETTE: deep brown #150e0a / #1f150d, oiled wood #2e2016 / #3b2a1b, aged
parchment #e7d3a6 / #d2b985, gold leaf #d8b45a / #f2d98d / #8a6a2e, ember orange
#d9532e, blood red #b03a34, arcane blue #5a83c4, poison green #7fae4a.
NEVER include: text, letters, numbers, labels, watermarks, signatures, drawn grid
lines or cell borders. Gutters between cells: flat solid magenta #FF00FF.

THE 10 SCENES, in reading order (left to right, top to bottom):
1.  a chess pawn stepping backwards off its square, a trail of glowing ember
    footprints left behind it
2.  a bishop and a rook silhouette overlapping, a blazing golden cross of light
    and a diagonal X of light cutting through them
3.  a tattered war banner on a spear planted mid-charge, dust and sparks kicked
    up around its base
4.  a rook and a bishop caught mid-swap inside a swirling vortex of dark arcane
    smoke, their forms half-dissolved into each other
5.  a rearing armored horse head from a chess knight, leaping, glowing arc trails
    tracing its jump path
6.  a single arcane eye opening in the middle of an ornate card back, rays of
    violet sight streaming from the pupil
7.  a massive iron tower shield planted in the ground, sparks and shattered arrow
    shafts ricocheting off its face, faint green ward glow
8.  a curved dagger driven through a rolled parchment contract, a broken wax seal
    and a bead of dark blood
9.  a translucent ghostly chess piece passing straight through a solid stone
    piece, ectoplasmic trails, cold pale-green glow
10. two chess pieces dissolving into swirling motes of light, the motes crossing
    paths in an arc as they swap positions
```

## P6b — 오목 아이콘 1개만 다시

1차 오목 칸은 나무 판이 배경째로 깔려 나와서, 배경 없이 떠 있는 다른 아이콘들과 톤이 안 맞는다.
(같이 튀어나온 `dice-generic`은 게임 3종 목록에 안 쓰니 무시해도 된다.)

**`1.png`(P1 아이콘 시트)를 첨부하고** 아래를 붙여넣을 것.

```
Match the attached reference sheet exactly: same hand-painted icon style, same
palette, same lighting, same level of detail and outline weight.

A single game icon, centered on a perfectly uniform flat solid magenta #FF00FF
background filling the whole canvas.

CRITICAL: the object must float FREE on the magenta with nothing behind it — no
board, no table, no wooden panel, no backdrop, no ground plane, no cast shadow.
Just the isolated object, exactly like every icon in the reference sheet.

THE ICON: a small tight cluster of five go stones — three black and glossy, two
polished white — stacked and overlapping in a compact diagonal arrangement, seen
from a three-quarter angle, as if floating in mid-air.

PALETTE: deep brown #150e0a, oiled wood #2e2016, aged parchment #e7d3a6, gold
leaf #d8b45a / #8a6a2e.
NEVER include: text, letters, numbers, labels, watermarks, signatures, borders,
or a frame around the image. It must read clearly as a silhouette at 64×64 px.
```

파일명은 `2b.png`, `6b-gomoku.png` 로 `raw/` 에 넣어주면 된다.

## P11 — 장기말 14종 + 오목돌 2종

체스만 그려진 말을 쓰고 장기·오목은 캔버스로 그린 단색 원반이라 톤이 안 맞는다.
**`5.png`(체스말 시트)를 첨부하고** 아래를 붙여넣을 것.

```
Match the attached reference sheet exactly: same hand-painted style, same
lighting, same camera angle, same level of carved detail.

A single square sprite sheet of 16 board game pieces in a perfectly even
4 rows × 4 columns grid.

CRITICAL: the janggi pieces must all be the SAME carved set — identical octagonal
disc shape, identical camera angle (straight-on, very slightly from above),
identical lighting and scale. Only the engraved character and the disc's colour
change between them. They sit side by side on one board, so consistency matters
far more than individuality.

LAYOUT: every cell the same size, one piece centred with at least 12% empty
padding on all sides, never touching a neighbouring cell. Background: one
perfectly uniform flat solid magenta #FF00FF across the whole canvas. No cast
shadow on the background. Each piece must read clearly at 64×64 pixels.

PALETTE: deep brown #150e0a, oiled wood #2e2016 / #3b2a1b, aged ivory #e7d3a6,
gold leaf #d8b45a / #8a6a2e, blood red #b03a34, deep indigo #1c3f6e.
NEVER include: watermarks, signatures, borders, a board, grid lines, or a frame
around the image. (The engraved characters listed below are part of the carving
and ARE wanted — no other text.)

THE 16 PIECES, in reading order (left to right, top to bottom):
Rows 1-2 — the BLUE side: octagonal polished wood discs with deeply carved
characters inlaid in deep indigo #1c3f6e:
1. 楚   2. 士   3. 象   4. 馬
5. 車   6. 包   7. 卒   8. (an empty octagonal blue disc, no character)
Rows 3-4 — the RED side: the same discs with characters inlaid in blood red
#b03a34:
9. 漢   10. 士   11. 象   12. 馬
13. 車  14. 包   15. 兵   16. (an empty octagonal red disc, no character)
```

이어서 오목돌은 따로 한 장 (**`1.png` 첨부**):

```
Match the attached reference sheet's hand-painted style, lighting and finish.

A single wide sheet with exactly 2 objects side by side on a perfectly uniform
flat solid magenta #FF00FF background, each centred in its half with generous
padding, not touching.

LEFT: one single go stone, glossy jet black, seen straight on from directly
above, a soft specular highlight in the upper left, slightly domed.
RIGHT: the same stone in polished cream white with faint warm shell veining.

Both stones must be the SAME size, shape and lighting — only the colour differs.
NEVER include: text, numbers, watermarks, signatures, borders, a board, shadows
cast onto the background.
```

파일명은 `11-janggi.png`, `12-stones.png` 로 넣어주면 된다.

---

## 이걸로 뭐가 커버되나

| 프롬프트 | 장수 | 대체 대상 |
|---|---|---|
| P1 | 16 | 메뉴·네비·상점·자물쇠·코인·주사위 등 UI 이모지 전부 |
| P2+P3 | 20 | 스킬 카드 20종 아트 |
| P4 | 5 | 덱 빌더 카드 프레임 (레어도별) |
| P5 | 12 | 캔버스 체스 말 유니코드 글리프 |
| P6 | 10 | 게임 선택 아이콘 + 상점 아이템 |
| P7 | 4 | 보드 칸 / 양피지 텍스처 |
| P8 | 6 | 패널·HUD바·배너·버튼·아바타 액자 |
| **합계** | **73장** | **프롬프트 8개** |
