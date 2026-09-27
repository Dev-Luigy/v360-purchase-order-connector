# Handoff: REVIEW-03 — verificação pós-FIX-02

- Agente e data: Codex, 2026-09-27.
- Estado: concluída.
- Objetivo: dar à próxima IA um ponto de retomada verificável depois de REVIEW-01, FIX-01 e FIX-02.
- Base verificada: `main` em `9d04e76` (`merge: fix/fix-02-verificacao`).
- Alterações desta tarefa: somente este handoff e `docs/TASKS.md`; nenhum código alterado.

## O que está comprovadamente funcionando

- FIX-01 corrigiu os sete achados de REVIEW-01 no fluxo validado: CNPJ na borda, invariantes decimais, lote de saída Beta, agrupamento brasileiro, data de calendário, perfis imutáveis e bordas JSON/CSV.
- FIX-02 corrigiu encerramento de fontes quando o consumidor para cedo e preservou a causa original de erros da origem.
- Última evidência de FIX-02: `npm run check` verde com 86 testes; cobertura registrada de 98,07% de linhas e 87,11% de branches.
- Verificação independente do Codex confirmou lote Beta `[10, 10, 5]`, UTF-8 inválido propagado, perfil clonado/congelado, JPY/KWD e as regressões centrais.

## Riscos residuais reproduzidos

1. **Amplificação por expoente antes do schema — tratar antes de expor ingestão.** `parseDecimal('1e10000', 'plain', 'q', 6)` produz uma string de 10.008 caracteres em `src/infrastructure/integrations/field-parsers.ts` e só depois `decimalTextSchema` a rejeita. Um payload curto pode provocar alocação enorme. Limitar expoente/magnitude **antes** de `Decimal.toText()`.
2. **Memória do Beta ainda é O(total de cabeçalhos).** A saída respeita `batchSize`, mas `indexHeaders()` mantém todos os cabeçalhos em `Map`. FIX-01 registrou isso como trade-off. Para sustentar “qualquer volume”, decidir teto de carga, staging em banco ou exigência/estratégia de ordenação.
3. **Conferência depende da borda Zod para identidade.** `invoiceCheckRequestSchema` rejeita CNPJ contaminado, mas `checkInvoice()` isolado ainda remove todo não dígito e aprova `abc12.345.678/0001-90xyz`. P1-04 deve tornar a validação incontornável ou o domínio deve comparar somente `TaxId` já normalizado.
4. **CNPJ aceita máscara híbrida.** A regex com pontuação opcional aceita `12.345678/0001-90`, embora o comentário prometa formato limpo ou máscara brasileira completa.
5. **`isoInstantSchema` só verifica aparência.** `2026-99-99T99:99:99.999Z` passa. Tornar a validação semântica antes dos filtros HTTP de P1-04.
6. **Contrato da Parte 2 bloqueado.** FIX-02 demonstrou que um único `ClientProfile.numberFormat` não representa o Gama: quantidade/fator são inteiros comuns e preço vem em centavos. Decidir notação por campo e registrar ADR antes de P2-01.

## Estado e ordem sugerida

1. Decidir se os itens 1, 3, 4 e 5 entram em uma estabilização curta antes de P1-02/P1-04. O item 1 é o mais urgente por risco de consumo de memória.
2. P1-02 é o caminho crítico: schema Prisma, migrações e repositórios ainda não existem.
3. Depois, P1-04 implementa casos de uso e rotas; testar limites de corpo, multipart, paginação e validação incontornável.
4. ENV-03 continua pendente; nenhum teste atual prova PostgreSQL real, persistência ou reinício.
5. Resolver o contrato de notação por campo somente antes da Parte 2, sem antecipar Gama/Delta.

## Cuidados de colaboração

- `scripts/activate-node.sh` está apagado no working tree por alteração preexistente; não restaurar nem incluir sem alinhamento. O README ainda o referencia.
- `docs/STATUS.md` ainda descreve FIX-01 (81 testes e cobertura antiga), embora FIX-02 registre 86 testes e cobertura nova.
- Consultar `docs/TASKS.md` antes de reservar P1-02 ou uma nova estabilização. Não há reserva de código mantida por REVIEW-03.
