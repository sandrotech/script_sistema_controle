import imaps from 'imap-simple';
import xlsx from 'xlsx';
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

export async function baixarParaXlsx() {
    console.log("Iniciando busca Frangolândia (Ultra Rota) via E-mail para XLSX...");

    if (!config.imap.user || !config.imap.password) {
        throw new Error("⚠️ As variáveis de e-mail e/ou senha (FRANGOLANDIA_IMAP_USER / FRANGOLANDIA_IMAP_PASSWORD) não estão configuradas no arquivo .env!");
    }

    try {
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

        const todasAsVendas = [];

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

                    for (const line of lines) {
                        const partes = line.split(';');
                        if (partes.length < 6) continue;

                        const [cnpjRaw, dataStr, pluRaw, produto, qtdRaw, vendaRaw] = partes;
                        
                        const cnpjClean = cnpjRaw.replace(/\D/g, '');
                        if (cnpjClean.length < 13) continue;
                        
                        const filialStr = cnpjClean.substring(8, 12);
                        const lojaId = parseInt(filialStr, 10);
                        
                        const plu = parseInt(pluRaw, 10);
                        const qtd = parseFloat(qtdRaw.replace(',', '.'));
                        const venda = parseFloat(vendaRaw.replace(',', '.'));

                        const valorUnitario = qtd > 0 ? venda / qtd : 0;
                        const lojaNome = `Frangolandia Filial ${lojaId}`;

                        todasAsVendas.push({
                            "Data": dataStr,
                            "Loja ID": lojaId,
                            "Loja Nome": lojaNome,
                            "PLU": plu,
                            "Produto": produto,
                            "Quantidade": qtd,
                            "Valor Venda": venda,
                            "Valor Unitário": valorUnitario
                        });
                    }
                }
            }
        }

        connection.end();
        console.log(`\n🎉 Extração concluída! Total de registros encontrados: ${todasAsVendas.length}`);

        if (todasAsVendas.length > 0) {
            console.log("Gerando arquivo XLSX na raiz do projeto...");
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(todasAsVendas);
            xlsx.utils.book_append_sheet(wb, ws, "Vendas Frangolandia");

            const fileName = 'Frangolandia_Extraido.xlsx';
            xlsx.writeFile(wb, fileName);
            console.log(`✅ Arquivo gerado com sucesso: ${fileName}`);
        } else {
            console.log("Nenhum dado para exportar.");
        }

    } catch (err) {
        console.error("❌ Erro no sincronismo Frangolândia:", err);
    }
}

if (require.main === module) {
    baixarParaXlsx().catch(console.error);
}
