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

// Database setup
const db = new Database('./admins.db');
db.prepare(`CREATE TABLE IF NOT EXISTS admins (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
)`).run();

const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get().count;
if (adminCount === 0) {
  db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(
    process.env.DEFAULT_ADMIN_USERNAME || 'Admin',
    process.env.DEFAULT_ADMIN_PASSWORD || 'AI_KITTY'
  );
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

// Login request tracking
const loginRequests = [];

app.get('/status', (req, res) => {
  res.json({ online: botReady });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const found = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);

  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  loginRequests.push(`${timestamp} ${username}`);
  console.log(`[LOGIN] Attempt at ${timestamp} with username: ${username}`);

  if (found) {
    req.session.user = username;
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

app.get('/login-requests', (req, res) => {
  res.json(loginRequests);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Discord bot setup
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

let botReady = false;
const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

bot.once('ready', () => {
  botReady = true;
  console.log(`Bot logged in as ${bot.user.tag}`);
});

// Slash commands
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
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('admin-list')
    .setDescription('List all admin usernames')
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Error registering slash commands:', err);
  }
})();

bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    console.log(`[SLASH] /ask received: ${question}`);
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
      const reply = data.choices?.[0]?.message?.content || 'Meow... I didn’t quite get that.';
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[AI] Error while calling OpenRouter:', err);
      await interaction.editReply('Nyaa~ Something went wrong, sorry!');
    }
  }

  if (interaction.commandName === 'custom-acc') {
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
    console.log(`[ADMIN] New admin account created: ${username}`);
    await interaction.reply({ content: 'Admin account created, meow~', ephemeral: true });

    try {
      const user = await bot.users.fetch(ADMIN_DISCORD_ID);
      await user.send(`New admin created:\nUsername: ${username}\nPassword: ${password}`);
    } catch (err) {
      console.error('[DM] Failed to send DM to admin:', err);
    }
  }

  if (interaction.commandName === 'admin-list') {
    if (interaction.user.id !== ADMIN_DISCORD_ID) {
      return interaction.reply({ content: 'Access denied, nya~', ephemeral: true });
    }

    const rows = db.prepare('SELECT username FROM admins').all();
    const list = rows.map(r => r.username).join('\n') || 'No admins yet.';
    await interaction.reply({ content: `Current admins:\n\`\`\`\n${list}\n\`\`\``, ephemeral: true });
  }
});

bot.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[BOT] Login failed:', err);
});
