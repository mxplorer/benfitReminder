#!/usr/bin/env node
/**
 * One-shot cleanup for the Task 9.5 migration bug.
 *
 * Bug: Phase 1 bootstrap ran while built-in templates didn't yet have
 * templateBenefitId, so it set b.templateBenefitId = undefined. Phase 2 then
 * treated all template benefits as "added", duplicating every benefit.
 *
 * This script:
 *   1. For each card, partitions benefits into withId vs withoutId
 *   2. Loads the matching built-in template
 *   3. For every "new empty" benefit (withId): merges usageRecords from
 *      same-named "old" benefits (withoutId)
 *   4. Same-named old benefits are then dropped
 *   5. Old benefits whose names don't match the template are preserved as
 *      custom (templateBenefitId field removed cleanly)
 *
 * Run modes:
 *   node cleanup-duplicate-benefits.mjs             # dry-run, prints diff summary
 *   node cleanup-duplicate-benefits.mjs --write     # writes data.json
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(homedir(), "Library/Application Support/com.ccb.app/data.json");
const TEMPLATES_DIR = join(__dirname, "..", "src/assets/card-types");

const WRITE = process.argv.includes("--write");

/** Custom benefits to drop entirely (cardSlug → set of benefit names). */
const DROP_CUSTOM = new Map([
  ["chase_hyatt", new Set(["5 Tier-Qualifying Nights"])],
]);

const loadTemplates = () => {
  const map = new Map();
  for (const file of readdirSync(TEMPLATES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const tmpl = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), "utf8"));
    map.set(tmpl.slug, tmpl);
  }
  return map;
};

const cleanCard = (card, templates) => {
  const tmpl = templates.get(card.cardTypeSlug);
  if (!tmpl) return { card, log: [`  [skip] no template for ${card.cardTypeSlug}`] };

  const withId = card.benefits.filter((b) => b.templateBenefitId);
  const withoutId = card.benefits.filter((b) => !b.templateBenefitId);

  // Group "old" benefits by name so duplicates collapse together
  const oldByName = new Map();
  for (const b of withoutId) {
    const list = oldByName.get(b.name) ?? [];
    list.push(b);
    oldByName.set(b.name, list);
  }

  const templateNames = new Set(tmpl.defaultBenefits.map((t) => t.name));
  const log = [];

  // Merge: for each "new empty" benefit, pull usageRecords from same-named olds
  const merged = withId.map((nb) => {
    const olds = oldByName.get(nb.name);
    if (!olds || olds.length === 0) {
      log.push(`  [keep-new] ${nb.name} (no old match)`);
      return nb;
    }
    const usageRecords = olds.flatMap((o) => o.usageRecords ?? []);
    log.push(
      `  [merge] ${nb.name} ← ${olds.length} old (${usageRecords.length} usage records)`,
    );
    oldByName.delete(nb.name);
    return { ...nb, usageRecords };
  });

  // Anything left in oldByName has no name match in the template → real custom
  const dropSet = DROP_CUSTOM.get(card.cardTypeSlug) ?? new Set();
  const customs = [];
  for (const [name, olds] of oldByName) {
    if (templateNames.has(name)) {
      // Should not happen — templateNames matches and we already merged
      log.push(`  [WARN] template has "${name}" but merge skipped it`);
    }
    if (dropSet.has(name)) {
      const usage = olds.reduce((sum, o) => sum + (o.usageRecords?.length ?? 0), 0);
      log.push(`  [drop-custom] ${name} (${olds.length} entries, ${usage} usage records)`);
      continue;
    }
    for (const o of olds) {
      // Strip the null templateBenefitId so it serializes cleanly
      const { templateBenefitId, ...rest } = o;
      customs.push(rest);
      log.push(`  [keep-custom] ${name}`);
    }
  }

  return {
    card: { ...card, benefits: [...merged, ...customs] },
    log,
  };
};

const main = () => {
  const templates = loadTemplates();
  const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));

  const cleanedCards = [];
  let totalUsageBefore = 0;
  let totalUsageAfter = 0;

  for (const card of data.cards) {
    const before = card.benefits.reduce((sum, b) => sum + (b.usageRecords?.length ?? 0), 0);
    totalUsageBefore += before;

    const { card: cleaned, log } = cleanCard(card, templates);
    cleanedCards.push(cleaned);

    const after = cleaned.benefits.reduce((sum, b) => sum + (b.usageRecords?.length ?? 0), 0);
    totalUsageAfter += after;

    console.log(
      `\n${card.cardTypeSlug} (${card.id.slice(0, 8)})  ${card.benefits.length} → ${cleaned.benefits.length} benefits, usage ${before} → ${after}`,
    );
    for (const line of log) console.log(line);
  }

  console.log(`\n=== TOTALS ===`);
  console.log(`Cards: ${data.cards.length}`);
  console.log(`Usage records before: ${totalUsageBefore}`);
  console.log(`Usage records after: ${totalUsageAfter}`);
  if (totalUsageBefore !== totalUsageAfter) {
    console.log(`!!! USAGE RECORD COUNT DIFFERS — INVESTIGATE BEFORE WRITING !!!`);
  }

  if (WRITE) {
    const output = { ...data, cards: cleanedCards };
    writeFileSync(DATA_PATH, JSON.stringify(output, null, 2) + "\n");
    console.log(`\n✓ Wrote ${DATA_PATH}`);
  } else {
    console.log(`\n(dry-run — re-run with --write to apply)`);
  }
};

main();
