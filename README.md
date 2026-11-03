# Analisador de Dossiê BY7 — colagem de histórico com imagens inline

Site em Next.js preparado para implantação no Vercel. Analisa descrições, apontamentos e imagens de evidência dos chamados e retorna classificação, CRM, continuidade, justificativa de SLA e avaliação de cobrança.

## Novidade: colar texto e imagens juntos na ordem original

1. No Seven Suite, selecione e copie o histórico completo com **texto e prints intercalados**.
2. No campo **Descrição ou apontamento**, use **Ctrl+V**. Agora ele é um editor rico: deve exibir cada print na posição original, entre os apontamentos.
3. Verifique se os prints apareceram antes de clicar em **Analisar chamado**. O editor envia ao servidor um vetor ordenado `partes` (`texto`, `imagem`, `texto`, etc.), e a API da OpenAI recebe os mesmos trechos e imagens nessa sequência.
4. Se precisar, clique no ponto desejado no texto e use **Inserir imagem no cursor**. Também é possível colar um print individual com Ctrl+V ou arrastá-lo para o campo.
5. Quando houver imagens, escolha **Econômica** ou **Detalhada**, indicada para prints com logs e letras pequenas.

O limite é de **8 imagens PNG/JPG/WebP por análise**, com no máximo ~3 MB em Base64 no total (reserva para o limite de requisição da Vercel). Imagens maiores são otimizadas localmente. Apenas ao clicar em **Analisar** as imagens são enviadas à API; não há armazenamento permanente neste projeto. O resultado mostra o consumo de tokens real da análise e a estimativa de custo para `gpt-5-mini`.

**Como funciona a colagem:** quando o clipboard contém HTML com as tags das imagens, o parser mantém cada imagem exatamente entre os textos. O código interpreta o HTML como texto e imagens sem inserir scripts nem formatação da página original. Se a origem fornece somente texto + arquivos de imagem, mas não suas posições, os arquivos são adicionados ao final e você precisa revisar a sequência. **Imagens privadas do CRM**, identificadas só por um link protegido, podem ser bloqueadas por autenticação ou CORS do navegador; um aviso aparece no lugar da imagem. Neste caso copie o print individualmente, faça uma captura de tela ou utilize uma integração autorizada com o CRM.

**Segurança:** não cole senhas, credenciais, tokens de acesso ou dados pessoais desnecessários. O modelo continua aceitando como apontamentos técnicos válidos somente os registros identificados por `Cobrado`, `Não Cobrado` ou `Hora Extra`, de acordo com as regras existentes. Fotos e prints são evidências complementares; o conteúdo não passa a ser um apontamento técnico apenas por estar em uma imagem.

## Publicar no Vercel

1. Envie a pasta do projeto para um repositório GitHub.
2. No Vercel, selecione **Add New > Project** e importe o repositório.
3. Em **Environment Variables**, cadastre:
   - `OPENAI_API_KEY`: sua chave da API OpenAI.
   - `OPENAI_MODEL`: `gpt-5-mini` (opcional; já é o padrão do projeto).
4. Marque as variáveis para os ambientes desejados e clique em **Deploy**.

Nunca coloque a chave diretamente no código ou em um arquivo enviado ao GitHub.

## Executar localmente

```bash
npm install
cp .env.example .env.local
# Edite .env.local e informe OPENAI_API_KEY
npm run dev
```

## Limitações e boas práticas

- A colagem de imagens inline depende de como a página de origem disponibiliza texto, HTML e imagens no clipboard. A posição é mantida quando a informação existe no HTML copiado.
- O servidor não busca imagens em URLs privadas do CRM: isso exigiria uma integração autenticada específica.
- Na opção Econômica, capturas com letras pequenas podem ficar ilegíveis. Escolha Detalhada nesses casos.
- Análises com imagens custam mais tokens do que análises somente de texto; o valor efetivo consta no relatório de uso depois da consulta.
- A função do Vercel pode rejeitar requisições muito grandes antes de o código processar o conteúdo; por isso o limite conservador de imagens.
- Esta versão não foi testada com uma chave OpenAI real. Faça um teste de ponta a ponta em um chamado de exemplo antes de publicar para usuários.
