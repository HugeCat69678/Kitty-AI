// =======================
// Imports & Setup
// =======================
const express = require("express");
const session = require("express-session");
const path = require("path");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const Database = require("better-sqlite3");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// Session & Middleware
// =======================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false
}));

// =======================
// Database
// =======================
const db = new Database("admins.db");
db.prepare(`
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
`).run();

// =======================
// Discord Bot Setup
// =======================
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

const MASTER_ID = "722100931164110939";
let botOnlineSince = null;

// =======================
// Slash Commands
// =======================
const commands = [
    new SlashCommandBuilder()
        .setName("ask")
        .setDescription("Ask AI (18+, swearing allowed)")
        .addStringOption(option =>
            option.setName("question").setDescription("Your question").setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("img-ask")
        .setDescription("Ask AI about an image (18+, swearing allowed)")
        .addAttachmentOption(option =>
            option.setName("image").setDescription("Image to analyze").setRequired(true)
        )
        .addStringOption(option =>
            option.setName("question").setDescription("Optional question about the image").setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName("custom-acc")
        .setDescription("Create an admin account")
        .addStringOption(option =>
            option.setName("username").setDescription("Account username").setRequired(true)
        )
        .addStringOption(option =>
            option.setName("password").setDescription("Account password").setRequired(true)
        )
].map(cmd => cmd.toJSON());

// =======================
// Slash Command Register
// =======================
(async () => {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log("✅ Slash commands registered globally.");
    } catch (err) {
        console.error("❌ Error registering commands:", err);
    }
})();

// =======================
// Discord Events
// =======================
bot.once("ready", () => {
    botOnlineSince = Date.now();
    console.log(`✅ Logged in as ${bot.user.tag}`);
});

bot.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const cmd = interaction.commandName;

    if (cmd === "ask") {
        const question = interaction.options.getString("question");
        await interaction.deferReply();

        try {
            // Notify master
            const master = await bot.users.fetch(MASTER_ID);
            master.send(`💬 /ask used by **${interaction.user.username}** at ${new Date().toLocaleString()}\nQuestion: ${question}`);

            // AI request (Groq API)
            const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama3-70b-8192",
                    messages: [
                        { role: "system", content: "You are a helpful AI that allows swearing and mature content." },
                        { role: "user", content: question }
                    ]
                })
            });

            const data = await aiRes.json();
            const answer = data.choices?.[0]?.message?.content || "❌ No response";
            await interaction.editReply(answer);

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Error processing request.");
        }
    }

    if (cmd === "img-ask") {
        const image = interaction.options.getAttachment("image");
        const question = interaction.options.getString("question") || "Describe this image.";
        await interaction.deferReply();

        try {
            const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llava-v1.5-7b",
                    messages: [
                        { role: "system", content: "You are an AI image analyst. Allow mature language." },
                        { role: "user", content: question }
                    ],
                    images: [image.url]
                })
            });

            const data = await aiRes.json();
            const answer = data.choices?.[0]?.message?.content || "❌ No response";
            await interaction.editReply(answer);

        } catch (err) {
            console.error(err);
            await interaction.editReply("❌ Error analyzing image.");
        }
    }

    if (cmd === "custom-acc") {
        if (interaction.user.id !== MASTER_ID) {
            return interaction.reply({ content: "❌ Only the master can create accounts.", ephemeral: true });
        }

        const username = interaction.options.getString("username");
        const password = interaction.options.getString("password");

        try {
            db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run(username, password);
            await interaction.reply(`✅ Admin account created: **${username}**`);

            // Notify master
            const master = await bot.users.fetch(MASTER_ID);
            master.send(`🔐 New admin account created:\nUsername: **${username}**\nTime: ${new Date().toLocaleString()}`);
        } catch (err) {
            // Fixed: Await reply and make it ephemeral to avoid multiple replies conflict
            await interaction.reply({ content: "❌ Username already exists.", ephemeral: true });
        }
    }
});

// =======================
// Website Routes
// =======================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/status", (req, res) => {
    res.json({
        online: bot.ws.status === 0 && botOnlineSince !== null,
        uptime: botOnlineSince ? `${Math.floor((Date.now() - botOnlineSince) / 1000)}s` : "Offline"
    });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const admin = db.prepare("SELECT * FROM admins WHERE username=? AND password=?").get(username, password);
    if (admin) {
        req.session.admin = true;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});

// =======================
// Start Server & Bot
// =======================
app.listen(PORT, () => console.log(`🌐 Website running on port ${PORT}`));
bot.login(process.env.DISCORD_TOKEN);
