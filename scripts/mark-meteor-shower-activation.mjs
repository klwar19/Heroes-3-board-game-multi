// Apply the established activation arrow to the user-supplied Meteor Shower
// card face. The symbol is code-native so its position and shape are repeatable.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const cardPath = "public/assets/spells-meteor_shower.webp";
const glyphPath = "scripts/card-glyphs/activation.svg";
const glyph = await sharp(readFileSync(glyphPath)).resize(51, 45).png().toBuffer();
const card = await sharp(readFileSync(cardPath))
  .composite([{ input: glyph, left: 83, top: 810 }])
  .webp({ quality: 95, effort: 6 })
  .toBuffer();
writeFileSync(cardPath, card);
