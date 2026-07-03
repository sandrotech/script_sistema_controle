/**
 * checkParity.ts
 *
 * Compara o total da API com o total do BD para detectar divergências.
 * Erros são exibidos com diagnóstico detalhado para facilitar a correção.
 */
import axios from 'axios';
import https from 'https';
import { Pool } from 'pg';
import { clients } from './config/clients';

const agent = new https.Agent({ rejectUnauthorized: false });

const CLIENTS_TO_CHECK = [
  "Serra Sul Morangos",
  "Casa do Frango",
  "Costa frutas - limao",
  "Costa frutas - maracuja",
];

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

const START_DATE    = "01-01-2026";
const API_END_DATE  = getDateStr(0);  // Hoje — a API exige dataFinal no presente
const DB_END_DATE   = getDateStr(1);  // Ontem — exclui dados parciais do dia atual do BD
const API_URL       = "https://vendas.cometasupermercados.com.br";

// Converte "dd-mm-yyyy" para um objeto Date (23:59:59 UTC)
function parseDateStr(str: string, endOfDay = false): Date {
  const [d, m, y] = str.split('-');
  const dt = new Date(`${y}-${m}-${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
  return dt;
}

// Classifica o tipo de erro para mensagens mais úteis
function diagnoseError(error: any): string {
  const msg: string = error.message || '';
  const code: string = error.code || '';

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return `🔌 HOST NÃO ENCONTRADO — Este script precisa rodar no servidor onde o banco está acessível.\n     Host: ${error.hostname || error.address || 'desconhecido'}\n     Solução: Execute via SSH no servidor de produção ou certifique-se que está na rede correta.`;
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
    return `⏱️  TIMEOUT — O banco demorou demais para responder.\n     Solução: Verifique se o container/serviço do banco está ativo.`;
  }
  if (msg.includes('authentication failed') || msg.includes('password authentication')) {
    return `🔐 FALHA DE AUTENTICAÇÃO NO BD — Credenciais inválidas.\n     Solução: Verifique o databaseUrl do cliente em clients.ts.`;
  }
  if (msg.includes('Falha no login') || msg.includes('401') || msg.includes('403')) {
    return `🔐 FALHA DE LOGIN NA API — Credenciais da API inválidas.\n     Email: ${error.config?.data ? JSON.parse(error.config.data)?.email : 'desconhecido'}\n     Solução: Verifique apiEmail e apiPassword do cliente em clients.ts.`;
  }
  if (msg.includes('400') || msg.includes('Bad Request')) {
    return `⚠️  API RETORNOU 400 — Parâmetros inválidos (datas ou credenciais).\n     Verifique se dataFinal (${END_DATE}) está no futuro ou presente.`;
  }
  if (msg.includes('ESSL') || msg.includes('certificate')) {
    return `🔒 ERRO DE SSL — Certificado inválido.\n     Solução: Verifique o agente HTTPS ou desabilite a verificação de certificado.`;
  }
  return `🐛 ERRO INESPERADO\n     Mensagem: ${msg}\n     Código: ${code || 'N/A'}\n     Stack: ${error.stack?.split('\n')[1]?.trim() || 'N/A'}`;
}

async function checkParity(client: any): Promise<{ ok: boolean; step: string; detail: string }> {
  const SEP = '─'.repeat(60);
  console.log(`\n${SEP}`);
  console.log(`🔍 [${client.name}]`);
  console.log(`   📧 API Email : ${client.apiEmail}`);
  console.log(`   🗄️  DB Host   : ${client.databaseUrl.split('@')[1]?.split('/')[0] || 'N/A'}`);
  console.log(SEP);

  // ── FASE 1: Login na API ──────────────────────────────────────
  console.log(`   [1/4] 🌐 Autenticando na API...`);
  let token: string;
  try {
    const loginRes = await axios.post(`${API_URL}/login`, {
      email: client.apiEmail,
      password: client.apiPassword
    }, { httpsAgent: agent, timeout: 10000 });

    token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    if (!token) throw new Error("Token não retornado pela API");
    console.log(`          ✅ Login bem-sucedido.`);
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE LOGIN`);
    console.error(`          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Login API', detail: error.message };
  }

  // ── FASE 2: Buscar dados da API ───────────────────────────────
   console.log(`   [2/4] 📡 Buscando vendas na API (${START_DATE} → ${DB_END_DATE})...`);
  let apiTotal = 0;
  let apiCount = 0;
  let lojaCount = 0;
  try {
    // A API exige que dataFinal seja hoje ou futuro para retornar o histórico completo
    const vendasRes = await axios.get(`${API_URL}/venda`, {
      params: { dataInicial: START_DATE, dataFinal: API_END_DATE },
      headers: { Authorization: `Bearer ${token!}` },
      httpsAgent: agent,
      timeout: 30000
    });

    const dados = vendasRes.data;
    if (!Array.isArray(dados) || dados.length === 0) {
      console.log(`          ⚠️  API retornou 0 registros para o período.`);
    } else {
      lojaCount = dados.length;
      const vendasMap = new Map();
      const dbEndMs = parseDateStr(DB_END_DATE, true).getTime(); // ontem 23:59:59

      for (const grupo of dados) {
        const lojaId = grupo.LOJA?.LOJA;
        for (const v of (grupo.VENDAS || [])) {
          // Filtrar registros de hoje (apenas conta até ontem, igual ao BD)
          const [dd, mm, yyyy] = (v.DATA || '').split('/');
          const vendaDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`).getTime();
          if (vendaDate > dbEndMs) continue;

          const eanLimpo = v.EAN ? String(v.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
          const chave = `venda-${lojaId}-${v.DATA}-${eanLimpo}-${v.PLU || '0'}`;
          if (vendasMap.has(chave)) {
            vendasMap.get(chave).venda += Number(v.VENDA || 0);
          } else {
            vendasMap.set(chave, { venda: Number(v.VENDA || 0) });
          }
        }
      }
      apiCount = vendasMap.size;
      for (const val of vendasMap.values()) apiTotal += val.venda;
      console.log(`          ✅ ${lojaCount} lojas / ${apiCount} registros (até ${DB_END_DATE}) / R$ ${apiTotal.toFixed(2)}`);
    }
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE BUSCA DA API`);
    console.error(`          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Busca API', detail: error.message };
  }

  // ── FASE 3: Buscar totais do BD ───────────────────────────────
  console.log(`   [3/4] 🗄️  Conectando ao banco de dados...`);
  let dbTotal = 0;
  let dbCount = 0;
  try {
    const pool = new Pool({ connectionString: client.databaseUrl, connectionTimeoutMillis: 10000 });
    const dbClient = await pool.connect();
    try {
      // BD: filtra até ontem 23:59:59 — exclui dados parciais do dia atual
      const [d, m, y] = DB_END_DATE.split('-');
      const dbEndIso = `${y}-${m}-${d} 23:59:59`;
      const dbRes = await dbClient.query(`
        SELECT COUNT(id) AS qtd, COALESCE(SUM(venda), 0) AS total
        FROM vendas WHERE data >= '2026-01-01 00:00:00' AND data <= $1
      `, [dbEndIso]);
      dbCount = parseInt(dbRes.rows[0].qtd);
      dbTotal = parseFloat(dbRes.rows[0].total);
      console.log(`          ✅ ${dbCount} registros (até ${DB_END_DATE}) / R$ ${dbTotal.toFixed(2)}`);
    } finally {
      dbClient.release();
      await pool.end();
    }
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE CONSULTA AO BANCO`);
    console.error(`          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Consulta BD', detail: error.message };
  }

  // ── FASE 4: Comparação ────────────────────────────────────────
  console.log(`   [4/4] ⚖️  Comparando valores...`);
  const diff = Math.abs(apiTotal - dbTotal);
  const hasParity = diff < 0.1;

  console.log(`          🌐 API : R$ ${apiTotal.toFixed(2).padStart(14)} (${String(apiCount).padStart(6)} registros)`);
  console.log(`          🗄️  BD  : R$ ${dbTotal.toFixed(2).padStart(14)} (${String(dbCount).padStart(6)} registros)`);

  if (hasParity) {
    console.log(`          ✅ PARIDADE CONFIRMADA — Valores idênticos!`);
  } else {
    const sinal = apiTotal > dbTotal ? '⬆️  BD está com menos dados' : '⬇️  BD está com mais dados que a API';
    console.log(`          ❌ DIVERGÊNCIA: R$ ${diff.toFixed(2)} de diferença`);
    console.log(`          ${sinal}`);
    console.log(`          💡 Solução sugerida: Apague as vendas deste cliente no BD e rode o sync:geral novamente.`);
  }

  return { ok: hasParity, step: 'OK', detail: '' };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║               AUDITORIA DE PARIDADE API vs BD             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`📅 Período : ${START_DATE} → ${DB_END_DATE}`);
  console.log(`🔗 API     : ${API_URL}\n`);

  const targets = clients.filter(c => CLIENTS_TO_CHECK.includes(c.name));
  const results: { name: string; ok: boolean; step: string; detail: string }[] = [];

  for (const client of targets) {
    const res = await checkParity(client);
    results.push({ name: client.name, ...res });
  }

  // ── Relatório Final ───────────────────────────────────────────
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     RELATÓRIO FINAL                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const okList    = results.filter(r => r.ok);
  const errorList = results.filter(r => !r.ok);

  okList.forEach(r => {
    console.log(`  ✅ ${r.name}`);
  });

  if (errorList.length > 0) {
    console.log('\n  ❌ CLIENTES COM PROBLEMA:');
    errorList.forEach(r => {
      console.log(`  ❌ ${r.name}`);
      console.log(`     Fase onde falhou : ${r.step}`);
      console.log(`     Detalhe          : ${r.detail}`);
    });
  }

  const okCount = okList.length;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Resultado: ${okCount}/${targets.length} clientes em paridade perfeita.`);
  if (okCount < targets.length) {
    console.log(`  ⚠️  Atenção: ${targets.length - okCount} cliente(s) precisam de ação corretiva.`);
  }
  console.log(`${'─'.repeat(60)}\n`);
}

main().catch(console.error);
