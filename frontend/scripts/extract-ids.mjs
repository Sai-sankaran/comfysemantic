import fs from 'fs';

const content = fs.readFileSync('../design.md', 'utf8');
const lines = content.split('\n');
const ids = new Map();

// First pass: find all table rows with IDs and their titles
// Table format: | `ID` | Title | ...
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('|') && line.includes('`')) {
    // Check if this is a table row with an ID
    const cells = line.split('|').map(c => c.trim());
    if (cells.length >= 3) {
      const idMatch = cells[1].match(/\`([A-Z]{2,4}-[0-9]{2,3})\`/);
      if (idMatch) {
        const id = idMatch[1];
        const title = cells[2]; // Title is typically in the 3rd cell
        if (!ids.has(id) && title && title.length > 2) {
          ids.set(id, { line: i+1, title: title });
        }
      }
    }
  }
}

// Second pass: for IDs not found in tables, use context
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const regex = /\`([A-Z]{2,4}-[0-9]{2,3})\`/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const id = match[1];
    if (!ids.has(id)) {
      const titleLine = lines.slice(Math.max(0, i-2), i+3).join(' ');
      // Try to extract a meaningful title
      let title = titleLine.substring(0, 200);
      // Clean up
      title = title.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      ids.set(id, { line: i+1, title });
    }
  }
}

// Output as JSON
const output = {};
for (const [id, info] of ids) {
  output[id] = { line: info.line, title: info.title.replace(/\|/g, '\\|') };
}
console.log(JSON.stringify(output, null, 2));