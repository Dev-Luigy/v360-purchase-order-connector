FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
# O schema e a configuração entram antes do build porque `npm run build`
# dispara `prisma generate`: sem o cliente gerado, o TypeScript não compila.
COPY tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

# Estágio de migração: mantém as dependências de desenvolvimento porque o CLI
# do Prisma é ferramenta de implantação, não de runtime. Fica separado para a
# imagem que serve tráfego não carregar o CLI nem poder aplicar DDL
# (REVIEW-04, R04-05).
FROM build AS migrate
COPY database ./database
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS pruned
RUN npm prune --omit=dev

FROM node:24.21.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=pruned --chown=node:node /app/package*.json ./
COPY --from=pruned --chown=node:node /app/node_modules ./node_modules
COPY --from=pruned --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main/server.js"]
