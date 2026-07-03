import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

function formatDate(date: Date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

async function checkApi() {
  const apiUrl = "https://vendas.cometasupermercados.com.br";
  
  const dateStr = "02-07-2026";
  const dateStrYesterday = "01-01-2026";
  
  try {
    console.log("🔑 Autenticando na API Casa do Frango...");
    const loginRes = await axios.post(`${apiUrl}/login`, {
      email: "financeiro@casadofrango.com.br",
      password: "@|1]Py6&9}£C"
    }, { httpsAgent: agent });

    console.log("Login response:", loginRes.data);
    const token = (typeof loginRes.data === 'string' ? loginRes.data : loginRes.data?.token || '').trim();
    
    if (!token) throw new Error("Sem token");

    console.log(`📅 Buscando vendas de ontem e hoje (${dateStrYesterday} a ${dateStr})...`);
    const vendasRes = await axios.get(`${apiUrl}/venda`, {
      params: { dataInicial: dateStrYesterday, dataFinal: dateStr },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    
    if (!Array.isArray(dados)) {
      console.log("Sem dados para processar.");
      return;
    }
    
    let totalQtd = 0;
    let totalValor = 0;
    let count = 0;
    const porLoja: Record<string, number> = {};

    const keys = new Map<string, any[]>();

    for (const grupo of dados) {
      const vendasLoja = grupo.VENDAS || [];
      const lojaNome = grupo.LOJA?.NOME || 'Desconhecida';
      const lojaId = grupo.LOJA?.LOJA;
      
      for (const item of vendasLoja) {
        count++;
        totalQtd += item.QTD;
        totalValor += item.VENDA;
        porLoja[lojaNome] = (porLoja[lojaNome] || 0) + item.VENDA;

        const eanLimpo = item.EAN ? String(item.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
        const key = `venda-${lojaId}-${item.DATA}-${eanLimpo}-${item.PLU || '0'}`;
        
        if (!keys.has(key)) {
          keys.set(key, []);
        }
        keys.get(key)!.push(item);
      }
    }

    console.log(`\n✅ Recebido da API com sucesso (${dateStrYesterday} a ${dateStr}):`);
    console.log(`\n✅ Recebido da API com sucesso (${dateStrYesterday} a ${dateStr}):`);
    console.log(`- Quantidade de registros brutos: ${count}`);
    console.log(`- Valor total bruto (R$): ${totalValor.toFixed(2)}`);
    console.log(`- Total Qtd bruto: ${totalQtd}`);

    // Compute aggregated sum
    let aggregatedSum = 0;
    let aggregatedQtd = 0;
    for (const [key, items] of keys.entries()) {
      let keySum = 0;
      let keyQtd = 0;
      items.forEach(it => {
        keySum += Number(it.VENDA || 0);
        keyQtd += Number(it.QTD || 0);
      });
      aggregatedSum += keySum;
      aggregatedQtd += keyQtd;
    }

    console.log(`\n📦 Após agregação em memória:`);
    console.log(`- Quantidade de chaves únicas: ${keys.size}`);
    console.log(`- Valor total agregado (R$): ${aggregatedSum.toFixed(2)}`);
    console.log(`- Total Qtd agregada: ${aggregatedQtd}`);

    // Print some duplicates
    let dupCount = 0;
    let printedKeys = 0;
    console.log("\n🔍 Analisando chaves duplicadas na API:");
    for (const [key, items] of keys.entries()) {
      if (items.length > 1) {
        dupCount += (items.length - 1);
        if (printedKeys < 3) {
          printedKeys++;
          console.log(`Chave: ${key}`);
          items.forEach(it => {
            console.log(`  -> Full Item:`, JSON.stringify(it));
          });
        }
      }
    }
    console.log(`Total de registros duplicados (colisões de chave_unica): ${dupCount}`);
    
  } catch (err: any) {
    console.error("Erro:", err.message);
  }
}

checkApi();
