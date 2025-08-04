// index.js import express from 'express'; import session from 'express-session'; import bodyParser from 'body-parser'; import path from 'path'; import { fileURLToPath } from 'url'; import fs from 'fs'; import fetch from 'node-fetch'; import dotenv from 'dotenv'; import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);

const app = express(); const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.DISCORD_TOKEN; const GUILD_ID = '1401979156727730267'; const REQUIRED_ROLE = '1401983936967610409'; const CLIENT_ID = process.env.CLIENT_ID; const CLIENT_SECRET = process.env.CLIENT_SECRET; const REDIRECT_URI = process.env.REDIRECT_URI || 'https://kitty-ai.onrender.com/auth/discord/callback';

let botOnline = false; let uptimeStart = null; let downtimeStart = Date.now();

const adminsPath = path.join(__dirname, 'admins.json'); const unauthPath = path.join(__dirname, 'unauth.json'); const sessions = {};

if (!fs.existsSync(adminsPath)) fs.writeFileSync(adminsPath, JSON.stringify([{ username: "Admin", password: "AI_KITTY" }])); if (!fs.existsSync(unauthPath)) fs.writeFileSync(unauthPath, JSON.stringify([]));

// Middleware app.use(bodyParser.json()); app.use(express.static(path.join(__dirname, 'public'))); app.use(session({ secret: uuidv4(), resave: false, saveUninitialized: false, }));

// Bot Status Polling setInterval(async () => { try { const res = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: Bot ${BOT_TOKEN} } }); const online = res.ok; if (online && !botOnline) uptimeStart = Date.now(); if (!online && botOnline) downtimeStart = Date.now(); botOnline = online; } catch (e) { botOnline = false; downtimeStart = Date.now(); } }, 1000);

// API routes app.get('/bot-status', (req, res) => { const now = Date.now(); res.json({ online: botOnline, uptime: botOnline ? now - uptimeStart : 0, downtime: !botOnline ? now - downtimeStart : 0 }); });

app.post('/login', (req, res) => { const { username, password } = req.body; const admins = JSON.parse(fs.readFileSync(adminsPath)); const found = admins.find(a => a.username === username && a.password === password); if (found) { req.session.authenticated = true; res.sendStatus(200); } else { const logs = JSON.parse(fs.readFileSync(unauthPath)); logs.push({ time: Date.now(), username, password }); fs.writeFileSync(unauthPath, JSON.stringify(logs)); res.sendStatus(403); } });

app.get('/unauthorized-attempts', (req, res) => { if (!req.session.authenticated) return res.sendStatus(403); const logs = JSON.parse(fs.readFileSync(unauthPath)); res.json(logs); });

app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// OAuth2 app.get('/auth/discord', (req, res) => { const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: 'identify guilds guilds.members.read' }); res.redirect(https://discord.com/oauth2/authorize?${params.toString()}); });

app.get('/auth/discord/callback', async (req, res) => { const code = req.query.code; if (!code) return res.redirect('/?error=missing_code');

try { const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }) }); const tokenData = await tokenRes.json(); const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: Bearer ${tokenData.access_token} } }); const user = await userRes.json();

const guildMemberRes = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
  headers: { Authorization: `Bearer ${tokenData.access_token}` }
});

if (!guildMemberRes.ok) return res.redirect('/?error=not_in_server');

const member = await guildMemberRes.json();
const hasRole = member.roles.includes(REQUIRED_ROLE);
if (!hasRole) return res.redirect('/?error=missing_role');

const admins = JSON.parse(fs.readFileSync(adminsPath));
const alreadyLinked = admins.find(a => a.discord_id === user.id);
if (alreadyLinked) return res.redirect('/?status=exists');

const username = [...Array(7)].map(() => Math.random().toString(36)[2]).join('');
const password = [...Array(6)].map(() => Math.random().toString(36)[2]).join('');
admins.push({ username, password, discord_id: user.id });
fs.writeFileSync(adminsPath, JSON.stringify(admins));
res.redirect(`/?linked=true&user=${username}&pass=${password}`);

} catch (err) { console.error(err); res.redirect('/?error=internal_error'); } });

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public/index.html')); });

app.listen(PORT, () => console.log(Kitty AI running on port ${PORT}));

