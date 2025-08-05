require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;
const YOUR_ID = '722100931164110939';

let botStatus = 'Offline 🔴';
let uptimeStart = null;
let totalDowntime = 0;
let downtimeStart = Date.now();

// Admins and login logs
const admins = [{ username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD }];
const logs = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Serve static files (index.html)
app.get('/', (req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error loading page');
    html = html.replace('{{BOT_STATUS}}', botStatus);

    if (req.session.admin) {
      const uptime = uptimeStart ? `${Math.floor((Date.now() - uptimeStart) / 1000)}s` : '0s';
      const downtime = `${Math.floor(totalDowntime / 1000)}s`;
      html = html.replace('{{EXTRA_PANEL}}', `
        <div class="panel">
          <h3>Uptime: ${uptime}</h3>
          <h3>Downtime: ${downtime}</h3>
        </div>
        <script>
          document.querySelector('.sidebar').classList.add('show');
        </script>
      `);
    } else {
      html = html.replace('{{EXTRA_PANEL}}', '');
    }

    res.send(html);
  });
});

// Login POST
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const found = admins.find(a => a.username === username && a.password === password);
  if (found) {
    req.session.admin = username;
    logs.push({ username, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    return res.redirect('/');
  }
  res.send('Invalid credentials');
});

// Login logs
app.get('/logs', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  res.json(logs);
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Discord Bot
const bot = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

bot.once(Events.ClientReady, () => {
  console.log(`🤖 Bot ready: ${bot.user.tag}`);
  botStatus = 'Online 🟢';
  uptimeStart = Date.now();

  // Calculate downtime if any
  if (downtimeStart) {
    totalDowntime += Date.now() - downtimeStart;
    downtimeStart = null;
  }
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

bot.on(Events.ShardDisconnect, () => {
  botStatus = 'Offline 🔴';
  downtimeStart = Date.now();
});

bot.on(Events.ShardReconnecting, () => {
  botStatus = 'Connecting 🟡';
});

bot.on(Events.ShardResume, () => {
  botStatus = 'Online 🟢';
  if (downtimeStart) {
    totalDowntime += Date.now() - downtimeStart;
    downtimeStart = null;
  }
});

bot.login(process.env.DISCORD_TOKEN);
app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});
