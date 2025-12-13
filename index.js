import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Bot sozlamalari
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  webHook: true 
});

const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://legal-telegram-bot.onrender.com`;
bot.setWebHook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);

// AI sozlamalari
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-pro",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1000,
  }
});

// Kanal sozlamalari
const CHANNEL_USERNAME = "@termezadvokat";

// Foydalanuvchilar uchun kunlik limit (xotirada saqlanadi)
const userDailyLimits = new Map();
const DAILY_LIMIT = 10; // Kuniga 10 ta savol

// Express middleware
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Legal Telegram Bot ishlayapti! ✅ (Hybrid: Gemini + OpenAI)');
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Kanalga obuna tekshirish
async function checkChannelSubscription(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Obuna tekshiruvida xato:', error);
    return false;
  }
}

// Kunlik limitni tekshirish
function checkDailyLimit(userId) {
  const today = new Date().toDateString();
  const userKey = `${userId}_${today}`;
  
  if (!userDailyLimits.has(userKey)) {
    userDailyLimits.set(userKey, 0);
  }
  
  const count = userDailyLimits.get(userKey);
  
  if (count >= DAILY_LIMIT) {
    return false;
  }
  
  userDailyLimits.set(userKey, count + 1);
  return true;
}

// Oddiy muloqot (salom, rahmat va h.k.)
function isSimpleGreeting(text) {
  const greetings = [
    'салом', 'ассалому алайкум', 'salom', 'assalomu alaykum',
    'хайр', 'хуш', 'xayr', 'xush'
  ];
  
  const thanks = ['раҳмат', 'rahmat', 'tashakkur', 'кўп раҳмат', "ko'p rahmat"];
  
  const lowerText = text.toLowerCase().trim();
  
  // Agar savol belgisi yoki "qanday", "nima" bo'lsa - bu savol, salomlashish emas
  if (lowerText.includes('?') || lowerText.includes('қандай') || 
      lowerText.includes('qanday') || lowerText.includes('нима') || 
      lowerText.includes('nima') || lowerText.includes('қилиш') ||
      lowerText.includes('qilish')) {
    return false;
  }
  
  // Faqat qisqa salomlashishlar (15 so'zdan kam)
  if (lowerText.split(' ').length > 15) {
    return false;
  }
  
  return greetings.some(greeting => lowerText.includes(greeting)) ||
         thanks.some(thank => lowerText.includes(thank));
}

// Murakkab savol (OpenAI kerak)
function isComplexQuestion(text) {
  const complexKeywords = [
    'зўравонлик', "zo'ravonlik", 'калтаклаш', 'kaltaklash',
    'жиноят', 'jinoyat', 'жиноий', 'jinoiy',
    'судга', 'sudga', 'суд', 'sud', 'арз', 'arz',
    'ҳибс', 'hibs', 'қамоқ', 'qamoq',
    'тергов', 'tergov', 'полиция', 'politsiya',
    'ички ишлар', 'ichki ishlar',
    'жиноий иш', 'jinoiy ish',
    'прокуратура', 'prokuratura'
  ];
  
  const lowerText = text.toLowerCase();
  return complexKeywords.some(keyword => lowerText.includes(keyword));
}

// Oddiy muloqotga javob
function getSimpleResponse(text) {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('салом') || lowerText.includes('salom') || 
      lowerText.includes('ассалому') || lowerText.includes('assalomu')) {
    return 'Ваалайкум ассалом! Саволингизни беринг. 😊';
  }
  
  if (lowerText.includes('раҳмат') || lowerText.includes('rahmat') || 
      lowerText.includes('ташаккур') || lowerText.includes('tashakkur')) {
    return 'Арзимайди! Яна саволларингиз бўлса, беришингиз мумкин. 😊';
  }
  
  if (lowerText.includes('хайр') || lowerText.includes('xayr')) {
    return 'Хайр! Муваффаққиятлар тилайман! 👋';
  }
  
  return null;
}

// Gemini bilan javob olish
async function getGeminiResponse(question) {
  const prompt = `Сиз Ўзбекистон Республикаси қонунчилиги бўйича профессионал юрист ассистентисиз.

ҚОИДАЛАР:
1. Фақат ўзбекча жавоб беринг
2. Жавобни қисқа, аниқ ва фойдали қилинг (3-5 параграф)
3. Тегишли қонун/кодекс моддасига ҳавола беринг
4. Амалий кўрсатма беринг (қандай ҳаракат қилиш керак)
5. Мураккаб ҳолатларда профессионал адвокатга мурожаат қилишни тавсия этинг

АСОСИЙ ҚОНУНЛАР: Конституция, Фуқаролик кодекси (ФК), Оила кодекси (ОК), Меҳнат кодекси (МК), Жиноят кодекси (ЖК), Маъмурий жавобгарлик кодекси.

Савол: ${question}

Жавоб:`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini xatosi:', error);
    throw error;
  }
}

// OpenAI bilan javob olish (murakkab savollar uchun)
async function getOpenAIResponse(question) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Сиз Ўзбекистон Республикаси қонунчилиги бўйича юқори малакали юрист ва маслаҳатчисиз. Мураккаб юридик ҳолатларда чуқур таҳлил ва самимий ёрдам берасиз.

ВАЗИФАЛАР:
1. Самимий ва эмпатик мулоқот
2. Чуқур юридик таҳлил
3. Кодекс моддаларига аниқ ҳавола
4. Психологик жиҳатни ҳам ҳисобга олиш
5. Қадам-ба-қадам йўл-йўриқ
6. Хавфсизлик ва ҳуқуқларни ҳимоя қилиш бўйича маслаҳат

АСОСИЙ ҚОНУНЛАР: Конституция, Фуқаролик, Оила, Меҳнат, Жиноят кодекслари.

Мураккаб ҳолатларда батафсил ва ҳамдардлик билан жавоб беринг.`
        },
        { role: "user", content: question }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI xatosi:', error);
    throw error;
  }
}

// /start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || "Foydalanuvchi";
  
  const isSubscribed = await checkChannelSubscription(userId);
  
  if (!isSubscribed) {
    await bot.sendMessage(chatId, 
      `Ассалому алайкум, ${firstName}! 👋\n\n` +
      `Мен Ўзбекистон қонунчилиги бўйича маслаҳат берувчи ботман. 👨‍⚖️\n\n` +
      `❗️ Ботдан фойдаланиш учун аввал каналимизга обуна бўлинг:\n\n` +
      `📢 ${CHANNEL_USERNAME}\n\n` +
      `Обуна бўлгандан кейин /start ни қайта босинг.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "📢 Каналга обуна бўлиш", url: `https://t.me/termezadvokat` }
          ]]
        }
      }
    );
    return;
  }
  
  await bot.sendMessage(chatId,
    `Ассалому алайкум, ${firstName}! Хуш келибсиз! 👋\n\n` +
    `Мен юридик маслаҳат берувчи ботман (AI асосида). 🤖👨‍⚖️\n\n` +
    `📋 Ёрдам бера оладиган соҳалар:\n` +
    `• Фуқаролик ҳуқуқи\n` +
    `• Оила ҳуқуқи\n` +
    `• Меҳнат ҳуқуқи\n` +
    `• Мулк ҳуқуқи\n` +
    `• Жиноят ҳуқуқи\n` +
    `• Маъмурий ҳуқуқ\n\n` +
    `⚡ Кунига ${DAILY_LIMIT} та саволга жавоб бера оламан.\n\n` +
    `❓ Саволингизни ёзинг!`
  );
});

// Xabarlarni qayta ishlash
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const question = msg.text;
  const firstName = msg.from.first_name || "Foydalanuvchi";

  if (!question || question.startsWith('/')) {
    return;
  }

  // Obuna tekshiruvi
  const isSubscribed = await checkChannelSubscription(userId);
  
  if (!isSubscribed) {
    await bot.sendMessage(chatId,
      `${firstName}, savolga javob olish uchun avval kanalimizga obuna bo'ling! 📢\n\n` +
      `${CHANNEL_USERNAME}`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: "📢 Каналга обуна бўлиш", url: `https://t.me/termezadvokat` }
          ]]
        }
      }
    );
    return;
  }

  // 1. ODDIY MULOQOT (avtomatik javob)
  if (isSimpleGreeting(question)) {
    const simpleResponse = getSimpleResponse(question);
    if (simpleResponse) {
      await bot.sendMessage(chatId, simpleResponse);
      return;
    }
  }

  // Kunlik limitni tekshirish
  if (!checkDailyLimit(userId)) {
    await bot.sendMessage(chatId,
      `${firstName}, афсуски, сиз бугунги кунлик лимитни (${DAILY_LIMIT} та савол) тўлдирдингиз. 😔\n\n` +
      `Эртага қайта уриниб кўринг ёки каналимизда бошқа фойдали маълумотларни кўринг:\n` +
      `${CHANNEL_USERNAME}`
    );
    return;
  }

  await bot.sendChatAction(chatId, 'typing');

  try {
    let answer;
    let aiUsed;

    // 2. MURAKKAB SAVOL → OpenAI
    if (isComplexQuestion(question)) {
      console.log(`[OpenAI] Murakkab savol: ${question.substring(0, 50)}...`);
      answer = await getOpenAIResponse(question);
      aiUsed = "OpenAI GPT-4o-mini";
    } 
    // 3. ODDIY/O'RTACHA SAVOL → Gemini (bepul)
    else {
      console.log(`[Gemini] Oddiy savol: ${question.substring(0, 50)}...`);
      try {
        answer = await getGeminiResponse(question);
        aiUsed = "Google Gemini (бепул)";
      } catch (geminiError) {
        console.error('[Gemini xatosi, OpenAI ga o\'tish]:', geminiError.message);
        answer = await getOpenAIResponse(question);
        aiUsed = "OpenAI GPT-4o-mini (fallback)";
      }
    }

    // Javobni yuborish (AI nomini albatta ko'rsatish)
    await bot.sendMessage(chatId, 
      `${answer}\n\n───────────\n🤖 _${aiUsed}_`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('AI xatosi:', error);
    
    // Fallback: ikkinchi AI ni sinash
    try {
      console.log('[Fallback] Boshqa AI ga urinish...');
      const fallbackAnswer = isComplexQuestion(question) 
        ? await getGeminiResponse(question)
        : await getOpenAIResponse(question);
      
      const fallbackAI = isComplexQuestion(question) 
        ? "Google Gemini (fallback)" 
        : "OpenAI GPT-4o-mini (fallback)";
      
      await bot.sendMessage(chatId, 
        `${fallbackAnswer}\n\n───────────\n🤖 _${fallbackAI}_`,
        { parse_mode: 'Markdown' }
      );
    } catch (fallbackError) {
      console.error('Fallback xatosi:', fallbackError);
      await bot.sendMessage(chatId,
        `❌ Кечирасиз, жавоб беришда хатолик юз берди.\n\n` +
        `Хато: ${fallbackError.message}\n\n` +
        `Илтимос, бироз кутиб, қайта уриниб кўринг ёки каналимизга хабар қилинг:\n` +
        `${CHANNEL_USERNAME}`
      );
    }
  }
});

// Server
app.listen(PORT, () => {
  console.log(`✅ Server ${PORT}-portda ishlamoqda`);
  console.log(`📢 Kanal: ${CHANNEL_USERNAME}`);
  console.log(`🤖 AI: Hybrid (Gemini + OpenAI)`);
  console.log(`📊 Kunlik limit: ${DAILY_LIMIT} savol/foydalanuvchi`);
});
