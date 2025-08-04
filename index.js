// index.js

import express from 'express';
import session from 'express-session';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://your-domain.com/auth/discord/callback';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const GUILD_ID = '1401979156727730267';
const REQUIRED_ROLE_ID = '1401983936967610409';
const OWNER_ID = '722100931164110939';

let isBotOnline = true;
let onlineSince = Date.now();
let lastDowntime = null;
let unauthorizedAttempts = [];
let customAdmins = []; // { discordId, username, password }

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
}));

// -------------------- EXPRESS ROUTES --------------------

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/bot-status', (req, res) => {
  const status = {
    online: isBotOnline,
    uptime: isBotOnline ? Date.now() - onlineSince : 0,
    downtime: !isBotOnline && lastDowntime ? Date.now() - lastDowntime : 0,
  };
  res.json(status);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const valid = (username === 'Admin' && password === 'AI_KITTY') ||
    customAdmins.find(a => a.username === username && a.password === password);

  if (valid) {
    req.session.admin = username;
    res.json({ success: true });
  } else {
    unauthorizedAttempts.push({ time: new Date(), username, password });
    res.status(401).json({ success: false });
  }
});

app.get('/unauthorized-attempts', (req, res) => {
  if (!req.session.admin) return res.sendStatus(401);
  res.json(unauthorizedAttempts);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/auth/discord', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify+guilds+guilds.members.read`;
  res.redirect(url);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        scope: 'identify guilds guilds.members.read'
      })
    });

    const token = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const user = await userResponse.json();

    const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const member = await memberRes.json();

    if (member.roles && member.roles.includes(REQUIRED_ROLE_ID)) {
      if (customAdmins.find(a => a.discordId === user.id)) {
        res.redirect('/?linked=true&status=exists');
      } else {
        const newUser = crypto.randomBytes(4).toString('hex');
        const newPass = crypto.randomBytes(3).toString('hex');
        customAdmins.push({ discordId: user.id, username: newUser, password: newPass });
        res.redirect(`/?linked=true&user=${newUser}&pass=${newPass}`);
      }
    } else {
      res.redirect('/?linked=false&error=missing_role');
    }
  } catch (e) {
    console.error('OAuth error:', e);
    res.redirect('/?linked=false&error=oauth');
  }
});

// -------------------- DISCORD BOT --------------------

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI a question')
    .addStringOption(option =>
      option.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder()
    .setName('create_acc')
    .setDescription('Create admin credentials (owner only)')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('❌ Command registration failed:', err);
  }
})();

bot.on('ready', () => {
  console.log(`🤖 Logged in as ${bot.user.tag}`);
  isBotOnline = true;
  onlineSince = Date.now();
});

bot.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;

  try {
    if (interaction.commandName === 'ask') {
      await interaction.deferReply();
      const question = interaction.options.getString('question');

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openrouter/mistral-7b-instruct',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: question }
          ]
        })
      });

      const data = await response.json();
      if (data.choices && data.choices.length > 0) {
        await interaction.editReply(data.choices[0].message.content);
      } else {
        await interaction.editReply('⚠️ No response from AI.');
      }
    }

    if (interaction.commandName === 'create_acc') {
      if (interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: 'UH oh! You don’t have permissions to run this command!', ephemeral: true });
        return;
      }
      const user = crypto.randomBytes(4).toString('hex');
      const pass = crypto.randomBytes(3).toString('hex');
      customAdmins.push({ username: user, password: pass });
      await interaction.reply({
        content: `✅ Created:\nUsername: \`${user}\`\nPassword: \`${pass}\``,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      await interaction.editReply('❌ Something went wrong.');
    } catch {}
  }
});

bot.on('error', err => {
  console.error('Bot error:', err);
  isBotOnline = false;
  lastDowntime = Date.now();
});

bot.login(DISCORD_TOKEN);

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
