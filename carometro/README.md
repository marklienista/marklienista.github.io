# FotoCrachá — laboratório 0.13: carômetros simples e organização opcional

Aplicativo de testes: https://carometro-teste.onrender.com
Fonte única: `marklienista/marklienista.github.io`, branch `carometro-lab-002`, pasta `carometro/`.
Condutor único: https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit

## Direção aprovada em 29/10/2026

FotoCrachá é o nome do aplicativo. A unidade criada, aberta e compartilhada é **Carômetro**, não escola nem espaço de trabalho. Nome do carômetro e instituição são informações distintas e **opcionais**. Uma pessoa pode organizar um grupo pequeno, suas turmas, participantes de uma atividade ou vários conjuntos independentes. Repetir o nome de uma instituição não une cadastros nem concede acesso entre eles.

Novos carômetros começam no modo simples: uma lista contínua de pessoas e fotografias, sem turma, ano ou atualização anual. É possível deixar todos os campos de identificação vazios e criar o carômetro. A interface usa “Carômetro sem nome” apenas como rótulo; o campo continua vazio no documento. Nome e identificação de cada pessoa também são opcionais. Fotos, nome, instituição e logo podem ser acrescentados posteriormente.

## Interface e operações

- **Meus carômetros / Novo carômetro:** título e instituição separados. A lista usa os rótulos do cadastro e um identificador curto para distinguir carômetros sem nome. Quando existe apenas um carômetro acessível e não há convite específico, o login tenta abri-lo diretamente. “Meus carômetros” continua abrindo a lista por ação explícita.
- **Pessoas:** inclusão, edição, fotografia, seleção e captura em sequência funcionam sem criar turmas artificiais. O aplicativo não carrega exemplos automaticamente.
- **Configurar carômetro:** permite ativar “Organizar em turmas ou grupos” e, separadamente, “Usar anos e passagem anual”. Nenhuma dessas opções é marcada no novo carômetro simples. Grupos podem existir sem ano e sem professor/responsável.
- **Continuidade:** desativar grupos ou anos só altera a apresentação. Turmas, professores, vínculos e histórico existentes permanecem no cadastro. Reativar não duplica os registros. A passagem anual só aparece quando a organização anual está ativada, exige um ano escolhido e continua dependente de confirmação humana.
- **Importar lista:** leitura de XLSX/CSV existente preservada. No modo simples, uma coluna Nome basta; não se exige uma turma. A comparação continua mostrando prévia e jamais exclui quem está ausente. Uma coluna de turma não cria grupos automaticamente quando o modo simples está ativo.
- **Imprimir:** carômetros e crachás usam a mesma lista, por seleção, pessoas em exibição ou conjunto do período. Instituição, grupo, responsável e ano não preenchidos/desativados são omitidos. Não se imprime “Escola”, “Turma não informada” nem “Pessoa sem nome” como substitutos de dados ausentes. No carômetro, o título vazio usa apenas a identificação genérica “Carômetro”.
- **Crachás:** mantidos os modelos com foto ou só nome, oito cartões de 86 × 54 mm por A4 e impressão pelo navegador. A nota adicional do lote permanece temporária; não é persistida no Drive. Medidas físicas ainda dependem da configuração da impressora.

## Modelo e compatibilidade

O arquivo continua `carometro.json`, com `schema_version: 1`. Os campos internos `school`, `classes`, `students` e `enrollments` são preservados para não quebrar os cadastros já existentes; na interface eles representam instituição, turmas/grupos e pessoas. Foram acrescentados `title`, `settings.groupsEnabled` e `settings.annualEnabled`.

Ao abrir um cadastro anterior que não possua as novas opções, a existência de turmas/anos permite preservar sua apresentação escolar. O título inicial desse cadastro usa o nome institucional anterior; a pessoa poderá diferenciá-los depois. O carregamento não grava automaticamente essa normalização e não apaga ou converte arquivos remotos. Novo cadastro sem vínculo não gera uma turma oculta.

O título e a instituição também são registrados como rótulos curtos `fcTitle` e `fcInstitution` em `appProperties` do manifesto no Drive. Isso permite listar carômetros pelo nome atual sem baixar todos os dados pessoais. Os rótulos respeitam o limite de bytes da API e são atualizados no mesmo envio multipart do JSON. Pastas e fotografias existentes não são movidas ou renomeadas, e o identificador do manifesto permanece o mesmo. Esses rótulos não são um novo banco nem um controle paralelo.

## Acesso amplo e privacidade — decisão mantida

Permanece o escopo aprovado `https://www.googleapis.com/auth/drive`. O Google concede acesso amplo aos arquivos acessíveis à conta; **a limitação à pasta do carômetro é implementada pelo nosso código e não restringe o alcance do token OAuth**. O aviso antes de conectar e a ajuda deixam essa distinção explícita. Quem recebe um convite também autoriza sua própria conta. O aplicativo recusa tokens que concedam apenas o antigo `drive.file`.

O token fica só na memória da página; nunca em URL, localStorage, GitHub, banco ou servidor próprio de dados. Fotos e cadastros são processados no navegador e armazenados diretamente no Drive escolhido. O código continua verificando pasta-pai real do manifesto, subpasta Fotos, referências de imagens, tipo e tamanho antes de ler conteúdo; gravação e gestão de permissões ficam vinculadas ao carômetro aberto. Não há exclusão de arquivos de estudantes pelo aplicativo. Retirar uma referência de foto não apaga o arquivo anterior.

A pasta Google é a fonte dos papéis Leitor e Editor. Compartilhar o carômetro concede acesso ao conjunto, não apenas ao grupo selecionado. Controles e adaptador bloqueiam escrita de Leitores. Convites públicos ou para domínio inteiro geram alerta. O nome institucional não representa autoridade formal sobre uma escola.

Nenhum novo Supabase, backend, OAuth Client ID ou API key foi criado nesta revisão. O Google Picker permanece fora do fluxo normal. Manter conta segura, permissões individuais e finalidade/autorização apropriadas, especialmente para dados de crianças. Nunca editar `carometro.json` manualmente nem mover ou apagar as imagens utilizadas.

## Salvamento e colaboração

O salvamento automático continua agrupado após cerca de 1,2 segundo e serializado por aba. Edições realizadas durante um envio seguem pendentes para a próxima gravação. Erros interrompem novas tentativas automáticas e oferecem recuperação explícita. Mudança remota de conteúdo detectada antes de gravar bloqueia a sobrescrita; alteração só de metadados não é tratada como conflito de conteúdo.

Não há coedição em tempo real, sincronização periódica nem novo aviso automático entre contas nesta revisão. O controle de conflitos é de melhor esforço, não transação atômica entre navegadores. Evitar edições simultâneas e reabrir para obter mudanças de outra conta. Esse tema continua separado da mudança de nomenclatura e campos opcionais.

## Testes executados em 29/10/2026

- **22 testes de modelo:** criação inteiramente vazia, nomes opcionais, foto sem turma, importação simples, duplicatas, ativar/desativar organização, compatibilidade dos registros anteriores, ano opcional, preservação de histórico e promoção anual.
- **9 testes de armazenamento com Google simulado:** manifesto vazio, salvamento de título/instituição no índice, mesmo ID ao atualizar, imagem sem grupo, papel Leitor, rejeição de foto externa, conflitos e limites UTF-8 dos rótulos.
- **24 verificações de interface em Chromium sem rede:** entrada, formulários opcionais, criação, pessoa/foto sem grupo, CSV, crachás sem metadados inventados, nota temporária, segunda conta simulada, leitura, cadastro anterior, toggles sem perda e grupo sem ano.

Os testes de navegador foram DOM isolado com autenticação/Drive simulados, imagem sintética, CSS de apoio local e leitor CSV de teste. Não constituem homologação da URL pública, da impressão física nem do salvamento na conta real; o leitor XLSX e o CSS original da aplicação não foram substituídos. Nenhum arquivo ou fotografia real de estudante foi usado nos testes ou alterado.

Testes reproduzíveis do modelo/adaptador:

```sh
node --test carometro/tests/simple-carometro.test.mjs carometro/tests/simple-storage.test.mjs
```

A suíte `tests/access-smoke.test.mjs` anterior foi preservada. A identidade visual base em `styles.css` e os avisos em `access.css` foram mantidos, com `simple.css` apenas para os controles novos.

## Publicação e próximo teste real

Serviço Render existente `carometro-teste`, branch de laboratório, autoDeploy desligado. Esta revisão deve ser publicada só após conferir todos os módulos 0.13 e seus testes. A publicação técnica não significa lançamento.

Próximo teste: na conta Google adulta já autorizada, clicar **Novo carômetro → Criar carômetro** sem preencher nada; adicionar uma pessoa/foto fictícia; aguardar “Tudo salvo”; reabrir e imprimir crachá. Conferir também o carômetro escolar antigo sem alterar seus dados. Não recadastrar nem reenviar fotos existentes.

Configuração Google Cloud anterior mantida: projeto `784125401141`, origem `https://carometro-teste.onrender.com`, consentimento do escopo amplo e contas testadoras. A verificação pública do aplicativo pelo Google e os requisitos institucionais de privacidade continuam separados.

Referências técnicas oficiais usadas nesta revisão:
- https://developers.google.com/workspace/drive/api/guides/properties
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- https://developers.google.com/workspace/drive/api/guides/manage-uploads

O FotoCrachá continua em desenvolvimento, sem decisão de lançamento.
