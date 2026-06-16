import imaps from 'imap-simple';
import { createPrismaClient } from './lib/prisma';
import { clients } from './config/clients';
import "dotenv/config";

const config = {
    imap: {
        user: process.env.FRANGOLANDIA_IMAP_USER || '',
        password: process.env.FRANGOLANDIA_IMAP_PASSWORD || '',
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 3000
    }
};

export async function syncFrangolandiaUltraRota() {
    console.log("Iniciando sincronismo Frangolândia (Ultra Rota) via E-mail...");
    const clientConf = clients.find(c => c.apiEmail === 'victor@ultrarota.com.br');
    if (!clientConf) throw new Error("Cliente Ultra Rota não configurado.");

    if (!config.imap.user || !config.imap.password) {
        throw new Error("⚠️ As variáveis de e-mail e/ou senha (FRANGOLANDIA_IMAP_USER / FRANGOLANDIA_IMAP_PASSWORD) não estão configuradas no arquivo .env!");
    }

    try {
        console.log(`Conectando ao banco de dados Prisma do cliente: ${clientConf.apiEmail}...`);
        const prisma = createPrismaClient(clientConf.databaseUrl);

        console.log("Iniciando conexão IMAP com o Google...");
        const connection = await imaps.connect(config);
        
        console.log("Conexão IMAP estabelecida. Abrindo a caixa de entrada (INBOX)...");
        await connection.openBox('INBOX');

        console.log("Caixa INBOX aberta. Calculando data de 30 dias atrás...");
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        
        const searchCriteria = [
            ['FROM', 'automatico@superfrangolandia.com.br'],
            ['SINCE', trintaDiasAtras]
        ];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true, markSeen: true };

        console.log("Iniciando busca de e-mails com os critérios definidos...");

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`E-mails encontrados nos últimos 30 dias: ${messages.length}`);

        let totalImportado = 0;
        const mapaLojasFrangolandia = new Map<number, number>();

        for (const msg of messages) {
            console.log(`\n📧 Lendo e-mail recebido em: ${msg.attributes.date}`);
            const parts = imaps.getParts(msg.attributes.struct);
            const attachments = parts.filter(part => part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT');

            if (attachments.length === 0) {
                console.log("Nenhum anexo encontrado neste e-mail.");
            }

            for (const attachment of attachments) {
                if (attachment.params && attachment.params.name && attachment.params.name.endsWith('.txt')) {
                    const partData = await connection.getPartData(msg, attachment);
                    const textContent = partData.toString('utf-8');
                    
                    const lines = textContent.split('\n').filter(line => line.trim() !== '');
                    console.log(`📎 Processando anexo: ${attachment.params.name} (${lines.length} linhas de produtos encontradas)`);

                    let linhasInseridas = 0;
                    for (const line of lines) {
                        const partes = line.split(';');
                        if (partes.length < 6) continue;

                        const [cnpjRaw, dataStr, pluRaw, produto, qtdRaw, vendaRaw] = partes;
                        
                        // Extrai apenas os últimos 4 dígitos do CNPJ antes do último número (ex: 3879760000370 -> 0037 -> 37)
                        const cnpjClean = cnpjRaw.replace(/\D/g, '');
                        if (cnpjClean.length < 13) continue;
                        
                        const filialStr = cnpjClean.substring(8, 12);
                        const lojaId = parseInt(filialStr, 10);
                        
                        const plu = parseInt(pluRaw, 10);
                        const qtd = parseFloat(qtdRaw.replace(',', '.'));
                        const venda = parseFloat(vendaRaw.replace(',', '.'));

                        const [day, month, year] = dataStr.split('/');
                        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

                        const chaveUnica = `venda-${lojaId}-${dataStr}-${plu}-${plu}`;
                        const valorUnitario = qtd > 0 ? venda / qtd : 0;

                        // MDM: Look up or create loja_id
                        let lid = mapaLojasFrangolandia.get(lojaId);
                        let lojaNome = `Frangolandia Filial ${lojaId}`; // fallback
                        
                        if (!lid) {
                            const previousSale = await prisma.venda.findFirst({
                                where: { loja: lojaId, loja_id: { not: null }, origem: "FRANGOLANDIA_EMAIL" },
                                select: { loja_id: true, loja_nome: true },
                                orderBy: { id: 'desc' }
                            });
                            
                            if (previousSale && previousSale.loja_id) {
                                lid = previousSale.loja_id;
                                lojaNome = previousSale.loja_nome || lojaNome;
                                mapaLojasFrangolandia.set(lojaId, lid);
                            } else {
                                let lojaDb = await (prisma as any).loja.findFirst({
                                    where: { nome: lojaNome, rede: "Frangolandia" }
                                });
                                
                                if (!lojaDb) {
                                    console.log(`   🏠 Criando Loja Frangolândia no BD: "${lojaNome}"...`);
                                    lojaDb = await (prisma as any).loja.create({
                                        data: {
                                            nome: lojaNome,
                                            rede: "Frangolandia"
                                        }
                                    });
                                }
                                lid = lojaDb.id;
                                mapaLojasFrangolandia.set(lojaId, lid);
                            }
                        }

                        // MDM: Buscar mapeamento ProdutoDePara
                        const mapping = await (prisma as any).produtoDePara.findFirst({
                            where: {
                                codigo_api: plu.toString(),
                                userId: clientConf.apiEmail,
                                OR: [
                                    { loja_id: lid },
                                    { loja_id: null }
                                ]
                            }
                        });
                        const mestreId = mapping?.produto_mestre_id || null;

                        await prisma.venda.upsert({
                            where: { chave_unica: chaveUnica },
                            update: {
                                qtd,
                                venda,
                                valor_unitario: valorUnitario,
                                loja_id: lid,
                                produto_mestre_id: mestreId,
                                loja_nome: lojaNome,
                                ean: plu.toString()
                            },
                            create: {
                                loja: lojaId,
                                loja_nome: lojaNome,
                                ean: plu.toString(), // Salva o PLU no lugar do EAN
                                plu: plu,
                                produto: produto,
                                qtd: qtd,
                                venda: venda,
                                origem: "FRANGOLANDIA_EMAIL",
                                chave_unica: chaveUnica,
                                valor_unitario: valorUnitario,
                                data: dateObj,
                                loja_id: lid,
                                produto_mestre_id: mestreId,
                                userId: clientConf.apiEmail
                            }
                        });
                        linhasInseridas++;
                    }
                    console.log(`✅ ${linhasInseridas} produtos importados/atualizados no banco da Ultra Rota.`);
                    totalImportado += linhasInseridas;
                }
            }
        }

        connection.end();
        console.log(`\n🎉 Sincronismo concluído! Total geral de registros processados/inseridos: ${totalImportado}`);
    } catch (err) {
        console.error("❌ Erro no sincronismo Frangolândia:", err);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    syncFrangolandiaUltraRota().catch(console.error);
}
