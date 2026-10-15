export type CatalogSong = {
  id: string;
  title: string | null;
  key: string | null;
  tempo: string | null;
  song_type: string | null;
};

const alphabet = new Intl.Collator("en", { sensitivity: "base", numeric: true });
function keyPitch(key: string) {
  const match = /^([A-G])([#♯b♭]?)(?:\s*(?:m|min|minor|maj|major))?$/i.exec(key.trim());
  if (!match) return 99;
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (natural[match[1].toUpperCase()] + (/[#♯]/.test(match[2]) ? 1 : /[b♭]/.test(match[2]) ? -1 : 0) + 12) % 12;
}

export function groupCatalog(songs: readonly CatalogSong[]) {
  return ["vocal", "instrumental", "unclassified"].map((type) => {
    const rows = songs.filter((song) => (song.song_type === "vocal" || song.song_type === "instrumental" ? song.song_type : "unclassified") === type);
    const keys = [...new Set(rows.map((song) => song.key?.trim() ? song.key : ""))];
    keys.sort((a, b) => !a ? 1 : !b ? -1 : keyPitch(a) - keyPitch(b) || alphabet.compare(a, b));
    return {
      title: type === "vocal" ? "VOCAL SONGS" : type === "instrumental" ? "INSTRUMENTALS" : "UNCLASSIFIED SONGS",
      keys: keys.map((key) => ({
        title: key ? `KEY OF ${key}` : "UNASSIGNED KEY",
        speeds: ["fast", "medium", "slow", ""].map((speed) => ({
          title: speed ? speed.toUpperCase() : "UNASSIGNED SPEED",
          songs: rows.filter((song) => (song.key?.trim() ? song.key : "") === key && (["fast", "medium", "slow"].includes(song.tempo ?? "") ? song.tempo : "") === speed)
            .sort((a, b) => alphabet.compare(a.title ?? "", b.title ?? "") || alphabet.compare(a.id, b.id)),
        })).filter((speed) => speed.songs.length),
      })),
    };
  }).filter((section) => section.keys.length);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function catalogSections(songs: readonly CatalogSong[]) {
  return groupCatalog(songs).map(section => {
    const columns = ["SLOW", "MEDIUM", "FAST"].map(label => ({
      label,
      keys: section.keys.flatMap(key => {
        const speed = key.speeds.find(speed => speed.title === label);
        return speed ? [{ title: key.title, songs: speed.songs }] : [];
      }),
    }));
    return {
      title: section.title,
      columns: columns.map(column => ({ ...column, keys: column.keys.filter(key => key.title !== "UNASSIGNED KEY") })),
      unassignedKeys: columns.map(column => ({ ...column, keys: column.keys.filter(key => key.title === "UNASSIGNED KEY") })),
      unassignedSpeeds: section.keys.flatMap(key => {
        const speed = key.speeds.find(speed => speed.title === "UNASSIGNED SPEED");
        return speed ? [{ title: key.title, songs: speed.songs }] : [];
      }),
    };
  });
}

export function catalogReadiness(songs: readonly CatalogSong[]) {
  const ready: CatalogSong[] = [];
  const attention: { song: CatalogSong; missing: string[] }[] = [];
  for (const song of songs) {
    const missing = [];
    if (song.song_type !== "vocal" && song.song_type !== "instrumental") missing.push("vocal/instrumental classification");
    if (!song.key?.trim()) missing.push("musical key");
    if (!["slow", "medium", "fast"].includes(song.tempo ?? "")) missing.push("speed");
    if (missing.length) attention.push({ song, missing });
    else ready.push(song);
  }
  attention.sort((a, b) => alphabet.compare(a.song.title ?? "", b.song.title ?? "") || alphabet.compare(a.song.id, b.song.id));
  return { total: songs.length, ready, attention };
}

export function catalogHtml(songs: readonly CatalogSong[], date = new Date()) {
  const readiness = catalogReadiness(songs);
  const entries = (keys: { title: string; songs: CatalogSong[] }[], showKey: boolean) => keys.map(key => key.songs.map((song, index) =>
    `<div class="entry" data-key="${showKey ? escapeHtml(key.title) : ""}">${index === 0 && showKey ? `<h4>${escapeHtml(key.title)}</h4>` : ""}<p data-song-id="${escapeHtml(song.id)}">${escapeHtml(song.title?.trim() ? song.title : "Untitled song")}</p></div>`).join("")).join("");
  const band = (section: string, label: string, columns: { label: string; keys: { title: string; songs: CatalogSong[] }[] }[]) =>
    `<section data-section="${section}" data-group="${label}">${columns.map(column => `<div data-speed="${column.label}">${entries(column.keys, label !== "UNASSIGNED KEY")}</div>`).join("")}</section>`;
  const content = catalogSections(readiness.ready).map(section =>
    band(section.title, "", section.columns) +
    (section.unassignedKeys.some(column => column.keys.length) ? band(section.title, "UNASSIGNED KEY", section.unassignedKeys) : "") +
    (section.unassignedSpeeds.length ? band(section.title, "UNASSIGNED SPEED", [{ label: "", keys: section.unassignedSpeeds }]) : "")
  ).join("");
  const attentionEntries = readiness.attention.map(({ song, missing }) => `<div class="entry"><p data-song-id="${escapeHtml(song.id)}">${escapeHtml(song.title?.trim() ? song.title : "Untitled song")}</p><small>Missing: ${escapeHtml(missing.join(", "))}. ${escapeHtml(`Type: ${song.song_type || "not set"} · Key: ${song.key?.trim() || "not set"} · Speed: ${song.tempo || "not set"}`)}</small></div>`).join("");
  const attentionContent = readiness.attention.length ? `<section data-section="SONGS NEEDING ATTENTION" data-group=""><div data-speed="">${attentionEntries}</div></section>` : "";
  const summary = `${readiness.total} total | ${readiness.ready.length} ready | ${readiness.attention.length} need attention`;
  const review = readiness.attention.map(({ song, missing }) => `<li><strong>${escapeHtml(song.title?.trim() ? song.title : "Untitled song")}</strong> — Missing: ${escapeHtml(missing.join(", "))}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CMMS Song Catalog</title><style>
    @page { size: letter portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #e7e5e4; font-family: Arial, sans-serif; }
    nav { padding: 12px; border-bottom: 1px solid #aaa; font-size: 14px; background: #fff; }
    button { padding: 8px 16px; margin-right: 8px; cursor: pointer; }
    nav label { display: inline-block; margin: 10px 0; } nav summary { cursor: pointer; } nav li { margin: 4px 0; }
    .entry small { display: block; font-size: 9pt; line-height: 1.2; margin-bottom: 6pt; overflow-wrap: anywhere; }
    main { width: max-content; min-width: 100%; padding: 20px; }
    .sheet { position: relative; width: 8.5in; height: 11in; padding: .35in; margin: 0 auto 20px; background: #fff; box-shadow: 0 2px 10px #0003; display: flex; flex-direction: column; break-inside: avoid; page-break-inside: avoid; }
    header { flex: none; text-align: center; margin-bottom: 10pt; }
    h1 { font-size: 17pt; margin: 0; } header p { font-size: 8pt; margin: 3pt 0; }
    .page-body { flex: 1; min-height: 0; }
    .band { display: flow-root; }
    .columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .2in; align-items: start; }
    .columns.single { grid-template-columns: minmax(0, 1fr); }
    .column { min-width: 0; display: flow-root; }
    .entry { display: flow-root; break-inside: avoid; page-break-inside: avoid; }
    h2 { font-size: 16pt; border-bottom: 1px solid #000; margin: 8pt 0 4pt; }
    h3 { font-size: 11pt; margin: 5pt 0 3pt; }
    .speed-heading { font-size: 14pt; border-bottom: 1px solid #aaa; margin: 3pt 0; }
    h4 { font-size: 12pt; border-bottom: .5pt solid #999; margin: 4pt 0 2pt; }
    h2,h3,h4 { break-after: avoid; page-break-after: avoid; }
    .columns p { font-size: 12pt; line-height: 1.15; margin: 0 0 2pt; overflow-wrap: anywhere; break-inside: avoid; page-break-inside: avoid; }
    footer { position: absolute; bottom: .12in; left: 0; right: 0; text-align: center; font-size: 8pt; }
    @media print { nav { display: none; } body { background: #fff; } main { width: auto; min-width: 0; margin: 0; padding: 0; } .sheet { margin: 0; box-shadow: none; break-after: page; page-break-after: always; } .sheet:last-child { break-after: auto; page-break-after: auto; } }
  </style></head><body><nav aria-label="Catalog preview controls"><button data-print disabled onclick="window.print()">Print</button><button data-print disabled onclick="window.print()">Save as PDF</button><button onclick="window.close()">Close</button><span id="status" role="status">Preparing pages…</span><div id="library-summary">${summary}</div><label><input id="include-incomplete" type="checkbox"> Include Unclassified / Incomplete Songs</label><details><summary>Show Songs Needing Attention (${readiness.attention.length})</summary>${review ? `<ul>${review}</ul>` : "<p>No songs need attention.</p>"}</details><div>For PDF, choose Save as PDF in the print dialog. Use Letter, portrait, 100% scale, and turn browser headers and footers off.</div></nav><main aria-label="Song catalog pages"></main><template id="report-header"><header><h1>CUMBERLAND MOUNTAIN MUSIC SHOW<br>SONG CATALOG</h1><p>Generated ${escapeHtml(date.toLocaleDateString("en-US"))} · <span data-count>${readiness.ready.length}</span> songs</p></header></template><template id="report-content">${content}</template><template id="attention-content">${attentionContent}</template><script>
    // Each speed has its own queue. Section rows grow to their tallest column,
    // and the next section uses the remaining space on the same explicit page.
    // Screen and print share those page boxes and never redistribute songs.
    document.fonts.ready.then(() => {
      const main = document.querySelector('main');
      const source = document.getElementById('report-content');
      const header = document.getElementById('report-header');
      const checkbox = document.getElementById('include-incomplete');
      function renderPages() {
      main.replaceChildren();
      delete document.body.dataset.ready;
      document.querySelectorAll('[data-print]').forEach(button => button.disabled = true);
      const content = source.content.cloneNode(true);
      if (checkbox.checked) content.append(document.getElementById('attention-content').content.cloneNode(true));
      header.content.querySelector('[data-count]').textContent = checkbox.checked ? '${readiness.total}' : '${readiness.ready.length}';
      let body;
      let lastSection = '';
      function addPage() {
        const sheet = document.createElement('article');
        sheet.className = 'sheet';
        if (!main.children.length) sheet.append(header.content.cloneNode(true));
        body = document.createElement('div');
        body.className = 'page-body';
        sheet.append(body);
        main.append(sheet);
        lastSection = '';
      }
      addPage();
      if (!content.children.length) body.textContent = '${songs.length ? "No songs are ready to print. Include incomplete songs to review them here." : "No songs in the Song Library."}';
      for (const sourceBand of [...content.children]) {
        // Keep the instrumental reference on a separate printed page from vocals.
        if (sourceBand.dataset.section === 'INSTRUMENTALS' && lastSection && lastSection !== 'INSTRUMENTALS') {
          addPage();
        }
        const queues = [...sourceBand.children].map(column => [...column.children]);
        let continuation = false;
        do {
          const row = document.createElement('section');
          row.className = 'band';
          row.dataset.section = sourceBand.dataset.section;
          row.dataset.group = sourceBand.dataset.group;
          if (lastSection !== sourceBand.dataset.section) {
            const heading = document.createElement('h2');
            heading.textContent = sourceBand.dataset.section + (continuation ? ' (continued)' : '');
            row.append(heading);
          }
          if (sourceBand.dataset.group) {
            const heading = document.createElement('h3');
            heading.textContent = sourceBand.dataset.group;
            row.append(heading);
          }
          const grid = document.createElement('div');
          grid.className = 'columns' + (queues.length === 1 ? ' single' : '');
          const columns = [...sourceBand.children].map(sourceColumn => {
            const column = document.createElement('div');
            column.className = 'column';
            column.dataset.speed = sourceColumn.dataset.speed;
            if (sourceColumn.dataset.speed) {
              const heading = document.createElement('h3');
              heading.className = 'speed-heading';
              heading.textContent = sourceColumn.dataset.speed;
              column.append(heading);
            }
            grid.append(column);
            return column;
          });
          row.append(grid);
          body.append(row);
          let added = 0;
          columns.forEach((column, index) => {
            const queue = queues[index];
            while (queue.length) {
              const block = queue[0];
              // Repeat the key on continuation pages, keeping it with a song.
              if (!column.querySelector('.entry') && block.dataset.key && !block.querySelector('h4')) {
                const heading = document.createElement('h4');
                heading.textContent = block.dataset.key;
                block.prepend(heading);
              }
              column.append(block);
              if (row.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 0.1) {
                block.remove();
                break;
              }
              queue.shift();
              added++;
            }
          });
          const remaining = queues.some(queue => queue.length);
          if (!added && remaining) {
            row.remove();
            if (!body.children.length) throw new Error('A song title is too tall to fit on one catalog page.');
            addPage();
          } else {
            if (!remaining && row.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom + 0.1) {
              row.remove();
              addPage();
              if (!row.querySelector('h2')) {
                const heading = document.createElement('h2');
                heading.textContent = sourceBand.dataset.section;
                row.prepend(heading);
              }
              body.append(row);
            }
            lastSection = sourceBand.dataset.section;
            if (remaining) { addPage(); continuation = true; }
          }
        } while (queues.some(queue => queue.length));
      }
      const sheets = [...main.children];
      sheets.forEach((sheet, index) => {
        sheet.setAttribute('aria-label', 'Page ' + (index + 1) + ' of ' + sheets.length);
        const footer = document.createElement('footer');
        footer.textContent = 'Page ' + (index + 1) + ' of ' + sheets.length;
        sheet.append(footer);
      });
      document.querySelectorAll('[data-print]').forEach(button => button.disabled = false);
      document.getElementById('status').textContent = sheets.length + (sheets.length === 1 ? ' page' : ' pages');
      document.body.dataset.ready = 'true';
      }
      checkbox.addEventListener('change', () => {
        try { renderPages(); } catch { document.getElementById('status').textContent = 'The catalog could not fit all titles on the pages. Close and try again.'; }
      });
      renderPages();
    }).catch(() => {
      document.getElementById('status').textContent = 'The catalog could not fit all titles on the pages. Close and try again, or review unusually long song titles.';
    });
  </script></body></html>`;
}
