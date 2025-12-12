import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Bot sozlamalari - webhook rejimida
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  webHook: true 
});

// Webhook URL ni o'rnatish
const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://your-app-name.onrender.com`;
bot.setWebHook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);

// OpenAI sozlamalari
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Express middleware
app.use(express.json());

// Health check endpoint (Render uchun)
app.get('/', (req, res) => {
  res.send('Legal Telegram Bot ishlayapti! ✅');
});

// Webhook endpoint
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Telegram xabarlarini qayta ishlash
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const question = msg.text;

  // Agar xabar yo'q yoki buyruq bo'lsa
  if (!question || question.startsWith('/')) {
    if (question === '/start') {
      await bot.sendMessage(
        chatId,
        "Ассалому алайкум! Мен юридик маслаҳат берувчи ботман. Ўзбекистон қонунчилиги бўйича саволларингизни беринг. 👨‍⚖️"
      );
    }
    return;
  }

  // "Yozmoqda..." holatini ko'rsatish
  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Сен юрист ёрдамчиси ботсан. Саволларга фақат Ўзбекистон қонунчилиги асосида жавоб бер. 

Қоидалар:
1. Жавобни аниқ ва тушунарли қилиб ёз
2. Мумкин бўлса, тегишли қонун ёки кодекс моддасига ҳавола бер
3. Агар савол мураккаб ёки аниқ вазият бўлса, охирида адвокат хизматидан фойдаланишни тавсия қил
4. Фақат ишончли маълумот бер, билмасанг "аниқ жавоб бера олмайман" де
5. Ўзбекча жавоб бер, расмий-ҳуқуқий тил ишлат

Эслатма: Бу фақат умумий маълумот, хар бир ҳолат индивидуал тарзда кўриб чиқилиши керак.`,
        },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const answer = response.choices[0].message.content;
    
    // Javobni yuborish
    await bot.sendMessage(chatId, answer, {
      parse_mode: 'Markdown'
    });

  } catch (err) {
    console.error('Xatolik:', err);
    await bot.sendMessage(
      chatId,
      "❌ Хатолик юз берди. Илтимос, саволингизни қайта юборинг ёки бироз кутиб туринг."
    );
  }
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlamoqda`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);
});
