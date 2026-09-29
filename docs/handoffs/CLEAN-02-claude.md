# CLEAN-02 — conclusão da limpeza de comentários

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Escopo: `src/**` (fora `src/infrastructure/database/generated/**`, que é gerado) e uma correção de estado em `scripts/validate-case.mjs`. Nenhuma mudança de comportamento.

## O que motivou

CLEAN-01 fixou o critério e terminou com um aviso:

> Evitar reintroduzir números de reviews e narrativas de correção em comentários; esses detalhes devem continuar nos testes e handoffs.

Eu reintroduzi. A contagem no início desta tarefa era de **93 referências** a review ou achado em comentários de `src/`, em 21 arquivos escritos à mão — uma por ciclo de correção de REVIEW-01 a REVIEW-17. Somados aos testes e scripts, eram 210 em 46 arquivos.

## Critério aplicado

A divisão que resolve o aviso do CLEAN-01 é de **lugar**, não de conteúdo:

- **Código de produção enuncia a regra**, em tempo presente, junto com o que acontece se ela for quebrada. É o que serve a quem lê o arquivo daqui a um ano sem ter visto nenhum review.
- **Teste e handoff guardam a história**: qual review, qual achado, o que quebrou e como foi reproduzido. Por isso `tests/**` e `scripts/**` mantêm as referências — lá elas são a evidência, não ruído.

Na prática, cada comentário perdeu o número do review e trocou o passado pelo presente:

```diff
- * Separar as duas escalas é o que impede o arredondamento silencioso: o
- * contrato aceitava doze casas, a coluna guardava seis, e `toText(6)` no
- * adaptador fazia `0.0000001` virar `0.000000` — o valor sumia sem ninguém
- * ser avisado (REVIEW-07, R07-01).
+ * Separar as duas escalas é o que impede o arredondamento silencioso. Aceitar
+ * no contrato mais casas do que a coluna guarda faz o excedente desaparecer na
+ * gravação, sem erro: `0.0000001` viraria `0.000000`.
```

Nenhuma razão foi apagada. Continuam escritas, porque CLEAN-01 as listou como fundamentais: precisão decimal, arredondamento e limites antes da materialização; `items: null` contra `[]`; tetos de memória e encerramento de streams; locks concorrentes, cursor atado aos filtros e prontidão do schema; invariantes do banco.

Também caíram dois restos que o critério alcança:

- um bloco de JSDoc órfão em `src/application/ports/purchase-order-repository.ts`, que documentava uma contagem que a interface não tem mais e ficava colado no doc verdadeiro de `StagedOutcome`;
- duas citações a tarefas de plano (`P1-04`, `P1-05`) em `src/domain/schemas.ts` e `src/presentation/http/app.ts`, que são cronograma, não motivo. No segundo caso o fato que importa — o teto de 1200/min foi **medido**, não escolhido — ficou.

## Um defeito de validação encontrado no caminho

A revalidação com o banco carregado reprovou **6 das 30** exigências de `scripts/validate-case.mjs`:

```text
✖ Req 1    detalhe traz o que já foi recebido e o que falta em cada item
✖ Banco    reenvio de pedido que mudou atualiza no lugar e recalcula o saldo
✖ Gama     timestamp Unix, centavos e situação numérica viram o contrato
✖ Delta    cabeçalho sem itens é pedido legítimo, sem saldo pendente
✖ Delta    mandar só cabeçalhos NÃO apaga os itens já conhecidos
✖ Delta    cada item guarda a própria data de criação
```

Não é regressão da limpeza — comentário não muda comportamento, e `npm run check` passou antes e depois. As seis procuravam o pedido da amostra na **primeira página de 100** do cliente. Com os 20.000 pedidos de volume que a rodada de REVIEW-17 deixou no banco, a primeira página é toda `VOL-*` e o pedido da amostra nunca aparece. Conferido à mão antes de mexer:

```text
GET /purchase-orders?externalNumber=4500001234  → 1 pedido, ingestionVersion 5
GET /purchase-orders?pageSize=100               → 50 pedidos, todos VOL-5ZAI4J-*
```

O validador já tinha `pedidoDe(clientId, externalNumber)`, que busca pelo filtro, e já explicava por que ele existe. Faltava usá-lo nesses seis lugares. É a mesma classe de defeito de validação de antes: **a asserção passava por acidente de ordenação**, e um banco carregado é justamente onde ela precisa valer.

O resultado depois da troca é mais forte que o anterior: 30/30 com 20.000 pedidos de volume no banco, e não com o banco limpo.

## Verificação

- `npm run check`: 247 testes, 231 passaram, 16 integrações puladas sem `DATABASE_URL`; tipagem, lint, formatação e build verdes. Rodado antes e depois da limpeza, com o mesmo resultado.
- `npm run test:integration`: **33/33** contra PostgreSQL real, com a API parada.
- `node scripts/validate-case.mjs`: **30/30**, duas vezes — uma com os 20.000 pedidos de volume no banco e outra depois do `TRUNCATE` da suíte de integração.
- `npm run validate:http`: **17/17** pelas rotas reais, em `http://localhost:3000`.
- `docker compose up -d --build`: imagem reconstruída já com o `Dockerfile`, o `compose.yaml` e o `prisma/schema.prisma` de CLEAN-01; `/ready` em 200.

## Sobre o CLEAN-01 do Codex

As alterações dele em `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` estavam prontas e paradas no working tree desde o início da sessão, preservadas em todos os merges sem serem commitadas. Foram commitadas como estavam, em `ec4849b`, com autoria dele. Conferi que em `prisma/schema.prisma` só saíram comentários: nenhum `@@index`, `@@unique`, `@map` ou tipo de coluna mudou, e a imagem reconstruída sobe com as mesmas sete migrações.

## Aberto

- `scripts/activate-node.sh` continua excluído no working tree, sem commit, como em toda a sessão. Não é meu e não sei se a exclusão é intencional.
- CI e política de exceção do `npm audit` seguem fora de escopo, adiadas pelo usuário para o fim.
