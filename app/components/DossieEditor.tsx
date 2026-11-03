"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2, Paperclip, RotateCcw, Trash2 } from "lucide-react";

export type ParteDossie =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; nome: string; dataUrl: string };

export type EstatisticasDossie = {
  caracteres: number;
  imagens: number;
  pendentes: number;
  tamanhoImagens: number;
  falhas: number;
  semMarcador: number;
};

export type DossieEditorHandle = {
  obterPartes: () => ParteDossie[];
  limpar: () => void;
};

export const MAX_IMAGES = 8;
export const MAX_TOTAL_IMAGE_CHARS = 3_000_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const SUPPORTED = ["image/png", "image/jpeg", "image/webp"];
const MARCADOR_REGEX = /\[Imagem #(\d+)\]/g;

const marcador = (id: number) => `[Imagem #${id}]`;

type TrechoColado = { tipo: "texto"; texto: string } | { tipo: "imagem"; src?: string; arquivo?: File; nome?: string };
type Anexo = {
  id: number;
  nome: string;
  status: "carregando" | "pronto" | "erro";
  dataUrl?: string;
  erro?: string;
};

function toDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

async function otimizarImagem(blob: Blob): Promise<string> {
  if (!SUPPORTED.includes(blob.type)) throw new Error("Formato não suportado. Utilize PNG, JPG ou WebP.");
  if (blob.size > MAX_FILE_BYTES) throw new Error("Imagem acima de 12 MB.");
  if (blob.size <= 500_000) return toDataUrl(blob);

  const url = URL.createObjectURL(blob);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const dimensao = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    if (!dimensao) throw new Error("Arquivo de imagem inválido.");

    function converter(limite: number, qualidade: number): string {
      const escala = Math.min(1, limite / dimensao);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
      canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Falha ao preparar a imagem no navegador.");
      ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL("image/webp", qualidade);
      return webp.startsWith("data:image/webp;base64,") ? webp : canvas.toDataURL("image/jpeg", qualidade);
    }

    let data = converter(2000, 0.9);
    if (data.length > 1_000_000) data = converter(1600, 0.84);
    if (data.length > 1_000_000) data = converter(1200, 0.78);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function carregarImagem(trecho: Extract<TrechoColado, { tipo: "imagem" }>): Promise<string> {
  if (trecho.arquivo) return otimizarImagem(trecho.arquivo);
  const src = trecho.src?.trim() || "";
  if (!src) throw new Error("A página copiada não disponibilizou os dados da imagem.");

  if (/^data:image\//i.test(src)) {
    const resp = await fetch(src);
    return otimizarImagem(await resp.blob());
  }
  // A busca acontece apenas no navegador, nunca no servidor.
  // Prints privados do Seven Suite podem exigir autenticação e/ou bloquear CORS.
  if (/^(https?:|blob:)\/\//i.test(src) || /^blob:/i.test(src)) {
    const url = new URL(src, window.location.href);
    const resp = await fetch(url.toString(), {
      credentials: url.origin === window.location.origin ? "same-origin" : "omit",
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) throw new Error(`Imagem não acessível (HTTP ${resp.status}).`);
    return otimizarImagem(await resp.blob());
  }
  throw new Error("Link privado ou formato de imagem inacessível nesta colagem.");
}

/** Extrai texto e <img> do HTML do clipboard sem inserir HTML de terceiros na interface. */
function lerHtmlColado(html: string): TrechoColado[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const itens: TrechoColado[] = [];
  const blocos = new Set(["DIV", "P", "SECTION", "ARTICLE", "HEADER", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "BLOCKQUOTE", "PRE", "UL", "OL", "TABLE"]);
  const ignorar = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "VIDEO", "AUDIO", "HEAD", "META", "LINK"]);

  function inserirTexto(texto: string) {
    if (!texto) return;
    const ultimo = itens[itens.length - 1];
    if (ultimo?.tipo === "texto") ultimo.texto += texto;
    else itens.push({ tipo: "texto", texto });
  }
  function quebrarLinha() {
    if (!itens.length) return;
    const ultimo = itens[itens.length - 1];
    if (ultimo.tipo !== "texto" || !ultimo.texto.endsWith("\n")) inserirTexto("\n");
  }
  function percorrer(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      inserirTexto((node.textContent || "").replace(/\u00a0/g, " "));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (ignorar.has(el.tagName)) return;
    if (el.tagName === "BR" || el.tagName === "HR") { quebrarLinha(); return; }
    if (el.tagName === "IMG") {
      if (el.getAttribute("width") === "1" && el.getAttribute("height") === "1") return;
      itens.push({ tipo: "imagem", src: el.getAttribute("src") || el.getAttribute("data-src") || "", nome: el.getAttribute("alt") || undefined });
      return;
    }
    if (blocos.has(el.tagName)) quebrarLinha();
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "TD" && child !== el.firstElementChild) inserirTexto("\t");
      percorrer(child);
    }
    if (blocos.has(el.tagName)) quebrarLinha();
  }
  for (const node of Array.from(doc.body.childNodes)) percorrer(node);
  if (itens[0]?.tipo === "texto") itens[0].texto = itens[0].texto.replace(/^\n+/, "");
  const ultimo = itens[itens.length - 1];
  if (ultimo?.tipo === "texto") ultimo.texto = ultimo.texto.replace(/\n+$/, "");
  return itens.filter((item) => item.tipo === "imagem" || item.texto.length > 0);
}

/** Substitui cada marcador pelo conteúdo da imagem, na posição exata do texto. */
function montarPartes(texto: string, anexos: Anexo[]): ParteDossie[] {
  const partes: ParteDossie[] = [];
  const mapa = new Map(anexos.map((anexo) => [anexo.id, anexo]));
  let inicio = 0;
  for (const match of texto.matchAll(MARCADOR_REGEX)) {
    const id = Number(match[1]);
    const anexo = mapa.get(id);
    if (!anexo) continue; // Marcadores digitados sem anexo são tratados como texto comum.
    const posicao = match.index ?? inicio;
    if (posicao > inicio) partes.push({ tipo: "texto", texto: texto.slice(inicio, posicao) });
    if (anexo.status === "pronto" && anexo.dataUrl) {
      partes.push({ tipo: "imagem", nome: anexo.nome, dataUrl: anexo.dataUrl });
    } else {
      partes.push({ tipo: "texto", texto: `[Imagem #${id} indisponível]` });
    }
    inicio = posicao + match[0].length;
  }
  if (inicio < texto.length) partes.push({ tipo: "texto", texto: texto.slice(inicio) });
  return partes.filter((parte) => parte.tipo === "imagem" || parte.texto.length > 0);
}

const DossieEditor = forwardRef<DossieEditorHandle, {
  desabilitado: boolean;
  onEstatisticas: (stats: EstatisticasDossie) => void;
  onErro: (erro: string) => void;
}>(function DossieEditor({ desabilitado, onEstatisticas, onErro }, ref) {
  const [texto, setTexto] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef("");
  const anexosRef = useRef<Anexo[]>([]);
  const proximoId = useRef(1);
  const posicaoCursor = useRef({ inicio: 0, fim: 0 });

  function atualizarTexto(valor: string) {
    textoRef.current = valor;
    setTexto(valor);
  }
  function atualizarAnexos(lista: Anexo[]) {
    anexosRef.current = lista;
    setAnexos(lista);
  }
  function guardarCursor() {
    const el = textareaRef.current;
    if (el) posicaoCursor.current = { inicio: el.selectionStart, fim: el.selectionEnd };
  }
  function posicionarCursor(pos: number) {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      posicaoCursor.current = { inicio: pos, fim: pos };
    });
  }
  function inserirNoCursor(trecho: string) {
    const { inicio, fim } = posicaoCursor.current;
    const atual = textoRef.current;
    const novo = atual.slice(0, inicio) + trecho + atual.slice(fim);
    atualizarTexto(novo);
    posicionarCursor(inicio + trecho.length);
  }

  useImperativeHandle(ref, () => ({
    obterPartes: () => montarPartes(textoRef.current, anexosRef.current),
    limpar: () => {
      atualizarTexto("");
      atualizarAnexos([]);
      posicaoCursor.current = { inicio: 0, fim: 0 };
    },
  }));

  useEffect(() => {
    const partes = montarPartes(texto, anexos);
    const semMarcador = anexos.filter((anexo) => !texto.includes(marcador(anexo.id))).length;
    onEstatisticas({
      caracteres: partes.reduce((soma, p) => soma + (p.tipo === "texto" ? p.texto.length : 0), 0),
      imagens: partes.filter((p) => p.tipo === "imagem").length,
      pendentes: anexos.filter((a) => a.status === "carregando").length,
      falhas: anexos.filter((a) => a.status === "erro").length,
      semMarcador,
      tamanhoImagens: partes.reduce((soma, p) => soma + (p.tipo === "imagem" ? p.dataUrl.length : 0), 0),
    });
  }, [texto, anexos, onEstatisticas]);

  async function prepararAnexo(id: number, trecho: Extract<TrechoColado, { tipo: "imagem" }>) {
    try {
      const dataUrl = await carregarImagem(trecho);
      if (!anexosRef.current.some((a) => a.id === id)) return; // Anexo removido enquanto carregava.
      const total = anexosRef.current.reduce((soma, a) => soma + (a.id !== id ? (a.dataUrl?.length || 0) : 0), 0);
      if (total + dataUrl.length > MAX_TOTAL_IMAGE_CHARS) throw new Error("Limite de tamanho das imagens atingido; remova ou reduza alguns prints.");
      atualizarAnexos(anexosRef.current.map((a) => a.id === id ? { ...a, status: "pronto", dataUrl, erro: undefined } : a));
    } catch (erro) {
      if (!anexosRef.current.some((a) => a.id === id)) return;
      const motivo = erro instanceof Error ? erro.message : "Erro desconhecido ao carregar a imagem.";
      atualizarAnexos(anexosRef.current.map((a) => a.id === id ? { ...a, status: "erro", erro: motivo } : a));
      onErro(`Não foi possível carregar a imagem #${id}: ${motivo}. Confira a lista de anexos.`);
    }
  }

  function inserirTrechos(trechos: TrechoColado[]) {
    if (desabilitado || !trechos.length) return;
    const imagensNovas = trechos.filter((item) => item.tipo === "imagem").length;
    if (anexosRef.current.length + imagensNovas > MAX_IMAGES) {
      onErro(`O limite é de ${MAX_IMAGES} imagens por análise. A colagem foi cancelada para evitar perder evidências.`);
      return;
    }
    const novos: Anexo[] = [];
    const tarefas: { id: number; trecho: Extract<TrechoColado, { tipo: "imagem" }> }[] = [];
    let trechoTexto = "";
    for (const item of trechos) {
      if (item.tipo === "texto") {
        trechoTexto += item.texto;
      } else {
        const id = proximoId.current++;
        novos.push({ id, nome: (item.nome || item.arquivo?.name || `Captura ${id}`).slice(0, 150), status: "carregando" });
        tarefas.push({ id, trecho: item });
        // O marcador é TEXTO SIMPLES: nenhuma imagem é embutida no campo.
        trechoTexto += `\n${marcador(id)}\n`;
      }
    }
    atualizarAnexos([...anexosRef.current, ...novos]);
    inserirNoCursor(trechoTexto);
    onErro("");
    // Preparar as imagens não afeta a ordem dos marcadores no histórico.
    for (const tarefa of tarefas) void prepararAnexo(tarefa.id, tarefa.trecho);
  }

  function colar(e: ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    if (desabilitado) return;
    posicaoCursor.current = { inicio: e.currentTarget.selectionStart, fim: e.currentTarget.selectionEnd };
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    const arquivos = Array.from(e.clipboardData.files).filter((arquivo) => SUPPORTED.includes(arquivo.type));
    let trechos: TrechoColado[] = html ? lerHtmlColado(html) : [];
    const imagensHtml = trechos.filter((t) => t.tipo === "imagem");
    let posicaoDesconhecida = false;

    if (imagensHtml.length && imagensHtml.length === arquivos.length) {
      // Quando há correspondência 1:1, aproveita os bytes do clipboard
      // nas posições indicadas pelas tags <img> do HTML.
      let i = 0;
      trechos = trechos.map((trecho) => trecho.tipo === "imagem" ? { ...trecho, arquivo: arquivos[i++] } : trecho);
    } else if (!imagensHtml.length) {
      if (!trechos.length && plain) trechos = [{ tipo: "texto", texto: plain }];
      if (arquivos.length) {
        posicaoDesconhecida = trechos.some((t) => t.tipo === "texto" && t.texto.trim().length > 0);
        // A origem não fornece a posição em HTML: os marcadores seguem o texto colado.
        trechos.push(...arquivos.map((arquivo) => ({ tipo: "imagem" as const, arquivo })));
      }
    } else if (arquivos.length !== imagensHtml.length) {
      // Não associar arquivos a posições arbitrárias quando a quantidade não bate.
      // As imagens do HTML serão carregadas usando seus próprios src.
      posicaoDesconhecida = arquivos.length > 0;
    }

    inserirTrechos(trechos);
    if (posicaoDesconhecida && trechos.length && anexosRef.current.length <= MAX_IMAGES) {
      onErro("A área de transferência não informou a posição de todas as imagens. Os marcadores foram incluídos conforme os dados disponíveis; revise a ordem antes de analisar.");
    }
  }

  function removerAnexo(id: number) {
    if (desabilitado) return;
    const atual = textoRef.current;
    const token = marcador(id);
    // Remove o marcador e uma quebra de linha opcional em cada extremidade.
    atualizarTexto(atual.replaceAll(`\n${token}\n`, "\n").replaceAll(token, ""));
    atualizarAnexos(anexosRef.current.filter((a) => a.id !== id));
    onErro("");
  }

  function recolocarMarcador(id: number) {
    if (desabilitado) return;
    if (!anexosRef.current.some((a) => a.id === id)) return;
    inserirNoCursor(`\n${marcador(id)}\n`);
  }

  function selecionarArquivos(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files || []).filter((f) => SUPPORTED.includes(f.type));
    if (arquivos.length) inserirTrechos(arquivos.map((arquivo) => ({ tipo: "imagem", arquivo })));
    e.target.value = "";
  }

  function soltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    if (desabilitado) return;
    const arquivos = Array.from(e.dataTransfer.files).filter((f) => SUPPORTED.includes(f.type));
    if (arquivos.length) {
      // Arrastar arquivos não indica uma posição no texto; utiliza o cursor salvo.
      inserirTrechos(arquivos.map((arquivo) => ({ tipo: "imagem", arquivo })));
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="label !mb-0" htmlFor="conteudo">Descrição ou apontamento</label>
        <span className="text-xs text-slate-500">{texto.length.toLocaleString("pt-BR")} caracteres · {anexos.length}/{MAX_IMAGES} anexos</span>
      </div>
      <div className={`rounded-xl ${arrastando ? "ring-2 ring-cyan-300" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={soltar}>
        <textarea
          ref={textareaRef}
          id="conteudo"
          value={texto}
          disabled={desabilitado}
          onChange={(e) => { atualizarTexto(e.currentTarget.value); guardarCursor(); }}
          onPaste={colar}
          onSelect={guardarCursor}
          onClick={guardarCursor}
          onKeyUp={guardarCursor}
          className="field min-h-[315px] max-h-[650px] resize-y whitespace-pre-wrap font-mono text-[13px] leading-6"
          placeholder="Cole aqui o histórico do Seven Suite com Ctrl+V. As imagens serão anexadas separadamente e marcadas no texto como [Imagem #1], mantendo a ordem original quando ela estiver disponível na cópia."
          aria-label="Descrição ou apontamento: texto com marcadores de imagens anexadas"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={selecionarArquivos} disabled={desabilitado} aria-label="Anexar print na posição do cursor" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()} disabled={desabilitado || anexos.length >= MAX_IMAGES} className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-40">
          <ImagePlus size={15} /> Anexar imagem na posição do cursor
        </button>
        <p className="text-xs text-slate-500">Ctrl+V aceita texto + prints ou apenas um print.</p>
      </div>

      {anexos.length > 0 && (
        <section className="mt-5 rounded-xl border border-white/10 bg-[#091829] p-3" aria-label="Prints anexados">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Paperclip size={16} /> Prints anexados ({anexos.length})</h3>
            <span className="text-xs text-slate-500">Cada print corresponde ao marcador no histórico</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {anexos.map((anexo) => {
              const noTexto = texto.includes(marcador(anexo.id));
              return (
                <article key={anexo.id} className="min-w-0 rounded-lg border border-white/10 bg-[#101f31] p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cyan-200">Imagem #{anexo.id}</p>
                      <p className="truncate text-xs text-slate-400" title={anexo.nome}>{anexo.nome}</p>
                    </div>
                    <button type="button" onClick={() => removerAnexo(anexo.id)} disabled={desabilitado} aria-label={`Remover imagem #${anexo.id}`} title="Remover este anexo e seu marcador" className="rounded p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 size={16} /></button>
                  </div>
                  {anexo.status === "pronto" && anexo.dataUrl ? (
                    <img src={anexo.dataUrl} alt={`Pré-visualização da imagem #${anexo.id}`} className="h-36 w-full rounded-lg border border-white/10 bg-slate-950 object-contain" />
                  ) : anexo.status === "carregando" ? (
                    <div className="flex h-36 items-center justify-center gap-2 rounded-lg bg-[#071321] text-xs text-slate-300"><Loader2 size={17} className="animate-spin" /> Preparando imagem…</div>
                  ) : (
                    <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg bg-red-500/5 p-3 text-center text-xs text-red-200"><AlertTriangle size={20} /><span>Imagem indisponível</span><span className="text-red-200/70">{anexo.erro}</span></div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                    <span className={noTexto ? "text-emerald-300" : "text-amber-300"}>{noTexto ? "Marcador localizado no texto" : "Sem marcador no texto"}</span>
                    {!noTexto && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => recolocarMarcador(anexo.id)} disabled={desabilitado} className="flex items-center gap-1 text-cyan-200 hover:text-cyan-100 disabled:opacity-50"><RotateCcw size={13} /> Inserir no cursor</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">As imagens não ficam dentro do campo. O marcador [Imagem #N] indica onde a IA receberá o anexo correspondente. Se o Seven Suite fornecer apenas links privados ou não indicar a posição dos prints, o sistema avisará para revisão. Não envie credenciais ou dados sensíveis.</p>
    </div>
  );
});

export default DossieEditor;
