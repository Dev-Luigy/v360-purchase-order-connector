# Dependências e instalação

A instalação do sistema será feita pelo usuário. Sistema detectado: Arch Linux.

## Ferramentas do sistema

| Ferramenta     | Versão / finalidade                 | Situação verificada em 2026-09-30 |
| -------------- | ----------------------------------- | --------------------------------- |
| Node.js        | 24.x, projeto fixado em 24.21.0     | v24.21.0 no PATH                  |
| npm            | Gerenciador de dependências         | 12.1.0                            |
| Docker Engine  | Executar API e banco em containers  | 29.8.1                            |
| Docker Buildx  | Build das imagens pelo Compose      | 0.37.1                            |
| Docker Compose | Comando `docker compose`            | 5.5.1                             |
| Git            | Histórico, branches e marco parte-1 | 2.55.0                            |

No Arch, instalar Node 24 LTS e ferramentas:

```sh
sudo pacman -Syu --needed nodejs-lts-krypton npm docker docker-compose docker-buildx git
sudo systemctl enable --now docker
```

Node 24 no Arch: [pacote oficial](https://archlinux.org/packages/extra/x86_64/nodejs-lts-krypton/). Docker: [ArchWiki](https://wiki.archlinux.org/title/Docker). O comando `-Syu` atualiza o sistema junto da instalação, como esperado no Arch.

Verificar:

```sh
node --version
npm --version
git --version
docker compose version
sudo docker info
```

Os exemplos com `sudo docker` funcionam sem alterar grupos. Os scripts `npm run db:up` e `npm run db:down` pressupõem que seu usuário já consegue executar Docker; caso contrário, usar `sudo docker compose up -d db` e `sudo docker compose down` diretamente.

## Pacotes do projeto

Instalar todos de uma vez na versão registrada no lockfile:

```sh
cd /home/luigy/program/v360-purchase-order-connector
npm ci
```

| Grupo      | Pacotes                                                 |
| ---------- | ------------------------------------------------------- |
| Execução   | `fastify`, `pg`, `zod`                                  |
| TypeScript | `typescript`, `tsx`, `@types/node`, `@types/pg`         |
| Qualidade  | `eslint`, `@eslint/js`, `typescript-eslint`, `prettier` |

Não instalar esses pacotes globalmente. O runner de testes é nativo do Node. PostgreSQL 17 é baixado pelo Compose; não precisa instalar banco no host. Bibliotecas para CSV, precisão decimal ou migrações serão escolhidas quando as tarefas de negócio forem implementadas; ainda não são dependências desta base.

## Subir e validar

Tudo em containers:

```sh
sudo docker compose up --build
```

Ou apenas banco em container e API local:

```sh
sudo docker compose up -d db
# .env já existe neste workspace; em checkout novo, copiar .env.example para .env.
npm run dev
```

Em outro terminal:

```sh
curl http://localhost:3000/health
curl http://localhost:3000/ready
npm run check
```

Com banco acessível, ambos os endpoints devem retornar HTTP 200. A validação de persistência dos pedidos ocorrerá depois da implementação das tabelas e ingestão. Não executar simultaneamente a API local e a API do Compose na mesma porta 3000.
