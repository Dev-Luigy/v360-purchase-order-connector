# Integrações

Um adaptador por **forma de entrega**, não por cliente: `nested-json` (Alfa), `paired-csv` (Beta), `flat-json` (Gama) e `split-json` (Delta). Cada um traduz a entrada para o contrato de domínio, sem conhecer HTTP.

O que é estrutura — agrupar linhas achatadas, juntar duas partes por chave, ler em fluxo, decidir o que fazer com órfão — é código aqui. O que é rótulo — caminho do campo, formato de data e número, máscara de CNPJ, delimitador, encoding, vocabulário de situação, moeda assumida — é o `ClientProfile` em `client-profiles.ts`. Cliente novo numa forma conhecida é um perfil novo, sem código novo (ADR-008).
