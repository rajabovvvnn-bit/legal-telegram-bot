import TelegramBot from "node-telegram-bot-api";
import OpenAI from "openai";

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const question = msg.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Сен юрист ёрдамчиси ботсан. Саволларга фақат Ўзбекистон қонунчилиги асосида жавоб бер. Агар савол мураккаб ёки аниқ вазият бўлса, охирида адвокат хизматидан фойдаланишни тавсия қил.",
        },
        { role: "user", content: question },
      ],
    });

    const answer = response.choices[0].message.content;

    await bot.sendMessage(chatId, answer);
  } catch (err) {
    console.error(err);
    await bot.sendMessage(
      chatId,
      "Хатолик юз берди. Илтимос, саволингизни қайта юборинг."
    );
  }
});
