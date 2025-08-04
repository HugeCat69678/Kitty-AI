// index.js

import express from 'express'; import session from 'express-session'; import fetch from 'node-fetch'; import path from 'path'; import { fileURLToPath } from 'url'; import { config } from 'dotenv'; import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } from 'discord.js'; import crypto from 'crypto';

config();

const app = express(); const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);

// Session setup app.use( session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, }) );

// Discord bot setup const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

bot.once('ready', () => { console.log(Logged in as ${bot.user.tag}); });

const commands = [ new SlashCommandBuilder().setName('ask').setDescription('Ask the bot a question') ];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => { try { await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands, }); await bot.login(process.env.DISCORD_TOKEN); } catch (err) { console.error(err); } })();

bot.on('interactionCreate', async interaction => { if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === 'ask') { await interaction.reply('What would you like to ask?'); } });

// Serve static files app.use(express.static(path.join(__dirname, 'public'))); app.use(express.urlencoded({ extended: true })); app.use(express.json());

// OAuth2 linking route app.get('/auth/discord', (req, res) => { const redirect = https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&scope=identify%20guilds%20guilds.members.read; res.redirect(redirect); });

// OAuth2 callback handler app.get('/auth/discord/callback', async (req, res) => { const code = req.query.code; if (!code) return res.sendStatus(400);

try { const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: process.env.REDIRECT_URI, }), }); const tokenData = await tokenRes.json(); const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: Bearer ${tokenData.access_token} }, }); const user = await userRes.json();

const memberRes = await fetch(`https://discord.com/api/users/@me/guilds/${process.env.BOT_GUILD_ID}/member`, {
  headers: { Authorization: `Bearer ${tokenData.access_token}` },
});

if (!memberRes.ok) return res.redirect('/?not-in-server=true');

const member = await memberRes.json();
const hasRole = member.roles.includes(process.env.REQUIRED_ROLE_ID);

if (!hasRole) return res.redirect('/?unauthorized=true');

// Only allow one admin account per Discord user
if (adminExists(user.id)) return res.redirect('/?already-linked=true');

req.session.discordId = user.id;
res.redirect('/admin/signup');

} catch (err) { console.error(err); res.sendStatus(500); } });

// Dummy admin check const linkedAdmins = new Set(); function adminExists(discordId) { return linkedAdmins.has(discordId); } function addAdmin(discordId) { linkedAdmins.add(discordId); }

// Admin signup app.get('/admin/signup', (req, res) => { if (!req.session.discordId) return res.redirect('/'); res.sendFile(path.join(__dirname, 'public', 'create_admin.html')); });

app.post('/admin/signup', (req, res) => { const { username, password } = req.body; if (!req.session.discordId || adminExists(req.session.discordId)) return res.redirect('/');

// Register admin here (store securely in real DB) addAdmin(req.session.discordId); console.log(Admin created: ${username}); res.redirect('/?admin-created=true'); });

// Start the server const PORT = process.env.PORT || 3000; app.listen(PORT, () => { console.log(Server listening on port ${PORT}); });

