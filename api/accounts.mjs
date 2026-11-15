// Comptes connectes dans ce navigateur (sans les jetons), et deconnexion d'un compte
import { json } from "./_gh.mjs";
import { ready, accounts, saveAccounts, publicList, sameOrigin } from "./_auth.mjs";

const KEYS = {
  yt: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ig: ["IG_APP_ID", "IG_APP_SECRET"],
  tt: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
};

export function GET(req) {
  const out = {};
  for (const [p, vars] of Object.entries(KEYS))
    out[p] = { ready: ready(...vars), accounts: publicList(accounts(req, p)) };
  return json(out);
}

export async function POST(req) {
  if (!sameOrigin(req)) return json({ error: "Requête refusée." }, 403);
  const b = await req.json().catch(() => ({}));
  if (!KEYS[b.p]) return json({ error: "Réseau inconnu." }, 400);
  const list = accounts(req, b.p).filter((a) => a.id !== b.id);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": saveAccounts(b.p, list) },
  });
}
