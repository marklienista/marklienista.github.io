# CFT-005 — Avaliação de autorização por produto

## Estado comprovado em 28/10/2026

O candidato foi integrado em dois backends isolados hospedados, com clientes confidenciais Auth0 distintos e emissão real. U1 e U2 Google autorizadas passaram nas quatro combinações pessoa/produto: **44/44 controles reais PASS**. A prova está em [two-user-real-evidence.json](../oidc-backends/two-user-real-evidence.json). As avaliações de 26/10 abaixo são histórico e desenho; os recursos publicados continuam fora da prova e **S12 permanece FAIL na arquitetura publicada**.

O backend de cada produto valida a assinatura RS256 pelo JWKS do emissor fixo, audience da API sintética, perfil JWT previsto, expiração, escopo, subject exato autorizado e `azp` do seu cliente. O subject U2 Google foi confirmado no painel Auth0 e alterado somente no mapeamento protegido dos dois serviços de teste. O e-mail não participa da autorização e não houve vínculo de identidades. O perfil atual rejeita `client_id` e tipos inesperados; usar RFC 9068 exigiria outra política explícita.

Nos testes reais, tokens válidos de A foram recusados por B e vice-versa com HTTP 401 **depois** da verificação de assinatura e do vínculo ao outro cliente. Em cada backend, operações próprias receberam 200, outro usuário 404, outro produto 403 e o registro sintético alheio permaneceu inalterado. As quatro sessões positivas foram estabelecidas pelo fluxo confidencial com PKCE/state/nonce, sem expor bearer ou Client Secret ao navegador. A sonda que recebe bearer em `/proof/token-policy` verifica a mesma política, mas não cria sessão nem consulta dados; rotas de dados rejeitam bearer direto.

Os registros são mapas privados e independentes de cada processo de teste. Não existe um banco compartilhado por trás dessa prova: ela comprova a fronteira dos dois backends, não privilégios de banco, RLS, Storage, Realtime ou RPCs dos produtos existentes. Reinício/implantação perde dados e sessões em memória; o protótipo usa instância única e não é uma implantação de produção. Origin e CSRF protegem escritas da sessão, mas não definem a identidade criptográfica do produto.

Para aplicar o candidato a um produto real, ainda é necessário definir seu recurso privado e fechar qualquer acesso direto por JWT Supabase compartilhado, com privilégios próprios por produto ou projetos separados. Manter um caminho público antigo para os mesmos dados permitiria contornar o BFF. Não foi feita migração, alteração de aplicativo publicado, mudança de privilégio existente ou uso de `service_role` para acessar registros reais. A etapa atual pode homologar somente os recursos sintéticos explicitamente testados.

Sessões e renovação têm evidências separadas em [matriz consolidada](./MATRIZ-CONSOLIDADA-2026-10-28.md). Logout local não encerra o SSO central; a prova de expiração/refresh Supabase não deve ser atribuída aos BFFs, cujos clientes Auth0 aprovados não recebem refresh grant.

## Histórico de 26/10/2026

26/10/2026. Estado: [prova criptográfica local implementada e executada](../backend-proof/README.md), com 91/91 cenários HTTP PASS e somente identidades/dados sintéticos. Ainda sem implantação ou integração com o IdP e os recursos existentes. S12 permanece FAIL no desenho atual. Nenhum dado real foi consultado.

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

Esse candidato exige mudança de arquitetura e configuração isolada, não apenas ajuste do frontend. A prova local criou somente chaves efêmeras, identidades e registros em memória; não criou cliente OIDC, credencial externa, serviço hospedado, tabela real ou contrato pago. Nenhum JWT real foi inspecionado ou armazenado. O PASS do experimento local não homologa a arquitetura real.

## Prova mínima para remover o gate

Com duas contas sintéticas autorizadas e recursos fictícios: permitir operações próprias A→A e B→B; negar leitura/escrita cruzadas de U1/U2; negar o mesmo usuário A→B e B→A; negar bearer copiado sem credencial de serviço correspondente; negar cliente/audience/issuer incorretos, assinatura adulterada, token expirado, `app_id` forjado e acesso direto ao recurso por JWT Supabase comum. Repetir com Origin alterado/ausente. Registrar somente status HTTP, contagens e rótulos sintéticos. Testar refresh, persistência, logout local e central separadamente.

## Fontes verificadas

- [Auth0: aplicações confidenciais e públicas](https://auth0.com/docs/get-started/applications/confidential-and-public-applications)
- [Auth0: validação de access tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [Auth0: perfis e claims azp/client_id](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles)
- [Supabase: JWTs e verificação](https://supabase.com/docs/guides/auth/jwts)
- [Supabase: sessões](https://supabase.com/docs/guides/auth/sessions)
- [Supabase: logout local e validade do access token](https://supabase.com/docs/reference/javascript/auth-signout)
