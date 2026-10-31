// stubs-login: sends the Stubs sign-in link (Resend, from stubs@middleton.io).
//
// Stubs shares a Supabase project with other apps, so new accounts are by
// invitation: an address that already has an account can always get a link,
// and a new address needs a working list invite link (stubs_lists.invite_token).
// Same safety rules as Shortlist's send-login-link: the link only ever goes to
// the mailbox, the reply never says whether an address exists, every address is
// rate limited, and the redirect is fixed to our own page.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const APP_URL = 'https://middleton.io/stubs/';
const FROM = 'Stubs <stubs@middleton.io>';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function emailHtml(link: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>Your Stubs sign-in link</title></head>
<body style="margin:0;padding:0;background:#1d1a16">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1d1a16"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background:#f4ecdc;border-radius:4px">
<tr><td style="padding:26px 28px 6px;font:700 13px/1 Menlo,Consolas,monospace;letter-spacing:3px;color:#b8321c">ADMIT ONE</td></tr>
<tr><td style="padding:6px 28px 0;font:800 34px/1.05 'Arial Narrow',Arial,sans-serif;letter-spacing:-0.5px;color:#1d1a16;text-transform:uppercase">Stubs</td></tr>
<tr><td style="padding:14px 28px 0;font:400 16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#3d362c">Here is your sign-in link. Tap it on this device and you're in.</td></tr>
<tr><td style="padding:22px 28px 8px"><a href="${esc(link)}" style="display:inline-block;background:#b8321c;color:#ffffff;font:700 16px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-decoration:none;padding:15px 24px;border-radius:4px">Sign in to Stubs</a></td></tr>
<tr><td style="padding:10px 28px 0;border-top:0"><div style="border-top:2px dashed #cdbfa5;height:0;line-height:0">&nbsp;</div></td></tr>
<tr><td style="padding:12px 28px 24px;font:400 13px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6b6152">It works once and expires in an hour. Didn't ask for it? Ignore this email.<br><br>Button not working? Paste this into your browser:<br><span style="word-break:break-all;color:#1d1a16">${esc(link)}</span></td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const RESEND = Deno.env.get('RESEND_API_KEY');

  let body: { email?: string; invite?: string } = {};
  try { body = await req.json(); } catch { /* below */ }
  const email = String(body.email ?? '').trim().toLowerCase();
  const invite = String(body.invite ?? '').trim();
  if (!email || email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, message: 'That email address looks off. Check it and try again.' }, 400);
  }
  // One reply for every outcome, so this can't be used to learn who has an account.
  const generic = json({ ok: true, message: 'Check your email. If that address has a Stubs account or came with an invite, the link is on its way.' });
  const log = (outcome: string) => admin.from('stubs_login_requests').insert({ email, outcome });

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from('stubs_login_requests').select('id', { count: 'exact', head: true }).eq('email', email).gte('requested_at', hourAgo),
    admin.from('stubs_login_requests').select('id', { count: 'exact', head: true }).gte('requested_at', hourAgo),
  ]);
  if ((mine ?? 0) >= 5 || (all ?? 0) >= 60) {
    await log('rate_limited');
    return json({ ok: false, message: 'Too many sign-in links for now. Try again in an hour.' }, 429);
  }
  if (!RESEND) { await log('no_resend'); return generic; }

  const { data: existing } = await admin.rpc('stubs_user_exists', { p_email: email });
  if (!existing) {
    let invited = false;
    if (UUID.test(invite)) {
      const { data } = await admin.from('stubs_lists').select('id').eq('invite_token', invite).neq('kind', 'letterboxd').maybeSingle();
      invited = !!data;
    }
    if (!invited) {
      await log('not_invited');
      return generic;
    }
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { stubs: true } });
    if (error) { await log('create_failed'); return generic; }
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink', email, options: { redirectTo: APP_URL },
  });
  const link = linkData?.properties?.action_link;
  if (linkErr || !link) { await log('link_failed'); return generic; }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [email], subject: 'Your Stubs sign-in link',
      html: emailHtml(link),
      text: `Your Stubs sign-in link:\n\n${link}\n\nIt works once and expires in an hour. Didn't ask for it? Ignore this email.\n`,
    }),
  });
  await log(res.ok ? (existing ? 'sent' : 'sent_new') : 'send_failed');
  return generic;
});
