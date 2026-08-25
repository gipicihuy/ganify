export async function GET({ url }) {
  const src = url.searchParams.get('url');
  if (!src) {
    return new Response(JSON.stringify({ error: 'no url' }), { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(src);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid url' }), { status: 400 });
  }

  const allowedHosts = ['lh3.googleusercontent.com', 'i.ytimg.com', 'yt3.ggpht.com'];
  if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    return new Response(JSON.stringify({ error: 'host not allowed' }), { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString());
    if (!res.ok || !res.body) {
      return new Response(JSON.stringify({ error: 'fetch failed' }), { status: 502 });
    }
    return new Response(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
