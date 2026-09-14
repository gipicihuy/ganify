// Ekstrak warna dominan/vibrant dari cover album, dipakai buat dynamic
// theming ala Rythim Music (background berubah ngikutin warna cover lagu
// yang lagi diputar).
//
// Gambar diambil lewat _fetchCoverBytes (proxy /api/cover di server kita)
// supaya jadi same-origin blob, biar canvas nggak "tainted" oleh CORS
// (thumbnail YouTube/googleusercontent nggak selalu kirim header
// Access-Control-Allow-Origin, jadi getImageData bakal dilempar error
// kalau gambar dimuat langsung dari domain luar).

import { _fetchCoverBytes } from './api.js';

const cache = new Map();
const MAX_CACHE = 40;

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslCss(h, s, l) {
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function rememberInCache(key, value) {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

/**
 * Balikin { top, bottom, bar } berupa warna CSS (hsl string) buat dipakai
 * sebagai tint tema dinamis, atau null kalau gagal diekstrak (pemanggil
 * tinggal fallback ke warna default/statis).
 */
export async function extractThemeTint(thumbnailUrl, cacheKey) {
  if (!thumbnailUrl) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
  if (typeof document === 'undefined') return null;

  try {
    const cover = await _fetchCoverBytes(thumbnailUrl);
    if (!cover) return null;

    const blob = new Blob([cover.buffer], { type: cover.type || 'image/jpeg' });
    const objUrl = URL.createObjectURL(blob);
    let img;
    try {
      img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objUrl;
      });
    } finally {
      URL.revokeObjectURL(objUrl);
    }

    const SIZE = 48;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    // Bucket per rentang hue (18 bucket @ 20 derajat). Pixel yang lebih
    // jenuh warnanya (saturation tinggi) dikasih bobot lebih besar, biar
    // hasilnya condong ke warna yang "menonjol" di cover, bukan cuma
    // rata-rata mentah yang sering jadi abu-abu kusam.
    const buckets = Array.from({ length: 18 }, () => ({ r: 0, g: 0, b: 0, weight: 0 }));
    let fallbackR = 0, fallbackG = 0, fallbackB = 0, fallbackN = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 125) continue;
      fallbackR += r; fallbackG += g; fallbackB += b; fallbackN++;

      const [h, s, l] = rgbToHsl(r, g, b);
      if (l < 0.08 || l > 0.92 || s < 0.15) continue; // buang nyaris hitam/putih/abu-abu

      const idx = Math.floor(h / 20) % 18;
      const bucket = buckets[idx];
      bucket.r += r * s;
      bucket.g += g * s;
      bucket.b += b * s;
      bucket.weight += s;
    }

    let best = null;
    for (const bucket of buckets) {
      if (bucket.weight > 0 && (!best || bucket.weight > best.weight)) best = bucket;
    }

    let r, g, b;
    if (best) {
      r = best.r / best.weight;
      g = best.g / best.weight;
      b = best.b / best.weight;
    } else if (fallbackN > 0) {
      r = fallbackR / fallbackN;
      g = fallbackG / fallbackN;
      b = fallbackB / fallbackN;
    } else {
      return null;
    }

    const [h, s] = rgbToHsl(r, g, b);
    const result = {
      top: hslCss(h, Math.min(s, 0.5), 0.16),
      bottom: hslCss(h, Math.min(s, 0.3), 0.09),
      bar: hslCss(h, Math.min(s, 0.35), 0.12)
    };

    if (cacheKey) rememberInCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
