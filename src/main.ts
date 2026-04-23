import { clients } from './config/clients';
import { syncVendas } from './syncVendas';
import { sendTelegramMessage } from './services/telegramService';

async function main() {
  console.log("🏁 INICIANDO PROCESSAMENTO MULTI-CLIENTE...");
  console.time("⏱️ Tempo Total");

  const results: string[] = [];

  for (const client of clients) {
    const res = await syncVendas(client);
    
    if (res.success) {
      results.push(`✅ *${client.name}*: ${res.count} vendas`);
    } else {
      results.push(`❌ *${client.name}*: Erro (${res.error})`);
    }
  }

  // Montar Relatório Final
  const date = new Date().toLocaleDateString('pt-BR');
  const report = `
📊 *RELATÓRIO DE SINCRONISMO - ${date}*
---------------------------------------
${results.join('\n')}
---------------------------------------
🚀 Processamento Finalizado!
  `;

  console.log(report);
  
  // Enviar para Telegram
  await sendTelegramMessage(report);

  console.log("\n🚀 [FINALIZADO] Todos os clientes foram processados.");
  console.timeEnd("⏱️ Tempo Total");
}

main();
