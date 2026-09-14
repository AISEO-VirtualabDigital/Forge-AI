/**
 * src/modules/wordpress/index.ts
 * ------------------------------
 * Barrel export for the WordPress connector module.
 *
 * - `plugin/`     → the PHP plugin files (distributed for upload to WP sites)
 * - `scoring.ts`  → in-memory Yoast readability + RankMath focus-keyword engine
 * - `index.ts`    → this barrel
 *
 * Usage:
 *   import { computeUnifiedScore } from "@/modules/wordpress";
 */

export {
  computeYoastReadability,
  computeRankMath,
  computeUnifiedScore,
  type YoastReadabilityResult,
  type YoastReadabilityCheck,
  type RankMathResult,
  type RankMathCheck,
  type UnifiedSeoScore,
} from "./scoring";
