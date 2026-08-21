export async function GET({ url }) {
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=youtube&q=${encodeURIComponent(q)}&ds=yt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36' }
    });
    const text = await res.text();
    const match = text.match(/window\.google\.ac\.h\((.*)\)$/s);
    if (!match) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    const parsed = JSON.parse(match[1]);
    const arr = parsed[1];
    if (!Array.isArray(arr)) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    const suggestions = arr.map(item => item[0]).filter(Boolean).slice(0, 8);
    return new Response(JSON.stringify(suggestions), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
  }
}
