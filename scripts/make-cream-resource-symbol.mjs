#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outWebp = path.join(root, "public/assets/ui/field-symbol-resource-cream.webp");

// Match treasure-chest yellow (#e8c547 family) + dark outline like printed icons.
const gold = "#e8c547";
const ink = "#2a1a08";

const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <filter id="s" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.65"/>
    </filter>
  </defs>
  <g filter="url(#s)">
    <!-- solid campfire -->
    <path d="M128 78 C108 54 114 32 128 18 C142 32 148 54 128 78 Z"
      fill="${gold}" stroke="${ink}" stroke-width="5"/>
    <path d="M104 86 L128 68 L152 86 L140 90 L128 78 L116 90 Z"
      fill="${gold}" stroke="${ink}" stroke-width="4"/>
    <!-- crossed shovel + pick — solid gold fills like treasure chest -->
    <g transform="translate(128 170) rotate(-40)">
      <rect x="-8" y="-70" width="16" height="120" rx="4" fill="${gold}" stroke="${ink}" stroke-width="4"/>
      <path d="M-30 50 Q0 88 30 50 L18 28 L-18 28 Z" fill="${gold}" stroke="${ink}" stroke-width="4"/>
    </g>
    <g transform="translate(128 170) rotate(40)">
      <rect x="-8" y="-62" width="16" height="112" rx="4" fill="${gold}" stroke="${ink}" stroke-width="4"/>
      <path d="M-50 -58 Q0 -92 50 -58 Q22 -40 0 -46 Q-22 -40 -50 -58 Z"
        fill="${gold}" stroke="${ink}" stroke-width="4"/>
    </g>
  </g>
</svg>`);

await sharp(svg).webp({ quality: 95, alphaQuality: 100 }).toFile(outWebp);
console.log("wrote", path.relative(root, outWebp), fs.statSync(outWebp).size);
