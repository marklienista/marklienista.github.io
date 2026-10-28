# CFT-005 — Preparação da renovação real nos clientes SPA isolados

Estado inicial preservado: preparado sem emissão. **Execução posterior em 28/10, 14:41–14:54 BRT: renovação real A/B PASS**, conforme [evidência sanitizada](./refresh-real-evidence.json).

Serviços exatos conferidos em My Workspace, Primary:

| Cliente | Serviço | Origem | Branch | Implantação automática |
|---|---|---|---|---|
| A | srv-dbfnj8t9el5s73fuf7bg | https://cft005-login-a-teste.onrender.com | cft005-oidc-dominios | desligada |
| B | srv-dbfnjcks728c738dvun0 | https://cft005-login-b-teste.onrender.com | cft005-oidc-dominios | desligada |

Ambos publicam somente cft005/oidc. A versão anterior era 386aa80d61271ec23da08b79a8bc631d76df56d2. Não alterar os backends BFF ou produtos publicados para esta implantação.

## Preparação de código

- Removido o UUID das mensagens. Uma marca derivada por SHA-256 permite comparar a identidade em A/B; é pseudônimo do teste, sem função de autorização. UUID e credenciais não integram o recibo visível.
- A renovação continua usando refreshSession e validação getUser no servidor. O observador recebe somente booleanos de troca de credenciais; os valores ficam na memória do fluxo e nunca são retornados ao observador ou registrados.
- A interface recusa marcar sucesso se a identidade verificada mudar e mantém disponível o logout local em falhas.
- A sonda de refresh inválido usa um sentinela fixo não emitido, cliente sem persistência, sem auto-refresh e storageKey distinto. Não usa/revoga refresh real e verifica a identidade principal antes/depois. Sucesso inesperado ou troca de identidade falham; erros de transporte não são promovidos a PASS.
- Um bootstrap local limpa a URL do callback antes da execução do SDK e consome a passagem do código uma única vez em memória. A requisição inicial do callback ainda pertence ao fluxo PKCE do provedor; não se declara controle sobre retenção interna do host/provedor. Não coletar URLs de autenticação, cabeçalhos, corpos ou logs brutos.
- SDK supabase-js 2.117.2 mantido. Download público HTTP 200, 217945 bytes, SRI SHA-384 conferido com o HTML.

## Verificação local

As duas suítes Node passaram **26/26**, zero falhas, após a preparação. Incluem isolamento da sonda, ausência de credenciais no observador, troca inesperada de identidade, recuperação/logout e limpeza do callback antes do SDK. São fixtures, não testes reais de emissão/refresh.

Após a execução real, a primeira sonda ficou BLOCKED: HTTP 400 de validação de formato não prova refresh inexistente. O sentinela foi corrigido para doze caracteres alfanuméricos; o erro real passou a refresh_token_not_found. Regressão adicionada para manter validation_failed como BLOCKED; duas suítes **27/27 PASS**. A tentativa anterior permanece no JSON. Referências: [erros Auth](https://supabase.com/docs/guides/auth/debugging/error-codes) e [geração de refresh no GoTrue](https://github.com/supabase/auth/blob/master/internal/models/refresh_token.go).

Somente os dois sites estáticos foram implantados, commit 5a54b40d5db349f0b04e9f22bc353125b870f258. A: dep-dbh3clifngtc73f9lreg; B: dep-dbh3cmo8v5cc73ea5890, ambos LIVE. Dez arquivos públicos conferidos idênticos à branch. Cabeçalhos /* em ambos: no-referrer, no-store, nosniff e CSP restritiva. A/B verificaram a mesma identidade no servidor; renovação mudou access e refresh em memória, preservando identidade e a outra sessão. As sondas corrigidas passaram em ambos, sem revogar credencial real. Logout A preservou B; após logout também de B, A reentrou sem senha e renovou novamente. Contadores da interface reiniciam na recarga. Nenhum registro de aplicativo foi consultado.

Referências conferidas: [refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession), [PKCE](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession), [deploys Render](https://render.com/docs/deploys), [cabeçalhos estáticos](https://render.com/docs/static-site-headers). Changelog Supabase lido; a mudança TLS CBC anuncia remoção a partir de 10/11/2026 e não requer alteração deste cliente Chrome atual. Nenhuma mudança de TTL, OAuth Server beta, esquema, RLS ou dado real.

## Plano inicial executado e limites

Implantar somente os dois serviços acima, conferir os arquivos servidos e a limpeza/controle de referência do callback, entrar somente como U1, comparar a identidade A/B, renovar A e conferir B, renovar B, executar a sonda inválida e verificar preservação de ambas as sessões. Registrar apenas rótulos, resultados, booleanos e horários no CFT-005. U2 segue BLOCKED pela credencial da identidade cadastrada indisponível. Expiração natural do access token e revogação central não são substituídas por essa sonda.
