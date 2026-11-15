// TikTok : connexion TikTok et publication directe (Content Posting API).
// Tant que TikTok n'a pas valide l'appli, il impose la visibilite "moi seul" :
// mettre TIKTOK_PUBLIC=1 apres validation pour publier en public.
import { json } from "./_gh.mjs";
import { SITE, ready, accounts, saveAccounts, sameOrigin, startAuth, checkState, goBack,
  form, getJson, shortAsset, download, cleanPost } from "./_auth.mjs";

export const maxDuration = 60;
const KEY = process.env.TIKTOK_CLIENT_KEY, SEC = process.env.TIKTOK_CLIENT_SECRET;
const REDIR = SITE + "/api/tiktok", T = "https://open.tiktokapis.com/v2";
const MAX_ONE_CHUNK = 64 * 1024 * 1024;

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.has("connect")) {
    if (!ready("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")) return json({ error: "TikTok n'est pas encore branché." }, 503);
    return startAuth("tt", (s) => "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
      client_key: KEY, scope: "user.info.basic,video.publish", response_type: "code",
      redirect_uri: REDIR, state: s, disable_auto_auth: "1",
    }), q.get("job"));
  }
  const st = checkState(req, "tt", q.get("state"));
  if (!st) return goBack(null, "tt", "erreur");
  if (!q.get("code")) return goBack(st, "tt", "annule");
  try {
    const tok = await form(T + "/oauth/token/", {
      client_key: KEY, client_secret: SEC, code: q.get("code"), grant_type: "authorization_code", redirect_uri: REDIR,
    });
    if (!tok.access_token) throw new Error("pas de jeton");
    const u = (await getJson(T + "/user/info/?fields=open_id,display_name,avatar_url",
      { authorization: "Bearer " + tok.access_token })).data?.user || {};
    const list = accounts(req, "tt").filter((a) => a.id !== tok.open_id);
    list.push({ id: tok.open_id, name: u.display_name || "Compte TikTok", pic: u.avatar_url || "", r: tok.refresh_token });
    return goBack(st, "tt", "ok", [saveAccounts("tt", list)]);
  } catch {
    return goBack(st, "tt", "erreur");
  }
}

async function postJson(url, token, body) {
  const r = await fetch(url, {
    method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || (d.error && d.error.code !== "ok")) throw new Error(d.error?.code || "tiktok");
  return d.data || {};
}

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "Requête refusée." }, 403);
  const b = await req.json().catch(() => ({}));
  const list = accounts(req, "tt"), acc = list.find((a) => a.id === b.account);
  if (!acc) return json({ error: "Compte TikTok non connecté." }, 401);
  const { post, error } = cleanPost(b);
  if (error) return json({ error }, 400);
  const asset = await shortAsset(b.job, b.file);
  if (!asset) return json({ error: "Short introuvable." }, 404);

  // jeton d'acces de 24 h : on le refait a chaque publication (le jeton long peut changer)
  const tok = await form(T + "/oauth/token/", {
    client_key: KEY, client_secret: SEC, grant_type: "refresh_token", refresh_token: acc.r,
  }).catch(() => null);
  if (!tok?.access_token) return json({ error: "Connexion TikTok expirée : reconnecte le compte." }, 401);
  acc.r = tok.refresh_token || acc.r;
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", saveAccounts("tt", list));

  try {
    const info = await postJson(T + "/post/publish/creator_info/query/", tok.access_token, {});
    const opts = info.privacy_level_options || [];
    const pub = process.env.TIKTOK_PUBLIC === "1" && opts.includes("PUBLIC_TO_EVERYONE");
    const privacy = pub ? "PUBLIC_TO_EVERYONE" : opts.includes("SELF_ONLY") ? "SELF_ONLY" : opts[0];
    const video = await download(asset);
    // ponytail: un seul morceau jusqu'a 64 Mo (nos shorts font 10 a 40 Mo) ; au-dela il faudrait decouper
    if (video.length > MAX_ONE_CHUNK) return json({ error: "Short trop lourd pour TikTok (64 Mo max)." }, 413);
    const init = await postJson(T + "/post/publish/video/init/", tok.access_token, {
      post_info: {
        title: [post.title, post.caption, post.tags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200),
        privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false,
      },
      source_info: { source: "FILE_UPLOAD", video_size: video.length, chunk_size: video.length, total_chunk_count: 1 },
    });
    const up = await fetch(init.upload_url, {
      method: "PUT", body: video,
      headers: { "content-type": "video/mp4", "content-range": `bytes 0-${video.length - 1}/${video.length}` },
    });
    if (!up.ok) throw new Error("envoi");
    return Response.json({ state: "done", private: !pub, url: "https://www.tiktok.com/" }, { headers });
  } catch (e) {
    const m = String(e.message);
    const msg = /spam_risk|rate_limit/.test(m) ? "TikTok limite les publications pour l'instant, réessaie plus tard."
      : /unaudited|privacy/.test(m) ? "TikTok exige un compte privé tant que l'appli n'est pas validée."
      : "TikTok a refusé la vidéo.";
    return Response.json({ error: msg }, { status: 502, headers });
  }
}
