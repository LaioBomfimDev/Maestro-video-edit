# Maestro

Editor de vídeo no navegador com um assistente de IA que executa edições na timeline. Esta versão mantém o histórico e o núcleo do editor recebido e acrescenta a adaptação do Maestro.

## Usar o assistente

1. Abra ou crie um projeto.
2. Entre em **Assistente IA → Gemini**.
3. Cole sua chave do [Google AI Studio](https://aistudio.google.com/apikey), teste a conexão e clique em **Usar chave**.
4. Peça uma edição e revise o resultado na timeline.

A chave fica na sessão da aba e pode ser trocada ou removida nesse mesmo painel. Ela não é persistida na conversa, no projeto ou no Git. A variável `GEMINI_API_KEY` no servidor continua disponível como alternativa.

Remoção de silêncios e legendas usam processamento local no navegador. O chat Gemini envia o pedido e o contexto necessário do projeto ao provedor.

## Efeitos, transições, cortes e texto

- **Efeitos:** 21 efeitos com intensidade ajustável, mais correção de cor dedicada, incluindo preto e branco, sépia, cinema retrô, luz quente/fria, vinheta e pixelização. O botão `+` aplica à seleção; sem seleção, cria uma faixa de efeito.
- **Transições:** 14 animações de entrada/saída com duração por ponta. Dissolver faz uma passagem pelo fundo entre clipes consecutivos. Animações existentes ficam protegidas até marcar a opção de substituir.
- **Sons:** 18 sons originais locais, com prévia e adição ao cursor. Transições, impactos, percussão e alertas funcionam sem API de sons; a busca externa continua opcional.
- **Imagem e cor:** exposição, brilho, contraste, saturação, temperatura e matiz. Baixe o quadro atual como PNG com a composição e os ajustes.
- **Cortes:** divisão no cursor, aparar pontas e cortes em intervalos de 0,1 a 60 segundos. Um Ctrl+Z desfaz todo o conjunto de cortes em intervalos.
- **Texto e fontes:** texto simples e 20 estilos prontos, fontes em destaque e favoritas salvas no navegador. Fontes do Google precisam de conexão; fontes do sistema continuam disponíveis.

O assistente também pode aplicar efeitos, transições, cortes em intervalos e trocar fontes por pedido no chat. Prévia e exportação usam o mesmo compositor. Efeitos de cor usam Canvas 2D, podendo aumentar o tempo de renderização em vídeos de alta resolução.

## Editar fotos com IA

Selecione uma foto na timeline e abra **Imagem e cor → Editar foto com IA**. Escreva o pedido, escolha o modelo e gere uma prévia. Use a versão editada no clipe ou baixe a imagem. O original permanece na mídia e Ctrl+Z desfaz a substituição. A entrada é uma cópia de até 1600 px; a saída é limitada a 2048 px.

Esse recurso exige a chave pessoal configurada no botão Gemini, acesso a um modelo de imagem e saldo/cota no Google. A imagem e o pedido passam pelo servidor Maestro e pelo Google. O chat também aceita pedidos explícitos de edição de fotos e aplica a nova versão diretamente, com desfazer. Correção de cor, sons locais e animações não enviam imagens. Não é edição generativa de vídeo.

Os cálculos de transição, cortes e síntese de sons estão em `rust/crates/editing`. Para recompilar após alterações, instale o target com `rustup target add wasm32-unknown-unknown` e execute `bun run build:editing`. O pequeno binário em `apps/web/public/editing` é versionado para que o deploy Vercel não dependa da instalação do Rust.

## Desenvolvimento local

```sh
bun install --frozen-lockfile
bun run dev:web
bun run test
bun run build:web
```

O editor funciona sem banco de dados ou Redis. Login, feedback, blog e sons externos são opcionais; veja `apps/web/.env.example` para configurá-los.

## Publicação

Na Vercel, use **Root Directory: `apps/web`**. Consulte [o guia de deploy](docs/vercel.md).

## Estrutura

- `apps/web`: interface Next.js e integrações do servidor web
- `apps/desktop`: aplicativo desktop em desenvolvimento
- `rust`: núcleo compartilhado e bindings WebAssembly
- `docs`: documentação do editor

Os avisos de licença da base permanecem no arquivo [LICENSE](LICENSE) e no histórico do repositório.
