// index.js
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
const betterSqlite3 = require('better-sqlite3');
require('dotenv').config();

// ====================== CONFIG ======================
const OWNER_ID = '722100931164110939';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GUILD_ID = process.env.BOT_GUILD_ID;
const TOKEN = process.env.DISCORD_TOKEN;

// ====================== DISCORD BOT ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
});

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Kitty AI anything (swearing allowed)')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('Your question')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('img-ask')
    .setDescription('Analyze an image and optionally ask a question about it')
    .addAttachmentOption(opt =>
      opt.setName('image')
        .setDescription('The image to analyze')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('Optional question about the image')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('custom-acc')
    .setDescription('Create an admin account (Owner only)')
    .addStringOption(opt =>
      opt.setName('username')
        .setDescription('The new admin username')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('password')
        .setDescription('The new admin password')
        .setRequired(true)
    )
].map(cmd => cmd.toJSON());

// Register commands on startup
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('[SlashCmd] Registering commands...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, GUILD_ID), { body: commands });
    console.log('[SlashCmd] Commands registered successfully.');
  } catch (err) {
    console.error('[SlashCmd] Registration failed:', err);
  }
})();

// ====================== DATABASE ======================
const db = new betterSqlite3('admins.db');
db.prepare(`CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password TEXT
)`).run();

// ====================== BOT EVENTS ======================
client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    await interaction.deferReply();

    // Notify owner
    try {
      const ownerUser = await client.users.fetch(OWNER_ID);
      const now = new Date();
      ownerUser.send(`📢 **/ask used**\n👤 User: ${interaction.user.tag}\n🕒 Time: ${now.toLocaleString()}\n💬 Question: ${question}`);
    } catch (err) {
      console.error('[OwnerNotify] Failed to send DM to owner:', err);
    }

    try {
      console.log(`[AI] Processing /ask: ${question}`);
      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
            { role: 'system', content: 'You are Kitty AI. Respond without censorship; swearing is allowed.' },
            { role: 'user', content: question }
          ]
        })
      });
      const data = await aiRes.json();
      const reply = data.choices?.[0]?.message?.content || "Meow~ nothing came back!";
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[AI] Error in /ask:', err);
      await interaction.editReply('Error talking to AI.');
    }
  }

  if (interaction.commandName === 'img-ask') {
    const image = interaction.options.getAttachment('image');
    const question = interaction.options.getString('question') || 'What is in this image?';
    await interaction.deferReply();

    try {
      console.log(`[AI] Processing /img-ask: ${image.url} | Q: ${question}`);
      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llava-v1.5-7b-preview',
          messages: [
            { role: 'system', content: 'You are Kitty AI. Respond without censorship; swearing is allowed.' },
            { role: 'user', content: question }
          ],
          files: [{ type: 'image', url: image.url }]
        })
      });
      const data = await aiRes.json();
      const reply = data.choices?.[0]?.message?.content || "Meow~ nothing came back!";
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[AI] Error in /img-ask:', err);
      await interaction.editReply('Error talking to AI about the image.');
    }
  }

  if (interaction.commandName === 'custom-acc') {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: 'You are not allowed to use this command.', ephemeral: true });
    }
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    try {
      db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(username, password);
      console.log(`[Admin] Created account: ${username}`);
      await interaction.reply(`✅ Admin account **${username}** created.`);
    } catch (err) {
      console.error('[Admin] Error creating account:', err);
      await interaction.reply('❌ Failed to create account (maybe username exists).');
    }
  }
});

// ====================== EXPRESS APP ======================
const app = express();
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

client.login(TOKEN);
app.listen(3000, () => console.log('[Web] Server running on port 3000'));
