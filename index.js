require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const fs = require('fs');

const app = express();
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const ADMIN_FILE = './admins.json';
const LOG_FILE = './login_logs.json';
const YOUR_DISCORD_ID = '722100931164110939';

// Load admins
let admins = {};
if (fs.existsSync(ADMIN_FILE)) {
  admins = JSON.parse(fs.readFileSync(ADMIN_FILE));
}

// Login logs
let loginLogs = [];
if (fs.existsSync(LOG_FILE)) {
  loginLogs = JSON.parse(fs.readFileSync(LOG_FILE));
}

// Express session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve HTML from "/"
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = admins[username];

  if (admin && admin.password === password) {
    req.session.user = { username };
    loginLogs.push({
      username,
      time: new Date().toISOString()
    });
    fs.writeFileSync(LOG_FILE, JSON.stringify(loginLogs, null, 2));
    return res.redirect('/dashboard');
  } else {
    return res.redirect('/?error=Invalid credentials');
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');

  const logsHtml = loginLogs
    .map(log => `<li>${log.username} logged in at ${log.time}</li>`)
    .join('');

  res.send(`
    <html>
      <head>
        <title>Kitty AI Dashboard</title>
        <style>
          body {
            margin: 0;
            font-family: sans-serif;
            background: linear-gradient(to bottom right, #0f0f2b, #1f1f3d);
            color: white;
          }
          .navbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background-color: #1a1a3d;
          }
          .hamburger {
            cursor: pointer;
            font-size: 24px;
          }
          .sidebar {
            position: fixed;
            top: 0;
            left: -250px;
            height: 100%;
            width: 250px;
            background-color: #2c2c54;
            padding: 2rem 1rem;
            transition: left 0.3s ease;
          }
          .sidebar.open {
            left: 0;
          }
          .sidebar h3 {
            margin-top: 0;
            font-size: 22px;
            color: #ff66c4;
          }
          .sidebar a {
            display: block;
            margin: 1rem 0;
            color: white;
            text-decoration: none;
          }
          .content {
            padding: 2rem;
          }
        </style>
      </head>
      <body>
        <div class="navbar">
          <div><strong>Kitty AI</strong></div>
          <div class="hamburger" onclick="toggleSidebar()">☰</div>
        </div>
        <div class="sidebar" id="sidebar">
          <h3>Dashboard</h3>
          <a href="#" onclick="showLogs()">Login Requests</a>
          <a href="/logout">Log Out</a>
        </div>
        <div class="content" id="content">
          <h2>Welcome, ${req.session.user.username}</h2>
          <p>Select an option from the sidebar.</p>
        </div>
        <script>
          function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('open');
          }
          function showLogs() {
            const content = document.getElementById('content');
            content.innerHTML = \`
              <h2>Login Requests</h2>
              <ul>
                ${logsHtml}
              </ul>
            \`;
          }
        </script>
      </body>
    </html>
  `);
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// Discord bot login
bot.once('ready', () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.on('messageCreate', async (message) => {
  if (!message.guild && message.author.id === YOUR_DISCORD_ID) {
    const lines = message.content.split('\n');
    const usernameLine = lines.find(l => l.startsWith('Username ('));
    const passwordLine = lines.find(l => l.startsWith('Password ('));

    if (usernameLine && passwordLine) {
      const username = usernameLine.match(/\(([^)]+)\)/)?.[1];
      const password = passwordLine.match(/\(([^)]+)\)/)?.[1];

      if (username && password) {
        if (admins[username]) {
          return message.reply('❌ That username already exists.');
        }

        admins[username] = { password };
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(admins, null, 2));
        return message.reply('✅ Admin account created successfully!');
      } else {
        return message.reply('❌ Invalid format.');
      }
    }
  }
});

bot.login(process.env.DISCORD_TOKEN);
