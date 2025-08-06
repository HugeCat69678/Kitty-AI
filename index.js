const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// DB setup
const db = new sqlite3.Database('./admins.db', err => {
  if (err) return console.error('[DB] Connection error:', err);
  console.log('[DB] Connected to SQLite');
});
db.run("CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password TEXT)");

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.json());

// Serve landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Bot status
let botReady = false;
app.get('/status', (req, res) => {
  res.json({ online: botReady });
});

// Login attempts tracker
const loginRequests = [];

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const timestamp = new Date().toLocaleString();
  loginRequests.push(`${timestamp} ${username}`);
  console.log(`[LOGIN] Attempt by ${username} at ${timestamp}`);

  db.get("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password], (err, row) => {
    if (err) {
      console.error('[DB] Login query failed:', err);
      return res.json({ success: false });
    }

    if (row) {
      req.session.user = username;
      return res.json({ success: true });
    } else {
      return res.json({ success: false });
    }
  });
});

app.get('/login-requests', (req, res) => {
  res.json(loginRequests);
});

app.listen(PORT, () => {
  console.log(`[WEB] Server running on http://localhost:${PORT}`);
});

// Discord bot
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

bot.once('ready', () => {
  botReady = true;
  console.log(`[BOT] Logged in as ${bot.user.tag}`);
});

const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask KittyAI anything!')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('custom-acc')
    .setDescription('Create a custom admin account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Username')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('password')
        .setDescription('Password')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('[BOT] Slash commands registered.');
  } catch (err) {
    console.error('[BOT] Failed to register commands:', err);
  }
})();

bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    console.log(`[ASK] ${interaction.user.tag}: ${question}`);
    await interaction.deferReply();

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are KittyAI, a playful and purr-fectly helpful cat assistant!' },
            { role: 'user', content: question }
          ]
        })
      });

      const data = await response.json();
      console.log('[AI] Response:', data);
      const reply = data.choices?.[0]?.message?.content || 'Meow... I didn’t quite get that.';
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[AI] Error:', err);
      await interaction.editReply('Nyaa~ Something went wrong.');
    }
  }

  if (interaction.commandName === 'custom-acc') {
    if (interaction.user.id !== ADMIN_DISCORD_ID) {
      return interaction.reply({ content: 'Only my master can use this command, nya~', ephemeral: true });
    }

    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');

    db.get("SELECT * FROM admins WHERE username = ?", [username], async (err, row) => {
      if (err) {
        console.error('[DB] Lookup failed:', err);
        return interaction.reply({ content: 'Database error, nya!', ephemeral: true });
      }

      if (row) {
        return interaction.reply({ content: 'That username already exists, nya!', ephemeral: true });
      }

      db.run("INSERT INTO admins (username, password) VALUES (?, ?)", [username, password], async err => {
        if (err) {
          console.error('[DB] Insert failed:', err);
          return interaction.reply({ content: 'Failed to create account, nya!', ephemeral: true });
        }

        console.log(`[ADMIN] Created new admin: ${username}`);
        await interaction.reply({ content: 'Account created, meow~', ephemeral: true });

        try {
          const user = await bot.users.fetch(ADMIN_DISCORD_ID);
          await user.send(`🎉 New Admin Created!\nUsername: ${username}\nPassword: ${password}`);
        } catch (dmErr) {
          console.error('[DM] Failed to send DM to master:', dmErr);
        }
      });
    });
  }
});

bot.login(DISCORD_TOKEN).catch(err => {
  console.error('[BOT] Login error:', err);
});
