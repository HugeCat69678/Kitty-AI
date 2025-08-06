// Required modules
import express from 'express';
import session from 'express-session';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// Setup constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Environment Variables
const {
  DISCORD_TOKEN,
  CLIENT_ID,
  BOT_GUILD_ID,
  OPENROUTER_API_KEY,
  SESSION_SECRET,
  DEFAULT_ADMIN_USERNAME,
  DEFAULT_ADMIN_PASSWORD,
  REQUIRED_ROLE_ID,
  REDIRECT_URI,
  CLIENT_SECRET
} = process.env;

// Setup session middleware
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Bot status endpoint
let botOnline = false;
app.get('/status', (req, res) => {
  res.json({ online: botOnline });
});

// Login handling
const adminAccounts = new Map();
const loginRequests = [];
adminAccounts.set(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const success = adminAccounts.get(username) === password;
  if (success) {
    req.session.authenticated = true;
    req.session.username = username;
    const timestamp = new Date().toLocaleString('sv-SE');
    loginRequests.push(`${timestamp} ${username}`);
  }
  res.json({ success });
});

app.get('/login-requests', (req, res) => {
  if (req.session.authenticated) {
    res.json(loginRequests);
  } else {
    res.status(403).send('Forbidden');
  }
});

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  botOnline = true;
});

client.on(Events.MessageCreate, async (message) => {
  if (message.channel.type === 1 && message.author.id === '722100931164110939') {
    const usernameMatch = message.content.match(/Username \(([^)]+)\)/);
    const passwordMatch = message.content.match(/Password \(([^)]+)\)/);
    if (usernameMatch && passwordMatch) {
      const username = usernameMatch[1];
      const password = passwordMatch[1];
      if (!adminAccounts.has(username)) {
        adminAccounts.set(username, password);
        message.reply(`Admin account created for ${username}`);
      } else {
        message.reply(`Username ${username} already exists.`);
      }
    }
  }
});

const askCommand = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask the AI a question')
  .addStringOption(option =>
    option.setName('question').setDescription('Your question').setRequired(true));

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mistralai/mistral-7b-instruct',
          messages: [{ role: 'user', content: question }]
        })
      });
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || 'No response';
      await interaction.reply(content);
    } catch (err) {
      console.error(err);
      await interaction.reply('Failed to get response from AI.');
    }
  }
});

(async () => {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, BOT_GUILD_ID), {
      body: [askCommand.toJSON()]
    });
    console.log('Slash command registered');
  } catch (err) {
    console.error('Error registering command:', err);
  }
})();

client.login(DISCORD_TOKEN);

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
