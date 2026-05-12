import { clients } from './config/clients';
import { syncVendas } from './syncVendas';

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

  for (const client of clients) {
    const res = await syncVendas(client, startDateStr, endDateStr);
    
    if (res.success) {
      results.push(`✅ *${client.name}*: ${res.count} vendas (${res.newRecords} novos)`);
    } else {
      results.push(`❌ *${client.name}*: Erro (${res.error})`);
    }
  }

  // Relatório Final no Terminal
  const report = `
📊 *RELATÓRIO DE SINCRONISMO DO PERÍODO (${startDateStr} a ${endDateStr})*
-----------------------------------------------------------
${results.join('\n')}
-----------------------------------------------------------
🚀 Sincronismo do Período Concluído!
  `;

  console.log(report);
  console.timeEnd("⏱️ Tempo Total");
}

main().catch(err => {
  console.error("💥 Erro crítico no processo de período:", err);
  process.exit(1);
});
