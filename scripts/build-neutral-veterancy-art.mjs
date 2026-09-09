import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Production asset preparation only: no gameplay or test runners.
const sourceRoot = path.join(process.env.USERPROFILE, '.codex/generated_images/01a081c4-3b17-7b43-883e-8e1c17f802b1');
const icons = {
  'crystal-burst': 'exec-8cedb024-9b3e-4f34-9dc3-a8c26424c4f6.png',
  'blind-dust': 'exec-881b451a-08bf-4c8e-ad11-39aef67a388e.png',
  'sandstorm': 'exec-094ff22f-9419-4054-9196-81862cca8d33.png',
  'thunder-retaliation': 'exec-a1f06081-598e-4e51-9e88-35850a8dbe25.png',
  'troll-resilience': 'exec-8d82e3be-64a8-4e8e-9d2e-d5b705a6a321.png',
  'troll-snare': 'exec-f085b9a9-de06-45c8-ad35-72c9c910bc64.png',
  'flying-guard': 'exec-b8e75fc7-b0ba-47f4-b0ba-430d5df3bf3c.png',
  'pain-resistance': 'exec-fd1202e9-7f1f-41d9-984c-d078e99aedc6.png',
  'peasant-bounty': 'exec-daf7af6c-91de-4d52-9492-28602ccc132e.png',
};
const destination = 'public/game-tokens/rank-ability/neutral';
await fs.mkdir(destination, { recursive: true });
for (const [name, filename] of Object.entries(icons)) {
  await sharp(path.join(sourceRoot, filename)).resize(256, 256).webp({ quality: 88 }).toFile(path.join(destination, `${name}.webp`));
}
console.log(`Prepared ${Object.keys(icons).length} neutral ability icons.`);
const dustPath = path.join(sourceRoot, 'exec-c2f27d71-035f-4027-9065-c577a03595dd.png');
const dustStats = await sharp(dustPath).stats();
if (dustStats.channels.length !== 4 || dustStats.channels[3].min !== 0) throw new Error('The generated dust texture needs transparent alpha.');
await fs.mkdir('public/fx', { recursive: true });
const frames = [];
const frameSize = 256;
const frameCount = 24;
for (let frame = 0; frame < frameCount; frame++) {
  const progress = frame / (frameCount - 1);
  const size = Math.round(148 + 54 * Math.sin(progress * Math.PI));
  const { data, info } = await sharp(dustPath)
    .rotate(-12 + progress * 34, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(size, size, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const opacity = Math.min(1, progress * 5, (1 - progress) * 5) * 0.85;
  for (let at = 3; at < data.length; at += 4) data[at] = Math.round(data[at] * opacity);
  const tile = await sharp(data, { raw: info }).png().toBuffer();
  frames.push({ input: tile,
    left: (frame % 6) * frameSize + Math.round((frameSize - info.width) / 2 + (progress - 0.5) * 36),
    top: Math.floor(frame / 6) * frameSize + Math.round((frameSize - info.height) / 2 - Math.sin(progress * Math.PI) * 9),
  });
}
await sharp({ create: { width: frameSize * 6, height: frameSize * 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames).webp({ quality: 88, alphaQuality: 100 }).toFile('public/fx/neutral-sandstorm.webp');
await sharp(dustPath).resize(768).webp({ quality: 90 }).toFile('public/fx/neutral-sandstorm-source.webp');
console.log('Prepared 24 drifting and swirling dust animation frames.');
