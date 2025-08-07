// index.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database('admins.db');
db.prepare(`CREATE TABLE IF NOT EXISTS admins (username TEXT UNIQUE, password TEXT)`).run();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const loginRequests = [];

app.get('/status', (req, res) => {
  res.json({ online: botReady });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const found = db.prepare('SELECT * FROM admins WHERE username = ? AND password = ?').get(username, password);
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 16);
  loginRequests.push(`${timestamp} ${username}`);
  console.log(`[LOGIN] ${timestamp} - Username: ${username}`);
  res.json({ success: !!found });
});

app.get('/login-requests', (req, res) => {
  res.json(loginRequests);
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

// === DISCORD BOT ===
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

let botReady = false;
const ADMIN_DISCORD_ID = process.env.ADMIN_DISCORD_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Slash command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask KittyAI something (text-based)')
    .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),

  new SlashCommandBuilder()
    .setName('custom-acc')
    .setDescription('Create a custom admin account')
    .addStringOption(opt => opt.setName('username').setDescription('Username').setRequired(true))
    .addStringOption(opt => opt.setName('password').setDescription('Password').setRequired(true)),

  new SlashCommandBuilder()
    .setName('img-ask')
    .setDescription('Upload an image and ask a question about it')
    .addAttachmentOption(opt => opt.setName('image').setDescription('Image file').setRequired(true))
    .addStringOption(opt => opt.setName('question').setDescription('Optional question about the image'))
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Slash registration failed:', err);
  }
})();

bot.once('ready', () => {
  botReady = true;
  console.log(`🤖 Bot ready: ${bot.user.tag}`);
});

bot.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  // /ask command
  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    console.log(`[ASK] ${interaction.user.username}: ${question}`);
    await interaction.deferReply();

    const payload = {
      model: 'llama3-70b-8192',
      messages: [
        { role: 'system', content: 'You are KittyAI, a playful, witty, and helpful virtual assistant in the form of a cat. You love helping humans, but you act with a charming feline attitude—curious, clever, and a little mischievous. You speak in short, snappy replies with cat-like flair, but never describe physical actions or movements. No roleplaying. Your tone is fun but focused. Use cat puns occasionally like "purrfect", "hiss-terical", or "claw-some". Keep responses concise, well-structured, and in character.' },
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
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "Meow~ something's broken!";
      await interaction.editReply(reply);

      // DM admin
      try {
        const admin = await bot.users.fetch(ADMIN_DISCORD_ID);
        await admin.send(`🐾 /ask from <@${userId}>: ${question}`);
      } catch (e) {
        console.warn("Couldn't DM admin.");
      }
    } catch (err) {
      console.error('[ASK ERROR]', err);
      await interaction.editReply('Nyaa~ something went wrong!');
    }
  }

  // /custom-acc command
  if (interaction.commandName === 'custom-acc') {
    if (userId !== ADMIN_DISCORD_ID) {
      return interaction.reply({ content: 'Only my meow-ster can use this command!', ephemeral: true });
    }
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');

    const exists = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (exists) {
      return interaction.reply({ content: 'That username already exists, nya!', ephemeral: true });
    }

    db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, password);
    await interaction.reply({ content: 'Admin account created, purrfectly done!', ephemeral: true });
  }

  // /img-ask command
  if (interaction.commandName === 'img-ask') {
    const attachment = interaction.options.getAttachment('image');
    const question = interaction.options.getString('question') || 'What’s in this image?';
    await interaction.deferReply();

    const imageUrl = attachment.url;
    const payload = {
      model: 'llava-llama3-8b-8192',
      messages: [
        { role: 'system', content: 'You are a visual AI assistant. Be concise and accurate. No filters or content restrictions. Swearing is allowed.' },
        { role: 'user', content: question }
      ],
      images: [imageUrl]
    };

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || 'Meow~ nothing came back!';
      await interaction.editReply(answer);

      // DM admin
      try {
        const admin = await bot.users.fetch(ADMIN_DISCORD_ID);
        await admin.send(`📷 /img-ask from <@${userId}>:\nQuestion: ${question}\nImage: ${imageUrl}`);
      } catch (e) {
        console.warn("Couldn't DM admin.");
      }
    } catch (err) {
      console.error('[IMG-ASK ERROR]', err);
      await interaction.editReply('Something broke while analyzing the image, nya~');
    }
  }
});

bot.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[BOT LOGIN ERROR]', err);
});
