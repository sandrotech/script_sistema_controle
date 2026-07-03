const axios = require('axios');
const fs = require('fs');

async function main() {
  const localFile = "vendas_ultra_rota_ytd.txt";
  if (!fs.existsSync(localFile)) {
    console.error(`❌ Arquivo local ${localFile} não encontrado.`);
    return;
  }

  // 1. Ler e parsear vendas locais (Cometa API salvas no TXT)
  console.log(`📖 Lendo dados locais do arquivo ${localFile}...`);
  const content = fs.readFileSync(localFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  
  const localData = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 8) continue;
    
    // Normalizar a data de DD/MM/YYYY para YYYY-MM-DD
    const dateParts = cols[0].split('/');
    const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    
    const venda = parseFloat(cols[7]) || 0;
    localData.push({
      data: dateStr,
      venda: venda
    });
  }

  // Agrupar local por data
  const localGroupByDate = {};
  localData.forEach(item => {
    if (!localGroupByDate[item.data]) {
      localGroupByDate[item.data] = { count: 0, total: 0 };
    }
    localGroupByDate[item.data].count++;
    localGroupByDate[item.data].total += item.venda;
  });

  // 2. Buscar vendas da API do Dashboard
  const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
  const email = 'victor@ultrarota.com.br';
  console.log(`🌐 Buscando vendas da API do Dashboard (${url}) para o e-mail ${email}...`);

  try {
    const response = await axios.get(url, {
      params: {
        dataInicial: '01-01-2026',
        dataFinal: '03-07-2026'
      },
      headers: {
        'X-User-Email': email
      }
    });

    const apiVendas = response.data;
    console.log(`✅ Recebidas ${apiVendas.length} vendas do Dashboard no total.`);

    // Filtrar apenas origem API_VENDAS_V2 para comparação direta
    const apiVendasV2 = apiVendas.filter(v => v.origem === 'API_VENDAS_V2');
    console.log(`   - Filtradas ${apiVendasV2.length} vendas com origem 'API_VENDAS_V2'.`);

    // Agrupar API_VENDAS_V2 por data
    const apiGroupByDate = {};
    apiVendasV2.forEach(v => {
      const dateStr = v.data.split('T')[0]; // Ex: "2026-06-01"
      const venda = parseFloat(v.venda) || 0;
      if (!apiGroupByDate[dateStr]) {
        apiGroupByDate[dateStr] = { count: 0, total: 0 };
      }
      apiGroupByDate[dateStr].count++;
      apiGroupByDate[dateStr].total += venda;
    });

    // 3. Comparar dia a dia
    console.log("\n📊 COMPARATIVO DIA A DIA (COMETA API vs DASHBOARD API - origem: API_VENDAS_V2):");
    console.log("--------------------------------------------------------------------------------------");
    console.log("Data       | Cometa Qtd | Dash Qtd | Diferença Qtd | Cometa Total | Dash Total | Dif Total");
    console.log("--------------------------------------------------------------------------------------");

    const allDates = Array.from(new Set([
      ...Object.keys(localGroupByDate),
      ...Object.keys(apiGroupByDate)
    ])).sort();

    let totalLocalCount = 0;
    let totalLocalSum = 0;
    let totalApiCount = 0;
    let totalApiSum = 0;

    allDates.forEach(date => {
      const local = localGroupByDate[date] || { count: 0, total: 0 };
      const api = apiGroupByDate[date] || { count: 0, total: 0 };

      const diffCount = local.count - api.count;
      const diffTotal = local.total - api.total;

      totalLocalCount += local.count;
      totalLocalSum += local.total;
      totalApiCount += api.count;
      totalApiSum += api.total;

      const dateFmt = date.split('-').reverse().join('/'); // "DD/MM/YYYY"
      
      const countWarning = diffCount !== 0 ? "⚠️" : " ";
      const totalWarning = Math.abs(diffTotal) > 0.01 ? "⚠️" : " ";

      console.log(
        `${dateFmt} | ` +
        `${String(local.count).padStart(10)} | ` +
        `${String(api.count).padStart(8)} | ` +
        `${String(diffCount).padStart(12)} ${countWarning} | ` +
        `R$ ${local.total.toFixed(2).padStart(10)} | ` +
        `R$ ${api.total.toFixed(2).padStart(10)} | ` +
        `R$ ${diffTotal.toFixed(2).padStart(8)} ${totalWarning}`
      );
    });

    console.log("--------------------------------------------------------------------------------------");
    console.log(
      `TOTAL      | ` +
      `${String(totalLocalCount).padStart(10)} | ` +
      `${String(totalApiCount).padStart(8)} | ` +
      `${String(totalLocalCount - totalApiCount).padStart(12)} | ` +
      `R$ ${totalLocalSum.toFixed(2).padStart(10)} | ` +
      `R$ ${totalApiSum.toFixed(2).padStart(10)} | ` +
      `R$ ${(totalLocalSum - totalApiSum).toFixed(2).padStart(8)}`
    );

  } catch (error) {
    console.error("❌ Erro ao buscar dados da API do Dashboard:", error.message);
  }
}

main();
