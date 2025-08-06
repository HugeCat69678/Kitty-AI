// Required modules
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, Events } = require('discord.js');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Track login attempts
const loginRequests = [];

app.get('/status', (req, res) => {
  res.json({ online: botReady });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admins = JSON.parse(fs.readFileSync('admins.json', 'utf-8'));
  const found = admins.find(u => u.username === username && u.password === password);

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

// Start server
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
        .setRequired(true))
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
      console.log('[AI] Response received:', data);
      const reply = data.choices?.[0]?.message?.content || 'Meow... I didn’t quite get that.';
      await interaction.editReply(reply);
    } catch (err) {
      console.error('[AI] Error while calling OpenRouter:', err);
      await interaction.editReply('Nyaa~ Something went wrong, sorry!');
    }
  }
});

// DM-based admin account creation
bot.on('messageCreate', msg => {
  if (!msg.guild && msg.author.id === ADMIN_DISCORD_ID) {
    console.log('[DM] Message from admin:', msg.content);
    const match = msg.content.match(/^!u\s*\(([^)]+)\)\s*p\s*\(([^)]+)\)/);
    if (match) {
      const username = match[1].trim();
      const password = match[2].trim();
      const admins = JSON.parse(fs.readFileSync('admins.json', 'utf-8'));

      if (admins.find(u => u.username === username)) {
        msg.reply('That username already exists.');
        return;
      }

      admins.push({ username, password });
      fs.writeFileSync('admins.json', JSON.stringify(admins, null, 2));
      console.log(`[ADMIN] New admin account created: ${username}`);
      msg.reply('Created!');
    } else {
      console.log('[DM] Invalid format.');
    }
  }
});

bot.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('[BOT] Login failed:', err);
});
