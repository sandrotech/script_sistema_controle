/**
 * fix_ultrarota_junho.js
 *
 * Diagnóstico, limpeza e re-sync de junho/2026 para o cliente Ultra Rota.
 * Conecta direto no banco da Ultra Rota via databaseUrl do clients.ts.
 *
 * Uso:
 *   node fix_ultrarota_junho.js          -> apenas diagnóstico
 *   node fix_ultrarota_junho.js --fix    -> limpa junho e re-sincroniza
 */

const { Pool } = require('pg');
const axios = require('axios');
const https = require('https');

const DB_URL = 'postgres://postgres:QL734wyPqYW3OuBHamcErl1RTxhvB97FiDDOsZmAg4SZMWG1UKY4HYk24QQnP2FH@oandn0cu1p1tigiwlkd70ttg:5432/postgres';
const API_URL = 'https://vendas.cometasupermercados.com.br';
const API_EMAIL = 'victor@ultrarota.com.br';
const API_PASSWORD = 'Cometa@ultrarota';

const START_DATE = '01-06-2026';
const END_DATE = '30-06-2026';

const agent = new https.Agent({ rejectUnauthorized: false });
const FIX_MODE = process.argv.includes('--fix');

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        DIAGNÓSTICO / FIX — Ultra Rota — Junho/2026        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`Modo: ${FIX_MODE ? '🔧 FIX (limpeza + re-sync)' : '🔍 DIAGNÓSTICO APENAS'}\n`);

  const pool = new Pool({ connectionString: DB_URL, connectionTimeoutMillis: 10000 });

  // ── 1. DIAGNÓSTICO NO BD ────────────────────────────────────────
  console.log('📊 [1/3] Consultando BD — Junho/2026 por origem...');
  try {
    const diagRes = await pool.query(`
      SELECT origem, COUNT(*) as qtd, COALESCE(SUM(venda), 0)::numeric(12,2) as total
      FROM vendas
      WHERE data >= '2026-06-01 00:00:00'
        AND data <= '2026-06-30 23:59:59'
      GROUP BY origem
      ORDER BY total DESC
    `);

    if (diagRes.rows.length === 0) {
      console.log('   ⚠️  Nenhum registro encontrado para junho no BD.');
    } else {
      console.log('   Origem               | Qtd     | Total');
      console.log('   ──────────────────────────────────────────');
      let totalQtd = 0;
      let totalVal = 0;
      for (const row of diagRes.rows) {
        totalQtd += parseInt(row.qtd);
        totalVal += parseFloat(row.total);
        console.log(`   ${row.origem.padEnd(21)}| ${String(row.qtd).padStart(7)} | R$ ${parseFloat(row.total).toFixed(2).padStart(12)}`);
      }
      console.log('   ──────────────────────────────────────────');
      console.log(`   ${'TOTAL'.padEnd(21)}| ${String(totalQtd).padStart(7)} | R$ ${totalVal.toFixed(2).padStart(12)}`);
    }
  } catch (e) {
    console.error('   ❌ Erro ao consultar BD:', e.message);
    await pool.end();
    return;
  }

  // ── 2. BUSCAR DA API ────────────────────────────────────────────
  console.log('\n📡 [2/3] Buscando junho/2026 na API Cometa...');
  let apiTotal = 0;
  let apiCount = 0;
  let apiVendasFlat = [];
  try {
    const loginRes = await axios.post(`${API_URL}/login`, { email: API_EMAIL, password: API_PASSWORD }, { httpsAgent: agent, timeout: 10000 });
    const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    if (!token) throw new Error('Token não retornado');

    const vendasRes = await axios.get(`${API_URL}/venda`, {
      params: { dataInicial: START_DATE, dataFinal: END_DATE },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent,
      timeout: 60000
    });

    for (const grupo of vendasRes.data || []) {
      const lojaId = grupo.LOJA?.LOJA;
      for (const v of (grupo.VENDAS || [])) {
        apiCount++;
        apiTotal += Number(v.VENDA || 0);
        apiVendasFlat.push({ lojaId, ...v });
      }
    }
    console.log(`   ✅ ${apiCount} registros / R$ ${apiTotal.toFixed(2)}`);
  } catch (e) {
    console.error('   ❌ Erro ao buscar da API:', e.message);
    await pool.end();
    return;
  }

  // ── 3. FIX: LIMPAR E RE-SINCRONIZAR ────────────────────────────
  if (!FIX_MODE) {
    console.log('\n──────────────────────────────────────────────────────────');
    console.log('💡 Para corrigir, rode com a flag --fix:');
    console.log('   node fix_ultrarota_junho.js --fix');
    console.log('──────────────────────────────────────────────────────────');
    await pool.end();
    return;
  }

  console.log('\n🗑️  [3/3] Apagando todos os registros de junho no BD...');
  try {
    const del = await pool.query(`
      DELETE FROM vendas
      WHERE data >= '2026-06-01 00:00:00'
        AND data <= '2026-06-30 23:59:59'
    `);
    console.log(`   ✅ ${del.rowCount} registros deletados.`);
  } catch (e) {
    console.error('   ❌ Erro ao deletar:', e.message);
    await pool.end();
    return;
  }

  console.log('\n📥 Inserindo dados corretos da API...');
  let inserted = 0;
  let errors = 0;
  const client = await pool.connect();
  try {
    for (const v of apiVendasFlat) {
      try {
        const [dd, mm, yyyy] = (v.DATA || '').split('/');
        const dataIso = `${yyyy}-${mm}-${dd}T12:00:00Z`;
        const ean = v.EAN ? String(v.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
        await client.query(
          `INSERT INTO vendas (loja, data, ean, plu, produto, qtd, venda, custo, cod_interno, origem)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'API_VENDAS_V2')`,
          [
            v.lojaId,
            dataIso,
            ean,
            v.PLU || '0',
            v.PRODUTO || '',
            Number(v.QTD || 0),
            Number(v.VENDA || 0),
            Number(v.CUSTO || 0),
            v.COD_INTERNO || ''
          ]
        );
        inserted++;
      } catch (e) {
        errors++;
      }
    }
  } finally {
    client.release();
  }

  console.log(`   ✅ Inseridos: ${inserted} | Erros: ${errors}`);

  // ── VERIFICAÇÃO FINAL ───────────────────────────────────────────
  console.log('\n✅ Verificação final...');
  const checkRes = await pool.query(`
    SELECT COUNT(*) as qtd, COALESCE(SUM(venda), 0)::numeric(12,2) as total
    FROM vendas
    WHERE data >= '2026-06-01 00:00:00'
      AND data <= '2026-06-30 23:59:59'
  `);
  const dbQtd = parseInt(checkRes.rows[0].qtd);
  const dbTotal = parseFloat(checkRes.rows[0].total);
  console.log(`   🌐 API : ${apiCount} registros / R$ ${apiTotal.toFixed(2)}`);
  console.log(`   🗄️  BD  : ${dbQtd} registros / R$ ${dbTotal.toFixed(2)}`);
  const diff = Math.abs(apiTotal - dbTotal);
  if (diff < 0.1) {
    console.log('   ✅ PARIDADE CONFIRMADA!');
  } else {
    console.log(`   ⚠️  Ainda há diferença de R$ ${diff.toFixed(2)} — verifique os erros de inserção.`);
  }

  await pool.end();
}

main().catch(console.error);
