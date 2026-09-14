import { getClientIp, isBlocked, notifyEvent, runBackground } from '$lib/server/activityMonitor.js';

// Fitur ini pakai pola BYOK (Bring Your Own Key): API key AI disimpan &
// dikirim dari browser user sendiri (localStorage), TIDAK pernah kita
// simpan di server. Server cuma jadi proxy biar nggak kena CORS dan biar
// format request tiap provider bisa diseragamkan di satu tempat.
// Daftar endpoint diambil dari referensi provider yang sama dipakai
// RythimMusic (app/.../AiRecommendationSheet.kt).

const PROVIDERS = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', auth: 'bearer' },
  claude: { url: 'https://api.anthropic.com/v1/messages', auth: 'anthropic' },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', auth: 'bearer' },
  mistral: { url: 'https://api.mistral.ai/v1/chat/completions', auth: 'bearer' },
  perplexity: { url: 'https://api.perplexity.ai/chat/completions', auth: 'bearer' },
  xai: { url: 'https://api.x.ai/v1/chat/completions', auth: 'bearer' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', auth: 'bearer' }
};

const MAX_TOKENS = 220;

function buildPrompt(title, artist) {
  return `Kasih ringkasan/insight singkat (maks 3 kalimat, bahasa Indonesia santai) tentang lagu "${title}"${artist ? ` oleh ${artist}` : ''}. Fokus ke vibe, makna, atau fakta menarik di baliknya. Jangan mengarang fakta kalau nggak yakin, cukup deskripsikan suasana/genre lagunya secara umum.`;
}

async function callOpenAiCompatible(baseUrl, model, apiKey, prompt) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Provider merespons ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content?.trim() || null;
}

async function callAnthropic(apiKey, model, prompt) {
  const res = await fetch(PROVIDERS.claude.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Provider merespons ${res.status}`);
  const json = await res.json();
  const textBlock = (json?.content || []).find((c) => c.type === 'text');
  return textBlock?.text?.trim() || null;
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-small-latest',
  perplexity: 'sonar',
  xai: 'grok-2-latest',
  openrouter: 'openai/gpt-4o-mini'
};

export async function POST({ request, platform }) {
  const ip = getClientIp(request);
  if (await isBlocked(platform, ip)) {
    return new Response(JSON.stringify({ status: false, message: 'Blocked' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ status: false, message: 'Body tidak valid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { title, artist, provider, apiKey, model, baseUrl } = body || {};

  if (!title) return new Response(JSON.stringify({ status: false, message: 'title wajib diisi' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!provider || !PROVIDERS[provider]) return new Response(JSON.stringify({ status: false, message: 'provider tidak dikenal' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!apiKey) return new Response(JSON.stringify({ status: false, message: 'API key belum diisi. Isi dulu di Pengaturan > Fitur AI.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const prompt = buildPrompt(title, artist);
  const usedModel = model || DEFAULT_MODELS[provider];

  try {
    let summary;
    if (provider === 'claude') {
      summary = await callAnthropic(apiKey, usedModel, prompt);
    } else {
      const url = provider === 'openrouter' && baseUrl ? baseUrl : PROVIDERS[provider].url;
      summary = await callOpenAiCompatible(url, usedModel, apiKey, prompt);
    }

    if (!summary) {
      return new Response(JSON.stringify({ status: false, message: 'Provider tidak mengembalikan hasil' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    runBackground(platform, notifyEvent(platform, 'ai_summary', {
      ip,
      endpoint: 'POST /api/song/summary',
      detail: { title, artist: artist || '-', provider }
    }));

    return new Response(JSON.stringify({ status: true, result: { summary, provider, model: usedModel } }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ status: false, message: 'Gagal memanggil provider AI: ' + e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
