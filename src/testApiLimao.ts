/**
 * testApiLimao.ts
 * Diagnóstico da API para o cliente Costa frutas - limao (leandrochiaba@gmail.com)
 */
import axios from 'axios';
import https from 'https';
import { clients } from './config/clients';

const agent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  const client = clients.find(c => c.name === 'Costa frutas - limao');
  if (!client) { console.error('Cliente não encontrado'); return; }

  const apiUrl = "https://vendas.cometasupermercados.com.br";

  console.log(`\n🔑 Autenticando como: ${client.apiEmail}`);
  const loginRes = await axios.post(`${apiUrl}/login`, {
    email: client.apiEmail,
    password: client.apiPassword
  }, { httpsAgent: agent });

  const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
  console.log(`✅ Token obtido: ${token ? 'SIM' : 'NÃO'}`);
  
  // Testa vários períodos para descobrir se existe ALGUM dado
  const periodos = [
    { label: 'Últimos 7 dias',   start: '26-06-2026', end: '02-07-2026' },
    { label: 'Junho 2026',       start: '01-06-2026', end: '30-06-2026' },
    { label: 'Maio 2026',        start: '01-05-2026', end: '31-05-2026' },
    { label: 'Jan-Jul 2026',     start: '01-01-2026', end: '03-07-2026' },
    { label: 'Jan-Jul com hoje', start: '01-01-2026', end: '03-07-2026' },
  ];

  for (const periodo of periodos) {
    try {
      const res = await axios.get(`${apiUrl}/venda`, {
        params: { dataInicial: periodo.start, dataFinal: periodo.end },
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: agent
      });
      
      const dados = res.data;
      
      if (!Array.isArray(dados)) {
        console.log(`\n📅 [${periodo.label}]: Resposta não é array — tipo: ${typeof dados}`);
        console.log(`   Conteúdo: ${JSON.stringify(dados).substring(0, 200)}`);
      } else if (dados.length === 0) {
        console.log(`\n📅 [${periodo.label}]: Array vazio — nenhuma venda retornada`);
      } else {
        let totalVendas = 0;
        let totalLojas = dados.length;
        dados.forEach(g => { totalVendas += (g.VENDAS || []).length; });
        console.log(`\n📅 [${periodo.label}]: ✅ ${totalLojas} lojas / ${totalVendas} linhas de venda`);
        // Mostra um sample do primeiro item
        if (dados[0]) {
          console.log(`   Exemplo loja: ${JSON.stringify(dados[0].LOJA)}`);
          if (dados[0].VENDAS?.[0]) {
            console.log(`   Exemplo venda: ${JSON.stringify(dados[0].VENDAS[0])}`);
          }
        }
      }
    } catch (err: any) {
      console.log(`\n📅 [${periodo.label}]: ❌ Erro — ${err.response?.status || ''} ${err.message}`);
      if (err.response?.data) {
        console.log(`   Resposta: ${JSON.stringify(err.response.data).substring(0, 200)}`);
      }
    }
  }
}

run().catch(console.error);
