# V360 — Conector de Pedidos de Compra

Base de desenvolvimento do desafio [Case — Engenheiro SAP Junior](https://docs.google.com/document/d/1nbIIEDPKxx83hPHnd5P6ddwY1ukQUvWurQCrrNgv3f8/edit). O enunciado está transcrito em [docs/CASE.md](docs/CASE.md), com a exportação em [docs/CASE.pdf](docs/CASE.pdf); as amostras dos quatro clientes estão em [tests/fixtures/](tests/fixtures/README.md).

## Colaboração e instalação

Codex e Claude seguem [AGENTS.md](AGENTS.md). Consulte o [fluxo de colaboração](docs/COLLABORATION.md), o [quadro de tarefas](docs/TASKS.md), o [estado atual](docs/STATUS.md) e as [dependências para instalar](docs/SETUP.md).

## Estado atual

Ambiente preparado com TypeScript estrito, Fastify, PostgreSQL via Docker Compose, configuração validada, logs, encerramento gracioso, testes HTTP, ESLint e Prettier. Somente `GET /health` (processo ativo) e `GET /ready` (banco acessível, 503 se indisponível) estão implementados. Ainda faltam tabelas, migrações executáveis, ingestão, consultas de pedidos, conferência e relatórios. A Parte 1 ainda não está concluída.

## Executar

Com Docker Engine e o plugin Compose disponíveis:

```sh
docker compose up --build
```

A API atende em `http://localhost:3000`. O PostgreSQL usa volume persistente; `docker compose down` preserva os dados. `docker compose down -v` apaga o volume. As credenciais do Compose são exclusivas para desenvolvimento local.

Para desenvolvimento com Node.js 24 e npm:

```sh
cp .env.example .env
npm ci
npm run db:up
npm run dev
```

Neste workspace também foi instalado um Node isolado em `.tools/node` (ignorado pelo Git). Para ativá-lo no Bash, a partir da pasta do projeto:

```sh
source scripts/activate-node.sh
```

Essa instalação local não acompanha o repositório; em outra máquina use Node 24 conforme `.nvmrc`, ou apenas Docker Compose. O arquivo `.env` já foi criado neste workspace.

```sh
curl http://localhost:3000/health
curl http://localhost:3000/ready
npm run check
```

`npm run check` executa tipagem, lint, formatação, testes e build. Os testes usam injeção HTTP do Fastify e um substituto da conexão; não exigem banco e não validam persistência real. `npm run build` gera `dist/`; `npm start` executa o build. O driver PostgreSQL tem limites de tempo para conexão e consulta. `/ready` verifica conectividade, ainda não a existência de tabelas.

## Decisões de tecnologia

PostgreSQL foi confirmado em [ADR-001](docs/decisions/ADR-001-postgresql.md); TypeScript e Node.js em [ADR-002](docs/decisions/ADR-002-typescript-nodejs.md), priorizando manutenção e facilidade de encontrar desenvolvedores experientes nessa stack. Fastify foi confirmado em [ADR-003](docs/decisions/ADR-003-fastify.md) e Prisma ORM 7 em [ADR-004](docs/decisions/ADR-004-prisma-7.md). As demais ferramentas e estratégias permanecem em discussão antes da consolidação da arquitetura.

- **TypeScript:** escolha motivada pela familiaridade da linguagem no ecossistema JavaScript e pela intenção de facilitar a contratação de alguém para manutenção, caso necessário. Tipagem estrita ajuda a explicitar os contratos entre clientes e o modelo normalizado.
- **Fastify:** camada HTTP, com construção da aplicação independente da abertura de porta, facilitando testes.
- **PostgreSQL:** relações entre pedidos, itens e conferências, unicidade composta, transações e índices para filtros. Quantidades e valores usarão `NUMERIC`, preservados como strings decimais na aplicação até a implementação de aritmética decimal; evitar cálculo monetário com ponto flutuante.
- **Prisma ORM 7:** acesso tipado e organizado ao PostgreSQL, isolado nos adaptadores de infraestrutura. A linha principal será fixada em 7 e a resolução exata ficará no lockfile.
- **npm:** instalação reproduzível com `package-lock.json` e `npm ci`.

Referências técnicas: [Node.js](https://nodejs.org/en/download) e [Fastify](https://fastify.dev/docs/latest/Guides/Getting-Started/).

## Organização e SOLID

```text
src/
  domain/                      entidades e regras de negócio puras
  application/
    ports/                     interfaces exigidas pelos casos de uso
    use-cases/                 coordenação das operações
  infrastructure/
    config/                    leitura e validação do ambiente
    database/                  implementações PostgreSQL
    integrations/              adaptadores dos clientes, a implementar
  presentation/http/           rotas e tradução HTTP
  main/                        composição das dependências e inicialização
database/migrations/           reservado para migrações versionadas
tests/                         testes automatizados
```

SOLID é aplicado às responsabilidades e dependências, não apenas aos diretórios: `CheckReadiness` depende da interface pequena `DatabaseHealth`; `PostgresHealth` implementa esse contrato; `main/server.ts` faz a injeção pelo construtor. O teste substitui o adaptador mantendo o contrato. Novos adaptadores de clientes deverão estender a ingestão sem adicionar condicionais específicos de cliente às regras de conferência. Não há container de injeção ou hierarquia de classes desnecessária.

## Plano técnico

Consulte [o plano de Alfa/Beta e Gama/Delta](docs/TECHNICAL_PLAN.md) somente ao trabalhar nessas etapas.

## Próxima etapa

Implementar o domínio, as migrações e os adaptadores Alfa/Beta, seguidos dos casos de uso de consulta, conferência e relatório. Os endpoints de negócio serão definidos nessa etapa; nenhuma rota de negócio fictícia foi exposta nesta base.
