import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkBackend() {
  const apiUrl = "https://casadofrango.alessandrosantos.dev/api";
  
  try {
    console.log("🔑 Autenticando na API do Backend (Casa do Frango)...");
    const loginRes = await axios.post(`${apiUrl}/login`, {
      email: "financeiro@casadofrango.com.br",
      password: "@|1]Py6&9}£C"
    }, { httpsAgent: agent });

    console.log("Login response (first 100 chars):", typeof loginRes.data === 'string' ? loginRes.data.substring(0, 100) : loginRes.data);
    const token = (typeof loginRes.data === 'string' ? loginRes.data : loginRes.data?.token || '').trim();
    
    if (!token || token.includes('<html')) {
       console.log("A API retornou HTML em vez de um Token JSON! Verifique se a URL do Backend está correta.");
       return;
    }

    console.log("📅 Buscando vendas (/api/sales)...");
    
    // As in standard REST APIs, let's fetch sales and see what it returns.
    // Assuming backend might accept startDate and endDate or dataInicial/dataFinal
    const vendasRes = await axios.get(`${apiUrl}/sales`, {
      params: { 
        // We can just fetch the recent sales and filter
      },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    
    if (!Array.isArray(dados)) {
      console.log("Sem dados para processar ou o formato não é um array.", typeof dados);
      return;
    }
    
    console.log(`\n✅ Recebido do Backend com sucesso! Total de registros: ${dados.length}`);
    
    // Assuming 'dados' has 'venda' or 'total' fields and 'data' or 'createdAt'
    let totalValor = 0;
    
    for (const item of dados) {
      // Trying to guess the field names based on Prisma schema (usually 'venda' or 'total')
      const valor = Number(item.venda || item.total || 0);
      totalValor += valor;
    }

    console.log(`- Valor total bruto calculado (R$): ${totalValor.toFixed(2)}`);
    
  } catch (err: any) {
    console.error("Erro:", err.message);
    if (err.response) {
       console.error(err.response.data);
    }
  }
}

checkBackend();
