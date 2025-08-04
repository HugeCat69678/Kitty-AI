import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import { Client, GatewayIntentBits, REST, Routes, Partials } from "discord.js";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ENV
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  REQUIRED_ROLE_ID,
  SESSION_SECRET,
} = process.env;

const app = express();
const port = process.env.PORT || 3000;

// Setup session
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// In-memory store of linked users
const linkedUsers = new Map();

// Bot setup
const bot = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

bot.once("ready", () => {
  console.log(`Logged in as ${bot.user.tag}`);
});
bot.login(DISCORD_BOT_TOKEN);

// Routes

// Home page
app.get("/", (req, res) => {
  const isLinked = req.session.user && linkedUsers.has(req.session.user.id);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Discord login
app.get("/auth/discord", (req, res) => {
  const redirectUri = encodeURIComponent("https://kitty-ai.onrender.com/auth/discord/callback");
  const scope = encodeURIComponent("identify guilds guilds.members.read");
  res.redirect(`https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`);
});

// Discord callback
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect("/");

  try {
    // Exchange code for token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://kitty-ai.onrender.com/auth/discord/callback",
      }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user identity
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const user = await userResponse.json();

    // Get member roles
    const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${DISCORD_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!memberRes.ok) return res.send("You must be a member of the server.");
    const member = await memberRes.json();

    const hasRole = member.roles.includes(REQUIRED_ROLE_ID);
    if (!hasRole) return res.send("You do not have the required role.");

    if (linkedUsers.has(user.id)) {
      return res.send("Your Discord account is already linked.");
    }

    // Store session
    req.session.user = user;
    req.session.accessToken = accessToken;

    return res.redirect("/create-admin");
  } catch (err) {
    console.error(err);
    return res.send("An error occurred.");
  }
});

// Serve admin form
app.get("/create-admin", (req, res) => {
  const user = req.session.user;
  if (!user || linkedUsers.has(user.id)) {
    return res.redirect("/");
  }

  // Serve HTML for username/password input
  res.send(`
    <html>
      <head><title>Create Admin</title></head>
      <body>
        <h2>Choose your admin username and password</h2>
        <form action="/create-admin" method="POST">
          <input name="username" placeholder="Username" required><br>
          <input name="password" placeholder="Password" type="password" required><br>
          <button type="submit">Create</button>
        </form>
      </body>
    </html>
  `);
});

// Handle admin creation
app.post("/create-admin", (req, res) => {
  const user = req.session.user;
  if (!user || linkedUsers.has(user.id)) {
    return res.redirect("/");
  }

  const { username, password } = req.body;
  if (!username || !password) return res.send("Missing username or password.");

  linkedUsers.set(user.id, {
    username,
    passwordHash: crypto.createHash("sha256").update(password).digest("hex"),
  });

  res.send("Admin account created!");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
