// Generates PWA PNG icons from public/favicon.svg by rendering it in headless Chromium (Playwright).
//   node scripts/gen-icons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = readFileSync('public/favicon.svg', 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<rect width="512" height="512" rx="112"[^>]*\/>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2453ff"/><g transform="translate(64 64) scale(0.75)">${inner}</g></svg>`;
const appleTouch = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2453ff"/>${inner}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M60 380 L190 220 L270 310 L330 250 L452 380 Z" fill="#fff"/><circle cx="380" cy="140" r="52" fill="#fff"/></svg>`;

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, size, file, transparent = true) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: transparent });
}
await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(maskable, 512, 'icon-maskable-512.png', false);
await render(appleTouch, 180, 'apple-touch-icon.png', false);
await render(badge, 72, 'badge-72.png');
await browser.close();
console.log('icons generated');
