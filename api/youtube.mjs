// YouTube : connexion Google (on choisit la chaine sur l'ecran Google) et mise en ligne du short
import { json } from "./_gh.mjs";
import { SITE, ready, accounts, saveAccounts, sameOrigin, startAuth, checkState, goBack,
  form, getJson, shortAsset, download, cleanPost } from "./_auth.mjs";

export const maxDuration = 60;
const ID = process.env.GOOGLE_CLIENT_ID, SEC = process.env.GOOGLE_CLIENT_SECRET;
const REDIR = SITE + "/api/youtube";
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.has("connect")) {
    if (!ready("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")) return json({ error: "YouTube n'est pas encore branché." }, 503);
    return startAuth("yt", (s) => "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: ID, redirect_uri: REDIR, response_type: "code", scope: SCOPES,
      access_type: "offline", prompt: "consent select_account", state: s,
    }), q.get("job"));
  }
  const st = checkState(req, "yt", q.get("state"));
  if (!st) return goBack(null, "yt", "erreur");
  if (!q.get("code")) return goBack(st, "yt", "annule");
  try {
    const tok = await form("https://oauth2.googleapis.com/token", {
      code: q.get("code"), client_id: ID, client_secret: SEC, redirect_uri: REDIR, grant_type: "authorization_code",
    });
    const ch = await getJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { authorization: "Bearer " + tok.access_token });
    const c = ch.items?.[0];
    if (!c || !tok.refresh_token) return goBack(st, "yt", "sans-chaine");
    const list = accounts(req, "yt").filter((a) => a.id !== c.id);
    list.push({ id: c.id, name: c.snippet.title, pic: c.snippet.thumbnails?.default?.url || "", r: tok.refresh_token });
    return goBack(st, "yt", "ok", [saveAccounts("yt", list)]);
  } catch {
    return goBack(st, "yt", "erreur");
  }
}

const REASONS = {
  quotaExceeded: "Quota YouTube du jour atteint, réessaie demain.",
  uploadLimitExceeded: "Limite de mises en ligne de la chaîne atteinte pour aujourd'hui.",
  youtubeSignupRequired: "Ce compte Google n'a pas encore de chaîne YouTube.",
};

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "Requête refusée." }, 403);
  const b = await req.json().catch(() => ({}));
  const acc = accounts(req, "yt").find((a) => a.id === b.account);
  if (!acc) return json({ error: "Chaîne YouTube non connectée." }, 401);
  const { post, error } = cleanPost(b);
  if (error) return json({ error }, 400);
  const asset = await shortAsset(b.job, b.file);
  if (!asset) return json({ error: "Short introuvable." }, 404);

  const tok = await form("https://oauth2.googleapis.com/token", {
    client_id: ID, client_secret: SEC, refresh_token: acc.r, grant_type: "refresh_token",
  }).catch(() => null);
  if (!tok?.access_token) return json({ error: "Connexion YouTube expirée : reconnecte la chaîne." }, 401);

  const video = await download(asset);
  const meta = {
    snippet: {
      title: post.title, categoryId: "22", defaultLanguage: "en", defaultAudioLanguage: "en",
      description: [post.caption, [...post.tags, "#Shorts"].join(" ")].filter(Boolean).join("\n\n"),
      tags: post.tags.map((t) => t.slice(1)),
    },
    status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: "Bearer " + tok.access_token, "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4", "x-upload-content-length": String(video.length),
    },
    body: JSON.stringify(meta),
  });
  if (!init.ok) {
    const reason = (await init.json().catch(() => ({}))).error?.errors?.[0]?.reason;
    return json({ error: REASONS[reason] || "YouTube a refusé la mise en ligne." }, 502);
  }
  const up = await fetch(init.headers.get("location"), { method: "PUT", headers: { "content-type": "video/mp4" }, body: video });
  const v = await up.json().catch(() => ({}));
  if (!up.ok || !v.id) return json({ error: "YouTube a refusé la vidéo." }, 502);
  return json({ url: "https://www.youtube.com/shorts/" + v.id });
}
