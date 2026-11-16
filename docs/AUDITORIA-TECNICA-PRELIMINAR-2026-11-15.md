# Aurora — Auditoria técnica e correções da primeira rodada

Data: 2026-11-16  
Escopo: leitura estática da branch `hardening/atomic-offline-performance`, inspeção read-only do schema/RLS e advisors do Supabase, correções no código da branch.  
Status: correções de código aplicadas; homologação funcional e de banco ainda pendente.

## Proteção de produção

- A branch `main` não foi alterada.
- Nenhuma migration foi aplicada.
- Nenhum registro foi inserido, atualizado ou excluído.
- O schema de produção ainda não contém `transactions.source_key`; as RPCs desta branch não estão implantadas.
- A tabela `card_debt_installments` continha 13 registros na inspeção inicial: 11 Nubank e 2 Mercado Pago, todos pendentes.
- Foi encontrada 1 transação legada correspondente ao padrão de projeção de cartão; a migration prevê backfill.

## Correções aplicadas nesta rodada

### 1. Service Worker — isolamento de Cache Storage

Arquivo: `sw.js`.

- Novo cache: `aurora-meu-controle-financeiro-cache-v49`.
- A ativação agora remove somente o cache legado conhecido `aurora-cache-v48` e versões com o prefixo exclusivo `aurora-meu-controle-financeiro-cache-`.
- Deixa de apagar indiscriminadamente caches de outros projetos publicados na mesma origem.

Ainda precisa de teste real de atualização, rollback, instalação limpa e coexistência com outro PWA na mesma origem.

### 2. RPC de projeção — validação de parâmetros e data

Arquivo: `supabase/migrations/20261115235900_atomic_card_debt_operations.sql`.

- `sync_card_debt_projection` agora rejeita explicitamente cartão e mês nulos.
- A data da projeção agora considera a menor data de vencimento entre as parcelas efetivamente pagas, coerente com o total que soma apenas parcelas pagas.
- `update_card_debt_installment` agora rejeita valor nulo.
- `reorder_card_debt_installments` agora rejeita data nula.

A migration continua NÃO aplicada. Ainda é necessário executá-la em banco descartável e validar funções, grants, RLS, backfill, unicidade e rollback.

### 3. Importação CSV — linhas idênticas legítimas

Arquivo: `debt.js`.

- A geração de `source_key` passou a incluir a ocorrência de cada linha idêntica dentro do arquivo.
- Isso evita que duas compras distintas com campos inteiramente iguais no mesmo CSV sejam reduzidas a uma única parcela.
- A reimportação do mesmo arquivo, mantendo o conteúdo, deve produzir as mesmas chaves por linha/ocorrência.

Limitação: a identidade ainda depende da estabilidade do conteúdo normalizado e do parser. Validar com CSVs reais dos bancos, incluindo mudança de ordem de linhas/colunas, linhas duplicadas e reimportação. Não foi feito teste funcional de importação contra banco.

## Validações executadas

- GitHub Actions run `43778526249` (commit da migration): conclusão `success`.
- GitHub Actions run `43778540048` (commit da importação): estava `in_progress` na última consulta; não declarar aprovado.
- Validação local de sintaxe via compilação JavaScript: scripts inline, `debt.js` e `sw.js` passaram.
- Parse do `manifest.webmanifest`: passou.
- RLS está habilitada em `transactions`, `card_debt_installments` e `app_change_requests`.
- Policies lidas para transações e parcelas restringem acesso por `auth.uid() = user_id`.
- RPCs existentes de fluxo usam `SECURITY INVOKER`.
- Não foi executado teste de navegador, integração, concorrência, carga ou migração em banco isolado.

## Pendências prioritárias

### P0 — Homologar migration em banco isolado

A nova implementação de dívidas depende de `transactions.source_key` e das RPCs desta migration. Publicar o JavaScript sem a migration compatível fará operações falharem.

É necessário testar em banco descartável: aplicação limpa, backfill, unicidade, chamadas autenticadas, parâmetros inválidos, grants, RLS e rollback. Produção não deve ser usada como ambiente de teste.

### P0 — Operações offline incompletas

A fila offline cobre criação de lançamentos do fluxo principal. Edição, exclusão e alteração de status não entram na fila. O módulo de dívidas também não tem fila offline para CRUD, pagamento ou reordenação.

Não anunciar CRUD offline nem sincronização offline completa. Antes de implementar, definir idempotência, resolução de conflitos, retry e recuperação após encerramento do app.

### P1 — Histórico de transações sem paginação

`loadEntries` consulta todo o histórico em uma requisição. O limite de linhas do PostgREST/Supabase pode truncar históricos extensos. Implementar paginação determinística e testar acima do limite configurado, preservando o saldo acumulado desde o saldo inicial.

### P1 — Proteção contra senhas comprometidas desativada

O Supabase Security Advisor reportou `auth_leaked_password_protection` como WARN. Avaliar e habilitar a proteção contra senhas vazadas nas configurações de Auth, após validar o impacto no fluxo de cadastro e alteração de senha.

### P2 — Alertas de performance do Supabase

O advisor apontou:
- FK `app_change_requests_user_id_fkey` sem índice de cobertura.
- Índices reportados como não utilizados: `transactions_user_date_idx`, `transactions_series_idx` e `card_debt_installments_user_due_sort_idx`.

Não remover índices automaticamente. Conferir planos de execução e carga antes de qualquer alteração.

### P1 — Ícone maskable

`icon-maskable-512.png` e `icon-512.png` usam o mesmo conteúdo. Criar/validar arte maskable independente com safe zone e conferir dimensões reais.

## Próximos passos

1. Aguardar conclusão da validação GitHub Actions do último commit.
2. Preparar banco de homologação descartável e validar migration.
3. Criar testes automatizados de idempotência CSV e de operações financeiras.
4. Implementar paginação do histórico e provar saldo acumulado.
5. Definir e implementar fila offline completa, ou documentar claramente as limitações.
6. Testar atualização/rollback do service worker e coexistência de caches.
7. Fazer homologação visual e funcional em Android, desktop, temas claro/escuro e rede offline/instável.

## Critério de publicação

Não fazer merge nem aplicar migration em produção até:
- backup/exportação verificável;
- migration validada em banco isolado;
- testes de integração aprovados;
- verificação de RLS/grants;
- teste de regressão dos cálculos;
- teste offline/online e atualização do service worker;
- aprovação explícita do proprietário para a publicação.
