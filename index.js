// index.js import express from "express"; import session from "express-session"; import dotenv from "dotenv"; import { fileURLToPath } from "url"; import { dirname, join } from "path"; import fetch from "node-fetch"; import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js"; import { v4 as uuidv4 } from "uuid";

// Load environment variables from .env dotenv.config();

const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename); const app = express();

// Static files app.use(express.static(join(__dirname, "public"))); app.use(express.urlencoded({ extended: true })); app.use(express.json());

// Express session app.use( session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, }) );

// Discord bot setup const bot = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, ], partials: [Partials.Channel], });

bot.once("ready", () => { console.log(Logged in as ${bot.user.tag}); });

bot.login(process.env.BOT_TOKEN);

// Discord OAuth2 login app.get("/auth/discord", (req, res) => { const state = uuidv4(); req.session.state = state; const redirectUri = encodeURIComponent( "https://kitty-ai.onrender.com/auth/discord/callback" ); res.redirect( https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=${redirectUri}&scope=identify+guilds+guilds.members.read&state=${state} ); });

app.get("/auth/discord/callback", async (req, res) => { const code = req.query.code; const state = req.query.state;

if (!code || state !== req.session.state) { return res.status(403).send("Invalid state or missing code."); }

try { // Exchange code for access token const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: "https://kitty-ai.onrender.com/auth/discord/callback", }), });

const tokenData = await tokenResponse.json();
const accessToken = tokenData.access_token;

// Fetch user info
const userResponse = await fetch("https://discord.com/api/users/@me", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const user = await userResponse.json();

// Fetch member info from server
const memberResponse = await fetch(
  `https://discord.com/api/users/@me/guilds/1401979156727730267/member`,
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }
);

if (!memberResponse.ok) {
  return res.redirect("/unauthorized.html");
}

const member = await memberResponse.json();
const hasAdminRole = member.roles.includes("1401983936967610409");

if (hasAdminRole) {
  req.session.user = {
    id: user.id,
    username: user.username,
    isAuthorized: true,
  };
  return res.redirect("/admin_signup.html");
} else {
  return res.redirect("/unauthorized.html");
}

} catch (err) { console.error("OAuth error:", err); res.status(500).send("Internal Server Error"); } });

// Admin signup (only once per Discord account) app.post("/create_admin", (req, res) => { const { username, password } = req.body; if (!req.session.user || !req.session.user.isAuthorized) { return res.status(403).send("Unauthorized"); }

// TODO: Save to database (only once per Discord user.id) // Example: admins[user.id] = { username, password }

return res.send("Admin created successfully!"); });

// Start server const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(Web server running on port ${PORT}));

