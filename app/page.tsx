"use client";

import { useRef, useState } from "react";
import DossieEditor, { DossieEditorHandle, EstatisticasDossie } from "./components/DossieEditor";
import {
  Check,
  Clipboard,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Usage = {
  entrada: number;
  saida: number;
  total: number;
  custoEstimadoUSD?: number;
  modelo: string;
};
type Analysis = {
  classificacao: "INC" | "REQ" | "RCA";
  resumo: string;
  continuidade: string;
  sla: string;
  cobrar: "Sim" | "Talvez" | "Não";
  cobranca: string;
  uso?: Usage;
};
type Detail = "low" | "high";
const initial = { chamado: "", complemento: "" };
const estatisticasIniciais: EstatisticasDossie = { caracteres: 0, imagens: 0, pendentes: 0, tamanhoImagens: 0 };

export default function Home() {
  const [form, setForm] = useState(initial);
  const editorRef = useRef<DossieEditorHandle>(null);
  const [estatisticas, setEstatisticas] = useState<EstatisticasDossie>(estatisticasIniciais);
  const [detail, setDetail] = useState<Detail>("high");
  const [result, setResult] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function analyze() {
    const partes = editorRef.current?.obterPartes() || [];
    if (estatisticas.pendentes) {
      setError("Ainda há imagens sendo preparadas. Aguarde a conclusão antes de analisar.");
      return;
    }
    if (partes.filter((p) => p.tipo === "texto").map((p) => p.texto).join("").trim().length < 20 && !partes.some((p) => p.tipo === "imagem")) {
      setError("Cole o histórico (mínimo 20 caracteres) ou uma imagem no campo Descrição ou apontamento.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          partes,
          detalheImagem: detail,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível analisar o chamado.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível analisar o chamado.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  }

  function clear() {
    setForm(initial);
    editorRef.current?.limpar();
    setEstatisticas(estatisticasIniciais);
    setDetail("high");
    setResult(null);
    setError("");
  }

  const blocks = result
    ? [
        ["CRM (Resumo do Caso)", result.resumo],
        ["CRM (Continuidade)", result.continuidade],
        ["Justificativa de SLA", result.sla],
        ...(result.cobranca ? [["Texto de cobrança", result.cobranca]] : []),
      ]
    : [];

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <header className="border-b border-white/10 bg-[#07111f]/90">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 lg:px-9">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400 text-[#07111f]"><FileText size={21} /></div>
            <div><p className="text-sm font-bold tracking-[.16em] text-cyan-300">BY7</p><p className="text-sm font-medium text-slate-300">Análise de Dossiê</p></div>
          </div>
          <div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex"><ShieldCheck size={17} className="text-emerald-400" /> Baseado somente nos dados informados</div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:px-9">
        <section className="rounded-2xl border border-white/10 bg-[#0d1a2b] p-5 shadow-2xl sm:p-7">
          <div className="mb-6">
            <span className="eyebrow">ENTRADA</span>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">O que precisa ser analisado?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Cole o dossiê completo, com texto e prints misturados, diretamente no campo abaixo. A ordem das evidências será preservada.</p>
          </div>
          <label className="label" htmlFor="ticket">ID do chamado <span>(opcional)</span></label>
          <input id="ticket" value={form.chamado} onChange={(e) => setForm({ ...form, chamado: e.target.value })} placeholder="Ex.: INC-123456" className="field mb-5" />
          <DossieEditor ref={editorRef} desabilitado={loading} onEstatisticas={setEstatisticas} onErro={setError} />
          <label className="label mt-5" htmlFor="complemento">Informação complementar <span>(opcional)</span></label>
          <textarea id="complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} placeholder="Ex.: cobrei o analista; falei com o gestor; existe chamado filho..." className="field min-h-[96px] resize-y" />
          {estatisticas.imagens > 0 && (
            <fieldset className="mt-5 rounded-xl border border-white/10 p-3">
              <legend className="px-1 text-sm font-medium text-slate-300">Qualidade de leitura das imagens</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="detail" checked={detail === "low"} onChange={() => setDetail("low")} disabled={loading} /> Econômica</label>
                <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="detail" checked={detail === "high"} onChange={() => setDetail("high")} disabled={loading} /> Detalhada (recomendada para prints)</label>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">A modalidade detalhada ajuda na leitura de mensagens de erro e textos pequenos.</p>
            </fieldset>
          )}

          {error && <div role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
          <div className="mt-6 flex gap-3">
            <button onClick={analyze} disabled={loading || estatisticas.pendentes > 0} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3.5 font-semibold text-[#05111d] transition hover:bg-cyan-300 disabled:opacity-60">
              {loading ? <Loader2 className="animate-spin" size={19} /> : <Sparkles size={19} />} {loading ? "Analisando..." : "Analisar chamado"}
            </button>
            <button aria-label="Limpar" onClick={clear} disabled={loading || estatisticas.pendentes > 0} className="rounded-xl border border-white/10 px-4 text-slate-300 hover:bg-white/5 disabled:opacity-50"><RotateCcw size={19} /></button>
          </div>
        </section>

        <section className="min-h-[660px] rounded-2xl border border-white/10 bg-[#0a1727] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div><span className="eyebrow">RESULTADO</span><h2 className="mt-2 text-2xl font-semibold">Análise operacional</h2></div>
            {result && (
              <button onClick={() => copy("tudo", `Classificação: ${result.classificacao}\n\nCRM (Resumo do Caso)\n${result.resumo}\n\nCRM (Continuidade)\n${result.continuidade}\n\nJustificativa de SLA\n${result.sla}\n\nCobrar? ${result.cobrar}${result.cobranca ? `\n\nCobrança\n${result.cobranca}` : ""}`)} className="copy">
                {copied === "tudo" ? <Check size={16} /> : <Clipboard size={16} />} Copiar tudo
              </button>
            )}
          </div>
          {!result && !loading && (
            <div className="grid min-h-[540px] place-items-center text-center"><div className="max-w-sm"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/5 text-cyan-300"><Sparkles size={27} /></div><h3 className="mt-5 text-lg font-medium">O resultado aparecerá aqui</h3><p className="mt-2 text-sm leading-6 text-slate-500">A saída seguirá o padrão de classificação, CRM, continuidade, SLA e cobrança.</p></div></div>
          )}
          {loading && <div className="grid min-h-[540px] place-items-center text-center"><div><Loader2 className="mx-auto animate-spin text-cyan-300" size={34} /><p className="mt-4 text-sm text-slate-400">Analisando evidências e últimos apontamentos...</p></div></div>}
          {result && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="metric"><span>Classificação</span><strong className="text-cyan-300">{result.classificacao}</strong></div>
                <div className="metric"><span>Cobrar?</span><strong className={result.cobrar === "Sim" ? "text-amber-300" : result.cobrar === "Talvez" ? "text-yellow-200" : "text-emerald-300"}>{result.cobrar}</strong></div>
              </div>
              {blocks.map(([label, value]) => (
                <article key={label} className="rounded-xl border border-white/10 bg-[#101f31] p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-4"><h3 className="text-sm font-semibold text-slate-200">{label}</h3><button onClick={() => copy(label, value)} className="copy">{copied === label ? <Check size={15} /> : <Clipboard size={15} />} {copied === label ? "Copiado" : "Copiar"}</button></div>
                  <p className="whitespace-pre-wrap text-[15px] leading-6 text-slate-300">{value}</p>
                </article>
              ))}
              {result.uso && (
                <div className="rounded-xl border border-white/10 bg-[#0b1a2a] p-4 text-xs text-slate-400">
                  <p className="font-semibold text-slate-300">Consumo desta análise ({result.uso.modelo})</p>
                  <p className="mt-2">Entrada: {result.uso.entrada.toLocaleString("pt-BR")} tokens · Saída: {result.uso.saida.toLocaleString("pt-BR")} · Total: {result.uso.total.toLocaleString("pt-BR")}</p>
                  {typeof result.uso.custoEstimadoUSD === "number" && <p className="mt-1">Custo aproximado da API: US$ {result.uso.custoEstimadoUSD.toFixed(5)}</p>}
                  <p className="mt-1 text-slate-500">A entrada inclui instruções, histórico e imagens. A API não separa os tokens de cada imagem neste relatório.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
