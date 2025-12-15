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

// Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

/* ================= CONFIG ================= */

const CHANNEL_USERNAME = "@termezadvokat";
const ADMIN_CHANNEL_ID = -1003417513618; // Admin kanali (Bot loglari)
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
    console.log(`🔍 [OBUNA] User ID: ${userId}, Kanal: ${CHANNEL_USERNAME}`);
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    console.log(`📊 [OBUNA] Status: ${member.status}`);
    const isSubscribed = ["member", "administrator", "creator"].includes(member.status);
    console.log(`✅ [OBUNA] Natija: ${isSubscribed ? "Obunachi" : "Obuna emas"}`);
    return isSubscribed;
  } catch (error) {
    console.error(`❌ [OBUNA] Xato: ${error.message}`);
    return false;
  }
}

function checkDailyLimit(userId) {
  const key = `${userId}_${new Date().toDateString()}`;
  const count = userDailyLimits.get(key) || 0;
  if (count >= DAILY_LIMIT) {
    console.log(`⚠️ [LIMIT] User ${userId}: ${count}/${DAILY_LIMIT} - LIMIT`);
    return false;
  }
  userDailyLimits.set(key, count + 1);
  console.log(`✅ [LIMIT] User ${userId}: ${count + 1}/${DAILY_LIMIT}`);
  return true;
}

/* ================= GEMINI ================= */

async function getGeminiResponse(question) {
  const systemPrompt = `
Сиз Ўзбекистон Республикаси қонунчилиги бўйича профессионал юрист ассистентисиз.

ҚОИДАЛАР:
1. Фақат ўзбекча жавоб беринг
2. Қисқа ва аниқ (3–5 абзац)
3. Қонун/кодекс моддаларига ҳавола беринг
4. Амалий йўл-йўриқ беринг (қандай ҳаракат қилиш керак)
5. МУҲИМ: Жавоб охирида албатта қуйидагини қўшинг:
   "⚖️ Мураккаб ҳолатларда профессионал адвокат маслаҳати тавсия этилади."

АСОСИЙ ҚОНУНЛАР: Конституция, Фуқаролик кодекси (ФК), Оила кодекси (ОК), 
Меҳнат кодекси (МК), Жиноят кодекси (ЖК), Маъмурий жавобгарлик кодекси.
`;

  try {
    console.log(`🤖 [GEMINI] Savol: ${question.substring(0, 50)}...`);
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

    const answer = result.response.text();
    console.log(`✅ [GEMINI] Javob uzunligi: ${answer.length} belgi`);
    return answer;
  } catch (error) {
    console.error(`❌ [GEMINI] Xato: ${error.message}`);
    throw error;
  }
}

/* ================= OPENAI ================= */

async function getOpenAIResponse(question) {
  console.log(`🤖 [OPENAI] Savol: ${question.substring(0, 50)}...`);
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Сиз Ўзбекистон Республикаси қонунчилиги бўйича юқори малакали юристсиз.

ВАЗИФАЛАР:
1. Самимий ва эмпатик мулоқот
2. Чуқур юридик таҳлил
3. Кодекс моддаларига аниқ ҳавола
4. Қадам-ба-қадам йўл-йўриқ
5. МУҲИМ: Жавоб охирида албатта қуйидагини қўшинг:
   "⚖️ Мураккаб ҳолатларда профессионал адвокат маслаҳати тавсия этилади."

АСОСИЙ ҚОНУНЛАР: Конституция, Фуқаролик, Оила, Меҳнат, Жиноят кодекслари.`,
      },
      { role: "user", content: question },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  });

  const answer = response.choices[0].message.content;
  console.log(`✅ [OPENAI] Javob uzunligi: ${answer.length} belgi`);
  return answer;
}

/* ================= BOT LOGIC ================= */

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  const firstName = msg.from.first_name || "Foydalanuvchi";

  console.log(`📨 [MSG] User: ${firstName} (${userId}), Chat: ${chatId}, Text: "${text?.substring(0, 30)}..."`);

  if (!text || text.startsWith("/")) {
    console.log(`⏭️ [MSG] O'tkazib yuborildi: buyruq yoki bo'sh`);
    return;
  }

  // Obuna tekshiruvi
  const isSubscribed = await checkChannelSubscription(userId);
  
  if (!isSubscribed) {
    console.log(`🚫 [MSG] Obuna yo'q, xabar yuborilmoqda`);
    await bot.sendMessage(
      chatId,
      `Ассалому алайкум, ${firstName}! 👋\n\n` +
      `❗️ Ботдан фойдаланиш учун аввал каналимизга обуна бўлинг:\n\n` +
      `📢 ${CHANNEL_USERNAME}\n\n` +
      `Обуна бўлгандан кейин қайта уриниб кўринг.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "📢 Каналга обуна бўлиш", url: "https://t.me/termezadvokat" }
          ]]
        }
      }
    );
    return;
  }

  // Kunlik limit
  if (!checkDailyLimit(userId)) {
    console.log(`🚫 [MSG] Limit tugadi`);
    await bot.sendMessage(
      chatId,
      `${firstName}, афсуски, сиз бугунги кунлик лимитни (${DAILY_LIMIT} та савол) тўлдирдингиз. 😔\n\n` +
      `Эртага қайта уриниб кўринг ёки каналимизда бошқа фойдали маълумотларни кўринг:\n` +
      `${CHANNEL_USERNAME}`
    );
    return;
  }

  await bot.sendChatAction(chatId, "typing");

  try {
    let answer, aiUsed;

    // Avval Gemini (bepul)
    try {
      answer = await getGeminiResponse(text);
      aiUsed = "Gemini";
    } catch (geminiError) {
      console.log(`⚠️ [AI] Gemini ishlamadi, OpenAI ga o'tish`);
      answer = await getOpenAIResponse(text);
      aiUsed = "OpenAI (fallback)";
    }

    console.log(`✅ [AI] Javob tayyor: ${aiUsed}`);
    
    // Foydalanuvchiga faqat javob (AI nomisiz)
    await bot.sendMessage(chatId, answer);
    
    // Admin kanaliga log yuborish
    try {
      const logMessage = 
        `📊 YANGI SAVOL-JAVOB\n\n` +
        `👤 Foydalanuvchi: ${firstName}\n` +
        `🆔 User ID: ${userId}\n` +
        `📅 Vaqt: ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}\n\n` +
        `❓ SAVOL:\n${text}\n\n` +
        `💬 JAVOB (${aiUsed}):\n${answer.substring(0, 3000)}${answer.length > 3000 ? '...' : ''}\n\n` +
        `────────────────\n` +
        `🤖 AI: ${aiUsed}\n` +
        `📊 Kunlik: ${userDailyLimits.get(`${userId}_${new Date().toDateString()}`) || 1}/${DAILY_LIMIT}`;
      
      await bot.sendMessage(ADMIN_CHANNEL_ID, logMessage);
      console.log(`📤 [ADMIN] Log yuborildi`);
    } catch (logError) {
      console.error(`❌ [ADMIN] Log yuborishda xato: ${logError.message}`);
    }
    
    // Admin uchun console log
    console.log(`📤 [MSG] Yuborildi: ${aiUsed}`);

  } catch (err) {
    console.error(`❌ [ERROR] ${err.message}`);
    await bot.sendMessage(
      chatId, 
      "❌ Кечирасиз, жавоб беришда хатолик юз берди.\n\n" +
      "Илтимос, бироз кутиб, қайта уриниб кўринг ёки каналимизга хабар қилинг:\n" +
      `${CHANNEL_USERNAME}`
    );
  }
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT}-portda ishlamoqda`);
  console.log(`📢 Kanal: ${CHANNEL_USERNAME}`);
  console.log(`🤖 AI: Gemini 2.5 Flash + OpenAI GPT-4o-mini (fallback)`);
  console.log(`📊 Kunlik limit: ${DAILY_LIMIT} savol/foydalanuvchi`);
});
