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
  const isNewSchema = isVictor || client.apiEmail === 'sthephanuscomercial@gmail.com';
  const redeName = isVictor ? "Cometa" : "Sthephanus";
  
  // Em produção, usar sempre o banco de dados específico de cada cliente.
  // Em desenvolvimento local, se DATABASE_URL estiver no .env, usamos para testes locais.
  const dbUrl = process.env.NODE_ENV === 'production'
    ? client.databaseUrl
    : (process.env.DATABASE_URL || client.databaseUrl);

  // Instanciar o cliente do Prisma correspondente ao banco/schema de destino
  const prisma = isNewSchema 
    ? createPrismaClient(dbUrl)
    : createPrismaClientOld(dbUrl);

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

    const parseDate = (dateStr: string) => {
      if (!dateStr) return new Date();
      const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return new Date(`${year}-${month}-${day}T12:00:00Z`);
      }
      return new Date(dateStr);
    };

    // 1. Carregar mapeamento de lojas físicas
    const mapaLojas = new Map<number, number>();
    if (isNewSchema && Array.isArray(dados)) {
      console.log(`🔍 [${client.name}] Carregando lojas físicas da rede ${redeName} para correspondência inteligente...`);
      const lojasDb = await (prisma as any).loja.findMany({
        where: {
          OR: [
            { rede: redeName },
            { nome: { contains: redeName, mode: 'insensitive' } }
          ]
        }
      });
      
      for (const loja of lojasDb) {
        const match = loja.nome.match(/\d+/);
        if (match) {
          const cod = parseInt(match[0], 10);
          mapaLojas.set(cod, loja.id);
        }
      }
      console.log(`   🏠 [${client.name}] ${mapaLojas.size} lojas físicas mapeadas em memória.`);
    }

    // 2. Carregar mapeamento ProdutoDePara (MDM) em memória para evitar consultas em loop
    const mappingMap = new Map<string, number>();
    if (isNewSchema) {
      console.log(`🔍 [${client.name}] Carregando mapeamentos de produto (ProdutoDePara)...`);
      const mappings = await (prisma as any).produtoDePara.findMany({
        where: {
          OR: [
            { userId: client.apiEmail },
            { userId: null },
            { userId: '' }
          ]
        }
      });
      
      for (const m of mappings) {
        const key = m.loja_id ? `${m.codigo_api}-${m.loja_id}` : m.codigo_api;
        mappingMap.set(key, m.produto_mestre_id);
      }
      console.log(`   📦 [${client.name}] ${mappingMap.size} mapeamentos ProdutoDePara carregados em memória.`);
    }

    // 3. Carregar vendas existentes no período para evitar findUnique no loop
    const existingVendasMap = new Map<string, { qtd: number, venda: number }>();
    try {
      console.log(`🔍 [${client.name}] Carregando vendas existentes no período...`);
      const existingVendas = await (prisma as any).venda.findMany({
        where: {
          data: {
            gte: parseDate(startDate),
            lte: parseDate(endDate)
          },
          ...(isNewSchema ? { userId: client.apiEmail } : {})
        },
        select: { chave_unica: true, qtd: true, venda: true }
      });
      for (const v of existingVendas) {
        existingVendasMap.set(v.chave_unica, { 
          qtd: Number(v.qtd) || 0, 
          venda: Number(v.venda) || 0 
        });
      }
      console.log(`   📊 [${client.name}] ${existingVendasMap.size} vendas existentes em memória.`);
    } catch (err: any) {
      console.warn(`   ⚠️ [${client.name}] Não foi possível carregar vendas existentes (pode ser a primeira execução):`, err.message);
    }

    const uniqueWrites = new Map<string, () => Promise<any>>();

    // 4. Salvar no Banco do Cliente
    for (const grupo of dados) {
      const lojaId = grupo.LOJA.LOJA;
      const lojaNome = grupo.LOJA.NOME;
      const vendasLoja = grupo.VENDAS || [];
      const userId = client.apiEmail;

      let lid: number | undefined;

      if (isNewSchema) {
        // Extrair código físico do nome da loja retornado pela API ou do ID da loja
        const match = lojaNome.match(/\d+/) || String(lojaId).match(/\d+/);
        const codigoFisico = match ? parseInt(match[0], 10) : NaN;

        if (!isNaN(codigoFisico)) {
          lid = mapaLojas.get(codigoFisico);
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
                rede: redeName // Rede padrão para esta automação
              }
            });
          }
          
          lid = lojaDb.id;
          if (!isNaN(codigoFisico)) {
            mapaLojas.set(codigoFisico, lid as number);
          }
        }
      }

      for (const item of vendasLoja) {
        contagemPorData[item.DATA] = (contagemPorData[item.DATA] || 0) + 1;
        // Extrai apenas o primeiro EAN e remove caracteres não numéricos
        const eanLimpo = item.EAN ? String(item.EAN).replace(/"/g, '').split(',')[0].replace(/\D/g, '').trim() : '';
        const chaveUnica = `venda-${lojaId}-${item.DATA}-${item.EAN}-${item.PLU || '0'}`;
        const valorUnitario = item.QTD > 0 ? item.VENDA / item.QTD : 0;

        let mestreId: number | null = null;
        if (isNewSchema && lid) {
          mestreId = mappingMap.get(`${eanLimpo}-${lid}`) || mappingMap.get(eanLimpo) || null;

          // Se não houver mapeamento para o EAN limpo, autocadastra o Produto Mestre e cria o De/Para
          if (!mestreId && eanLimpo) {
            let pm = await (prisma as any).produtoMestre.findFirst({
              where: { codigo: eanLimpo, userId: null }
            });

            if (!pm) {
              console.log(`   📦 [${client.name}] Autocadastro de Produto Mestre: "${item.PRODUTO}" (Código/EAN: ${eanLimpo})`);
              pm = await (prisma as any).produtoMestre.create({
                data: {
                  codigo: eanLimpo,
                  nome: item.PRODUTO,
                  categoria: 'Autocadastro',
                  userId: null
                }
              });
            }

            try {
              await (prisma as any).produtoDePara.create({
                data: {
                  codigo_api: eanLimpo,
                  loja_id: null,
                  produto_mestre_id: pm.id,
                  userId: null
                }
              });
            } catch (err: any) {
              // Ignora erro se outro processo inseriu ao mesmo tempo
              console.warn(`   ⚠️ [${client.name}] Mapeamento De/Para já existente para o EAN: ${eanLimpo}`);
            }

            mestreId = pm.id;
            mappingMap.set(eanLimpo, mestreId);
          }
        }

        const existingRecord = existingVendasMap.get(chaveUnica);
        const needsUpdate = !existingRecord || existingRecord.qtd !== item.QTD || existingRecord.venda !== item.VENDA;
        
        if (needsUpdate) {
          if (!existingRecord) {
            totalNovos++;
          }
          existingVendasMap.set(chaveUnica, { qtd: item.QTD, venda: item.VENDA });

          if (isNewSchema) {
            uniqueWrites.set(chaveUnica, () => (prisma as any).venda.upsert({
              where: { chave_unica: chaveUnica },
              update: {
                qtd: item.QTD,
                venda: item.VENDA,
                custo: item.CUSTO,
                valor_unitario: valorUnitario,
                loja_id: lid,
                produto_mestre_id: mestreId,
                ean: eanLimpo || String(item.EAN)
              },
              create: {
                loja: lojaId,
                loja_nome: lojaNome,
                ean: eanLimpo || String(item.EAN),
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
            }));
          } else {
            uniqueWrites.set(chaveUnica, () => (prisma as any).venda.upsert({
              where: { chave_unica: chaveUnica },
              update: {
                qtd: item.QTD,
                venda: item.VENDA,
                custo: item.CUSTO,
                valor_unitario: valorUnitario,
                ean: eanLimpo || String(item.EAN)
              },
              create: {
                loja: lojaId,
                loja_nome: lojaNome,
                ean: eanLimpo || String(item.EAN),
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
            }));
          }
        }
        totalImportado++;
      }
    }

    // 5. Executar as gravações em lotes concorrentes (chunks)
    if (uniqueWrites.size > 0) {
      console.log(`💾 [${client.name}] Gravando ${uniqueWrites.size} registros únicos no banco de dados (lotes de 50)...`);
      const writePromises = Array.from(uniqueWrites.values());
      const chunkSize = 50;
      for (let i = 0; i < writePromises.length; i += chunkSize) {
        const chunk = writePromises.slice(i, i + chunkSize);
        await Promise.all(chunk.map(fn => fn()));
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
