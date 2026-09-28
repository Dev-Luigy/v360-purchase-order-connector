# Handoff: REVIEW-08 — verificação pós-FIX-08

- Agente e data: Codex, 2026-09-28.
- Estado: revisão concluída; nenhum código de produção ou teste foi alterado.
- Escopo: conferir cada fechamento declarado por FIX-08 contra REVIEW-07, executar sondas independentes, checks, cobertura, auditoria e builds Docker.
- Limite preservado: PostgreSQL e o stack Compose não foram iniciados; ENV-03 continua sendo a tarefa autorizada para isso.

## Veredito

**Não, ainda não está tudo corrigido.** FIX-08 corrigiu de fato precisão decimal, NUL nos schemas, moeda, limite de `clientId`, cabeçalho CSV duplicado, crescimento do conjunto de pedidos e o aviso de OpenSSL. Porém:

1. a correção do teto de itens introduziu/expôs uma falha alta de integridade: um pedido acima do teto é entregue truncado, em vez de ser rejeitado por inteiro;
2. `taxIdMasked: true` ainda aceita CNPJ limpo, portanto o perfil não impõe o formato que declara;
3. parte de R07-02 e todos os itens que FIX-08 declarou fora de escopo continuam pendentes.

Os 132 testes passam porque o teste novo do teto de itens só compara a constante; ele não percorre o adaptador com `maxItemsPerOrder + 1`. A sonda que faz isso reproduz o defeito.

## Resultado item a item de REVIEW-07

| Item                                     | Situação                   | Evidência desta revisão                                                                                                                                       |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R07-01 — escala persistida               | corrigido                  | 7 casas são recusadas pelo parser e pelo schema; 6 passam                                                                                                     |
| R07-02 — limites antes da alocação       | **parcial / defeito novo** | record CSV e conjunto `closed` têm teto; CSV com 10.001 itens produz pedido com 10.000 + uma rejeição; JSON aninhado continua materializando o pedido inteiro |
| R07-03 — NUL                             | corrigido nos schemas      | pedido com NUL é recusado; a validação defensiva antes da escrita continua vinculada a R07-04                                                                 |
| R07-04 — agregado de conferência         | pendente                   | repositório ainda persiste a nota original sem parse/sanitização                                                                                              |
| R07-05 — schema/tipo exatos e strictness | pendente                   | trava continua unilateral; `validateNormalizedOrder` e perfis continuam ignorando `result.data`                                                               |
| R07-06 — perfil                          | **parcial**                | limite de `clientId` corrigido; formato de CNPJ só é estrito quando `taxIdMasked=false`; união discriminada continua pendente                                 |
| R07-07 — cabeçalho CSV                   | corrigido                  | duplicata e coluna vazia são recusadas                                                                                                                        |
| R07-08 — moeda                           | corrigido                  | `ZZZ` é recusada; escala desconhecida lança; allowlist explícita                                                                                              |
| R07-09 — invariantes da conferência      | parcial/pendente           | `purchaseOrderLine` negativo foi fechado; versão positiva, coerência resultado/divergências e campos derivados seguem sem garantia runtime/DB                 |
| R07-10 — supply chain/CI/build           | parcial                    | OpenSSL corrigido; audit, CI, exceção de risco e pruning manual seguem abertos                                                                                |
| R07-11 — integração PostgreSQL           | pendente                   | nenhum teste real de repositório/banco; depende de ENV-03                                                                                                     |
| R07-12 — observabilidade/hardening       | pendente                   | nenhuma mudança, conforme o escopo declarado por FIX-08                                                                                                       |

## Achados desta verificação

### R08-01 — alto — pedido acima do teto é persistível como retrato truncado

Em `PairedCsvAdapter`, quando `current.items.length >= maxItemsPerOrder`, a linha excedente vira `RejectedRecord`, mas o grupo continua contendo os primeiros 10.000 itens. No `flush`, como `current.items.length !== 0`, o adaptador emite o pedido com essa lista parcial.

Sonda independente com um cabeçalho Beta e 10.001 linhas do mesmo pedido:

```json
{ "orderCount": 1, "itemCount": 10000, "rejected": 1 }
```

Isso viola a decisão de ADR-008 de que reenvio é retrato completo por pedido. Se P1-04 persistir o lote, `replaceSnapshot` apaga os itens anteriores e grava os primeiros 10.000, fazendo a linha excedente simplesmente desaparecer do novo retrato.

O problema não é apenas memória: é corrupção semântica do snapshot. O teste `o teto de itens por pedido é conhecido pelo adaptador, não só pelo schema` não chama o adaptador; ele apenas confere `maxItemsPerOrder === 10_000`, por isso ficou verde.

Critério de aceite:

- ao observar o item 10.001, marcar o **pedido inteiro** como inválido por excesso;
- não emitir `NormalizedPurchaseOrder` com os primeiros 10.000 itens;
- remover/consumir corretamente o cabeçalho para que ele não reapareça no final como pedido sem itens;
- emitir uma única rejeição do pedido, não uma rejeição por cada linha excedente;
- regressão real com exatamente 10.000 e 10.001 linhas passando pelo adaptador;
- revisar a política para qualquer grupo que misture itens válidos e inválidos: um snapshot parcial também pode apagar itens conhecidos. A aceitação parcial de ADR-008 é por pedido/registro, não autorização para persistir metade de um pedido.

### R08-02 — médio — `taxIdMasked: true` não exige máscara

O parser escolhe:

- `taxIdMasked=false`: regex exclusivamente limpa;
- `taxIdMasked=true`: regex `maskedTaxId`, que aceita **tanto** 14 dígitos limpos quanto a máscara completa.

Sonda:

```json
{ "masked_profile_accepts_clean": true }
```

Logo, uma mudança do Beta de `12.345.678/0001-90` para `12345678000190` ainda passa sem alteração de perfil/versão, contrariando a justificativa de FIX-08. O teste novo cobre “Alfa rejeita máscara” e “Beta aceita máscara”, mas não cobre “Beta rejeita limpo”.

Critério de aceite: ou `true` exige exclusivamente a regex mascarada e `false` exclusivamente a limpa, com matriz 2×2 de testes, ou o campo deve ser renomeado para algo como `acceptsMaskedTaxId` e a tolerância documentada. O estado atual diz uma coisa e executa outra.

### R08-03 — baixo — `maxCsvRecordSize` não é um limite exato em bytes

O comentário e o nome descrevem 64 KiB em bytes, mas `csv-parse` mede o buffer textual após `TextDecoder`. A sonda mostrou:

- 65.536 caracteres ASCII: passa;
- 65.537 caracteres ASCII (`max + 1`): também passa;
- 65.538: falha;
- texto multibyte é contado por unidades/caracteres do texto, não pelos bytes de entrada.

O parser agora tem um teto e o risco ilimitado foi fechado; este é um problema de contrato/documentação e teste de borda. Corrigir nome/comentário para a unidade real ou adicionar um contador de bytes na entrada se 64 KiB de bytes for requisito. O teste atual declara explicitamente que não verifica a borda exata, embora REVIEW-07 a tenha pedido.

### R08-04 — baixo — cobertura registrada diverge da medição reproduzida

`STATUS.md` registra 94,08% de linhas e 89,20% de branches. Com a mesma base e cobertura nativa nesta revisão, o resultado foi **93,86% de linhas, 88,17% de branches e 93,30% de funções**. Isso não é falha funcional, mas mostra por que o comando e o piso devem ser versionados no CI em vez de manter apenas um número manual.

## Pendências já assumidas, ainda reproduzíveis

### Conferência persiste objeto não sanitizado

Um Prisma falso capturou a nota enviada por `PrismaConferenceRepository.save`: uma chave extra `secret` foi escrita, embora desapareça quando `invoiceCheckRequestSchema.parse` roda na leitura.

```json
{ "writtenSecret": "persistida", "readSecret": false }
```

R07-04/R07-05, portanto, continuam reais. P1-04 deve usar o resultado parseado e construir o agregado a partir de campos derivados internamente.

### JSON aninhado ainda limita tarde

FIX-08 registra corretamente que `stream-json` materializa todo um pedido antes do `.max(maxItemsPerOrder)`. O futuro `bodyLimit` limita a requisição inteira, mas não substitui um teto semântico antecipado por pedido. Esse ponto de R07-02 continua aberto.

### Auditoria e CI

`npm audit` e `npm audit --omit=dev` continuam falhando com quatro vulnerabilidades altas em `deepmerge-ts` e `mysql2`, trazidas pela árvore do Prisma. O runtime remove os módulos conhecidos, mas ainda não há política de exceção, scan do artefato final ou CI. Não executar `npm audit fix --force`, pois ele propõe Prisma 6.

### PostgreSQL real

Continuam sem prova as transações, locks, constraints, `RESTRICT`, paginação/filtros e migração real. Não foi iniciado serviço nesta revisão; ENV-03 permanece o caminho correto.

## Pontos realmente confirmados como corrigidos

- Decimal de entrada com mais de seis casas é rejeitado antes de arredondar.
- Schema persistido recusa 7–12 casas para colunas `NUMERIC(30,6)`.
- NUL é recusado nos textos cobertos pelos schemas de pedido, nota e divergência.
- Moeda fora da allowlist é recusada e não recebe escala padrão.
- Perfil com `clientId` acima de 64 falha no start.
- Cabeçalho CSV vazio/duplicado falha antes dos registros.
- O conjunto de pedidos vistos no CSV agora é limitado também para órfãos.
- Build Docker sem cache executou `prisma generate` sem warning de OpenSSL.
- Imagem de migração reportou `schema-engine-debian-openssl-3.0.x`, sem warning.

## Evidências executadas

- `npm run check`: verde; 132/132 testes.
- cobertura nativa: 93,86% linhas, 88,17% branches, 93,30% funções.
- `docker compose config --quiet`: verde.
- `docker build --check .`: verde.
- builds `runtime` e `migrate`: verdes.
- build `runtime --no-cache`: verde, sem warning de OpenSSL.
- `docker run ... npx prisma --version` na imagem de migração: engine OpenSSL 3 detectado.
- `npm audit` e `npm audit --omit=dev`: quatro vulnerabilidades altas.
- sondas temporárias: decimal, NUL, moeda, perfil, CNPJ nas duas formas, CSV 10.001 itens, borda do record size e persistência da nota.
- PostgreSQL/Compose em execução: não realizados.

## Próxima ação sugerida ao Claude

1. Abrir FIX-09 pequeno para R08-01 e R08-02, com regressões que atravessem o adaptador.
2. Corrigir/documentar R08-03 junto, sem transformar a unidade do limite em suposição.
3. Manter R07-04/05/09 como critérios obrigatórios de P1-04, não como itens encerrados.
4. Abrir tarefas próprias para CI/supply chain e ENV-03; não misturar com o fix do adaptador.
5. Depois do fix, repetir a sonda de 10.001 itens e exigir `orders.length === 0` para aquele pedido.

## Arquivos alterados nesta revisão

- `docs/TASKS.md`
- `docs/handoffs/REVIEW-08-pos-fix-08-codex.md`

A exclusão preexistente de `scripts/activate-node.sh` foi preservada.
