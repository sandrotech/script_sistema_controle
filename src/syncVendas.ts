import axios from 'axios';
import https from 'https';
import { createPrismaClient, createPrismaClientOld } from './lib/prisma';
import { ClientConfig } from './config/clients';

const agent = new https.Agent({  
  rejectUnauthorized: false
});
import "dotenv/config";

async function getDateStr(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export async function syncVendas(client: ClientConfig, customStartDate?: string, customEndDate?: string) {
  console.log(`\n🛒 [${client.name}] Iniciando sincronismo...`);

  const apiUrl = process.env.VENDAS_API_URL || "https://vendas.cometasupermercados.com.br";
  const isVictor = client.apiEmail === 'victor@ultrarota.com.br';
  
  // Instanciar o cliente do Prisma correspondente ao banco/schema de destino
  const prisma = isVictor 
    ? createPrismaClient(process.env.DATABASE_URL || client.databaseUrl)
    : createPrismaClientOld(process.env.DATABASE_URL || client.databaseUrl);

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

    // 2. Datas (Ontem e Antes de Ontem por padrão, ou Período Customizado)
    const endDate = customEndDate || await getDateStr(1);   // Ontem por padrão
    const startDate = customStartDate || await getDateStr(2); // Antes de ontem por padrão
    console.log(`📅 [${client.name}] Buscando de ${startDate} até ${endDate}...`);
    
    // 3. Buscar Vendas
    const vendasRes = await axios.get(`${apiUrl}/venda`, {
      params: { dataInicial: startDate, dataFinal: endDate },
      headers: { Authorization: `Bearer ${token}` },
      httpsAgent: agent
    });

    const dados = vendasRes.data;
    
    // Log para depuração de datas recebidas
    if (Array.isArray(dados)) {
        const datasEncontradas = new Set();
        dados.forEach(g => (g.VENDAS || []).forEach((v: any) => datasEncontradas.add(v.DATA)));
        console.log(`🔍 [${client.name}] Datas recebidas da API:`, Array.from(datasEncontradas));
    }
    if (!Array.isArray(dados)) {
      console.log(`⚠️ [${client.name}] Sem dados para processar.`);
      return { success: true, count: 0, newRecords: 0 };
    }

    let totalImportado = 0;
    let totalNovos = 0;
    const contagemPorData: Record<string, number> = {};

    // Mapa em memória de código de filial física -> id da loja no banco (apenas Victor/Cometa)
    const mapaLojasCometa = new Map<number, number>();
    
    if (isVictor && Array.isArray(dados)) {
      console.log(`🔍 [${client.name}] Carregando lojas físicas da rede Cometa para correspondência inteligente...`);
      const lojasDb = await (prisma as any).loja.findMany({
        where: {
          OR: [
            { rede: "Cometa" },
            { nome: { contains: "Cometa", mode: 'insensitive' } }
          ]
        }
      });
      
      for (const loja of lojasDb) {
        const match = loja.nome.match(/\d+/);
        if (match) {
          const cod = parseInt(match[0], 10);
          mapaLojasCometa.set(cod, loja.id);
        }
      }
      console.log(`   🏠 [${client.name}] ${mapaLojasCometa.size} lojas físicas mapeadas em memória.`);
    }

    // 4. Salvar no Banco do Cliente
    for (const grupo of dados) {
      const lojaId = grupo.LOJA.LOJA;
      const lojaNome = grupo.LOJA.NOME;
      const vendasLoja = grupo.VENDAS || [];
      const userId = client.apiEmail;

      let lid: number | undefined;

      if (isVictor) {
        // Extrair código físico do nome da loja retornado pela API ou do ID da loja
        const match = lojaNome.match(/\d+/) || String(lojaId).match(/\d+/);
        const codigoFisico = match ? parseInt(match[0], 10) : NaN;

        if (!isNaN(codigoFisico)) {
          lid = mapaLojasCometa.get(codigoFisico);
        }

        if (!lid) {
          // Buscar no BD de forma direta por segurança (verificando código no nome)
          let lojaDb = null;
          if (!isNaN(codigoFisico)) {
            lojaDb = await (prisma as any).loja.findFirst({
              where: {
                OR: [
                  { nome: lojaNome },
                  { nome: { startsWith: `${String(codigoFisico).padStart(2, '0')} -` } },
                  { nome: { startsWith: `${codigoFisico} -` } },
                  { nome: { contains: ` - ${codigoFisico} - ` } }
                ]
              }
            });
          } else {
            lojaDb = await (prisma as any).loja.findFirst({
              where: { nome: lojaNome }
            });
          }

          if (!lojaDb) {
            console.log(`   🏠 [${client.name}] Criando Loja física global no BD: "${lojaNome}"...`);
            lojaDb = await (prisma as any).loja.create({
              data: {
                nome: lojaNome,
                userId: null, // Torna global/compartilhado
                rede: "Cometa" // Rede padrão para esta automação
              }
            });
          }
          
          lid = lojaDb.id;
          if (!isNaN(codigoFisico)) {
            mapaLojasCometa.set(codigoFisico, lid);
          }
        }
      }

      for (const item of vendasLoja) {
        contagemPorData[item.DATA] = (contagemPorData[item.DATA] || 0) + 1;
        const eanLimpo = item.EAN ? String(item.EAN).replace(/"/g, '').trim().replace(/\D/g, '') : '';
        const chaveUnica = `venda-${lojaId}-${item.DATA}-${item.EAN}-${item.PLU || '0'}`;
        const valorUnitario = item.QTD > 0 ? item.VENDA / item.QTD : 0;

        let mestreId: number | null = null;

        if (isVictor && lid) {
          // Buscar mapeamento ProdutoDePara para esta loja ou global (apenas para Victor)
          const mapping = await (prisma as any).produtoDePara.findFirst({
            where: {
              codigo_api: eanLimpo,
              userId: userId,
              OR: [
                { loja_id: lid },
                { loja_id: null }
              ]
            }
          });
          mestreId = mapping?.produto_mestre_id || null;
        }

        const parseDate = (dateStr: string) => {
          if (!dateStr) return new Date();
          const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
          if (parts.length === 3) {
            const [day, month, year] = parts;
            return new Date(`${year}-${month}-${day}T12:00:00Z`);
          }
          return new Date(dateStr);
        };

        // Verificar se já existe para contar novos
        const existe = await prisma.venda.findUnique({
          where: { chave_unica: chaveUnica },
          select: { id: true }
        });

        if (!existe) totalNovos++;

        if (isVictor) {
          await (prisma as any).venda.upsert({
            where: { chave_unica: chaveUnica },
            update: {
              qtd: item.QTD,
              venda: item.VENDA,
              custo: item.CUSTO,
              valor_unitario: valorUnitario,
              loja_id: lid,
              produto_mestre_id: mestreId
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
              userId: userId,
              loja_id: lid,
              produto_mestre_id: mestreId
            }
          });
        } else {
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
        }
        totalImportado++;
      }
    }

    console.log(`✅ [${client.name}] Sucesso: ${totalImportado} registros total (${totalNovos} novos).`);
    Object.entries(contagemPorData).forEach(([dt, qtd]) => {
      console.log(`   - ${dt}: ${qtd} vendas`);
    });
    
    return { success: true, count: totalImportado, newRecords: totalNovos };

  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    console.error(`❌ [${client.name}] Erro:`, errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    await prisma.$disconnect();
  }
}
