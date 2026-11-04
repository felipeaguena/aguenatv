# ==========================================
# AGUENATV - Dockerfile de Produção Otimizado
# Multi-stage build com modo Standalone para Oracle Cloud / VPS / Docker
# ==========================================

# Estágio 1: Dependências
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Estágio 2: Build da Aplicação
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Desabilita telemetria do Next.js durante o build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Estágio 3: Execução em Produção (Runner Leve e Seguro)
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Cria usuário não-root para execução segura
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Cria diretório de dados para persistência local com permissões adequadas
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copia artefatos mínimos gerados pelo modo standalone
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
