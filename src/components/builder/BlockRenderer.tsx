"use client";

import * as React from "react";
import {
  PanelTop,
  Sparkles,
  Heading,
  AlignLeft,
  MousePointerClick,
  Image as ImageIcon,
  RectangleHorizontal,
  LayoutGrid,
  Quote,
  Megaphone,
  Minus,
  MoveVertical,
  PanelBottom,
  type LucideIcon,
} from "lucide-react";
import type { Block, BlockType } from "@/lib/types";

export const ICONS: Record<string, LucideIcon> = {
  PanelTop,
  Sparkles,
  Heading,
  AlignLeft,
  MousePointerClick,
  Image: ImageIcon,
  RectangleHorizontal,
  LayoutGrid,
  Quote,
  Megaphone,
  Minus,
  MoveVertical,
  PanelBottom,
};

function alignClass(align?: string): string {
  return align === "center"
    ? "text-center"
    : align === "right"
    ? "text-right"
    : "text-left";
}

function styleClass(b: Block): string {
  return [
    b.style.background,
    b.style.padding,
    b.style.rounded,
    b.style.extraClass,
    alignClass(b.style.align),
  ]
    .filter(Boolean)
    .join(" ");
}

export function BlockRenderer({ block }: { block: Block }) {
  const p = block.props;
  const cls = styleClass(block);

  switch (block.type) {
    case "nav":
      return (
        <nav className={`flex items-center justify-between ${cls}`}>
          <span className="font-bold text-lg">{p.brand}</span>
          <div className="hidden sm:flex gap-6">
            {(p.links ?? []).map((l, i) => (
              <a
                key={i}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </div>
        </nav>
      );

    case "hero":
      return (
        <section className={cls}>
          {p.badge ? (
            <span className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {p.badge}
            </span>
          ) : null}
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {p.text}
          </h1>
          {p.subtitle ? (
            <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              {p.subtitle}
            </p>
          ) : null}
          {p.ctaText ? (
            <a
              href={p.ctaHref ?? "#"}
              className="mt-8 inline-flex items-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
            >
              {p.ctaText}
            </a>
          ) : null}
        </section>
      );

    case "heading": {
      const Tag = `h${p.level ?? 2}` as keyof React.JSX.IntrinsicElements;
      const size =
        p.level === 1
          ? "text-4xl"
          : p.level === 2
          ? "text-3xl"
          : p.level === 3
          ? "text-2xl"
          : "text-xl";
      return (
        <Tag className={`font-bold tracking-tight ${size} ${cls}`}>
          {p.text}
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p className={`text-muted-foreground leading-relaxed ${cls}`}>
          {p.text}
        </p>
      );

    case "button": {
      const variants: Record<string, string> = {
        primary: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border",
        ghost: "hover:bg-accent",
      };
      return (
        <div className={cls}>
          <a
            href={p.href ?? "#"}
            className={`inline-flex items-center px-5 py-2.5 rounded-lg font-medium ${variants[p.variant ?? "primary"]}`}
          >
            {p.text}
          </a>
        </div>
      );
    }

    case "image":
      return (
        <div className={cls}>
          <img
            src={p.src}
            alt={p.alt ?? ""}
            className="max-w-full h-auto rounded-lg"
          />
        </div>
      );

    case "card":
      return (
        <div className={cls}>
          {p.title ? <h3 className="font-semibold text-lg">{p.title}</h3> : null}
          {p.text ? (
            <p className="text-muted-foreground mt-2">{p.text}</p>
          ) : null}
        </div>
      );

    case "features":
      return (
        <section className={cls}>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {(p.features ?? []).map((f, i) => (
              <div key={i} className="p-6 rounded-xl border bg-card">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case "quote":
      return (
        <blockquote className={`border-l-4 pl-4 italic text-lg ${cls}`}>
          {p.text}
          {p.author ? (
            <footer className="mt-2 text-sm text-muted-foreground not-italic">
              — {p.author}
            </footer>
          ) : null}
        </blockquote>
      );

    case "cta":
      return (
        <section className={cls}>
          <h2 className="text-2xl font-bold">{p.text}</h2>
          {p.ctaText ? (
            <a
              href={p.ctaHref ?? "#"}
              className="mt-6 inline-flex items-center px-6 py-3 rounded-lg bg-background text-foreground font-medium"
            >
              {p.ctaText}
            </a>
          ) : null}
        </section>
      );

    case "divider":
      return <hr className={cls} />;

    case "spacer":
      return <div className={cls} aria-hidden="true" />;

    case "footer":
      return (
        <footer className={cls}>
          <div className="flex items-center justify-between max-w-5xl mx-auto flex-wrap gap-4">
            <span className="font-semibold">{p.brand}</span>
            <span className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {p.copyright}
            </span>
            <div className="flex gap-4">
              {(p.links ?? []).map((l, i) => (
                <a
                  key={i}
                  href={l.href}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      );

    default:
      return null;
  }
}

export function BlockTypeIcon({ type }: { type: BlockType }) {
  const Icon = ICONS[type === "image" ? "Image" : type] ?? RectangleHorizontal;
  return <Icon className="h-4 w-4" />;
}
