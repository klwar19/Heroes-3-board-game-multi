# Conflux Drive → English card translation

Source Drive: https://drive.google.com/drive/folders/1kfu_Gs81GrFbGl2F9xBCpnN23RoQjJ2V  
Wiki (assign later): https://en.homm3bg.wiki/  
Glyphs: https://github.com/Heegu-sama/Homm3BG/tree/main/assets/glyphs  
(also `glyphs/` + `scripts/card-glyphs/`)

## Method

1. Download Polish scans module-by-module into `*/` folders.
2. **Real image_edit** of text only (no white boxes). Keep art + legend icons.
3. Verify against wiki wording; re-edit if icons/text wrong.
4. Approved shots land in `english/<module>/final/`.
5. **Assign to `public/assets/` only after review** (not done yet).

## Drive inventory

| Folder (VI) | Contents | Status |
|-------------|----------|--------|
| ciele | Magic Arrow I/IV/VI + hero board + portrait | **English finals ready** |
| Luna | Fire Wall I/IV/VI + board + portrait | **English finals ready** |
| eramon | Magma Elementals I/IV/VI + board + portrait | **English finals ready** |
| monere | Magic Elementals I/IV/VI + board | **English finals ready** |
| pasis | Elementals I/IV/VI + board | **English finals ready** |
| tarnum | specialties + board | not started |
| spell protect | protection spells (folder also had Magic Mirror) | sources only |
| spell triệu hồi | summon elementals | sources only |
| antifact nguyên tố | elemental artifacts | sources only |
| unit - ảnh đẹp | unit cards (sharp) | not downloaded fully |
| unit - ảnh mờ | unit cards (blurry) | skip unless needed |
| Thành | town board pieces | not started |
| Map 1 / map nguyên tố | map tiles | not started |
| sách nguyên tố | elemental books? | not started |

## English finals (edit-first, assign later)

### Ciele — `english/ciele/final/`
| File | Wiki text |
|------|-----------|
| `hero_specialties-ciele-1.jpg` | Instant: take Magic Arrow from discard → hand · OR · Instant +1 Power |
| `hero_specialties-ciele-4.jpg` | Instant: cast Magic Arrow from discard (over spell limit) · OR · +1 Power |
| `hero_specialties-ciele-6.jpg` | Instant: selected unit suffers 2 damage · OR · +2 Power |
| `hero_boardart-ciele.jpg` | Elementalist · Water Magic · Specialty Magic Arrow |

### Luna — `english/luna/final/`
| File | Notes |
|------|-------|
| `hero_specialties-luna-1.jpg` | Fire Wall I, 1 damage, Combat wording, ground/ranged icons |
| `hero_specialties-luna-4.jpg` | Take 1 card from discard · OR · +2 Power |
| `hero_specialties-luna-6.jpg` | Same as I but Deal **3** + coin **VI** (from clean I edit) |
| `hero_boardart-luna.jpg` | Basic Fire Magic · Fire Wall |

Known minor: Luna titles sometimes render `FIRE WALL` all-caps; Luna VI footer still `010/080` (should be `012/080`).

### Erdamon — `english/erdamon/final/`
| File | Wiki text |
|------|-----------|
| `hero_specialties-erdamon-1.jpg` | +1 Attack OR +1 Defense; doubles for Magma Elementals |
| `hero_specialties-erdamon-4.jpg` | Ongoing: selected unit initiative +1; doubles for Magma |
| `hero_specialties-erdamon-6.jpg` | +2 Attack OR Ongoing initiative +3 |
| `hero_boardart-erdamon.jpg` | Planeswalker · Estates · Magma Elementals |

### Monere — `english/monere/final/`
| File | Wiki text |
|------|-----------|
| `hero_specialties-monere-1.jpg` | +1 Attack OR +1 Defense; doubles for Magic Elementals |
| `hero_specialties-monere-4.jpg` | Ongoing initiative +1; doubles for Magic Elementals |
| `hero_specialties-monere-6.jpg` | +2 Attack OR Instant +2 Power |
| `hero_boardart-monere.jpg` | Planeswalker · Logistics · Magic Elementals |

### Pasis — `english/pasis/final/`
| File | Wiki text |
|------|-----------|
| `hero_specialties-pasis-1.jpg` | Ongoing initiative +1; doubles for Elementals |
| `hero_specialties-pasis-4.jpg` | +1 Attack OR +1 Defense; doubles for Elementals |
| `hero_specialties-pasis-6.jpg` | Ongoing health +1; doubles for Elementals |
| `hero_boardart-pasis.jpg` | Planeswalker · Artillery · Elementals |

## Next modules (same careful flow)

1. tarnum (heroes)
2. spell protect + summon (verify folder contents vs wiki)
3. unit cards (sharp set)
4. artifacts
5. town (Thành) + maps
6. only then copy approved webps into `public/assets/`

## Do not

- Multi-reference with a different hero card (bleeds art — learned on Ciele v1).
- Put bracket-meta like `[damage-icon]` in prompts (model paints it as text).
- Assign to engine paths until visual QA pass.
