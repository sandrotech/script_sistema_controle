const axios = require('axios');

async function main() {
  const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
  const email = 'victor@ultrarota.com.br';
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

    const apiVendas = response.data;
    console.log(`Total de registros na API: ${apiVendas.length}`);

    let totalGeral = 0;
    const porOrigem = {};

    apiVendas.forEach(v => {
      const orig = v.origem || 'SEM ORIGEM';
      const valor = parseFloat(v.venda) || 0;
      
      if (!porOrigem[orig]) {
        porOrigem[orig] = { count: 0, total: 0 };
      }
      porOrigem[orig].count++;
      porOrigem[orig].total += valor;
      totalGeral += valor;
    });

    console.log("\n📊 RESUMO DE VENDAS DO DASHBOARD (MAIO 2026):");
    Object.entries(porOrigem).forEach(([orig, data]) => {
      console.log(`- Origem: ${orig.padEnd(20)} | Qtd: ${String(data.count).padStart(6)} | Total: R$ ${data.total.toFixed(2).padStart(12)}`);
    });
    console.log(`- TOTAL GERAL: R$ ${totalGeral.toFixed(2)}`);

  } catch (error) {
    console.error("Erro:", error.message);
  }
}

main();
