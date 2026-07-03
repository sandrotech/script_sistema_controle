import axios from 'axios';
import https from 'https';
import { clients } from './config/clients';

const agent = new https.Agent({  
  rejectUnauthorized: false
});

async function run() {
  const client = clients.find(c => c.name === 'Casa do Frango');
  if (!client) {
    console.error('Client Casa do Frango not found');
    return;
  }

  const apiUrl = "https://vendas.cometasupermercados.com.br";
  
  console.log(`Authenticating ${client.name}...`);
  const loginRes = await axios.post(`${apiUrl}/login`, {
    email: client.apiEmail,
    password: client.apiPassword
  }, { httpsAgent: agent });

  const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
  
  if (!token) {
    throw new Error("Failed to get token");
  }

  const startDate = "01-01-2026";
  const endDate = "02-07-2026";

  console.log(`Fetching from ${startDate} to ${endDate}...`);
  
  const vendasRes = await axios.get(`${apiUrl}/venda`, {
    params: { dataInicial: startDate, dataFinal: endDate },
    headers: { Authorization: `Bearer ${token}` },
    httpsAgent: agent
  });

  const dados = vendasRes.data;
  
  if (!Array.isArray(dados)) {
    console.log('No data.');
    return;
  }

  let totalVenda = 0;
  let totalRecords = 0;

  // Simulate deduplication as in syncVendas
  const vendasAgrupadas = new Map<string, any>();

  for (const group of dados) {
    const lojaId = group.LOJA;
    const vendasLoja = group.VENDAS || [];
    for (const item of vendasLoja) {
        const eanLimpo = item.EAN ? String(item.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
        const chaveUnica = `venda-${lojaId}-${item.DATA}-${eanLimpo}-${item.PLU || '0'}`;
        
        if (vendasAgrupadas.has(chaveUnica)) {
          const existente = vendasAgrupadas.get(chaveUnica);
          existente.QTD += Number(item.QTD || 0);
          existente.VENDA += Number(item.VENDA || 0);
        } else {
          vendasAgrupadas.set(chaveUnica, {
            ...item,
            QTD: Number(item.QTD || 0),
            VENDA: Number(item.VENDA || 0)
          });
        }
    }
  }

  for (const item of vendasAgrupadas.values()) {
    totalRecords++;
    totalVenda += Number(item.VENDA || 0);
  }

  console.log('--- RESUMO API (Com deduplicação) ---');
  console.log(`Total Registros: ${totalRecords}`);
  console.log(`Total Valor: ${totalVenda}`);
}

run().catch(console.error);
