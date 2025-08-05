// index.js import express from 'express'; import session from 'express-session'; import { Client, GatewayIntentBits, Partials, Events } from 'discord.js'; import dotenv from 'dotenv'; dotenv.config();

const app = express(); const port = process.env.PORT || 3000;

// Set up session middleware app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));

// In-memory database const loginAttempts = []; const users = [ { username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD } ];

// HTML/CSS site with animations, sidebar, login form, Kitty AI branding const html = `

<!DOCTYPE html><html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kitty AI - Admin</title>
  <style>
    body {
      margin: 0;
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(to right, #0f2027, #203a43, #2c5364);
      color: #fff;
      overflow: hidden;
    }
    header {
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background-color: #111;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      animation: flicker 1.5s infinite alternate;
    }
    .hamburger {
      font-size: 1.5rem;
      cursor: pointer;
    }
    @keyframes flicker {
      0% { opacity: 1; }
      100% { opacity: 0.7; }
    }
    .sidebar {
      position: fixed;
      top: 0;
      left: -250px;
      width: 250px;
      height: 100%;
      background: #111;
      padding: 2rem 1rem;
      transition: left 0.3s ease;
    }
    .sidebar.show {
      left: 0;
    }
    .sidebar a {
      display: block;
      padding: 1rem 0;
      color: #fff;
      text-decoration: none;
    }
    .login-form {
      margin: 3rem auto;
      width: 300px;
      background: #222;
      padding: 2rem;
      border-radius: 8px;
      animation: fadeIn 1s ease-in-out;
    }
    input {
      width: 100%;
      padding: 0.75rem;
      margin-bottom: 1rem;
      border: none;
      border-radius: 4px;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #00adb5;
      border: none;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
    }
    @keyframes fadeIn {
      0% { opacity: 0; transform: translateY(-20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Kitty AI</div>
    <div class="hamburger" onclick="toggleSidebar()">&#9776;</div>
  </header>  <div class="sidebar" id="sidebar">
    <a href="#" onclick="loadLogins()">Login Requests</a>
    <a href="/logout">Logout</a>
  </div>  <div class="login-form">
    <form method="POST" action="/login">
      <input name="username" placeholder="Username" required />
      <input name="password" placeholder="Password" type="password" required />
      <button type="submit">Login</button>
    </form>
  </div>  <script>
    function toggleSidebar() {
      const bar = document.getElementById('sidebar');
      bar.classList.toggle('show');
    }
    function loadLogins() {
      fetch('/logins').then(r => r.json()).then(logins => {
        alert('Logins:\n' + logins.map(l => `${l.time} — ${l.username}`).join('\n'));
      });
    }
  </script></body>
</html>
`;app.get('/', (req, res) => { res.send(html); });

app.use(express.urlencoded({ extended: true }));

app.post('/login', (req, res) => { const { username, password } = req.body; const found = users.find(u => u.username === username && u.password === password); if (found) { req.session.user = username; loginAttempts.push({ username, time: new Date().toLocaleString() }); res.redirect('/'); } else { res.send('Invalid credentials'); } });

app.get('/logins', (req, res) => { if (!req.session.user) return res.status(403).send('Forbidden'); res.json(loginAttempts); });

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// DISCORD BOT const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages], partials: [Partials.Channel] });

bot.once('ready', () => { console.log(Logged in as ${bot.user.tag}); });

bot.on(Events.MessageCreate, async (message) => { if (!message.guild && message.author.id === process.env.MY_DISCORD_ID) { const match = message.content.match(/Username \nPassword /); if (match) { const [_, username, password] = match; users.push({ username, password }); message.reply(✅ Account created for ${username}); } } });

bot.login(process.env.DISCORD_TOKEN); app.listen(port, () => console.log(Web server running on http://localhost:${port}));

