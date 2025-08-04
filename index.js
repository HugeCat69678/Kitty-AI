import express from 'express';
import fetch from 'node-fetch';
import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from 'discord.js';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = "mistralai/mistral-7b-instruct"; // Or try: "openai/gpt-3.5-turbo"

const app = express();
const PORT = process.env.PORT || 10000;

let botOnline = false;
let botStartTime = Date.now();

app.get('/status', (req, res) => {
  const uptime = botOnline
    ? formatUptime(Date.now() - botStartTime)
    : '<span style="color:red">🔴 Offline</span>';
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>KITTY AI Status</title>
        <style>
          body { font-family: Arial; text-align: center; margin-top: 5rem; }
          h1 { font-size: 2rem; }
          #uptime { font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>KITTY AI ${botOnline ? '🟢 Online for <span id="uptime"></span>' : uptime}</h1>
        <script>
          const start = ${botStartTime};
          const uptimeEl = document.getElementById('uptime');
          function update() {
            const now = Date.now();
            const diff = now - start;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            uptimeEl.innerText = \`\${h.toString().padStart(2, '0')}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
          }
          if (uptimeEl) setInterval(update, 1000);
        </script>
      </body>
    </html>
  `);
});

function formatUptime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `🟢 Online for ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

// ----------------- Discord Bot ------------------

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const command = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask KITTY AI a question!')
  .addStringOption(option =>
    option.setName('question')
      .setDescription('Your question')
      .setRequired(true)
  );

client.once('ready', async () => {
  botOnline = true;
  botStartTime = Date.now();
  console.log(`[🤖] Logged in as ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [command.toJSON()] }
    );
    console.log('Slash command registered.');
  } catch (err) {
    console.error('Failed to register command:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'ask') return;

  const question = interaction.options.getString('question');

  await interaction.deferReply();
  try {
    const reply = await askOpenRouter(question);
    await interaction.editReply(reply || '⚠️ No valid response from the AI.');
  } catch (err) {
    console.error('Error handling interaction:', err);
    await interaction.editReply('⚠️ Sorry, something went wrong with the AI.');
  }
});

async function askOpenRouter(question) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('OpenRouter API Error:', errBody);
    throw new Error('API Error');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

client.login(DISCORD_TOKEN);
