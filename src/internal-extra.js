const express = require('express');
const db = require('./db');
const { int, timingSafeEqual } = require('./security');

const router = express.Router();

function allowed(req) {
  return Boolean(process.env.NOXI_INTERNAL_API_SECRET) && timingSafeEqual(req.get('x-noxi-internal-secret'), process.env.NOXI_INTERNAL_API_SECRET);
}

async function owner() {
  return db.userByUsername(process.env.OWNER_USERNAME || 'jash');
}

router.use((req,res,next)=> allowed(req) ? next() : res.sendStatus(401));

router.post('/suspend', async (req,res,next)=>{
  try {
    const target = await db.userByUsername(String(req.body.username || ''));
    if (!target || target.role === 'owner') return res.sendStatus(400);
    const hours = int(req.body.hours, 1, 720, 24);
    const reason = String(req.body.reason || '').slice(0,300);
    await db.query("UPDATE users SET suspended_until=NOW()+($2::text||' hours')::interval WHERE id=$1", [target.id, hours]);
    const actor = await owner();
    if (actor) await db.audit(actor.id,target.id,'discord_suspend',reason,{hours,actor:req.body.actor||{}});
    res.json({ok:true,hours});
  } catch(e){ next(e); }
});

router.post('/remove-premium', async (req,res,next)=>{
  try {
    const target = await db.userByUsername(String(req.body.username || ''));
    if (!target || target.role === 'owner') return res.sendStatus(400);
    const reason = String(req.body.reason || '').slice(0,300);
    await db.query('UPDATE users SET premium_until=NULL WHERE id=$1',[target.id]);
    const actor = await owner();
    if (actor) await db.audit(actor.id,target.id,'discord_remove_premium',reason,{actor:req.body.actor||{}});
    res.json({ok:true});
  } catch(e){ next(e); }
});

router.post('/role', async (req,res,next)=>{
  try {
    const target = await db.userByUsername(String(req.body.username || ''));
    if (!target || target.role === 'owner') return res.sendStatus(400);
    const role = String(req.body.role || '');
    if (!['user','moderator'].includes(role)) return res.sendStatus(400);
    await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,target.id]);
    const actor = await owner();
    if (actor) await db.audit(actor.id,target.id,'discord_role',String(req.body.reason||'').slice(0,300),{role,actor:req.body.actor||{}});
    res.json({ok:true,role});
  } catch(e){ next(e); }
});

router.use((err,req,res,next)=>{
  console.error('[NOXI internal-extra]',err);
  res.status(500).json({error:'internal error'});
});

module.exports = router;
