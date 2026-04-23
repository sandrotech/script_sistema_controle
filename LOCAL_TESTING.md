# ⚠️ Aviso: Testes Locais e Conectividade

Este projeto **não deve ser testado localmente** utilizando as configurações de banco de dados padrão.

## Motivo
As URLs de banco de dados cadastradas em `src/config/clients.ts` apontam para servidores internos hospedados no **Coolify**. Esses hosts (ex: `xok4kgoows80ok408gcw0coo`) só são resolvíveis e acessíveis dentro da rede interna do cluster Coolify.

## Como Proceder
1. **Desenvolvimento:** Alterações de lógica podem ser feitas localmente, mas a validação final deve ser feita via deploy no Coolify.
2. **Ambiente de Teste:** Se for extremamente necessário testar localmente, você deve:
   - Criar um banco de dados local (ex: via Docker).
   - Alterar temporariamente a `databaseUrl` no `src/config/clients.ts` para `localhost` ou `127.0.0.1`.
   - **NUNCA** subir essas credenciais de teste para o repositório.

## Resumo
- **Execução local:** Vai falhar com `Can't reach database server`.
- **Execução no Coolify:** Funciona normalmente.
