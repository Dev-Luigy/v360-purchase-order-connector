# REVIEW-16 — validação integral pós-FIX-16

- Agente e data: Codex, 2026-09-29.
- Estado: concluída com dois defeitos de consistência reproduzidos.
- Escopo: banco e aplicação do zero, aceitação completa, falhas, concorrência, limites, volume, persistência, Docker e segurança. Nenhum código de produção foi alterado.

## Veredito

FIX-16 fechou partes importantes de REVIEW-15: JSON Delta truncado agora responde 422 e não deixa staging; espera não publicada com mais de uma hora é removida no start; a recuperação por cabeçalho real relata 3 itens e o reenvio relata 0. A matriz oficial inteira passa.

Ainda não está tudo corrigido. Duas sondas pelas rotas reais, conferidas no PostgreSQL, encontraram efeitos que a suíte oficial não cobre.

### R16-01 — 422 com 200 pedidos persistidos

Enviei um JSON Alfa truncado depois de exatamente 200 pedidos válidos, o tamanho de um lote do adaptador. Resultado:

```text
HTTP 422 payload_incompativel
purchase_order do prefixo da carga: 200
```

O caso de uso persiste cada `batch.orders` em `replaceSnapshot` antes de o leitor conhecer o fim do documento ([ingest-purchase-orders.ts](../../src/application/use-cases/ingest-purchase-orders.ts), laço nas linhas 69–91). O `catch` remove somente `ingestion_staging` via `discardIngestion` (linhas 165–170). Portanto a resposta diz que o payload é incompatível, não devolve relatório de aceitação, mas deixa pedidos novos — e também poderia substituir retratos anteriores.

O cenário oficial usa Delta item-only e procura um pedido inexistente. Nesse formato nenhum pedido seria criado mesmo antes da correção; ele prova a limpeza da espera, não a atomicidade dos snapshots ([validate-fix-14-http.mjs](../../scripts/validate-fix-14-http.mjs), cenário a partir da linha 544).

Critério para FIX-17: definir um contrato coerente para erro estrutural tardio. Se a resposta continuar 422, nenhum pedido, versão anterior ou staging da carga pode mudar; testar Alfa e Gama depois de mais de um lote e reingestão de pedido existente. Se a decisão for aceitar o prefixo por pedido, a rota precisa devolver relatório que contabilize esse prefixo, não um erro sem recibo. Uma validação estrutural em primeira passagem sobre o spool preserva streaming/memória e evita uma transação gigante.

### R16-02 — a carga dona ainda perde a contabilidade

Enviei 2.000 itens Delta de pedidos distintos, com o alvo primeiro. Assim que o alvo ficou `publicada=true`, outra requisição enviou o cabeçalho e o consumiu enquanto a primeira ainda finalizava os demais pedidos:

```text
carga dona:      itemsAccepted=0 stagedTotal=1999 rejectedTotal=0
cabeçalho:       itemsAccepted=1
registros da dona contabilizados: 1999/2000
```

`finalizeStaged` faz a decisão correta sob o lock e já devolve `{ waiting: count }` ([purchase-order-repository.ts](../../src/infrastructure/database/purchase-order-repository.ts), linhas 110–171). Porém o caso de uso ignora `destino.waiting` e, depois de liberar todos os locks, recalcula o relatório pelo estado mutável com `countStaged`/`sampleStaged` (linhas 177–210). A correção reduziu a janela, mas não a eliminou.

Critério para FIX-17: contagem e amostra pertencentes à carga devem ser capturadas no mesmo fechamento que publica as linhas, sem materializar todos os itens. A sonda com alvo primeiro deve contabilizar 2.000/2.000 na carga dona mesmo que o cabeçalho concorrente recupere um item depois; preservar os casos de duplicata, falha ao consolidar e teto de amostra.

## Evidência executada do zero

- `docker compose down -v` e `docker compose up -d --build`: volume novo, migrações `0001`–`0007`, cinco tabelas de negócio inicialmente vazias.
- `npm run check`: 245 testes; 229 passaram e 16 integrações foram puladas sem `DATABASE_URL`; tipagem, lint, formato e build verdes.
- `npm run coverage`: 92,71% linhas, 89,85% branches, 87,88% funções.
- `npm run test:integration`: 31/31 contra PostgreSQL real.
- `node scripts/validate-case.mjs`: 30/30 duas vezes na matriz original e 30/30 novamente depois do commit `45c781b`, que recorta duas consultas do validador por número.
- `npm run validate:http`: 14/14; `npm run validate:sweep`: conjunto inicial de 20.000, 20.011 vistos, zero repetidos, 100 inseridos durante a leitura e escritor ainda ativo depois do fim.
- Volume de 20.000 pedidos × 3 itens, zero rejeições/repetições: Alfa 83,6s; Beta 81,0s; Gama 81,7s; Delta 83,1s. A última faixa de páginas custou entre 0,43× e 0,57× a primeira; memória da API ficou aproximadamente entre 775 e 784 MiB.
- Persistência: pedido, item, conferência e divergência sobreviveram ao reinício do PostgreSQL.
- Falha real do banco: `/health` ficou 200, `/ready` virou 503 e voltou a 200 após o banco subir.
- Sweep de abandono: linha antiga não publicada foi removida; linha recente não publicada e linha antiga publicada foram preservadas.
- Docker: Compose válido, `docker build --check` sem alertas, runtime como usuário `node`; imagem final sem Prisma CLI, engines, `mysql2` e `deepmerge-ts`.
- Segurança/operação: não existe `.github/workflows`; `npm audit --omit=dev --audit-level=high` ainda falha com quatro avisos altos no grafo Prisma (`deepmerge-ts` e `mysql2`), embora esses pacotes tenham sido removidos da imagem final. Política de auditoria e CI continuam abertas.

## Estado entregue

Depois das medições, as cinco tabelas de negócio foram truncadas. As rotas de pedidos e conferências devolvem listas vazias e `/ready` responde 200. Migrações e volume do PostgreSQL foram preservados. As alterações locais preexistentes em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh` não foram tocadas.

Próximo passo sugerido: reservar FIX-17 para R16-01 e R16-02; CI e política de auditoria permanecem uma tarefa operacional separada.
