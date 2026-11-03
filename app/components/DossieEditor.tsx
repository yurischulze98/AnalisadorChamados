"use client";

import { ChangeEvent, ClipboardEvent, DragEvent, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

export type ParteDossie =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; nome: string; dataUrl: string };

export type EstatisticasDossie = {
  caracteres: number;
  imagens: number;
  pendentes: number;
  tamanhoImagens: number;
};

export type DossieEditorHandle = {
  obterPartes: () => ParteDossie[];
  limpar: () => void;
};

export const MAX_IMAGES = 8;
export const MAX_TOTAL_IMAGE_CHARS = 3_000_000;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const SUPPORTED = ["image/png", "image/jpeg", "image/webp"];

type TrechoColado = { tipo: "texto"; texto: string } | { tipo: "imagem"; src?: string; arquivo?: File; nome?: string };
type ItemPendente = { elemento: HTMLSpanElement; trecho: Extract<TrechoColado, { tipo: "imagem" }> };

function toDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

async function otimizarImagem(blob: Blob): Promise<string> {
  if (!SUPPORTED.includes(blob.type)) throw new Error("Use imagens PNG, JPG ou WebP.");
  if (blob.size > MAX_FILE_BYTES) throw new Error("Uma imagem ultrapassa 12 MB antes da otimização.");
  if (blob.size <= 500_000) return toDataUrl(blob);

  const url = URL.createObjectURL(blob);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const maiorDimensao = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    if (!maiorDimensao) throw new Error("Imagem inválida.");

    function converter(maxDimension: number, quality: number): string {
      const scale = Math.min(1, maxDimension / maiorDimensao);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(imagem.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(imagem.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("O navegador não conseguiu converter a imagem.");
      ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
      const webp = canvas.toDataURL("image/webp", quality);
      return webp.startsWith("data:image/webp;base64,") ? webp : canvas.toDataURL("image/jpeg", quality);
    }

    let data = converter(1800, 0.9);
    if (data.length > 1_000_000) data = converter(1400, 0.83);
    if (data.length > 1_000_000) data = converter(1100, 0.78);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function carregarImagem(trecho: Extract<TrechoColado, { tipo: "imagem" }>): Promise<string> {
  if (trecho.arquivo) return otimizarImagem(trecho.arquivo);
  const src = trecho.src?.trim() || "";
  if (!src) throw new Error("A imagem copiada não contém dados acessíveis.");

  if (/^data:image\/(png|jpeg|webp);base64,/i.test(src)) {
    const response = await fetch(src);
    return otimizarImagem(await response.blob());
  }
  // Somente o navegador procura a imagem: o servidor não busca URLs arbitrárias.
  // Imagens protegidas do CRM podem ser bloqueadas por CORS/autenticação.
  if (/^https?:\/\//i.test(src)) {
    const url = new URL(src);
    const response = await fetch(url.toString(), {
      credentials: url.origin === window.location.origin ? "same-origin" : "omit",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Não foi possível abrir a imagem (HTTP ${response.status}).`);
    const blob = await response.blob();
    return otimizarImagem(blob);
  }
  throw new Error("O endereço da imagem é privado ou não pode ser acessado pelo navegador.");
}

// Converte o HTML copiado para TEXTO + IMAGENS na ordem do documento original.
// Não insere HTML de terceiros diretamente no editor (evita scripts e estilos do CRM).
function lerHtmlColado(html: string): TrechoColado[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result: TrechoColado[] = [];
  const blockTags = new Set(["DIV", "P", "SECTION", "ARTICLE", "HEADER", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TR", "BLOCKQUOTE", "PRE", "UL", "OL", "TABLE"]);
  const ignorar = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "VIDEO", "AUDIO", "HEAD", "META", "LINK"]);

  const texto = (valor: string) => {
    if (!valor) return;
    const anterior = result[result.length - 1];
    if (anterior?.tipo === "texto") anterior.texto += valor;
    else result.push({ tipo: "texto", texto: valor });
  };
  const quebrarLinha = () => {
    if (!result.length) return;
    const ultimo = result[result.length - 1];
    if (ultimo.tipo === "texto" && ultimo.texto.endsWith("\n")) return;
    texto("\n");
  };

  function visitar(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      texto((node.textContent || "").replace(/\u00a0/g, " "));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (ignorar.has(el.tagName)) return;
    if (el.tagName === "BR") { quebrarLinha(); return; }
    if (el.tagName === "IMG") {
      result.push({ tipo: "imagem", src: el.getAttribute("src") || el.getAttribute("data-src") || "", nome: el.getAttribute("alt") || undefined });
      return;
    }
    if (el.tagName === "HR") { quebrarLinha(); return; }
    if (blockTags.has(el.tagName)) quebrarLinha();
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName === "TD" && child !== el.firstElementChild) texto("\t");
      visitar(child);
    }
    if (blockTags.has(el.tagName)) quebrarLinha();
  }
  for (const child of Array.from(doc.body.childNodes)) visitar(child);

  // Remove só os separadores extras criados pela conversão; não troca a ordem do conteúdo.
  if (result[0]?.tipo === "texto") result[0].texto = result[0].texto.replace(/^\n+/, "");
  if (result[result.length - 1]?.tipo === "texto") {
    const ultimo = result[result.length - 1] as Extract<TrechoColado, { tipo: "texto" }>;
    ultimo.texto = ultimo.texto.replace(/\n+$/, "");
  }
  return result.filter((p) => p.tipo === "imagem" || p.texto.length > 0);
}

function partesDoEditor(editor: HTMLDivElement): ParteDossie[] {
  const partes: ParteDossie[] = [];
  function texto(valor: string) {
    if (!valor) return;
    const ultimo = partes[partes.length - 1];
    if (ultimo?.tipo === "texto") ultimo.texto += valor;
    else partes.push({ tipo: "texto", texto: valor });
  }
  function quebra() {
    const ultimo = partes[partes.length - 1];
    if (ultimo?.tipo === "texto" && ultimo.texto.endsWith("\n")) return;
    if (partes.length > 0) texto("\n");
  }
  function visitar(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { texto(node.textContent || ""); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === "IMG" && el.dataset.inlineDossie === "true") {
      partes.push({ tipo: "imagem", nome: el.dataset.nomeImagem || "Imagem colada", dataUrl: (el as HTMLImageElement).src });
      return;
    }
    if (el.dataset.imagemPendente === "true") return;
    if (el.tagName === "BR") { quebra(); return; }
    const bloco = ["DIV", "P", "LI", "SECTION", "BLOCKQUOTE"].includes(el.tagName);
    if (bloco) quebra();
    for (const child of Array.from(el.childNodes)) visitar(child);
    if (bloco) quebra();
  }
  for (const child of Array.from(editor.childNodes)) visitar(child);
  if (partes[0]?.tipo === "texto") partes[0].texto = partes[0].texto.replace(/^\n+/, "");
  if (partes[partes.length - 1]?.tipo === "texto") {
    (partes[partes.length - 1] as Extract<ParteDossie, { tipo: "texto" }>).texto = (partes[partes.length - 1] as Extract<ParteDossie, { tipo: "texto" }>).texto.replace(/\n+$/, "");
  }
  return partes.filter((item) => item.tipo === "imagem" || item.texto.length > 0);
}

const DossieEditor = forwardRef<DossieEditorHandle, {
  desabilitado: boolean;
  onEstatisticas: (stats: EstatisticasDossie) => void;
  onErro: (erro: string) => void;
}>(function DossieEditor({ desabilitado, onEstatisticas, onErro }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ultimaSelecao = useRef<Range | null>(null);
  const pendentesRef = useRef(0);
  const [arrastando, setArrastando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [estatisticas, setEstatisticas] = useState<EstatisticasDossie>({ caracteres: 0, imagens: 0, pendentes: 0, tamanhoImagens: 0 });

  function atualizarEstatisticas() {
    const editor = editorRef.current;
    if (!editor) return;
    const partes = partesDoEditor(editor);
    const dados: EstatisticasDossie = {
      caracteres: partes.reduce((s, p) => s + (p.tipo === "texto" ? p.texto.length : 0), 0),
      imagens: partes.filter((p) => p.tipo === "imagem").length,
      pendentes: pendentesRef.current,
      tamanhoImagens: partes.reduce((s, p) => s + (p.tipo === "imagem" ? p.dataUrl.length : 0), 0),
    };
    setEstatisticas(dados);
    onEstatisticas(dados);
  }

  useImperativeHandle(ref, () => ({
    obterPartes: () => editorRef.current ? partesDoEditor(editorRef.current) : [],
    limpar: () => {
      if (editorRef.current) editorRef.current.replaceChildren();
      ultimaSelecao.current = null;
      atualizarEstatisticas();
    },
  }));

  function guardarSelecao() {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (editor && sel?.rangeCount && editor.contains(sel.anchorNode)) ultimaSelecao.current = sel.getRangeAt(0).cloneRange();
  }

  function inserirFragmento(fragmento: DocumentFragment) {
    const editor = editorRef.current;
    if (!editor) return;
    const selecao = window.getSelection();
    const atual = selecao?.rangeCount ? selecao.getRangeAt(0) : null;
    const range = (atual && editor.contains(atual.commonAncestorContainer) ? atual :
      ultimaSelecao.current && editor.contains(ultimaSelecao.current.commonAncestorContainer) ? ultimaSelecao.current : null)?.cloneRange() || document.createRange();
    if (!atual && !ultimaSelecao.current) { range.selectNodeContents(editor); range.collapse(false); }
    else if (!editor.contains(range.commonAncestorContainer)) { range.selectNodeContents(editor); range.collapse(false); }

    const ultimo = fragmento.lastChild;
    range.deleteContents();
    range.insertNode(fragmento);
    if (ultimo) range.setStartAfter(ultimo);
    range.collapse(true);
    selecao?.removeAllRanges();
    selecao?.addRange(range);
    ultimaSelecao.current = range.cloneRange();
    atualizarEstatisticas();
  }

  async function processarImagens(itens: ItemPendente[]) {
    if (!itens.length) return;
    pendentesRef.current += itens.length;
    setPreparando(true);
    atualizarEstatisticas();
    let problemas = 0;
    for (const { elemento, trecho } of itens) {
      try {
        const dataUrl = await carregarImagem(trecho);
        const editor = editorRef.current;
        if (!editor || !editor.contains(elemento)) continue;
        const jaCarregados = partesDoEditor(editor).filter((p) => p.tipo === "imagem");
        const total = jaCarregados.reduce((sum, p) => sum + p.dataUrl.length, 0);
        if (total + dataUrl.length > MAX_TOTAL_IMAGE_CHARS) throw new Error("Limite de tamanho das imagens atingido.");
        const image = document.createElement("img");
        image.src = dataUrl;
        image.dataset.inlineDossie = "true";
        image.dataset.nomeImagem = (trecho.nome || trecho.arquivo?.name || "Captura do chamado").slice(0, 150);
        image.alt = image.dataset.nomeImagem;
        image.contentEditable = "false";
        image.className = "imagem-dossie";
        elemento.replaceWith(image);
      } catch (err) {
        problemas++;
        const descricao = err instanceof Error ? err.message : "não foi possível ler a imagem";
        // O aviso fica dentro do dossiê na posição da imagem faltante: não perde o contexto.
        elemento.replaceWith(document.createTextNode(`[Imagem não importada: ${descricao}]`));
      } finally {
        pendentesRef.current -= 1;
        atualizarEstatisticas();
      }
    }
    setPreparando(false);
    if (problemas) onErro(`${problemas} imagem(ns) não puderam ser importadas. Confira os avisos no texto. Prints protegidos do CRM podem exigir copiar a imagem diretamente ou fazer uma captura de tela.`);
  }

  function inserirTrechos(trechos: TrechoColado[]) {
    if (desabilitado || preparando) return;
    const existentes = editorRef.current?.querySelectorAll('img[data-inline-dossie="true"], [data-imagem-pendente="true"]').length || 0;
    const novos = trechos.filter((t) => t.tipo === "imagem").length;
    if (existentes + novos > MAX_IMAGES) {
      onErro(`A análise aceita até ${MAX_IMAGES} imagens. A colagem foi cancelada para evitar perda de evidências. Remova imagens ou copie um trecho menor.`);
      return;
    }
    if (!trechos.length) return;
    onErro("");
    const fragmento = document.createDocumentFragment();
    const pendentes: ItemPendente[] = [];
    for (const trecho of trechos) {
      if (trecho.tipo === "texto") fragmento.appendChild(document.createTextNode(trecho.texto));
      else {
        const elemento = document.createElement("span");
        elemento.dataset.imagemPendente = "true";
        elemento.contentEditable = "false";
        elemento.className = "imagem-pendente";
        elemento.textContent = "⏳ Preparando imagem copiada…";
        fragmento.appendChild(elemento);
        pendentes.push({ elemento, trecho });
      }
    }
    inserirFragmento(fragmento);
    void processarImagens(pendentes);
  }

  function colar(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    if (desabilitado || preparando) return;
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    const arquivos = Array.from(e.clipboardData.files).filter((f) => SUPPORTED.includes(f.type));
    let trechos: TrechoColado[] = html ? lerHtmlColado(html) : [];
    const imagensHtml = trechos.filter((p) => p.tipo === "imagem");

    if (imagensHtml.length) {
      // Clipboard com HTML + arquivos: os arquivos contêm os pixels reais do print.
      // A associação por posição só é possível quando as quantidades são equivalentes.
      if (arquivos.length === imagensHtml.length) {
        let i = 0;
        trechos = trechos.map((p) => p.tipo === "imagem" ? { ...p, arquivo: arquivos[i++] } : p);
      }
    } else {
      if (!trechos.length && plain) trechos = [{ tipo: "texto", texto: plain }];
      if (arquivos.length) {
        // Algumas origens não informam onde estava o <img> no HTML do clipboard.
        trechos.push(...arquivos.map((arquivo) => ({ tipo: "imagem" as const, arquivo })));
      }
    }
    const posicaoNaoInformada = imagensHtml.length === 0 && arquivos.length > 0 &&
      trechos.some((p) => p.tipo === "texto" && p.texto.trim());
    inserirTrechos(trechos);
    if (posicaoNaoInformada) onErro("A origem não informou a posição dos prints. Eles foram colocados após o texto; confira a sequência antes de analisar.");
  }

  function arquivosSelecionados(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files || []);
    if (arquivos.length) inserirTrechos(arquivos.map((arquivo) => ({ tipo: "imagem", arquivo })));
    e.target.value = "";
  }

  function soltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    inserirTrechos(Array.from(e.dataTransfer.files).filter((file) => SUPPORTED.includes(file.type)).map((arquivo) => ({ tipo: "imagem", arquivo })));
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="label !mb-0" htmlFor="conteudo">Descrição ou apontamento</label>
        <span className="text-xs text-slate-500">{estatisticas.caracteres.toLocaleString("pt-BR")} caracteres · {estatisticas.imagens}/{MAX_IMAGES} imagens{estatisticas.pendentes ? ` · ${estatisticas.pendentes} carregando` : ""}</span>
      </div>
      <div className={`relative rounded-xl ${arrastando ? "ring-2 ring-cyan-300" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={soltar}>
        <div
          id="conteudo"
          ref={editorRef}
          role="textbox"
          aria-label="Descrição ou apontamento com texto e imagens na sequência original"
          aria-multiline="true"
          contentEditable={!desabilitado && !preparando}
          suppressContentEditableWarning
          data-placeholder="Cole aqui o histórico completo do Seven Suite (Ctrl+V). Textos e imagens aparecerão na ordem original, quando fornecida pela área de transferência."
          className="field dossie-editavel min-h-[310px] max-h-[650px] overflow-y-auto whitespace-pre-wrap break-words leading-6"
          onPaste={colar}
          onInput={atualizarEstatisticas}
          onKeyUp={guardarSelecao}
          onMouseUp={guardarSelecao}
          onFocus={guardarSelecao}
          onBlur={guardarSelecao}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={arquivosSelecionados} disabled={desabilitado || preparando} aria-label="Inserir prints na posição do cursor" />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()} disabled={desabilitado || preparando || estatisticas.imagens >= MAX_IMAGES} className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-400/20 disabled:opacity-40">
            {preparando ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {preparando ? "Preparando imagens..." : "Inserir imagem no cursor"}
          </button>
          <span className="text-xs text-slate-500">Cole tudo de uma vez ou insira prints entre os apontamentos.</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Confira se os prints aparecem dentro do histórico. O envio à IA ocorre apenas ao clicar em Analisar. Não inclua senhas ou dados sensíveis.</p>
    </div>
  );
});

export default DossieEditor;
