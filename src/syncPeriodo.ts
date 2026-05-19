import { clients } from './config/clients';
import { syncVendas } from './syncVendas';
import { sendTelegramMessage } from './services/telegramService';

// Função para formatar as datas dinamicamente
function getDateStr(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

async function main() {
  const args = process.argv.slice(2);
  
  let startDateStr = args[0];
  let endDateStr = args[1];

  // Se não foi passada data inicial, define como 3 dias atrás por padrão (limite máximo da API)
  if (!startDateStr) {
    startDateStr = getDateStr(3); // ex: 09-05-2026
  }

  // Se não foi passada data final, define como ontem (último dia consolidado)
  if (!endDateStr) {
    endDateStr = getDateStr(1); // ex: 11-05-2026
  }

  console.log("🏁 INICIANDO PROCESSAMENTO MANUAL DE PERÍODO (MÁXIMO DE 3 DIAS)...");
  console.log(`📅 Período selecionado: ${startDateStr} até ${endDateStr}`);
  console.log(`💡 Nota: A tabela da API de Vendas retém apenas os últimos 3 dias de histórico.`);
  console.time("⏱️ Tempo Total");

  const results: string[] = [];
  let totalNovosGeral = 0;

  for (const client of clients) {
    const res = await syncVendas(client, startDateStr, endDateStr);
    
    if (res.success) {
      const novos = res.newRecords || 0;
      totalNovosGeral += novos;
      results.push(`✅ *${client.name}*: ${res.count} vendas (${novos} novos)`);
    } else {
      results.push(`❌ *${client.name}*: Erro (${res.error})`);
      totalNovosGeral += 1; // Forçar envio em caso de erro para alerta de falha
    }
  }

  // Relatório Final
  const report = `
📊 *RELATÓRIO DE SINCRONISMO DO PERÍODO (${startDateStr} a ${endDateStr})*
-----------------------------------------------------------
${results.join('\n')}
-----------------------------------------------------------
🚀 Sincronismo do Período Concluído!
  `;

  console.log(report);
  
  // Enviar para Telegram apenas se houver novidades ou erro
  if (totalNovosGeral > 0) {
    await sendTelegramMessage(report);
    console.log("📨 Notificação enviada para o Telegram.");
  } else {
    console.log("🤫 Sem novos registros. Notificação suprimida.");
  }

  console.timeEnd("⏱️ Tempo Total");
}

main().catch(err => {
  console.error("💥 Erro crítico no processo de período:", err);
  process.exit(1);
});
