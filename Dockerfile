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
# O CLI do Prisma avisa que não detectou OpenSSL e que "may not work as
# expected". Não se provou fatal neste host, mas migração de schema não é lugar
# para "provavelmente funciona" (REVIEW-06, R06-05). O pacote entra só aqui: a
# imagem que serve tráfego usa o driver `pg` e não tem esse requisito.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY database ./database
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS pruned
RUN npm prune --omit=dev
# O CLI do Prisma entra na árvore de produção por um peer opcional de
# `@prisma/client`, e arrasta `mysql2` — com CVE de vazamento de credencial —
# para uma aplicação que só fala PostgreSQL. `npm prune --omit=dev` não o
# remove, porque ele é peer de uma dependência de produção (REVIEW-05, achado 3).
RUN rm -rf \
      node_modules/prisma \
      node_modules/@prisma/engines \
      node_modules/@prisma/config \
      node_modules/mysql2 \
      node_modules/deepmerge-ts
# Prova, dentro do próprio build, que o que sobrou basta para carregar o acesso
# a dados. Se a remoção tirar algo necessário, o build falha aqui e não em
# produção.
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
