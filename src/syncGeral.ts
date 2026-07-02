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

async function syncVendasWithRetry(client: any, startDate: string, endDate: string, maxRetries = 3, delayMs = 5000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const res = await syncVendas(client, startDate, endDate);
    if (res.success) {
      return res;
    }
    if (attempt < maxRetries) {
      console.warn(`⚠️ [${client.name}] Falha na tentativa ${attempt}/${maxRetries}: ${res.error || 'Erro desconhecido'}. Tentando novamente em ${delayMs/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } else {
      console.error(`❌ [${client.name}] Falha definitiva após ${maxRetries} tentativas.`);
      return res;
    }
  }
  return { success: false, error: 'Falha desconhecida' };
}

async function main() {
  const args = process.argv.slice(2);
  
  let clientFilter: string | undefined = undefined;
  let startDateStr: string | undefined = undefined;
  let endDateStr: string | undefined = undefined;

  const dateRegex = /^\d{2}[-/]\d{2}[-/]\d{4}$/;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--client' && i + 1 < args.length) {
      clientFilter = args[++i];
    } else if (arg.startsWith('--client=')) {
      clientFilter = arg.split('=')[1];
    } else if (dateRegex.test(arg)) {
      if (!startDateStr) {
        startDateStr = arg.replace(/\//g, '-');
      } else if (!endDateStr) {
        endDateStr = arg.replace(/\//g, '-');
      }
    } else {
      clientFilter = arg;
    }
  }

  // Se não foi passada data inicial, define como 7 dias atrás por padrão
  if (!startDateStr) {
    startDateStr = getDateStr(7); // ex: 09-05-2026
  }

  // Se não foi passada data final, define como ontem (último dia consolidado)
  if (!endDateStr) {
    endDateStr = getDateStr(1); // ex: 11-05-2026
  }

  // Filtrar clientes se solicitado
  let targetClients = clients;
  if (clientFilter) {
    const query = clientFilter.toLowerCase().trim();
    targetClients = clients.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.apiEmail.toLowerCase().includes(query)
    );
    
    if (targetClients.length === 0) {
      console.error(`❌ Nenhum cliente encontrado para o filtro: "${clientFilter}"`);
      console.log(`💡 Clientes disponíveis: ${clients.map(c => c.name).join(', ')}`);
      process.exit(1);
    }
    console.log(`🎯 Filtrando sincronismo apenas para: ${targetClients.map(c => c.name).join(', ')}`);
  }

  console.log("🏁 INICIANDO PROCESSAMENTO GERAL...");
  console.log(`📅 Período selecionado: ${startDateStr} até ${endDateStr}`);
  console.log(`💡 Nota: A tabela da API de Vendas retém os últimos dias de histórico.`);
  console.time("⏱️ Tempo Total");

  console.log(`⚡ Sincronizando ${targetClients.length} clientes em paralelo...`);
  
  const resultsList = await Promise.all(
    targetClients.map(async (client) => {
      const res = await syncVendasWithRetry(client, startDateStr!, endDateStr!);
      return { client, res };
    })
  );

  const results: string[] = [];
  let totalNovosGeral = 0;

  for (const { client, res } of resultsList) {
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
📊 *RELATÓRIO DE SINCRONISMO GERAL (${startDateStr} a ${endDateStr})*
-----------------------------------------------------------
${results.join('\n')}
-----------------------------------------------------------
🚀 Sincronismo Geral Concluído!
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
  console.error("💥 Erro crítico no processo geral:", err);
  process.exit(1);
});
