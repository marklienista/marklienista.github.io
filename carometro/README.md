# FotoCrachá — laboratório 0.15: Carômetros e edição focada

Aplicativo de testes: https://carometro-teste.onrender.com
Fonte única: `marklienista/marklienista.github.io`, branch `carometro-lab-002`, pasta `carometro/`.
Condutor único: https://docs.google.com/document/d/1JSY62EjOjDT73UchbGdGqq3VdD5zs4eQ2UU6PRnb92k/edit

## Navegação e celular — revisão 0.15, 29/10/2026

Marcelo confirmou que a importação de PDF funcionou e o cadastro foi atualizado. Essa é uma validação humana do fluxo anterior, não uma auditoria independente de cada linha. A revisão 0.15 modifica a interface, sem reimportar dados, renomear pastas, mudar o modelo, o leitor PDF ou o escopo Google.

O menu superior pertence à ferramenta: **Carômetros**, conexão/conta **Google** e **Ajuda e privacidade**. A tela **Carômetros** reúne a apresentação autoral aprovada, lista de cadastros, criação, conexão, abertura por link, acesso à pasta e compartilhamento de cada carômetro. O login comum mostra essa tela; um convite específico continua abrindo diretamente o carômetro indicado.

Ao entrar, a área de edição mostra somente título, instituição quando informada, estado de salvamento/recuperação e quatro abas: **Configurar**, **Pessoas**, **Importar / atualizar** e **Imprimir**. Pessoas é a abertura padrão. O bloco “Pessoas, fotografias e crachás. Do seu jeito.” fica apenas na tela inicial. Configurar deixa de ser um diálogo: é uma aba com os mesmos campos opcionais e o mesmo salvamento. Leitores podem consultar a configuração, mas não alterá-la.

Voltar a Carômetros conclui as alterações pendentes antes de mudar de tela, sem desconectar nem descartar o carômetro ativo da memória. Uma ação Continuar permite retomar. Trocar abas ou ir à tela inicial não remonta o importador de PDF. Abrir outro cadastro/conta avisa sobre configurações ainda não aplicadas; falha de gravação impede abandonar silenciosamente alterações pendentes.

O compartilhamento parte do cartão do carômetro e identifica claramente seu nome. Usa uma instância transitória do adaptador DriveFiles, com o token da sessão apenas em memória e as mesmas verificações de pasta já existentes. Essa instância não substitui o adaptador vinculado à edição: consultar/compartilhar B enquanto A está aberto não pode redirecionar a gravação de A. Convidar e retirar acesso continuam exigindo confirmação; papéis e canShare continuam controlados pelo Google. Abrir o diálogo só consulta dados/permissões, não envia convite. A instância transitória é limpa ao fechar ou mudar de conta.

No celular, a organização por grupo usa um seletor compacto. Fotos em sequência e Fotografar ficam em destaque; Editar/Retirar foto/Encerrar vínculo aparecem em Mais. A seleção para impressão é recolhível. Administração de turmas e passagem anual ficam em Configurar no celular, sem retirar os recursos. Não foi criado um segundo sistema de câmera: o fluxo existente com capture=environment foi preservado. Erros de foto, confirmação de salvamento e avisos de segurança não são escondidos para aparentar simplicidade.

Arquivos desta revisão: `app.js`, `index.html`, novos `navigation.mjs` e `navigation.css`, testes de contrato e este README. Mantidos sem alteração: `model.js`, `session.js`, `drive.js`, `drive-files.js`, `view.js`, `pilot-pdf.mjs`, `pilot-plan.mjs`, `pilot-ui.mjs`, `xlsx.js` e estilos base. A identidade visual foi preservada por CSS adicional. Não houve novo backend, banco, conta, API key ou biblioteca.

Validação local: **36 verificações de interface em Chromium isolado passaram**, cobrindo home/editor, quatro abas, Configurar, rascunhos, preservação da leitura local da importação, compartilhamento contextual, largura de 320 e 390 pixels, captura sintética e falha de gravação. OAuth, Drive, sessão, modelo, cartões/impressão e leitura de PDF foram simulados; os arquivos reais app/navigation/HTML foram executados. A comparação visual usou CSS de apoio local derivado da identidade, não o conjunto completo de estilos remotos. Isso não prova autenticação real, leitura de PDF novamente, câmera física ou aparência em todos os dispositivos. Nenhum dado de estudante real entrou em fixtures ou capturas.

**14 testes estáticos de contrato também passaram** e estão versionados:

```sh
node --test carometro/tests/navigation-contract.test.mjs
```

Próxima validação real: abrir `?release=0.15`, conferir Carômetros e abrir um cadastro existente. Testar Configurar/Pessoas/Importar/Imprimir e a navegação pelo celular com foto fictícia. Não precisa importar de novo a lista já salva. Compartilhamento deve ser testado apenas com destinatário autorizado e confirmação explícita. A publicação técnica não equivale a lançamento.

## Importação PDF — revisão 0.14, 29/10/2026

A entrada prioritária de listas passa a ser PDF com texto. Excel e CSV continuam disponíveis. Não é necessário converter manualmente o PDF para CSV. A aba Importar / atualizar oferece: **Ler arquivo → conferir campos e turmas → Conferir mudanças → Aplicar alterações selecionadas**. Ler e comparar não gravam os registros no Drive; a aplicação usa o salvamento existente somente depois da confirmação humana.

`pilot-pdf.mjs` interpreta texto e coordenadas, reconhece cabeçalhos de nomes, RGA/RA/RG/matrícula/identificação, chamada, situação, turma, ano e professor quando explicitamente informado. Consolida páginas de uma turma e ignora os cabeçalhos repetidos e a legenda final. Não usa a cor do texto para decidir se a pessoa está ativa. Há limites de 20 MB, 200 páginas e 25 mil registros. PDFs protegidos por senha, digitalizações sem camada textual e formatos não reconhecidos têm mensagens de limite, sem inventar dados; OCR não foi implementado.

A decodificação usa PDF.js 6.4.299, versão estável indicada pela documentação oficial consultada na revisão 0.14, carregada sob demanda de jsDelivr, com worker da mesma versão. O download da biblioteca é uma requisição externa; **o conteúdo do PDF não é enviado ao CDN, ao FotoCrachá, à IA ou ao Google Drive**. O processamento ocorre na memória do navegador, com avaliação dinâmica de conteúdo e XFA desativados. O PDF original não vira anexo do carômetro. A execução no navegador foi posteriormente confirmada por Marcelo; o ambiente local não executou novamente esse percurso com autenticação real nesta revisão de interface.

`pilot-plan.mjs` faz comparação e aplicação em fases separadas. O identificador é conservado como texto, junto de `codeType` (ex.: RGA) e `codeScope` quando a unidade é conhecida. Número de chamada não substitui RGA e pertence ao vínculo. Não equiparar RG, RA e RGA. O usuário escolhe qual identificador importar quando houver mais de uma coluna. Nascimento, sexo, origem e datas administrativas não são incorporados ao cadastro.

Regras de atualização:
- Por padrão, só AT/Ativo/Ativa formam os registros atuais; o usuário pode conferir o significado das situações antes de comparar. Os demais vínculos não viram novos alunos ativos indiscriminadamente.
- Uma pessoa ativa em outra turma do documento não é encerrada por causa da linha histórica de saída. Múltiplos vínculos ativos incompatíveis ficam bloqueados para revisão.
- Identificação correspondente pode propor mudança de grupo; correção de nome e correspondência só pelo nome exigem marcação explícita. Homônimos e números de tipos/instituições incompatíveis não são unidos automaticamente.
- Pessoas novas, atualizações, saídas e pendências são separadas na prévia. Saídas ficam desmarcadas por padrão; quando confirmadas, encerram o vínculo ou arquivam a pessoa no modo simples sem apagar fotografia/cadastro.
- Ausência no arquivo ou num recorte selecionado nunca causa exclusão automática.
- Professor ausente no documento não apaga professor já cadastrado. Nome da turma, ano e responsável podem ser conferidos na tela. Instituição, grupos, anos e identificação continuam opcionais.
- Uma prévia só é aplicada sobre o mesmo estado usado na comparação. Alterações posteriores exigem nova análise. O adaptador do Drive mantém a proteção remota existente contra sobrescrita detectada.
- O histórico de turmas, IDs das pessoas e referências às fotografias são preservados. A importação não envia nem substitui imagens.

A lista real fornecida por Marcelo foi analisada **localmente**, sem ser publicada neste repositório: 31 páginas, 24 turmas, 936 registros de vínculo, 656 ativos e 280 registros históricos/de saída; 16 ativos sem RGA. Não foi encontrado nome de professor. A análise independente e o interpretador de texto/coordenadas concordaram nesses totais. Em memória, importar os ativos gerou 656 pessoas/24 grupos; repetir a mesma fonte gerou 656 correspondências sem nenhuma nova alteração. Nenhum desses dados foi gravado pelo assistente em um carômetro real. Marcelo posteriormente confirmou sua importação e atualização na interface.

Validação registrada na revisão 0.14: **30 testes sintéticos de extração/comparação/aplicação passaram**, disponíveis em `tests/pilot-pdf.test.mjs`; **13 verificações de interface em Chromium isolado passaram**, com leitor injetado, nomes fictícios e sem Google real. Os testes cobrem criação, repetição, mudanças de turma, correção de nome, identificação ausente, situação histórica, leitores, prévia obsoleta, preservação de fotos e limpeza ao trocar carômetro. A segunda lista real para comparação ainda não foi recebida; mudanças foram simuladas com dados fictícios. Essas suítes não foram reexecutadas na revisão 0.15, que não modifica seus módulos.

```sh
node --test carometro/tests/pilot-pdf.test.mjs
```

Não incluir listas reais em exemplos públicos, fixtures, repositório ou relatórios de depuração. Variantes de outras redes precisam de amostras para validação; reconhecer cabeçalhos semelhantes não constitui suporte universal a qualquer layout.

## Direção do produto — preservada da revisão 0.13

FotoCrachá é o nome do aplicativo. A unidade criada, aberta e compartilhada é **Carômetro**, não escola nem espaço de trabalho. Nome do carômetro e instituição são informações distintas e **opcionais**. Uma pessoa pode organizar um grupo pequeno, suas turmas, participantes de uma atividade ou vários conjuntos independentes. Repetir o nome de uma instituição não une cadastros nem concede acesso entre eles.

Novos carômetros começam no modo simples: uma lista contínua de pessoas e fotografias, sem turma, ano ou atualização anual. É possível deixar todos os campos de identificação vazios e criar o carômetro. A interface usa “Carômetro sem nome” apenas como rótulo; o campo continua vazio no documento. Nome e identificação de cada pessoa também são opcionais. Fotos, nome, instituição e logo podem ser acrescentados posteriormente.

## Interface e operações preservadas

- **Carômetros / Novo carômetro:** título e instituição separados. A lista usa os rótulos do cadastro e um identificador curto para distinguir carômetros sem nome. Na revisão 0.15, o login comum abre o catálogo, inclusive quando há apenas um carômetro, para permitir gerenciar conexão e compartilhamento. Convites específicos continuam abrindo o carômetro indicado.
- **Pessoas:** inclusão, edição, fotografia, seleção e captura em sequência funcionam sem criar turmas artificiais. O aplicativo não carrega exemplos automaticamente.
- **Configurar carômetro:** permite ativar “Organizar em turmas ou grupos” e, separadamente, “Usar anos e passagem anual”. Nenhuma dessas opções é marcada no novo carômetro simples. Grupos podem existir sem ano e sem professor/responsável.
- **Continuidade:** desativar grupos ou anos só altera a apresentação. Turmas, professores, vínculos e histórico existentes permanecem no cadastro. Reativar não duplica os registros. A passagem anual só aparece quando a organização anual está ativada, exige um ano escolhido e continua dependente de confirmação humana.
- **Importar / atualizar:** PDF, XLSX e CSV, com a revisão descrita acima. No modo simples, não se exige turma; as opções da importação permitem manter uma lista contínua. Criar grupos detectados só acontece ao confirmar a aplicação, com a organização selecionada.
- **Imprimir:** carômetros e crachás usam a mesma lista, por seleção, pessoas em exibição ou conjunto do período. Instituição, grupo, responsável e ano não preenchidos/desativados são omitidos. Não se imprime “Escola”, “Turma não informada” nem “Pessoa sem nome” como substitutos de dados ausentes. No carômetro, o título vazio usa apenas a identificação genérica “Carômetro”.
- **Crachás:** mantidos os modelos com foto ou só nome, oito cartões de 86 × 54 mm por A4 e impressão pelo navegador. A nota adicional do lote permanece temporária; não é persistida no Drive. Medidas físicas ainda dependem da configuração da impressora.

## Modelo e compatibilidade

O arquivo continua `carometro.json`, com `schema_version: 1`. Os campos internos `school`, `classes`, `students` e `enrollments` são preservados para não quebrar os cadastros existentes; representam instituição, turmas/grupos e pessoas. `title`, `settings.groupsEnabled` e `settings.annualEnabled` mantêm a organização opcional. A importação acrescenta apenas metadados opcionais de identificação, origem da turma e chamada, sem migrar ou duplicar arquivos.

Ao abrir um cadastro anterior que não possua as opções, a existência de turmas/anos permite preservar sua apresentação escolar. O título inicial desse cadastro usa o nome institucional anterior; a pessoa poderá diferenciá-los depois. O carregamento não grava automaticamente essa normalização e não apaga ou converte arquivos remotos. Novo cadastro sem vínculo não gera uma turma oculta.

O título e a instituição também são registrados como rótulos curtos `fcTitle` e `fcInstitution` em `appProperties` do manifesto no Drive. Isso permite listar carômetros pelo nome atual sem baixar todos os dados pessoais. Os rótulos respeitam o limite de bytes da API e são atualizados no mesmo envio multipart do JSON. Pastas e fotografias existentes não são movidas ou renomeadas, e o identificador do manifesto permanece o mesmo. Esses rótulos não são um novo banco nem um controle paralelo.

## Acesso amplo e privacidade — decisão mantida

Permanece o escopo aprovado `https://www.googleapis.com/auth/drive`. O Google concede acesso amplo aos arquivos acessíveis à conta; **a limitação à pasta do carômetro é implementada pelo nosso código e não restringe o alcance do token OAuth**. O aviso antes de conectar e a ajuda deixam essa distinção explícita. Quem recebe um convite também autoriza sua própria conta. O aplicativo recusa tokens que concedam apenas o antigo `drive.file`.

O token fica só na memória da página; nunca em URL, localStorage, GitHub, banco ou servidor próprio de dados. Fotos e cadastros são processados no navegador e armazenados diretamente no Drive escolhido. O código continua verificando pasta-pai real do manifesto, subpasta Fotos, referências de imagens, tipo e tamanho antes de ler conteúdo; gravação e gestão de permissões ficam vinculadas ao carômetro escolhido. Não há exclusão de arquivos de estudantes pelo aplicativo. Retirar uma referência de foto não apaga o arquivo anterior.

A pasta Google é a fonte dos papéis Leitor e Editor. Compartilhar o carômetro concede acesso ao conjunto, não apenas ao grupo selecionado. Controles e adaptador bloqueiam escrita de Leitores. Convites públicos ou para domínio inteiro geram alerta. O nome institucional não representa autoridade formal sobre uma escola.

Nenhum novo Supabase, backend, OAuth Client ID ou API key foi criado. O Google Picker permanece fora do fluxo normal. Manter conta segura, permissões individuais e finalidade/autorização apropriadas, especialmente para dados de crianças. Nunca editar `carometro.json` manualmente nem mover ou apagar as imagens utilizadas.

## Salvamento e colaboração

O salvamento automático continua agrupado após cerca de 1,2 segundo e serializado por aba. Edições realizadas durante um envio seguem pendentes para a próxima gravação. Erros interrompem novas tentativas automáticas e oferecem recuperação explícita. Mudança remota de conteúdo detectada antes de gravar bloqueia a sobrescrita; alteração só de metadados não é tratada como conflito de conteúdo.

Não há coedição em tempo real, sincronização periódica nem novo aviso automático entre contas. O controle de conflitos é de melhor esforço, não transação atômica entre navegadores. Evitar edições simultâneas e reabrir para obter mudanças de outra conta. Esse tema continua separado da mudança de navegação.

## Testes anteriores preservados — revisão 0.13

- **22 testes de modelo:** criação inteiramente vazia, nomes opcionais, foto sem turma, importação simples, duplicatas, ativar/desativar organização, compatibilidade dos registros anteriores, ano opcional, preservação de histórico e promoção anual.
- **9 testes de armazenamento com Google simulado:** manifesto vazio, salvamento de título/instituição no índice, mesmo ID ao atualizar, imagem sem grupo, papel Leitor, rejeição de foto externa, conflitos e limites UTF-8 dos rótulos.
- **24 verificações de interface em Chromium sem rede:** entrada, formulários opcionais, criação, pessoa/foto sem grupo, CSV, crachás sem metadados inventados, nota temporária, segunda conta simulada, leitura, cadastro anterior, toggles sem perda e grupo sem ano.

Esses testes de navegador foram DOM isolado com autenticação/Drive simulados, imagem sintética, CSS de apoio local e leitor CSV de teste. Não constituem homologação da URL pública, da impressão física nem do salvamento na conta real. Nenhum arquivo ou fotografia real de estudante foi publicado ou alterado.

```sh
node --test carometro/tests/simple-carometro.test.mjs carometro/tests/simple-storage.test.mjs
```

A suíte `tests/access-smoke.test.mjs` foi preservada. Identidade visual em `styles.css`, avisos em `access.css` e controles em `simple.css` mantidos. Não alterado o leitor XLSX nem a geração de crachás nesta revisão.

## Publicação

Serviço Render existente `carometro-teste`, branch de laboratório, autoDeploy desligado. A publicação técnica não significa lançamento. Configuração Google Cloud mantida: projeto `784125401141`, origem `https://carometro-teste.onrender.com`, consentimento do escopo amplo e contas testadoras. A verificação pública pelo Google e os requisitos institucionais de privacidade continuam separados.

Referências técnicas:
- https://mozilla.github.io/pdf.js/getting_started/
- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html
- https://developers.google.com/workspace/drive/api/guides/properties
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
- https://developers.google.com/workspace/drive/api/guides/manage-uploads

O FotoCrachá continua em desenvolvimento, sem decisão de lançamento.
