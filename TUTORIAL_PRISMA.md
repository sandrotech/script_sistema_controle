# Tutorial e Boas Práticas do Prisma & Ambiente Node.js

Este documento serve como um guia rápido para lidar com os erros mais comuns enfrentados ao usar o Prisma ORM e o Node.js no projeto.

## 1. Modificações em Arquivos e a Necessidade de Salvar (`Ctrl + S`)

Um dos problemas mais comuns no desenvolvimento acontece quando **alteramos algo no editor (VS Code) mas esquecemos de salvar o arquivo**.

- **Variáveis de Ambiente (`.env`):** Quando você preenche dados como `API_URL_UNIDADES` no seu(`.env`), ferramentas externas (como scripts e a biblioteca `dotenv`) não adivinham o que está na sua tela. Elas lêem o arquivo físico no disco. Sempre pressione `Ctrl + S`.
- **Arquivos de Schema (`schema.prisma`):** Modificar seu schema no editor e rodar `npx prisma db push` não funcionará se o arquivo `schema.prisma` não tiver sido salvo. O comando simplesmente lerá a versão antiga do disco e relatará que nada mudou.

> [!CAUTION]
> **Regra de ouro:** Viu o pontinho (bolinha) branco aparecendo na aba do arquivo no topo do VS Code? Significa que o arquivo não está salvo! Pressione `Ctrl + S` antes de rodar qualquer comando no terminal.

## 2. Removendo Colunas: O Arquivo vs. O Banco de Dados

Apagar uma linha de código (por exemplo: apagar `logo String?`) no arquivo `schema.prisma` **não deleta automaticamente** a coluna correspondente no seu banco de dados PostgreSQL.

O Prisma atua como uma ponte. Quando você deleta no arquivo, você apenas instruiu o Prisma sobre a nova estrutura desejada.

**Como efetivar a alteração no Banco de Dados Real?**

Após remover a linha e **salvar** o arquivo `schema.prisma`, você precisa forçar a sincronização via comando:
```bash
npx prisma db push
```

*Se o Prisma notar que uma coluna (como a de logo) sumiu, ele lhe dará um alerta de que isso causará perda potencial de dados (pois a coluna inteira do banco vai desaparecer). Você deve confirmar com `y` para que a coluna realmente saia do banco de dados.*

Para ver as alterações visuais ocorrendo (usando o `npx prisma studio`), é mandatório que o comando acima já tenha sido executado com sucesso.

## 3. Diretório de Execução Correto de Scripts

Seu projeto está concentrado na raiz `C:\projeto\B7-RELATORIO`, enquanto seus códigos ficam na subpasta `src/`.

**Erro Comum:**
Você acessa o diretório `src` (`cd src`) e tenta executar o seguinte comando:
```bash
npx tsx src/syncUnidades.ts
```

Isso gera um erro (`ERR_MODULE_NOT_FOUND`), pois estando dentro de `src/`, o comando instrui o Node a buscar o arquivo num caminho dobrado (`src/src/syncUnidades.ts`), que não existe.

> [!IMPORTANT]
> **Sempre mantenha a janela do seu terminal na raiz do projeto (`C:\projeto\B7-RELATORIO>`).** Todo script e comando de inicialização contendo `npx` deve vir da pasta onde seu `package.json` mora.


## 4. Prisma 6.19+ vs Prisma 7 (A transição de Adapters)

Em versões mais antigas do Prisma, toda a conexão ao banco era realizada simplesmente garantindo que a URL estivesse no `schema.prisma` dessa forma: `url = env("DATABASE_URL")`.

Com a adoção massiva de integrações (ver versões mais modernas do Prisma e preparações para o Prisma 7), o uso da clássica "Engine" que lia nativamente do `schema.prisma` está sendo descontinuada em favor do **Driver Adapter** configurado direto no `PrismaClient()`. 

Para adaptar o banco localmente:

**A. Prisma Config (`prisma.config.ts`)**
O arquivo guarda as propriedades raiz do Prisma local, como em caso de migrações:
```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"), // Ou link literal
  },
});
```

**B. Inicialização do Client Node (`src/syncUnidades.ts`)**
Devemos instanciar o PG Adapter pelo pacote nativo `pg` injetando-o como opção dentro da conexão final local, dessa forma:
```typescript
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Conflitos Atuais:**
Extensões do VS Code (que já validam as regras da versão 7+) informam você que ter `url = env("DATABASE_URL")` no `schema.prisma` é um erro obsoleto. Porém a ferramenta original rodando por baixo (Prisma v6 via terminal) que executa seu `npx prisma studio` ainda cobra a obrigatoriedade da presença dessa linha. Portanto, **por enquanto deixe o alerta do VS Code isolado até o update futuro oficial da CLI do projeto.**
