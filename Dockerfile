# Usar a imagem oficial do Node.js
FROM node:20-slim

# Instalar dependências necessárias para o Prisma e PostgreSQL
RUN apt-get update -y && apt-get install -y openssl

# Criar diretório de trabalho
WORKDIR /app

# 1. Copiar arquivos de dependências da Raiz
COPY package*.json ./
COPY prisma ./prisma/

# 2. Instalar todas as dependências do Script
RUN npm install

# 3. Gerar o Prisma Client
RUN npx prisma generate

# 4. Copiar o restante de todo o código
COPY . .

# Comando padrão para rodar o sincronismo global
# Nota: No Coolify, você pode usar Scheduled Tasks para rodar cron jobs
CMD ["tail", "-f", "/dev/null"]
