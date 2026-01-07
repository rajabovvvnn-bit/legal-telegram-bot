import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */

// 1. ЯНГИ КАНАЛ ЮЗЕРНЕЙМИ
const CHANNEL_USERNAME = "@Advokat_AI_Uz"; 

// 2. АДМИН ID (Лимитсиз фойдаланиш учун)
const ADMIN_ID = 6248612364; 

const ADMIN_CHANNEL_ID = -1003417513618; 
const DAILY_LIMIT = 10;
const userDailyLimits = new Map();

/* ================= BOT & AI ================= */

const bot = new TelegramBot(process.env.BOT_TOKEN, { webHook: true });
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://legal-telegram-bot.onrender.com";
bot.setWebHook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Сизнинг севимли Gemini 2.5 моделингиз
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash", 
});

app.use(express.json());

/* ================= HELPERS ================= */

async function checkChannelSubscription(userId) {
  // Админ учун истисно
  if (userId === ADMIN_ID) return true;

  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (error) {
    console.error(`❌ [OBUNA] Xato: ${error.message}`);
    return false;
  }
}

function checkDailyLimit(userId) {
  // Админ учун лимит йўқ
  if (userId === ADMIN_ID) return true;

  const key = `${userId}_${new Date().toDateString()}`;
  const count = userDailyLimits.get(key) || 0;
  if (count >= DAILY_LIMIT) {
    return false;
  }
  userDailyLimits.set(key, count + 1);
  return true;
}

/* ================= AI FUNCTIONS ================= */

async function getGeminiResponse(question) {
  const systemPrompt = `Сиз Ўзбекистон Республикаси қонунчилиги бўйича профессионал юрист ассистентисиз. Фақат ўзбекча, қисқа ва моддаларга таянган ҳолда жавоб беринг. Охирида: '⚖️ Мураккаб ҳолатларда профессионал адвокат маслаҳати тавсия этилади.' деб ёзинг.`;
  try {
    const result = await geminiModel.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: systemPrompt }, { text: `Савол: ${question}` }]
      }]
    });
    return result.response.text();
  } catch (error) {
    throw error;
  }
}

async function getOpenAIResponse(question) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Сиз Ўзбекистон Республикаси қонунчилиги бўйича юқори малакали юристсиз." },
      { role: "user", content: question }
    ],
    temperature: 0.8,
  });
  return response.choices[0].message.content;
}

/* ================= BOT LOGIC ================= */

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const firstName = msg.from.first_name || "Foydalanuvchi";

  if (!text || text.startsWith("/")) return;

  // Обуна текшируви
  const isSubscribed = await checkChannelSubscription(userId);
  if (!isSubscribed) {
    return bot.sendMessage(
      chatId,
      `Ассалому алайкум, ${firstName}! 👋\n\n` +
      `Ботдан фойдаланиш учун аввал **Advokat & AI** каналимизга обуна бўлинг:\n\n` +
      `📢 ${CHANNEL_USERNAME}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "📢 Каналга обуна бўлиш", url: `https://t.me/Advokat_AI_Uz` }]]
        }
      }
    );
  }

  // Лимит текшируви
  if (!checkDailyLimit(userId)) {
    return bot.sendMessage(chatId, `Сизнинг бугунги кунлик лимитингиз (${DAILY_LIMIT} та савол) тугади. Эртага қайта уриниб кўринг. 😊`);
  }

  await bot.sendChatAction(chatId, "typing");

  try {
    let answer;
    try {
      answer = await getGeminiResponse(text);
    } catch (err) {
      answer = await getOpenAIResponse(text);
    }
    await bot.sendMessage(chatId, answer);
    
    // Админ каналига лог юбориш
    bot.sendMessage(ADMIN_CHANNEL_ID, `📊 Savol: ${text}\n👤 User: ${firstName}\n🆔 ID: ${userId}`).catch(()=>{});

  } catch (err) {
    bot.sendMessage(chatId, "❌ Кечирасиз, жавоб беришда хатолик юз берди.");
  }
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
