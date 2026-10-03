// Stub Club app shell: sign-in, profiles, routing and saving to Supabase.
(() => {
const cfg = window.CFB_CONFIG;
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
});

const RESERVED = new Set(["admin","api","app","login","logout","settings","signup","u","user","users","about","help","support","terms","privacy","stubclub","cfbstub","welcome","me"]);
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

let session = null;     // Supabase session or null
let me = null;          // my profile row or null
let viewing = null;     // { profile, collection } when on /u/:name
let mode = "loading";   // loading | landing | own | public | onboard | settings | login | missing
let routeToken = 0;

/* ---------- collection plumbing used by wall.js ---------- */
function toState(d) {
  d = d || {};
  const st = {
    stadiums: new Set(d.stadiums || []), teams: new Set(d.teams || []),
    bowls: new Set((d.bowls || []).map(b => b === "rose-bowl" ? "rose-bowl-game" : b)),
    customVenues: (d.customVenues || []).map(x => ({ ...x })), customBowls: (d.customBowls || []).map(x => ({ ...x })),
    matchups: { ...(d.matchups || {}) }, order: [...(d.order || [])]
  };
  for (const [k, m] of Object.entries(st.matchups)) {
    if (m && m.bowl) { st.matchups["b:" + m.bowl] = { a: m.a || "", b: m.b || "" }; delete st.matchups[k]; }
  }
  normOrder(st);
  return st;
}
let publicState = null;
window.currentCollection = () => mode === "public" ? publicState : mode === "own" ? S : SAMPLE;

window.saveCollection = async (data) => {
  if (!session) throw new Error("not signed in");
  const { error } = await sb.from("collections").upsert({ user_id: session.user.id, data });
  if (error) throw error;
};

window.onLockedTap = () => {
  if (mode === "landing") toast("Sign in to start your own collection — it's free.");
  else if (mode === "public") toast(`This is ${viewing.profile.display_name || "@" + viewing.profile.username}'s collection. Start your own from Sign in.`);
  else toast("Still loading…");
};

/* ---------- navigation ---------- */
function go(path) { if (location.pathname + location.hash !== path) history.pushState({}, "", path); route(); }
document.addEventListener("click", e => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); go(a.getAttribute("href"));
});
addEventListener("popstate", route);

function showWall(on) { $("#wallWrap").hidden = !on; $("#page").hidden = on; }
function setHeader(title, sub) {
  $("#brandTitle").innerHTML = title;
  $("#brandSub").innerHTML = sub;
}
function counts(on) { $("#counts").hidden = !on; }

function renderNav() {
  const n = $("#topnav");
  if (!session) { n.innerHTML = `<a href="/login" data-link class="cta">Sign in</a>`; return; }
  const name = me ? "@" + esc(me.username) : "Finish setup";
  n.innerHTML = `${me ? `<a href="/" data-link>My wall</a>` : ""}<a href="${me ? "/settings" : "/welcome"}" data-link>${name}</a><button id="signOut">Sign out</button>`;
}
document.addEventListener("click", async e => {
  if (e.target.id === "signOut") { await sb.auth.signOut(); toast("Signed out"); go("/"); }
});

window.afterRender = () => {
  const b = $("#banner");
  if (mode === "landing") {
    b.innerHTML = `<section class="hero"><div><h2>Your college football collection</h2><p>A pennant for every team you've seen play, a ticket stub for every stadium, a pin for every bowl. All 138 FBS programs. This is a sample wall — sign in to start yours.</p></div>
      <div class="acts"><a class="btn primary" href="/login" data-link>Start my collection</a></div></section>`;
  } else if (mode === "public") {
    const p = viewing.profile;
    b.innerHTML = session ? "" : `<section class="hero"><div><h2>Seen some games?</h2><p>Start your own collection of teams, stadiums and bowls you've seen in person.</p></div><div class="acts"><a class="btn primary" href="/login" data-link>Start my collection</a></div></section>`;
  } else if (mode === "own" && me && !me.is_public) {
    b.innerHTML = `<div class="samplebar">Your wall is <b>private</b>. Make it public in <a href="/settings" data-link>Settings</a> to share it at cfbstub.club/u/${esc(me.username)}.</div>`;
  } else b.innerHTML = "";
};

/* ---------- routes ---------- */
async function route() {
  const token = ++routeToken;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  renderNav();

  if (path.startsWith("/u/")) return showPublic(decodeURIComponent(path.slice(3)).toLowerCase(), token);
  if (path === "/login") return session ? go("/") : showLogin();
  if (path === "/welcome") return session ? showOnboard() : go("/login");
  if (path === "/settings") return session ? (me ? showSettings() : go("/welcome")) : go("/login");

  // home
  if (!session) { mode = "landing"; canEdit = false; showWall(true); counts(true);
    setHeader("CFB Stub <span>Club</span>", "FBS teams seen, stadiums visited and bowls attended · 2026 lineup, 138 teams"); render(); return; }
  if (!me) return go("/welcome");
  mode = "own"; canEdit = true; showWall(true); counts(true);
  setHeader("CFB Stub <span>Club</span>", `<span class="owner">Signed in as <b>@${esc(me.username)}</b>${me.is_public ? ` · public at <a href="/u/${esc(me.username)}" data-link>cfbstub.club/u/${esc(me.username)}</a>` : " · private"}</span>`);
  render();
}

async function showPublic(username, token) {
  mode = "loading"; canEdit = false; showWall(true); counts(false);
  $("#view").innerHTML = ""; $("#banner").innerHTML = ""; setHeader("Loading…", "");
  const { data: prof, error: pErr } = await sb.from("profiles").select("id,username,display_name,is_public").eq("username", username).maybeSingle();
  if (token !== routeToken) return;
  if (pErr) { mode = "missing"; showWall(false); setHeader("CFB Stub <span>Club</span>", "");
    $("#page").innerHTML = `<section class="card"><h2>Couldn't load this wall</h2><p>Check your connection and reload the page.</p></section>`; return; }
  if (!prof || (!prof.is_public && !(session && prof.id === session.user.id))) {
    mode = "missing"; showWall(false); counts(false); setHeader("CFB Stub <span>Club</span>", "");
    $("#page").innerHTML = `<section class="card"><h2>Not found</h2><p>There's no public wall at <b>cfbstub.club/u/${esc(username)}</b>. It may be private or the name may be different.</p><a class="btn primary" href="/" data-link>Go to Stub Club</a></section>`;
    return;
  }
  const { data: col } = await sb.from("collections").select("data").eq("user_id", prof.id).maybeSingle();
  if (token !== routeToken) return;
  viewing = { profile: prof }; publicState = toState(col && col.data);
  if (session && prof.id === session.user.id) { go("/"); return; }
  mode = "public"; counts(true);
  setHeader(`${esc(prof.display_name || prof.username)}'s <span>Wall</span>`, `<span class="owner">@${esc(prof.username)} · cfbstub.club/u/${esc(prof.username)}</span>`);
  document.title = `${prof.display_name || "@" + prof.username} · Stub Club`;
  render();
}

function showLogin() {
  mode = "login"; showWall(false); counts(false); setHeader("CFB Stub <span>Club</span>", "Sign in or create your collection");
  $("#page").innerHTML = `<section class="card"><h2>Sign in</h2><p>New here? Either option creates your account.</p>
    <button class="btn google" type="button" id="googleBtn"><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Continue with Google</button>
    <p class="err" id="googleErr"></p>
    <div class="or"><span>or use email</span></div>
    <form class="form" id="loginForm"><div class="field"><label for="email">Email</label><input type="email" id="email" required autocomplete="email" placeholder="you@example.com"></div>
    <p class="err" id="loginErr"></p><button class="btn primary" type="submit" id="loginBtn">Email me a sign-in link</button></form>
    <div class="ok" id="loginOk" hidden></div></section>`;
  $("#googleBtn").addEventListener("click", async () => {
    $("#googleBtn").disabled = true; $("#googleErr").textContent = "";
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/" } });
    if (error) { $("#googleBtn").disabled = false; $("#googleErr").textContent = "Couldn't start Google sign-in: " + error.message; }
  });
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault(); const email = $("#email").value.trim(); if (!email) return;
    $("#loginBtn").disabled = true; $("#loginErr").textContent = "";
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/" } });
    $("#loginBtn").disabled = false;
    if (error) { $("#loginErr").textContent = error.status === 429 ? "Too many sign-in emails right now. Wait a few minutes and try again." : "Couldn't send the link: " + error.message; return; }
    $("#loginForm").hidden = true; const ok = $("#loginOk"); ok.hidden = false;
    ok.innerHTML = `Check <b>${esc(email)}</b> for a sign-in link. Open it on this device and you'll land back here signed in.`;
  });
}

function profileFields(p, isNew) {
  return `<div class="field"><label for="uname">Username</label><input type="text" id="uname" value="${esc(p ? p.username : "")}" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. desertgridiron">
      <span class="help">3–20 characters: lowercase letters, numbers, underscores. Your public link is cfbstub.club/u/<b id="unamePrev">${esc(p ? p.username : "yourname")}</b></span></div>
    <div class="field"><label for="dname">Display name (optional)</label><input type="text" id="dname" value="${esc(p && p.display_name || "")}" maxlength="40" placeholder="Shown on your public wall"></div>
    <label class="check"><input type="checkbox" id="ispub" ${p && p.is_public ? "checked" : ""}> <span><b>Make my wall public</b><br><span class="help">Anyone with your link can view it (not edit). You can change this any time.</span></span></label>
    ${isNew ? `<label class="check"><input type="checkbox" id="doImport"> <span><b>Import a collection file</b><br><span class="help">Use the file you downloaded from the Claude version of the tracker.</span></span></label>` : ""}`;
}
function readProfile() {
  const username = $("#uname").value.trim().toLowerCase();
  const display_name = $("#dname").value.trim() || null;
  const is_public = $("#ispub").checked;
  if (!USERNAME_RE.test(username)) return { err: "Usernames are 3–20 characters: lowercase letters, numbers or underscores." };
  if (RESERVED.has(username)) return { err: "That username is reserved. Try another." };
  return { username, display_name, is_public };
}
function wireUsernamePreview() { $("#uname").addEventListener("input", e => { $("#unamePrev").textContent = e.target.value.trim().toLowerCase() || "yourname"; }); }

function showOnboard() {
  if (me) return go("/");
  mode = "onboard"; showWall(false); counts(false); setHeader("CFB Stub <span>Club</span>", "Welcome — one quick step");
  $("#page").innerHTML = `<section class="card"><h2>Set up your wall</h2><p>Pick a username. You can change everything here later in Settings.</p>
    <form class="form" id="obForm">${profileFields(null, true)}<p class="err" id="obErr"></p><button class="btn primary" type="submit" id="obBtn">Create my wall</button></form></section>`;
  wireUsernamePreview();
  $("#obForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = readProfile(); if (p.err) { $("#obErr").textContent = p.err; return; }
    let imported = null;
    if ($("#doImport").checked) {
      imported = await pickFile(); if (imported === undefined) return;
      if (!imported) { $("#obErr").textContent = "That file isn't a Stub Club collection export."; return; }
    }
    $("#obBtn").disabled = true; $("#obErr").textContent = "";
    const { data, error } = await sb.from("profiles").insert({ id: session.user.id, ...p }).select().single();
    if (error) { $("#obBtn").disabled = false; $("#obErr").textContent = error.code === "23505" ? "That username is taken. Try another." : "Couldn't create your wall: " + error.message; return; }
    me = data;
    const st = toState(imported || {}); S = st;
    const { error: e2 } = await sb.from("collections").upsert({ user_id: session.user.id, data: snapshotOf(st) });
    if (e2) toast("Your wall was created, but the collection didn't save. Reload and try again.");
    toast(imported ? `Imported ${st.teams.size} teams, ${st.order.length} stubs, ${st.bowls.size} bowls` : "Your wall is ready. Tap anything you've seen.");
    go("/");
  });
}
function snapshotOf(st) { return { stadiums: [...st.stadiums], teams: [...st.teams], bowls: [...st.bowls], customVenues: st.customVenues, customBowls: st.customBowls, matchups: st.matchups, order: normOrder(st) }; }
function pickFile() {
  return new Promise(res => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
    inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return res(undefined);
      try { const d = JSON.parse(await f.text()); res(d.app === "cfbstub" && Array.isArray(d.stadiums) ? d : null); } catch { res(null); } };
    inp.click();
  });
}

function showSettings() {
  mode = "settings"; showWall(false); counts(false); setHeader("CFB Stub <span>Club</span>", "Settings");
  const link = `${cfg.siteUrl}/u/${me.username}`;
  $("#page").innerHTML = `<section class="card"><h2>Settings</h2><p>Signed in as ${esc(session.user.email || "")}.</p>
    <form class="form" id="setForm">${profileFields(me, false)}<p class="err" id="setErr"></p><button class="btn primary" type="submit" id="setBtn">Save changes</button></form>
    <div class="settings-sec"><h3>Your link</h3><div class="linkrow"><code id="shareLink">${esc(link)}</code><button class="btn" id="copyLink">Copy</button></div>
      <p class="help" style="margin-top:6px">${me.is_public ? "Anyone with this link can view your wall." : "Your wall is private, so this link shows “not found” to others until you make it public."}</p></div>
    <div class="settings-sec"><h3>Backup</h3><div class="linkrow"><button class="btn" id="setExport">Download my collection</button><button class="btn" id="setImport">Restore from a file</button></div></div>
  </section>`;
  wireUsernamePreview();
  $("#setForm").addEventListener("submit", async e => {
    e.preventDefault(); const p = readProfile(); if (p.err) { $("#setErr").textContent = p.err; return; }
    $("#setBtn").disabled = true; $("#setErr").textContent = "";
    const { data, error } = await sb.from("profiles").update(p).eq("id", session.user.id).select().single();
    $("#setBtn").disabled = false;
    if (error) { $("#setErr").textContent = error.code === "23505" ? "That username is taken. Try another." : "Couldn't save: " + error.message; return; }
    me = data; renderNav(); toast("Settings saved"); showSettings();
  });
  $("#copyLink").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(link); toast("Link copied"); }
    catch { const r = document.createRange(); r.selectNodeContents($("#shareLink")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Link selected — copy it"); }
  });
  $("#setExport").addEventListener("click", () => exportCollection());
  $("#setImport").addEventListener("click", () => { $("#restoreIn").value = ""; $("#restoreIn").click(); });
}

/* ---------- session lifecycle ---------- */
async function loadMine() {
  me = null; S = toState({});
  if (!session) return;
  const uid = session.user.id;
  const [{ data: prof }, { data: col }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
    sb.from("collections").select("data").eq("user_id", uid).maybeSingle()
  ]);
  me = prof || null; S = toState(col && col.data);
}

let booted = false;
sb.auth.onAuthStateChange((event, s) => {
  const was = session && session.user.id;
  session = s;
  if (event === "TOKEN_REFRESHED" || (booted && was === (s && s.user.id))) return;
  // Supabase recommends not awaiting its own calls inside this callback; defer the work.
  setTimeout(async () => { await loadMine(); booted = true; route(); }, 0);
});
render(); // paint the sample wall immediately while the session loads
})();
