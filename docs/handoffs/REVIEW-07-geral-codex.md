# Handoff: REVIEW-07 — revisão geral de código, segurança e engenharia

- Agente e data: Codex, 2026-09-28.
- Estado: revisão concluída; nenhum código de produção ou teste foi alterado.
- Escopo: código completo existente após FIX-07, uso de Zod, arquitetura, integridade de dados, limites, segurança, dependências, Docker, CI/CD e estratégia de testes.
- Limite: não foi iniciado PostgreSQL nem o stack Compose. A prova real de migração e repositórios continua em ENV-03.

## Veredito

O projeto está bem organizado e a stack escolhida continua adequada. O domínio não importa Fastify, Prisma ou ambiente; os casos de uso dependem de portas pequenas; adaptadores, banco e apresentação ficam em infraestrutura/apresentação; a composição está em `src/main`. Não recomendo trocar TypeScript, Fastify, PostgreSQL, Prisma, Zod, `decimal.js`, `csv-parse` ou `stream-json`, nem reorganizar as pastas agora.

FIX-07 fechou os três defeitos principais de REVIEW-06, mas a revisão ampla encontrou **três riscos altos de integridade/disponibilidade** que os limites novos não cobrem: precisão persistida maior que `NUMERIC(30,6)`, estruturas que crescem antes de o limite Zod ser aplicado e caractere NUL aceito pelo contrato mas recusado pelo PostgreSQL. Há ainda lacunas médias nas fronteiras Zod, no perfil de cliente, no CSV, nas moedas, na integridade da conferência, na cadeia de dependências e nos testes reais do banco.

Não é correto “usar Zod em todo método”. Zod deve validar dados quando eles atravessam uma fronteira de confiança: HTTP, arquivo/ERP, configuração, JSON do banco e, defensivamente, entrada de persistência que não carrega uma garantia nominal de já validada. Regras de negócio continuam em objetos/funções do domínio; invariantes relacionais e de concorrência continuam no PostgreSQL.

## O que está sólido

- TypeScript está em modo estrito, com `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- Ambiente, perfis, saída normalizada dos adaptadores, nota lida do JSONB e divergências antes da gravação já têm validação runtime.
- SQL usa Prisma ou template parametrizado; não encontrei concatenação SQL insegura.
- Decimal não passa por `number`; a abstração sobre `decimal.js` fecha entradas permissivas e operações inexatas.
- CSV e JSON são lidos em fluxo no nível da carga; erros de origem e encerramento antecipado fecham streams.
- Reposição de pedido e criação de conferência são transacionais; o advisory lock fecha concorrência por pedido no desenho.
- Runtime Docker usa usuário `node`, migração está separada da API e o runtime remove CLI/engines e os pacotes vulneráveis conhecidos.
- Fastify `5.12.5` é a correção corrente para os advisories recentes de validação e HTTP/2; a versão instalada não está abaixo dos patches publicados.
- Os 122 testes passam e a cobertura medida nesta revisão é 93,56% de linhas, 87,82% de branches e 93,06% de funções.

## Achados — ordem de correção

### R07-01 — alto — o contrato aceita mais casas do que o banco guarda e o adaptador arredonda silenciosamente

`maxDecimalPlaces` vale 12 em `src/domain/limits.ts`, e `normalizedItemSchema` usa esse decimal para `conversionFactor`, quantidades e `unitPrice`. As quatro colunas correspondentes são `NUMERIC(30,6)`. A sonda confirmou que um pedido normalizado com `quantityOrdered: "0.0000001"` passa no Zod.

Há dois caminhos de perda:

1. qualquer chamador da porta `replaceSnapshot` pode entregar 7–12 casas; o PostgreSQL coerção para `NUMERIC(30,6)` arredonda o dado;
2. os adaptadores chamam `Decimal.parse(text).toText(6)`, portanto uma fonte com mais de seis casas já é arredondada antes do schema, sem rejeição ou decisão explícita.

Isso contradiz ADR-007, que define escala 6 para quantidade, fator e preço, e o comentário de `Decimal`, segundo o qual divisão é a operação que perde informação conscientemente.

Critério de aceite:

- separar a precisão de cálculo/nota da escala dos campos persistidos;
- recusar mais de seis casas na origem para quantidade, fator e preço, ou registrar uma política explícita de arredondamento de entrada — não arredondar por acidente em `toText(6)`;
- usar schema persistido com no máximo seis casas e validar antes de `replaceSnapshot`;
- testar 6 e 7 casas nos formatos `plain`, `br`, `cents` e notação exponencial, inclusive valores que arredondariam para zero.

### R07-02 — alto — os limites de volume entram depois da alocação que deveriam impedir

O `.max(maxItemsPerOrder)` do Zod só roda quando a lista já existe:

- no JSON aninhado, `streamArrayAtKey` materializa um pedido inteiro, incluindo `items`, antes de `toNormalizedOrder` validar;
- no CSV pareado, `current.items.push(...)` cresce até mudar o número do pedido; um pedido malicioso pode acumular milhões de itens antes de `flush()` chamar Zod;
- o `closed` de `PairedCsvAdapter` cresce para todo número de pedido visto nos itens, inclusive grupos órfãos que não existem no mapa limitado de cabeçalhos. Assim, `maxIndexedHeaders` não limita essa segunda estrutura;
- `csv-parse` está sem `max_record_size`; a opção oficial tem padrão ilimitado e existe justamente para impedir que campo/linha não controlado preencha o buffer.

Critério de aceite:

- interromper/rejeitar no item `maxItemsPerOrder + 1`, antes do `push` definitivo;
- limitar ou eliminar o crescimento de `closed` para grupos órfãos;
- configurar `max_record_size` com limite de contrato e testar exatamente limite/limite+1;
- contar tokens/itens no JSON antes de montar o array completo, ou usar o pipeline de `stream-json` para descer até os itens com contador antecipado;
- em P1-04, impor limite de bytes, partes, arquivos, campos e tempo enquanto o upload ainda está em fluxo.

Referência: <https://csv.js.org/parse/options/max_record_size/>.

### R07-03 — alto — strings válidas no Zod podem ser impossíveis de persistir no PostgreSQL

`z.string()` aceita `\u0000`. A sonda confirmou `normalizedOrderSchema.safeParse(...) === true` com NUL em `supplier.name`. A nota também aceita NUL em seus textos. PostgreSQL não representa NUL em `text`/`varchar`, e `jsonb` rejeita explicitamente `\u0000`; portanto o dado passa pela aplicação e aborta apenas na gravação.

Critério de aceite:

- criar um schema textual reutilizável que rejeite NUL e aplicá-lo a todo texto persistido e a strings dentro do JSONB da nota;
- cobrir JSON escapado (`"\\u0000"`) e CSV contendo o byte NUL;
- manter caracteres Unicode válidos e não aplicar uma remoção/truncamento silencioso.

Referência oficial: <https://www.postgresql.org/docs/17/datatype-json.html>.

### R07-04 — médio/alto — a conferência não é validada nem sanitizada como agregado antes de persistir

`PrismaConferenceRepository.save` valida cada divergência, mas grava `record.invoice` original com cast para `Prisma.InputJsonValue`. O `invoiceCheckRequestSchema` só é aplicado na leitura. A sonda mostrou que Zod aceita um objeto de nota com chave extra e a remove no resultado; como o repositório não usa esse resultado, um chamador pode persistir a chave extra e ela desaparecer silenciosamente ao ler.

Também não há validação runtime conjunta para UUID do pedido, versão positiva, instante, tamanho de `clientId`, consistência `outcome/divergences`, índice de linha versus quantidade de linhas e `purchaseOrderLine` não negativo. TypeScript não protege uma fronteira HTTP nem dados forjados em runtime.

Critério de aceite:

- P1-04 deve construir a conferência a partir do pedido carregado e do resultado de `checkInvoice`, nunca aceitar esses campos derivados do cliente;
- validar a nota na entrada HTTP e persistir `result.data`, não o objeto original;
- criar schema/factory do agregado persistível com refinamentos de consistência, ou um tipo nominal que só a validação possa produzir;
- opcionalmente manter validação defensiva no repositório, principalmente para JSONB;
- decidir explicitamente entre `z.strictObject` (rejeitar campo desconhecido) e strip (sanitizar), sem depender do padrão implícito.

Zod 4 documenta que `z.object` remove chaves desconhecidas e que `z.strictObject` as rejeita: <https://zod.dev/api#objects>.

### R07-05 — médio — os schemas não são hoje uma fonte exata do tipo

As travas em `schemas.ts` verificam somente se o tipo inferido pelo schema é atribuível ao contrato. Elas não provam igualdade nos dois sentidos; uma propriedade adicional exigida pelo schema ou uma propriedade opcional a mais no contrato pode escapar. Além disso, `validateNormalizedOrder` retorna `order`, não `result.data`, e `assertValidProfile` valida uma estrutura mas armazena clone da original. Qualquer strip/transform do Zod é ignorado.

Critério de aceite:

- adicionar teste de tipo bidirecional (`Equal<A, B>`) para pedido e nota, ou derivar os tipos de uma fonte única sem levar Zod para camadas indevidas;
- retornar/armazenar o valor parseado quando a política for sanitização;
- preferir `z.strictObject` para contratos HTTP e configuração em código, mantendo `process.env` não estrito porque naturalmente contém variáveis alheias;
- não duplicar parse em cada função interna: depois da fronteira, carregar uma garantia tipada de “validado”.

### R07-06 — médio — o perfil declara regras que não são cumpridas

- `profileSchema.clientId` não usa `maxClientIdLength`; a sonda confirmou que um perfil com 65 caracteres passa no start, mas todos os pedidos desse perfil falham depois.
- `taxIdMasked` nunca é lido. `parseTaxId` aceita forma limpa e mascarada para Alfa e Beta. Ou a tolerância é intencional e o campo deve ser removido/documentado, ou a versão de formato precisa aplicá-lo; hoje o perfil promete uma regra falsa.
- o perfil não é uma união discriminada por `deliveryFormat`; por isso `NestedJsonAdapter` precisa de `profile.fields.itemsArray as string` mesmo após a checagem. Um `z.discriminatedUnion` e tipos correspondentes eliminariam casts e estados inválidos.

### R07-07 — médio — cabeçalho CSV duplicado é ambíguo e o último valor vence

`assertHeader` transforma as colunas em `Set` apenas para procurar ausentes. A sonda com `A;A` e `x;y` devolveu `A = y`. Um export com duas colunas de mesmo nome pode trocar silenciosamente identidade, quantidade ou preço.

Critério de aceite: após `trim`, rejeitar nomes vazios e duplicados antes da primeira linha, com teste para duplicata idêntica e duplicata que só difere por espaços/BOM.

### R07-08 — médio — a moeda é validada por aparência, não pelo contrato alegado

`currencySchema` diz ISO 4217, mas só exige três letras; `ZZZ` passa. `currencyScale` mantém tabela manual parcial e usa escala 2 para todo desconhecido. Uma moeda válida com escala diferente ou um código inventado pode alterar o resultado da conferência.

Não recomendo adicionar automaticamente `currency-codes`: a atualização do dataset precisa ser governada, e pacote desatualizado apenas move a tabela manual para outro lugar. Para o desafio, a opção mais previsível é uma allowlist versionada das moedas efetivamente suportadas e suas escalas. Se o produto precisar de todas as moedas, escolher uma fonte ISO/CLDR mantida, registrar a versão e testar zero, duas e três casas. `Intl.supportedValuesOf('currency')` do Node pode ajudar na validação, mas não deve sozinho definir um contrato que muda com a versão do ICU.

### R07-09 — médio — invariantes da conferência dependem só do futuro caso de uso

O banco garante a FK para o pedido, mas não que `clientId` seja o do pedido, que `purchaseOrderIngestionVersion >= 1`, nem que aprovada tenha zero divergências e reprovada tenha ao menos uma. `divergenceSchema.purchaseOrderLine` aceita inteiro negativo. Hoje as regras puras produzem valores coerentes; a porta pública do repositório, porém, aceita qualquer objeto estrutural.

Critério de aceite: construir os campos derivados no caso de uso, validar o agregado e adicionar `CHECK` onde a invariante cabe no próprio registro (`purchase_order_ingestion_version >= 1`, índices/linhas não negativos). Coerência entre tabelas deve ser garantida pelo fluxo transacional ou por remodelagem consciente, não por confiar em tipos apagados no runtime.

### R07-10 — médio — auditoria, CI e build reprodutível continuam abertos

`npm audit` e `npm audit --omit=dev` falham com quatro vulnerabilidades altas em `deepmerge-ts` e `mysql2`, trazidas pelo peer opcional do Prisma. `npm audit fix --force` propõe Prisma 6 e não deve ser executado. O runtime remove esses módulos manualmente e o import do acesso a dados passa, mas build/migração e lockfile continuam vermelhos; não existe política de exceção com prazo, scan do artefato final ou pipeline de CI.

O build runtime também reproduziu duas vezes o aviso de OpenSSL durante `prisma generate` no estágio `build`. FIX-07 instalou OpenSSL apenas no estágio `migrate`; logo R06-05 foi fechado para migração, mas não para geração/build. A imagem terminou com sucesso, o que não torna o aviso inexistente.

Critério de aceite:

- resolver o warning no estágio que executa `prisma generate` e provar a versão do engine;
- investigar empacotamento suportado sem `rm -rf` manual (por exemplo, instalação de runtime que omita peers opcionais, manifesto/estágio dedicado), mantendo teste de import;
- definir exceção temporária documentada para as advisories não exploráveis no runtime, com proprietário, prazo e evidência de scan da imagem;
- CI mínima: `npm ci`, `npm run check`, cobertura com piso, build dos estágios, migração em PostgreSQL efêmero, testes de integração, audit conforme política e scan de imagem/SBOM;
- pinar actions de CI por SHA e não criar deploy antes de existir ambiente/credencial definidos.

Advisories: <https://github.com/advisories/GHSA-ggr8-5vv4-36mx>, <https://github.com/advisories/GHSA-3f6p-5ww8-9rcr> e <https://github.com/advisories/GHSA-rgwj-5xj2-c3m3>.

### R07-11 — médio — a principal superfície ainda não tem teste de integração

A cobertura global é boa, mas `purchase-order-repository.ts` ficou em 57,73% de linhas e 30,77% de funções. Nenhum teste usa PostgreSQL real. Continuam sem prova criação/reingestão, `items: null` versus `[]`, lock concorrente, rollback, `CHECK`, `RESTRICT`, filtros/paginação, ordem das divergências e resumo por nota versus ocorrência.

Use um PostgreSQL efêmero no CI. `testcontainers` é opção boa se o time quiser a mesma suíte local/CI e isolamento por teste; um service container do provedor de CI é suficiente se simplicidade for mais importante. Não adotar os dois de início. Referência: <https://node.testcontainers.org/modules/postgresql/>.

### R07-12 — baixo/médio — observabilidade e hardening ainda são básicos

`CheckReadiness` engole a causa e `/ready` só devolve booleano; uma indisponibilidade não deixa evidência do motivo, salvo se outra camada falhar. Registrar transições de estado e causa com controle de frequência melhora operação sem vazar detalhes na resposta.

O Compose é adequado para desenvolvimento e já usa usuário não root e portas em loopback. Antes de tratá-lo como produção, considerar `read_only`, `tmpfs` para temporários, `cap_drop: [ALL]`, `no-new-privileges`, limites de CPU/memória/PIDs, segredos externos e imagens por digest com rotina de atualização. Aplicar primeiro à API; PostgreSQL e migração precisam de escrita controlada.

## Zod: onde usar e onde não usar

| Fronteira                | Situação atual                                 | Recomendação                                                                                         |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `process.env`            | correta, retorna valor parseado                | manter objeto não estrito                                                                            |
| perfis em código         | boa, mas incompleta                            | limites compartilhados, objetos estritos e união discriminada                                        |
| saída Alfa/Beta          | validada                                       | retornar `result.data` ou usar tipo nominal; limite antecipado antes de materializar                 |
| nota HTTP                | schema pronto, rota ausente                    | `z.strictObject`, usar resultado parseado e schema também na resposta                                |
| params/query/cursor HTTP | rota ausente; cursor interno é manual e seguro | Zod no HTTP para UUID, filtros, datas, limite e cursor; manter `decodeCursor` como defesa específica |
| JSONB lido               | validado                                       | manter; decidir se extras históricos são erro ou migração                                            |
| gravação de conferência  | parcial                                        | validar/sanitizar nota e agregado antes da escrita                                                   |
| snapshot de pedido       | confia no tipo estrutural                      | garantia nominal após validação ou defesa no caso de uso/repositório                                 |
| regras de conferência    | funções puras                                  | não substituir por Zod; são regras de negócio                                                        |
| invariantes relacionais  | parcialmente em `CHECK`/FK/transação           | manter no PostgreSQL quando possível                                                                 |

## Bibliotecas: decisão recomendada

### Adotar quando P1-04 começar

1. **Provider Zod do Fastify** listado na documentação oficial (`@fastify/type-provider-zod`, confirmando a versão publicada compatível com Fastify 5 e Zod 4). Ele liga schema de request/response, validação runtime e inferência do handler, reduzindo deriva. Referência: <https://github.com/fastify/fastify/blob/main/docs/Reference/Type-Providers.md>.
2. **`@fastify/multipart` >= 10.1.1** para upload em fluxo, com limites explícitos de `fileSize`, `files`, `fields`, `parts`, `fieldSize`, `fieldNameSize` e `headerPairs`. Não usar `toBuffer()` para cargas; consumir sempre os streams e tratar truncamento/aborto. As versões anteriores a 10.1.1 têm advisories altos de DoS/arquivo temporário: <https://github.com/fastify/fastify-multipart/security/advisories/GHSA-vmph-573x-85f6>. Uso e limites: <https://github.com/fastify/fastify-multipart/blob/main/README.md>.
3. **`fast-check` como dependência de desenvolvimento**, não de runtime, para propriedades de decimal, datas, cursor, formatos numéricos e cortes arbitrários de chunk. Ele gera casos e reduz a falha ao menor contraexemplo: <https://fast-check.dev/docs/introduction/>.
4. **Testcontainers PostgreSQL ou service container de CI**, conforme a escolha descrita em R07-11.

### Avaliar depois, sem instalar agora

- Uma fonte ISO/CLDR de moedas, somente após verificar manutenção e política de atualização.
- `@fastify/rate-limit` quando houver ameaça/deploy definidos; em múltiplas réplicas ele exige store compartilhado, que hoje adicionaria infraestrutura sem requisito.
- `@fastify/helmet` antes de exposição web pública; é defesa complementar, não substitui validação, limites ou autenticação.

### Manter o código/biblioteca atual

- `decimal.js`: adequado e já encapsulado; trocar por Dinero adicionaria modelo monetário sem resolver quantidades/fatores.
- `csv-parse`: adequado; usar `max_record_size` e checagem de cabeçalho em vez de trocar parser.
- `stream-json`: adequado; corrigir a granularidade/contadores do pipeline.
- parsers pequenos de data e CNPJ: são políticas explícitas do contrato. `date-fns`, Luxon ou biblioteca de CNPJ não aumentariam a segurança deste escopo; checksum de CNPJ foi deliberadamente descartado.
- `deepFreeze`: suficiente para objetos simples atuais; uma biblioteca seria dependência sem ganho proporcional.
- validação manual do cursor: já limita comprimento/alfabeto, valida forma, UUID, versão e fingerprint. Zod pode remover casts, mas não é correção prioritária.

## Segurança HTTP para P1-04

Antes de expor ingestão/conferência:

- schemas estritos para `body`, `params`, `query` e respostas;
- limite global `bodyLimit` e limites menores por rota; multipart em fluxo na versão corrigida;
- timeout/cancelamento propagado ao processamento e fechamento da origem em desconexão;
- mapeamento explícito: 400/422 para contrato, 404 para pedido, 409 para conflito e 503 para dependência; não devolver stack/erro Prisma;
- redaction também de cookie, `set-cookie` e futura chave/token; não logar corpo de nota ou arquivos;
- autenticação/autorização não foi pedida pelo desafio, mas deve existir antes de produção real; não inventar agora credenciais fictícias;
- nenhuma entrada do cliente escolhe caminho de arquivo, query SQL, nome de parte arbitrário sem allowlist ou nome de perfil.

## Testes adicionais sugeridos

- limites exatos e `+1` para bytes, record CSV, itens por pedido, linhas de nota e todos os `VARCHAR`;
- NUL, controles, Unicode combinado, surrogate inválido e UTF-8/Windows-1252 truncado;
- cabeçalhos CSV vazios/duplicados, grupos órfãos em grande volume e um único pedido enorme;
- precisão decimal 6/7/12 casas, expoentes, valor que arredonda para zero e overflow após soma/multiplicação;
- propriedades: parse/serialização decimal, fingerprint canônico, datas válidas e invariância a cortes de chunk;
- propriedades de conferência: aprovada implica zero divergências; reprovada implica ao menos uma; repetir a conferência não altera saldo;
- PostgreSQL real: transação, concorrência, rollback, constraints, paginação e `EXPLAIN` dos filtros principais;
- HTTP por `inject`: desconhecidos, extras, content types, body grande, upload truncado/abortado, status e schema de resposta.

## Evidências executadas

- `npm run check`: verde; 122/122 testes.
- cobertura nativa do Node: 93,56% linhas, 87,82% branches, 93,06% funções.
- `docker compose config --quiet`: verde.
- `docker build --check .`: verde, sem warning do verificador Dockerfile.
- build real do target `runtime`: verde; import após pruning passou; `prisma generate` ainda emitiu warning de OpenSSL.
- `npm audit` e `npm audit --omit=dev`: falharam com quatro vulnerabilidades altas.
- sondas temporárias, sem editar o projeto: 7 casas no pedido `true`; NUL no pedido `true`; `ZZZ` `true`; perfil com `clientId` 65 `true`; cabeçalho duplicado devolveu o último valor; nota com chave extra foi aceita e a chave foi removida apenas no valor parseado.
- PostgreSQL real/Compose: não executados.

## Ordem sugerida ao Claude

1. Abrir FIX-08 e fechar R07-01, R07-02 e R07-03 com regressões; são os riscos altos.
2. Fechar R07-04 a R07-09 antes ou junto de P1-04, sem misturar responsabilidade de arquivos.
3. Executar ENV-03 e transformar R07-11 em suíte de integração.
4. Implementar P1-04 já com provider Zod e multipart corrigido/limitado, não adicionar as bibliotecas antes de existir a rota que as usa.
5. Criar tarefa separada de CI/supply chain para R07-10 e hardening operacional.
6. Atualizar `STATUS.md`: a cobertura antiga de 98,26% não representa mais a base com repositórios; a medição atual é 93,56%.

## Arquivos alterados nesta revisão

- `docs/TASKS.md`
- `docs/handoffs/REVIEW-07-geral-codex.md`

A exclusão preexistente de `scripts/activate-node.sh` foi preservada.
