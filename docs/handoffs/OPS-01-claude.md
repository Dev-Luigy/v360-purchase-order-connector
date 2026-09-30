# OPS-01 — CI e política de exceção da auditoria

- Responsável: Claude, 2026-09-30.
- Estado: concluída.
- Escopo: o último item de peso, adiado pelo usuário desde o início. Nenhum código de produção foi alterado.

## O que estava pendente, e por quê

Desde REVIEW-07 o registro dizia a mesma coisa: `npm audit --omit=dev --audit-level=high` falha com quatro avisos altos, a imagem final não os contém, e falta **política**. A frase que se repetia nos handoffs era "isso precisa de política verificável, não de supressão informal". Era a descrição certa do problema e ninguém a tinha atacado.

## O fato que mudou a forma da política

A leitura corrente era que os avisos vinham do CLI do Prisma, uma `devDependency`, e portanto não alcançavam produção. Conferi antes de escrever a política, e **está errado**:

```text
npm ls prisma --omit=dev
└─┬ @prisma/client@7.10.0
  └── prisma@7.10.0
```

`@prisma/client` é dependência de produção e declara `prisma` como dependência dele. Instalei uma árvore só de produção num diretório separado (`npm ci --omit=dev`) e auditei: os mesmos quatro avisos altos. Então não é quirk do `npm audit`, e não dava para fechar o item dizendo "é só dev".

Os quatro chegam por um caminho só:

```text
@prisma/client > prisma > mysql2
@prisma/client > prisma > @prisma/config > deepmerge-ts
```

`npm audit fix --force` rebaixaria para `prisma@6.19.3` — quebra do contrato do Prisma 7, que o projeto usa por decisão registrada.

## A mitigação existe e agora é conferida

O `Dockerfile` poda esses pacotes da imagem de runtime. Isso era **afirmado** nos handoffs; passou a ser **verificado**:

```text
prisma             ausente
@prisma/config     ausente
deepmerge-ts       ausente
mysql2             ausente
@prisma/client     PRESENTE
```

## Como a política funciona

`security/audit-exceptions.json` nomeia cada exceção com por onde o pacote entra, por que não foi atualizado, qual a mitigação e **quando a exceção vence**. `npm run audit:policy` recusa em quatro casos:

1. aviso alto ou crítico que não está na lista — suprimir o comando inteiro esconderia o aviso que ainda não existe, que é justamente o que se quer ver;
2. exceção vencida — prazo renovado é decisão consciente, não inércia;
3. exceção que não corresponde a nenhum aviso atual, para a lista não virar sedimento;
4. com `--imagem <tag>`, pacote excetuado que continue dentro da imagem.

## Provei que ela recusa

Uma verificação que só foi exercitada no caminho feliz passa também quando não olha nada. Os quatro modos foram exercitados, e os códigos de saída conferidos direto, sem `pipe` no meio:

| Cenário                                     | Saída | Esperado |
| ------------------------------------------- | ----: | -------: |
| política íntegra                            |     0 |        0 |
| imagem de runtime                           |     0 |        0 |
| **imagem de migração, que tem os pacotes**  |     1 |        1 |
| exceção do `mysql2` removida                |     1 |        1 |
| exceção do `prisma` com prazo em 2026-01-01 |     1 |        1 |
| exceção para pacote inexistente             |     1 |        1 |

A terceira linha é a que dá valor às outras: apontando a política para a imagem de migração — que legitimamente contém `prisma`, `@prisma/config`, `deepmerge-ts` e `mysql2` — ela acusa os quatro. A checagem de imagem olha mesmo.

## O pipeline

`.github/workflows/ci.yml`, quatro estágios do mais barato ao mais caro:

| Job           | O que roda                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `verificacao` | `npm run check` sem banco; as 16 integrações são puladas de propósito                            |
| `integracao`  | PostgreSQL 17 como service, `prisma migrate deploy`, `npm run test:integration`                  |
| `aceitacao`   | `docker compose up`, espera `/ready`, depois `validate-case`, `validate:http` e `audit:fidelity` |
| `seguranca`   | `docker compose build api` e `audit:policy --imagem`                                             |

O job de aceitação guarda o log da API como artefato quando falha, porque um `/ready` que não chega sem log não se diagnostica.

## Limites honestos

- **O pipeline rodou depois, e achou um defeito que eu não tinha achado.** Quando escrevi isto o repositório não tinha remoto, e eu registrei que só podia afirmar "os passos passam aqui". Um remoto apareceu, houve push, e a execução reprovou: três jobs verdes e `integração em PostgreSQL` com `exit code 9`, `node: .env: not found`.

  A causa é que `test:integration` usava `--env-file=.env`, e `.env` é gitignored — num checkout limpo o Node aborta antes de rodar teste nenhum. Em CI o `DATABASE_URL` vem do bloco `env:` do job, então o arquivo nem era necessário. Corrigido para `--env-file-if-exists`, e reproduzido localmente nos dois sentidos: `exit 9` com o arquivo ausente, 34/34 depois.

  Vale a lição: rodar cada comando à mão **não** é equivalente a rodar o pipeline. A diferença que pegou foi o checkout limpo, que a minha máquina nunca é.

- A versão do runner (`ubuntu-latest`) e a do Docker dele podem divergir das locais; a primeira execução real é a prova.
- Ficou de fora uma linha na tabela "Como isto está validado" do README apontando `npm run audit:policy`: o `README.md` está reservado pelo DOC-04 do Codex, em andamento. Larguei o arquivo em vez de atropelar.

## Repetir

```sh
npm run audit:policy
npm run audit:policy -- --imagem v360-purchase-order-connector-api
```
