import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Bot sozlamalari
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
  webHook: true 
});

const WEBHOOK_URL = process.env.WEBHOOK_URL || `https://legal-telegram-bot.onrender.com`;
bot.setWebHook(`${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);

// OpenAI sozlamalari
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Kanal username
const CHANNEL_USERNAME = "@termezadvokat";

// Express middleware
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Legal Telegram Bot ishlayapti! ✅');
});

// Webhook endpoint
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Kanalga obuna tekshirish funksiyasi
async function checkChannelSubscription(userId) {
  try {
    const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
    // Agar a'zo bo'lsa yoki admin bo'lsa - true qaytaradi
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Obuna tekshiruvida xato:', error);
    return false;
  }
}

// /start komandasi
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || "Foydalanuvchi";
  
  // Kanalga obuna tekshiruvi
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
  
  // Agar obuna bo'lgan bo'lsa
  await bot.sendMessage(chatId,
    `Ассалому алайкум, ${firstName}! Хуш келибсиз! 👋\n\n` +
    `Мен юридик маслаҳат берувчи ботман. Сизга Ўзбекистон Республикаси қонунчилиги бўйича саволларга жавоб бера оламан. 👨‍⚖️\n\n` +
    `📋 Мен қуйидаги соҳаларда ёрдам бера оламан:\n` +
    `• Фуқаролик ҳуқуқи\n` +
    `• Оила ҳуқуқи\n` +
    `• Меҳнат ҳуқуқи\n` +
    `• Мулк ҳуқуқи\n` +
    `• Жиноят ҳуқуқи\n` +
    `• Маъмурий ҳуқуқ\n\n` +
    `❓ Саволингизни ёзинг, мен тезкор жавоб бераман!`
  );
});

// Oddiy xabarlarni qayta ishlash
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const question = msg.text;
  const firstName = msg.from.first_name || "Foydalanuvchi";

  // Agar buyruq bo'lsa, o'tkazib yuborish
  if (!question || question.startsWith('/')) {
    return;
  }

  // Kanalga obuna tekshiruvi
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

  // "Yozmoqda..." holatini ko'rsatish
  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Сиз Ўзбекистон Республикаси қонунчилиги бўйича профессионал юрист ва маслаҳатчисиз. Сизнинг вазифангиз - фойдаланувчиларга ўзбекча тилида аниқ, тушунарли ва фойдали юридик маслаҳатлар бериш.

🎯 АСОСИЙ ВАЗИФАЛАР:

1. **Самимий мулоқот**: Фойдаланувчи билан ҳурмат ва самимийлик билан мулоқот қилинг. Керак бўлса, исми билан мурожаат қилинг.

2. **Аниқ жавоблар**: Жавобларни қисқа, лўнда ва тушунарли қилиб беринг. Юридик жаргонларни оддий тилда тушунтиринг.

3. **Қонунга асосланган**: Барча жавобларни Ўзбекистон Республикаси қонунчилигига (Фуқаролик кодекси, Оила кодекси, Меҳнат кодекси, Жиноят кодекси ва б.) асосланг.

4. **Кодекс моддаларига ҳавола**: Имкон қадар тегишли қонун ёки кодекс моддасига аниқ ҳавола беринг. Масалан: "Фуқаролик кодексининг 1-моддасига кўра..."

5. **Амалий кўрсатмалар**: Фойдаланувчига қандай ҳаракат қилиш кераклигини аниқ кўрсатиб беринг (қайси ҳужжатлар керак, қаерга мурожаат қилиш керак).

6. **Профессионал огоҳлантириш**: Агар савол жуда мураккаб бўлса ёки аниқ ҳолатга боғлиқ бўлса, охирида шахсий адвокат билан маслаҳатлашишни тавсия қилинг.

7. **Билмаганингизни тан олинг**: Агар савол сизнинг билимингиздан ташқарида бўлса, очиқ айтинг ва мутахассисга мурожаат қилишни тавсия беринг.

📚 АСОСИЙ ҚОНУНЛАР:
- Ўзбекистон Республикаси Конституцияси
- Фуқаролик кодекси (ФК)
- Оила кодекси (ОК)
- Меҳнат кодекси (МК)
- Жиноят кодекси (ЖК)
- Маъмурий жавобгарлик тўғрисида кодекс
- Фуқаролик процессуал кодекси
- Жиноят процессуал кодекси

🎨 ЖАВОБ ФОРМАТИ:
- Саломлашинг (агар керак бўлса)
- Қисқа ва аниқ жавоб
- Қонун/кодекс моддасига ҳавола
- Амалий кўрсатма
- Керак бўлса, адвокат маслаҳати (мураккаб ҳолатларда)

💡 ЭСЛАТМА: 
Сиз умумий маълумот ва консултация берасиз. Ҳар бир ҳолат индивидуал, шунинг учун аниқ вазиятларда профессионал юрист маслаҳати зарур.

Энди фойдаланувчининг саволига жавоб беринг - самимий, аниқ ва фойдали!`
        },
        { role: "user", content: question }
      ],
      temperature: 0.7,
      max_tokens: 1500,
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
      `❌ Кечирасиз, жавоб беришда хатолик юз берди. Илтимос, саволингизни қайта юборинг ёки бироз кутиб туринг.\n\n` +
      `Агар муаммо давом этса, каналимизга хабар беринг: ${CHANNEL_USERNAME}`
    );
  }
});

// Serverni ishga tushirish
app.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlamoqda`);
  console.log(`Webhook URL: ${WEBHOOK_URL}/bot${process.env.BOT_TOKEN}`);
  console.log(`Kanal: ${CHANNEL_USERNAME}`);
});
