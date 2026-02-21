# OpenClaw Skills – Quick Reference

For agents: when to use each skill and key commands.

---

## Humanizer (humanizer/)

**Use:** Humanize AI text, de-AI writing, score drafts.

- **CLI:** `node src/cli.js score` | `analyze -f f` | `humanize --autofix -f f`
- **Patterns:** 24 categories; Tier 1 vocab (delve, tapestry, seamless…) → ban; filler ("In order to" → "to")
- **Flow:** Read input → analyze → rewrite → return humanized text

Details: `humanizer/SKILL.md`, `humanizer/references/`

---

## PDF Processing

**Use:** Extract text, generate PDFs, merge/split.

- **Install:** `npm install pdf-parse pdfkit pdf-lib`
- **Extract:** `pdf(dataBuffer).then(d => d.text)`
- **Generate:** `PDFDocument`, `doc.pipe`, `doc.text`
- **Merge:** `pdf-lib` → `PDFDocument.create`, `copyPages`, `addPage`
- **Visual:** `pdftoppm` (needs Poppler)

---

## Screenshot Capture

**Use:** Browser or desktop screenshots.

- **Browser:** `npx playwright screenshot URL --path out.png --browser=chromium`
- **macOS:** `screencapture -x out.png` (full), `-i` (select)
- **Linux:** `scrot out.png`

---

## Spreadsheet Processing

**Use:** Excel/CSV create, read, format.

- **Install:** `npm install exceljs`
- **Create:** `ExcelJS.Workbook`, `addWorksheet`, `addRow`
- **Formulas:** `cell.value = { formula: 'A2*B2' }`
- **Read:** `workbook.xlsx.readFile`

---

## Create Plan

**Use:** Plan before implementation. No install. Prompt: "Create a plan for X."

---

## Help

Each skill: `SKILL.md` (agent instructions), `README.md` (overview). Mention the task to trigger the skill.
