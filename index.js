require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

const OWNER_ID = '722100931164110939';
const admins = [{
  username: process.env.DEFAULT_ADMIN_USERNAME,
  password: process.env.DEFAULT_ADMIN_PASSWORD
}];
const logs = [];

let botOnline = false;
let uptimeStart = null;
let totalUptime = 0;
let totalDowntime = 0;
let lastStatusChange = Date.now();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

const renderHTML = (isAdmin = false) => {
  const status = botOnline ? '🟢 Online' : '🔴 Offline';
  const adminStats = isAdmin ? `
    <h3>Uptime/Downtime</h3>
    <p>🟢 Uptime: ${(totalUptime / 1000).toFixed(1)}s</p>
    <p>🔴 Downtime: ${(totalDowntime / 1000).toFixed(1)}s</p>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Kitty AI Admin Panel</title>
  <style>
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f0f2b, #1f1f3d);
      color: #fff;
    }
    header {
      background: #111;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .logo {
      font-size: 1.5rem;
      color: #00f2ff;
      font-weight: bold;
    }
    .hamburger {
      font-size: 1.5rem;
      cursor: pointer;
    }
    .sidebar {
      position: fixed;
      top: 0;
      left: -240px;
      width: 240px;
      height: 100%;
      background: #222;
      padding: 2rem 1rem;
      transition: left 0.3s ease;
      box-shadow: 2px 0 10px rgba(0,0,0,0.5);
      z-index: 999;
    }
    .sidebar.show { left: 0; }
    .sidebar a {
      display: block;
      color: #fff;
      margin: 1.5rem 0;
      text-decoration: none;
      font-weight: bold;
    }
    .sidebar a:hover { color: #00f2ff; }
    .login {
      max-width: 350px;
      margin: 5rem auto;
      padding: 2rem;
      background: #333;
      border-radius: 10px;
      box-shadow: 0 0 20px #0008;
    }
    input, button {
      width: 100%;
      padding: 0.75rem;
      margin: 0.6rem 0;
      border: none;
      border-radius: 5px;
    }
    input {
      background: #222;
      color: #fff;
    }
    button {
      background: #00f2ff;
      color: #000;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background: #0ff; }
    .status {
      text-align: center;
      font-size: 1.2rem;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Kitty AI</div>
    <div class="hamburger" onclick="toggleSidebar()">☰</div>
  </header>

  <div class="sidebar" id="sidebar">
    <a href="#" onclick="showLogs()">Login Requests</a>
    <a href="/logout">Logout</a>
  </div>

  <div id="content">
    ${isAdmin ? '' : `
      <div class="login">
        <form method="POST" action="/login">
          <input name="username" placeholder="Username" required />
          <input name="password" type="password" placeholder="Password" required />
          <button type="submit">Login</button>
        </form>
      </div>
    `}
    <div class="status">
      <p>Bot Status: ${status}</p>
      ${adminStats}
    </div>
  </div>

  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('show');
    }
    function showLogs() {
      fetch('/logs').then(r => r.json()).then(data => {
        const output = data.map(x => \`\${x.time} — \${x.username}\`).join('\\n');
        alert('Login Requests:\\n' + output);
      });
    }
  </script>
</body>
</html>`;
};

app.get('/', (req, res) => {
  res.send(renderHTML(req.session.admin));
});

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

app.get('/logs', (req, res) => {
  if (!req.session.admin) return res.status(403).send('Forbidden');
  res.json(logs);
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const bot = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

bot.once(Events.ClientReady, () => {
  console.log(`🤖 Bot ready: ${bot.user.tag}`);
  botOnline = true;
  uptimeStart = Date.now();
  lastStatusChange = Date.now();
});

bot.on(Events.MessageCreate, (msg) => {
  if (!msg.guild && msg.author.id === OWNER_ID) {
    const match = msg.content.match(/Username\s*\(([^)]+)\)\s*[\r\n]+Password\s*\(([^)]+)\)/i);
    if (match) {
      const [_, username, password] = match;
      if (admins.some(a => a.username === username)) {
        return msg.reply('⚠️ That username already exists.');
      }
      admins.push({ username, password });
      msg.reply(`✅ Admin ${username} created!`);
    }
  }
});

bot.on(Events.ClientUnavailable, () => {
  botOnline = false;
  const now = Date.now();
  totalUptime += now - lastStatusChange;
  lastStatusChange = now;
});

bot.on(Events.Error, () => {
  botOnline = false;
  const now = Date.now();
  totalUptime += now - lastStatusChange;
  lastStatusChange = now;
});

bot.login(process.env.DISCORD_TOKEN);
app.listen(port, () => {
  console.log(`🌐 Web running at http://localhost:${port}`);
});
