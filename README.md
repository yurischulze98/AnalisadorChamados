# Analisador de Dossiê BY7 — anexos automáticos por Ctrl+V

Aplicação Next.js pronta para publicar na Vercel. Analisa descrições, históricos e evidências de chamados e gera classificação, resumo de CRM, continuidade, justificativa de SLA e avaliação de cobrança.

## Colagem de texto com prints (sem imagens dentro do campo)

1. Copie o histórico do Seven Suite, incluindo texto e prints, e use **Ctrl+V** no campo **Descrição ou apontamento**.
2. O campo mostra **somente texto e marcadores** como `[Imagem #1]` ou `[Imagem #2]`. Os prints ficam em **Prints anexados**, com miniatura e status de carregamento.
3. Quando o conteúdo copiado fornece HTML com as posições das imagens, cada marcador é colocado no ponto exato em que aquela imagem aparecia entre os apontamentos.
4. Na análise, o frontend substitui cada marcador pelo **conteúdo binário correspondente** e envia uma sequência intercalada de `texto`, `imagem`, `texto` à API. A IA recebe, por exemplo, `apontamento A → imagem 1 → apontamento B → imagem 2`.
5. O usuário pode apagar manualmente um marcador e usar **Inserir no cursor** na miniatura do anexo para reposicioná-lo. O botão de lixeira remove o anexo e seu marcador. Para adicionar um print individual, cole-o no cursor ou use **Anexar imagem na posição do cursor**.

**Uma limitação do clipboard:** se o navegador copiar somente texto e um conjunto de imagens sem suas posições em HTML, **não há como reconstruir com segurança a ordem original**. Nesses casos, os marcadores são colocados após o texto, e o sistema informa que a ordem precisa ser revisada. Em HTML com `<img>` a posição é preservada.

**Outra limitação:** o Seven Suite pode disponibilizar prints apenas por links privados, inacessíveis fora da sessão por política de cookies ou CORS. O site tenta ler os links públicos / permitidos diretamente no navegador, mas não consegue contornar proteção do CRM. Esses anexos aparecem como **Imagem indisponível**. A análise é bloqueada até remover ou substituir os anexos não carregados; se precisar, copie o print individualmente ou faça uma captura de tela. O projeto não solicita credenciais do CRM nem envia links arbitrários ao servidor.

## Limites e custos

- Até **8 imagens PNG, JPG ou WebP** por análise; imagens grandes são otimizadas localmente.
- Limite agregado de **3 milhões de caracteres Base64** nos dados de imagem para reduzir o risco de exceder o limite de corpo da requisição na Vercel.
- Opção de leitura **Econômica** ou **Detalhada** (recomendada para logs e telas com caracteres pequenos).
- O resultado mostra tokens de entrada, saída, total e uma estimativa de custo para o modelo padrão `gpt-5-mini`.
- As imagens ficam em memória no navegador e só são enviadas ao servidor quando o usuário clica **Analisar chamado**. Não há armazenamento permanente neste projeto.

## Publicação no Vercel

1. Coloque a pasta do projeto em um repositório do GitHub.
2. No Vercel, vá a **Add New > Project** e importe o repositório.
3. Cadastre estas variáveis de ambiente:
   - `OPENAI_API_KEY`: chave da API OpenAI.
   - `OPENAI_MODEL`: opcional, padrão `gpt-5-mini`.
4. Publique o projeto.

## Execução local

```bash
npm install
cp .env.example .env.local
# Insira OPENAI_API_KEY no .env.local
npm run dev
```

## Segurança e validações

Apenas os registros classificados como **Cobrado**, **Não Cobrado** e **Hora Extra** são tratados como apontamentos técnicos, conforme as regras existentes do analisador. Imagens são evidências complementares e não substituem os registros. Não cole credenciais, segredos ou dados pessoais desnecessários. O sistema não afirma que uma imagem foi lida quando não consegue importá-la.

Os componentes e a montagem de segmentos foram verificados estaticamente e por testes simulados de sequência de texto e marcadores; o funcionamento ponta a ponta com uma chave real da OpenAI e a cópia específica do Seven Suite precisa ser validado no ambiente de uso.
