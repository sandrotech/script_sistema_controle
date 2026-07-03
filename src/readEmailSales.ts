import imaps from 'imap-simple';
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

export async function readEmailSales() {
    try {
        console.log("Iniciando conexão IMAP com o Google...");
        const connection = await imaps.connect(config);
        
        console.log("Conexão IMAP estabelecida. Abrindo a caixa de entrada (INBOX)...");
        await connection.openBox('INBOX');

        const dataFiltro = new Date();
        dataFiltro.setDate(dataFiltro.getDate() - 3); // 3 dias atrás para garantir que pegamos hoje e ontem
        
        const searchCriteria = [
            ['FROM', 'automatico@superfrangolandia.com.br'],
            ['SINCE', dataFiltro]
        ];
        const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true, markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`E-mails encontrados a partir de ${dataFiltro.toLocaleDateString()}: ${messages.length}`);

        for (const msg of messages) {
            console.log(`\n📧 Lendo e-mail recebido em: ${msg.attributes.date}`);
            const parts = imaps.getParts(msg.attributes.struct);
            const attachments = parts.filter(part => part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT');

            for (const attachment of attachments) {
                if (attachment.params && attachment.params.name && attachment.params.name.endsWith('.txt')) {
                    const partData = await connection.getPartData(msg, attachment);
                    const textContent = partData.toString('utf-8');
                    
                    const lines = textContent.split('\n').filter(line => line.trim() !== '');
                    
                    const vendasPorData = new Map<string, { qtd: number, total: number }>();
                    let totalLinhas = 0;

                    for (const line of lines) {
                        const partes = line.split(';');
                        if (partes.length < 6) continue;
                        
                        const [cnpjRaw, dataStr, pluRaw, produto, qtdRaw, vendaRaw] = partes;
                        const qtd = parseFloat(qtdRaw.replace(',', '.'));
                        const venda = parseFloat(vendaRaw.replace(',', '.'));

                        if (!isNaN(qtd) && !isNaN(venda)) {
                            const stats = vendasPorData.get(dataStr) || { qtd: 0, total: 0 };
                            stats.qtd += qtd;
                            stats.total += venda;
                            vendasPorData.set(dataStr, stats);
                            totalLinhas++;
                        }
                    }

                    console.log(`📎 Anexo: ${attachment.params.name}`);
                    console.log(`   Linhas válidas encontradas: ${totalLinhas}`);
                    for (const [dataStr, stats] of vendasPorData.entries()) {
                         console.log(`   📅 Data da Venda: ${dataStr} -> Qtd total: ${stats.qtd.toFixed(2)} | Venda total: R$ ${stats.total.toFixed(2)}`);
                    }
                }
            }
        }
        connection.end();
    } catch (error) {
        console.error("Erro:", error);
    }
}

readEmailSales();
