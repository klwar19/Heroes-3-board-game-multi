#!/usr/bin/env node
// Edit a card image with Gemini 2.5 Flash Image ("Nano Banana").
//
// I (the AI) write the prompt; Gemini only renders. The returned image is
// saved so it can be viewed and judged, then re-prompted until it's good.
//
// Setup (one time):
//   1. Get a free API key at https://aistudio.google.com  ("Get API key")
//   2. Set it:  PowerShell ->  setx GEMINI_API_KEY "your-key"   (reopen terminal)
//               bash       ->  export GEMINI_API_KEY="your-key"
//
// Usage:
//   node scripts/edit-card-image.mjs <input-image> "<edit prompt>" [output-path]
//
// Examples:
//   node scripts/edit-card-image.mjs public/assets/units-blank-golden.webp \
//        "Repaint the border in ornate gold filigree, keep the layout" \
//        out/units-blank-golden.v1.png
//
// Notes:
//   - Input may be .webp/.png/.jpg (all accepted by the API).
//   - Output is whatever Gemini returns (usually PNG); extension is set to match.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, basename, join } from "node:path";

const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function die(msg) {
  console.error("error: " + msg);
  process.exit(1);
}

const [, , inputPath, prompt, outArg] = process.argv;

if (!inputPath || !prompt) {
  die(
    'usage: node scripts/edit-card-image.mjs <input-image> "<edit prompt>" [output-path]',
  );
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) die("GEMINI_API_KEY is not set (get one at aistudio.google.com).");

const ext = extname(inputPath).toLowerCase();
const inMime = MIME[ext];
if (!inMime) die(`unsupported input type "${ext}" (use webp/png/jpg).`);

const bytes = await readFile(inputPath).catch(() =>
  die(`cannot read input: ${inputPath}`),
);

const body = {
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        { inline_data: { mime_type: inMime, data: bytes.toString("base64") } },
      ],
    },
  ],
};

const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  die(`API ${res.status}: ${text.slice(0, 800)}`);
}

const json = await res.json();
const parts = json?.candidates?.[0]?.content?.parts ?? [];
const imgPart = parts.find((p) => p.inline_data || p.inlineData);
const textPart = parts.find((p) => p.text);

if (!imgPart) {
  const reason = json?.candidates?.[0]?.finishReason || "no image returned";
  die(`no image in response (${reason}). text: ${textPart?.text ?? "(none)"}`);
}

const data = imgPart.inline_data?.data ?? imgPart.inlineData?.data;
const outMime =
  imgPart.inline_data?.mime_type ?? imgPart.inlineData?.mimeType ?? "image/png";
const outExt = outMime.includes("jpeg")
  ? ".jpg"
  : outMime.includes("webp")
    ? ".webp"
    : ".png";

const outPath =
  outArg ||
  join("out", basename(inputPath, ext) + ".edited" + outExt);

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, Buffer.from(data, "base64"));

if (textPart?.text) console.log("model note:", textPart.text.trim());
console.log("saved:", outPath);
