const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, REST } = require('discord.js');
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

let isOnline = true;
let startTime = Date.now();

// Initialize Discord Bot
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🐱 KITTY AI is online as ${client.user.tag}`);
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ask') return;

  const question = interaction.options.getString('question');

  try {
    await interaction.deferReply({ ephemeral: false });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://uptimerobot.com/' // Required by OpenRouter
      },
      body: JSON.stringify({
        model: "mistral-7b-instruct",
        messages: [
          { role: "system", content: "You are KITTY AI, a helpful and kind assistant." },
          { role: "user", content: question }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenRouter API Error:", errorBody);
      throw new Error("API Error");
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "⚠️ I didn’t get a valid response.";
    await interaction.editReply(reply);
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("⚠️ Something went wrong with the AI.");
    } else {
      try {
        await interaction.reply("⚠️ Something went wrong processing your question.");
      } catch (e) {
        console.error("Failed to reply to interaction:", e);
      }
    }
    isOnline = false;
  }
});

// Slash command registration
(async () => {
  const commands = [
    new SlashCommandBuilder()
      .setName('ask')
      .setDescription('Ask KITTY AI a question!')
      .addStringOption(option =>
        option.setName('question')
              .setDescription('What do you want to ask?')
              .setRequired(true))
      .toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash command registered.');
  } catch (err) {
    console.error('❌ Error registering slash command:', err);
  }
})();

// Express server for /status
app.get('/status', (req, res) => {
  if (!isOnline) {
    return res.send(`<h1>🔴 KITTY AI Offline</h1>`);
  }

  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const hours = String(Math.floor(uptime / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
  const seconds = String(uptime % 60).padStart(2, '0');

  res.send(`
    <html>
      <head>
        <title>KITTY AI Status</title>
        <meta http-equiv="refresh" content="1">
        <style>body { font-family: sans-serif; }</style>
      </head>
      <body>
        <h1>KITTY AI 🟢 Online for ${hours}:${minutes}:${seconds}</h1>
      </body>
    </html>
  `);
});

app.listen(port, () => console.log(`🌐 Express server running on port ${port}`));

client.login(DISCORD_TOKEN);
