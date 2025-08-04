const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js");
const fetch = require("node-fetch");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const CLIENT_ID = process.env.CLIENT_ID;

const app = express();
const port = process.env.PORT || 3000;

let botOnlineSince = null;
let botOnline = false;

app.get("/status", (req, res) => {
    if (botOnline) {
        const uptime = Math.floor((Date.now() - botOnlineSince) / 1000);
        const hours = String(Math.floor(uptime / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((uptime % 3600) / 60)).padStart(2, '0');
        const seconds = String(uptime % 60).padStart(2, '0');
        res.send(`
            <html><head><meta charset="UTF-8"><title>KITTY AI Status</title></head>
            <body style="font-family:sans-serif;font-size:1.5em;text-align:center;padding-top:50px;">
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

app.listen(port, () => console.log(`Status page running on port ${port}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    botOnline = true;
    botOnlineSince = Date.now();
});

// Slash command registration
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
    .then(() => console.log("Registered slash command"))
    .catch(console.error);

client.on("interactionCreate", async interaction => {
    if (interaction.isAutocomplete()) {
        const focused = interaction.options.getFocused();
        await interaction.respond([
            { name: `Ask: "${focused}"`, value: focused }
        ]);
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "ask") {
        const question = interaction.options.getString("question");
        await interaction.deferReply();
        try {
            const response = await fetch("https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: `[INST] ${question} [/INST]`
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Hugging Face API Error:", errorText);
                throw new Error("API Error");
            }

            const data = await response.json();
            const output = data?.[0]?.generated_text || "⚠️ No answer returned.";
            await interaction.editReply(output);
        } catch (error) {
            console.error("❌ Error:", error);
            await interaction.editReply("⚠️ Sorry, something went wrong with the AI.");
        }
    }
});

client.login(DISCORD_TOKEN);
