const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getRunsText(runs) {
  return Array.isArray(runs) ? runs.map(r => r.text || '').join('') : '';
}

async function fetchSuggestions(input) {
  const payload = {
    context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
    input
  };
  const r = await fetch('https://music.youtube.com/youtubei/v1/music/get_search_suggestions?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Origin': 'https://music.youtube.com' },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

export async function GET({ url }) {
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  try {
    const data = await fetchSuggestions(q);
    const section = data?.contents?.[0]?.searchSuggestionsSectionRenderer?.contents || [];
    const suggestions = section
      .map(c => getRunsText(c?.searchSuggestionRenderer?.suggestion?.runs))
      .filter(Boolean)
      .slice(0, 8);
    return new Response(JSON.stringify(suggestions), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
}
