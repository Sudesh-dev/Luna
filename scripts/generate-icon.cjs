// Rasterize the simple geometric brand mark without an image service or new dependency.
const path = require('node:path');
const fs = require('node:fs');
const Jimp = require(require.resolve('jimp-compact', { paths: [path.dirname(require.resolve('@expo/image-utils'))] }));
const root = path.resolve(__dirname, '..');
const size = 2048;
const icon = new Jimp(size, size, 0);
const foreground = new Jimp(size, size, 0);
const stars = [[688, 343, 24], [350, 294, 12], [736, 583, 10]];
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const px = x / 2, py = y / 2;
  const moon = Math.hypot(px - 475, py - 518) <= 210 && Math.hypot(px - 565, py - 452) >= 190;
  const star = stars.some(([sx, sy, r]) => Math.abs(px - sx) + Math.abs(py - sy) < r);
  const offset = (y * size + x) * 4;
  const aura = Math.exp(-((px - 512) ** 2 + (py - 512) ** 2) / 190000);
  const mix = Math.min(Math.max((px + py - 500) / 700, 0), 1);
  const mark = star ? [243, 190, 223] : [201 + 42 * mix, 167 + 23 * mix, 255 - 32 * mix];
  const background = [9 + 17 * aura, 7 + 8 * aura, 13 + 25 * aura];
  for (let channel = 0; channel < 3; channel++) {
    icon.bitmap.data[offset + channel] = Math.round(moon || star ? mark[channel] : background[channel]);
    foreground.bitmap.data[offset + channel] = Math.round(mark[channel]);
  }
  icon.bitmap.data[offset + 3] = 255;
  foreground.bitmap.data[offset + 3] = moon || star ? 255 : 0;
}
(async () => {
  fs.mkdirSync(path.join(root, 'assets/branding'), { recursive: true });
  await icon.resize(1024, 1024).writeAsync(path.join(root, 'assets/branding/luna-icon.png'));
  await foreground.resize(1024, 1024).writeAsync(path.join(root, 'assets/branding/luna-foreground.png'));
  console.log('Generated LUNA icon and transparent adaptive foreground.');
})();
