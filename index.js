// index.js

import express from 'express'; import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, InteractionType } from 'discord.js'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import fetch from 'node-fetch'; import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);

const app = express(); const PORT = process.env.PORT || 10000; const DISCORD_TOKEN = process.env.DISCORD_TOKEN; const CLIENT_ID = process.env.CLIENT_ID; const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const ADMIN_USERNAME = 'Admin'; const ADMIN_PASSWORD = 'AI_KITTY'; let onlineSince = Date.now(); let isBotOnline = true; let lastDowntime = null; let customAdmins = []; let unauthorizedAttempts = [];

app.use(express.static(__dirname)); app.use(express.urlencoded({ extended: true })); app.use(express.json());

// ---------------- EXPRESS ROUTES ------------------ app.get('/status', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.post('/login', (req, res) => { const { username, password } = req.body; const now = new Date().toLocaleTimeString(); const isAdmin = username === ADMIN_USERNAME && password === ADMIN_PASSWORD; const isCustom = customAdmins.some(a => a.username === username && a.password === password); if (isAdmin || isCustom) { res.json({ success: true }); } else { unauthorizedAttempts.push({ time: now, username, password }); res.status(401).json({ success: false }); } });

app.get('/bot-status', (req, res) => { const status = { online: isBotOnline, uptime: isBotOnline ? (Date.now() - onlineSince) : 0, downtime: !isBotOnline && lastDowntime ? (Date.now() - lastDowntime) : 0 }; res.json(status); });

app.get('/unauthorized-attempts', (req, res) => { res.json(unauthorizedAttempts); });

// ---------------- DISCORD BOT ------------------

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [ new SlashCommandBuilder().setName('ask').setDescription('Ask the AI a question').addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true)), new SlashCommandBuilder().setName('create_acc').setDescription('Create admin credentials (owner only)') ].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN); (async () => { try { await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log('✅ Slash commands registered'); } catch (err) { console.error('❌ Command registration failed:', err); } })();

bot.on('ready', () => { console.log(🤖 Logged in as ${bot.user.tag}); isBotOnline = true; onlineSince = Date.now(); });

bot.on('interactionCreate', async interaction => { if (interaction.type !== InteractionType.ApplicationCommand) return; try { if (interaction.commandName === 'ask') { await interaction.deferReply(); const question = interaction.options.getString('question'); const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Authorization': Bearer ${OPENROUTER_API_KEY}, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openrouter/mistral-7b-instruct', messages: [ { role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: question } ] }) }); const data = await response.json(); if (data.choices && data.choices.length > 0) { await interaction.editReply(data.choices[0].message.content); } else { await interaction.editReply('⚠️ Sorry, I couldn’t get a response from the AI.'); } }

if (interaction.commandName === 'create_acc') {
  if (interaction.user.id !== '722100931164110939') {
    await interaction.reply({ content: 'UH oh! You dont have permissions to run this command!', ephemeral: true });
    return;
  }
  const newUser = Math.random().toString(36).slice(2, 9);
  const newPass = Math.random().toString(36).slice(2, 8);
  customAdmins.push({ username: newUser, password: newPass });
  await interaction.reply({ content: `✅ Created login:\nUsername: \`${newUser}\`\nPassword: \`${newPass}\``, ephemeral: true });
}

} catch (err) { console.error('Error handling interaction:', err); try { await interaction.editReply('❌ Something went wrong.'); } catch {} } });

bot.on('error', err => { console.error('Discord client error:', err); isBotOnline = false; lastDowntime = Date.now(); });

bot.login(DISCORD_TOKEN);

// ---------------- SERVER START ------------------

app.listen(PORT, () => console.log(🚀 Express server listening on port ${PORT}));

