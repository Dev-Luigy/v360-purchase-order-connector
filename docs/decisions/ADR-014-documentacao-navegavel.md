# ADR-014 — A API navegável é gerada dos schemas das rotas

- Estado: aceita.
- Data: 2026-09-30.
- Responsável pelo registro: Claude; tarefa DOC-05.
- Autoridade: escolha do usuário entre as opções levantadas, em conversa antes de instalar qualquer coisa.

## Contexto

O usuário pediu uma biblioteca de visualização para mostrar as rotas, os objetos e como o serviço funciona.

O projeto já tem `docs/API.md`, escrito à mão. Ele **já errou**: numa das revisões constatou-se que ele trazia todos os nomes de parte e o cabeçalho da ingestão incorretos, de modo que quem seguisse a documentação não conseguia carregar nada. Documentação escrita à parte é a classe de defeito que mais apareceu nesta entrega — duas fontes de verdade que ninguém obriga a concordar.

O que muda a forma da solução é um fato do código: **toda rota já declara schema Zod** de querystring, params, corpo e de todas as respostas, inclusive as de erro. E `@fastify/type-provider-zod`, já em uso, exporta `jsonSchemaTransform` e `jsonSchemaTransformObject`, feitos exatamente para alimentar o `@fastify/swagger`.

Ou seja: o documento OpenAPI pode ser **derivado** do mesmo schema que valida a requisição, em vez de escrito.

## Opções levantadas

| Opção                                                | Tamanho | Observação                                                                |
| ---------------------------------------------------- | ------: | ------------------------------------------------------------------------- |
| `@fastify/swagger` + `@fastify/swagger-ui`           | ~2,5 MB | Mesma organização do resto da pilha; a interface que se reconhece à vista |
| `@fastify/swagger` + `@scalar/fastify-api-reference` | ~4,4 MB | Mais bonita, exemplos em várias linguagens; pacote de terceiro            |
| Só `@fastify/swagger`, sem interface                 | ~0,2 MB | Expõe `/openapi.json` e nada mais                                         |

## Decisão

**`@fastify/swagger` 9 + `@fastify/swagger-ui` 6, servidos sempre, inclusive em produção.** Escolha do usuário entre as três.

A necessidade concreta que justifica a dependência, como o `AGENTS.md` exige: o serviço precisa ser demonstrável por quem não escreveu o código, e o contrato precisa ser legível sem abrir `src/`. Nenhuma das duas coisas se resolve escrevendo mais Markdown, porque o Markdown é justamente o que já divergiu.

Consequências aceitas:

- a interface entra na imagem final, que cresce ~2,5 MB. O usuário escolheu isso em vez de esconder a documentação atrás de `NODE_ENV`, porque uma documentação que só existe em desenvolvimento não serve a quem vai avaliar o serviço;
- a rota `/docs` é pública, como todo o resto do serviço. Autenticação não é pedida pelo enunciado, e inventá-la só para a documentação seria escopo que ninguém pediu.

## O que impede a página de mentir

O documento ser gerado não basta: uma rota registrada fora do alcance do gerador, ou sem schema, simplesmente não apareceria — e a página ficaria incompleta sem avisar ninguém.

`tests/openapi.test.ts` compara o documento com `app.printRoutes()`, que é o que o Fastify de fato tem, e falha se alguma rota registrada estiver ausente. Também exige que toda operação esteja sob uma etiqueta declarada e que `components.schemas` não esteja vazio.

Os objetos só aparecem em `components.schemas` porque são registrados com `id` em `src/presentation/http/openapi.ts`. Sem isso o gerador embute a forma inteira dentro de cada rota: a página mostraria caminhos e esconderia o contrato. O registro mora na borda HTTP, e não junto da definição, porque o domínio não deve saber que existe documentação.

## O que fica pendente

`docs/API.md` continua existindo e escrito à mão. Agora ele tem um concorrente gerado, o que é uma fonte de verdade a mais, não a menos. A decisão de reduzi-lo a um texto de convenções — deixando rota, parâmetro e resposta só no documento gerado — não foi tomada aqui e merece tarefa própria.
