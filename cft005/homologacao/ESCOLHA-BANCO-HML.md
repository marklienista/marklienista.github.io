# CFT-005 — Banco exclusivo de homologação identificado

28/10/2026, 21:01 BRT. Estado: **candidato escolhido; banco não provisionado; permissões reais BLOCKED**. Esta etapa fez somente leituras de metadados e documentação, sem SQL nas aplicações existentes. Complementa o contrato CFT005-HML-1; não muda sua fronteira de autorização nem a matriz original 9 PASS, 3 BLOCKED e 2 FAIL.

## Escolha

**Novo Render Postgres Free**, nome proposto `cft005-hml-db-teste`, no workspace **My Workspace**, conta Primary, região **Virginia**, PostgreSQL **17** e armazenamento **1 GB**. Uso exclusivo dos quatro registros HML e do futuro estado de sessão/revogação da prova. Nenhum banco existente será reutilizado. O identificador real, hostname, prazo de expiração e credenciais ainda não existem; só podem ser registrados após criação confirmada. A escolha é temporária, não uma oferta gratuita permanente.

| Item | Evidência desta etapa | Limite |
|---|---|---|
| Workspace autorizado | My Workspace, `tea-dattm47lk1mc73cu74bg`, retornado pela conexão Primary | A conta alternativa não foi usada |
| Banco Render existente | A listagem nesse workspace retornou zero Postgres | Sugere vaga na cota documentada; não comprova aceitação futura da criação |
| BFF A | `srv-dbftdpvf3r2c73bflvjg`: Virginia, free, AutoDeploy desligado | Leitura de configuração; nenhum deploy |
| BFF B | `srv-dbftdt3l550s739sao1g`: Virginia, free, AutoDeploy desligado | Leitura de configuração; nenhum deploy |
| Plano/versão | Documentação atual lista `free` e PostgreSQL 17 entre as versões disponíveis | Não houve pedido de criação ou leitura de segredo |
| Papéis próprios | Render documenta usuários criados diretamente por CREATE USER, fora da gestão do painel | Ainda é necessário provar o privilégio administrativo e os grants no novo banco |

A escolha usa a conexão já autorizada e a mesma região dos BFFs. A documentação permite tráfego de saída de web services Free para datastores na rede privada. Isso reduz dependência de tráfego público, mas **a rede do workspace não é uma fronteira exclusiva por produto**: outros recursos da região podem alcançar a rede. A autorização exige credenciais distintas, grants e RLS; Origin/CORS/JavaScript continuam sem função de identidade de produto.

## Alternativas avaliadas

| Alternativa | Decisão | Motivo |
|---|---|---|
| Novo Render Postgres Free | Escolhido para ensaio temporário, condicionado às verificações pós-criação | Workspace disponível, zero Postgres listados e compatibilidade documental com papéis próprios |
| Novo Supabase Free | Não escolhido nesta etapa | A conta conectada já lista dois projetos ativos. O plano Free permite dois projetos; plano/cota e gratuidade de um terceiro não foram comprovados. Não pausar ou excluir nenhum para abrir vaga |
| Schema no Supabase compartilhado | Rejeitado | Não atende ao destino exclusivo contratado e exigiria alteração de recurso existente |
| Render Key Value Free ou SQLite em web service Free | Rejeitados para este contrato | Não fornecem a fronteira PostgreSQL com papéis/RLS exigida; não usar armazenamento volátil para comprovar persistência de revogação |

Não houve consulta de tabelas, logs, usuários ou registros de Supabase; só lista de projetos/organização. Não foram alterados plano, cobrança, capacidade, aplicativos publicados ou Apertaquem. Nenhuma conta nova ou assinatura foi criada. O plano de cobrança da organização Supabase não foi inferido pela lista de projetos; a recusa de selecioná-lo é conservadora, não uma prova de que a API negaria a criação.

## Limites de gratuidade e operação

O Free Render Postgres comporta 1 GB, limita a um banco por workspace e expira 30 dias após criação. Depois há 14 dias de tolerância para upgrade, seguidos de exclusão; o upgrade é vedado nesta prova. Não oferece backup nem pool gerenciado. Estes limites tornam a escolha adequada apenas ao ensaio com dados descartáveis. [Fonte oficial](https://render.com/docs/free).

O catálogo atual indica 0,1 CPU, 256 MB RAM e até 100 conexões; o orçamento proposto do aplicativo é no máximo duas conexões por BFF, reservando capacidade para administração e futuro coordenador. Conferir a configuração real após criar. Usar pool do próprio cliente com contexto SET LOCAL por transação; não ativar uma opção paga. [Planos](https://render.com/docs/compute-plans).

Não presumir custo zero para todo o workspace: limites de tráfego e builds são separados do plano do banco. Esta escolha não muda esses limites, não ativa autoscaling, HA, réplica, backup pago ou upgrade. Se a criação gratuita for recusada ou exigir pagamento, conservar BLOCKED. Nenhum valor de checkout ou consumo do painel de cobrança foi atestado nesta leitura.

A rede externa deve ficar desabilitada antes de armazenar fixtures ou instalar credenciais nos BFFs; uma janela administrativa futura precisa ser restrita e encerrada após uso. O Render documenta acesso externo aberto por padrão e permite removê-lo. A allowlist externa não limita a rede interna, por isso não substitui os papéis. Não gerar configuração que publique senha ou connection string no GitHub/Drive. [Conexão e acesso externo](https://render.com/docs/postgresql-creating-connecting).

Não há prazo de expiração concreto para registrar agora: a contagem começa na criação real. Ao criar, registrar createdAt/expiresAt retornados, impedir dependência do banco após o prazo e salvar apenas evidências sanitizadas antes do vencimento. Não criar uma sequência de bancos para contornar o prazo nem uma automação nova nesta etapa. A aplicação deve falhar fechada se perder banco/registro de revogação.

## Permissões propostas e prova obrigatória

| Papel | Acesso previsto | Vedado |
|---|---|---|
| Administrador inicial do banco novo | Instalação e inspeção dos objetos HML | Uso como credencial de execução dos BFFs |
| `cft005_hml_owner` (NOLOGIN) | Proprietário dos schemas/tabelas/políticas novos | Login de aplicação e concessão a A/B |
| `cft005_hml_a` (LOGIN exclusivo) | SELECT/INSERT/UPDATE somente em `cft005_hml_a.records` | Objetos B, CREATE, DELETE/TRUNCATE, CREATEROLE/CREATEDB, BYPASSRLS e assumir papéis privilegiados |
| `cft005_hml_b` (LOGIN exclusivo) | SELECT/INSERT/UPDATE somente em `cft005_hml_b.records` | Objetos A e os mesmos privilégios vedados a A |

RLS habilitada e forçada, contexto de proprietário derivado do principal validado pelo backend, e WITH CHECK para produto/proprietário imutáveis. Não conceder membership do owner ou papel de administração a A/B. NOINHERIT sozinho não impede SET ROLE: testar a ausência de membership e de privilégios que permitam assumir outro papel. Conferir privilégios de PUBLIC, CREATE/TEMP no banco, schemas e EXECUTE de funções; não copiar grants administrativos do usuário padrão para os papéis da aplicação. A instalação de usuários por SQL é distinta de adicionar uma credencial padrão gerenciada pelo Render, que pode mudar referências automáticas de conexão; não tratar rotação como isolamento.

O coordenador futuro terá um papel/credencial próprios, sem acesso às relações de registros dos produtos. Ainda faltam sua implementação e o protocolo de revogação linearizada do contrato. A escolha de banco não cria uma solução de logout central nem comprova durabilidade após reinício.

Antes de marcar `database=true` no recibo HML, exigir: (1) ID e destino novo confirmados; (2) criação Free aceita sem upgrade; (3) banco contendo só os objetos/fixtures HML; (4) criação de owner e logins de execução com os atributos exatos; (5) operações próprias positivas e negativas cruzadas com cada login, incluindo SET ROLE, RLS, pool e preservação alheia; (6) inventário de superfícies e fechamento do acesso externo; (7) credenciais somente em campos protegidos. Metadados e documentação não satisfazem esses gates. Se CREATEROLE ou outro requisito não estiver disponível, parar sem ampliar privilégios ou reutilizar o projeto compartilhado.

Não foi emitida senha, executado CREATE ROLE, aplicado grant/RLS, gravada fixture nem conectado qualquer BFF a um banco nesta etapa. H01–H24 continuam 0 PASS, 0 FAIL, 24 BLOCKED; S12/S13 publicados continuam FAIL. **CFT-005 ABERTO.**

**Único próximo passo:** provisionar somente `cft005-hml-db-teste` no Free de My Workspace/Virginia e validar os papéis/grants/RLS com dados sintéticos antes de conectar os BFFs ou executar os casos integrados.

## Referências verificadas

- [Render: plano Free](https://render.com/docs/free), [catálogo de planos](https://render.com/docs/compute-plans), [criação/conexão](https://render.com/docs/postgresql-creating-connecting), [usuários criados por SQL versus credenciais gerenciadas](https://render.com/docs/postgresql-credentials) e [rede privada](https://render.com/docs/private-network).
- [PostgreSQL 17: CREATE ROLE e atributos](https://www.postgresql.org/docs/17/sql-createrole.html).
- [Supabase: projetos gratuitos e organizações](https://supabase.com/docs/guides/platform/billing-on-supabase) e [preços/limites](https://supabase.com/pricing).
