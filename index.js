require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

// Admin credentials and logs
const YOUR_ID = '722100931164110939';
const admins = [{ username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD }];
const logs = [];

let botOnline = false;
let lastOnline = null;
let lastOffline = null;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Serve the HTML page
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading HTML');
    const rendered = data
      .replace('{{STATUS}}', botOnline ? '🟢 Online' : '🔴 Offline')
      .replace('{{ADMIN}}', req.session.admin ? 'true' : 'false')
      .replace('{{UPTIME}}', lastOnline ? lastOnline : 'N/A')
      .replace('{{DOWNTIME}}', lastOffline ? lastOffline : 'N/A');
    res.send(rendered);
  });
});

// Handle login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const found = admins.find(a => a.username === username && a.password === password);
  if (found) {
    req.session.admin = username;
    logs.push({ username, time: new Date().toLocaleString() });
    return res.redirect('/');
  }
  res.send('Invalid credentials');
});

// Logs (protected)
app.get('/logs', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  res.json(logs);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Discord Bot Setup
const bot = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

bot.once(Events.ClientReady, () => {
  botOnline = true;
  lastOnline = new Date().toLocaleString();
  console.log(`🤖 Bot ready: ${bot.user.tag}`);
});

bot.on(Events.ShardDisconnect, () => {
  botOnline = false;
  lastOffline = new Date().toLocaleString();
  console.log('❌ Bot disconnected');
});

bot.on(Events.MessageCreate, (msg) => {
  if (!msg.guild && msg.author.id === YOUR_ID) {
    const m = msg.content.match(/Username\s*\(([^)]+)\)\s*\nPassword\s*\(([^)]+)\)/i);
    if (m) {
      const [_, username, password] = m;
      if (admins.some(a => a.username === username)) {
        return msg.reply('Username already exists.');
      }
      admins.push({ username, password });
      msg.reply(`✅ Admin ${username} created!`);
    }
  }
});

// Start everything
bot.login(process.env.DISCORD_TOKEN);
app.listen(port, () => console.log(`🌐 Web running on port ${port}`));
