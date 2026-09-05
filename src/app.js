const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const views = require('./views');
const { esc, validUsername, validUrl, color, int, token, hashToken, timingSafeEqual, newCsrf, csrfField, verifyCsrf } = require('./security');
const { sendResetEmail, storageConfigured, uploadToStorage, verifyRewardSignature } = require('./integrations');

const app = express();
const prod = process.env.NODE_ENV === 'production';
const ownerUsername = String(process.env.OWNER_USERNAME || 'jash').toLowerCase();
const baseUrl = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

if (prod) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'https:', 'data:'],
      mediaSrc: ["'self'", 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false }));
app.use(express.urlencoded({ extended: false, limit: '250kb' }));
app.use(express.json({ limit: '250kb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(session({
  store: new pgSession({ pool: db.pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'noxi.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 1000 * 60 * 60 * 24 * 14 }
}));
app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: prod ? '1h' : 0 }));
app.use((req,res,next)=>{ newCsrf(req); next(); });
app.use(verifyCsrf);

async function currentUser(req) {
  if (!req.session.userId) return null;
  return db.userById(req.session.userId);
}

async function requireAuth(req,res,next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.redirect('/login');
    if (user.banned || (user.suspended_until && new Date(user.suspended_until) > new Date())) return res.status(403).send(views.page(req,'Unavailable','<main class="center"><h1>account unavailable</h1></main>',null));
    req.user = user;
    next();
  } catch (e) { next(e); }
}

function roleRank(role) { return ({ user:0, premium:0, moderator:1, admin:2, owner:3 })[role] ?? 0; }
function requireRole(minimum) {
  return async (req,res,next)=>{
    try {
      const user = await currentUser(req);
      if (!user || roleRank(user.role) < roleRank(minimum)) return res.status(403).send(views.page(req,'403','<main class="center"><h1>403</h1></main>',user));
      req.user = user; next();
    } catch(e){ next(e); }
  };
}

function parsePairs(raw, max, allowedPlatforms = null) {
  return String(raw || '').split('\n').map(v=>v.trim()).filter(Boolean).slice(0,max).map((line, position)=>{
    const split = line.indexOf('|');
    if (split < 1) return null;
    const a = line.slice(0,split).trim().slice(0,40);
    const url = line.slice(split+1).trim();
    if (!a || !validUrl(url,{allowEmpty:false})) return null;
    if (allowedPlatforms && !allowedPlatforms.includes(a.toLowerCase())) return null;
    return { a, url, position };
  }).filter(Boolean);
}

function premiumActive(user) {
  return Boolean(user && user.premium_until && new Date(user.premium_until) > new Date());
}

app.get('/health', async (req,res)=>{
  try { await db.query('SELECT 1'); res.json({ ok:true, service:'noxi' }); }
  catch { res.status(503).json({ ok:false }); }
});

app.get('/', async (req,res,next)=>{
  try {
    const user = await currentUser(req);
    if (await db.setting('maintenance_mode', false) && user?.role !== 'owner') return res.status(503).send(views.page(req,'Maintenance','<main class="center"><h1>maintenance</h1></main>',user));
    res.send(views.home(req,user));
  } catch(e){ next(e); }
});

app.get('/claim',(req,res)=>{
  const username = String(req.query.username || '').trim();
  res.redirect(validUsername(username) ? `/register?username=${encodeURIComponent(username)}` : '/register');
});

app.get('/register', async (req,res,next)=>{
  try {
    if (await currentUser(req)) return res.redirect('/dashboard');
    if (!(await db.setting('registration_enabled', true))) return res.status(403).send(views.page(req,'Registration','<main class="panel"><h1>registration is closed</h1></main>'));
    res.send(views.auth(req,'register',String(req.query.username||'')));
  } catch(e){ next(e); }
});

app.post('/register', async (req,res,next)=>{
  try {
    if (!(await db.setting('registration_enabled', true))) return res.sendStatus(403);
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!validUsername(username) || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 200) return res.status(400).send(views.auth(req,'register',username,'check the username, email, and password'));
    if (await db.userByUsername(username) || await db.userByEmail(email)) return res.status(409).send(views.auth(req,'register',username,'username or email already used'));
    let role = 'user';
    if (username.toLowerCase() === ownerUsername) {
      const setup = process.env.OWNER_SETUP_TOKEN || '';
      if (!setup || !timingSafeEqual(req.body.owner_token, setup)) return res.status(403).send(views.auth(req,'register',username,'owner setup token required'));
      role = 'owner';
    }
    const hash = await bcrypt.hash(password,12);
    const user = await db.tx(async client => {
      const result = await client.query('INSERT INTO users(username,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING *',[username,email,hash,role]);
      const created = result.rows[0];
      await client.query('INSERT INTO profiles(user_id,display_name) VALUES($1,$2)',[created.id,username]);
      return created;
    });
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch(e){ if (e.code === '23505') return res.status(409).send(views.auth(req,'register',req.body.username,'username or email already used')); next(e); }
});

app.get('/login', async (req,res,next)=>{ try { if(await currentUser(req)) return res.redirect('/dashboard'); res.send(views.auth(req,'login')); } catch(e){next(e);} });
app.post('/login', async (req,res,next)=>{
  try {
    const login = String(req.body.login || '').trim();
    const user = login.includes('@') ? await db.userByEmail(login) : await db.userByUsername(login);
    if (!user || !(await bcrypt.compare(String(req.body.password||''), user.password_hash))) return res.status(401).send(views.auth(req,'login','','wrong login'));
    if (user.banned || (user.suspended_until && new Date(user.suspended_until) > new Date())) return res.status(403).send(views.auth(req,'login','','account unavailable'));
    req.session.regenerate(err=>{
      if (err) return next(err);
      req.session.userId = user.id;
      newCsrf(req);
      res.redirect('/dashboard');
    });
  } catch(e){ next(e); }
});

app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));

app.get('/forgot',(req,res)=>res.send(views.auth(req,'forgot')));
app.post('/forgot', async (req,res,next)=>{
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await db.userByEmail(email);
    if (user) {
      const raw = token(32);
      await db.query('DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at<NOW()',[user.id]);
      await db.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')",[user.id,hashToken(raw)]);
      try { await sendResetEmail(user.email, `${baseUrl}/reset?token=${raw}`); } catch(e) { console.error('[NOXI] reset email failed:',e.message); }
    }
    res.send(views.auth(req,'forgot','','if that email exists, a reset link was sent'));
  } catch(e){ next(e); }
});

app.get('/reset',(req,res)=>{
  const raw = String(req.query.token || '');
  res.send(views.page(req,'Reset password',`<main class="panel"><h1>new password</h1><form class="stack" method="post" action="/reset">${csrfField(req)}<input type="hidden" name="token" value="${esc(raw)}"><input type="password" name="password" minlength="10" maxlength="200" required placeholder="new password"><button>reset</button></form></main>`));
});
app.post('/reset', async (req,res,next)=>{
  try {
    const raw = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (password.length < 10 || password.length > 200) return res.status(400).send('invalid password');
    const row = await db.one('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()',[hashToken(raw)]);
    if (!row) return res.status(400).send('reset link is invalid or expired');
    const hash = await bcrypt.hash(password,12);
    await db.tx(async client=>{
      await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[hash,row.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1',[row.id]);
      await client.query('DELETE FROM user_sessions');
    });
    res.redirect('/login');
  } catch(e){ next(e); }
});

app.get('/dashboard', requireAuth, async (req,res,next)=>{
  try { const b=await db.profileBundle(req.user.id); res.send(views.dashboard(req,req.user,b.profile,b.links,b.socials)); } catch(e){next(e);} 
});

app.post('/dashboard', requireAuth, async (req,res,next)=>{
  try {
    const isPremium = premiumActive(req.user) || req.user.role === 'owner';
    const links = parsePairs(req.body.links,12);
    const socials = parsePairs(req.body.socials,12,['discord','github','youtube','twitch','tiktok','instagram','x','steam','spotify','website']);
    let backgroundType = ['image','solid'].includes(req.body.background_type) ? req.body.background_type : 'image';
    let audioUrl = '';
    let animation = 'none';
    let opacity = 90;
    let blur = 0;
    if (isPremium) {
      if (req.body.background_type === 'video') backgroundType='video';
      if (validUrl(req.body.audio_url)) audioUrl=String(req.body.audio_url||'').slice(0,800);
      if (['none','fade','rise'].includes(req.body.entrance_animation)) animation=req.body.entrance_animation;
      opacity=int(req.body.card_opacity,0,100,90);
      blur=int(req.body.blur_amount,0,40,0);
    }
    const avatar = validUrl(req.body.avatar_url) ? String(req.body.avatar_url||'').slice(0,800) : '';
    const background = validUrl(req.body.background_url) ? String(req.body.background_url||'').slice(0,800) : '';
    await db.tx(async client=>{
      await client.query(`UPDATE profiles SET display_name=$1,bio=$2,avatar_url=$3,background_url=$4,background_type=$5,accent=$6,text_color=$7,font_name=$8,card_opacity=$9,blur_amount=$10,entrance_animation=$11,audio_url=$12,updated_at=NOW() WHERE user_id=$13`,[
        String(req.body.display_name||'').slice(0,40), String(req.body.bio||'').slice(0,300), avatar, background, backgroundType, color(req.body.accent), color(req.body.text_color), ['system','mono','serif'].includes(req.body.font_name)?req.body.font_name:'system', opacity, blur, animation, audioUrl, req.user.id
      ]);
      await client.query('DELETE FROM links WHERE user_id=$1',[req.user.id]);
      for (const l of links) await client.query('INSERT INTO links(user_id,title,url,position) VALUES($1,$2,$3,$4)',[req.user.id,l.a,l.url,l.position]);
      await client.query('DELETE FROM social_links WHERE user_id=$1',[req.user.id]);
      for (const s of socials) await client.query('INSERT INTO social_links(user_id,platform,url,position) VALUES($1,$2,$3,$4)',[req.user.id,s.a.toLowerCase(),s.url,s.position]);
    });
    res.redirect('/dashboard');
  } catch(e){ next(e); }
});

app.post('/upload', requireAuth, upload.single('file'), async (req,res,next)=>{
  try {
    if (!req.file) return res.status(400).send('choose a file');
    if (!storageConfigured()) return res.status(503).send('uploads are not configured yet');
    const url = await uploadToStorage(req.file.buffer, req.file.mimetype, req.file.originalname, req.user.id);
    res.send(views.page(req,'Upload',`<main class="panel"><h1>uploaded</h1><p class="muted">copy this URL into your profile editor:</p><input class="copy-field" value="${esc(url)}" readonly><p><a href="/dashboard">back</a></p></main>`,req.user));
  } catch(e){ next(e); }
});

app.get('/analytics', requireAuth, async (req,res,next)=>{
  try {
    const rows=(await db.query("SELECT viewed_on,views FROM daily_profile_views WHERE user_id=$1 ORDER BY viewed_on DESC LIMIT 30",[req.user.id])).rows;
    const body=rows.map(r=>`<tr><td>${esc(String(r.viewed_on).slice(0,10))}</td><td>${Number(r.views)}</td></tr>`).join('') || '<tr><td colspan="2">no data yet</td></tr>';
    res.send(views.page(req,'Analytics',`<main class="dashboard"><h1>analytics</h1><table><tr><th>day</th><th>views</th></tr>${body}</table></main>`,req.user));
  } catch(e){next(e);}
});

app.get('/account', requireAuth, (req,res)=>{
  res.send(views.page(req,'Account',`<main class="panel"><h1>account</h1><p class="muted">${esc(req.user.email)}</p><form method="post" action="/account/password" class="stack">${csrfField(req)}<input type="password" name="current_password" placeholder="current password" required><input type="password" name="new_password" minlength="10" placeholder="new password" required><button>change password</button></form><hr><form method="post" action="/account/delete" class="stack confirm-form" data-confirm="delete your NOXI account permanently?"><input type="hidden" name="_csrf" value="${esc(req.session.csrf)}"><input type="password" name="password" placeholder="password" required><button>delete account</button></form></main>`,req.user));
});
app.post('/account/password', requireAuth, async (req,res,next)=>{
  try {
    if (!(await bcrypt.compare(String(req.body.current_password||''),req.user.password_hash))) return res.status(400).send('wrong password');
    const p=String(req.body.new_password||''); if(p.length<10||p.length>200) return res.status(400).send('invalid password');
    await db.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2',[await bcrypt.hash(p,12),req.user.id]);
    res.redirect('/account');
  }catch(e){next(e);}
});
app.post('/account/delete', requireAuth, async (req,res,next)=>{
  try {
    if(req.user.role==='owner') return res.status(400).send('owner account cannot be deleted here');
    if(!(await bcrypt.compare(String(req.body.password||''),req.user.password_hash))) return res.status(400).send('wrong password');
    await db.query('DELETE FROM users WHERE id=$1',[req.user.id]);
    req.session.destroy(()=>res.redirect('/'));
  }catch(e){next(e);}
});

app.get('/premium', async (req,res,next)=>{
  try {
    const user=await currentUser(req);
    const rewarded=await db.setting('rewarded_ads_enabled',false);
    const donationUrl=process.env.DONATION_URL && process.env.DONATIONS_ENABLED==='true' ? process.env.DONATION_URL : '';
    res.send(views.page(req,'Premium',`<main class="panel"><h1>premium</h1><div class="premium-box"><b>free</b><span>profile + links + socials</span></div><div class="premium-box"><b>premium</b><span>video backgrounds, audio, advanced style, more analytics</span></div>${rewarded?'<p class="muted">verified rewarded-ad access is enabled by the site owner.</p>':'<p class="muted">rewarded Premium is currently off.</p>'}${donationUrl?`<p><a class="small-button" href="${esc(donationUrl)}" rel="noopener noreferrer">support NOXI</a></p>`:''}</main>`,user));
  }catch(e){next(e);}
});

app.get('/donate', async (req,res,next)=>{
  try { const user=await currentUser(req); const url=process.env.DONATION_URL&&process.env.DONATIONS_ENABLED==='true'?process.env.DONATION_URL:''; res.send(views.page(req,'Donate',`<main class="panel"><h1>support noxi</h1>${url?`<a class="small-button" href="${esc(url)}" rel="noopener noreferrer">open donation provider</a>`:'<p class="muted">donations are not enabled.</p>'}</main>`,user)); } catch(e){next(e);} 
});

app.post('/report/:username', requireAuth, async (req,res,next)=>{
  try {
    const target=await db.userByUsername(req.params.username); if(!target||target.id===req.user.id) return res.sendStatus(404);
    const category=['spam','harassment','impersonation','other'].includes(req.body.category)?req.body.category:'other';
    const reason=String(req.body.reason||'').trim().slice(0,300); if(!reason) return res.status(400).send('reason required');
    await db.query('INSERT INTO reports(reporter_user_id,target_user_id,category,reason) VALUES($1,$2,$3,$4)',[req.user.id,target.id,category,reason]);
    res.redirect('/'+encodeURIComponent(target.username));
  }catch(e){next(e);}
});

app.get('/admin', requireRole('moderator'), async (req,res,next)=>{
  try {
    const search=String(req.query.q||'').trim();
    const users=(await db.query(search?`SELECT id,username,role,banned,suspended_until,premium_until,created_at FROM users WHERE LOWER(username) LIKE LOWER($1) ORDER BY id DESC LIMIT 100`:`SELECT id,username,role,banned,suspended_until,premium_until,created_at FROM users ORDER BY id DESC LIMIT 100`,search?[`%${search}%`]:[])).rows;
    const reports=(await db.query(`SELECT r.*,u.username target_username FROM reports r JOIN users u ON u.id=r.target_user_id WHERE r.status IN ('open','reviewing') ORDER BY r.created_at DESC LIMIT 50`)).rows;
    const audits=(await db.query(`SELECT a.*,u.username admin_username,t.username target_username FROM audit_logs a JOIN users u ON u.id=a.admin_user_id LEFT JOIN users t ON t.id=a.target_user_id ORDER BY a.created_at DESC LIMIT 50`)).rows;
    const userRows=users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${u.banned?'banned':u.suspended_until&&new Date(u.suspended_until)>new Date()?'suspended':'ok'}</td><td><form class="inline" method="post" action="/admin/user/${u.id}/action">${csrfField(req)}<select name="action"><option value="ban">ban</option><option value="unban">unban</option><option value="suspend24">suspend 24h</option><option value="premium24">premium 24h</option>${roleRank(req.user.role)>=2?'<option value="moderator">make moderator</option><option value="user">make user</option>':''}</select><input name="reason" placeholder="reason"><button>apply</button></form></td></tr>`).join('');
    const reportRows=reports.map(r=>`<li>#${r.id} <b>${esc(r.target_username)}</b> · ${esc(r.category)} · ${esc(r.reason)} <form class="inline" method="post" action="/admin/report/${r.id}">${csrfField(req)}<select name="status"><option>reviewing</option><option>resolved</option><option>dismissed</option></select><button>save</button></form></li>`).join('')||'<li>none</li>';
    const auditRows=audits.map(a=>`<li>${esc(a.admin_username)} → ${esc(a.action)} → ${esc(a.target_username||'-')} · ${esc(a.reason||'')}</li>`).join('')||'<li>none</li>';
    res.send(views.page(req,'Admin',`<main class="admin"><h1>admin</h1><form class="admin-search"><input name="q" value="${esc(search)}" placeholder="username"><button>search</button></form><h2>users</h2><div class="table-wrap"><table><tr><th>id</th><th>user</th><th>role</th><th>status</th><th>action</th></tr>${userRows}</table></div><h2>reports</h2><ul class="admin-list">${reportRows}</ul><h2>audit log</h2><ul class="admin-list">${auditRows}</ul>${req.user.role==='owner'?'<p><a href="/admin/settings">site settings</a></p>':''}</main>`,req.user));
  }catch(e){next(e);}
});

app.post('/admin/user/:id/action', requireRole('moderator'), async (req,res,next)=>{
  try {
    const target=await db.userById(Number(req.params.id)); if(!target||target.role==='owner') return res.sendStatus(400);
    const action=String(req.body.action||''); const reason=String(req.body.reason||'').slice(0,300);
    if(['moderator','user'].includes(action) && roleRank(req.user.role)<2) return res.sendStatus(403);
    if(action==='ban') await db.query('UPDATE users SET banned=TRUE WHERE id=$1',[target.id]);
    else if(action==='unban') await db.query('UPDATE users SET banned=FALSE,suspended_until=NULL WHERE id=$1',[target.id]);
    else if(action==='suspend24') await db.query("UPDATE users SET suspended_until=NOW()+INTERVAL '24 hours' WHERE id=$1",[target.id]);
    else if(action==='premium24') { await db.query("UPDATE users SET premium_until=GREATEST(COALESCE(premium_until,NOW()),NOW())+INTERVAL '24 hours' WHERE id=$1",[target.id]); await db.query("INSERT INTO premium_grants(user_id,source,expires_at) VALUES($1,'admin',NOW()+INTERVAL '24 hours')",[target.id]); }
    else if(action==='moderator') await db.query("UPDATE users SET role='moderator' WHERE id=$1",[target.id]);
    else if(action==='user') await db.query("UPDATE users SET role='user' WHERE id=$1",[target.id]);
    else return res.sendStatus(400);
    await db.audit(req.user.id,target.id,action,reason);
    res.redirect('/admin');
  }catch(e){next(e);}
});

app.post('/admin/report/:id', requireRole('moderator'), async (req,res,next)=>{
  try { const status=['reviewing','resolved','dismissed'].includes(req.body.status)?req.body.status:'reviewing'; await db.query(`UPDATE reports SET status=$1,resolved_at=CASE WHEN $1 IN ('resolved','dismissed') THEN NOW() ELSE NULL END WHERE id=$2`,[status,Number(req.params.id)]); await db.audit(req.user.id,null,'report_'+status,`report ${req.params.id}`); res.redirect('/admin'); } catch(e){next(e);} 
});

app.get('/admin/settings', requireRole('owner'), async (req,res,next)=>{
  try {
    const keys=['registration_enabled','maintenance_mode','rewarded_ads_enabled','rewarded_ads_required','rewarded_premium_hours']; const values={}; for(const k of keys) values[k]=await db.setting(k,null);
    res.send(views.page(req,'Site settings',`<main class="panel"><h1>site settings</h1><form method="post" class="stack">${csrfField(req)}<label><input type="checkbox" name="registration_enabled" ${values.registration_enabled?'checked':''}> registration</label><label><input type="checkbox" name="maintenance_mode" ${values.maintenance_mode?'checked':''}> maintenance</label><label><input type="checkbox" name="rewarded_ads_enabled" ${values.rewarded_ads_enabled?'checked':''}> rewarded ads</label><input type="number" min="1" max="10" name="rewarded_ads_required" value="${Number(values.rewarded_ads_required||2)}"><input type="number" min="1" max="720" name="rewarded_premium_hours" value="${Number(values.rewarded_premium_hours||24)}"><button>save</button></form></main>`,req.user));
  }catch(e){next(e);}
});
app.post('/admin/settings', requireRole('owner'), async (req,res,next)=>{
  try { const entries={registration_enabled:!!req.body.registration_enabled,maintenance_mode:!!req.body.maintenance_mode,rewarded_ads_enabled:!!req.body.rewarded_ads_enabled,rewarded_ads_required:int(req.body.rewarded_ads_required,1,10,2),rewarded_premium_hours:int(req.body.rewarded_premium_hours,1,720,24)}; for(const [k,v] of Object.entries(entries)) await db.query('INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()',[k,JSON.stringify(v)]); await db.audit(req.user.id,null,'site_settings',''); res.redirect('/admin/settings'); }catch(e){next(e);} 
});

app.post('/api/rewards/provider-callback', async (req,res,next)=>{
  try {
    if(!(await db.setting('rewarded_ads_enabled',false)) || process.env.REWARDED_ADS_ENABLED!=='true') return res.sendStatus(404);
    if(!verifyRewardSignature(req.rawBody || JSON.stringify(req.body),req.get('x-noxi-signature'))) return res.sendStatus(401);
    const username=String(req.body.username||''); const providerRef=String(req.body.reference||'').slice(0,200); if(!providerRef) return res.sendStatus(400);
    const duplicate=await db.one("SELECT id FROM premium_grants WHERE source='rewarded' AND provider_reference=$1",[providerRef]); if(duplicate) return res.json({ok:true,duplicate:true});
    const user=await db.userByUsername(username); if(!user) return res.sendStatus(404);
    const required=int(await db.setting('rewarded_ads_required',2),1,10,2); const hours=int(await db.setting('rewarded_premium_hours',24),1,720,24);
    const progress=await db.one(`INSERT INTO rewarded_ad_progress(user_id,verified_completions,last_completion_at) VALUES($1,1,NOW()) ON CONFLICT(user_id) DO UPDATE SET verified_completions=rewarded_ad_progress.verified_completions+1,last_completion_at=NOW() RETURNING *`,[user.id]);
    if(progress.verified_completions>=required){ await db.query(`UPDATE rewarded_ad_progress SET verified_completions=0,cooldown_until=NOW()+INTERVAL '1 hour' WHERE user_id=$1`,[user.id]); await db.query(`UPDATE users SET premium_until=GREATEST(COALESCE(premium_until,NOW()),NOW())+($2::text||' hours')::interval WHERE id=$1`,[user.id,hours]); await db.query(`INSERT INTO premium_grants(user_id,source,expires_at,provider_reference) VALUES($1,'rewarded',NOW()+($2::text||' hours')::interval,$3)`,[user.id,hours,providerRef]); }
    res.json({ok:true,progress:progress.verified_completions,required});
  }catch(e){next(e);}
});

function internalAllowed(req){ return process.env.NOXI_INTERNAL_API_SECRET && timingSafeEqual(req.get('x-noxi-internal-secret'),process.env.NOXI_INTERNAL_API_SECRET); }
app.get('/api/internal/user/:username', async (req,res,next)=>{ try { if(!internalAllowed(req)) return res.sendStatus(401); const u=await db.userByUsername(req.params.username); if(!u)return res.sendStatus(404); res.json({id:u.id,username:u.username,role:u.role,banned:u.banned,suspended_until:u.suspended_until,premium_until:u.premium_until,created_at:u.created_at}); }catch(e){next(e);} });
app.get('/api/internal/stats', async (req,res,next)=>{ try { if(!internalAllowed(req))return res.sendStatus(401); const users=await db.one('SELECT COUNT(*)::int n FROM users'); const profiles=await db.one('SELECT COUNT(*)::int n FROM profiles'); const reports=await db.one("SELECT COUNT(*)::int n FROM reports WHERE status IN ('open','reviewing')"); res.json({users:users.n,profiles:profiles.n,open_reports:reports.n}); }catch(e){next(e);} });
app.post('/api/internal/moderate', async (req,res,next)=>{
  try {
    if(!internalAllowed(req))return res.sendStatus(401);
    const target=await db.userByUsername(req.body.username); if(!target||target.role==='owner')return res.sendStatus(400);
    const action=String(req.body.action||''); const reason=String(req.body.reason||'').slice(0,300);
    if(action==='ban') await db.query('UPDATE users SET banned=TRUE WHERE id=$1',[target.id]);
    else if(action==='unban') await db.query('UPDATE users SET banned=FALSE,suspended_until=NULL WHERE id=$1',[target.id]);
    else if(action==='premium'){const h=int(req.body.hours,1,8760,24);await db.query(`UPDATE users SET premium_until=GREATEST(COALESCE(premium_until,NOW()),NOW())+($2::text||' hours')::interval WHERE id=$1`,[target.id,h]);await db.query(`INSERT INTO premium_grants(user_id,source,expires_at,provider_reference) VALUES($1,'admin',NOW()+($2::text||' hours')::interval,$3)`,[target.id,h,`discord:${String(req.body.actor?.discord_user_id||'unknown')}`]);}
    else return res.sendStatus(400);
    const owner=await db.userByUsername(ownerUsername); if(owner) await db.audit(owner.id,target.id,`discord_${action}`,reason,{actor:req.body.actor||{}});
    res.json({ok:true});
  }catch(e){next(e);}
});

app.get('/privacy', async (req,res,next)=>{ try{const u=await currentUser(req);res.send(views.page(req,'Privacy','<main class="panel legal"><h1>privacy</h1><p>NOXI stores account information you submit, profile content, moderation records, and basic profile-view counts needed to run the service.</p><p>Passwords are stored as hashes. Private environment secrets are not sent to profile visitors.</p><p>Do not place sensitive personal information on a public profile.</p></main>',u));}catch(e){next(e);} });
app.get('/terms', async (req,res,next)=>{ try{const u=await currentUser(req);res.send(views.page(req,'Terms','<main class="panel legal"><h1>terms</h1><p>Use NOXI lawfully. Do not use profiles for impersonation, harassment, malware, scams, or content that violates applicable law or provider rules.</p><p>Accounts and profiles may be limited or removed for abuse.</p></main>',u));}catch(e){next(e);} });

app.get('/:username', async (req,res,next)=>{
  try {
    const user=await db.userByUsername(req.params.username); if(!user) return res.status(404).send(views.page(req,'404','<main class="center"><h1>404</h1></main>',await currentUser(req)));
    if(user.banned || (user.suspended_until&&new Date(user.suspended_until)>new Date())) return res.status(404).send(views.page(req,'Unavailable','<main class="center"><h1>profile unavailable</h1></main>',await currentUser(req)));
    const bundle=await db.profileBundle(user.id); const viewer=await currentUser(req);
    const day=new Date().toISOString().slice(0,10);
    await db.tx(async client=>{ await client.query('UPDATE profiles SET views=views+1 WHERE user_id=$1',[user.id]); await client.query(`INSERT INTO daily_profile_views(user_id,viewed_on,views) VALUES($1,$2,1) ON CONFLICT(user_id,viewed_on) DO UPDATE SET views=daily_profile_views.views+1`,[user.id,day]); });
    res.send(views.profile(req,user,bundle.profile,bundle.links,bundle.socials,viewer));
  }catch(e){next(e);}
});

app.use((err,req,res,next)=>{
  console.error('[NOXI]',err);
  if(res.headersSent) return next(err);
  res.status(500).send(views.page(req,'Error','<main class="center"><h1>something went wrong</h1></main>',null));
});

module.exports = app;
