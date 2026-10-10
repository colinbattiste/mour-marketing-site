// Cloudflare Pages Function helper: renders the public MOUR share viewer for /s/<token> and /p/<id>.
// Public repo: no secrets here. It only calls the public MOUR API (GET /api/v1/share/:token, GET /api/v1/posts/:id).
const API = 'https://mour-backend.onrender.com';
const APP_STORE = 'https://apps.apple.com/app/id6812510969';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

export async function fetchShared(kind, id, env) {
  const base = (env && env.MOUR_API_BASE) || API;
  const path = kind === 's' ? `/api/v1/share/${encodeURIComponent(id)}` : `/api/v1/posts/${encodeURIComponent(id)}`;
  try {
    const r = await fetch(base + path, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 60 } });
    if (!r.ok) return { status: r.status };
    const d = await r.json();
    const p = d.post || d.data || d;
    return { status: 200, post: {
      title: p.title || p.caption || p.body || 'A capture on MOUR',
      author: (p.author && (p.author.username || p.author.handle)) || p.author_handle || '',
      poster: safeUrl(p.poster_url || p.thumbnail_url || p.media_url),
      video: /video/i.test(p.media_type || '') ? safeUrl(p.media_url) : '',
      glb: safeUrl(p.glb_url || p.model_url),
      place: p.location_name || '',
    } };
  } catch (_) { return { status: 502 }; }
}

export function page(url, res) {
  const p = res.post;
  const ok = res.status === 200 && p;
  const title = ok ? `${p.title}${p.author ? ` · @${String(p.author).replace(/^@/, '')}` : ''}` : 'MOUR';
  const desc = ok ? (p.glb ? 'Tap to view in 3D on MOUR.' : (p.place ? `Captured near ${p.place} on MOUR.` : 'See it on MOUR.')) : (res.status === 404 || res.status === 410 ? 'This post is no longer available.' : 'See it on MOUR.');
  const img = ok && p.poster ? p.poster : 'https://mourapp.com/assets/og-default.png';
  const body = ok ? `
    <div class="stage" id="stage">
      ${p.video ? `<video src="${esc(p.video)}" poster="${esc(p.poster)}" playsinline controls controlslist="nodownload noremoteplayback" disablepictureinpicture></video>` : `<img src="${esc(p.poster)}" alt="" draggable="false">`}
      ${p.glb ? `<div class="m3d" id="m3d" hidden><model-viewer id="mv" camera-controls auto-rotate touch-action="none" interaction-prompt="none" shadow-intensity="1" exposure="1.1" alt="3D model"></model-viewer><div class="spin" id="spin"></div></div><div class="hint" id="hint">Tap to view in 3D</div>` : ''}
    </div>
    <div class="meta"><b>${esc(p.title)}</b>${p.author ? `<span>@${esc(String(p.author).replace(/^@/, ''))}</span>` : ''}</div>`
    : `<div class="gone">${esc(desc)}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="MOUR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${esc(img)}">
<meta name="apple-itunes-app" content="app-id=6812510969, app-argument=${esc(url)}">
<meta name="robots" content="noindex">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#05080c;color:#fff;font:600 15px -apple-system,system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
header{display:flex;align-items:center;justify-content:space-between;padding:calc(env(safe-area-inset-top) + 12px) 16px 10px}
header .logo{font:900 22px -apple-system,system-ui;letter-spacing:1px;color:#2ee6ff}
main{max-width:640px;margin:0 auto;padding:0 12px calc(env(safe-area-inset-bottom) + 110px)}
.stage{position:relative;border-radius:20px;overflow:hidden;background:#0b1118;aspect-ratio:3/4}
.stage img,.stage video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:auto}
.m3d{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,#0f2433 0%,#05080c 75%)}.m3d model-viewer{width:100%;height:100%;--poster-color:transparent}
.spin{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px;border-radius:50%;border:3px solid rgba(255,255,255,.18);border-top-color:#2ee6ff;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
.hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(9,14,20,.72);color:rgba(255,255,255,.8);font:700 12px -apple-system;pointer-events:none}
.meta{padding:12px 4px;display:flex;flex-direction:column;gap:3px}.meta span{color:#94a3b8;font-size:13px}
.gone{padding:80px 20px;text-align:center;color:#94a3b8}
.cta{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 14px);display:flex;gap:10px;max-width:616px;margin:0 auto}
.cta a{flex:1;display:flex;align-items:center;justify-content:center;height:54px;border-radius:16px;text-decoration:none;font:800 16px -apple-system,system-ui}
.cta .open{color:#04121c;background:linear-gradient(90deg,#16e0ff,#2b8cff)}.cta .get{color:#fff;border:1px solid rgba(255,255,255,.18)}
</style></head><body>
<header><span class="logo">MOUR</span></header>
<main>${body}</main>
<div class="cta"><a class="open" href="mour://link?u=${encodeURIComponent(url)}" id="open">Open in MOUR</a><a class="get" href="${APP_STORE}">Get the app</a></div>
${ok && p.glb ? `<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
<script>
(function(){var GLB=${JSON.stringify(p.glb)};var st=document.getElementById('stage'),m=document.getElementById('m3d'),mv=document.getElementById('mv'),h=document.getElementById('hint'),sp=document.getElementById('spin'),on=false,loaded=false,d=null;
function toggle(){on=!on;m.hidden=!on;h.textContent=on?'Drag to rotate · tap for photo':'Tap to view in 3D';if(on&&!loaded){loaded=true;mv.addEventListener('load',function(){sp.remove()},{once:true});mv.addEventListener('error',function(){sp.remove();h.textContent='Couldn’t load the 3D model right now.'},{once:true});mv.src=GLB;}}
st.addEventListener('pointerdown',function(e){d={x:e.clientX,y:e.clientY,t:Date.now()}});
st.addEventListener('pointerup',function(e){if(!d)return;var ok=Math.hypot(e.clientX-d.x,e.clientY-d.y)<10&&Date.now()-d.t<450;d=null;if(ok)toggle();});
document.addEventListener('contextmenu',function(e){e.preventDefault()});})();
</script>` : '<script>document.addEventListener("contextmenu",function(e){e.preventDefault()});</script>'}
<script>document.getElementById('open').addEventListener('click',function(){var t=setTimeout(function(){location.href='${APP_STORE}'},1600);document.addEventListener('visibilitychange',function(){if(document.hidden)clearTimeout(t)},{once:true});});</script>
</body></html>`;
}

export async function handle(kind, context) {
  const id = String(context.params.token || context.params.id || '');
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) return new Response('Not found', { status: 404 });
  const res = await fetchShared(kind, id, context.env);
  const status = res.status === 200 ? 200 : (res.status === 404 || res.status === 410 ? 404 : 200);
  return new Response(page(new URL(context.request.url).origin + `/${kind}/${id}`, res), {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Robots-Tag': 'noindex' } });
}
