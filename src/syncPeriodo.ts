import { clients } from './config/clients';
import { syncVendas } from './syncVendas';

async function main() {
  // Pega as datas passadas como argumento (ex: npm run sync:periodo 20-04-2026 12-05-2026)
  const args = process.argv.slice(2);
  
  let startDate = args[0];
  let endDate = args[1];

  // Se não foi passada data inicial, define como 20/04/2026 por padrão
  if (!startDate) {
    startDate = "20-04-2026";
  }

  // Se não foi passada data final, define como a data de hoje por padrão
  if (!endDate) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    endDate = `${dd}-${mm}-${yyyy}`;
  }

  console.log("🏁 INICIANDO PROCESSAMENTO MANUAL DE PERÍODO CUSTOMIZADO...");
  console.log(`📅 Período selecionado: ${startDate} até ${endDate}\n`);
  console.time("⏱️ Tempo Total");

  const results: string[] = [];

  for (const client of clients) {
    const res = await syncVendas(client, startDate, endDate);
    
    if (res.success) {
      results.push(`✅ *${client.name}*: ${res.count} vendas (${res.newRecords} novos)`);
    } else {
      results.push(`❌ *${client.name}*: Erro (${res.error})`);
    }
  }

  // Relatório Final no Terminal
  const report = `
📊 *RELATÓRIO DE SINCRONISMO DE PERÍODO (${startDate} a ${endDate})*
---------------------------------------
${results.join('\n')}
---------------------------------------
🚀 Sincronismo de Período Concluído!
  `;

  console.log(report);
  console.timeEnd("⏱️ Tempo Total");
}

main().catch(err => {
  console.error("💥 Erro crítico no processo de período:", err);
  process.exit(1);
});
