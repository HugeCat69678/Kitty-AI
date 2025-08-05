require('dotenv').config(); const express = require('express'); const session = require('express-session'); const { Client, GatewayIntentBits, Events, Partials } = require('discord.js');

const app = express(); const port = process.env.PORT || 3000;

const YOUR_ID = '722100931164110939'; const admins = [{ username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD }]; const logs = []; let isBotReady = false;

app.use(express.urlencoded({ extended: true })); app.use(express.json()); app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));

const generateHTML = (loggedIn, botStatus, logList = []) => `

<!DOCTYPE html><html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>KittyAI Admin</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(145deg, #0f0f2b, #1a1a3c);
      color: #fff;
      transition: background 0.5s;
    }
    header {
      background: #111;
      padding: 1.5rem;
      font-size: 1.8rem;
      text-align: center;
      font-weight: bold;
      color: #00f2ff;
      text-shadow: 0 0 5px #00f2ff;
    }
    .status {
      text-align: center;
      margin: 1rem;
      font-size: 1.2rem;
    }
    .login {
      max-width: 400px;
      margin: 4rem auto;
      background: #222;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      animation: fade 0.6s ease-in-out;
    }
    input, button {
      width: 100%;
      padding: 0.75rem;
      margin: 0.75rem 0;
      border: none;
      border-radius: 5px;
    }
    input {
      background: #111;
      color: #fff;
    }
    button {
      background: #00f2ff;
      color: #000;
      font-weight: bold;
      cursor: pointer;
      transition: 0.3s ease;
    }
    button:hover { background: #0ff; }@keyframes fade {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}
.sidebar {
  position: fixed;
  top: 0; left: 0;
  width: 240px;
  height: 100vh;
  background: #111;
  padding-top: 3rem;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}
.sidebar.show { transform: translateX(0); }
.sidebar a {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  padding: 1rem 1.5rem;
  text-decoration: none;
  font-weight: bold;
  transition: background 0.2s;
}
.sidebar a:hover { background: #222; }
.hamburger {
  position: absolute;
  top: 1rem; left: 1rem;
  font-size: 2rem;
  cursor: pointer;
  user-select: none;
}
.log-output {
  margin-left: 260px;
  padding: 2rem;
}

  </style>
</head>
<body>
  <header>KittyAI — Welcome</header>
  <div class="status">Bot status: ${isBotReady ? '🟢 Online' : '🔴 Offline'}</div>
  ${!loggedIn ? `
    <div class="login">
      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required />
        <input name="password" placeholder="Password" type="password" required />
        <button type="submit">Login</button>
      </form>
    </div>
  ` : `
    <div class="hamburger" onclick="toggleSidebar()">☰</div>
    <div class="sidebar" id="sidebar">
      <a href="#" onclick="showLogs()">
        📜 Login Requests
      </a>
      <a href="/logout">
        🚪 Logout
      </a>
    </div>
    <div class="log-output" id="logOutput"></div>
  `}
  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('show');
    }
    function showLogs() {
      fetch('/logs').then(r => r.json()).then(data => {
        const list = data.map(x => `<div>🕒 ${x.time} — attempted: <b>${x.username}</b></div>`).join('');
        document.getElementById('logOutput').innerHTML = list;
      });
    }
  </script>
</body>
</html>
`;app.get('/', (req, res) => { res.send(generateHTML(!!req.session.admin, isBotReady)); });

app.post('/login', (req, res) => { const { username, password } = req.body; const found = admins.find(a => a.username === username && a.password === password); if (found) { req.session.admin = username; logs.push({ username, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) }); return res.redirect('/'); } res.send('Invalid credentials'); });

app.get('/logs', (req, res) => { if (!req.session.admin) return res.status(403).send('Forbidden'); res.json(logs); });

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });

bot.once(Events.ClientReady, () => { console.log(🤖 Bot ready: ${bot.user.tag}); isBotReady = true; });

bot.on(Events.MessageCreate, (msg) => { if (!msg.guild && msg.author.id === YOUR_ID) { const m = msg.content.match(/Username\s\s\nPassword\s*/i); if (m) { const [_, username, password] = m; if (admins.some(a => a.username === username)) return msg.reply('Username already exists.'); admins.push({ username, password }); msg.reply(✅ Admin ${username} created!); } } });

bot.login(process.env.DISCORD_TOKEN); app.listen(port, () => console.log(🌐 Server running at http://localhost:${port}));

