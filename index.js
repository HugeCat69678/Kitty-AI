require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express();
const port = process.env.PORT || 3000;

// Your Discord ID
const YOUR_ID = '722100931164110939';

// Admin storage and login logs
const admins = [{ username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD }];
const logs = [];

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Futuristic HTML page
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Kitty AI Admin Panel</title>
  <style>
    body {
      margin: 0; font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f0f2b, #1f1f3d);
      color: #fff; overflow-x: hidden;
    }
    header {
      background: #111; padding: 1rem 2rem;
      display: flex; justify-content: space-between; align-items: center;
    }
    .logo { font-size: 1.5rem; color: #00f2ff; font-weight: bold; }
    .hamburger { font-size: 1.5rem; cursor: pointer; user-select: none; }
    .sidebar {
      position: fixed; top: 0; left: -240px;
      width: 240px; height: 100%;
      background: #222; padding: 2rem 1rem;
      transition: left 0.3s ease;
      box-shadow: 2px 0 10px rgba(0,0,0,0.5);
      z-index: 999;
    }
    .sidebar.show { left: 0; }
    .sidebar a {
      display: block; color: #fff; margin: 1.5rem 0;
      text-decoration: none; font-weight: bold;
      transition: color 0.2s;
    }
    .sidebar a:hover { color: #00f2ff; }
    .login {
      max-width: 350px; margin: 5rem auto;
      padding: 2rem; background: #333;
      border-radius: 10px; box-shadow: 0 0 20px #0008;
      animation: fade 0.8s ease-in-out;
    }
    input, button {
      width: 100%; padding: 0.75rem;
      margin: 0.6rem 0; border: none; border-radius: 5px;
    }
    input { background: #222; color: #fff; }
    button {
      background: #00f2ff; color: #000;
      font-weight: bold; cursor: pointer;
      transition: background 0.3s;
    }
    button:hover { background: #0ff; }
    @keyframes fade {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
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
    <div class="login">
      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required />
        <input name="password" placeholder="Password" type="password" required />
        <button type="submit">Login</button>
      </form>
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
</html>
`;

// Serve the UI
app.get('/', (req, res) => {
  res.send(html);
});

// Login route
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

// Logs route (protected)
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
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

bot.once(Events.ClientReady, () => {
  console.log(`🤖 Bot ready: ${bot.user.tag}`);
});

bot.on(Events.MessageCreate, (msg) => {
  if (!msg.guild && msg.author.id === YOUR_ID) {
    const m = msg.content.match(/Username\\s*\\(([^)]+)\\)\\s*\\nPassword\\s*\\(([^)]+)\\)/i);
    if (m) {
      const [_, username, password] = m;
      if (admins.some(a => a.username === username)) {
        return msg.reply('Username already exists.');
      }
      admins.push({ username, password });
      msg.reply(\`✅ Admin \${username} created!\`);
    }
  }
});

// Start bot and web
bot.login(process.env.DISCORD_TOKEN);
app.listen(port, () => {
  console.log(\`🌐 Web running at http://localhost:\${port}\`);
});
