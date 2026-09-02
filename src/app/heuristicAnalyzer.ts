/**
 * Phase 6 — evidence-backed heuristic analyzer.
 *
 * This is the local analysis engine (used in demo/offline mode and as the
 * fallback when the server-side LLM provider is unavailable). It extracts
 * research structure ONLY from text that actually appears in the document:
 * every concept, claim, method, result, dataset, experiment and limitation it
 * emits points at a verbatim sentence with a page, section and chunk id.
 *
 * It never fabricates. If a sentence doesn't match a pattern, nothing is
 * produced for it. Confidence reflects how strong the textual signal is, and
 * weak items are flagged `uncertain` for downstream handling.
 */

import type { DocumentChunkOut, NormalizedDoc } from "./pipeline";
import { UNCERTAIN_THRESHOLD, type ChunkCandidates, type EvidenceReference } from "./analysisSchemas";

/* ================= text utilities ================= */

const PROTECT: [RegExp, string][] = [
  [/\be\.g\./gi, "e§g"],
  [/\bi\.e\./gi, "i§e"],
  [/\bet al\./gi, "et§al"],
  [/\bvs\./gi, "vs§"],
  [/\bFig\./g, "Fig§"],
  [/\bFigs\./g, "Figs§"],
  [/\bEq\./g, "Eq§"],
  [/\bDr\./g, "Dr§"],
  [/\bapprox\./gi, "approx§"],
];

function splitSentences(raw: string): string[] {
  let text = raw.replace(/\s+/g, " ").trim();
  for (const [re, rep] of PROTECT) text = text.replace(re, rep);
  const out: string[] = [];
  const re = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m[0]
      .replace(/§/g, ".")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length >= 25 && s.length <= 700 && /[a-zA-Z]{3,}/.test(s)) out.push(s);
  }
  return out;
}

function excerptOf(sentence: string, max = 240): string {
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + "…" : sentence;
}

const STOPWORDS = new Set(
  "a,an,the,and,or,but,if,then,else,of,to,in,on,for,with,by,from,as,at,is,are,was,were,be,been,being,have,has,had,do,does,did,this,that,these,those,it,its,we,our,they,their,them,he,she,his,her,you,your,i,me,my,not,no,so,such,can,may,might,must,shall,should,would,could,will,which,who,whom,whose,what,when,where,why,how,than,also,into,over,under,between,among,through,during,before,after,above,below,each,per,via,using,use,used,uses,both,all,any,some,more,most,other,however,thus,hence,therefore,here,there,within,without,about,against,based,shown,shows,show,using,based,number,figure,table,section,paper,study,studies,result,results,method,methods,approach,approaches,model,models,data,dataset".split(","),
);

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
}

function isStop(w: string): boolean {
  return STOPWORDS.has(w);
}

/* ================= pattern dictionaries ================= */

const CLAIM_PATTERNS: RegExp[] = [
  /\bwe (show|demonstrate|find|prove|argue|establish|observe|report)\b/i,
  /\bour (results?|findings?|analysis) (show|suggest|indicate|reveal)\b/i,
  /\bwe (propose|present|introduce|develop|design)\b/i,
  /\bthis (paper|work|study) (presents?|proposes?|introduces?|shows?|demonstrates?)\b/i,
  /\bis (superior|better|worse|effective|ineffective|robust|consistent) (to|with|across)\b/i,
  /\bsignificantly (outperforms?|improves?|exceeds?|reduces?)\b/i,
];

const METHOD_KEYWORDS =
  /\b(gradient descent|backpropagation|stochastic|optimizer|adam|sgd|neural network|convolutional|recurrent|transformer|attention|regression|classification|clustering|reinforcement learning|bayesian|monte carlo|cross-validation|fine-tun\w*|pre-train\w*|embedding|spectroscop\w*|chromatograph\w*|pcr|crispr|f?mri|eeg|cohort|randomized|longitudinal|survey|interview|case stud\w*|simulation|finite element|spectral|fourier|kalman|filter\w*|heuristic|algorithm)\b/i;

const MODEL_KEYWORDS =
  /\b(resnet|bert|gpt|vit|vision transformer|yolo|unet|lstm|gru|gan|autoencoder|diffusion|mlp|cnn|rnn|xgboost|random forest|svm|llm|large language model)\b/i;

const DATASET_KEYWORDS = /\b(dataset|benchmark|corpus|cohort|database|repository|biobank|registry|test set|training set)\b/i;

const RESULT_KEYWORDS =
  /\b(accuracy|precision|recall|f1|auc|bleu|rouge|error rate|improve\w*|outperform\w*|achieve[sd]?|increase[sd]?|decrease[sd]?|reduc\w*|correlat\w*|significant|p\s*[<>=]|r\s*=\s*\d|odds ratio|hazard ratio|effect size|variance explained)\b/i;

const LIMITATION_KEYWORDS =
  /\b(limitation|caveat|shortcoming|future work|we do not|does not address|restricted to|small sample|underpowered|cannot|unable to|beyond the scope|not generaliz\w*|remain\w* unknown)\b/i;

const PROBLEM_KEYWORDS = /\b(problem|challenge|gap|remains unclear|little is known|limited|lack of|poorly understood|difficult|open question)\b/i;

const EXPERIMENT_KEYWORDS = /\b(experiment|ablation|we evaluate|we test|we compare|trial|protocol|condition|baseline|control group)\b/i;

/* ================= concept term mining ================= */

const CONCEPT_KIND: [RegExp, string][] = [
  [/\b(network|model|architecture|algorithm|framework|method|technique)\b/i, "technique"],
  [/\b(theory|hypothesis|principle|law|mechanism)\b/i, "theory"],
  [/\b(effect|phenomenon|process|behavior|dynamics|response)\b/i, "phenomenon"],
  [/\b(metric|score|measure|index|rate|accuracy)\b/i, "metric"],
  [/\b(disease|disorder|condition|syndrome|cell|protein|gene|neuron)\b/i, "biomedical"],
];

function inferKind(term: string): string {
  for (const [re, kind] of CONCEPT_KIND) if (re.test(term)) return kind;
  return "concept";
}

function mineConcepts(
  sentences: string[],
  maxConcepts: number,
): { name: string; kind: string; sentence: string; score: number }[] {
  const freq = new Map<string, { count: number; sentence: string; capitalized: boolean; len: number }>();

  for (const s of sentences) {
    const toks = words(s);
    const grams: { gram: string; len: number; capitalized: boolean }[] = [];
    for (let i = 0; i < toks.length; i += 1) {
      if (!isStop(toks[i])) grams.push({ gram: toks[i], len: 1, capitalized: false });
      if (i + 1 < toks.length && !isStop(toks[i]) && !isStop(toks[i + 1])) {
        grams.push({ gram: `${toks[i]} ${toks[i + 1]}`, len: 2, capitalized: false });
      }
    }
    for (const g of grams) {
      if (g.gram.length < 4) continue;
      const entry = freq.get(g.gram);
      if (entry) entry.count += 1;
      else freq.set(g.gram, { count: 1, sentence: s, capitalized: g.capitalized, len: g.len });
    }
  }

  // Prefer longer grams; suppress unigrams fully covered by an accepted bigram.
  const ranked = [...freq.entries()]
    .filter(([, v]) => v.count >= 2 || v.len === 2)
    .map(([name, v]) => ({
      name,
      sentence: v.sentence,
      score: v.count * (v.len === 2 ? 2.2 : 1) + name.length / 40,
    }))
    .sort((a, b) => b.score - a.score);

  const picked: typeof ranked = [];
  for (const cand of ranked) {
    if (picked.length >= maxConcepts) break;
    const covered = picked.some((p) => p.name.includes(cand.name) || cand.name.includes(p.name));
    if (!covered) picked.push(cand);
  }
  return picked.map((p) => ({ ...p, kind: inferKind(p.name) }));
}

/* ================= confidence ================= */

function confidence(base: number, inAbstract: boolean, patternHits: number): number {
  let c = base + patternHits * 0.12 + (inAbstract ? 0.1 : 0);
  return Math.min(0.95, Math.max(0.1, Math.round(c * 100) / 100));
}

/* ================= the extractor ================= */

export function extractChunkCandidates(chunk: DocumentChunkOut, doc: NormalizedDoc): ChunkCandidates {
  const sentences = splitSentences(chunk.text);
  const section = chunk.section;
  const page = chunk.page_start;
  const inAbstract = /abstract/i.test(section) || chunk.kind === "front";
  const inConclusion = /conclusion|discussion/i.test(section);
  const inLimitations = /limitation|future work/i.test(section);
  const inMethods = /method|methodology|materials|approach|experimental/i.test(section);
  const inResults = /result|experiment|evaluation|findings/i.test(section);

  const ev = (sentence: string): EvidenceReference => ({
    excerpt: excerptOf(sentence),
    page,
    section,
    chunk_id: chunk.chunk_id,
  });

  let researchQuestion: string | null = null;
  let mainProblem: string | null = null;
  let conclusion: string | null = null;

  const claims: ChunkCandidates["claims"] = [];
  const methods: ChunkCandidates["methods"] = [];
  const results: ChunkCandidates["results"] = [];
  const datasets: ChunkCandidates["datasets"] = [];
  const experiments: ChunkCandidates["experiments"] = [];
  const limitations: ChunkCandidates["limitations"] = [];

  for (const s of sentences) {
    /* research question: interrogatives / explicit investigation statements */
    if (!researchQuestion && (inAbstract || chunk.kind === "front" || /introduction/i.test(section))) {
      if (/\?\s*$/.test(s) || /\bwe (investigate|ask|examine|study whether|explore)\b/i.test(s)) {
        researchQuestion = s;
      }
    }

    /* main problem */
    if (!mainProblem && PROBLEM_KEYWORDS.test(s) && (inAbstract || /introduction/i.test(section) || chunk.kind === "front")) {
      mainProblem = s;
    }

    /* conclusion */
    if (!conclusion && inConclusion && /\b(conclude|summarize|in summary|taken together|overall|our results)\b/i.test(s)) {
      conclusion = s;
    }

    /* limitations */
    if (LIMITATION_KEYWORDS.test(s) && (inLimitations || LIMITATION_KEYWORDS.test(s))) {
      limitations.push({
        type: "limitation",
        text: s,
        evidence: [ev(s)],
        confidence: confidence(0.5, inAbstract, inLimitations ? 2 : 1),
        uncertain: false,
      });
    }

    /* claims */
    const claimHits = CLAIM_PATTERNS.filter((re) => re.test(s)).length;
    if (claimHits > 0) {
      claims.push({
        type: "claim",
        text: s,
        kind: claimHits >= 2 || inAbstract ? "central" : "supporting",
        evidence: [ev(s)],
        confidence: confidence(0.45, inAbstract, claimHits),
        uncertain: false,
      });
    }

    /* methods / models */
    const isModel = MODEL_KEYWORDS.test(s);
    if ((inMethods || METHOD_KEYWORDS.test(s) || isModel) && (METHOD_KEYWORDS.test(s) || isModel)) {
      const nameMatch = s.match(MODEL_KEYWORDS) ?? s.match(METHOD_KEYWORDS);
      methods.push({
        type: isModel ? "model" : "method",
        name: nameMatch ? nameMatch[0] : excerptOf(s, 60),
        description: s,
        evidence: [ev(s)],
        confidence: confidence(0.5, false, inMethods ? 2 : 1),
        uncertain: false,
      });
    }

    /* datasets */
    if (DATASET_KEYWORDS.test(s)) {
      const capMatch = s.match(/\b([A-Z][A-Za-z0-9-]*(?:\s[A-Z][A-Za-z0-9-]*){0,3})\b(?=(?:\sdataset|\sbenchmark|\scorpus|\scohort|\sdatabase))/);
      const name = capMatch ? capMatch[1] : excerptOf(s, 60);
      datasets.push({
        type: "dataset",
        name,
        description: s,
        evidence: [ev(s)],
        confidence: confidence(0.45, false, capMatch ? 2 : 1),
        uncertain: false,
      });
    }

    /* experiments */
    if (EXPERIMENT_KEYWORDS.test(s) && (inMethods || inResults)) {
      experiments.push({
        type: "experiment",
        name: excerptOf(s, 90),
        description: s,
        evidence: [ev(s)],
        confidence: confidence(0.45, false, 1),
        uncertain: false,
      });
    }

    /* results: quantitative statements */
    if (RESULT_KEYWORDS.test(s) && /\d/.test(s) && (inResults || inAbstract || inConclusion)) {
      const metricMatch =
        s.match(/(\d+(?:\.\d+)?\s?%)/) ??
        s.match(/(p\s*[<>=]\s*0?\.\d+)/i) ??
        s.match(/(r\s*=\s*-?\d+(?:\.\d+)?)/i);
      results.push({
        type: "result",
        statement: s,
        metric: metricMatch ? metricMatch[1] : null,
        evidence: [ev(s)],
        confidence: confidence(0.5, inAbstract, metricMatch ? 2 : 1),
        uncertain: false,
      });
    }
  }

  /* concepts: term-mined, each tied to a real sentence */
  const mined = mineConcepts(sentences, 8);
  const concepts: ChunkCandidates["concepts"] = mined.map((c) => ({
    name: c.name,
    type: "concept",
    kind: c.kind,
    explanation: c.sentence,
    evidence: [ev(c.sentence)],
    confidence: confidence(0.4, inAbstract, c.score > 4 ? 2 : 1),
    uncertain: false,
  }));

  /* mark anything weak as uncertain (downstream may omit) */
  const flag = <T extends { confidence: number; uncertain: boolean }>(arr: T[]): T[] =>
    arr.map((x) => ({ ...x, uncertain: x.confidence < UNCERTAIN_THRESHOLD }));

  return {
    chunk_id: chunk.chunk_id,
    researchQuestion,
    mainProblem,
    conclusion,
    concepts: flag(concepts),
    claims: flag(claims),
    methods: flag(methods),
    results: flag(results),
    datasets: flag(datasets),
    experiments: flag(experiments),
    limitations: flag(limitations),
  };
}

export { splitSentences };
