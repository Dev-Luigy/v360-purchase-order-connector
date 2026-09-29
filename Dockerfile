FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# O build gera o cliente Prisma e requer OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

# Migrações usam o CLI e ficam fora da imagem de runtime.
FROM build AS migrate
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY database ./database
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS pruned
RUN npm prune --omit=dev
# Remove o CLI e o driver MySQL trazidos por peer opcional; runtime usa `pg`.
RUN rm -rf \
      node_modules/prisma \
      node_modules/@prisma/engines \
      node_modules/@prisma/config \
      node_modules/mysql2 \
      node_modules/deepmerge-ts
# Falha o build caso a poda remova uma dependência necessária.
RUN node --input-type=module \
      -e "await import('/app/dist/infrastructure/database/prisma-client.js'); console.log('dependencias de runtime ok');"

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=pruned --chown=node:node /app/package*.json ./
COPY --from=pruned --chown=node:node /app/node_modules ./node_modules
COPY --from=pruned --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main/server.js"]
