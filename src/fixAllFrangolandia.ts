import { createPrismaClient } from './lib/prisma';
import { clients } from './config/clients';
import { frangolandiaLojas } from './config/frangolandiaLojas';
import "dotenv/config";

async function main() {
    console.log("=== INICIANDO SANEAMENTO E UNIFICAÇÃO DAS LOJAS FRANGOLÂNDIA ===");

    const clientConf = clients.find(c => c.apiEmail === 'victor@ultrarota.com.br');
    if (!clientConf) throw new Error("Cliente Ultra Rota não configurado.");

    const prisma = createPrismaClient(clientConf.databaseUrl);

    try {
        const officialStoreMap = new Map<number, any>(); // filialNum -> Loja record in DB

        // 1. Garantir que todas as 26 lojas oficiais existem no banco com dados corretos
        console.log("\n1. Verificando/Cadastrando lojas oficiais no banco...");
        for (const cadastro of frangolandiaLojas) {
            const cleanCnpj = cadastro.cnpj.replace(/\D/g, '').padStart(14, '0');
            const filialStr = cleanCnpj.substring(8, 12);
            const filialNum = parseInt(filialStr, 10);

            // Busca se já existe uma loja com este CNPJ no banco
            let lojaDb = await prisma.loja.findFirst({
                where: { cnpj: cleanCnpj }
            });

            if (lojaDb) {
                // Se existe, garante que o nome e rede estão atualizados
                if (lojaDb.nome !== cadastro.nome || lojaDb.rede !== "Frangolandia") {
                    console.log(`   ✏️ Atualizando nome da loja ID ${lojaDb.id}: "${lojaDb.nome}" -> "${cadastro.nome}"`);
                    lojaDb = await prisma.loja.update({
                        where: { id: lojaDb.id },
                        data: {
                            nome: cadastro.nome,
                            rede: "Frangolandia"
                        }
                    });
                }
            } else {
                // Se não existe, cria a loja oficial
                console.log(`   ➕ Cadastrando nova loja oficial: "${cadastro.nome}" (CNPJ: ${cleanCnpj})`);
                lojaDb = await prisma.loja.create({
                    data: {
                        nome: cadastro.nome,
                        cnpj: cleanCnpj,
                        rede: "Frangolandia"
                    }
                });
            }

            officialStoreMap.set(filialNum, lojaDb);
        }

        console.log(`Lojas oficiais prontas: ${officialStoreMap.size} cadastradas/atualizadas.`);

        // 2. Mapear e atualizar todas as vendas históricas de FRANGOLANDIA_EMAIL
        console.log("\n2. Atualizando vendas históricas para apontarem para as lojas corretas...");
        const vendas = await prisma.venda.findMany({
            where: { origem: "FRANGOLANDIA_EMAIL" },
            select: { id: true, loja: true, loja_id: true, loja_nome: true }
        });

        console.log(`Total de vendas do Frangolândia encontradas para processamento: ${vendas.length}`);

        let vendasAtualizadas = 0;
        let errosMapeamento = 0;

        // Vamos agrupar as atualizações por filial para fazer em lote (Bulk Update)
        for (const [filialNum, lojaDb] of officialStoreMap.entries()) {
            // Atualiza todas as vendas cujo campo 'loja' (filial número) corresponde a esta filial
            const res = await prisma.venda.updateMany({
                where: {
                    origem: "FRANGOLANDIA_EMAIL",
                    loja: filialNum
                },
                data: {
                    loja_id: lojaDb.id,
                    loja_nome: lojaDb.nome
                }
            });

            if (res.count > 0) {
                console.log(`   ⚡ Filial ${filialNum} (${lojaDb.nome}): ${res.count} vendas associadas.`);
                vendasAtualizadas += res.count;
            }
        }

        // Verificar se sobrou alguma venda sem correspondência nas 26 lojas oficiais
        const filiaisValidas = Array.from(officialStoreMap.keys());
        const vendasOrfas = await prisma.venda.count({
            where: {
                origem: "FRANGOLANDIA_EMAIL",
                loja: { notIn: filiaisValidas }
            }
        });

        if (vendasOrfas > 0) {
            console.log(`⚠️ Alerta: Existem ${vendasOrfas} vendas com filial número inválida (fora do cadastro de 26 lojas).`);
        }

        // 3. Excluir lojas antigas/duplicadas que não fazem parte das 26 oficiais
        console.log("\n3. Removendo lojas duplicadas/obsoletas do banco...");
        const officialIds = Array.from(officialStoreMap.values()).map(l => l.id);

        const lojasParaRemover = await prisma.loja.findMany({
            where: {
                rede: "Frangolandia",
                id: { notIn: officialIds }
            }
        });

        console.log(`Encontradas ${lojasParaRemover.length} lojas duplicadas ou obsoletas para remoção.`);

        let lojasDeletadas = 0;
        for (const lojaObsoleta of lojasParaRemover) {
            // Verifica se há alguma venda ainda presa a esta loja obsoleta (por segurança)
            const countVendas = await prisma.venda.count({
                where: { loja_id: lojaObsoleta.id }
            });

            if (countVendas > 0) {
                console.log(`   ⚠️ Não foi possível deletar a loja ID ${lojaObsoleta.id} ("${lojaObsoleta.nome}") porque ela ainda possui ${countVendas} vendas vinculadas.`);
            } else {
                await prisma.loja.delete({
                    where: { id: lojaObsoleta.id }
                });
                console.log(`   🗑️ Loja excluída: "${lojaObsoleta.nome}" (ID: ${lojaObsoleta.id})`);
                lojasDeletadas++;
            }
        }

        console.log("\n=== SANEAMENTO CONCLUÍDO COM SUCESSO ===");
        console.log(`Total de vendas redirecionadas/atualizadas: ${vendasAtualizadas}`);
        console.log(`Total de lojas duplicadas excluídas: ${lojasDeletadas}`);

    } catch (error) {
        console.error("❌ Erro durante o saneamento:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
