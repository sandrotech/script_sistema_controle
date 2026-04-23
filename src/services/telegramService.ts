import axios from 'axios';
import "dotenv/config";

export async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️ Telegram não configurado (TOKEN ou CHAT_ID ausentes).");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
    console.log("📨 Notificação enviada para o Telegram.");
  } catch (error: any) {
    console.error("❌ Erro ao enviar mensagem para o Telegram:", error.message);
  }
}
