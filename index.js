const express = require('express');
const fetch = require('node-fetch');
const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST, InteractionType } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const MODEL = "openrouter/mistral-7b-instruct"; // You can change this to another valid OpenRouter model

// Track bot uptime
const startTime = Date.now();
let botStatus = "🟢 Online";

// Express Server
const app = express();
app.get('/status', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hh = String(Math.floor(uptimeSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((uptimeSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(uptimeSeconds % 60).padStart(2, '0');

  if (botStatus === "🟢 Online") {
    res.send(`KITTY AI ${botStatus} for ${hh}:${mm}:${ss}`);
  } else {
    res.send(`KITTY AI 🔴 Offline`);
  }
});
app.listen(10000, () => console.log("🌐 Express server listening on port 10000"));

// Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Register slash command
const commands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask KITTY AI a question!')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Your question')
        .setRequired(true))
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    console.log("🛠️ Registering slash commands...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered.");
  } catch (error) {
    console.error("❌ Failed to register commands:", error);
  }
})();

// Bot Ready
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// Handle /ask command
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ask') return;

  const question = interaction.options.getString('question');

  try {
    await interaction.deferReply();

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are KITTY AI, a helpful assistant." },
          { role: "user", content: question }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("❌ OpenRouter API Error:", err);
      botStatus = "🔴 Offline";
      return interaction.editReply("⚠️ Sorry, something went wrong with the AI.");
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;

    if (!answer) {
      botStatus = "🔴 Offline";
      return interaction.editReply("⚠️ AI did not return a response.");
    }

    botStatus = "🟢 Online";
    interaction.editReply(answer);
  } catch (err) {
    console.error("❌ Error with AI response:", err);
    botStatus = "🔴 Offline";
    interaction.editReply("⚠️ Sorry, something went wrong.");
  }
});

// Login
client.login(DISCORD_TOKEN);
