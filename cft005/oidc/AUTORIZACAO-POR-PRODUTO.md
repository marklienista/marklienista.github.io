# CFT-005 — Avaliação de autorização por produto

26/10/2026. Estado: proposta avaliada, sem implantação ou prova integrada. S12 permanece FAIL no desenho atual. Nenhum dado real foi consultado nesta rodada.

## Por que a configuração atual não atende

A e B usam o mesmo projeto Supabase e o mesmo provedor customizado. O JWT Supabase normal autentica a pessoa, mas não carrega uma autorização confiável por produto. A prova anterior registrada no CFT-005 mostrou a mesma autorização ao variar Origin para o mesmo UUID. Não foi repetida sobre registros reais nesta rodada.

Adicionar `app_id` no corpo, em um cabeçalho, em localStorage, em `user_metadata` ou em uma política CORS não resolve. Assinar depois uma escolha arbitrária recebida do navegador também não resolve. Uma lista de produtos em `app_metadata` pode representar direitos da pessoa, mas, sozinha, não limita um token ao produto que o recebeu. O client ID público e o PKCE também não autenticam um backend confidencial.

## Candidato: backend confidencial por produto e recursos privados

1. Cada produto mantém domínio e backend próprios e um cliente OIDC confidencial distinto no mesmo tenant Auth0. O backend faz Authorization Code com PKCE, valida state/nonce e autentica a troca de código com credencial exclusiva mantida no servidor. O navegador recebe somente cookie de sessão host-only, Secure, HttpOnly e SameSite adequado ao fluxo. Operações de escrita precisam de proteção CSRF. O SSO central continua compartilhado.
2. A API valida access tokens com biblioteca mantida: assinatura e algoritmo permitido, emissor exato, audience da API, exp/nbf e permissões. Valida também a autorização do cliente: `azp` no perfil Auth0 ou `client_id` no perfil RFC 9068, com mapeamento fixo e exclusivo cliente→produto no servidor. Não usar ID token como bearer da API. Não aceitar JWT Supabase genérico como autorização de produto nem um endpoint que o converta em qualquer produto indicado pelo chamador.
3. Para uma API central, a chamada do backend do produto deve ainda provar a posse da sua credencial privada (por exemplo mTLS ou autenticação de serviço assinada e verificada). A API cruza identidade do serviço, cliente autorizado, audience, produto e pessoa. Somente um claim assinado num bearer prova a emissão, não qual processo o apresenta; evitar que a cópia do bearer de A funcione como chamada de B. Não encaminhar credenciais privadas ao navegador.
4. A API deriva `product_id` do principal autenticado no servidor e o proprietário do subject validado; consulta apenas `(product_id, user_id)` autorizado. O vínculo Auth0 subject→UUID precisa ser explícito e confiável, nunca criado apenas por igualdade de e-mail.
5. Os recursos novos da prova ficam em fronteira privada, sem acesso direto por tokens compartilhados `anon`/`authenticated`, incluindo RPCs, views, Storage e Realtime. Usar privilégios de banco mínimos e separados por produto; credencial `service_role` ampla em todos os backends não constitui isolamento. Alternativa: projetos/bancos independentes por produto, mantendo o mesmo IdP. Não modificar as tabelas existentes nesta etapa.
6. Logout local remove a sessão daquele backend; logout central é outro fluxo. Para revogação imediata em operações sensíveis, validar sessão no servidor. Um JWT já emitido pode continuar válido até expirar: não prometer revogação instantânea nem mudar TTL global.

Esse candidato exige mudança de arquitetura e configuração isolada, não apenas ajuste do frontend. Não foi criado cliente OIDC, credencial, serviço, tabela ou contrato pago nesta rodada. Nenhum JWT real foi inspecionado ou armazenado. A proposta não recebe PASS com base em testes locais.

## Prova mínima para remover o gate

Com duas contas sintéticas autorizadas e recursos fictícios: permitir operações próprias A→A e B→B; negar leitura/escrita cruzadas de U1/U2; negar o mesmo usuário A→B e B→A; negar bearer copiado sem credencial de serviço correspondente; negar cliente/audience/issuer incorretos, assinatura adulterada, token expirado, `app_id` forjado e acesso direto ao recurso por JWT Supabase comum. Repetir com Origin alterado/ausente. Registrar somente status HTTP, contagens e rótulos sintéticos. Testar refresh, persistência, logout local e central separadamente.

## Fontes verificadas

- [Auth0: aplicações confidenciais e públicas](https://auth0.com/docs/get-started/applications/confidential-and-public-applications)
- [Auth0: validação de access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [Auth0: perfis e claims azp/client_id](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles)
- [Supabase: JWTs e verificação](https://supabase.com/docs/guides/auth/jwts)
- [Supabase: sessões](https://supabase.com/docs/guides/auth/sessions)
- [Supabase: logout local e validade do access token](https://supabase.com/docs/reference/javascript/auth-signout)
