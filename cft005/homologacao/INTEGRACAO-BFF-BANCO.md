# CFT-005 — Integração BFF e PostgreSQL de homologação

28/10/2026, 22:56 BRT. Estado: **BLOCKED no transporte interno; nenhum PASS HTTP com PostgreSQL**. Produção e Apertaquem preservados. A matriz original continua 9 PASS, 3 BLOCKED e 2 FAIL; H01–H24 continuam BLOCKED por suas dependências integrais. Os 84 controles SQL e os 44 controles históricos dos BFFs em memória permanecem válidos somente nos seus respectivos escopos.

## Preparação executada

O adaptador usa somente o banco `dpg-dbh8tghsrm7s73f4tc9g-a`, database `cft005_hml_db_teste`, papel exclusivo A/B e tabela fixa de cada produto. Não aceita administrador, destino arbitrário, parâmetros de conexão ou proprietário enviados pelo navegador. A autorização OIDC existente confere assinatura, issuer, audience, validade, escopo, subject exato e azp; somente o principal assim validado gera `set_config('cft005.owner', ..., true)` dentro de transação. O registro pedido continua sendo um parâmetro da consulta, permitindo que RLS negue o outro proprietário. Commit/rollback e liberação da conexão são obrigatórios.

Não há seed, DDL, SQL arbitrário, criação de usuário ou fallback em memória no início público. O pool mantém uma conexão por serviço, sob o limite de duas do papel. A prontidão exige papel correto sem bypass, dono separado, RLS habilitada/forçada e TLS. O diagnóstico retorna categorias fixas, sem erro bruto. A prova HTTP preparada tem 13 controles por combinação; a preservação alheia exige releitura independente pelo proprietário autorizado, sem forjar um principal no backend para obter esse resultado.

Credenciais novas A/B tiveram login real externo com certificado verificado e foram salvas somente em `HML_DATABASE_URL` do serviço correspondente. A janela externa administrativa foi fechada; API e painel confirmaram `ipAllowList=[]`. Nenhum registro foi alterado nesta configuração. O material de transferência cifrado de uso único foi excluído antes do SQL; as referências de credenciais em memória foram descartadas após o salvamento protegido. Retenção interna do provedor não foi atestada.

## Tentativas e causa comprovada

| Versão | Destino | Deploy | Resultado |
|---|---|---|---|
| 7e620506bcc23b53b0006bc894acc6d73e3d2c63 | A | dep-dbhacfgn74is73cqe2a0 | update_failed |
| 7e620506bcc23b53b0006bc894acc6d73e3d2c63 | B | dep-dbhacgifngtc73b3hnl0 | update_failed |
| f988af753aa06661cea626e64af1aeb7af33947c | A, diagnóstico fixo | dep-dbhadb142hec73bsskeg | update_failed; database_tls_validation |

A documentação atual do [Render Postgres](https://render.com/docs/postgresql-creating-connecting#ssl-modes-for-internal-connections) informa certificado autoassinado na conexão interna, sem suporte a verify-ca/verify-full. O código exige certificado verificável. Foi incorreto supor que o endpoint privado apresentaria a cadeia pública do endpoint externo. Não foram desativados TLS, validação de certificado ou verificação de identidade para liberar o deploy. A tentativa diagnóstica confirmou a classe TLS; não identifica o erro de certificado específico de B, que não recebeu essa versão.

Ambos os serviços anteriores continuam respondendo health 200, sem `storage=postgres`. São os BFFs antigos com dados em memória, não a nova integração. Nenhum login/prova HTTP foi atribuído ao PostgreSQL. Health check configurado no Render continua TCP; o novo código verifica o banco antes de abrir a porta.

Testes finais locais: **60/60 PASS**, incluindo o agrupador da suíte e oito testes do adaptador. São fixtures/mocks, não emissão Auth0 nem RLS real nesta versão. Auditoria das 17 dependências de produção/opcionais retornou zero avisos conhecidos. Os controles SQL reais anteriores não foram refeitos nem sobrescritos.

## Alternativa concreta preparada; rede ainda bloqueada

O adaptador aceita também, exclusivamente, o endpoint externo exato `dpg-dbh8tghsrm7s73f4tc9g-a.virginia-postgres.render.com`, com `rejectUnauthorized=true` e verificação de hostname. A URI protegida ainda usa o endpoint interno; não houve troca para o externo.

O menu Connect de A e B informou as mesmas redes de saída: `74.220.49.0/24` e `74.220.57.0/24`. A [documentação do Render](https://render.com/docs/outbound-ip-addresses) confirma que esses intervalos são compartilhados por serviços da região: a allowlist não identifica exclusivamente estes dois BFFs. As senhas exclusivas e os grants mínimos continuam necessários. IP dedicado pago não foi contratado.

Proposta restrita: liberar somente essas duas redes no banco sintético, mudar apenas o hostname das duas URIs protegidas para o endpoint externo verificável, implantar A/B e executar as quatro combinações U1/U2. Não liberar `0.0.0.0/0`, IP pessoal ou administrador, nem alterar outros recursos. Encerrar a liberação ao terminar a rodada, aceitando que os BFFs persistentes ficarão indisponíveis depois do fechamento. Essa mudança de acesso exige confirmação no momento da execução pelo controle do navegador e ainda não foi aplicada.

**Único próximo passo:** confirmar a liberação temporária das duas redes de saída para executar a alternativa com TLS verificável. A prova integrada e a homologação continuam BLOCKED até emissão/login e controles HTTP reais; não promover S12/S13 publicados a PASS. CFT-005 ABERTO.

Evidências sanitizadas: [integração/transporte](bff-database-integration-evidence.json), [logins exclusivos](bff-database-configuration-evidence.json) e [SQL anterior](database-real-evidence.json).
