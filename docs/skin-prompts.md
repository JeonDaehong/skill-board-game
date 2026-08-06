# 스킨 애셋 프롬프트 — 기물 3종 + 보드 테마 3종

기물 스킨 3개와 보드 테마 3개를 뽑는 프롬프트다. `docs/asset-prompts.md`와 같은 방식이고,
**그대로 복사해서 붙여넣으면 끝**이다.

## 규칙

1. **한 번에 하나씩.** 6장을 몰아서 요청하면 품질이 무너진다.
2. **기존 톤에 묶으려면** 통과한 기본 기물 시트(`apps/client/public/assets/pieces/`의 아무 파일이나,
   또는 `raw/`에 남아있는 sheet 5)를 첨부하고 프롬프트 맨 앞에 이 줄을 추가:
   `Match the exact art style, palette, lighting and brushwork of the attached reference image.`
   기물 스킨은 **실루엣이 기본 세트와 같아야** 한다 — 같은 칸에 같은 크기로 들어가야 하니까.
3. 배경이 흰색이나 체커보드로 나오면 `background must be solid magenta #FF00FF`를 강조해서 재요청.
4. 나온 파일은 `apps/client/public/assets/raw/`에 아래 이름으로 넣고 알려주면
   자르기 · 배경 제거 · 코드 배선은 내가 한다.

| 프롬프트 | raw 파일명 | 잘려 들어갈 곳 |
|---|---|---|
| S1 기물 · 악마 | `s1-pieces-demon.png` | `assets/pieces/demon/{wk…bp}.png` |
| S2 기물 · 유해 | `s2-pieces-ossuary.png` | `assets/pieces/ossuary/{wk…bp}.png` |
| S3 기물 · 천사 | `s3-pieces-angel.png` | `assets/pieces/angel/{wk…bp}.png` |
| S4 테마 · 비전 | `s4-theme-arcane.png` | `assets/textures/arcane/{light,dark}.png` |
| S5 테마 · 대리석 | `s5-theme-marble.png` | `assets/textures/marble/{light,dark}.png` |
| S6 테마 · 사암 | `s6-theme-sandstone.png` | `assets/textures/sandstone/{light,dark}.png` |

**추천 순서**: S4 → S1 → S5 → S3 → S6 → S2
(테마가 체감이 제일 크다. 보드 전체가 바뀌는 게 기물 12개보다 먼저 눈에 들어온다.)

### 도금·비취가 안 먹혔던 이유

첫 버전의 S1(도금)·S3(비취)는 **재질만으로 12칸을 통제하려 했다.** "금박 입힌 상아"와
"검게 벼린 강철"은 실루엣이 기본 세트와 같아야 한다는 조건까지 붙으면 모델이 붙잡을 형상이
없어서, 셀마다 다른 물건이 나오거나 12칸이 다 비슷해진다. 게다가 `same silhouette as 1`처럼
**다른 셀을 참조하라는 지시는 확산 모델이 거의 못 지킨다.**

악마·천사는 그 반대다. 킹·퀸·비숍·나이트·폰이 각각 **누구인지**가 명확하니 셀마다 그릴 것이
정해지고, 밝은 쪽/어두운 쪽도 재질이 아니라 **같은 진영의 두 계급**으로 갈라진다.
그래서 아래 두 프롬프트는 셀 설명이 훨씬 구체적이고, 상호 참조가 하나도 없다.

**애셋이 없어도 게임은 돌아간다.** 스킨을 장착했는데 파일이 없으면 기본 세트로 조용히 되돌아간다
(`render.ts`의 `preloadPieces`가 기본을 먼저 깔고 스킨을 덮어쓰는 순서라서 그렇다).
그래서 상점·내 정보 배선을 먼저 해놔도 깨지지 않는다.

---

## 1차 결과 기록 (2026-08-06)

S1~S6 전부 받아서 `tools/slice-skins.py`로 잘라 배선 완료. 실제 판에서 확인한 상태:

| 스킨 | 상태 |
|---|---|
| 악마 (S1) | **12/12 정상** |
| 천사 (S3) | **12/12 정상** — 아래 후광 문제 코드에서 처리 |
| 유해 (S2) | **11/12** — 흑 킹 없음. 재요청 필요 |
| 비전·대리석·사암 (S4~S6) | **정상** |

### 다음에 뽑을 때 알아야 할 것 3개

1. **생성기는 3행×4열을 안 지켰다.** 세 시트 모두 **2행×6열**로 왔다. 게다가 배치가 시트마다
   달랐다 — S1은 1행에 `밝은 K Q R · 어두운 K Q R`, S3은 1행 전체가 밝은 쪽이었다.
   그래서 `slice-skins.py`는 **시트별로 읽는 순서를 따로 선언**한다. 새 시트를 받으면
   `python tools/slice-skins.py --contact`로 라벨 붙은 대조 시트를 뽑아 매핑을 눈으로 확인할 것.
   행·열 수와 순서는 `PIECE_SHEETS`에서 고치면 된다.

2. **S2는 결함이 있다.** 밝은 비숍이 두 번 그려지고 **어두운 킹이 아예 빠졌다.**
   재요청할 때 프롬프트 맨 끝에 이 줄을 추가하면 좋다:
   `All 12 cells must be different. The dark side must include its own king — a
   tall column of stacked vertebrae with an antler crown, charred black with pale
   cracks. Do not draw the same piece twice.`
   지금은 흑 킹만 기본 세트로 대체돼서 플레이는 정상이다.

3. **후광 안쪽을 채우지 말라고 명시할 것.** S3의 어두운 쪽 후광은 안쪽이 살몬색으로 칠해져
   나와서 판에서 분홍 원반으로 보였다. 지금은 `slice-skins.py`의 `key_out(rose=True)`가
   그 색만 골라 지운다(후광은 r−g≈70, 대리석 몸통은 ≈29으로 분리됨). 재요청할 때는
   `the halo is an open ring — the space inside it is background and must never be
   filled or tinted` 를 넣으면 코드로 처리할 필요가 없다.

---

## 기물 스킨 공통 규격

세 프롬프트 모두 아래를 지킨다. 슬라이서(`tools/slice-assets.py`, `cut_subjects(sheet, 3, 4, PIECES, …)`)가
**3행 × 4열**로 자르고, 읽는 순서는 `wk wq wr wb wn wp bk bq br bb bn bp`다.

- 1행: 백 킹 · 백 퀸 · 백 룩 · 백 비숍
- 2행: 백 나이트 · 백 폰 · 흑 킹 · 흑 퀸
- 3행: 흑 룩 · 흑 비숍 · 흑 나이트 · 흑 폰

기물은 **정면에서 살짝 위**로 본 조각상이고, 킹이 가장 높고 폰이 가장 낮은 높이 서열이
기본 세트와 같아야 한다 (렌더러가 스프라이트 비율을 그대로 쓰므로 높이가 곧 위계다).

**셀 설명은 서로를 참조하지 않는다.** 12칸 전부 독립적으로 "무엇을 그릴지"가 적혀 있어야
모델이 지킨다. 밝은 쪽 6개와 어두운 쪽 6개는 같은 진영의 두 계급으로 나눈다.

---

## S1 — 기물 스킨 · 악마 (Infernal)

```
A single sprite sheet of 12 dark-fantasy chess piece figures, arranged in a
perfectly even 3 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Each piece is a
single small statue standing upright on its own round base, seen from the front
and very slightly above, the way a physical game piece sits on a table. Dramatic
chiaroscuro lighting, warm light source from the upper left, soft contact shadow
under the base.

THIS SKIN — INFERNAL: an army out of hell, carved as game pieces rather than drawn
as characters — compact, heavy, symmetrical, no action poses, no weapons raised
above the head. Every figure has horns. Molten cracks run through the stone and
glow from inside, brightest at the base and dimmest at the top.
The FIRST SIX pieces (the light side) are pale ash-grey volcanic rock with dull
orange embers in the cracks.
The LAST SIX pieces (the dark side) are near-black charred obsidian with fierce
bright orange embers in the cracks, clearly darker overall than the first six.
PALETTE (use only these): ash grey #8a8078 / #b0a49a / #5c5450, charred black
#150e0a / #1f150d / #2b2521, ember orange #d9532e / #f08a3c, blood red #b03a34,
gold leaf #8a6a2e used only on horn bands and crowns. Warm, desaturated, sooty.
No neon, no pastel, no pure white, no blue, no green, no purple.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, chess board
squares, any surface beyond each piece's own base, wings that stretch outside the
cell, or any shadow or gradient on the background.

LAYOUT: every cell exactly the same size, one figure centered per cell with at
least 14% empty padding on all four sides, figures never touching or overlapping a
neighbouring cell. Background: one perfectly uniform flat solid magenta #FF00FF
across the entire canvas and every gutter. Any ember glow stays tight inside the
figure and never bleeds into the background. Each figure must still read clearly as
a silhouette at 64 pixels tall.

HEIGHT ORDER, strictly: the king is the tallest, then queen, then bishop, then
rook, then knight, then pawn as the shortest.

THE 12 PIECES, in reading order (left to right, top to bottom):
1.  ASH KING — a tall horned demon lord on a throne-like plinth, arms crossed over
    the chest, a heavy iron crown between two great curling ram horns
2.  ASH QUEEN — a slightly shorter horned demoness, folded bat wings wrapped
    tightly around her like a cloak, thin coronet of spikes
3.  ASH ROOK — a squat fortress of fused black rock with a screaming face carved
    into its front and crenellations shaped like broken teeth
4.  ASH BISHOP — a tall hooded cultist, face entirely lost in shadow inside the
    hood, two small horns pushing through the fabric
5.  ASH KNIGHT — a nightmare horse head in profile facing right, mane made of
    flame, on a round base
6.  ASH PAWN — a small squat imp crouching on a round base, oversized horns, arms
    hugging its knees
7.  OBSIDIAN KING — a tall horned demon lord on a throne-like plinth, arms crossed
    over the chest, a heavy iron crown between two great curling ram horns
8.  OBSIDIAN QUEEN — a slightly shorter horned demoness, folded bat wings wrapped
    tightly around her like a cloak, thin coronet of spikes
9.  OBSIDIAN ROOK — a squat fortress of fused black rock with a screaming face
    carved into its front and crenellations shaped like broken teeth
10. OBSIDIAN BISHOP — a tall hooded cultist, face entirely lost in shadow inside
    the hood, two small horns pushing through the fabric
11. OBSIDIAN KNIGHT — a nightmare horse head in profile facing right, mane made of
    flame, on a round base
12. OBSIDIAN PAWN — a small squat imp crouching on a round base, oversized horns,
    arms hugging its knees
```

---

## S2 — 기물 스킨 · 유해 (Ossuary)

```
A single sprite sheet of 12 carved chess piece sculptures, arranged in a perfectly
even 3 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Each piece is a
solid carved sculpture standing upright, seen from the front and very slightly
above, as a physical game piece would sit on a table. Dramatic chiaroscuro
lighting, cold light source from the upper left, soft contact shadow under the base.

THIS SKIN — OSSUARY: the pieces are carved from bone and antler. The light side is
pale scrimshawed bone, scratched and yellowed at the crevices, with tiny etched
rune marks. The dark side is bone that has been charred black, cracked, with the
pale material showing through the fissures. Occult but restrained — no gore, no
faces, no exposed skulls beyond stylised ornament.
PALETTE (use only these): aged bone #e7d3a6 / #d2b985 / #b39c74, charred black
#150e0a / #1f150d / #33241a, cold arcane blue #5a83c4 used only as a faint glow in
the deepest cracks, dried blood #b03a34 used sparingly on binding cord. Desaturated
and aged. No neon, no pastel, no pure white, no green.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, chess board
squares, any surface the pieces stand on, or any shadow or gradient on the
background.

LAYOUT: every cell exactly the same size, one piece centered per cell with at least
14% empty padding on all four sides, pieces never touching or overlapping a
neighbouring cell. Background: one perfectly uniform flat solid magenta #FF00FF
across the entire canvas and every gutter. Any glow stays tight inside the piece
and never bleeds into the background. Each piece must still read clearly as a
silhouette at 64 pixels tall.

HEIGHT ORDER, strictly: the king is the tallest, then queen, then bishop, then
rook, then knight, then pawn as the shortest. Keep this ratio consistent between
the light and the dark side.

THE 12 PIECES, in reading order (left to right, top to bottom):
1.  WHITE KING — tall column of stacked vertebrae, antler crown finial
2.  WHITE QUEEN — slightly shorter, fanned antler coronet
3.  WHITE ROOK — squat drum of bound rib bones, crenellated top
4.  WHITE BISHOP — tall tapering mitre carved from a single tusk, one vertical slit
5.  WHITE KNIGHT — horse skull in profile facing right, on a round base
6.  WHITE PAWN — small knuckle bone on a short collared stem
7.  BLACK KING — same silhouette as 1, charred with pale cracks
8.  BLACK QUEEN — same silhouette as 2, charred with pale cracks
9.  BLACK ROOK — same silhouette as 3, charred with pale cracks
10. BLACK BISHOP — same silhouette as 4, charred with pale cracks
11. BLACK KNIGHT — same silhouette as 5, charred with pale cracks
12. BLACK PAWN — same silhouette as 6, charred with pale cracks
```

---

## S3 — 기물 스킨 · 천사 (Celestial)

```
A single sprite sheet of 12 dark-fantasy chess piece figures, arranged in a
perfectly even 3 rows × 4 columns grid.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic, NOT anime. Each piece is a
single small statue standing upright on its own round base, seen from the front
and very slightly above, the way a physical game piece sits on a table. Dramatic
chiaroscuro lighting, warm light source from the upper left, soft contact shadow
under the base.

THIS SKIN — CELESTIAL: a host of angels carved as game pieces rather than drawn as
characters — compact, heavy, symmetrical, no action poses, no weapons raised above
the head. Every figure has wings folded tightly against the body, never spread.
Faces are serene and downcast, or hidden entirely.
The FIRST SIX pieces (the light side) are polished white marble with warm gold leaf
on the halos and feather tips.
The LAST SIX pieces (the dark side) are weathered dark bronze with verdigris in the
crevices and tarnished gold halos — fallen rather than evil, and clearly darker
overall than the first six.
PALETTE (use only these): white marble #e7d3a6 / #f0e4cb / #c4b393, gold leaf
#d8b45a / #f2d98d / #8a6a2e, dark bronze #4a3a26 / #2e2016 / #1f150d, verdigris
#5c7a63 used only in the bronze crevices, faint warm halo glow #f2d98d. Warm,
desaturated, aged. No neon, no pastel, no pure white, no blue, no pink.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
drawn grid lines or cell borders, a frame around the whole image, chess board
squares, any surface beyond each piece's own base, wings that stretch outside the
cell, or any shadow or gradient on the background.

LAYOUT: every cell exactly the same size, one figure centered per cell with at
least 14% empty padding on all four sides, figures never touching or overlapping a
neighbouring cell. Background: one perfectly uniform flat solid magenta #FF00FF
across the entire canvas and every gutter. Any halo glow stays tight inside the
figure and never bleeds into the background. Each figure must still read clearly as
a silhouette at 64 pixels tall.

HEIGHT ORDER, strictly: the king is the tallest, then queen, then bishop, then
rook, then knight, then pawn as the shortest.

THE 12 PIECES, in reading order (left to right, top to bottom):
1.  MARBLE KING — a tall crowned archangel standing straight, both hands folded on
    the pommel of a downward-pointing sword, six wings folded close, a solid ring
    halo behind the head
2.  MARBLE QUEEN — a slightly shorter veiled seraph, hands clasped at the chest,
    four wings folded close, a thin ring halo
3.  MARBLE ROOK — a squat round watchtower with a domed roof, a single ring halo
    floating above the dome, feathered buttresses down its sides
4.  MARBLE BISHOP — a tall hooded saint holding a censer, face in shadow inside the
    hood, two wings folded behind, tall mitre
5.  MARBLE KNIGHT — a winged horse head in profile facing right, small folded wing
    at the base of the neck, on a round base
6.  MARBLE PAWN — a small kneeling cherub on a round base, head bowed, two tiny
    wings folded on its back
7.  BRONZE KING — a tall crowned archangel standing straight, both hands folded on
    the pommel of a downward-pointing sword, six wings folded close, a solid ring
    halo behind the head
8.  BRONZE QUEEN — a slightly shorter veiled seraph, hands clasped at the chest,
    four wings folded close, a thin ring halo
9.  BRONZE ROOK — a squat round watchtower with a domed roof, a single ring halo
    floating above the dome, feathered buttresses down its sides
10. BRONZE BISHOP — a tall hooded saint holding a censer, face in shadow inside the
    hood, two wings folded behind, tall mitre
11. BRONZE KNIGHT — a winged horse head in profile facing right, small folded wing
    at the base of the neck, on a round base
12. BRONZE PAWN — a small kneeling cherub on a round base, head bowed, two tiny
    wings folded on its back
```

---

## 보드 테마 공통 규격

테마 시트는 **1행 × 2열**이다. 왼쪽이 밝은 칸(`light`), 오른쪽이 어두운 칸(`dark`)이다.
슬라이서는 `cut_scenes(sheet, 1, 2, ["light", "dark"], "textures/<theme>")`로 자른다.

각 칸은 **하나의 정사각형 재질 타일**이고, 렌더러가 이걸 `repeat` 패턴으로 깔기 때문에
**네 변이 서로 이어져야 한다 (seamless / tileable)**. 칸 안에 체스판 격자나 기물이 들어가면 안 된다.
두 재질은 **명도 차이가 뚜렷**해야 한다 — 기본 세트는 두 값이 너무 가까워서 코드에서
따로 밝기를 벌려주고 있다(`SQUARE_DEEPEN` / `SQUARE_LIFT`).

---

## S4 — 보드 테마 · 비전 (Arcane)

```
A sprite sheet of exactly 2 seamless square material tiles, side by side in a
perfectly even 1 row × 2 columns grid. Each tile fills its own cell completely,
edge to edge, with no padding, no border and no gutter between them.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Even, flat lighting across the
whole tile with no single light source, no vignette, no drop shadow, so the tile can
repeat without a visible seam or hot spot.

CRITICAL: each tile must be SEAMLESSLY TILEABLE — the left edge continues into the
right edge and the top edge continues into the bottom edge, so the material can be
repeated across a large surface with no visible join.

THIS THEME — ARCANE: an enchanted observatory floor. Both tiles are dark polished
stone with glowing rune lines and constellation etchings inlaid into the surface.
The glow is thin, cool and contained inside the etched channels — the stone itself
stays dark.
LEFT TILE (light square): pale slate blue-grey stone, fine grain, with thin
luminous arcane blue rune tracery.
RIGHT TILE (dark square): near-black basalt, same rune tracery but dimmer and
sparser, so the two tiles are clearly different in brightness.
PALETTE (use only these): arcane blue #5a83c4 / #7fa3d8, slate #4a5568 / #2e3440,
near-black #150e0a / #14161d, faint violet #6b5a9e used only in the deepest rune
glow, gold leaf #8a6a2e used only as tiny inlay studs. No neon, no pastel, no pure
white, no warm orange.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
chess pieces, a checkerboard pattern, drawn grid lines or cell borders, a frame
around the whole image, or any object sitting on the surface.

The two tiles must differ in overall brightness by a clear, obvious margin so a
checkerboard built from them reads at a glance.
```

---

## S5 — 보드 테마 · 대리석 (Marble & Onyx)

```
A sprite sheet of exactly 2 seamless square material tiles, side by side in a
perfectly even 1 row × 2 columns grid. Each tile fills its own cell completely,
edge to edge, with no padding, no border and no gutter between them.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Even, flat lighting across the
whole tile with no single light source, no vignette, no drop shadow, so the tile can
repeat without a visible seam or hot spot.

CRITICAL: each tile must be SEAMLESSLY TILEABLE — the left edge continues into the
right edge and the top edge continues into the bottom edge, so the material can be
repeated across a large surface with no visible join.

THIS THEME — MARBLE AND ONYX: a cathedral floor cut from two stones. Polished but
worn, with hairline cracks and a faint patina in the low spots. Veining is
painterly and organic, never symmetrical or repeating.
LEFT TILE (light square): warm cream marble with soft grey-gold veining and a
barely-there pink undertone.
RIGHT TILE (dark square): black onyx with bold white-gold veining, high contrast
against the stone.
PALETTE (use only these): cream marble #e7d3a6 / #d2b985 / #c4b393, grey-gold vein
#8a6a2e / #a89070, onyx #150e0a / #1f150d / #2b2521, pale vein #e7d3a6. Warm,
desaturated, aged. No neon, no pastel, no pure white, no cool blue.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
chess pieces, a checkerboard pattern, drawn grid lines or cell borders, a frame
around the whole image, or any object sitting on the surface.

The two tiles must differ in overall brightness by a clear, obvious margin so a
checkerboard built from them reads at a glance.
```

---

## S6 — 보드 테마 · 사암 (Sandstone & Basalt)

```
A sprite sheet of exactly 2 seamless square material tiles, side by side in a
perfectly even 1 row × 2 columns grid. Each tile fills its own cell completely,
edge to edge, with no padding, no border and no gutter between them.

STYLE: Dark-fantasy tabletop game art in the style of Slay the Spire and Darkest
Dungeon. Hand-painted digital illustration with visible painterly brush texture —
NOT flat vector, NOT 3D render, NOT photorealistic. Even, flat lighting across the
whole tile with no single light source, no vignette, no drop shadow, so the tile can
repeat without a visible seam or hot spot.

CRITICAL: each tile must be SEAMLESSLY TILEABLE — the left edge continues into the
right edge and the top edge continues into the bottom edge, so the material can be
repeated across a large surface with no visible join.

THIS THEME — SANDSTONE AND BASALT: a sun-bleached desert temple floor. Dry, dusty,
slightly pitted, with fine wind-scoured striation and a scatter of sand caught in
the pores. Carved hieroglyph-like grooves appear faintly, worn almost smooth.
LEFT TILE (light square): pale bleached sandstone, warm and chalky, fine horizontal
striation.
RIGHT TILE (dark square): dark volcanic basalt, coarse and porous, with a dull
matte surface.
PALETTE (use only these): bleached sand #e7d3a6 / #d9c49a / #bfa679, ochre #a8763a,
basalt #2e2b28 / #1f1d1b / #45403a, dried clay #8a5a3a. Warm, desaturated, sun
faded. No neon, no pastel, no pure white, no green, no blue.
NEVER include: text, letters, numbers, labels, captions, watermarks, signatures,
chess pieces, a checkerboard pattern, drawn grid lines or cell borders, a frame
around the whole image, or any object sitting on the surface.

The two tiles must differ in overall brightness by a clear, obvious margin so a
checkerboard built from them reads at a glance.
```

---

## 상점 아이콘

상점 타일에 쓸 작은 오브젝트 아이콘 6개가 더 필요하다. 기물 스킨은 그 스킨의 **퀸 하나만**,
테마는 **2×2로 자른 체스판 조각**을 쓰면 제일 잘 읽힌다.

이건 위 시트가 통과한 다음에, 통과한 이미지에서 잘라내 쓰면 새로 뽑을 필요가 없다:

- 기물 스킨 아이콘 → 그 시트의 백 퀸 셀을 그대로 `assets/objects/skin-<id>.png`로 저장
- 테마 아이콘 → 두 타일을 2×2 체커로 조합해 `assets/objects/theme-<id>.png`로 저장

`tools/` 에 스크립트를 하나 더 넣어야 하면 시트 받은 뒤에 알려줘. 지금은
아이콘이 없으면 상점 타일이 기존 `queen-gold` / `theme-board` 아트로 대체된다.
