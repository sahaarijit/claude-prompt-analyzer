---
description: "Reopen an existing prompt analysis report. Zero LLM cost. Supports: latest, today, yesterday, DD-MM-YYYY, and trend."
---

Reopen an existing analysis report.

**Write scope (strict):** Do NOT re-run analysis. Do NOT write to `state.json`, `prompts.md`, `metrics.json`, `analysis.md`, or `consolidated.html`. The ONLY file this command may write is the per-date `reports/{DD-MM-YYYY}/report.html` (lazy generation when an explicit date is requested and that file does not yet exist; see Step 3).

## Behavior Rules (MUST OBEY)

- **DO NOT ask the user any questions.** Not about which date, not about which format, not about anything.
- **DO NOT offer options or choices.** If the argument is empty, default to latest; do not prompt the user to pick.
- **DO NOT stop for confirmation.** Resolve the target, read the file, emit the dashboard.
- If the requested report does not exist, print the nearest-dates line defined in Step 3 and stop silently. Do not ask "want me to analyze it instead?"

**Invocations:**
- `/prompt-analyzer:view` - most recent date in `~/prompt-analysis/reports/`
- `/prompt-analyzer:view today` - today in DD-MM-YYYY
- `/prompt-analyzer:view yesterday` - yesterday in DD-MM-YYYY
- `/prompt-analyzer:view <DD-MM-YYYY>` - explicit date, e.g., `21-04-2026`
- `/prompt-analyzer:view trend` - 7-day composite history inline; no file link

---

## Step 1: Resolve target date

Run the following, replacing `<ARGUMENT>` with everything after `/prompt-analyzer:view` (empty string for bare invocation).

Note: with `node -e "..." -- arg`, the argument lands at `process.argv[2]` (index 2), not 1.

```bash
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const arg = (process.argv[2] || '').trim();
const reportsDir = path.join(os.homedir(), 'prompt-analysis', 'reports');
function fmt(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return dd + '-' + mm + '-' + d.getFullYear();
}
let target;
if (!arg || arg === 'latest') {
  const dirs = fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir)
        .filter(n => /^\d{2}-\d{2}-\d{4}$/.test(n) &&
          fs.existsSync(path.join(reportsDir, n, 'analysis.md')))
        .sort()
    : [];
  target = dirs.length ? dirs[dirs.length - 1] : null;
} else if (arg === 'today') {
  target = fmt(new Date());
} else if (arg === 'yesterday') {
  target = fmt(new Date(Date.now() - 86400000));
} else if (arg === 'trend') {
  target = 'trend';
} else if (/^\d{2}-\d{2}-\d{4}$/.test(arg)) {
  target = arg;
} else {
  target = null;
}
console.log(target || 'NONE');
" -- <ARGUMENT>
```

- Output `NONE`: print `No analysis yet. Run /prompt-analyzer:analyze first.` and stop.
- Output `trend`: proceed to Step 2.
- Anything else: that is `targetDate`; proceed to Step 3.

---

## Step 2: Trend view (only when argument is "trend")

Read `~/prompt-analysis/reports/state.json`. Extract `scores.dailyScores` - last 7 entries sorted ascending.

For each entry, build a 5-score trailing sparkline using the last 5 scores up to that entry; left-pad with `▁` if fewer than 5 available. Map each score with `Math.round((S / 10) * 7)` -> index into `['▁','▂','▃','▄','▅','▆','▇','█']`.

Print:
```
### 📈 7-Day Composite Score Trend

| Date         | Score | Trend       |
|--------------|-------|-------------|
| DD-MM-YYYY   | X.X   | ▁▂▃▄▅ →     |
| ...          | ...   | ...         |

7-day average: X.X/10
```

Then stop - do not proceed to Steps 3-4.

---

## Step 3: Verify report exists for targetDate (and lazily generate per-date HTML)

```bash
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const date = '<targetDate>';
const reportDir = path.join(os.homedir(), 'prompt-analysis', 'reports', date);
const mdExists = fs.existsSync(path.join(reportDir, 'analysis.md'));
const htmlExists = fs.existsSync(path.join(reportDir, 'report.html'));
console.log(JSON.stringify({ mdExists, htmlExists, reportDir }));
"
```

If `mdExists` is false, find nearest available dates:
```bash
node -e "
const fs = require('fs'), path = require('path'), os = require('os');
const target = '<targetDate>';
const reportsDir = path.join(os.homedir(), 'prompt-analysis', 'reports');
const dirs = fs.existsSync(reportsDir)
  ? fs.readdirSync(reportsDir)
      .filter(n => /^\d{2}-\d{2}-\d{4}$/.test(n) &&
        fs.existsSync(path.join(reportsDir, n, 'analysis.md')))
      .sort()
  : [];
const before = dirs.filter(d => d < target);
const after  = dirs.filter(d => d > target);
console.log('prev:', before.length ? before[before.length - 1] : 'none');
console.log('next:', after.length  ? after[0]                  : 'none');
"
```
Print: `No report for <targetDate>. Nearest: <prev-date>, <next-date>.` (omit the side that is `none`). Then stop.

### Step 3b: Lazily generate per-date `report.html` (only when explicit date requested AND HTML missing)

Trigger this generation **only** when:
- The user invoked `/prompt-analyzer:view` with an explicit `DD-MM-YYYY` argument (not `latest`, not `today`, not `yesterday`, not `trend`), AND
- `mdExists` is true, AND
- `htmlExists` is false.

In that case, read `~/prompt-analysis/reports/<targetDate>/analysis.md` and `~/prompt-analysis/reports/state.json`, then write `~/prompt-analysis/reports/<targetDate>/report.html`.

**Security constraints (MUST follow):**
- Use `textContent` for all text assignment; never the HTML-string property.
- Use `document.createElement` + `appendChild` for dynamic structure.
- Data blob goes in `<script type="application/json" id="report-data">` and is read via `JSON.parse(document.getElementById('report-data').textContent)`.
- Pass data objects directly to Chart.js constructors.

**Per-date report.html layout (single-page, Chart.js from CDN, CSS inline):**
- Design tokens: bg `#1a1a2e`, cards `#16213e`, text `#e0e0e0`; score colors green `#4ade80` (>= 8.0), yellow `#fbbf24` (5.0-7.9), red `#f87171` (< 5.0); accent `#818cf8`.
- Header: target date, composite score (large, color-coded), trend arrow vs previous day, streak on that date, prompts-on-that-date count.
- Radar chart: 10 dimensions for this date vs the previous analyzed date.
- Dimension bars: horizontal, color-coded, with score labels.
- Strengths and weaknesses sections: pulled from `analysis.md` via text extraction; render through `textContent`.
- Prompt highlights: best prompt and worst prompt preview with scores.
- Footer: link back to `file:///~/prompt-analysis/reports/consolidated.html` (expanded path) and hint: "Run `/prompt-analyzer:analyze` to refresh the consolidated view."

After writing, continue to Step 4 and include the `Full report:` line pointing to the freshly written file.

For all OTHER target arguments (`latest`, `today`, `yesterday`, empty), do NOT generate HTML. Only emit the inline dashboard in Step 4. The `Full report:` link is omitted if `htmlExists` was false and no lazy generation occurred (i.e., non-explicit-date invocations).

---

## Step 4: Read and emit dashboard

Read `~/prompt-analysis/reports/<targetDate>/analysis.md` using the Read tool.

Read `~/prompt-analysis/reports/state.json` to get `scores.dailyScores` for sparklines (last 5 entries up to and including `<targetDate>`).

Emit the same inline dashboard as `/prompt-analyzer:analyze` Step 5b using data from analysis.md:

```
### 📊 Prompt Analysis - <targetDate>

**Composite score**: <composite>/10  <trend-arrow><delta as +0.0 or -0.0>  (<streak>-day streak at 7.0+)

| Dimension            | Score  | 5-day trend         |
|----------------------|--------|---------------------|
| Clarity              | <X>/10 | <sparkline> <arrow> |
| Specificity          | <X>/10 | <sparkline> <arrow> |
| Scope                | <X>/10 | <sparkline> <arrow> |
| Context-giving       | <X>/10 | <sparkline> <arrow> |
| Actionability        | <X>/10 | <sparkline> <arrow> |
| Command usage        | <X>/10 | <sparkline> <arrow> |
| Pattern efficiency   | <X>/10 | <sparkline> <arrow> |
| Interaction style    | <X>/10 | <sparkline> <arrow> |
| Friction avoidance   | <X>/10 | <sparkline> <arrow> |
| Automation awareness | <X>/10 | <sparkline> <arrow> |

**Top win**: <from Strengths section in analysis.md>
**Top gap**: <from Weaknesses section in analysis.md>

Full report: `file:///<absolute path to ~/prompt-analysis/reports/<targetDate>/report.html>`
```

Sparkline + arrow rules: same as analyze Step 5a - `Math.round((S/10)*7)` -> `['▁','▂','▃','▄','▅','▆','▇','█']`; arrow thresholds ±0.5.

Rules for the `Full report:` line at the bottom of the dashboard:

- Explicit date invocation (`/prompt-analyzer:view DD-MM-YYYY`): point to the per-date `report.html` (freshly generated in Step 3b if it did not exist).
- All other invocations (empty, `latest`, `today`, `yesterday`): point to the consolidated file at `file:///<expanded>/prompt-analysis/reports/consolidated.html` if it exists. If consolidated is missing, omit the line and print `(Consolidated report missing; run /prompt-analyzer:analyze to regenerate)`.
