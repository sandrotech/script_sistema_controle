import { createPrismaClient } from './lib/prisma';
import { clients } from './config/clients';
import { frangolandiaLojas } from './config/frangolandiaLojas';
import "dotenv/config";

// Função para normalizar strings e comparar nomes ignorando acentos, espaços, maiúsculas/minúsculas e hifens
function normalizeName(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9]/g, "");     // Remove hifens, espaços e caracteres especiais
}

async function main() {
    console.log("=== INICIANDO SANEAMENTO DE LOJAS FRANGOLÂNDIA (MÉTODO UPDATE) ===");

    const clientConf = clients.find(c => c.apiEmail === 'victor@ultrarota.com.br');
    if (!clientConf) throw new Error("Cliente Ultra Rota não configurado.");

    const prisma = createPrismaClient(clientConf.databaseUrl);

    try {
        // 1. Buscar todas as lojas da Frangolândia cadastradas no banco atualmente
        const dbLojas = await prisma.loja.findMany({
            where: { rede: "Frangolandia" }
        });

        console.log(`Lojas Frangolândia encontradas no banco: ${dbLojas.length}`);

        const officialStoreMap = new Map<number, any>(); // filialNum -> Loja record no DB
        const processedDbLojaIds = new Set<number>();

        // 2. Tentar mapear as lojas existentes pelo nome normalizado
        console.log("\n1. Mapeando e atualizando lojas existentes por correspondência de nome...");
        for (const cadastro of frangolandiaLojas) {
            const cleanCnpj = cadastro.cnpj.replace(/\D/g, '').padStart(14, '0');
            const filialStr = cleanCnpj.substring(8, 12);
            const filialNum = parseInt(filialStr, 10);
            
            const normalizedCadastroName = normalizeName(cadastro.nome);

            // Tenta encontrar uma loja no banco cujo nome normalizado seja igual
            let matchedDbLoja = dbLojas.find(dbLoja => {
                // Evita pegar a mesma loja duas vezes
                if (processedDbLojaIds.has(dbLoja.id)) return false;
                
                const normalizedDbName = normalizeName(dbLoja.nome);
                // Verifica se um nome contém o outro ou se são idênticos normalizados
                return normalizedDbName === normalizedCadastroName || 
                       normalizedDbName.includes(normalizedCadastroName) || 
                       normalizedCadastroName.includes(normalizedDbName);
            });

            if (matchedDbLoja) {
                console.log(`   🔄 Atualizando loja existente ID ${matchedDbLoja.id}: "${matchedDbLoja.nome}" -> "${cadastro.nome}" (CNPJ: ${cleanCnpj})`);
                const updatedLoja = await prisma.loja.update({
                    where: { id: matchedDbLoja.id },
                    data: {
                        nome: cadastro.nome,
                        cnpj: cleanCnpj,
                        rede: "Frangolandia"
                    }
                });
                officialStoreMap.set(filialNum, updatedLoja);
                processedDbLojaIds.add(matchedDbLoja.id);
            } else {
                // Se não achou por nome, tenta achar pelo CNPJ exato
                let matchedByCnpj = dbLojas.find(dbLoja => {
                    if (processedDbLojaIds.has(dbLoja.id)) return false;
                    if (!dbLoja.cnpj) return false;
                    return dbLoja.cnpj.replace(/\D/g, '').padStart(14, '0') === cleanCnpj;
                });

                if (matchedByCnpj) {
                    console.log(`   🔄 Atualizando loja por CNPJ exato ID ${matchedByCnpj.id}: "${matchedByCnpj.nome}" -> "${cadastro.nome}"`);
                    const updatedLoja = await prisma.loja.update({
                        where: { id: matchedByCnpj.id },
                        data: {
                            nome: cadastro.nome,
                            cnpj: cleanCnpj,
                            rede: "Frangolandia"
                        }
                    });
                    officialStoreMap.set(filialNum, updatedLoja);
                    processedDbLojaIds.add(matchedByCnpj.id);
                } else {
                    // Se não achou de forma alguma, cria uma nova loja
                    console.log(`   ➕ Cadastrando nova loja oficial: "${cadastro.nome}" (CNPJ: ${cleanCnpj})`);
                    const newLoja = await prisma.loja.create({
                        data: {
                            nome: cadastro.nome,
                            cnpj: cleanCnpj,
                            rede: "Frangolandia"
                        }
                    });
                    officialStoreMap.set(filialNum, newLoja);
                    processedDbLojaIds.add(newLoja.id);
                }
            }
        }

        // 3. Mapear e atualizar todas as vendas associando-as à loja correta
        console.log("\n2. Atualizando e unificando vendas...");
        let totalVendasMigradas = 0;

        for (const [filialNum, lojaDb] of officialStoreMap.entries()) {
            // Atualiza todas as vendas cuja filial (coluna 'loja') corresponde ao número dessa filial
            // Isso redireciona as vendas tanto das lojas principais quanto de quaisquer duplicatas/filiais provisórias
            const updateRes = await prisma.venda.updateMany({
                where: {
                    origem: "FRANGOLANDIA_EMAIL",
                    loja: filialNum
                },
                data: {
                    loja_id: lojaDb.id,
                    loja_nome: lojaDb.nome
                }
            });

            if (updateRes.count > 0) {
                console.log(`   ⚡ Filial ${filialNum} (${lojaDb.nome}): ${updateRes.count} vendas consolidadas.`);
                totalVendasMigradas += updateRes.count;
            }
        }

        // 4. Remover as lojas duplicadas que sobraram e ficaram sem vendas
        console.log("\n3. Removendo lojas obsoletas/duplicadas que ficaram sem vendas...");
        const officialIds = Array.from(officialStoreMap.values()).map(l => l.id);

        const lojasRestantes = await prisma.loja.findMany({
            where: {
                rede: "Frangolandia",
                id: { notIn: officialIds }
            }
        });

        let lojasDeletadas = 0;
        for (const lojaObsoleta of lojasRestantes) {
            const countVendas = await prisma.venda.count({
                where: { loja_id: lojaObsoleta.id }
            });

            if (countVendas > 0) {
                console.log(`   ⚠️ Mantida loja ID ${lojaObsoleta.id} ("${lojaObsoleta.nome}") porque ainda possui ${countVendas} vendas.`);
            } else {
                await prisma.loja.delete({
                    where: { id: lojaObsoleta.id }
                });
                console.log(`   🗑️ Loja duplicada excluída: "${lojaObsoleta.nome}" (ID: ${lojaObsoleta.id})`);
                lojasDeletadas++;
            }
        }

        console.log("\n=== SANEAMENTO CONCLUÍDO ===");
        console.log(`Total de vendas unificadas: ${totalVendasMigradas}`);
        console.log(`Total de lojas duplicadas excluídas: ${lojasDeletadas}`);

    } catch (error) {
        console.error("❌ Erro no saneamento:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();

