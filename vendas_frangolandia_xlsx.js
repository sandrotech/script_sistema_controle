/**
 * vendas_frangolandia_xlsx.js
 *
 * Busca as vendas da Frangolândia (origem FRANGOLANDIA_EMAIL) do banco
 * da Ultra Rota e gera um Excel com detalhado + resumos.
 *
 * Uso:
 *   node vendas_frangolandia_xlsx.js                          -> junho (mês passado)
 *   node vendas_frangolandia_xlsx.js 2026-05-01 2026-05-31   -> período customizado (YYYY-MM-DD)
 */

const { Pool } = require('pg');
const xlsx = require('xlsx');

const DB_URL = 'postgres://postgres:QL734wyPqYW3OuBHamcErl1RTxhvB97FiDDOsZmAg4SZMWG1UKY4HYk24QQnP2FH@oandn0cu1p1tigiwlkd70ttg:5432/postgres';

function lastMonthRange() {
  const now = new Date();
  const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m = now.getMonth() === 0 ? 12 : now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${pad(m)}-01`,
    end:   `${y}-${pad(m)}-${lastDay}`,
    label: `${y}${pad(m)}`
  };
}

async function main() {
  const range = lastMonthRange();
  const startDate = process.argv[2] || range.start;
  const endDate   = process.argv[3] || range.end;
  const label     = process.argv[2] ? startDate.replace(/-/g,'') + '_' + endDate.replace(/-/g,'') : range.label;

  console.log(`\n🗄️  Conectando ao banco da Ultra Rota...`);
  const pool = new Pool({ connectionString: DB_URL, connectionTimeoutMillis: 10000 });

  console.log(`📡 Buscando vendas Frangolândia de ${startDate} até ${endDate}...`);
  const res = await pool.query(`
    SELECT loja, loja_nome, ean, plu, produto, qtd, venda, custo, data, cod_interno
    FROM vendas
    WHERE origem = 'FRANGOLANDIA_EMAIL'
      AND data >= $1
      AND data <= $2
    ORDER BY data ASC, loja ASC
  `, [`${startDate} 00:00:00`, `${endDate} 23:59:59`]);

  await pool.end();

  console.log(`   ✅ ${res.rows.length} registros encontrados.`);

  if (res.rows.length === 0) {
    console.log('   ⚠️  Nenhum dado encontrado para o período. Verifique se o sync de e-mail foi executado.');
    return;
  }

  // ── Montar linhas detalhadas e resumos ─────────────────────────
  const detalhado = [];
  const resumoPorLoja = {};
  const resumoPorDia  = {};
  const resumoPorProd = {};
  let totalGeral = 0;

  for (const r of res.rows) {
    const data  = r.data instanceof Date ? r.data.toISOString().split('T')[0] : String(r.data).split('T')[0];
    const venda = Number(r.venda || 0);
    const qtd   = Number(r.qtd   || 0);
    const loja  = `${r.loja} - ${r.loja_nome || ''}`.trim();
    const prod  = r.produto || '';

    detalhado.push({
      'Data':        data,
      'Loja ID':     r.loja,
      'Loja Nome':   r.loja_nome || '',
      'EAN':         r.ean || '',
      'PLU':         r.plu || '',
      'Produto':     prod,
      'Quantidade':  qtd,
      'Venda (R$)':  venda,
      'Custo (R$)':  Number(r.custo || 0),
    });

    totalGeral += venda;

    if (!resumoPorLoja[loja]) resumoPorLoja[loja] = { qtd: 0, total: 0 };
    resumoPorLoja[loja].qtd   += qtd;
    resumoPorLoja[loja].total += venda;

    if (!resumoPorDia[data]) resumoPorDia[data] = { qtd: 0, total: 0 };
    resumoPorDia[data].qtd   += qtd;
    resumoPorDia[data].total += venda;

    if (!resumoPorProd[prod]) resumoPorProd[prod] = { qtd: 0, total: 0 };
    resumoPorProd[prod].qtd   += qtd;
    resumoPorProd[prod].total += venda;
  }

  console.log(`\n📊 Total: ${detalhado.length} linhas | R$ ${totalGeral.toFixed(2)}`);

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
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(detalhado), 'Detalhado');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaDias),   'Resumo por Dia');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaLojas),  'Resumo por Loja');
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(abaProd),   'Resumo por Produto');

  const fileName = `Vendas_Frangolandia_${label}.xlsx`;
  xlsx.writeFile(wb, fileName);

  console.log(`\n✅ Arquivo gerado: ${fileName}`);
  console.log(`   📋 Abas: Detalhado | Resumo por Dia | Resumo por Loja | Resumo por Produto`);
}

main().catch(e => {
  console.error('❌ Erro:', e.message);
  process.exit(1);
});
