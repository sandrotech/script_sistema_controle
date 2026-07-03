/**
 * vendas_victor_xlsx.js
 *
 * Baixa as vendas do Victor (Ultra Rota) diretamente da API do Cometa
 * e gera um arquivo Excel com aba detalhada e aba de resumo por loja/dia.
 *
 * Uso:
 *   node vendas_victor_xlsx.js                          -> YTD (01/01/2026 até hoje)
 *   node vendas_victor_xlsx.js 01-06-2026 30-06-2026   -> período customizado
 */

const axios = require('axios');
const https = require('https');
const xlsx = require('xlsx');

const API_URL = 'https://vendas.cometasupermercados.com.br';
const EMAIL   = 'victor@ultrarota.com.br';
const PASSWORD = 'Cometa@ultrarota';

const agent = new https.Agent({ rejectUnauthorized: false });

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

async function main() {
  const startDate = process.argv[2] || '01-01-2026';
  const endDate   = process.argv[3] || today();

  console.log(`\n🔑 Autenticando como ${EMAIL}...`);
  const loginRes = await axios.post(`${API_URL}/login`, { email: EMAIL, password: PASSWORD }, { httpsAgent: agent, timeout: 10000 });
  const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
  if (!token) throw new Error('Token não retornado pela API.');
  console.log('   ✅ Login bem-sucedido.');

  console.log(`\n📡 Buscando vendas de ${startDate} até ${endDate}...`);
  const res = await axios.get(`${API_URL}/venda`, {
    params: { dataInicial: startDate, dataFinal: endDate },
    headers: { Authorization: `Bearer ${token}` },
    httpsAgent: agent,
    timeout: 120000
  });

  const grupos = res.data || [];
  console.log(`   ✅ ${grupos.length} grupos de loja retornados.`);

  // ── Montar linhas detalhadas ────────────────────────────────────
  const detalhado = [];
  const resumoPorLoja  = {};
  const resumoPorDia   = {};
  const resumoPorProd  = {};
  let totalGeral = 0;

  for (const grupo of grupos) {
    const lojaId   = grupo.LOJA?.LOJA ?? '';
    const lojaNome = grupo.LOJA?.NOME ?? '';

    for (const v of (grupo.VENDAS || [])) {
      const data  = v.DATA  || '';
      const ean   = v.EAN   ? String(v.EAN).replace(/"/g,'').split(',')[0].replace(/\D/g,'').trim() : '';
      const plu   = v.PLU   ?? '';
      const prod  = v.PRODUTO    || '';
      const qtd   = Number(v.QTD   || 0);
      const venda = Number(v.VENDA || 0);
      const custo = Number(v.CUSTO || 0);

      detalhado.push({
        'Data':        data,
        'Loja ID':     lojaId,
        'Loja Nome':   lojaNome,
        'EAN':         ean,
        'PLU':         plu,
        'Produto':     prod,
        'Quantidade':  qtd,
        'Venda (R$)':  venda,
        'Custo (R$)':  custo,
      });

      totalGeral += venda;

      if (!resumoPorLoja[`${lojaId} - ${lojaNome}`]) resumoPorLoja[`${lojaId} - ${lojaNome}`] = { qtd: 0, total: 0 };
      resumoPorLoja[`${lojaId} - ${lojaNome}`].qtd   += qtd;
      resumoPorLoja[`${lojaId} - ${lojaNome}`].total += venda;

      if (!resumoPorDia[data]) resumoPorDia[data] = { qtd: 0, total: 0 };
      resumoPorDia[data].qtd   += qtd;
      resumoPorDia[data].total += venda;

      if (!resumoPorProd[prod]) resumoPorProd[prod] = { qtd: 0, total: 0 };
      resumoPorProd[prod].qtd   += qtd;
      resumoPorProd[prod].total += venda;
    }
  }

  console.log(`\n📊 Total: ${detalhado.length} linhas | R$ ${totalGeral.toFixed(2)}`);

  // ── Montar abas de resumo ───────────────────────────────────────
  const abaLojas = Object.entries(resumoPorLoja)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([loja, v]) => ({ 'Loja': loja, 'Qtd Total': v.qtd, 'Venda Total (R$)': +v.total.toFixed(2) }));

  const abaDias = Object.entries(resumoPorDia)
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => ({ 'Data': data, 'Qtd Total': v.qtd, 'Venda Total (R$)': +v.total.toFixed(2) }));

  const abaProd = Object.entries(resumoPorProd)
    .sort((a,b) => b[1].total - a[1].total)
    .map(([prod, v]) => ({ 'Produto': prod, 'Qtd Total': v.qtd, 'Venda Total (R$)': +v.total.toFixed(2) }));

  // ── Gerar Excel ─────────────────────────────────────────────────
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(detalhado),  'Detalhado');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaDias),    'Resumo por Dia');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaLojas),   'Resumo por Loja');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaProd),    'Resumo por Produto');

  const [sd, sm, sy] = startDate.split('-');
  const [ed, em, ey] = endDate.split('-');
  const fileName = `Vendas_UltraRota_${sy}${sm}${sd}_${ey}${em}${ed}.xlsx`;
  xlsx.writeFile(wb, fileName);

  console.log(`\n✅ Arquivo gerado: ${fileName}`);
  console.log(`   📋 Abas: Detalhado | Resumo por Dia | Resumo por Loja | Resumo por Produto`);
}

main().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
