require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const db = new Database('noxi.db');
const PORT = Number(process.env.PORT || 3000);
const OWNER_USERNAME = (process.env.OWNER_USERNAME || 'jash').toLowerCase();
const OWNER_SETUP_TOKEN = process.env.OWNER_SETUP_TOKEN || '';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({ windowMs: 60_000, max: 180 }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 14 }
}));
app.use('/static', express.static(path.join(__dirname, 'public')));

// ---------- database ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  banned INTEGER NOT NULL DEFAULT 0,
  premium_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  background_url TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#ffffff',
  links_json TEXT NOT NULL DEFAULT '[]',
  views INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_user_id INTEGER,
  target_user_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  target_user_id INTEGER,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const q = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByUsername: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
  profileByUser: db.prepare('SELECT * FROM profiles WHERE user_id = ?'),
  createUser: db.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)'),
  createProfile: db.prepare('INSERT INTO profiles (user_id,display_name) VALUES (?,?)'),
  updateProfile: db.prepare('UPDATE profiles SET display_name=?,bio=?,avatar_url=?,background_url=?,accent=?,links_json=? WHERE user_id=?'),
  bumpView: db.prepare('UPDATE profiles SET views=views+1 WHERE user_id=?'),
  setBan: db.prepare('UPDATE users SET banned=? WHERE id=?'),
  setRole: db.prepare('UPDATE users SET role=? WHERE id=?'),
  setPremium: db.prepare('UPDATE users SET premium_until=? WHERE id=?'),
  createReport: db.prepare('INSERT INTO reports (reporter_user_id,target_user_id,reason) VALUES (?,?,?)'),
  createAudit: db.prepare('INSERT INTO audit_logs (admin_user_id,target_user_id,action,reason) VALUES (?,?,?,?)')
};

function esc(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function validUsername(v){ return /^[a-zA-Z0-9_-]{3,20}$/.test(v || ''); }
function parseLinks(raw){
  return String(raw || '').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,12).map(line=>{
    const [label,...rest] = line.split('|');
    const url = rest.join('|').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    return { label: (label || 'link').trim().slice(0,40), url: url.slice(0,400) };
  }).filter(Boolean);
}
function isPremium(user){ return user && user.premium_until && new Date(user.premium_until).getTime() > Date.now(); }
function currentUser(req){ return req.session.userId ? q.userById.get(req.session.userId) : null; }
function requireAuth(req,res,next){ const u=currentUser(req); if(!u) return res.redirect('/login'); if(u.banned) return res.status(403).send(page('Unavailable','<div class="center"><h1>profile unavailable</h1></div>',u)); req.user=u; next(); }
function requireOwner(req,res,next){ const u=currentUser(req); if(!u || u.role!=='owner') return res.status(403).send(page('403','<div class="center"><h1>403</h1></div>',u)); req.user=u; next(); }

function page(title, body, user=null){
return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — NOXI</title><link rel="stylesheet" href="/static/style.css"></head><body><header><a class="brand" href="/">NOXI</a><nav>${user?`<a href="/dashboard">dashboard</a><a href="/logout">logout</a>`:`<a href="/login">login</a><a href="/premium">premium</a>`}</nav></header>${body}<script src="/static/app.js"></script></body></html>`;
}

// ---------- public ----------
app.get('/', (req,res)=>{
  const u=currentUser(req);
  res.send(page('Home', `<main class="home"><div class="hero-logo">NOXI</div><form action="/claim" method="get" class="claim"><div class="claim-input"><span>noxi.lol/</span><input name="username" maxlength="20" placeholder="username" autocomplete="off"></div><button>claim</button></form><div class="tiny-links"><a href="/login">login</a><a href="/premium">premium</a></div></main>`, u));
});

app.get('/claim',(req,res)=>{ const username=String(req.query.username||'').trim(); if(!validUsername(username)) return res.redirect('/register'); res.redirect('/register?username='+encodeURIComponent(username)); });

app.get('/register',(req,res)=>{
  if(currentUser(req)) return res.redirect('/dashboard');
  const username=esc(String(req.query.username||''));
  res.send(page('Register', `<main class="panel"><h1>create account</h1><form method="post" action="/register" class="stack"><input name="username" value="${username}" placeholder="username" required maxlength="20"><input type="email" name="email" placeholder="email" required><input type="password" name="password" placeholder="password" minlength="8" required><input name="owner_token" placeholder="owner setup token (only for jash)"><button>create</button></form><p class="muted">already have one? <a href="/login">login</a></p></main>`));
});

app.post('/register', async (req,res)=>{
  const username=String(req.body.username||'').trim();
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  if(!validUsername(username) || !/^\S+@\S+\.\S+$/.test(email) || password.length<8) return res.status(400).send(page('Error','<main class="panel"><h1>invalid account details</h1></main>'));
  if(q.userByUsername.get(username)||q.userByEmail.get(email)) return res.status(409).send(page('Taken','<main class="panel"><h1>username or email already used</h1></main>'));
  let role='user';
  if(username.toLowerCase()===OWNER_USERNAME){
    if(!OWNER_SETUP_TOKEN || req.body.owner_token!==OWNER_SETUP_TOKEN) return res.status(403).send(page('Owner setup','<main class="panel"><h1>owner setup token required</h1></main>'));
    role='owner';
  }
  const hash=await bcrypt.hash(password,12);
  const info=q.createUser.run(username,email,hash,role);
  q.createProfile.run(info.lastInsertRowid,username);
  req.session.userId=info.lastInsertRowid;
  res.redirect('/dashboard');
});

app.get('/login',(req,res)=>{
  if(currentUser(req)) return res.redirect('/dashboard');
  res.send(page('Login', `<main class="panel"><h1>login</h1><form method="post" action="/login" class="stack"><input name="login" placeholder="username or email" required><input type="password" name="password" placeholder="password" required><button>login</button></form><p class="muted"><a href="/register">create account</a></p></main>`));
});
app.post('/login', async (req,res)=>{
  const login=String(req.body.login||'').trim();
  const user=login.includes('@')?q.userByEmail.get(login):q.userByUsername.get(login);
  if(!user || !(await bcrypt.compare(String(req.body.password||''),user.password_hash))) return res.status(401).send(page('Login','<main class="panel"><h1>wrong login</h1><p><a href="/login">try again</a></p></main>'));
  if(user.banned) return res.status(403).send(page('Unavailable','<main class="panel"><h1>account unavailable</h1></main>'));
  req.session.userId=user.id; res.redirect('/dashboard');
});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

app.get('/dashboard', requireAuth, (req,res)=>{
  const p=q.profileByUser.get(req.user.id);
  const links=JSON.parse(p.links_json||'[]').map(x=>`${x.label}|${x.url}`).join('\n');
  res.send(page('Dashboard', `<main class="dashboard"><section><h1>${esc(req.user.username)}</h1><p class="muted">noxi.lol/${esc(req.user.username)} · ${p.views} views${isPremium(req.user)?' · premium':''}${req.user.role==='owner'?' · owner':''}</p><p><a href="/${encodeURIComponent(req.user.username)}">view profile</a>${req.user.role==='owner'?' · <a href="/admin">admin</a>':''}</p></section><form method="post" action="/dashboard" class="stack wide"><input name="display_name" value="${esc(p.display_name)}" placeholder="display name" maxlength="40"><textarea name="bio" placeholder="bio" maxlength="240">${esc(p.bio)}</textarea><input name="avatar_url" value="${esc(p.avatar_url)}" placeholder="avatar image URL"><input name="background_url" value="${esc(p.background_url)}" placeholder="background image URL"><input name="accent" value="${esc(p.accent)}" placeholder="#ffffff"><textarea name="links" placeholder="label|https://example.com">${esc(links)}</textarea><button>save</button></form></main>`,req.user));
});
app.post('/dashboard', requireAuth, (req,res)=>{
  const p=q.profileByUser.get(req.user.id);
  const accent=/^#[0-9a-f]{6}$/i.test(req.body.accent||'')?req.body.accent:'#ffffff';
  q.updateProfile.run(String(req.body.display_name||'').slice(0,40),String(req.body.bio||'').slice(0,240),String(req.body.avatar_url||'').slice(0,500),String(req.body.background_url||'').slice(0,500),accent,JSON.stringify(parseLinks(req.body.links)),req.user.id);
  res.redirect('/dashboard');
});

app.get('/premium',(req,res)=>{
  const u=currentUser(req);
  res.send(page('Premium', `<main class="panel"><h1>premium</h1><p class="muted">extra customization will live here.</p><div class="premium-box"><b>free</b><span>basic profile + links</span></div><div class="premium-box"><b>premium</b><span>advanced styling, media, and analytics</span></div><p class="muted">rewarded ads and payment integration are intentionally disabled until a compliant provider is connected.</p></main>`,u));
});
app.get('/donate',(req,res)=>res.send(page('Donate','<main class="panel"><h1>support noxi</h1><p class="muted">donation provider not connected yet.</p></main>',currentUser(req))));

app.post('/report/:username', requireAuth, (req,res)=>{
  const target=q.userByUsername.get(req.params.username); if(!target) return res.sendStatus(404);
  q.createReport.run(req.user.id,target.id,String(req.body.reason||'other').slice(0,200)); res.redirect('/'+encodeURIComponent(target.username));
});

// ---------- owner ----------
app.get('/admin', requireOwner, (req,res)=>{
  const users=db.prepare('SELECT id,username,email,role,banned,premium_until,created_at FROM users ORDER BY id DESC LIMIT 100').all();
  const reports=db.prepare('SELECT reports.*, u.username target_username FROM reports JOIN users u ON u.id=reports.target_user_id WHERE reports.resolved=0 ORDER BY reports.id DESC LIMIT 50').all();
  const rows=users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${u.banned?'yes':'no'}</td><td><form class="inline" method="post" action="/admin/user/${u.id}/ban"><input name="reason" placeholder="reason"><button>${u.banned?'unban':'ban'}</button></form><form class="inline" method="post" action="/admin/user/${u.id}/premium"><button>+24h premium</button></form></td></tr>`).join('');
  const reportRows=reports.map(r=>`<li>#${r.id} ${esc(r.target_username)} — ${esc(r.reason)}</li>`).join('')||'<li>none</li>';
  res.send(page('Admin', `<main class="admin"><h1>admin</h1><h2>users</h2><div class="table-wrap"><table><tr><th>id</th><th>user</th><th>role</th><th>banned</th><th>actions</th></tr>${rows}</table></div><h2>open reports</h2><ul>${reportRows}</ul></main>`,req.user));
});
app.post('/admin/user/:id/ban', requireOwner, (req,res)=>{
  const id=Number(req.params.id); const target=q.userById.get(id); if(!target||target.role==='owner') return res.sendStatus(400);
  q.setBan.run(target.banned?0:1,id); q.createAudit.run(req.user.id,id,target.banned?'unban':'ban',String(req.body.reason||'').slice(0,200)); res.redirect('/admin');
});
app.post('/admin/user/:id/premium', requireOwner, (req,res)=>{
  const id=Number(req.params.id); const target=q.userById.get(id); if(!target) return res.sendStatus(404);
  const until=new Date(Date.now()+24*60*60*1000).toISOString(); q.setPremium.run(until,id); q.createAudit.run(req.user.id,id,'grant_premium_24h',''); res.redirect('/admin');
});

// ---------- profile route LAST ----------
app.get('/:username',(req,res)=>{
  const user=q.userByUsername.get(req.params.username); if(!user) return res.status(404).send(page('404','<main class="center"><h1>404</h1></main>',currentUser(req)));
  if(user.banned) return res.status(404).send(page('Unavailable','<main class="center"><h1>profile unavailable</h1></main>',currentUser(req)));
  const p=q.profileByUser.get(user.id); q.bumpView.run(user.id);
  const links=JSON.parse(p.links_json||'[]').map(l=>`<a class="profile-link" href="${esc(l.url)}" rel="noopener noreferrer" target="_blank">${esc(l.label)}</a>`).join('');
  const bg=p.background_url?`style="background-image:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.55)),url('${esc(p.background_url)}')"`:'';
  res.send(page(user.username, `<main class="profile" ${bg}><section class="profile-card" style="--accent:${esc(p.accent)}">${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:''}<h1>${esc(p.display_name||user.username)}</h1><p>${esc(p.bio)}</p><div class="profile-links">${links}</div>${currentUser(req)?`<form method="post" action="/report/${encodeURIComponent(user.username)}" class="report"><input name="reason" placeholder="report reason"><button>report</button></form>`:''}</section></main>`,currentUser(req)));
});

app.use((req,res)=>res.status(404).send(page('404','<main class="center"><h1>404</h1></main>',currentUser(req))));
app.listen(PORT,()=>console.log(`NOXI running at http://localhost:${PORT}`));
