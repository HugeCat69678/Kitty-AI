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

  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  loginRequests.push(`${timestamp} ${username}`);

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
            { role: 'system', content: 'You are a helpful assistant... with a cat-tastic purr-sonality!' },
            { role: 'user', content: question }
          ]
        })
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'Meow... I didn’t quite get that.';
      await interaction.editReply(reply);
    } catch (err) {
      console.error(err);
      await interaction.editReply('Nyaa~ Something went wrong, sorry!');
    }
  }
});

// DM-based admin account creation
bot.on('messageCreate', msg => {
  if (!msg.guild && msg.author.id === ADMIN_DISCORD_ID) {
    const match = msg.content.match(/^!u\s*\(([^)]+)\)\s*p\s*\(([^)]+)\)/);
    if (match) {
      const username = match[1].trim();
      const password = match[2].trim();
      const admins = JSON.parse(fs.readFileSync('admins.json', 'utf-8'));

      if (admins.find(u => u.username === username)) {
        return msg.reply('That username already exists.');
      }

      admins.push({ username, password });
      fs.writeFileSync('admins.json', JSON.stringify(admins, null, 2));
      msg.reply('Created!');
    }
  }
});

bot.login(process.env.DISCORD_TOKEN);
