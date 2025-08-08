// index.js
const express = require("express");
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const session = require("express-session");
const fetch = require("node-fetch");
const Database = require("better-sqlite3");
require("dotenv").config();

// --- CONFIG ---
const MASTER_ID = "722100931164110939"; // Your Discord ID
const PORT = process.env.PORT || 3000;

// --- DATABASE ---
const db = new Database("admins.db");
db.prepare(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)`).run();

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

// --- EXPRESS APP ---
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
}));

// --- WEB ROUTE ---
app.get("/", (req, res) => {
    res.send("KittyAI Bot is running!");
});

// --- STARTUP COMMAND REGISTRATION ---
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log("🗑 Clearing old global commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log("✅ Old commands cleared.");

        const commands = [
            new SlashCommandBuilder()
                .setName("ask")
                .setDescription("Ask the AI anything (mature language allowed).")
                .addStringOption(opt =>
                    opt.setName("question")
                        .setDescription("Your question")
                        .setRequired(true)
                ),
            new SlashCommandBuilder()
                .setName("img-ask")
                .setDescription("Ask the AI about an image.")
                .addAttachmentOption(opt =>
                    opt.setName("image")
                        .setDescription("The image file")
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("question")
                        .setDescription("Optional question about the image")
                        .setRequired(false)
                ),
            new SlashCommandBuilder()
                .setName("custom-acc")
                .setDescription("Create an admin account (Master only).")
                .addStringOption(opt =>
                    opt.setName("username")
                        .setDescription("Account username")
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName("password")
                        .setDescription("Account password")
                        .setRequired(true)
                )
        ].map(cmd => cmd.toJSON());

        console.log("📌 Registering new global commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log("✅ Commands registered: /ask, /img-ask, /custom-acc");

    } catch (err) {
        console.error("❌ Command registration failed:", err);
    }
});

// --- AI HELPERS ---
async function callGroq(prompt, imageUrl = null) {
    console.log("🤖 Sending request to Groq API...");
    const payload = {
        model: imageUrl ? "llava-v1.5-7b" : "llama3-70b-8192",
        messages: imageUrl
            ? [
                { role: "system", content: "You can use mature language. Describe or answer about the image." },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: prompt || "What's in this image?" },
                        { type: "input_image", image_url: imageUrl }
                    ]
                }
            ]
            : [
                { role: "system", content: "You can use mature language. Answer directly." },
                { role: "user", content: prompt }
            ]
    };

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("📩 Groq API response:", data);
    if (data?.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
    } else {
        return "Meow~ nothing came back!";
    }
}

// --- COMMAND HANDLER ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ask") {
        const question = interaction.options.getString("question");
        console.log(`💬 /ask from ${interaction.user.tag}: ${question}`);

        try {
            const aiResponse = await callGroq(question);
            await interaction.reply(aiResponse);

            const masterUser = await client.users.fetch(MASTER_ID);
            await masterUser.send(`📢 /ask used by **${interaction.user.tag}** at ${new Date().toLocaleString()}:\n> ${question}`);

        } catch (err) {
            console.error(err);
            await interaction.reply("❌ Error getting AI response.");
        }
    }

    if (interaction.commandName === "img-ask") {
        const image = interaction.options.getAttachment("image");
        const question = interaction.options.getString("question") || null;
        console.log(`🖼 /img-ask from ${interaction.user.tag}, image: ${image.url}, question: ${question}`);

        try {
            const aiResponse = await callGroq(question, image.url);
            await interaction.reply(aiResponse);
        } catch (err) {
            console.error(err);
            await interaction.reply("❌ Error processing image.");
        }
    }

    if (interaction.commandName === "custom-acc") {
        if (interaction.user.id !== MASTER_ID) {
            return interaction.reply({ content: "❌ You are not allowed to use this command.", ephemeral: true });
        }
        const username = interaction.options.getString("username");
        const password = interaction.options.getString("password");

        try {
            db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run(username, password);
            await interaction.reply(`✅ Admin account **${username}** created.`);

            const masterUser = await client.users.fetch(MASTER_ID);
            await masterUser.send(`🔑 Admin account created:\nUsername: **${username}**\nPassword: **${password}**`);
        } catch (err) {
            console.error(err);
            await interaction.reply("❌ Failed to create account (username may already exist).");
        }
    }
});

// --- LOGIN BOT ---
client.login(process.env.DISCORD_TOKEN);

// --- WEB SERVER ---
app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
});
