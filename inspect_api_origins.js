const axios = require('axios');

async function main() {
  const url = 'https://ultradistribuicao.alessandrosantos.dev/api/sales';
  const email = 'victor@ultrarota.com.br';
  try {
    const response = await axios.get(url, {
      params: {
        dataInicial: '01-06-2026',
        dataFinal: '05-07-2026'
      },
      headers: {
        'X-User-Email': email
      }
    });

    const apiVendas = response.data;
    console.log(`Total de vendas na API: ${apiVendas.length}`);

    const porOrigem = {};
    const datasFrangolandia = {};
    apiVendas.forEach(v => {
      const orig = v.origem || 'SEM ORIGEM';
      porOrigem[orig] = (porOrigem[orig] || 0) + 1;
      
      if (orig === 'FRANGOLANDIA_EMAIL') {
        const dataStr = v.data ? v.data.substring(0, 10) : 'SEM DATA';
        datasFrangolandia[dataStr] = (datasFrangolandia[dataStr] || 0) + 1;
      }
    });

    console.log("Contagem por Origem na API:");
    console.log(porOrigem);

    console.log("Contagem por Data para FRANGOLANDIA_EMAIL:");
    console.log(datasFrangolandia);

    const urlLojas = 'https://ultradistribuicao.alessandrosantos.dev/api/lojas';
    const resLojas = await axios.get(urlLojas, {
      headers: {
        'X-User-Email': email
      }
    });
    console.log("\nLojas retornadas pela API para o usuário:");
    console.log(JSON.stringify(resLojas.data, null, 2));

  } catch (error) {
    console.error("Erro:", error.message);
  }
}

main();
