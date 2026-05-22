import { createPrismaClient } from './lib/prisma';
import { clients } from './config/clients';
import 'dotenv/config';

async function unificarLojas() {
  // Obter a URL de banco da Ultra Rota (Victor)
  const clientConfig = clients.find(c => c.apiEmail === 'victor@ultrarota.com.br');
  if (!clientConfig) {
    console.error("Configuração de banco da Ultra Rota não encontrada!");
    return;
  }

  // Prioriza DATABASE_URL do ambiente se disponível (ex: teste local)
  const dbUrl = process.env.DATABASE_URL || clientConfig.databaseUrl;
  console.log(`🔌 Conectando no banco de dados (${dbUrl.split('@')[1] || 'URL Local'})...`);
  const prisma = createPrismaClient(dbUrl);

  try {
    // 1. Obter todas as lojas cadastradas na base
    const lojas = await (prisma as any).loja.findMany();
    console.log(`🏠 Total de lojas cadastradas no banco: ${lojas.length}`);

    // 2. Agrupar por código numérico de filial (ex: "08 - V VELHA" ou "Cometa - 08 - V VELHA" -> código 8)
    const grupos = new Map<number, typeof lojas>();
    
    for (const loja of lojas) {
      // Extrair o primeiro número encontrado no nome da loja (independente de prefixos)
      const match = loja.nome.match(/\d+/);
      const codigoFisico = match ? parseInt(match[0], 10) : NaN;
      
      if (isNaN(codigoFisico)) {
        console.log(`⚠️ Loja sem código numérico no nome ignorada do agrupamento automático: "${loja.nome}" (ID: ${loja.id})`);
        continue;
      }

      if (!grupos.has(codigoFisico)) {
        grupos.set(codigoFisico, []);
      }
      grupos.get(codigoFisico)!.push(loja);
    }

    console.log(`\n📦 Total de grupos de lojas físicas identificados: ${grupos.size}`);

    for (const [codigo, lojasGrupo] of grupos.entries()) {
      if (lojasGrupo.length === 1) {
        // Apenas uma loja física cadastrada para este código, nenhuma duplicação!
        // Apenas garantimos que o userId seja null (para ser global) e a rede seja "Cometa"
        const lojaUnica = lojasGrupo[0];
        if (lojaUnica.userId !== null || lojaUnica.rede !== "Cometa") {
          console.log(`🔧 Ajustando loja única "${lojaUnica.nome}" (ID: ${lojaUnica.id}) para ser global/rede Cometa`);
          await (prisma as any).loja.update({
            where: { id: lojaUnica.id },
            data: { userId: null, rede: "Cometa" }
          });
        }
        continue;
      }

      console.log(`\n🔎 Tratando duplicações para o código de filial [${codigo}] (${lojasGrupo.length} duplicatas encontradas):`);
      
      // Eleger a loja sobrevivente (a que tem menor id ou que tiver userId nulo)
      const ordenado = [...lojasGrupo].sort((a, b) => a.id - b.id);
      const sobrevivente = ordenado[0];
      const duplicadas = ordenado.slice(1);

      console.log(`   🏆 Sobrevivente eleita: "${sobrevivente.nome}" (ID: ${sobrevivente.id})`);
      console.log(`   🗑️ Lojas duplicadas para eliminar: ${duplicadas.map(d => `${d.id} (User: ${d.userId})`).join(', ')}`);

      // Atualizar sobrevivente para ser global e associada à Rede Cometa
      await (prisma as any).loja.update({
        where: { id: sobrevivente.id },
        data: { userId: null, rede: "Cometa" }
      });

      // Mapear IDs duplicados
      const idsDuplicados = duplicadas.map(d => d.id);

      // 3. Atualizar vendas que apontavam para as lojas duplicadas
      const vendasAtualizadas = await prisma.venda.updateMany({
        where: { loja_id: { in: idsDuplicados } },
        data: { loja_id: sobrevivente.id }
      });
      console.log(`   🔄 Vendas atualizadas de IDs duplicados para o ID ${sobrevivente.id}: ${vendasAtualizadas.count}`);

      // 4. Atualizar mapeamentos DePara que apontavam para as lojas duplicadas
      for (const dup of duplicadas) {
        const mapeamentosDuplicados = await (prisma as any).produtoDePara.findMany({
          where: { loja_id: dup.id }
        });

        for (const mapItem of mapeamentosDuplicados) {
          // Checar se já existe mapeamento idêntico na sobrevivente
          const existeNaSobrevivente = await (prisma as any).produtoDePara.findFirst({
            where: {
              codigo_api: mapItem.codigo_api,
              loja_id: sobrevivente.id,
              userId: mapItem.userId
            }
          });

          if (existeNaSobrevivente) {
            // Se já existe na sobrevivente, podemos apenas deletar este mapeamento da duplicada
            await (prisma as any).produtoDePara.delete({
              where: { id: mapItem.id }
            });
            console.log(`   🗑️ Mapeamento duplicado removido (EAN: ${mapItem.codigo_api}, Loja ID: ${dup.id}) pois já existe na loja sobrevivente`);
          } else {
            // Se não existe, podemos atualizar o loja_id para a sobrevivente com segurança
            await (prisma as any).produtoDePara.update({
              where: { id: mapItem.id },
              data: { loja_id: sobrevivente.id }
            });
            console.log(`   🔄 Mapeamento (EAN: ${mapItem.codigo_api}, ID: ${mapItem.id}) atualizado para a loja sobrevivente ${sobrevivente.id}`);
          }
        }
      }

      // 5. Excluir os registros duplicados da tabela lojas
      const deletados = await (prisma as any).loja.deleteMany({
        where: { id: { in: idsDuplicados } }
      });
      console.log(`   ❌ Lojas duplicadas deletadas da base: ${deletados.count}`);
    }

    console.log(`\n🎉 Processo de consolidação e limpeza concluído com sucesso!`);

  } catch (error) {
    console.error("💥 Erro durante o processo de consolidação de lojas:", error);
  } finally {
    await prisma.$disconnect();
  }
}

unificarLojas();
