const axios = require('axios');
const fs = require('fs');

async function main() {
  const localFile = "vendas_ultra_rota_maio.txt";
  if (!fs.existsSync(localFile)) {
    console.error(`❌ Arquivo local ${localFile} não encontrado.`);
    return;
  }

  // Função para limpar o EAN da mesma forma que o syncVendas faz
  const cleanEanFn = (ean) => {
    if (!ean) return '';
    return String(ean).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim();
  };

  // 1. Ler e parsear vendas locais (Cometa API salvas no TXT)
  console.log(`📖 Lendo dados locais do arquivo ${localFile}...`);
  const content = fs.readFileSync(localFile, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  
  const localMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < 8) continue;
    
    // Normalizar a data de DD/MM/YYYY para YYYY-MM-DD
    const dateParts = cols[0].split('/');
    const dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    
    const lojaId = cols[1];
    const ean = cleanEanFn(cols[3]); // Limpar EAN
    const plu = cols[4] || '0';
    const qtd = parseFloat(cols[6]) || 0;
    const venda = parseFloat(cols[7]) || 0;

    const key = `${lojaId}|${dateStr}|${ean}|${plu}|${qtd}|${venda}`;
    localMap.set(key, (localMap.get(key) || 0) + 1);
  }

  // 2. Buscar vendas da API do Dashboard
  const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
  const email = 'victor@ultrarota.com.br';
  console.log(`🌐 Buscando vendas da API do Dashboard (${url}) para o e-mail ${email}...`);

  try {
    const response = await axios.get(url, {
      params: {
        dataInicial: '01-05-2026',
        dataFinal: '31-05-2026'
      },
      headers: {
        'X-User-Email': email
      }
    });

    const apiVendas = response.data.filter(v => v.origem === 'API_VENDAS_V2');
    console.log(`✅ Recebidas ${apiVendas.length} vendas do Dashboard com origem 'API_VENDAS_V2' no período de 26 a 30.`);

    const extraInDashboard = [];
    const extraInCometa = [];

    // Verificar o que está na API do Dashboard mas não no TXT local
    const apiCountMap = new Map();
    apiVendas.forEach(v => {
      const dateStr = v.data.split('T')[0];
      const ean = cleanEanFn(v.ean); // Limpar EAN
      const key = `${v.loja}|${dateStr}|${ean}|${v.plu || '0'}|${parseFloat(v.qtd)}|${parseFloat(v.venda)}`;
      apiCountMap.set(key, (apiCountMap.get(key) || 0) + 1);
    });

    // Comparar as ocorrências das chaves
    // 1. Extra no Dashboard
    for (const [key, count] of apiCountMap.entries()) {
      const localCount = localMap.get(key) || 0;
      if (count > localCount) {
        extraInDashboard.push({ key, apiCount: count, localCount: localCount });
      }
    }

    // 2. Extra no Cometa
    for (const [key, count] of localMap.entries()) {
      // Filtrar apenas a partir de 16 de maio
      const parts = key.split('|');
      const dateStr = parts[1];
      if (dateStr < '2026-05-16' || dateStr > '2026-05-31') continue;

      const apiCount = apiCountMap.get(key) || 0;
      if (count > apiCount) {
        extraInCometa.push({ key, apiCount: apiCount, localCount: count });
      }
    }

    console.log("\n🔍 DIVERGÊNCIAS REAIS DETALHADAS:");
    
    if (extraInDashboard.length > 0) {
      console.log("\n⚠️ Vendas que estão no Dashboard mas NÃO estão no TXT local (Cometa API):");
      extraInDashboard.forEach(item => {
        const [loja, data, ean, plu, qtd, venda] = item.key.split('|');
        console.log(`- Loja: ${loja} | Data: ${data} | EAN: ${ean} | PLU: ${plu} | Qtd: ${qtd} | Venda: R$ ${venda} (Dash: ${item.apiCount}, Cometa: ${item.localCount})`);
      });
    }

    if (extraInCometa.length > 0) {
      console.log("\n⚠️ Vendas que estão no TXT local (Cometa API) mas NÃO estão no Dashboard:");
      extraInCometa.forEach(item => {
        const [loja, data, ean, plu, qtd, venda] = item.key.split('|');
        console.log(`- Loja: ${loja} | Data: ${data} | EAN: ${ean} | PLU: ${plu} | Qtd: ${qtd} | Venda: R$ ${venda} (Dash: ${item.apiCount}, Cometa: ${item.localCount})`);
      });
    }

    if (extraInDashboard.length === 0 && extraInCometa.length === 0) {
      console.log("✅ Nenhuma divergência encontrada!");
    }

  } catch (error) {
    console.error("❌ Erro:", error.message);
  }
}

main();
