import axios from 'axios';
import https from 'https';
import { createPrismaClient } from './lib/prisma';
import { ClientConfig } from './config/clients';

const agent = new https.Agent({  
  rejectUnauthorized: false
});
import "dotenv/config";

async function getYesterdayDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export async function syncVendas(client: ClientConfig) {
  console.log(`\n🛒 [${client.name}] Iniciando sincronismo...`);

  const apiUrl = process.env.VENDAS_API_URL || "https://vendas.cometasupermercados.com.br";
  const prisma = createPrismaClient(client.databaseUrl);

  try {
    // 1. Autenticação
    console.log(`🔑 [${client.name}] Autenticando...`);
    const loginRes = await axios.post(`${apiUrl}/login`, {
      email: client.apiEmail,
      password: client.apiPassword
    }, { httpsAgent: agent });

    const token = typeof loginRes.data === 'string' ? loginRes.data : loginRes.data.token;
    
    if (!token) {
      console.log(`⚠️ [${client.name}] Resposta da API inválida:`, JSON.stringify(loginRes.data));
      throw new Error("Não foi possível obter o token.");
    }

    // 2. Datas
    const yesterday = await getYesterdayDate();
    
    // 3. Buscar Vendas
    const vendasRes = await axios.get(`${apiUrl}/venda`, {
      params: { dataInicial: yesterday, dataFinal: yesterday },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    if (!Array.isArray(dados)) {
      console.log(`⚠️ [${client.name}] Sem dados para processar.`);
      return;
    }

    let totalImportado = 0;

    // 4. Salvar no Banco do Cliente
    for (const grupo of dados) {
      const lojaId = grupo.LOJA.LOJA;
      const lojaNome = grupo.LOJA.NOME;
      const vendasLoja = grupo.VENDAS || [];

      for (const item of vendasLoja) {
        const chaveUnica = `venda-${lojaId}-${item.DATA}-${item.EAN}-${item.PLU || '0'}`;
        const valorUnitario = item.QTD > 0 ? item.VENDA / item.QTD : 0;

        const parseDate = (dateStr: string) => {
          if (!dateStr) return new Date();
          const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            return new Date(`${year}-${month}-${day}T12:00:00Z`);
          }
          return new Date(dateStr);
        };

        await prisma.venda.upsert({
          where: { chave_unica: chaveUnica },
          update: {
            qtd: item.QTD,
            venda: item.VENDA,
            custo: item.CUSTO,
            valor_unitario: valorUnitario,
          },
          create: {
            loja: lojaId,
            loja_nome: lojaNome,
            ean: item.EAN,
            plu: item.PLU ? Number(item.PLU) : null,
            produto: item.PRODUTO,
            qtd: item.QTD,
            venda: item.VENDA,
            custo: item.CUSTO,
            cod_interno: item.COD_INTERNO,
            origem: "API_VENDAS_V2",
            chave_unica: chaveUnica,
            valor_unitario: valorUnitario,
            data: parseDate(item.DATA),
          }
        });
        totalImportado++;
      }
    }

    console.log(`✅ [${client.name}] Sucesso: ${totalImportado} registros.`);
    return { success: true, count: totalImportado };

  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`❌ [${client.name}] Erro:`, errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    await prisma.$disconnect();
  }
}
