// index.js import express from 'express'; import path from 'path'; import { fileURLToPath } from 'url'; import { Client, GatewayIntentBits, Partials } from 'discord.js'; import fs from 'fs'; import dotenv from 'dotenv';

dotenv.config();

const bot = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages ], partials: [Partials.Channel] // Required to receive DMs });

const ADMIN_ID = '722100931164110939'; const CREDENTIALS_FILE = './admin-credentials.json';

// Save credentials function saveAdminCredentials(username, password) { let data = {}; if (fs.existsSync(CREDENTIALS_FILE)) { data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE)); } data[username] = password; fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2)); }

bot.once('ready', () => { console.log(🤖 Logged in as ${bot.user.tag}); });

bot.on('messageCreate', async (msg) => { if (!msg.guild && msg.author.id === ADMIN_ID) { const lines = msg.content.split('\n'); const usernameLine = lines.find(l => l.startsWith('Username (')); const passwordLine = lines.find(l => l.startsWith('Password ('));

if (usernameLine && passwordLine) {
  const username = usernameLine.slice(9, -1).trim();
  const password = passwordLine.slice(9, -1).trim();

  if (!username || !password) return msg.reply('❌ Invalid format.');

  saveAdminCredentials(username, password);
  msg.reply(`✅ Admin account created for **${username}**.`);
} else {
  msg.reply('❌ Please use:

Username (yourUsername)\nPassword (yourPassword)'); } } });

bot.login(process.env.DISCORD_TOKEN);

// --- Express website --- const app = express(); const PORT = process.env.PORT || 3000; const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.get('/health', (req, res) => { res.status(200).send('OK'); });

app.listen(PORT, () => { console.log(🌐 Website is live on http://localhost:${PORT}); });

