import { createPrismaClient } from './lib/prisma';
import { clients } from './config/clients';
import { frangolandiaLojas } from './config/frangolandiaLojas';
import "dotenv/config";

async function main() {
    console.log("=== INICIANDO MIGRAÇÃO DE LOJAS DUPLICADAS FRANGOLÂNDIA ===");

    const clientConf = clients.find(c => c.apiEmail === 'victor@ultrarota.com.br');
    if (!clientConf) throw new Error("Cliente Ultra Rota não configurado.");

    const prisma = createPrismaClient(clientConf.databaseUrl);

    try {
        // 1. Buscar todas as lojas da Frangolândia
        const allLojas = await prisma.loja.findMany({
            where: { rede: "Frangolandia" }
        });

        console.log(`Encontradas ${allLojas.length} lojas da Frangolândia no total.`);

        // Lojas oficiais (com CNPJ)
        const officialLojas = allLojas.filter(l => l.cnpj !== null && l.cnpj.trim() !== "");
        // Lojas temporárias/duplicadas (sem CNPJ ou com nome padrão "Filial X")
        const duplicateLojas = allLojas.filter(l => l.cnpj === null || l.nome.startsWith("Frangolandia Filial"));

        console.log(`Lojas Oficiais: ${officialLojas.length}`);
        console.log(`Lojas Duplicadas: ${duplicateLojas.length}`);

        let totalVendasMigradas = 0;
        let totalLojasExcluidas = 0;

        for (const dup of duplicateLojas) {
            // Extrair o número da filial do nome (Ex: "Frangolandia Filial 21" -> 21)
            const match = dup.nome.match(/\d+/);
            if (!match) {
                console.log(`⚠️ Não foi possível determinar o número da filial para a loja: "${dup.nome}" (ID: ${dup.id}). Ignorando.`);
                continue;
            }
            const filialNum = parseInt(match[0], 10);

            // Tenta encontrar a loja oficial correspondente no banco
            let officialMatch = officialLojas.find(off => {
                if (!off.cnpj) return false;
                const cleanCnpj = off.cnpj.replace(/\D/g, '').padStart(14, '0');
                const filialStr = cleanCnpj.substring(8, 12);
                return parseInt(filialStr, 10) === filialNum;
            });

            if (!officialMatch) {
                // Tenta achar na nossa lista de cadastros oficiais importada
                const cadastro = frangolandiaLojas.find(f => {
                    const cleanCnpj = f.cnpj.replace(/\D/g, '').padStart(14, '0');
                    const filialStr = cleanCnpj.substring(8, 12);
                    return parseInt(filialStr, 10) === filialNum;
                });

                if (cadastro) {
                    console.log(`   🏠 Cadastrando loja oficial no BD: "${cadastro.nome}"...`);
                    const cleanCnpj = cadastro.cnpj.replace(/\D/g, '').padStart(14, '0');
                    officialMatch = await prisma.loja.create({
                        data: {
                            nome: cadastro.nome,
                            cnpj: cleanCnpj,
                            rede: "Frangolandia",
                            userId: null
                        }
                    });
                    officialLojas.push(officialMatch);
                }
            }

            if (!officialMatch) {
                console.log(`⚠️ Nenhuma loja oficial correspondente encontrada para a filial ${filialNum} (Loja: "${dup.nome}", ID: ${dup.id}).`);
                continue;
            }

            console.log(`\n🔄 Unificando: "${dup.nome}" (ID: ${dup.id}) -> "${officialMatch.nome}" (ID: ${officialMatch.id})`);

            // Migrar vendas
            const updateRes = await prisma.venda.updateMany({
                where: { loja_id: dup.id },
                data: {
                    loja_id: officialMatch.id,
                    loja_nome: officialMatch.nome
                }
            });

            console.log(`   ✅ ${updateRes.count} vendas migradas.`);
            totalVendasMigradas += updateRes.count;

            // Evitar erro se o ID for o mesmo por algum motivo
            if (dup.id !== officialMatch.id) {
                await prisma.loja.delete({
                    where: { id: dup.id }
                });
                console.log(`   🗑️ Loja duplicada ID ${dup.id} excluída com sucesso.`);
                totalLojasExcluidas++;
            }
        }

        console.log(`\n🎉 Migração concluída!`);
        console.log(`Total de vendas migradas: ${totalVendasMigradas}`);
        console.log(`Total de lojas duplicadas excluídas: ${totalLojasExcluidas}`);

    } catch (error) {
        console.error("❌ Erro durante a migração:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
