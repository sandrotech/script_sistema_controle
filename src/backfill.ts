import { clients } from './config/clients';
import { syncVendas } from './syncVendas';
import "dotenv/config";

// Helper function to get days in a month
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

async function runBackfill() {
  const args = process.argv.slice(2);
  let clientFilter = "Casa do Frango"; // Default client
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--client' || args[i] === '-c') && i + 1 < args.length) {
      clientFilter = args[++i];
    }
  }

  const client = clients.find(c => 
    c.name.toLowerCase().includes(clientFilter.toLowerCase()) || 
    c.apiEmail.toLowerCase().includes(clientFilter.toLowerCase())
  );

  if (!client) {
    console.error(`❌ Cliente "${clientFilter}" não encontrado no arquivo clients.ts.`);
    process.exit(1);
  }

  console.log(`🚀 Iniciando retroativo (Backfill) para: ${client.name}`);
  console.log(`📅 Período: 01/01/2026 até hoje`);
  console.log(`--------------------------------------------------`);

  const today = new Date();
  const currentYear = 2026;
  const currentMonth = today.getMonth(); // 0-indexed (ex: Julho = 6)
  const currentDay = today.getDate();

  // Define months to process (January = 0 to currentMonth)
  const months = [
    { name: "Janeiro", number: 0 },
    { name: "Fevereiro", number: 1 },
    { name: "Março", number: 2 },
    { name: "Abril", number: 3 },
    { name: "Maio", number: 4 },
    { name: "Junho", number: 5 },
    { name: "Julho", number: 6 },
  ];

  for (const m of months) {
    if (m.number > currentMonth) break;

    const pad = (n: number) => String(n).padStart(2, '0');
    const startDay = "01";
    const startMonthStr = pad(m.number + 1);
    
    let endDayStr = "";
    let endMonthStr = pad(m.number + 1);
    
    if (m.number === currentMonth) {
      // If it is the current month, only go up to today
      endDayStr = pad(currentDay);
    } else {
      // For past months, go to the last day of the month
      const lastDay = getDaysInMonth(currentYear, m.number);
      endDayStr = pad(lastDay);
    }

    const startDate = `${startDay}-${startMonthStr}-${currentYear}`;
    const endDate = `${endDayStr}-${endMonthStr}-${currentYear}`;

    console.log(`\n📅 [Mês: ${m.name}] Processando período: ${startDate} até ${endDate}...`);
    
    try {
      const res = await syncVendas(client, startDate, endDate);
      if (res.success) {
        console.log(`✅ [${m.name}] Sincronizado com sucesso! Registros: ${res.count}`);
      } else {
        console.error(`❌ [${m.name}] Erro na sincronização: ${res.error}`);
      }
    } catch (err: any) {
      console.error(`💥 [${m.name}] Erro crítico: ${err.message}`);
    }

    // Delay between months to prevent API overload
    console.log(`⏳ Aguardando 3 segundos antes do próximo mês...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.log(`\n🎉 Retroativo completo para ${client.name}!`);
}

runBackfill().catch(err => {
  console.error("💥 Erro no script de backfill:", err);
});
