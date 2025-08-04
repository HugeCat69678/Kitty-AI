const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fetch = require("node-fetch");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const app = express();
const port = process.env.PORT || 3000;

let botOnline = false;
let botOnlineSince = null;

app.get("/status", (req, res) => {
    if (botOnline) {
        const uptime = Math.floor((Date.now() - botOnlineSince) / 1000);
        const hours = String(Math.floor(uptime / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
        const seconds = String(uptime % 60).padStart(2, '0');
        res.send(`
            <html><head><meta charset="UTF-8"><title>KITTY AI Status</title></head>
            <body style="font-family:sans-serif;text-align:center;padding-top:50px;font-size:1.5em;">
                KITTY AI 🟢 Online for <span id="uptime">${hours}:${minutes}:${seconds}</span>
                <script>
                    let secs = ${uptime};
                    setInterval(() => {
                        secs++;
                        const h = String(Math.floor(secs / 3600)).padStart(2, '0');
                        const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
                        const s = String(secs % 60).padStart(2, '0');
                        document.getElementById("uptime").textContent = \`\${h}:\${m}:\${s}\`;
                    }, 1000);
                </script>
            </body></html>
        `);
    } else {
        res.send("<html><body style='font-family:sans-serif;text-align:center;padding-top:50px;font-size:1.5em;'>KITTY AI 🔴 Offline</body></html>");
    }
});

app.listen(port, () => console.log("✅ Status page running on port " + port));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    botOnline = true;
    botOnlineSince = Date.now();
});

const commands = [
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask KITTY AI a question")
        .addStringOption(option =>
            option.setName("question")
                  .setDescription("What do you want to ask?")
                  .setRequired(true)
                  .setAutocomplete(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
    .then(() => console.log("✅ Slash command registered"))
    .catch(console.error);

client.on("interactionCreate", async interaction => {
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        await interaction.respond([{ name: `Ask: "${focused}"`, value: focused }]);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "ask") {
        const question = interaction.options.getString("question");
        await interaction.deferReply();
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://uptimerobot.com/" // Required by OpenRouter
                },
                body: JSON.stringify({
                    model: "mistral/mistral-7b-instruct",
                    messages: [
                        { role: "system", content: "You are KITTY AI, a helpful and kind assistant." },
                        { role: "user", content: question }
                    ]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("OpenRouter API Error:", errorText);
                throw new Error("API Error");
            }

            const data = await response.json();
            const output = data?.choices?.[0]?.message?.content || "⚠️ No answer returned.";
            await interaction.editReply(output);
        } catch (err) {
            console.error("❌ Error with AI response:", err);
            await interaction.editReply("⚠️ Sorry, something went wrong with the AI.");
        }
    }
});

client.login(DISCORD_TOKEN);
