# 🚀 Guia de Implantação Independente no Coolify

Este projeto (`B7-RELATORIO`) agora é dedicado exclusivamente ao **Sincronismo de Dados**. A API deve ser implantada separadamente.

## 1. Banco de Dados (PostgreSQL)
1. No painel do Coolify: **+ New** -> **Service** -> **PostgreSQL**.
2. Na aba **Connection Details**, copie a **Internal Connection String**.

---

## 2. Serviço de Sincronismo (Script)
Como este serviço roda apenas em horários agendados, vamos configurá-lo no Coolify.

1. **+ New** -> **Project** -> **Public/Private Repository**.
2. Conecte o repositório deste projeto (`B7-RELATORIO`).
3. No **Build Pack**, selecione **Docker**.
4. Em **Environment Variables**, adicione:
    - `DATABASE_URL`: (String de conexão interna do Postgres).
    - `BACKEND_URL`: (URL interna ou pública da sua API separada).
    - `JWT_SECRET`: (Mesma chave usada na sua API).
    - `API_TOKEN_...`: (Tokens das lojas).
5. No campo **Start Command**, deixe vazio ou como: `npm run sync:prod`.
6. **Importante**: Como este é um script que termina após rodar, o container pode marcar como "Exited" após o sucesso. O ideal é usar o recurso de **Scheduled Tasks** do Coolify.

---

## 3. Configurando o Agendamento (Cron)
Para que o robô rode sozinho na madrugada:

1. Vá em **Advanced** -> **Scheduled Tasks**.
2. Clique em **+ Add New Task**.
3. No campo **Command**, coloque: `npm run sync:prod`
4. No campo **Cron Index**, coloque: `0 1 * * *` (Todos os dias à 1h da manhã).
5. Certifique-se de que a `BACKEND_URL` está correta para que o script possa avisar a API sobre o novo snapshot.

---

## 4. Ordem de Verificação
- [ ] O banco de dados está online?
- [ ] A sua API separada (`B7-api-relatorio`) já teve o deploy concluído?
- [ ] A variável `BACKEND_URL` neste projeto aponta para essa API?
- [ ] O primeiro Sincronismo manual funcionou? (Clique em **Run Now** na Scheduled Task).

> [!TIP]
> Use a URL interna do Coolify para a `BACKEND_URL` (ex: `http://servico-api:3000`) para maior velocidade e segurança entre containers.
