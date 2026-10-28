# FotoCrachá — ambiente de testes 0.11 (Google Drive e gravação automática)

**Aplicativo:** https://carometro-teste.onrender.com
**Código único:** GitHub `marklienista/marklienista.github.io`, branch `carometro-lab-002`, diretório `carometro/`.
**Condutor vigente:** https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit
**Nome público:** FotoCrachá; “Carômetro” continua sendo um tipo de impressão. Projeto ainda não lançado.

## Primeira visita

- A primeira tela **não carrega nenhuma turma, aluno ou fotografia de exemplo**. Somente permite **Conectar ao Google Drive**, consultar Ajuda e ler os avisos de privacidade.
- Após autorizar a conta Google, a pessoa escolhe um espaço existente listado no Drive, **cola o link da pasta ou do arquivo `carometro.json` já autorizado para o app**, ou cria um espaço novo, inicialmente vazio.
- Nenhum espaço novo é criado automaticamente só por conectar. A escolha da escola é explícita e o app não apaga ou substitui pastas já existentes.
- O identificador do espaço aberto é colocado no endereço da própria página, `?space=<file-id>`. O link **não concede acesso**: o Google exige que a conta seja autorizada na pasta/arquivo. Não há senha nem token gravado no endereço.
- O vínculo de uma **futura conta básica comum** entre ferramentas não está implementado. OAuth do Google Drive continua separado e o token é transitório, guardado apenas na memória do navegador.

## Salvamento automático

- Alterações pelo aplicativo em turmas, professores, estudantes, fotografias, logo, importação e promoção são programadas para envio ao Drive após cerca de **1,2 segundo sem novas alterações**, em uma fila serializada por aba.
- A interface mostra **“Salvando…”**, **“Tudo salvo no Google Drive”** ou **“Não foi salvo…”**. Não existe botão normal “Salvar”; erro exige intervenção e não dispara tentativas infinitas.
- O primeiro salvamento agora **cria o registro final uma única vez** após carregar as fotografias. A versão anterior enviava um JSON e tentava imediatamente um segundo PATCH, podendo resultar no falso aviso de outra pessoa editando.
- Para espaços já existentes, uma nova versão de metadados do Google não é tratada como edição humana: compara-se o **conteúdo do manifesto remoto com o conteúdo aberto originalmente**. Se o conteúdo de fato mudou, a gravação é interrompida, o original remoto é mantido e a pessoa pode escolher reabrir a versão atual, com confirmação expressa de descarte das edições não salvas nesta aba.
- Mudanças feitas enquanto o upload estava em andamento ficam pendentes e são salvas em uma próxima operação; não se apagam essas mudanças ao receber resposta da gravação anterior.
- Trocar espaço/conta tenta concluir alterações pendentes antes de liberar a mudança. Fechar a página com alterações não confirmadas aciona o aviso do navegador (dependente do navegador).
- **Não há edição colaborativa em tempo real nem trava distribuída garantida.** A comparação entre consulta e atualização do Drive é de melhor esforço, não uma transação atômica. Orientar que uma pessoa edite de cada vez e reabra o espaço antes de iniciar outra rodada.
- O FotoCrachá **não cria arquivos de backup ou versões próprias**. O Google Drive pode manter revisões do próprio arquivo como parte de seu funcionamento.

## Pastas e compartilhamento

- Novo espaço: pasta `FotoCrachá — [escola]`, subpasta `Fotos`, arquivo interno `carometro.json` (nome mantido por compatibilidade).
- Espaços antigos com pasta `Carômetro — [escola]` permanecem onde estavam e são descobertos por `carometro.json`. Nenhum arquivo existente é renomeado automaticamente.
- A pasta do Drive é a **fonte única de permissões** (Leitor ou Editor). A interface abre a pasta para gerenciar acessos no Google; pode convidar usuários por e-mail, mostrar permissões e revogá-las quando a conta tem direito. Se uma permissão `anyone` ou `domain` aparecer, o aplicativo alerta para revisar exposição indevida.
- Colar o link de pasta/cadastro funciona somente se o OAuth limitado `drive.file` já permitir o acesso. Para a conta convidada, **compartilhar uma pasta não autoriza automaticamente a API a ler cada arquivo**. É necessário selecionar `carometro.json` pelo Google Picker; além disso, o acesso a fotografias filhas precisa ser validado por conta.
- A **Google Picker API key pública restrita ainda não foi fornecida**, logo o botão Picker fica desabilitado e a experiência completa de convite/colaboração NÃO está homologada. Não substituir o scope `drive.file` por acesso irrestrito ao Drive como atalho.
- A API do Drive pode indicar que um arquivo perdeu a permissão de edição; a aplicação deve bloquear gravação em vez de tentar sobrescrever ou conceder autorização por conta própria.

## Privacidade e integridade

O FotoCrachá é uma aplicação web estática, sem banco próprio de estudantes: código servido pelo Render e processamento de nomes/fotografias no navegador, com armazenamento dos arquivos diretamente **na conta Google Drive escolhida**. Isso não significa que a infraestrutura do Google fique fora do tratamento de dados; o responsável pela conta e a instituição devem avaliar políticas internas, LGPD, autorizações e a necessidade da finalidade. Recomendar conta institucional ou privada com acesso restrito, senha forte e autenticação em duas etapas. Não usar fotografias e nomes de crianças reais antes de homologar as permissões e o tratamento.

**Não alterar manualmente `carometro.json` nem mover, renomear ou apagar pastas e fotografias relacionadas.** Fazer as modificações dentro da aplicação, para manter a estrutura referencial íntegra. Crachás não imprimem RA/matrícula; nota adicional é transitória e não entra no manifesto. Não há reconhecimento facial.

## Funcionalidades de impressão

- Carômetro em grade por turma, ano ou selecionados, com professor opcional.
- Crachás individuais (86 × 54 mm) com foto ou apenas nome: até oito por folha A4 retrato, com nome, turma, professor, escola, logo opcional e uma observação comum ao lote (até 120 caracteres) que **não é gravada em nenhum arquivo**.
- **Imprimir / Salvar PDF** utiliza a impressão local do navegador (A4, escala de 100%, sem cabeçalhos/rodapés). As medidas finais dependem de prova visual e, quando possível, impressão física.

## Condição atual, testes e próximo passo

Publicação de código **não é lançamento nem validação do fluxo real**. A autenticação Google foi comprovada por Marcelo em uma conta de teste, mas a criação, salvamento, reabertura, alteração e compartilhamento do novo fluxo ainda precisam de prova no navegador autorizado.

Testar somente com dados fictícios:
1. conectar a conta, confirmar que **não aparecem alunos de exemplo** e que a escolha de espaço funciona;
2. criar uma escola e uma turma fictícias; alterar professor e estudante; verificar mensagem **“Tudo salvo no Google Drive”**;
3. atualizar a página, conectar novamente, reabrir o mesmo espaço e confirmar os registros; verificar pasta `FotoCrachá — [escola]` no Drive;
4. testar carômetro/crachás com fotos fictícias e confirmar impressão;
5. somente com Picker habilitado, testar convite real entre duas contas adultas, leitura/edição/revogação e fotos.

Se surgir erro de salvamento, **não apagar ou editar manualmente o JSON**. Registrar mensagem completa; o novo fluxo interrompe tentativas após erro para evitar operações repetidas de resultado incerto.

## Integração Google Cloud

Projeto Google Cloud: `784125401141`. Client ID OAuth Web público centralizado em `config.js`, origem autorizada `https://carometro-teste.onrender.com`, scope mínimo `https://www.googleapis.com/auth/drive.file`. Manter configuração de testes e adultos autorizados; a Google Picker API key pública restrita continua pendente. Nunca incluir `client_secret`, tokens de acesso ou fotos reais no repositório.

A identidade B do ecossistema foi preservada. Nenhuma mudança neste fluxo altera Apertaquem, Som da Turma, MeEmpresta, ApertaLetra, Supabase ou a conta comum futura.
