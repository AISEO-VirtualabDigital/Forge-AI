import type { Block, EeatAnalysis, EeatCheck, EeatDimension, SeoConfig } from "./types";
import { extractContentText } from "./seo";

// Heuristic detection helpers.

const FIRST_PERSON_RE =
  /\b(i|i'?m|i'?ll|i'?ve|me|my|mine|we|we'?re|we'?ll|us|our|ours|myself|ourselves)\b/gi;

const CITATION_RE =
  /\b(according to|source:|as reported by|study by|research by|per (?:the )?\w+|et al\.?|see also|via|ref\.?)\b/gi;

const CONTACT_RE =
  /\b(contact|email|e-mail|@|phone|tel|reach us|get in touch|support@|hello@|info@)\b/gi;

const ABOUT_RE =
  /\b(about us|about the author|our team|our story|who we are|our mission|our company)\b/gi;

const DISCLAIMER_RE =
  /\b(disclaimer|affiliate|terms|privacy policy|no warranty|at your own risk|consult a professional|not (?:financial|medical|legal) advice)\b/gi;

const DATE_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|\b20\d{2}\b|last updated|published on|updated on|posted on)\b/gi;

const EXTERNAL_URL_RE = /https?:\/\/(?!(?:localhost|127\.0\.0\.1|example\.(com|org)))/gi;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

function hasMatch(text: string, re: RegExp): boolean {
  return re.test(text);
}

export function analyzeEeat(blocks: Block[], seo: SeoConfig): EeatAnalysis {
  const content = extractContentText(blocks);
  const lower = content.toLowerCase();

  // Collect existing external links + nav/footer links.
  const externalLinks: { text: string; href: string; blockId: string }[] = [];
  for (const b of blocks) {
    const candidates: string[] = [];
    if (b.props.href) candidates.push(b.props.href);
    if (b.props.ctaHref) candidates.push(b.props.ctaHref);
    if (Array.isArray(b.props.links)) {
      for (const l of b.props.links) candidates.push(l.href);
    }
    for (const href of candidates) {
      if (/^https?:\/\//i.test(href) && !/example\.(com|org)/i.test(href)) {
        externalLinks.push({ text: "", href, blockId: b.id });
      }
    }
  }

  const firstPersonCount = countMatches(lower, FIRST_PERSON_RE);
  const citationCount = countMatches(lower, CITATION_RE);
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  const hasAuthorBio = !!seo.author && seo.author.trim().length > 1 && seo.author !== "Forge Team";
  const hasContactInfo = hasMatch(lower, CONTACT_RE);
  const hasAboutMention = hasMatch(lower, ABOUT_RE);
  const hasFirstPerson = firstPersonCount >= 3;
  const hasCitations = citationCount >= 1;
  const hasHttps = /^https:\/\//i.test(seo.canonical);
  const hasSchema =
    !!seo.jsonLd.trim() && /"@type"/i.test(seo.jsonLd);
  const hasDates = hasMatch(lower, DATE_RE);
  const hasDisclaimers = hasMatch(lower, DISCLAIMER_RE);
  const hasExternalLinks = externalLinks.length > 0;

  // Content depth: a rough signal combining word count + heading structure.
  const headingCount = blocks.filter((b) => b.type === "heading").length;
  const contentDepthScore = Math.min(
    100,
    Math.round((wordCount / 600) * 60 + Math.min(headingCount, 6) * 6.67),
  );

  const checks: EeatCheck[] = [];

  // ----- Experience -----
  checks.push({
    id: "first-person",
    dimension: "experience",
    label: "Uses first-person voice (I/we)",
    status: firstPersonCount >= 5 ? "pass" : firstPersonCount >= 2 ? "warn" : "fail",
    detail:
      firstPersonCount === 0
        ? "No first-person language detected."
        : `${firstPersonCount} first-person pronouns found.`,
    weight: 8,
  });
  checks.push({
    id: "case-study",
    dimension: "experience",
    label: "Shows real examples / case studies",
    status: hasAboutMention ? "pass" : "warn",
    detail: hasAboutMention
      ? "About/team context found."
      : "Add a case study, example, or about section.",
    weight: 6,
  });
  checks.push({
    id: "dates",
    dimension: "experience",
    label: "Shows content freshness / dates",
    status: hasDates ? "pass" : "warn",
    detail: hasDates
      ? "Dates or 'last updated' markers detected."
      : "Add a 'last updated' date to show freshness.",
    weight: 5,
  });

  // ----- Expertise -----
  checks.push({
    id: "content-depth",
    dimension: "expertise",
    label: "Content depth (≥600 words + headings)",
    status: contentDepthScore >= 70 ? "pass" : contentDepthScore >= 35 ? "warn" : "fail",
    detail: `${wordCount} words, ${headingCount} headings.`,
    weight: 9,
  });
  checks.push({
    id: "author-bio",
    dimension: "expertise",
    label: "Named author with credentials",
    status: hasAuthorBio ? "pass" : "warn",
    detail: hasAuthorBio
      ? `Author: ${seo.author}`
      : "Set a specific author name (not a generic team).",
    weight: 7,
  });
  checks.push({
    id: "citations",
    dimension: "expertise",
    label: "Cites sources / research",
    status: hasCitations ? "pass" : "warn",
    detail: hasCitations
      ? `${citationCount} citation markers found.`
      : "Reference studies, sources, or 'according to…'.",
    weight: 6,
  });

  // ----- Authoritativeness -----
  checks.push({
    id: "schema",
    dimension: "authoritativeness",
    label: "Structured data (schema.org)",
    status: hasSchema ? "pass" : "warn",
    detail: hasSchema ? "JSON-LD structured data present." : "Add JSON-LD (Article/Organization).",
    weight: 7,
  });
  checks.push({
    id: "external-links",
    dimension: "authoritativeness",
    label: "Links to authoritative external sources",
    status: externalLinks.length >= 2 ? "pass" : externalLinks.length === 1 ? "warn" : "fail",
    detail: `${externalLinks.length} external link(s) found.`,
    weight: 6,
  });
  checks.push({
    id: "about-page",
    dimension: "authoritativeness",
    label: "About / team / company context",
    status: hasAboutMention ? "pass" : "warn",
    detail: hasAboutMention ? "About/team reference detected." : "Add an about section or link.",
    weight: 5,
  });

  // ----- Trustworthiness -----
  checks.push({
    id: "https",
    dimension: "trustworthiness",
    label: "HTTPS canonical URL",
    status: hasHttps ? "pass" : "fail",
    detail: hasHttps ? "Canonical URL uses HTTPS." : "Use an HTTPS canonical URL.",
    weight: 7,
  });
  checks.push({
    id: "contact",
    dimension: "trustworthiness",
    label: "Contact information present",
    status: hasContactInfo ? "pass" : "warn",
    detail: hasContactInfo ? "Contact info detected." : "Add contact details or a contact link.",
    weight: 6,
  });
  checks.push({
    id: "privacy",
    dimension: "trustworthiness",
    label: "Privacy / disclaimer / terms",
    status: hasDisclaimers ? "pass" : "warn",
    detail: hasDisclaimers
      ? "Privacy / disclaimer language detected."
      : "Add a privacy policy or disclaimer link.",
    weight: 5,
  });
  checks.push({
    id: "og-complete",
    dimension: "trustworthiness",
    label: "Complete Open Graph identity",
    status: seo.ogTitle && seo.ogDescription && seo.ogImage
      ? "pass"
      : "warn",
    detail:
      seo.ogTitle && seo.ogDescription && seo.ogImage
        ? "OG title, description and image set."
        : "Complete OG tags for trustworthy sharing.",
    weight: 4,
  });

  // Per-dimension scoring.
  const dims: EeatDimension[] = [
    "experience",
    "expertise",
    "authoritativeness",
    "trustworthiness",
  ];
  const dimensions = {} as EeatAnalysis["dimensions"];
  const labels: Record<EeatDimension, { label: string; description: string }> = {
    experience: {
      label: "Experience",
      description: "First-hand experience signals: first-person voice, real examples, freshness.",
    },
    expertise: {
      label: "Expertise",
      description: "Demonstrable knowledge: content depth, named author, citations.",
    },
    authoritativeness: {
      label: "Authoritativeness",
      description: "Recognized authority: schema, external citations, about/brand presence.",
    },
    trustworthiness: {
      label: "Trustworthiness",
      description: "Trust signals: HTTPS, contact info, privacy, complete identity.",
    },
  };

  let totalScore = 0;
  let totalWeight = 0;
  for (const d of dims) {
    const dimChecks = checks.filter((c) => c.dimension === d);
    const w = dimChecks.reduce((s, c) => s + c.weight, 0);
    const earned = dimChecks.reduce((s, c) => {
      if (c.status === "pass") return s + c.weight;
      if (c.status === "warn") return s + c.weight * 0.5;
      return s;
    }, 0);
    const dscore = w > 0 ? Math.round((earned / w) * 100) : 0;
    dimensions[d] = { score: dscore, ...labels[d] };
    totalScore += earned;
    totalWeight += w;
  }

  const score = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;

  return {
    score,
    dimensions,
    checks,
    contentText: content,
    signals: {
      hasAuthorBio,
      hasContactInfo,
      hasAboutMention,
      hasFirstPerson,
      hasCitations,
      hasHttps,
      hasSchema,
      hasDates,
      hasDisclaimers,
      hasExternalLinks,
      firstPersonCount,
      citationCount,
      contentDepthScore,
    },
  };
}

export const DEFAULT_EEAT_TIPS: string[] = [
  "Add an author byline with credentials at the top of the article.",
  "Reference at least 2-3 authoritative external sources.",
  "Include a 'Last updated' date to signal content freshness.",
  "Add a visible contact or support link in the footer.",
  "Use first-person voice ('we built…', 'in our experience…') to convey hands-on experience.",
];
