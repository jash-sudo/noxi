require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiBase = (process.env.NOXI_INTERNAL_API_URL || 'http://127.0.0.1:3000').replace(/\/$/,'');
const apiSecret = process.env.NOXI_INTERNAL_API_SECRET || '';

if (!token || !clientId || !guildId || !apiSecret) {
  console.error('Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, or NOXI_INTERNAL_API_SECRET.');
  process.exit(1);
}

const username = o => o.setName('username').setDescription('NOXI username').setRequired(true);
const reason = o => o.setName('reason').setDescription('Reason').setRequired(true);

const commands = [
  new SlashCommandBuilder().setName('noxi-user').setDescription('Look up a NOXI user').addStringOption(username),
  new SlashCommandBuilder().setName('noxi-ban').setDescription('Ban a NOXI user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(username).addStringOption(reason),
  new SlashCommandBuilder().setName('noxi-unban').setDescription('Unban a NOXI user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(username),
  new SlashCommandBuilder().setName('noxi-suspend').setDescription('Suspend a NOXI user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(username).addIntegerOption(o=>o.setName('hours').setDescription('Hours').setMinValue(1).setMaxValue(720).setRequired(true)).addStringOption(reason),
  new SlashCommandBuilder().setName('noxi-premium').setDescription('Grant temporary Premium').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(username).addIntegerOption(o=>o.setName('hours').setDescription('Hours').setMinValue(1).setMaxValue(8760).setRequired(true)),
  new SlashCommandBuilder().setName('noxi-remove-premium').setDescription('Remove temporary Premium').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(username).addStringOption(reason),
  new SlashCommandBuilder().setName('noxi-moderator').setDescription('Set or remove NOXI moderator').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(username).addBooleanOption(o=>o.setName('enabled').setDescription('Moderator enabled').setRequired(true)).addStringOption(reason),
  new SlashCommandBuilder().setName('noxi-stats').setDescription('Show NOXI stats').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
].map(c=>c.toJSON());

async function api(path, method='GET', body) {
  const res = await fetch(apiBase + path, {
    method,
    headers: {'content-type':'application/json','x-noxi-internal-secret':apiSecret},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { error:text || res.statusText }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const client = new Client({ intents:[GatewayIntentBits.Guilds] });
client.once('ready', ()=>console.log(`[NOXI] bot online as ${client.user.tag}`));
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ephemeral:true});
  try {
    const name = interaction.commandName;
    const actor = {discord_user_id:interaction.user.id, discord_username:interaction.user.username};
    const target = interaction.options.getString('username');
    if (name === 'noxi-user') {
      const u = await api('/api/internal/user/' + encodeURIComponent(target));
      return interaction.editReply(`@${u.username} | role: ${u.role} | banned: ${u.banned ? 'yes':'no'} | suspended until: ${u.suspended_until || 'none'} | premium until: ${u.premium_until || 'none'}`);
    }
    if (name === 'noxi-ban') {
      await api('/api/internal/moderate','POST',{action:'ban',username:target,reason:interaction.options.getString('reason'),actor});
      return interaction.editReply('User banned.');
    }
    if (name === 'noxi-unban') {
      await api('/api/internal/moderate','POST',{action:'unban',username:target,reason:'Discord command',actor});
      return interaction.editReply('User unbanned.');
    }
    if (name === 'noxi-suspend') {
      await api('/api/internal/suspend','POST',{username:target,hours:interaction.options.getInteger('hours'),reason:interaction.options.getString('reason'),actor});
      return interaction.editReply('User suspended.');
    }
    if (name === 'noxi-premium') {
      await api('/api/internal/moderate','POST',{action:'premium',username:target,hours:interaction.options.getInteger('hours'),reason:'Discord command',actor});
      return interaction.editReply('Premium granted.');
    }
    if (name === 'noxi-remove-premium') {
      await api('/api/internal/remove-premium','POST',{username:target,reason:interaction.options.getString('reason'),actor});
      return interaction.editReply('Premium removed.');
    }
    if (name === 'noxi-moderator') {
      const enabled = interaction.options.getBoolean('enabled');
      await api('/api/internal/role','POST',{username:target,role:enabled?'moderator':'user',reason:interaction.options.getString('reason'),actor});
      return interaction.editReply(enabled ? 'Moderator granted.' : 'Moderator removed.');
    }
    if (name === 'noxi-stats') {
      const s = await api('/api/internal/stats');
      return interaction.editReply(`users: ${s.users} | profiles: ${s.profiles} | open reports: ${s.open_reports}`);
    }
  } catch (err) {
    return interaction.editReply(`NOXI error: ${String(err.message).slice(0,180)}`);
  }
});

(async()=>{
  const rest = new REST({version:'10'}).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId,guildId),{body:commands});
  await client.login(token);
})().catch(error=>{
  console.error('[NOXI] bot failed:',error);
  process.exit(1);
});
