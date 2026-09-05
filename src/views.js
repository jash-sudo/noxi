const { esc, csrfField } = require('./security');

function page(req, title, body, user = null, extraHead = '') {
  const nav = user
    ? `<a href="/dashboard">dashboard</a>${['moderator','admin','owner'].includes(user.role) ? '<a href="/admin">admin</a>' : ''}<a href="/logout">logout</a>`
    : `<a href="/login">login</a><a href="/premium">premium</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(title)} — NOXI</title><link rel="stylesheet" href="/static/style.css">${extraHead}</head><body><header><a class="brand" href="/">NOXI</a><nav>${nav}</nav></header>${body}<script src="/static/app.js" defer></script></body></html>`;
}

function home(req, user) {
  return page(req, 'Home', `<main class="home"><div class="hero-logo">NOXI</div><form action="/claim" method="get" class="claim"><div class="claim-input"><span>noxi.lol/</span><input name="username" maxlength="20" placeholder="username" autocomplete="off" spellcheck="false"></div><button>claim</button></form><div class="tiny-links"><a href="/login">login</a><a href="/premium">premium</a></div></main>`, user);
}

function auth(req, mode, preset = '', message = '') {
  const register = mode === 'register';
  const forgot = mode === 'forgot';
  const title = register ? 'create account' : forgot ? 'reset password' : 'login';
  let fields = '';
  if (register) fields = `<input name="username" value="${esc(preset)}" placeholder="username" required maxlength="20" autocomplete="username"><input type="email" name="email" placeholder="email" required autocomplete="email"><input type="password" name="password" placeholder="password" minlength="10" required autocomplete="new-password"><input name="owner_token" placeholder="owner setup token (jash only)" autocomplete="off">`;
  else if (forgot) fields = `<input type="email" name="email" placeholder="email" required autocomplete="email">`;
  else fields = `<input name="login" placeholder="username or email" required autocomplete="username"><input type="password" name="password" placeholder="password" required autocomplete="current-password">`;
  const footer = register ? `already have one? <a href="/login">login</a>` : forgot ? `<a href="/login">back to login</a>` : `<a href="/register">create account</a> · <a href="/forgot">forgot password</a>`;
  return page(req, title, `<main class="panel"><h1>${title}</h1>${message ? `<p class="notice">${esc(message)}</p>` : ''}<form method="post" action="/${mode}" class="stack">${csrfField(req)}${fields}<button>${forgot ? 'send reset link' : register ? 'create' : 'login'}</button></form><p class="muted">${footer}</p></main>`);
}

function dashboard(req, user, profile, links, socials) {
  const linkText = links.map(x => `${x.title}|${x.url}`).join('\n');
  const socialText = socials.map(x => `${x.platform}|${x.url}`).join('\n');
  const premium = user.premium_until && new Date(user.premium_until) > new Date();
  return page(req, 'Dashboard', `<main class="dashboard"><section class="dash-head"><div><h1>${esc(user.username)}</h1><p class="muted">noxi.lol/${esc(user.username)} · ${Number(profile.views || 0)} views${premium ? ' · premium' : ''}${user.role !== 'user' ? ` · ${esc(user.role)}` : ''}</p></div><a class="small-button" href="/${encodeURIComponent(user.username)}">view profile</a></section><div class="tabs"><a href="#profile">profile</a><a href="#links">links</a><a href="#style">style</a><a href="/analytics">analytics</a><a href="/account">account</a></div><form method="post" action="/dashboard" class="stack wide">${csrfField(req)}<h2 id="profile">profile</h2><input name="display_name" value="${esc(profile.display_name)}" placeholder="display name" maxlength="40"><textarea name="bio" placeholder="bio" maxlength="300">${esc(profile.bio)}</textarea><input name="avatar_url" value="${esc(profile.avatar_url)}" placeholder="avatar URL"><input name="background_url" value="${esc(profile.background_url)}" placeholder="background image/video URL"><select name="background_type"><option value="image"${profile.background_type === 'image' ? ' selected' : ''}>image</option><option value="video"${profile.background_type === 'video' ? ' selected' : ''}>video (premium)</option><option value="solid"${profile.background_type === 'solid' ? ' selected' : ''}>solid</option></select><input name="audio_url" value="${esc(profile.audio_url)}" placeholder="profile audio URL (premium)"><h2 id="links">links</h2><p class="muted">one per line: title|https://example.com</p><textarea name="links" placeholder="github|https://github.com/you">${esc(linkText)}</textarea><p class="muted">socials: platform|https://...</p><textarea name="socials" placeholder="discord|https://discord.gg/...">${esc(socialText)}</textarea><h2 id="style">style</h2><div class="grid2"><label>accent<input name="accent" value="${esc(profile.accent)}"></label><label>text<input name="text_color" value="${esc(profile.text_color)}"></label><label>font<select name="font_name"><option value="system"${profile.font_name === 'system' ? ' selected' : ''}>system</option><option value="mono"${profile.font_name === 'mono' ? ' selected' : ''}>mono</option><option value="serif"${profile.font_name === 'serif' ? ' selected' : ''}>serif</option></select></label><label>entrance<select name="entrance_animation"><option value="none"${profile.entrance_animation === 'none' ? ' selected' : ''}>none</option><option value="fade"${profile.entrance_animation === 'fade' ? ' selected' : ''}>fade</option><option value="rise"${profile.entrance_animation === 'rise' ? ' selected' : ''}>rise</option></select></label><label>opacity<input type="number" min="0" max="100" name="card_opacity" value="${Number(profile.card_opacity)}"></label><label>blur<input type="number" min="0" max="40" name="blur_amount" value="${Number(profile.blur_amount)}"></label></div><button>save</button></form><section class="upload-box"><h2>uploads</h2><p class="muted">optional Supabase Storage upload. Files stay disabled until storage secrets are configured server-side.</p><form method="post" action="/upload" enctype="multipart/form-data" class="inline-upload">${csrfField(req)}<input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,audio/mpeg,audio/ogg"><button>upload</button></form></section></main>`, user);
}

function profile(req, user, p, links, socials, viewer) {
  const video = p.background_type === 'video' && p.background_url ? `<video class="bg-video" autoplay muted loop playsinline src="${esc(p.background_url)}"></video>` : '';
  const avatar = p.avatar_url ? `<img class="avatar" src="${esc(p.avatar_url)}" alt="">` : `<div class="avatar placeholder">${esc((p.display_name || user.username).slice(0,1).toUpperCase())}</div>`;
  const socialHtml = socials.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.platform)}</a>`).join('');
  const linkHtml = links.map(l => `<a class="profile-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a>`).join('');
  const audio = p.audio_url ? `<div class="audio"><audio id="profileAudio" src="${esc(p.audio_url)}" preload="none"></audio><button type="button" data-audio-toggle>play audio</button></div>` : '';
  const report = viewer && String(viewer.id) !== String(user.id) ? `<form class="report" method="post" action="/report/${encodeURIComponent(user.username)}">${csrfField(req)}<select name="category"><option>spam</option><option>harassment</option><option>impersonation</option><option>other</option></select><input name="reason" maxlength="300" placeholder="report reason"><button>report</button></form>` : '';
  const bgStyle = p.background_type === 'image' && p.background_url ? `background-image:linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.28)),url(&quot;${esc(p.background_url)}&quot;);` : '';
  const font = p.font_name === 'mono' ? 'monospace' : p.font_name === 'serif' ? 'Georgia,serif' : 'Arial,Helvetica,sans-serif';
  const style = `${bgStyle}--accent:${esc(p.accent)};--text:${esc(p.text_color)};--opacity:${Number(p.card_opacity)/100};--blur:${Number(p.blur_amount)}px;--profile-font:${font}`;
  return page(req, user.username, `<main class="profile" style="${style}">${video}<section class="profile-card ${esc(p.entrance_animation)}">${avatar}<h1>${esc(p.display_name || user.username)}</h1><p>${esc(p.bio)}</p><div class="socials">${socialHtml}</div><div class="profile-links">${linkHtml}</div>${audio}${report}</section></main>`, viewer);
}

module.exports = { page, home, auth, dashboard, profile };
