const state = {
  rows: [],
  models: [],
  filteredIndexes: [],
  currentIndex: -1,
  sourceName: "",
  datasetKey: "",
  ratings: {},
};

const els = {
  datasetMeta: document.querySelector("#datasetMeta"),
  dataSourceMeta: document.querySelector("#dataSourceMeta"),
  fileInput: document.querySelector("#fileInput"),
  searchInput: document.querySelector("#searchInput"),
  prevBtn: document.querySelector("#prevBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  querySelect: document.querySelector("#querySelect"),
  queryList: document.querySelector("#queryList"),
  compareArea: document.querySelector("#compareArea"),
  compareGrid: document.querySelector("#compareGrid"),
  summaryPanel: document.querySelector("#summaryPanel"),
  summaryModal: document.querySelector("#summaryModal"),
  closeSummaryBtn: document.querySelector("#closeSummaryBtn"),
  ratingDock: document.querySelector("#ratingDock"),
  queryTitle: document.querySelector("#queryTitle"),
  positionStat: document.querySelector("#positionStat"),
  matchStat: document.querySelector("#matchStat"),
  shuffleBtn: document.querySelector("#shuffleBtn"),
  shareImageBtn: document.querySelector("#shareImageBtn"),
  summaryViewBtn: document.querySelector("#summaryViewBtn"),
};

const ratingOptions = {
  first: { label: "左好", shortLabel: "左好" },
  same: { label: "相同", shortLabel: "相同" },
  second: { label: "右好", shortLabel: "右好" },
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((item) => item.some((cell) => cell.trim() !== ""));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function isSafeUrl(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function inlineMarkdown(raw) {
  const codeSnippets = [];
  let text = String(raw).replace(/`([^`]+)`/g, (_match, code) => {
    const token = `\u0000CODE${codeSnippets.length}\u0000`;
    codeSnippets.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);

  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, alt, src) => {
    if (!isSafeUrl(src)) return match;
    return `<img src="${escapeHtml(src)}" alt="${alt}">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, label, href) => {
    if (!isSafeUrl(href)) return match;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");

  codeSnippets.forEach((snippet, index) => {
    text = text.replaceAll(`\u0000CODE${index}\u0000`, snippet);
  });

  return text;
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(line, nextLine = "") {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^(\s*)[-*+]\s+/.test(line) ||
    /^(\s*)\d+\.\s+/.test(line) ||
    /^```/.test(line) ||
    (line.includes("|") && isTableDivider(nextLine))
  );
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) continue;

    const fence = trimmed.match(/^```([\w-]*)/);
    if (fence) {
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      const headers = splitTableRow(line);
      index += 2;
      const bodyRows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        bodyRows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;

      const headHtml = headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
      const bodyHtml = bodyRows
        .map((cells) => `<tr>${cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
        .join("");
      html.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      html.push(`<blockquote>${markdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^(\s*)[-*+]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^(\s*)[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\s*)[-*+]\s+/, ""));
        index += 1;
      }
      index -= 1;
      html.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^(\s*)\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^(\s*)\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^(\s*)\d+\.\s+/, ""));
        index += 1;
      }
      index -= 1;
      html.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line];
    while (
      index + 1 < lines.length &&
      lines[index + 1].trim() &&
      !isBlockStart(lines[index + 1], lines[index + 2] || "")
    ) {
      index += 1;
      paragraph.push(lines[index]);
    }
    html.push(`<p>${paragraph.map((item) => inlineMarkdown(item)).join("<br>")}</p>`);
  }

  return html.join("\n");
}

function getRowLabel(row) {
  return row.query || "(空 query)";
}

function hashText(value) {
  let hash = 0;
  const text = String(value);

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function buildDatasetKey(sourceName) {
  const fingerprint = [
    sourceName,
    state.models.map((model) => model.name).join("|"),
    state.rows.map((row) => row.query).join("|"),
  ].join("::");

  return `model-compare-ratings:${hashText(fingerprint)}`;
}

function loadRatings() {
  try {
    const saved = window.localStorage.getItem(state.datasetKey);
    const parsed = saved ? JSON.parse(saved) : {};
    state.ratings = Object.fromEntries(
      Object.entries(parsed).filter(([, rating]) => Boolean(ratingOptions[rating]))
    );
  } catch {
    state.ratings = {};
  }
}

function saveRatings() {
  try {
    window.localStorage.setItem(state.datasetKey, JSON.stringify(state.ratings));
  } catch {
    // 评分仍保留在当前会话中；浏览器禁止存储时不打断评测。
  }
}

function getRating(rowIndex) {
  return state.ratings[String(rowIndex)] || "";
}

function findNextUnratedRow(rowIndex) {
  const currentPosition = state.filteredIndexes.indexOf(rowIndex);
  if (currentPosition === -1 || state.filteredIndexes.length <= 1) return null;

  for (let offset = 1; offset < state.filteredIndexes.length; offset += 1) {
    const nextPosition = (currentPosition + offset) % state.filteredIndexes.length;
    const nextRowIndex = state.filteredIndexes[nextPosition];
    if (!getRating(nextRowIndex)) return nextRowIndex;
  }

  return null;
}

function setRating(rowIndex, rating) {
  const key = String(rowIndex);
  const hadRating = Boolean(state.ratings[key]);

  if (state.ratings[key] === rating) {
    delete state.ratings[key];
  } else {
    state.ratings[key] = rating;
  }

  saveRatings();
  renderList();
  renderRatingDock();
  if (!els.summaryModal.hidden) renderSummary();

  if (!hadRating && state.ratings[key]) {
    const nextUnratedRow = findNextUnratedRow(rowIndex);
    if (nextUnratedRow !== null) selectRow(nextUnratedRow, { resetScroll: true });
  }
}

function normalizeRows(rawRows, sourceName) {
  const dataRows = rawRows
    .map((row) => row.map((cell) => String(cell ?? "")))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = dataRows[0] || [];
  const modelHeaders = headers.slice(1).map((header, index) => header.trim() || `模型 ${index + 1}`);

  state.models = modelHeaders.map((name, index) => ({ id: `model-${index}`, name, columnIndex: index + 1 }));
  state.rows = dataRows.slice(1).map((cells, index) => ({
    id: index,
    query: cells[0] || "",
    outputs: state.models.map((model) => cells[model.columnIndex] || ""),
  }));

  state.sourceName = sourceName;
  state.filteredIndexes = state.rows.map((_row, index) => index);
  state.currentIndex = state.filteredIndexes[0] ?? -1;
  state.datasetKey = buildDatasetKey(sourceName);
  loadRatings();
  els.searchInput.value = "";
  els.datasetMeta.textContent = `${state.rows.length} 条 query，${state.models.length} 个模型列`;
  els.dataSourceMeta.textContent = sourceName;
}

function normalizeDataset(rawCsv, sourceName) {
  normalizeRows(parseCsv(rawCsv), sourceName);
}

async function parseUploadedFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();

  if (extension === "xlsx") {
    if (!window.XLSX) {
      throw new Error("XLSX 解析库加载失败，请检查网络后重试");
    }

    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("XLSX 文件没有可读取的工作表");

    return window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
  }

  if (extension === "csv" || file.type === "text/csv") {
    return parseCsv(await file.text());
  }

  throw new Error("仅支持 CSV 或 XLSX 文件");
}

function resetDataset() {
  state.rows = [];
  state.models = [];
  state.filteredIndexes = [];
  state.currentIndex = -1;
  state.sourceName = "";
  state.datasetKey = "";
  state.ratings = {};
  els.searchInput.value = "";
  els.datasetMeta.textContent = "尚未上传数据";
  els.dataSourceMeta.textContent = "请选择 CSV / XLSX 数据";
}

function loadRows() {
  if (window.MODEL_COMPARE_CSV) {
    normalizeDataset(window.MODEL_COMPARE_CSV, "演示数据");
    return;
  }

  resetDataset();
}

function renderSelect() {
  els.querySelect.innerHTML = "";

  if (state.filteredIndexes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无 query";
    els.querySelect.append(option);
    els.querySelect.disabled = true;
    return;
  }

  state.filteredIndexes.forEach((rowIndex) => {
    const row = state.rows[rowIndex];
    const option = document.createElement("option");
    option.value = String(rowIndex);
    option.textContent = getRowLabel(row);
    els.querySelect.append(option);
  });

  els.querySelect.value = String(state.currentIndex);
  els.querySelect.disabled = false;
}

function renderList() {
  els.queryList.innerHTML = "";

  if (state.filteredIndexes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.rows.length === 0 ? "上传 CSV / XLSX 后显示 query" : "没有匹配的 query";
    els.queryList.append(empty);
    return;
  }

  state.filteredIndexes.forEach((rowIndex) => {
    const row = state.rows[rowIndex];
    const rating = getRating(rowIndex);
    const item = document.createElement("button");
    item.type = "button";
    item.role = "option";
    item.innerHTML = `
      <span class="query-list-title">${escapeHtml(getRowLabel(row))}</span>
      ${rating ? `<span class="rating-badge">${ratingOptions[rating].shortLabel}</span>` : ""}
    `;
    item.setAttribute("aria-selected", String(rowIndex === state.currentIndex));
    item.addEventListener("click", () => selectRow(rowIndex));
    els.queryList.append(item);
  });
}

function updateRatingDockPosition() {
  const rect = els.compareArea.getBoundingClientRect();
  const left = rect.left + rect.width / 2;
  const width = Math.max(280, rect.width - 44);

  document.documentElement.style.setProperty("--rating-dock-left", `${left}px`);
  document.documentElement.style.setProperty("--rating-dock-width", `${width}px`);
}

function renderRatingDock() {
  const canRate = state.models.length >= 2 && Boolean(state.rows[state.currentIndex]);
  const activeRating = getRating(state.currentIndex);

  els.ratingDock.hidden = !canRate;
  if (!canRate) return;

  updateRatingDockPosition();
  els.ratingDock.querySelectorAll("button").forEach((button) => {
    const isActive = button.dataset.rating === activeRating;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderCurrent() {
  const row = state.rows[state.currentIndex];
  const filteredPosition = state.filteredIndexes.indexOf(state.currentIndex);
  const hasRow = Boolean(row);
  const hasDataset = state.rows.length > 0;

  els.compareArea.classList.toggle("is-empty", !hasDataset);
  els.compareGrid.classList.toggle("is-one", state.models.length === 1);
  els.compareGrid.classList.toggle("is-two", state.models.length === 2);
  els.prevBtn.disabled = state.filteredIndexes.length <= 1;
  els.nextBtn.disabled = state.filteredIndexes.length <= 1;
  els.shuffleBtn.disabled = state.filteredIndexes.length <= 1;
  els.shareImageBtn.disabled = !hasRow || state.models.length < 2;
  els.summaryViewBtn.disabled = !hasDataset;
  els.matchStat.textContent = `${state.filteredIndexes.length} 条结果`;
  els.positionStat.textContent = hasRow ? `${filteredPosition + 1} / ${state.filteredIndexes.length}` : "0 / 0";
  els.compareGrid.innerHTML = "";
  renderRatingDock();

  if (!hasDataset) {
    els.queryTitle.textContent = "";
    els.compareGrid.innerHTML = `
      <section class="welcome-state">
        <h2>上传 CSV / XLSX 后开始评测</h2>
        <p>左侧选择评测数据，右侧会展示每条 query 的模型输出对比和评分按钮。</p>
      </section>
    `;
    return;
  }

  if (!hasRow) {
    els.queryTitle.textContent = "暂无数据";
    els.compareGrid.innerHTML = "<div class=\"empty-state\">没有可展示的模型输出</div>";
    return;
  }

  els.queryTitle.textContent = getRowLabel(row);
  els.querySelect.value = String(state.currentIndex);

  if (state.models.length === 0) {
    els.compareGrid.innerHTML = "<div class=\"empty-state\">CSV 至少需要两列：第一列 query，后续列为模型输出</div>";
    return;
  }

  state.models.forEach((model, index) => {
    const output = row.outputs[index] || "";
    const article = document.createElement("article");
    article.className = "version-pane";
    article.setAttribute("aria-labelledby", `${model.id}-title`);
    article.innerHTML = `
      <header class="pane-header">
        <h3 id="${model.id}-title">${escapeHtml(model.name)}</h3>
        <span>${output.length} 字符</span>
      </header>
      <div class="markdown-body">${output ? markdownToHtml(output) : "<div class=\"empty-state\">该模型没有输出内容</div>"}</div>
    `;
    els.compareGrid.append(article);
  });
}

function getSummaryRows() {
  return state.rows.map((row, index) => ({
    row,
    index,
    rating: getRating(index),
  }));
}

function renderSummary() {
  const summaryRows = getSummaryRows();
  const ratedRows = summaryRows.filter((item) => item.rating);
  const counts = Object.keys(ratingOptions).reduce((result, key) => {
    result[key] = ratedRows.filter((item) => item.rating === key).length;
    return result;
  }, {});
  const total = state.rows.length;
  const ratedTotal = ratedRows.length;
  const unratedTotal = Math.max(0, total - ratedTotal);
  const completionPercent = total ? Math.round((ratedTotal / total) * 100) : 0;
  const leftShare = ratedTotal ? Math.round((counts.first / ratedTotal) * 100) : 0;
  const sameShare = ratedTotal ? Math.round((counts.same / ratedTotal) * 100) : 0;
  const rightShare = ratedTotal ? Math.round((counts.second / ratedTotal) * 100) : 0;
  const leftModelName = state.models[0]?.name || "左侧模型";
  const rightModelName = state.models[1]?.name || "右侧模型";
  const leadGap = Math.abs(counts.first - counts.second);
  const leadingSide = ratedTotal === 0
    ? "empty"
    : counts.first === counts.second ? "tie" : counts.first > counts.second ? "left" : "right";
  const leaderText = leadingSide === "empty"
    ? "等待评分结果"
    : leadingSide === "tie"
    ? "当前左右持平"
    : `${leadingSide === "left" ? "左侧模型" : "右侧模型"}暂时领先`;
  const leaderDetail = ratedTotal === 0
    ? "完成评分后，这里会展示左右模型的胜出差距。"
    : leadingSide === "tie"
      ? `左右各胜 ${counts.first} 条，暂无明显领先。`
      : `领先 ${leadGap} 条，占已评分 query 的 ${Math.round((leadGap / ratedTotal) * 100)}%。`;
  const remainingText = unratedTotal > 0
    ? `还剩 ${unratedTotal} 条未评分`
    : "全部 query 已完成评分";
  const completionMeta = `${ratedTotal} / ${total} 条已评分，${remainingText}`;

  const distributionItems = [
    { key: "first", label: "左好", count: counts.first, share: leftShare },
    { key: "same", label: "相同", count: counts.same, share: sameShare },
    { key: "second", label: "右好", count: counts.second, share: rightShare },
  ];

  els.summaryPanel.innerHTML = `
    <div class="summary-header">
      <div>
        <p class="eyebrow">总评分</p>
        <h3 id="summaryTitle">${leaderText}</h3>
      </div>
      <span>${escapeHtml(state.sourceName)}</span>
    </div>

    <section class="summary-hero">
      <div>
        <span>评分占比</span>
        <em>${completionPercent}% 已完成</em>
      </div>
      <div class="hero-share-grid">
        <div class="hero-share hero-share-left">
          <strong>${leftShare}%</strong>
          <span>左好</span>
        </div>
        <div class="hero-share hero-share-same">
          <strong>${sameShare}%</strong>
          <span>相同</span>
        </div>
        <div class="hero-share hero-share-right">
          <strong>${rightShare}%</strong>
          <span>右好</span>
        </div>
      </div>
      <p>${completionMeta}。占比基于已评分 query 计算。</p>
    </section>

    <section class="summary-card">
      <div class="summary-card-head">
        <div>
          <h4>评分分布</h4>
          <p>占比优先，仅统计已评分 query</p>
        </div>
        <strong>${ratedTotal} 条样本</strong>
      </div>
      <div class="distribution-bar" aria-label="评分分布">
        ${distributionItems
          .map((item) => `<span class="distribution-${item.key}" style="width: ${item.share}%" title="${item.label} ${item.share}%"></span>`)
          .join("")}
      </div>
      <div class="distribution-list">
        ${distributionItems
          .map((item) => `
            <div class="distribution-item distribution-item-${item.key}">
              <span></span>
              <strong>${item.label}</strong>
              <em>${item.count} 条 · ${item.share}%</em>
            </div>
          `)
          .join("")}
      </div>
    </section>

    <section class="summary-card summary-verdict summary-verdict-${leadingSide}">
      <div>
        <h4>${leaderText}</h4>
        <p>${leaderDetail}</p>
      </div>
      <dl>
        <div>
          <dt>${escapeHtml(leftModelName)}</dt>
          <dd>${counts.first} 条胜出</dd>
        </div>
        <div>
          <dt>${escapeHtml(rightModelName)}</dt>
          <dd>${counts.second} 条胜出</dd>
        </div>
      </dl>
    </section>
  `;
}

function resetCompareScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  els.compareArea.scrollTop = 0;
  els.compareGrid.scrollTop = 0;
  els.compareGrid.querySelectorAll(".markdown-body").forEach((body) => {
    body.scrollTop = 0;
  });
}

function selectRow(rowIndex, options = {}) {
  state.currentIndex = rowIndex;
  renderSelect();
  renderList();
  renderCurrent();

  if (options.resetScroll) {
    resetCompareScroll();
  }
}

function move(step) {
  if (state.filteredIndexes.length === 0) return;

  const currentPosition = Math.max(0, state.filteredIndexes.indexOf(state.currentIndex));
  const nextPosition = (currentPosition + step + state.filteredIndexes.length) % state.filteredIndexes.length;
  selectRow(state.filteredIndexes[nextPosition]);
}

function shuffleQueries() {
  if (state.filteredIndexes.length <= 1) return;

  for (let index = state.filteredIndexes.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [state.filteredIndexes[index], state.filteredIndexes[targetIndex]] = [
      state.filteredIndexes[targetIndex],
      state.filteredIndexes[index],
    ];
  }

  state.currentIndex = state.filteredIndexes.includes(state.currentIndex)
    ? state.currentIndex
    : state.filteredIndexes[0];

  renderSelect();
  renderList();
  renderCurrent();
}

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split("\n");

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let line = "";
    Array.from(paragraph).forEach((char) => {
      const nextLine = line + char;
      if (line && ctx.measureText(nextLine).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = nextLine;
      }
    });
    lines.push(line);
  });

  return lines;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawLines(ctx, lines, x, y, lineHeight, maxY) {
  let currentY = y;

  for (const line of lines) {
    if (currentY + lineHeight > maxY) {
      ctx.fillText("...... 内容过长，图片已截断", x, currentY);
      return currentY + lineHeight;
    }
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
}

function safeFilename(value) {
  return String(value || "query")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "query";
}

function truncateChars(value, maxLength) {
  const chars = Array.from(String(value || ""));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength).join("")}...`;
}

function downloadCurrentComparisonImage() {
  const row = state.rows[state.currentIndex];
  if (!row || state.models.length < 2) return;

  const canvasWidth = 1600;
  const padding = 56;
  const gap = 32;
  const columnWidth = (canvasWidth - padding * 2 - gap) / 2;
  const headerHeight = 210;
  const columnHeaderHeight = 68;
  const columnPadding = 24;
  const lineHeight = 25;
  const maxCanvasHeight = 30000;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const query = getRowLabel(row);

  ctx.font = "18px Arial, sans-serif";
  const leftLines = wrapCanvasText(ctx, row.outputs[0] || "该模型没有输出内容", columnWidth - columnPadding * 2);
  const rightLines = wrapCanvasText(ctx, row.outputs[1] || "该模型没有输出内容", columnWidth - columnPadding * 2);
  const contentLines = Math.max(leftLines.length, rightLines.length);
  const contentHeight = contentLines * lineHeight + columnHeaderHeight + columnPadding * 2;
  const canvasHeight = Math.min(maxCanvasHeight, headerHeight + contentHeight + padding);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#17202a";
  ctx.font = "700 34px Arial, sans-serif";
  ctx.fillText("模型效果对比", padding, 64);

  ctx.fillStyle = "#657281";
  ctx.font = "18px Arial, sans-serif";
  ctx.fillText(`${state.sourceName || "评测数据"} · ${new Date().toLocaleString()}`, padding, 98);

  ctx.fillStyle = "#0b5f59";
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillText("当前 query", padding, 142);

  ctx.fillStyle = "#17202a";
  ctx.font = "700 24px Arial, sans-serif";
  ctx.fillText(truncateChars(query, 20), padding, 178);

  const columns = [
    {
      x: padding,
      title: state.models[0].name,
      lines: leftLines,
      color: "#0f766e",
      soft: "#e3f3f0",
    },
    {
      x: padding + columnWidth + gap,
      title: state.models[1].name,
      lines: rightLines,
      color: "#2557a7",
      soft: "#e8f0ff",
    },
  ];

  columns.forEach((column) => {
    const y = headerHeight;
    drawRoundedRect(ctx, column.x, y, columnWidth, canvasHeight - headerHeight - padding, 10);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#d8dee7";
    ctx.stroke();

    drawRoundedRect(ctx, column.x, y, columnWidth, columnHeaderHeight, 10);
    ctx.fillStyle = column.soft;
    ctx.fill();

    ctx.fillStyle = column.color;
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText(column.title, column.x + columnPadding, y + 42);

    ctx.fillStyle = "#17202a";
    ctx.font = "18px Arial, sans-serif";
    drawLines(
      ctx,
      column.lines,
      column.x + columnPadding,
      y + columnHeaderHeight + columnPadding + 18,
      lineHeight,
      canvasHeight - padding - 18
    );
  });

  const link = document.createElement("a");
  link.download = `模型对比-${safeFilename(query)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function applyFilter() {
  const keyword = els.searchInput.value.trim().toLowerCase();
  state.filteredIndexes = state.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (!keyword) return true;
      return getRowLabel(row).toLowerCase().includes(keyword);
    })
    .map(({ index }) => index);

  state.currentIndex = state.filteredIndexes.includes(state.currentIndex)
    ? state.currentIndex
    : state.filteredIndexes[0] ?? -1;

  renderSelect();
  renderList();
  renderCurrent();
}

function openSummaryModal() {
  if (state.rows.length === 0) return;
  renderSummary();
  els.summaryModal.hidden = false;
  els.closeSummaryBtn.focus();
}

function closeSummaryModal() {
  els.summaryModal.hidden = true;
}

function bindEvents() {
  els.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const rows = await parseUploadedFile(file);
      normalizeRows(rows, file.name);
      renderSelect();
      renderList();
      renderCurrent();
    } catch (error) {
      els.datasetMeta.textContent = error.message || "文件读取失败，请确认格式";
      console.error(error);
    }
  });

  els.searchInput.addEventListener("input", applyFilter);
  els.prevBtn.addEventListener("click", () => move(-1));
  els.nextBtn.addEventListener("click", () => move(1));
  els.shuffleBtn.addEventListener("click", shuffleQueries);
  els.shareImageBtn.addEventListener("click", downloadCurrentComparisonImage);
  els.querySelect.addEventListener("change", (event) => {
    selectRow(Number(event.target.value));
  });
  els.summaryViewBtn.addEventListener("click", openSummaryModal);
  els.closeSummaryBtn.addEventListener("click", closeSummaryModal);
  els.summaryModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-summary]")) closeSummaryModal();
  });
  els.ratingDock.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.rows[state.currentIndex]) return;
      setRating(state.currentIndex, button.dataset.rating);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("input, select, textarea")) return;
    if (event.key === "Escape" && !els.summaryModal.hidden) {
      closeSummaryModal();
      return;
    }
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
  window.addEventListener("resize", renderRatingDock);
}

function boot() {
  loadRows();
  bindEvents();
  renderSelect();
  renderList();
  renderCurrent();
}

boot();
