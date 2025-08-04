import express from 'express';
import session from 'express-session';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, InteractionType } from 'discord.js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Discord bot setup
const bot = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

bot.once('ready', () => {
  console.log(`Logged in as ${bot.user.tag}`);
});

bot.login(process.env.DISCORD_TOKEN);

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// In-memory store for linked Discord users and created admins
const linkedUsers = new Map();

// OAuth2 callback
app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/');

  try {
    const data = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
      scope: 'identify guilds guilds.members.read'
    });

    const oauthResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data
    });

    const oauthData = await oauthResponse.json();
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${oauthData.access_token}` }
    });

    const user = await userResponse.json();

    const memberResponse = await fetch(`https://discord.com/api/users/@me/guilds/${process.env.BOT_GUILD_ID}/member`, {
      headers: { Authorization: `Bearer ${oauthData.access_token}` }
    });

    if (!memberResponse.ok) {
      return res.send('You must be a member of the server.');
    }

    const member = await memberResponse.json();
    const hasRole = member.roles.includes(process.env.REQUIRED_ROLE_ID);

    if (!hasRole) {
      return res.send('You do not have the required role.');
    }

    if (linkedUsers.has(user.id)) {
      return res.send('You’ve already linked your account.');
    }

    req.session.discordId = user.id;
    res.sendFile(path.join(__dirname, 'public/create_admin.html'));

  } catch (err) {
    console.error(err);
    res.send('OAuth2 login failed.');
  }
});

// Handle admin signup
app.post('/create-admin', (req, res) => {
  const { username, password } = req.body;
  const discordId = req.session.discordId;

  if (!discordId) return res.sendStatus(403);
  if (linkedUsers.has(discordId)) return res.send('Already created an account.');

  linkedUsers.set(discordId, { username, password });
  res.send('Admin account created!');
});

// Start web server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));
