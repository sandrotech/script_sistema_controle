const axios = require('axios');
const https = require('https');
const fs = require('fs');

const agent = new https.Agent({  
  rejectUnauthorized: false
});

async function main() {
  const apiUrl = "https://vendas.cometasupermercados.com.br";
  const email = "victor@ultrarota.com.br";
  const password = "Cometa@ultrarota";
  const startDate = "01-01-2026";
  const endDate = "03-07-2026";

  console.log(`🔑 Efetuando login para ${email}...`);
  try {
    const loginRes = await axios.post(`${apiUrl}/login`, {
      email,
      password
    }, { httpsAgent: agent });

    const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    if (!token) {
      throw new Error("Não foi possível obter o token.");
    }

    console.log(`📅 Buscando vendas de ${startDate} até ${endDate}...`);
    const vendasRes = await axios.get(`${apiUrl}/venda`, {
      params: { dataInicial: startDate, dataFinal: endDate },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    if (!Array.isArray(dados)) {
      console.log("Nenhum dado retornado da API.");
      return;
    }

    let linhas = [];
    // Cabeçalho do arquivo TXT/CSV
    linhas.push("Data;Loja ID;Loja Nome;EAN;PLU;Produto;Quantidade;Valor Venda;Custo;Cod Interno");

    let totalVendas = 0;
    dados.forEach(grupo => {
      const lojaId = grupo.LOJA.LOJA;
      const lojaNome = grupo.LOJA.NOME;
      const vendasLoja = grupo.VENDAS || [];

      vendasLoja.forEach(item => {
        totalVendas++;
        const data = item.DATA || '';
        const ean = item.EAN || '';
        const plu = item.PLU || '';
        const produto = item.PRODUTO || '';
        const qtd = item.QTD || 0;
        const venda = item.VENDA || 0;
        const custo = item.CUSTO || 0;
        const codInterno = item.COD_INTERNO || '';

        linhas.push(`${data};${lojaId};${lojaNome};${ean};${plu};${produto};${qtd};${venda};${custo};${codInterno}`);
      });
    });

    const outputFilename = "vendas_ultra_rota_ytd.txt";
    fs.writeFileSync(outputFilename, linhas.join('\n'), 'utf-8');
    console.log(`✅ Sincronismo e extração concluídos com sucesso!`);
    console.log(`Total de registros: ${totalVendas}`);
    console.log(`Arquivo gerado: ${outputFilename}`);

  } catch (error) {
    console.error("❌ Erro:", error.response?.data?.message || error.message);
  }
}

main();
