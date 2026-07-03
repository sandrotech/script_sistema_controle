const imaps = require('imap-simple');
const xlsx = require('xlsx');
require('dotenv').config();

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

async function main() {
    console.log("Connecting to IMAP...");
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');
    
    // Buscar especificamente o e-mail do dia 01/07 (Jul 1 2026) que é o fechamento de Junho
    const searchCriteria = [
        ['FROM', 'automatico@superfrangolandia.com.br'],
        ['SUBJECT', 'FECHAMENTO (Junho/2026)']
    ];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`Encontrados e-mails de fechamento: ${messages.length}`);
    
    if (messages.length > 0) {
        const msg = messages[0];
        console.log(`Lendo e-mail de: ${msg.attributes.date}`);
        const parts = imaps.getParts(msg.attributes.struct);
        const attachments = parts.filter(part => part.disposition && part.disposition.type.toUpperCase() === 'ATTACHMENT');
        
        for (const attachment of attachments) {
            if (attachment.params && attachment.params.name && attachment.params.name.endsWith('.txt')) {
                const partData = await connection.getPartData(msg, attachment);
                const textContent = partData.toString('utf-8');
                const lines = textContent.split('\n').filter(line => line.trim() !== '');
                
                let sumQtd = 0;
                let sumVenda = 0;
                let parsedRows = [];
                
                lines.forEach(line => {
                    const partes = line.split(';');
                    if (partes.length >= 6) {
                        const [cnpjRaw, dataStr, pluRaw, produto, qtdRaw, vendaRaw] = partes;
                        const qtd = parseFloat(qtdRaw.replace(',', '.'));
                        const venda = parseFloat(vendaRaw.replace(',', '.'));
                        if (!isNaN(qtd)) sumQtd += qtd;
                        if (!isNaN(venda)) sumVenda += venda;
                        
                        parsedRows.push({
                            CNPJ: cnpjRaw,
                            Data: dataStr,
                            PLU: pluRaw,
                            Produto: produto,
                            Qtd: qtd,
                            Venda: venda
                        });
                    }
                });
                console.log(`Total do anexo ${attachment.params.name}:`);
                console.log(`Linhas: ${lines.length}`);
                console.log(`Soma Qtd: ${sumQtd}`);
                console.log(`Soma Venda: ${sumVenda}`);
                
                // Salvar esse anexo isoladamente para comparar
                const wb = xlsx.utils.book_new();
                const ws = xlsx.utils.json_to_sheet(parsedRows);
                xlsx.utils.book_append_sheet(wb, ws, "Fechamento Email");
                xlsx.writeFile(wb, "Frangolandia_Fechamento_Email_Unico.xlsx");
                console.log("Salvo Frangolandia_Fechamento_Email_Unico.xlsx");
            }
        }
    }
    
    connection.end();
}

main().catch(console.error);
