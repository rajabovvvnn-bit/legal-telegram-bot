import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= BOT ================= */

const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: true });

const WEBHOOK_URL =
  process.env.WEBHOOK_URL || "https://legal-telegram-bot.onrender.com";

bot.setWebHook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);

/* ================= AI ================= */

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Gemini (YANGI, TO‘G‘RI)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash", // ✅ tavsiya
});

/* ================= CONFIG ================= */

const CHANNEL_USERNAME = "@termezadvokat";
const DAILY_LIMIT = 10;
const userDailyLimits = new Map();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Legal Telegram Bot ishlayapti ✅ (Gemini 2.5 + OpenAI)");
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

/* ================= HELPERS ================= */

async function checkChannelSubscription(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch {
    return false;
  }
}

function checkDailyLimit(userId) {
  const key = `${userId}_${new Date().toDateString()}`;
  const count = userDailyLimits.get(key) || 0;
  if (count >= DAILY_LIMIT) return false;
  userDailyLimits.set(key, count + 1);
  return true;
}

/* ================= GEMINI ================= */

async function getGeminiResponse(question) {
  const systemPrompt = `
Сиз Ўзбекистон Республикаси қонунчилиги бўйича профессионал юрист ассистентисиз.

ҚОИДАЛАР:
1. Фақат ўзбекча жавоб беринг
2. Қисқа ва аниқ (3–5 абзац)
3. Қонун моддаларига ҳавола
4. Амалий йўл-йўриқ
5. Керак бўлса адвокатга йўналтиринг
`;

  try {
    const result = await geminiModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: systemPrompt },
            { text: `Савол: ${question}` },
          ],
        },
      ],
    });

    return result.response.text();
  } catch (error) {
    console.error("❌ Gemini xatosi:", error.message);
    throw error;
  }
}

/* ================= OPENAI ================= */

async function getOpenAIResponse(question) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Сиз Ўзбекистон қонунчилиги бўйича юқори малакали юристсиз.",
      },
      { role: "user", content: question },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  });

  return response.choices[0].message.content;
}

/* ================= BOT LOGIC ================= */

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  if (!(await checkChannelSubscription(userId))) {
    await bot.sendMessage(
      chatId,
      `❗️ Илтимос, аввал каналга обуна бўлинг:\n${CHANNEL_USERNAME}`
    );
    return;
  }

  if (!checkDailyLimit(userId)) {
    await bot.sendMessage(
      chatId,
      `❌ Кунлик лимит (${DAILY_LIMIT}) тугади. Эртага қайта уриниб кўринг.`
    );
    return;
  }

  await bot.sendChatAction(chatId, "typing");

  try {
    let answer, ai;

    try {
      answer = await getGeminiResponse(text);
      ai = "Gemini 2.5 Flash";
    } catch {
      answer = await getOpenAIResponse(text);
      ai = "OpenAI (fallback)";
    }

    await bot.sendMessage(
      chatId,
      `${answer}\n\n───────────\n🤖 _${ai}_`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await bot.sendMessage(chatId, "❌ Хатолик юз берди. Кейинроқ уриниб кўринг.");
  }
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT}-portda`);
  console.log("🤖 Gemini 2.5 + OpenAI");
});
