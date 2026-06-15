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

    const prisma = createPrismaClient(clientConf.databaseUrl);

    try {
        const connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Busca e-mails dos últimos 30 dias independentemente de terem sido lidos ou não
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
        const searchCriteria = [
            ['FROM', 'automatico@superfrangolandia.com.br'],
            ['SINCE', trintaDiasAtras]
        ];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true, markSeen: true };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`E-mails encontrados nos últimos 30 dias: ${messages.length}`);

        let totalImportado = 0;

        for (const msg of messages) {
            const parts = imaps.getParts(msg.attributes.struct);
            const attachments = parts.filter(part => part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT');

            for (const attachment of attachments) {
                if (attachment.params && attachment.params.name && attachment.params.name.endsWith('.txt')) {
                    const partData = await connection.getPartData(msg, attachment);
                    const textContent = partData.toString('utf-8');
                    
                    const lines = textContent.split('\n').filter(line => line.trim() !== '');
                    console.log(`Lendo anexo ${attachment.params.name} com ${lines.length} linhas...`);

                    for (const line of lines) {
                        const parts = line.split(';');
                        if (parts.length < 6) continue;

                        const lojaStr = parts[0].trim(); // ex: 3879760000109
                        // Extrai a filial do CNPJ (ex: 0001 -> 1)
                        const lojaId = parseInt(lojaStr.substring(8, 12)) || 0;
                        
                        const dataStr = parts[1].trim();
                        const plu = parseInt(parts[2].trim());
                        const produto = parts[3].trim();
                        const qtd = parseFloat(parts[4].replace(',', '.'));
                        const venda = parseFloat(parts[5].replace(',', '.'));

                        const [day, month, year] = dataStr.split('/');
                        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

                        const chaveUnica = `venda-${lojaId}-${dataStr}-${plu}-${plu}`;
                        const valorUnitario = qtd > 0 ? venda / qtd : 0;

                        await prisma.venda.upsert({
                            where: { chave_unica: chaveUnica },
                            update: {
                                qtd,
                                venda,
                                valor_unitario: valorUnitario
                            },
                            create: {
                                loja: lojaId,
                                ean: plu.toString(), // Salva o PLU no lugar do EAN
                                plu: plu,
                                produto: produto,
                                qtd: qtd,
                                venda: venda,
                                origem: "FRANGOLANDIA_EMAIL",
                                chave_unica: chaveUnica,
                                valor_unitario: valorUnitario,
                                data: dateObj
                            }
                        });
                        totalImportado++;
                    }
                }
            }
        }

        connection.end();
        console.log(`✅ Sincronismo Frangolândia concluído. ${totalImportado} registros processados.`);
    } catch (err) {
        console.error("❌ Erro no sincronismo Frangolândia:", err);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    syncFrangolandiaUltraRota().catch(console.error);
}
