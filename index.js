// index.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const betterSqlite3 = require('better-sqlite3');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Partials } = require('discord.js');

// === CONFIG ===
const app = express();
const db = betterSqlite3('admin.db');
const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.BOT_GUILD_ID;
const MASTER_DISCORD_ID = '722100931164110939';

// === DB INIT ===
db.prepare(`CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`).run();

// === MIDDLEWARE ===
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: true }));

// === STATIC FILE ===
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === LOGIN (POST) ===
app.post('/login', (req, res) => {
  console.log('[POST /login] Body:', req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    console.log('Missing username or password');
    return res.json({ success: false });
  }

  const user = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);
  if (user) {
    req.session.authenticated = true;
    req.session.username = username;
    console.log(`Login successful for user: ${username}`);
    res.json({ success: true });
  } else {
    console.log(`Login failed for user: ${username}`);
    res.json({ success: false });
  }
});

// === LOGIN (GET) ===
app.get('/login', (req, res) => {
  console.log('[GET /login] User redirected to login');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// === DASHBOARD ===
app.get('/dashboard', (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  res.send(`<h1>Welcome, ${req.session.username}</h1>`);
});

// === DISCORD BOT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('custom-acc')
      .setDescription('Create a custom admin account')
      .addStringOption(opt => opt.setName('username').setDescription('The username').setRequired(true))
      .addStringOption(opt => opt.setName('password').setDescription('The password').setRequired(true))
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Slash commands registered');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'custom-acc') {
    console.log(`[Slash] /custom-acc invoked by ${interaction.user.id}`);
    if (interaction.user.id !== MASTER_DISCORD_ID) {
      await interaction.reply({ content: 'Only my master can use this command, nya~', ephemeral: true });
      return;
    }

    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    try {
      db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, password);
      await interaction.reply({ content: `Account created for \`${username}\``, ephemeral: true });
      await interaction.user.send(`New admin account created:
Username: \`${username}\`
Password: \`${password}\``);
      console.log(`Admin account created for ${username}`);
    } catch (err) {
      console.error('DB error:', err);
      await interaction.reply({ content: 'That username already exists or there was a DB error.', ephemeral: true });
    }
  }
});

client.login(DISCORD_TOKEN);

// === START SERVER ===
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
