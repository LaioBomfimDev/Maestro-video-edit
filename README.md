# Maestro

Editor de vídeo no navegador com um assistente de IA que executa edições na timeline. Esta versão mantém o histórico e o núcleo do editor recebido e acrescenta a adaptação do Maestro.

## Usar o assistente

1. Abra ou crie um projeto.
2. Entre em **Assistente IA → Gemini**.
3. Cole sua chave do [Google AI Studio](https://aistudio.google.com/apikey), teste a conexão e clique em **Usar chave**.
4. Peça uma edição e revise o resultado na timeline.

A chave fica na sessão da aba e pode ser trocada ou removida nesse mesmo painel. Ela não é persistida na conversa, no projeto ou no Git. A variável `GEMINI_API_KEY` no servidor continua disponível como alternativa.

Remoção de silêncios e legendas usam processamento local no navegador. O chat Gemini envia o pedido e o contexto necessário do projeto ao provedor.

## Desenvolvimento

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
