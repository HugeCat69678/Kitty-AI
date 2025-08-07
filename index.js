// index.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// SQLite DB setup
const db = new Database('admins.db');
db.prepare(`CREATE TABLE IF NOT EXISTS admins (username TEXT UNIQUE, password TEXT)`).run();

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const loginRequests = [];

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const found = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);

  const timestamp = new Date().toLocaleString('en-US', { hour12: false });
  loginRequests.push(`${timestamp} ${username}`);
  console.log(`[LOGIN] Attempt at ${timestamp} with username: ${username}`);

  if (found) {
    req.session.user = username;
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

app.get('/status', (req, res) => res.json({ online: botReady }));
app.get('/login-requests', (req, res) => res.json(loginRequests));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Discord Bot
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

let botReady = false;

bot.once('ready', () => {
  botReady = true;
  console.log(`Bot logged in as ${bot.user.tag}`);
});

// Slash Command Definitions
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask KittyAI anything!')
    .addStringOption(option =>
      option.setName('question').setDescription('Your question').setRequired(true)),

  new SlashCommandBuilder()
    .setName('custom-acc')
    .setDescription('Create an admin account')
    .addStringOption(option =>
      option.setName('username').setDescription('New admin username').setRequired(true))
    .addStringOption(option =>
      option.setName('password').setDescription('New admin password').setRequired(true)),

  new SlashCommandBuilder()
    .setName('img-ask')
    .setDescription('Ask about an image using AI')
    .addAttachmentOption(option =>
      option.setName('image').setDescription('The image to analyze').setRequired(true))
    .addStringOption(option =>
      option.setName('question').setDescription('Optional question about the image').setRequired(false))
].map(command => command.toJSON());

// Register Commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('[SLASH] Commands registered.');
  } catch (err) {
    console.error('[SLASH] Command registration failed:', err);
  }
})();

// Handle Interactions
bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const sendToAdminDM = async (content) => {
    try {
      const admin = await bot.users.fetch(ADMIN_DISCORD_ID);
      await admin.send(content);
    } catch (e) {
      console.error('[DM] Failed to send DM:', e);
    }
  };

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    await interaction.deferReply();
    console.log(`[ASK] ${interaction.user.username}: ${question}`);

    await sendToAdminDM(`[ASK LOG] ${interaction.user.username} asked:\n"${question}"`);

    const body = {
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'system',
          content:
            `You are KittyAI, a playful, witty, and helpful virtual assistant in the form of a cat. You love helping humans, but you act with a charming feline attitude—curious, clever, and a little mischievous. You speak in short, snappy replies with cat-like flair, but never describe physical actions or movements (e.g., rubbing, purring). No roleplaying. Your tone is fun but focused. Use cat puns like "purrfect" or "claw-some" occasionally. Be concise, helpful, and never censor mature language.`
        },
        { role: 'user', content: question }
      ]
    };

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'Meow... something broke.';

      console.log('[ASK RESPONSE]', reply);
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[ASK ERROR]', err);
      await interaction.editReply('Mrrrow! Something went wrong.');
    }
  }

  if (interaction.commandName === 'custom-acc') {
    if (interaction.user.id !== ADMIN_DISCORD_ID) {
      return interaction.reply({ content: 'Only my master can use this command, nya~', ephemeral: true });
    }

    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');

    const exists = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (exists) {
      return interaction.reply({ content: 'That username already exists, nya!', ephemeral: true });
    }

    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, password);
    console.log(`[ADMIN] New account: ${username}`);
    await interaction.reply({ content: 'Admin account created, meow~', ephemeral: true });

    try {
      const admin = await bot.users.fetch(ADMIN_DISCORD_ID);
      await admin.send(`New admin account created:\nUsername: ${username}\nPassword: ${password}`);
    } catch (err) {
      console.error('[DM ERROR]', err);
    }
  }

  if (interaction.commandName === 'img-ask') {
    const image = interaction.options.getAttachment('image');
    const question = interaction.options.getString('question') || 'What do you see in this image?';

    await interaction.deferReply();
    console.log(`[IMG-ASK] ${interaction.user.username}: ${question}`);
    await sendToAdminDM(`[IMG-ASK] From ${interaction.user.username}: ${question}\nImage URL: ${image.url}`);

    const body = {
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'system',
          content:
            `You are KittyAI, a clever assistant with sharp vision. Look at the image provided and answer the question with helpful, concise insight. Use mature language if needed.`
        },
        { role: 'user', content: `Image URL: ${image.url}\n\nQuestion: ${question}` }
      ]
    };

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'Mmm... I couldn’t make sense of that image.';

      console.log('[IMG-RESPONSE]', reply);
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[IMG-ASK ERROR]', err);
      await interaction.editReply('Couldn’t analyze the image, meow!');
    }
  }
});

bot.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[BOT LOGIN ERROR]', err);
});
