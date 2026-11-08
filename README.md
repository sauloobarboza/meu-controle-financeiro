# AURORA — Controle financeiro pessoal

Aplicativo PWA de controle financeiro pessoal, desenvolvido com HTML, CSS e JavaScript, Supabase Auth/Postgres e uma Edge Function para assistente de lançamentos.

## Acesso

- Produção atual: https://sauloobarboza.github.io/meu-controle-financeiro/
- Repositório: https://github.com/sauloobarboza/meu-controle-financeiro
- Supabase: https://supabase.com/dashboard/project/dqhyiggxcxczdcopdyec

## Estrutura

- `index.html`: interface, CSS e JavaScript da aplicação.
- `sw.js`: cache/offline PWA.
- `manifest.webmanifest`: instalação e atalhos.
- `supabase/functions/aurora-assistant/index.ts`: Edge Function de IA.
- `supabase/migrations/`: histórico SQL aditivo.
- `docs/STATUS-IMPLEMENTACAO.md`: escopo, segurança e pendências.

## Segurança

- Autenticação Supabase e RLS por `user_id`.
- Chaves de IA somente em Secrets do Supabase.
- Não publicar `service_role`, chaves privadas ou valores de Secrets no frontend ou GitHub.
- A IA apenas propõe ações; a interface exige confirmação antes de gravar.
- A RPC de lote usa `SECURITY INVOKER` e não executa exclusões.

Consulte o status de implementação antes de publicar alterações.
