// index.js
import express from "express";
import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from "discord.js";
import fetch from "node-fetch";
import Database from "better-sqlite3";

const app = express();
const port = process.env.PORT || 3000;

const db = new Database("admins.db");
db.prepare(`CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password TEXT)`).run();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the AI anything (mature language allowed)")
    .addStringOption(opt => opt.setName("prompt").setDescription("Your question").setRequired(true)),
  new SlashCommandBuilder()
    .setName("img-ask")
    .setDescription("Ask AI about an image (mature language allowed)")
    .addAttachmentOption(opt => opt.setName("image").setDescription("Image to analyze").setRequired(true))
    .addStringOption(opt => opt.setName("question").setDescription("Optional question about the image")),
  new SlashCommandBuilder()
    .setName("custom-acc")
    .setDescription("Create an admin account (Owner only)")
    .addStringOption(opt => opt.setName("username").setDescription("Username").setRequired(true))
    .addStringOption(opt => opt.setName("password").setDescription("Password").setRequired(true))
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
})();

client.on("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

async function askGroq(prompt) {
  console.log("[Groq Request] Prompt:", prompt);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    })
  });
  const data = await res.json();
  console.log("[Groq Response]:", JSON.stringify(data, null, 2));
  return data?.choices?.[0]?.message?.content || "Meow~ nothing came back!";
}

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    const prompt = interaction.options.getString("prompt");
    await interaction.deferReply();
    try {
      const reply = await askGroq(prompt);
      await interaction.editReply(reply);
    } catch (err) {
      console.error("Error in /ask:", err);
      await interaction.editReply("Error processing your request.");
    }
  }

  if (interaction.commandName === "img-ask") {
    const image = interaction.options.getAttachment("image");
    const question = interaction.options.getString("question") || "";
    const imageUrl = image.url;
    console.log("[/img-ask] Image URL:", imageUrl, "Question:", question);

    await interaction.deferReply();
    try {
      const prompt = `Analyze the image at ${imageUrl}. ${question}`;
      const reply = await askGroq(prompt);
      await interaction.editReply(reply);
    } catch (err) {
      console.error("Error in /img-ask:", err);
      await interaction.editReply("Error analyzing the image.");
    }
  }

  if (interaction.commandName === "custom-acc") {
    if (interaction.user.id !== process.env.OWNER_ID) {
      return interaction.reply({ content: "No permission.", ephemeral: true });
    }
    const username = interaction.options.getString("username");
    const password = interaction.options.getString("password");
    try {
      db.prepare("INSERT INTO admins (username, password) VALUES (?, ?)").run(username, password);
      console.log(`Admin created: ${username}`);
      interaction.reply({ content: `Admin account '${username}' created!`, ephemeral: true });
    } catch (err) {
      console.error("Error creating admin:", err);
      interaction.reply({ content: "Account creation failed (might already exist).", ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

app.get("/", (req, res) => {
  res.send("KittyAI Bot is running!");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
