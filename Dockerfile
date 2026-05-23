FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências de build necessárias para compilar pacotes do node
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

# Executa o postinstall para gerar os clientes Prisma (normal e antigo)
RUN npm run postinstall

FROM node:20-alpine AS runner

WORKDIR /app

# Copia dependências e código necessário
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Comando para rodar a automação
CMD ["npm", "start"]
