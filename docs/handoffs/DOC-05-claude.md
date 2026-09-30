# DOC-05 — API navegável gerada dos schemas das rotas

- Responsável: Claude, 2026-09-30.
- Estado: concluída.
- Pedido do usuário: instalar uma biblioteca de visualização de API, para mostrar as rotas, os objetos e como funciona.

## A escolha foi fechada com o usuário, não no código

Levantei três opções com tamanho e contrapartida — Swagger UI, Scalar e só o documento sem interface — e perguntei antes de instalar qualquer coisa. Ele escolheu **Swagger UI, servido sempre, inclusive em produção**. O registro da decisão está em [ADR-014](../decisions/ADR-014-documentacao-navegavel.md).

## O fato que decidiu a forma

Toda rota deste serviço já declara schema Zod de querystring, params, corpo e de **todas** as respostas, inclusive as de erro. E o `@fastify/type-provider-zod`, que já estava em uso, exporta `jsonSchemaTransform` justamente para alimentar o `@fastify/swagger`.

Então o documento é **gerado** do mesmo schema que valida a requisição. Isso importa aqui mais do que importaria em outro projeto: `docs/API.md` é escrito à mão e já errou — numa revisão anterior constatou-se que ele trazia todos os nomes de parte e o cabeçalho da ingestão incorretos, de modo que quem seguisse a documentação não carregava nada.

## Resultado

```text
GET  /docs        → 200 (Swagger UI)
GET  /docs/json   → documento OpenAPI 3.1.0
```

Oito rotas, todas etiquetadas:

| Etiqueta     | Rotas                                                               |
| ------------ | ------------------------------------------------------------------- |
| pedidos      | `GET /purchase-orders`, `GET /purchase-orders/{id}`                 |
| conferências | `POST /conferences`, `GET /conferences`, `GET /conferences/summary` |
| cargas       | `POST /clients/{clientId}/ingestions`                               |
| operação     | `GET /health`, `GET /ready`                                         |

E onze objetos nomeados em `components.schemas`: `PedidoResumo`, `PedidoDetalhe`, `PedidoItem`, `NotaFiscal`, `Conferencia`, `Divergencia`, `ResumoDeConferencias`, `RelatorioDeCarga`, `RegistroRecusado`, `RegistroEmEspera` e `Pagina` — cada um com a variante `…Input`, que o gerador cria porque OpenAPI 3.1 separa a forma de entrada da de saída.

## Dois problemas que o meu próprio teste encontrou

Escrevi o teste anti-deriva antes de considerar a tarefa pronta, e ele reprovou a primeira versão em dois pontos:

**`components.schemas` estava vazio.** Sem `id` registrado, o gerador embute a forma inteira dentro de cada rota: a página mostraria os caminhos e esconderia o contrato — ou seja, metade do que o usuário pediu não existiria. Resolvido registrando os objetos em `src/presentation/http/openapi.ts`, na borda HTTP e não junto da definição, porque o domínio não deve saber que existe documentação.

**O meu leitor de rotas estava errado.** `printRoutes` devolve uma árvore, e eu estava lendo cada linha como um caminho inteiro, o que produzia `GET /summary` e `GET /{id}`. O caminho de um nó é a concatenação com os ancestrais, e o nível vem da indentação. Consertado, e é o que dá sentido à comparação.

## O que impede a página de mentir

`tests/openapi.test.ts`, quatro asserções:

1. toda rota que o Fastify registra aparece no documento — a fonte é `app.printRoutes()`, o que o servidor tem, não uma lista que alguém mantém;
2. toda operação está sob uma etiqueta declarada;
3. `components.schemas` não está vazio;
4. a página responde.

## Verificação

- `npm run check`: **251 testes, 0 falhas**, saída 0 conferida sem `pipe` no meio.
- Imagem de produção reconstruída: `/docs` responde 200 e `@fastify/swagger-ui` sobrevive à poda do Dockerfile.
- O teste de fumaça do Dockerfile passou a importar também `dist/presentation/http/app.js`. Antes ele só importava o cliente do banco, e não teria percebido a falta de uma dependência da borda HTTP — que é exatamente o que esta tarefa acrescentou.
- `npm run audit:policy --imagem`: satisfeita; as duas dependências novas não trouxeram aviso.
- Intactos: enunciado 30/30, rotas 17/17, fidelidade 156/156.

## Correção de um erro meu, na mesma sessão

Ao verificar o DOC-04 do Codex antes de commitar, rodei `npm run check | grep`. O `pipe` descarta o código de saída do npm, então li silêncio como aprovação e commitei com o check vermelho. A segunda rodada dele havia reescrito **à mão** a linha de evidência do `docs/STATUS.md` — trocando os números gerados por "27 testes", que também está errado, são 247 — e isso quebrou a âncora que o `npm run evidence` procura, além de reprovar `tests/evidencia.test.ts`, que existe exatamente para impedir que aquela linha vire digitação. Restaurei a linha gerada no commit seguinte.

## Pendente

`docs/API.md` continua escrito à mão e agora tem um concorrente gerado. Reduzi-lo a um texto de convenções, deixando rota, parâmetro e resposta só no documento gerado, é tarefa própria — não fiz por conta.
