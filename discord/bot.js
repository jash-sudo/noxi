require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const apiBase = process.env.NOXI_INTERNAL_API_URL || 'http://127.0.0.1:3000';
const apiSecret = process.env.NOXI_INTERNAL_API_SECRET || '';

if (!token || !clientId || !guildId || !apiSecret) {
  console.error('Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, or NOXI_INTERNAL_API_SECRET.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('noxi-user').setDescription('Look up a NOXI user').addStringOption(o=>o.setName('username').setDescription('NOXI username').setRequired(true)),
  new SlashCommandBuilder().setName('noxi-ban').setDescription('Ban a NOXI user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(o=>o.setName('username').setDescription('NOXI username').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('noxi-unban').setDescription('Unban a NOXI user').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addStringOption(o=>o.setName('username').setDescription('NOXI username').setRequired(true)),
  new SlashCommandBuilder().setName('noxi-premium').setDescription('Grant temporary Premium').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addStringOption(o=>o.setName('username').setDescription('NOXI username').setRequired(true)).addIntegerOption(o=>o.setName('hours').setDescription('Hours').setMinValue(1).setMaxValue(8760).setRequired(true)),
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

client.on('ready', ()=>console.log(`NOXI bot online as ${client.user.tag}`));
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ephemeral:true});
  try {
    const name = interaction.commandName;
    const actor = {discord_user_id:interaction.user.id, discord_username:interaction.user.username};
    if (name === 'noxi-user') {
      const u = await api('/api/internal/user/' + encodeURIComponent(interaction.options.getString('username')));
      return interaction.editReply(`@${u.username} | role: ${u.role} | banned: ${u.banned ? 'yes':'no'} | premium until: ${u.premium_until || 'none'}`);
    }
    if (name === 'noxi-ban') {
      await api('/api/internal/moderate','POST',{action:'ban',username:interaction.options.getString('username'),reason:interaction.options.getString('reason'),actor});
      return interaction.editReply('User banned.');
    }
    if (name === 'noxi-unban') {
      await api('/api/internal/moderate','POST',{action:'unban',username:interaction.options.getString('username'),reason:'Discord command',actor});
      return interaction.editReply('User unbanned.');
    }
    if (name === 'noxi-premium') {
      await api('/api/internal/moderate','POST',{action:'premium',username:interaction.options.getString('username'),hours:interaction.options.getInteger('hours'),reason:'Discord command',actor});
      return interaction.editReply('Premium granted.');
    }
    if (name === 'noxi-stats') {
      const s = await api('/api/internal/stats');
      return interaction.editReply(`users: ${s.users} | profiles: ${s.profiles} | open reports: ${s.open_reports}`);
    }
  } catch (err) {
    interaction.editReply(`NOXI error: ${String(err.message).slice(0,180)}`);
  }
});

(async()=>{
  const rest = new REST({version:'10'}).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId,guildId),{body:commands});
  await client.login(token);
})();
