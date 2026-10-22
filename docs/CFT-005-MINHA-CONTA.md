# CFT-005 — Minha conta / preparação sem publicação

Data: 2026-10-22. Estado: preparação técnica em branch isolada, não implantada.

## Decisão vigente
Nome público: Marcelo Santos. O site autoral existente é https://marklienista.github.io/; “marklienista” é identificador de endereço, não uma marca de conta. Na interface utilizar Entrar, Criar conta e Minha conta. Não usar “Conta Marcelo Santos” como marca.

## Fronteiras
O site autoral pode apresentar uma futura área Minha conta. A autenticação central usa o projeto Supabase existente meempresta, mas a rota definitiva e o fluxo de formulário distribuído ainda não estão homologados. Não colocar senha, tokens ou refresh tokens em query string, nem copiar sessões entre origens. MeEmpresta, Som da Turma e ApertaLetra permanecem aplicativos independentes, com RLS por usuário e cliente. Apertaquem tem vínculo futuro opcional; WordPress/WooCommerce/LMFWC seguem como autoridade sobre licenças.

## Primeiro incremento verificável
Preparar clientes sintéticos A/B em origens distintas. Entrar em A e abrir B sem repetir senha, validar o mesmo UUID, client_id próprio, recusa de acesso cruzado e logout/expiração/cancelamento. O OAuth beta estava desligado no último readback; habilitar, alterar RLS ou publicar página exige análise de impacto e autorização específica. Prova local não equivale a SSO real.

## Critério de parada
Sem alterações em Supabase, Render, páginas públicas, contas, dados, licenças ou pagamentos nesta branch. Após prova real aprovada, adaptar primeiro o MeEmpresta e só depois as áreas adultas das demais ferramentas.

Fontes: ARC-001 https://docs.google.com/document/d/1vctr9mkKTUa5ZHRcb_x4k3iXldXkmQWBSsOr2jT6ZAg/edit
CFT-005 https://docs.google.com/document/d/14Tgta3SrAmtJgk8XaQcS-z6SeEnlzIyUGYHkhFQqCPY/edit
