/**
 * src/modules/wordpress/scoring.ts
 * --------------------------------
 * In-memory SEO scoring engine that replicates the core readability + focus-
 * keyword checks from Yoast SEO and Rank Math.
 *
 * This is the "serverless-ready, in-memory" bridge: it computes the same
 * matrices the WordPress plugins would, but WITHOUT requiring the PHP plugin
 * to be installed on the target site. Forge AI uses this to:
 *   1. Score the active canvas content before pushing to WordPress.
 *   2. Show the user exactly what Yoast/RankMath will flag.
 *   3. Optionally push the computed metrics alongside the content so the WP
 *      site's SEO plugin panel is pre-populated.
 *
 * Zero filesystem access. Zero LLM calls. Deterministic. Edge-compatible.
 */

import type { Block, SeoConfig } from "@/lib/types";

// ---------------------------------------------------------------------------
// Yoast readability matrix
// ---------------------------------------------------------------------------

export interface YoastReadabilityCheck {
  id: string;
  label: string;
  status: "good" | "ok" | "bad";
  score: number; // 0-9 per check (Yoast uses a 0-9 internal scale)
  detail: string;
}

export interface YoastReadabilityResult {
  score: number; // 0-100 normalized
  grade: "A" | "B" | "C" | "D" | "F";
  fleschReadingEase: number;
  checks: YoastReadabilityCheck[];
}

const TRANSITION_WORDS = [
  // Yoast's published transition-word list (subset — covers English essentials).
  "above all", "additionally", "after all", "afterward", "afterwards",
  "albeit", "although", "and", "another possibility", "as a result", "as an illustration",
  "as a matter of fact", "as well as", "aside from", "at any rate", "at first",
  "at least", "at once", "at the present time", "at the same time", "at this point",
  "balanced against", "basically", "because", "because of", "before",
  "besides", "but", "by all means", "by and large", "by comparison",
  "by the same token", "by the time", "certainly", "chiefly", "comparatively",
  "concurrently", "consequently", "contrarily", "conversely", "correspondingly",
  "coupled with", "despite", "differing from", "doubtless", "due to",
  "during", "e.g.", "either way", "equally", "especially",
  "even if", "even more", "even so", "even though", "eventually",
  "evidently", "finally", "first", "first of all", "for example",
  "for fear that", "for instance", "for one thing", "for that reason", "for the purpose of",
  "for the most part", "for the present", "for the time being", "furthermore", "generally",
  "given that", "given these points", "hence", "here and there", "however",
  "if", "if not", "if so", "in addition", "in any case",
  "in any event", "in comparison", "in conclusion", "in contrast", "in due time",
  "in effect", "in essence", "in fact", "in general", "in order that",
  "in order to", "in other words", "in particular", "in reality", "in short",
  "in similar fashion", "in spite of", "in sum", "in summary", "in that case",
  "in the end", "in the event that", "in the final analysis", "in the first place", "in the fourth place",
  "in the hope that", "in the long run", "in the meantime", "in the same way", "in the second place",
  "in the third place", "in truth", "in view of", "inasmuch as", "indeed",
  "instead", "last", "lastly", "later", "lest",
  "likewise", "made up of", "meantime", "meanwhile", "moreover",
  "most important", "most of all", "namely", "neither", "nevertheless",
  "next", "nor", "not to mention", "notwithstanding", "of course",
  "on account of", "on condition that", "on one hand", "on the contrary", "on the other hand",
  "on the positive side", "on the whole", "once", "once in a while", "only if",
  "or", "otherwise", "overall", "owing to", "particularly",
  "plus", "provided that", "rather", "regardless", "second",
  "secondly", "shortly", "similarly", "simultaneously", "since",
  "so", "so as to", "so long as", "sooner or later", "specifically",
  "still", "subsequently", "such as", "summing up", "supposing",
  "surely", "than", "that is", "that is to say", "then",
  "thereafter", "thereby", "therefore", "thereupon", "third",
  "thirdly", "though", "thus", "till", "to begin with",
  "to conclude", "to enumerate", "to illustrate", "to put it differently", "to return to the subject",
  "to say nothing of", "to sum up", "to summarize", "to that end", "to the end",
  "too", "undeniably", "under those circumstances", "undoubtedly", "unless",
  "until", "until now", "up against", "up to the present time", "vis a vis",
  "what's more", "when", "whenever", "whereas", "while",
  "with attention to", "with the result that", "with this in mind", "yet",
];

const PASSIVE_INDICATORS = [
  " is ", " are ", " was ", " were ", " be ", " been ", " being ",
  " have been ", " has been ", " had been ", " will be ", " can be ",
  " could be ", " should be ", " would be ", " must be ", " may be ",
  " might be ", " shall be ", " ought to be ",
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const groups = word.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function fleschReadingEase(text: string): number {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function detectPassiveVoice(sentence: string): boolean {
  const lower = ` ${sentence.toLowerCase()} `;
  // Passive voice heuristic: forms of "to be" + past participle (-ed).
  for (const indicator of PASSIVE_INDICATORS) {
    if (lower.includes(indicator)) {
      // Check if followed by a past participle within the next few words.
      const after = lower.split(indicator)[1];
      if (after && /\b\w+ed\b/.test(after.slice(0, 30))) return true;
    }
  }
  return false;
}

function countTransitionWords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const word of TRANSITION_WORDS) {
    // Word-boundary match for multi-word phrases.
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = lower.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export function computeYoastReadability(blocks: Block[]): YoastReadabilityResult {
  const content = extractText(blocks);
  const sentences = splitSentences(content);
  const words = content.split(/\s+/).filter(Boolean);
  const paragraphs = blocks.filter((b) => b.type === "paragraph");
  const flesch = fleschReadingEase(content);

  const checks: YoastReadabilityCheck[] = [];

  // 1. Flesch Reading Ease
  let fleschStatus: "good" | "ok" | "bad" = "bad";
  let fleschScore = 3;
  if (flesch >= 60) { fleschStatus = "good"; fleschScore = 9; }
  else if (flesch >= 30) { fleschStatus = "ok"; fleschScore = 6; }
  checks.push({
    id: "flesch",
    label: "Flesch Reading Ease",
    status: fleschStatus,
    score: fleschScore,
    detail: `Score ${flesch} — ${
      flesch >= 60 ? "easy to read" : flesch >= 30 ? "fairly difficult" : "very difficult"
    }`,
  });

  // 2. Sentence length (>20 words = too long; Yoast flags if >25% are long)
  if (sentences.length > 0) {
    const longSentences = sentences.filter((s) => s.split(/\s+/).length > 20);
    const pct = (longSentences.length / sentences.length) * 100;
    const status = pct < 25 ? "good" : pct < 35 ? "ok" : "bad";
    const score = pct < 25 ? 9 : pct < 35 ? 6 : 3;
    checks.push({
      id: "sentence-length",
      label: "Sentence length",
      status,
      score,
      detail: `${longSentences.length}/${sentences.length} sentences exceed 20 words (${Math.round(pct)}%)`,
    });
  }

  // 3. Passive voice
  if (sentences.length > 0) {
    const passive = sentences.filter(detectPassiveVoice);
    const pct = (passive.length / sentences.length) * 100;
    const status = pct < 10 ? "good" : pct < 15 ? "ok" : "bad";
    const score = pct < 10 ? 9 : pct < 15 ? 6 : 3;
    checks.push({
      id: "passive-voice",
      label: "Passive voice",
      status,
      score,
      detail: `${passive.length}/${sentences.length} sentences use passive voice (${Math.round(pct)}%)`,
    });
  }

  // 4. Transition words (Yoast wants >30% of sentences to start with one)
  if (sentences.length > 0) {
    const withTransitions = sentences.filter((s) => {
      const firstWord = s.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
      return TRANSITION_WORDS.some((tw) => firstWord.includes(tw));
    });
    const pct = (withTransitions.length / sentences.length) * 100;
    const status = pct >= 30 ? "good" : pct >= 20 ? "ok" : "bad";
    const score = pct >= 30 ? 9 : pct >= 20 ? 6 : 3;
    checks.push({
      id: "transition-words",
      label: "Transition words",
      status,
      score,
      detail: `${withTransitions.length}/${sentences.length} sentences start with a transition word (${Math.round(pct)}%)`,
    });
  }

  // 5. Paragraph length (Yoast flags >150 words)
  if (paragraphs.length > 0) {
    const longParagraphs = paragraphs.filter(
      (p) => (p.props.text ?? "").split(/\s+/).filter(Boolean).length > 150,
    );
    const status = longParagraphs.length === 0 ? "good" : longParagraphs.length < paragraphs.length / 2 ? "ok" : "bad";
    const score = longParagraphs.length === 0 ? 9 : longParagraphs.length < paragraphs.length / 2 ? 6 : 3;
    checks.push({
      id: "paragraph-length",
      label: "Paragraph length",
      status,
      score,
      detail: `${longParagraphs.length}/${paragraphs.length} paragraphs exceed 150 words`,
    });
  }

  // 6. Consecutive sentences starting with the same word
  if (sentences.length >= 2) {
    let repeats = 0;
    for (let i = 1; i < sentences.length; i++) {
      const prevFirst = sentences[i - 1].split(/\s+/)[0]?.toLowerCase();
      const currFirst = sentences[i].split(/\s+/)[0]?.toLowerCase();
      if (prevFirst && currFirst && prevFirst === currFirst && prevFirst.length > 2) {
        repeats++;
      }
    }
    const status = repeats === 0 ? "good" : repeats <= 2 ? "ok" : "bad";
    const score = repeats === 0 ? 9 : repeats <= 2 ? 6 : 3;
    checks.push({
      id: "consecutive-sentences",
      label: "Consecutive sentences",
      status,
      score,
      detail: `${repeats} consecutive sentence pairs start with the same word`,
    });
  }

  // 7. Subheading distribution (Yoast wants a heading every ~300 words)
  const headings = blocks.filter((b) => b.type === "heading").length;
  const expectedHeadings = Math.max(1, Math.ceil(words.length / 300));
  if (words.length > 300) {
    const status = headings >= expectedHeadings ? "good" : headings >= expectedHeadings - 1 ? "ok" : "bad";
    const score = headings >= expectedHeadings ? 9 : headings >= expectedHeadings - 1 ? 6 : 3;
    checks.push({
      id: "subheading-distribution",
      label: "Subheading distribution",
      status,
      score,
      detail: `${headings} headings for ${words.length} words (expected ~${expectedHeadings})`,
    });
  }

  // Aggregate.
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.length * 9;
  const normalized = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const grade: YoastReadabilityResult["grade"] =
    normalized >= 80 ? "A" : normalized >= 70 ? "B" : normalized >= 60 ? "C" : normalized >= 50 ? "D" : "F";

  return { score: normalized, grade, fleschReadingEase: flesch, checks };
}

// ---------------------------------------------------------------------------
// RankMath focus-keyword matrix
// ---------------------------------------------------------------------------

export interface RankMathCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  points: number; // RankMath uses points out of 100 total
  detail: string;
}

export interface RankMathResult {
  score: number; // 0-100
  checks: RankMathCheck[];
  keywordDensity: number;
}

function extractText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    const p = b.props;
    switch (b.type) {
      case "hero":
        parts.push(p.badge ?? "", p.text ?? "", p.subtitle ?? "", p.ctaText ?? "");
        break;
      case "heading":
      case "paragraph":
      case "quote":
      case "card":
      case "cta":
        parts.push(p.text ?? "", p.title ?? "", p.subtitle ?? "", p.author ?? "", p.ctaText ?? "");
        break;
      case "features":
        (p.features ?? []).forEach((f) => parts.push(f.title, f.desc));
        break;
      case "image":
        parts.push(p.alt ?? "");
        break;
      case "nav":
      case "footer":
        parts.push(p.brand ?? "");
        (p.links ?? []).forEach((l) => parts.push(l.label));
        break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const lower = haystack.toLowerCase();
  const k = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = lower.indexOf(k, idx)) !== -1) {
    count++;
    idx += k.length;
  }
  return count;
}

export function computeRankMath(blocks: Block[], seo: SeoConfig): RankMathResult {
  const keyword = (seo.focusKeyword ?? "").trim();
  const content = extractText(blocks);
  const words = content.split(/\s+/).filter(Boolean);
  const checks: RankMathCheck[] = [];

  // 1. Focus keyword in title (15 pts)
  const inTitle = keyword ? seo.title.toLowerCase().includes(keyword.toLowerCase()) : false;
  checks.push({
    id: "kw-in-title",
    label: "Focus keyword in the SEO title",
    status: !keyword ? "warn" : inTitle ? "pass" : "fail",
    points: inTitle ? 15 : 0,
    detail: inTitle ? `Found "${keyword}" in the title` : "Add the keyword to your title",
  });

  // 2. Focus keyword in meta description (10 pts)
  const inDesc = keyword ? seo.description.toLowerCase().includes(keyword.toLowerCase()) : false;
  checks.push({
    id: "kw-in-meta-desc",
    label: "Focus keyword in meta description",
    status: !keyword ? "warn" : inDesc ? "pass" : "fail",
    points: inDesc ? 10 : 0,
    detail: inDesc ? "Found in meta description" : "Add to meta description",
  });

  // 3. Focus keyword in URL/slug (10 pts)
  const slug = (seo.canonical ?? "").split("/").pop() ?? "";
  const inUrl = keyword ? slug.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, "-")) : false;
  checks.push({
    id: "kw-in-url",
    label: "Focus keyword in URL",
    status: !keyword ? "warn" : inUrl ? "pass" : "fail",
    points: inUrl ? 10 : 0,
    detail: inUrl ? "Found in URL" : "Add to the permalink slug",
  });

  // 4. Focus keyword in first paragraph (10 pts)
  const firstParagraph = blocks.find((b) => b.type === "paragraph" || b.type === "hero");
  const firstParaText = firstParagraph ? (firstParagraph.props.text ?? firstParagraph.props.subtitle ?? "") : "";
  const inFirstPara = keyword ? firstParaText.toLowerCase().includes(keyword.toLowerCase()) : false;
  checks.push({
    id: "kw-in-first-para",
    label: "Focus keyword in first paragraph",
    status: !keyword ? "warn" : inFirstPara ? "pass" : "fail",
    points: inFirstPara ? 10 : 0,
    detail: inFirstPara ? "Found in the first paragraph" : "Add to the opening paragraph",
  });

  // 5. Focus keyword in content (10 pts)
  const inContent = keyword ? content.toLowerCase().includes(keyword.toLowerCase()) : false;
  checks.push({
    id: "kw-in-content",
    label: "Focus keyword in content",
    status: !keyword ? "warn" : inContent ? "pass" : "fail",
    points: inContent ? 10 : 0,
    detail: inContent ? "Found in the content body" : "Not found in content",
  });

  // 6. Focus keyword in subheadings (10 pts)
  const headingBlocks = blocks.filter((b) => b.type === "heading" || b.type === "hero");
  const inHeadings = keyword
    ? headingBlocks.some((b) =>
        (b.props.text ?? "").toLowerCase().includes(keyword.toLowerCase()),
      )
    : false;
  checks.push({
    id: "kw-in-headings",
    label: "Focus keyword in subheadings",
    status: !keyword ? "warn" : inHeadings ? "pass" : "fail",
    points: inHeadings ? 10 : 0,
    detail: inHeadings ? "Found in a heading" : "Add to an H2/H3",
  });

  // 7. Focus keyword in image alt (10 pts)
  const images = blocks.filter((b) => b.type === "image");
  const inImageAlt = keyword
    ? images.some((b) => (b.props.alt ?? "").toLowerCase().includes(keyword.toLowerCase()))
    : false;
  checks.push({
    id: "kw-in-image-alt",
    label: "Focus keyword in image alt",
    status: !keyword ? "warn" : images.length === 0 ? "warn" : inImageAlt ? "pass" : "fail",
    points: inImageAlt ? 10 : 0,
    detail: images.length === 0 ? "No images on the page" : inImageAlt ? "Found in alt text" : "Add to an image alt",
  });

  // 8. Keyword density (RankMath wants 1-1.5%)
  let density = 0;
  if (keyword && words.length > 0) {
    const occurrences = countOccurrences(content, keyword);
    density = (occurrences / words.length) * 100;
  }
  checks.push({
    id: "kw-density",
    label: "Keyword density",
    status: !keyword ? "warn" : density >= 0.5 && density <= 2.5 ? "pass" : "warn",
    points: density >= 0.5 && density <= 2.5 ? 5 : 0,
    detail: keyword ? `${density.toFixed(1)}% density` : "No focus keyword set",
  });

  // 9. Content length (10 pts: >=600 words pass, >=300 partial)
  checks.push({
    id: "content-length",
    label: "Content length",
    status: words.length >= 600 ? "pass" : words.length >= 300 ? "warn" : "fail",
    points: words.length >= 600 ? 10 : words.length >= 300 ? 5 : 0,
    detail: `${words.length} words`,
  });

  // 10. Title length (RankMath wants 40-60 chars)
  checks.push({
    id: "title-length",
    label: "Title length",
    status: seo.title.length >= 40 && seo.title.length <= 60 ? "pass" : seo.title.length > 0 ? "warn" : "fail",
    points: seo.title.length >= 40 && seo.title.length <= 60 ? 5 : 0,
    detail: `${seo.title.length} chars`,
  });

  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const score = Math.min(100, totalPoints);

  return { score, checks, keywordDensity: density };
}

// ---------------------------------------------------------------------------
// Combined unified result
// ---------------------------------------------------------------------------

export interface UnifiedSeoScore {
  yoast: YoastReadabilityResult;
  rankmath: RankMathResult;
  combined: number; // weighted average
  contentText: string;
}

export function computeUnifiedScore(blocks: Block[], seo: SeoConfig): UnifiedSeoScore {
  const yoast = computeYoastReadability(blocks);
  const rankmath = computeRankMath(blocks, seo);
  // RankMath is keyword-focused (40%); Yoast readability is 60%.
  const combined = Math.round(rankmath.score * 0.4 + yoast.score * 0.6);
  return {
    yoast,
    rankmath,
    combined,
    contentText: extractText(blocks),
  };
}
