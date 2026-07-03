/**
 * checkParity.ts
 * 
 * Este script compara o valor total da API com o valor total salvo no Banco de Dados
 * para os clientes migrados, garantindo que não houve divergência nos valores (paridade).
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

function getTodayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

const START_DATE = "01-01-2026";
const END_DATE = getTodayStr();

async function checkParity(client: any) {
  console.log(`\n🔍 [${client.name}] Verificando paridade de dados...`);
  const apiUrl = "https://vendas.cometasupermercados.com.br";
  
  try {
    // 1. API: Autenticar e buscar dados
    const loginRes = await axios.post(`${apiUrl}/login`, {
      email: client.apiEmail,
      password: client.apiPassword
    }, { httpsAgent: agent });
    
    const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    if (!token) throw new Error("Falha no login");

    const vendasRes = await axios.get(`${apiUrl}/venda`, {
      params: { dataInicial: START_DATE, dataFinal: END_DATE },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    let apiTotal = 0;
    let apiCount = 0;

    if (Array.isArray(dados) && dados.length > 0) {
      // Aplicar mesma lógica de deduplicação da API
      const vendasMap = new Map();
      
      for (const dateFolder of dados) {
        if (!dateFolder.vendas) continue;
        for (const v of dateFolder.vendas) {
          const chave_unica = `${v.loja}_${dateFolder.data}_${v.ean}_${v.plu || 0}`;
          
          if (vendasMap.has(chave_unica)) {
            const ext = vendasMap.get(chave_unica);
            ext.qtd += parseFloat(v.qtd);
            ext.venda += parseFloat(v.venda);
            ext.custo += parseFloat(v.custo || 0);
          } else {
            vendasMap.set(chave_unica, {
              qtd: parseFloat(v.qtd),
              venda: parseFloat(v.venda),
              custo: parseFloat(v.custo || 0)
            });
          }
        }
      }
      
      apiCount = vendasMap.size;
      for (const val of vendasMap.values()) {
        apiTotal += val.venda;
      }
    }

    // 2. BD: Buscar totais
    const pool = new Pool({ connectionString: client.databaseUrl });
    const dbClient = await pool.connect();
    let dbTotal = 0;
    let dbCount = 0;
    try {
      const dbRes = await dbClient.query(`
        SELECT COUNT(id) AS qtd, COALESCE(SUM(venda), 0) AS total
        FROM vendas 
        WHERE data >= '2026-01-01 00:00:00'
      `);
      dbCount = parseInt(dbRes.rows[0].qtd);
      dbTotal = parseFloat(dbRes.rows[0].total);
    } finally {
      dbClient.release();
      await pool.end();
    }

    // 3. Comparação
    const diff = Math.abs(apiTotal - dbTotal);
    const hasParity = diff < 0.1; // Margem de erro de arredondamento
    
    console.log(`   🌐 Total API: R$ ${apiTotal.toFixed(2)} (${apiCount} registros deduplicados)`);
    console.log(`   🗄️  Total BD : R$ ${dbTotal.toFixed(2)} (${dbCount} registros)`);
    
    if (hasParity) {
      console.log(`   ✅ SUCESSO: Os valores estão perfeitamente alinhados!`);
    } else {
      console.log(`   ❌ DIVERGÊNCIA ENCONTRADA: Diferença de R$ ${diff.toFixed(2)}`);
    }

    return hasParity;

  } catch (error: any) {
    console.error(`   ❌ Erro ao verificar paridade: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║               AUDITORIA DE PARIDADE API vs BD             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`📅 Período analisado: ${START_DATE} até hoje\n`);

  const targets = clients.filter(c => CLIENTS_TO_CHECK.includes(c.name));
  let okCount = 0;

  for (const client of targets) {
    const isOk = await checkParity(client);
    if (isOk) okCount++;
  }

  console.log(`\n✨ Resultado Final: ${okCount}/${targets.length} bancos em paridade perfeita!\n`);
}

main().catch(console.error);
