// Required modules
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database
const db = new Database('database.db');
db.prepare(`CREATE TABLE IF NOT EXISTS admins (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
)`).run();

// Ensure default admin exists
const defaultUser = process.env.DEFAULT_ADMIN_USERNAME || 'Admin';
const defaultPass = process.env.DEFAULT_ADMIN_PASSWORD || 'AI_KITTY';
const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(defaultUser);
if (!existing) {
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(defaultUser, defaultPass);
  console.log(`[DB] Default admin created: ${defaultUser}`);
}

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));
app.use(bodyParser.json());

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Login route
const loginRequests = [];

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const found = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);

  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  loginRequests.push(`${timestamp} ${username}`);
  console.log(`[LOGIN] Attempt at ${timestamp} with username: ${username}`);

  if (found) {
    req.session.user = username;
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.get('/login-requests', (req, res) => {
  res.json(loginRequests);
});

app.get('/status', (req, res) => {
  res.json({ online: botReady });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Discord Bot
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

let botReady = false;
const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the KittyAI something!')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('custom-acc')
    .setDescription('Create a custom admin account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('New admin username')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('password')
        .setDescription('New admin password')
        .setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('[DISCORD] Slash commands registered.');
  } catch (err) {
    console.error('[DISCORD] Slash command registration failed:', err);
  }
})();

bot.once('ready', () => {
  botReady = true;
  console.log(`Bot logged in as ${bot.user.tag}`);
});

bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // /ask command
  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    console.log(`[ASK] Received: ${question}`);
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
      console.error('[AI] OpenRouter error:', err);
      await interaction.editReply('Nyaa~ Something went wrong!');
    }
  }

  // /custom-acc command
  if (interaction.commandName === 'custom-acc') {
    console.log(`[ADMIN] ${interaction.user.tag} (${interaction.user.id}) tried to create account`);
    if (interaction.user.id !== ADMIN_DISCORD_ID) {
      return interaction.reply({ content: 'Only my master can use this command, nya~', ephemeral: true });
    }

    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    const existing = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

    if (existing) {
      return interaction.reply({ content: 'That username already exists, nya!', ephemeral: true });
    }

    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, password);
    console.log(`[ADMIN] Created account: ${username}`);

    await interaction.reply({ content: 'Admin account created, meow~', ephemeral: true });

    try {
      const user = await bot.users.fetch(ADMIN_DISCORD_ID);
      await user.send(`New admin created:\nUsername: ${username}\nPassword: ${password}`);
    } catch (err) {
      console.error('[DM] Failed to send DM:', err);
    }
  }
});

bot.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[BOT] Login failed:', err);
});
