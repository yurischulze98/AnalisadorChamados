# Analisador de Dossiê BY7

Site em Next.js preparado para implantação no Vercel. Analisa descrições e apontamentos de chamados e retorna classificação, CRM, continuidade, justificativa de SLA e avaliação de cobrança.

## Publicar no Vercel

1. Envie esta pasta para um novo repositório no GitHub.
2. No Vercel, clique em **Add New > Project** e importe o repositório.
3. Em **Environment Variables**, cadastre:
   - `OPENAI_API_KEY`: a mesma chave já utilizada no outro site.
   - `OPENAI_MODEL`: `gpt-5-mini` (opcional).
4. Marque a variável para Production, Preview e Development.
5. Clique em **Deploy**.

Nunca coloque a chave diretamente no código ou em um arquivo enviado ao GitHub. O arquivo `.env.example` contém apenas exemplos.

## Executar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Depois, substitua o valor de `OPENAI_API_KEY` em `.env.local` pela sua chave real.
