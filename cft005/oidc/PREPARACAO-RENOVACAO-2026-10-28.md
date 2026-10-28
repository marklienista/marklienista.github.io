# CFT-005 — Preparação da renovação real nos clientes SPA isolados

Estado inicial: **PREPARADO, ainda sem nova emissão ou renovação real nesta rodada.**

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

Referências conferidas: [refreshSession](https://supabase.com/docs/reference/javascript/auth-refreshsession), [PKCE](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession), [deploys Render](https://render.com/docs/deploys), [cabeçalhos estáticos](https://render.com/docs/static-site-headers). Changelog Supabase lido; a mudança TLS CBC anuncia remoção a partir de 10/11/2026 e não requer alteração deste cliente Chrome atual. Nenhuma mudança de TTL, OAuth Server beta, esquema, RLS ou dado real.

## Execução prevista

Implantar somente os dois serviços acima, conferir os arquivos servidos e a limpeza/controle de referência do callback, entrar somente como U1, comparar a identidade A/B, renovar A e conferir B, renovar B, executar a sonda inválida e verificar preservação de ambas as sessões. Registrar apenas rótulos, resultados, booleanos e horários no CFT-005. U2 segue BLOCKED pela credencial da identidade cadastrada indisponível. Expiração natural do access token e revogação central não são substituídas por essa sonda.
