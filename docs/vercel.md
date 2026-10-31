# Deploy do Maestro na Vercel

O aplicativo Next.js está em `apps/web`. A configuração está em
`apps/web/vercel.json`; ela usa Bun, instala as versões do `bun.lock` e executa
o build do Next.js.

## Configuração do projeto

1. Importe este repositório na Vercel.
2. Defina **Root Directory** como `apps/web` e **Framework Preset** como Next.js.
3. Mantenha habilitada a inclusão de arquivos de fora da Root Directory, pois o
   `package.json` dos workspaces e o `bun.lock` ficam na raiz do repositório.
4. Cadastre apenas as variáveis das integrações que deseja ativar.
5. Para testar o assistente antes de integrar a branch à `main`, publique uma
   Preview da branch que contém o código do assistente.

Não use `bun deploy:web` para esse deploy: esse script é destinado ao Cloudflare.
O `vercel.json` já seleciona `bun run build`.

## Variáveis de ambiente

O editor local funciona sem credenciais de serviços externos. Cadastre os valores
das integrações desejadas no painel da Vercel; não envie arquivos `.env.local` ao
Git e não use credenciais fictícias em produção.

| Variável                     | Valor esperado                                        |
| ---------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`       | URL HTTPS do site                                     |
| `NEXT_PUBLIC_MARBLE_API_URL` | `https://api.marblecms.com`                           |
| `DATABASE_URL`               | URL de um PostgreSQL acessível pelo servidor          |
| `BETTER_AUTH_SECRET`         | Segredo próprio da instalação                         |
| `UPSTASH_REDIS_REST_URL`     | URL HTTPS do Redis REST                               |
| `UPSTASH_REDIS_REST_TOKEN`   | Token do Redis REST                                   |
| `MARBLE_WORKSPACE_KEY`       | Chave do workspace do blog                            |
| `FREESOUND_CLIENT_ID`        | ID do cliente Freesound                               |
| `FREESOUND_API_KEY`          | Chave da API Freesound                                |
| `GEMINI_API_KEY`             | Chave do Gemini, necessária para o chat por IA        |
| `GEMINI_MODEL`               | Opcional; modelo principal definido em `.env.example` |
| `GEMINI_FALLBACK_MODELS`     | Opcional; modelos alternativos separados por vírgula  |
| `GEMINI_THINKING_LEVEL`      | Opcional; `minimal`, `low`, `medium`, `high` ou `off` |

As variáveis de serviços são opcionais para o build. Valores preenchidos continuam
sendo validados. Sem as credenciais correspondentes:

- Login fica indisponível com HTTP 503. Para ativá-lo, configure PostgreSQL,
  `BETTER_AUTH_SECRET`, Redis REST e a URL pública do site.
- Feedback fica indisponível com HTTP 503 sem PostgreSQL ou Redis REST.
- Busca de sons fica indisponível com HTTP 503 sem `FREESOUND_API_KEY` ou Redis
  REST. A proteção de limite de requisições é mantida nos serviços habilitados.
- Blog fica vazio sem `MARBLE_WORKSPACE_KEY`.
- Chat por IA retorna HTTP 503 quando não há chave no painel Gemini nem
  `GEMINI_API_KEY` no servidor.

Os projetos e a edição de mídia usam o armazenamento do navegador. Os botões de
remoção de silêncios e legendas também executam no navegador.

## Trocar a chave pelo próprio Maestro

No editor, abra **Assistente IA → Gemini**, cole a chave e use **Testar conexão**
ou **Usar chave**. Para criar uma chave, o diálogo oferece um link ao Google AI
Studio. Não é necessário alterar variáveis da Vercel ou fazer outro deploy.

A chave pessoal fica no `sessionStorage` da aba (ou só na memória, quando o
navegador bloqueia o armazenamento). Ela é enviada em um header separado para o
servidor, que a usa para chamar a API do Google; não entra no histórico do chat,
nos projetos ou no repositório. A chave pessoal tem prioridade sobre a variável
do servidor. **Remover chave** apaga a chave da aba e volta à chave do servidor,
se houver. Fechar a aba encerra a sessão de armazenamento da chave.

O teste de conexão lista um modelo disponível, sem gerar texto ou executar
edições. Trocar a chave não altera a cota do projeto Google ao qual ela pertence.

Não defina `NODE_ENV=development` na Vercel. Para um teste local, copie
`apps/web/.env.example` para `apps/web/.env.local` e ajuste os valores.

A rota do chat declara `maxDuration = 300` para acomodar as tentativas de 90
segundos do modelo principal e dos dois modelos alternativos padrão. Use Fluid
Compute para esse limite; uma lista maior de modelos pode ultrapassar o orçamento
da função.

## Verificação local

Execute da raiz do repositório:

```sh
bun install --frozen-lockfile
bun run test
bun run build:web
```

O build usa o pacote WASM publicado em `opencut-wasm`; não é necessário compilar
Rust para publicar o site sem alterações no núcleo Rust.

Use `bun run test`, pois o script prepara o módulo WebAssembly real e o canvas
necessário aos testes de texto. O CI executa esse mesmo comando e falha se algum
teste falhar. O build do CI não usa credenciais de serviços externos, para cobrir
o deploy inicial de uma instalação sem integrações.

Referências: [monorepos na Vercel](https://vercel.com/docs/monorepos),
[configuração do vercel.json](https://vercel.com/docs/project-configuration/vercel-json)
e [duração das funções](https://vercel.com/docs/functions/configuring-functions/duration).
