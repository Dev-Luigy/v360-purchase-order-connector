# Handoff: FIX-01 — estabilizar validação e limites

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: corrigir os sete achados de [REVIEW-01](REVIEW-01-codex.md), cada um com teste de regressão. Todos os sete foram **reproduzidos antes de corrigir**; nenhum era falso positivo. Um oitavo defeito apareceu durante a correção e também foi corrigido.

## O que mudou, por achado

1. **CNPJ contaminado.** `parseTaxId` só tolera a pontuação da máscara; `abc12.345.678/0001-90xyz` passa a ser rejeição. A nota exige CNPJ limpo na borda (`taxIdSchema`), porque máscara é assunto do arquivo do cliente, resolvido pelo adaptador.
2. **Invariantes numéricos.** Fator de conversão passa a ser estritamente positivo; quantidades e preço, não negativos. **A nota continua laxa de propósito:** quantidade zero é `QUANTIDADE_NAO_POSITIVA` com motivo estruturado (ADR-009, regra 5), e barrá-la no schema devolveria 400 e tornaria o código de divergência inalcançável.
3. **Lote do Beta.** O caminho dos cabeçalhos sem itens agora respeita `batchSize`. Antes, 25 cabeçalhos saíam num lote só com `batchSize = 10`. Os cabeçalhos seguem indexados em memória: é trade-off registrado, previsto pela própria porta `SourceAdapter`, não descuido.
4. **Notação brasileira.** O ponto só é apagado quando está a cada três dígitos. `12.34` virava `1234` — erro de cem vezes em dinheiro que atravessava toda a validação parecendo certo. Era o mais grave dos sete, acima do 1, porque é o único que **altera um valor**.
5. **Schemas semânticos.** `isoDateSchema` recusa `2026-02-31`; `decimalTextSchema` perdeu o expoente e ganhou teto (24 dígitos inteiros, 12 decimais). A regra de calendário virou fonte única em `src/domain/schemas.ts`, usada pelo adaptador e pela borda.
6. **Perfil.** `ordersArray` exigido nas formas que o usam e proibido em `flat-json`; cliente sem campo de moeda precisa declarar `assumedCurrency`. Os perfis entregues pela porta são clonados e congelados — `readonly` é só de compilação.
7. **Bordas.** `TextDecoder` com `fatal: true` (byte inválido falha em vez de virar `�`); booleano do JSON não vira mais nome de fornecedor; escalas de moeda sem centavo e de três casas explícitas, então JPY não é mais tratada como se tivesse centavos. A guarda de exatidão subiu de 60 para 120 dígitos: ela é conservadora por desenho, e a margem maior elimina a recusa de operações que cabiam, sem afrouxar a proteção contra arredondamento silencioso.

## Oitavo defeito, encontrado ao escrever o teste do achado 7

`.pipe()` não encaminha erro da fonte para o destino. Uma falha de decodificação ou de leitura da origem virava erro não tratado, e quem consumia o adaptador ficava esperando um lote que nunca chegava. Corrigido nos dois leitores, com teste.

## Validação

`npm run check` verde: tipagem, lint, formatação, **81 testes** e build. Quinze deles são novos, em `tests/review-01-regressoes.test.ts`, nomeando o achado que cada um trava. Os testes de P1-03 continuam passando, com três ajustes de expectativa onde a mensagem de erro ficou mais precisa.

Não validado: nada tocou banco, HTTP ou Docker. A cobertura de branches medida pelo Codex em REVIEW-01 (81,53%) não foi medida de novo.

## Pendências e próxima ação

- P1-04 estava bloqueada por esta tarefa e agora depende só de P1-02.
- Limites de tamanho de corpo, de página e de multipart continuam para P1-04, como REVIEW-01 apontou; o teto de decimal resolvido aqui é do contrato, não do transporte.
- A barra final em rota (`/health/` devolve 404) segue sem decisão.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de FIX-01 liberadas.
- Revisão: não realizada.
