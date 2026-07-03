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
  "Ultra Rota"
];

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

const START_DATE = "01-01-2026";
const API_END_DATE = getDateStr(0);  // Hoje
const DB_END_DATE = getDateStr(1);   // Ontem
const API_URL = "https://vendas.cometasupermercados.com.br";

function parseDateStr(str: string, endOfDay = false): Date {
  const [d, m, y] = str.split('-');
  const dt = new Date(`${y}-${m}-${d}T${endOfDay ? '23:59:59' : '00:00:00'}Z`);
  return dt;
}

function diagnoseError(error: any): string {
  const msg: string = error.message || '';
  const code: string = error.code || '';

  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return `🔌 HOST NÃO ENCONTRADO — Este script precisa rodar no servidor onde o banco está acessível.\n     Host: ${error.hostname || error.address || 'desconhecido'}\n     Solução: Execute via SSH no servidor de produção ou certifique-se que está na rede correta.`;
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') {
    return `⏱️  TIMEOUT — O banco demorou demais para responder.`;
  }
  if (msg.includes('authentication failed')) {
    return `🔐 FALHA DE AUTENTICAÇÃO NO BD — Credenciais inválidas.`;
  }
  if (msg.includes('401') || msg.includes('403')) {
    return `🔐 FALHA DE LOGIN NA API — Credenciais da API inválidas.`;
  }
  if (msg.includes('400')) {
    return `⚠️  API RETORNOU 400 — Parâmetros inválidos.`;
  }
  return `🐛 ERRO INESPERADO\n     Mensagem: ${msg}\n     Código: ${code}`;
}

async function checkParityMonthly(client: any): Promise<{ ok: boolean; step: string; detail: string; diffs: any[] }> {
  const SEP = '─'.repeat(60);
  console.log(`\n${SEP}`);
  console.log(`🔍 [${client.name}]`);
  console.log(`   📧 API Email : ${client.apiEmail}`);
  console.log(`   🗄️  DB Host   : ${client.databaseUrl.split('@')[1]?.split('/')[0] || 'N/A'}`);
  console.log(SEP);

  // ── FASE 1: Login na API
  console.log(`   [1/4] 🌐 Autenticando na API...`);
  let token: string;
  try {
    const loginRes = await axios.post(`${API_URL}/login`, {
      email: client.apiEmail,
      password: client.apiPassword
    }, { httpsAgent: agent, timeout: 10000 });

    token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    if (!token) throw new Error("Token não retornado pela API");
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE LOGIN\n          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Login API', detail: error.message, diffs: [] };
  }

  // ── FASE 2: Buscar dados da API
  console.log(`   [2/4] 📡 Buscando vendas na API (${START_DATE} → ${API_END_DATE}) e agregando por mês...`);
  const apiMonthly = new Map<string, { total: number, count: number }>();
  try {
    const vendasRes = await axios.get(`${API_URL}/venda`, {
      params: { dataInicial: START_DATE, dataFinal: API_END_DATE },
      headers: { Authorization: `Bearer ${token!}` },
      httpsAgent: agent,
      timeout: 30000
    });

    const dados = vendasRes.data;
    if (Array.isArray(dados) && dados.length > 0) {
      const dbEndMs = parseDateStr(DB_END_DATE, true).getTime();
      const vendasUnicas = new Map();

      for (const grupo of dados) {
        const lojaId = grupo.LOJA?.LOJA;
        for (const v of (grupo.VENDAS || [])) {
          const [dd, mm, yyyy] = (v.DATA || '').split('/');
          const vendaDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`).getTime();
          if (vendaDate > dbEndMs) continue; // exclui dados do dia atual, igual ao BD

          const mesAno = `${mm}/${yyyy}`;
          const eanLimpo = v.EAN ? String(v.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
          const chave = `venda-${lojaId}-${v.DATA}-${eanLimpo}-${v.PLU || '0'}`;

          if (vendasUnicas.has(chave)) {
            vendasUnicas.get(chave).venda += Number(v.VENDA || 0);
          } else {
            vendasUnicas.set(chave, { mesAno, venda: Number(v.VENDA || 0) });
          }
        }
      }

      for (const val of vendasUnicas.values()) {
        const entry = apiMonthly.get(val.mesAno) || { total: 0, count: 0 };
        entry.total += val.venda;
        entry.count += 1;
        apiMonthly.set(val.mesAno, entry);
      }
    }
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE BUSCA DA API\n          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Busca API', detail: error.message, diffs: [] };
  }

  // ── FASE 3: Buscar dados do BD
  console.log(`   [3/4] 🗄️  Conectando ao banco de dados e agregando por mês...`);
  const dbMonthly = new Map<string, { total: number, count: number }>();
  try {
    const pool = new Pool({ connectionString: client.databaseUrl, connectionTimeoutMillis: 10000 });
    const dbClient = await pool.connect();
    try {
      const [d, m, y] = DB_END_DATE.split('-');
      const dbEndIso = `${y}-${m}-${d} 23:59:59`;
      
      const dbRes = await dbClient.query(`
        SELECT to_char(data, 'MM/YYYY') as mes, COUNT(id) AS qtd, COALESCE(SUM(venda), 0) AS total
        FROM vendas WHERE data >= '2026-01-01 00:00:00' AND data <= $1
        GROUP BY to_char(data, 'MM/YYYY')
      `, [dbEndIso]);

      for (const row of dbRes.rows) {
        dbMonthly.set(row.mes, {
          count: parseInt(row.qtd),
          total: parseFloat(row.total)
        });
      }
    } finally {
      dbClient.release();
      await pool.end();
    }
  } catch (error: any) {
    const diag = diagnoseError(error);
    console.error(`          ❌ FALHOU NA FASE DE CONSULTA AO BANCO\n          ${diag.split('\n').join('\n          ')}`);
    return { ok: false, step: 'Consulta BD', detail: error.message, diffs: [] };
  }

  // ── FASE 4: Comparação Mês a Mês
  console.log(`   [4/4] ⚖️  Comparando valores Mês a Mês...`);
  const meses = Array.from(new Set([...apiMonthly.keys(), ...dbMonthly.keys()])).sort((a, b) => {
    const [ma, ya] = a.split('/');
    const [mb, yb] = b.split('/');
    return (Number(ya) - Number(yb)) || (Number(ma) - Number(mb));
  });

  let hasParityAll = true;
  const diffs = [];

  for (const mes of meses) {
    const apiD = apiMonthly.get(mes) || { total: 0, count: 0 };
    const dbD = dbMonthly.get(mes) || { total: 0, count: 0 };

    const diffTotal = Math.abs(apiD.total - dbD.total);
    const hasParity = diffTotal < 0.1;

    console.log(`\n          🗓️  Mês: ${mes}`);
    console.log(`          🌐 API : R$ ${apiD.total.toFixed(2).padStart(12)} (${String(apiD.count).padStart(5)} reg)`);
    console.log(`          🗄️  BD  : R$ ${dbD.total.toFixed(2).padStart(12)} (${String(dbD.count).padStart(5)} reg)`);

    if (hasParity) {
      console.log(`          ✅ PARIDADE CONFIRMADA`);
    } else {
      hasParityAll = false;
      diffs.push({ mes, apiTotal: apiD.total, dbTotal: dbD.total, diff: diffTotal });
      console.log(`          ❌ DIVERGÊNCIA: R$ ${diffTotal.toFixed(2)} de diferença`);
    }
  }

  return { ok: hasParityAll, step: 'OK', detail: '', diffs };
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        AUDITORIA DE PARIDADE MENSAL API vs BD             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const targets = clients.filter(c => CLIENTS_TO_CHECK.includes(c.name));
  const results = [];

  for (const client of targets) {
    const res = await checkParityMonthly(client);
    results.push({ name: client.name, ...res });
  }

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║                     RELATÓRIO FINAL                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  results.forEach(r => {
    if (r.ok) {
      console.log(`  ✅ ${r.name} - 100% OK em todos os meses`);
    } else {
      console.log(`  ❌ ${r.name}`);
      if (r.diffs && r.diffs.length > 0) {
        console.log(`     Meses divergentes:`);
        r.diffs.forEach(d => {
          console.log(`       - ${d.mes} (Diferença de R$ ${d.diff.toFixed(2)})`);
        });
      } else {
        console.log(`     Falhou na fase: ${r.step} - ${r.detail}`);
      }
    }
  });
}

main().catch(console.error);
