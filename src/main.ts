import { clients } from './config/clients';
import { syncVendas } from './syncVendas';
import { sendTelegramMessage } from './services/telegramService';

async function main() {
  console.log("🏁 INICIANDO PROCESSAMENTO MULTI-CLIENTE...");
  console.time("⏱️ Tempo Total");

  const results: string[] = [];

  let totalNovosGeral = 0;
  for (const client of clients) {
    const res = await syncVendas(client);
    
    if (res.success) {
      const novos = res.newRecords || 0;
      totalNovosGeral += novos;
      results.push(`✅ *${client.name}*: ${res.count} vendas (${novos} novos)`);
    } else {
      results.push(`❌ *${client.name}*: Erro (${res.error})`);
      totalNovosGeral += 1; // Forçar envio em caso de erro para alerta
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
  
  // Enviar para Telegram apenas se houver novidades ou erro
  if (totalNovosGeral > 0) {
    await sendTelegramMessage(report);
    console.log("📨 Notificação enviada para o Telegram.");
  } else {
    console.log("🤫 Sem novos registros. Notificação suprimida.");
  }

  console.log("\n🚀 [FINALIZADO] Todos os clientes foram processados.");
  console.timeEnd("⏱️ Tempo Total");
}

main();
