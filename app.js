const state = {
  rows: [],
  models: [],
  filteredIndexes: [],
  currentIndex: -1,
  sourceName: "",
  datasetKey: "",
  ratings: {},
  segmentFeedbacks: [],
  pendingSegmentSelection: null,
  originalHeaders: [],
  originalRows: [],
  queryColumnIndex: 0,
  containerMode: "web",
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
  exportRatingsBtn: document.querySelector("#exportRatingsBtn"),
  summaryViewBtn: document.querySelector("#summaryViewBtn"),
  containerModeButtons: document.querySelectorAll("[data-container-mode]"),
  segmentToolbar: document.querySelector("#segmentToolbar"),
  segmentReasonPanel: document.querySelector("#segmentReasonPanel"),
  segmentReasonTitle: document.querySelector("#segmentReasonTitle"),
  segmentReasonText: document.querySelector("#segmentReasonText"),
  segmentConfirmBtn: document.querySelector("#segmentConfirmBtn"),
  segmentCancelBtn: document.querySelector("#segmentCancelBtn"),
  segmentFeedbackPanel: document.querySelector("#segmentFeedbackPanel"),
  segmentFeedbackTitle: document.querySelector("#segmentFeedbackTitle"),
  segmentFeedbackList: document.querySelector("#segmentFeedbackList"),
  closeSegmentFeedbackBtn: document.querySelector("#closeSegmentFeedbackBtn"),
};

const ratingOptions = {
  first: { label: "左好", shortLabel: "左好" },
  same: { label: "相同", shortLabel: "相同" },
  second: { label: "右好", shortLabel: "右好" },
};

const segmentFeedbackOptions = {
  good: { label: "好", className: "is-good" },
  bad: { label: "坏", className: "is-bad" },
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

function getSegmentFeedbackKey() {
  return state.datasetKey ? `${state.datasetKey}:segment-feedbacks` : "";
}

function loadSegmentFeedbacks() {
  try {
    const saved = window.localStorage.getItem(getSegmentFeedbackKey());
    const parsed = saved ? JSON.parse(saved) : [];
    state.segmentFeedbacks = Array.isArray(parsed)
      ? parsed.filter((item) => (
        Number.isInteger(item.rowIndex) &&
        Number.isInteger(item.modelIndex) &&
        Number.isInteger(item.startOffset) &&
        Number.isInteger(item.endOffset) &&
        item.endOffset > item.startOffset &&
        Boolean(segmentFeedbackOptions[item.type])
      ))
      : [];
  } catch {
    state.segmentFeedbacks = [];
  }
}

function clearSavedRatings() {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("model-compare-ratings:"))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // 浏览器禁止访问本地存储时，仍清空当前会话里的评分与局部反馈。
  }

  state.ratings = {};
  state.segmentFeedbacks = [];
}

function saveSegmentFeedbacks() {
  try {
    window.localStorage.setItem(getSegmentFeedbackKey(), JSON.stringify(state.segmentFeedbacks));
  } catch {
    // 局部反馈仍保留在当前会话中；浏览器禁止存储时不打断评测。
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

function getSegmentFeedbacks(rowIndex = state.currentIndex, modelIndex = null) {
  return state.segmentFeedbacks.filter((feedback) => (
    feedback.rowIndex === rowIndex &&
    (modelIndex === null || feedback.modelIndex === modelIndex)
  ));
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

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function findQueryColumnIndex(headers) {
  const exactIndex = headers.findIndex((header) => normalizeHeader(header) === "query");
  if (exactIndex >= 0) return exactIndex;

  const fuzzyIndex = headers.findIndex((header) => normalizeHeader(header).includes("query"));
  return fuzzyIndex >= 0 ? fuzzyIndex : 0;
}

function findModelColumnIndexes(headers, queryColumnIndex) {
  const modelPattern = /大模型回复|模型回复|模型输出|模型效果|输出效果|回复|response|answer|output/i;
  const preferredIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index !== queryColumnIndex && modelPattern.test(String(header || "")))
    .map(({ index }) => index);

  if (preferredIndexes.length >= 2) return preferredIndexes.slice(0, 2);

  const afterQueryIndexes = headers
    .map((_header, index) => index)
    .filter((index) => index !== queryColumnIndex && index > queryColumnIndex);

  if (afterQueryIndexes.length >= 2) return afterQueryIndexes.slice(0, 2);

  return headers
    .map((_header, index) => index)
    .filter((index) => index !== queryColumnIndex)
    .slice(0, 2);
}

function normalizeRows(rawRows, sourceName, options = {}) {
  const dataRows = rawRows
    .map((row) => row.map((cell) => String(cell ?? "")))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
  const headers = dataRows[0] || [];
  const queryColumnIndex = findQueryColumnIndex(headers);
  const modelColumnIndexes = findModelColumnIndexes(headers, queryColumnIndex);
  const modelHeaders = modelColumnIndexes.map((columnIndex, index) => headers[columnIndex]?.trim() || `模型 ${index + 1}`);

  state.originalHeaders = headers;
  state.originalRows = dataRows.slice(1);
  state.queryColumnIndex = queryColumnIndex;
  state.models = modelHeaders.map((name, index) => ({ id: `model-${index}`, name, columnIndex: modelColumnIndexes[index] }));
  state.rows = dataRows.slice(1).map((cells, index) => ({
    id: index,
    originalCells: cells,
    query: cells[queryColumnIndex] || "",
    outputs: state.models.map((model) => cells[model.columnIndex] || ""),
  }));

  state.sourceName = sourceName;
  state.filteredIndexes = state.rows.map((_row, index) => index);
  state.currentIndex = state.filteredIndexes[0] ?? -1;
  state.datasetKey = buildDatasetKey(sourceName);
  if (options.loadRatings === false) {
    state.ratings = {};
    state.segmentFeedbacks = [];
  } else {
    loadRatings();
    loadSegmentFeedbacks();
  }
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
  state.segmentFeedbacks = [];
  state.pendingSegmentSelection = null;
  state.originalHeaders = [];
  state.originalRows = [];
  state.queryColumnIndex = 0;
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

function renderContainerModeSwitch() {
  els.containerModeButtons.forEach((button) => {
    const isActive = button.dataset.containerMode === state.containerMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderOutputContent(output) {
  return output ? markdownToHtml(output) : "<div class=\"empty-state\">该模型没有输出内容</div>";
}

function createFeedbackCountButton(rowIndex, modelIndex) {
  const count = getSegmentFeedbacks(rowIndex, modelIndex).length;
  if (count === 0) return "";
  return `<button class="segment-count-btn" type="button" data-feedback-list="${modelIndex}">局部反馈 ${count}</button>`;
}

function wrapTextNodeRange(textNode, start, end, feedback) {
  const after = textNode.splitText(end);
  const target = textNode.splitText(start);
  const marker = document.createElement("span");
  marker.className = `segment-highlight ${segmentFeedbackOptions[feedback.type].className}`;
  marker.dataset.segmentFeedbackId = feedback.id;
  marker.title = `${segmentFeedbackOptions[feedback.type].label}：${feedback.reason}`;
  target.parentNode.insertBefore(marker, after);
  marker.append(target);
}

function applySegmentHighlights(body, rowIndex, modelIndex) {
  const feedbacks = getSegmentFeedbacks(rowIndex, modelIndex)
    .filter((feedback) => feedback.startOffset >= 0 && feedback.endOffset <= body.textContent.length)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  if (!feedbacks.length) return;

  const visibleFeedbacks = [];
  let lastEnd = -1;
  feedbacks.forEach((feedback) => {
    if (feedback.startOffset >= lastEnd) {
      visibleFeedbacks.push(feedback);
      lastEnd = feedback.endOffset;
    }
  });

  const operations = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let offset = 0;

  while (node) {
    const nextOffset = offset + node.nodeValue.length;
    visibleFeedbacks.forEach((feedback) => {
      const start = Math.max(feedback.startOffset, offset);
      const end = Math.min(feedback.endOffset, nextOffset);
      if (start < end) {
        operations.push({
          node,
          start: start - offset,
          end: end - offset,
          feedback,
        });
      }
    });
    offset = nextOffset;
    node = walker.nextNode();
  }

  operations
    .sort((a, b) => {
      if (a.node === b.node) return b.start - a.start;
      return 0;
    })
    .forEach((operation) => {
      if (operation.node.parentNode) {
        wrapTextNodeRange(operation.node, operation.start, operation.end, operation.feedback);
      }
    });
}

function enhanceMarkdownBody(body, rowIndex, modelIndex) {
  body.dataset.rowIndex = String(rowIndex);
  body.dataset.modelIndex = String(modelIndex);
  applySegmentHighlights(body, rowIndex, modelIndex);
}

function hideSegmentToolbar() {
  els.segmentToolbar.hidden = true;
}

function hideSegmentReasonPanel() {
  els.segmentReasonPanel.hidden = true;
  els.segmentReasonText.value = "";
}

function placeFloatingElement(element, x, y) {
  const margin = 12;
  element.hidden = false;
  const rect = element.getBoundingClientRect();
  const left = Math.min(Math.max(margin, x), window.innerWidth - rect.width - margin);
  const top = Math.min(Math.max(margin, y), window.innerHeight - rect.height - margin);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

function getSelectionOffsetWithin(container, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getSelectionMarkdownBody(selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  const startElement = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer;
  const endElement = range.endContainer.nodeType === Node.TEXT_NODE
    ? range.endContainer.parentElement
    : range.endContainer;
  const startBody = startElement?.closest?.(".markdown-body");
  const endBody = endElement?.closest?.(".markdown-body");

  if (!startBody || startBody !== endBody) return null;
  return startBody;
}

function captureSegmentSelection(event) {
  const selection = window.getSelection();
  const body = getSelectionMarkdownBody(selection);
  if (!body) {
    hideSegmentToolbar();
    return;
  }

  const range = selection.getRangeAt(0);
  const rawText = range.toString();
  const selectedText = rawText.trim();
  if (!selectedText) {
    hideSegmentToolbar();
    return;
  }

  const trimStart = rawText.length - rawText.trimStart().length;
  const trimEnd = rawText.length - rawText.trimEnd().length;
  const startOffset = getSelectionOffsetWithin(body, range.startContainer, range.startOffset) + trimStart;
  const endOffset = getSelectionOffsetWithin(body, range.endContainer, range.endOffset) - trimEnd;
  if (endOffset <= startOffset) {
    hideSegmentToolbar();
    return;
  }

  const plainText = body.textContent || "";
  state.pendingSegmentSelection = {
    rowIndex: Number(body.dataset.rowIndex),
    modelIndex: Number(body.dataset.modelIndex),
    selectedText,
    startOffset,
    endOffset,
    beforeContext: plainText.slice(Math.max(0, startOffset - 40), startOffset),
    afterContext: plainText.slice(endOffset, Math.min(plainText.length, endOffset + 40)),
    x: event.clientX,
    y: event.clientY,
  };

  placeFloatingElement(els.segmentToolbar, event.clientX + 8, event.clientY + 8);
}

function openSegmentReasonPanel(type) {
  if (!state.pendingSegmentSelection) return;
  const option = segmentFeedbackOptions[type];
  state.pendingSegmentSelection.type = type;
  els.segmentReasonTitle.textContent = `标记为「${option.label}」`;
  hideSegmentToolbar();
  placeFloatingElement(
    els.segmentReasonPanel,
    state.pendingSegmentSelection.x + 8,
    state.pendingSegmentSelection.y + 8
  );
  els.segmentReasonText.focus();
}

function confirmSegmentFeedback() {
  const selection = state.pendingSegmentSelection;
  if (!selection?.type) return;

  const reason = els.segmentReasonText.value.trim();
  if (!reason) {
    els.segmentReasonText.focus();
    return;
  }

  state.segmentFeedbacks.push({
    id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rowIndex: selection.rowIndex,
    modelIndex: selection.modelIndex,
    type: selection.type,
    selectedText: selection.selectedText,
    reason,
    startOffset: selection.startOffset,
    endOffset: selection.endOffset,
    beforeContext: selection.beforeContext,
    afterContext: selection.afterContext,
    createdAt: new Date().toLocaleString(),
  });

  saveSegmentFeedbacks();
  hideSegmentReasonPanel();
  state.pendingSegmentSelection = null;
  window.getSelection()?.removeAllRanges();
  renderCurrent();
}

function deleteSegmentFeedback(feedbackId) {
  state.segmentFeedbacks = state.segmentFeedbacks.filter((feedback) => feedback.id !== feedbackId);
  saveSegmentFeedbacks();
  renderCurrent();
  if (!els.segmentFeedbackPanel.hidden) {
    const modelIndex = Number(els.segmentFeedbackPanel.dataset.modelIndex);
    openSegmentFeedbackPanel(modelIndex);
  }
}

function openSegmentFeedbackPanel(modelIndex) {
  const row = state.rows[state.currentIndex];
  if (!row) return;

  const model = state.models[modelIndex];
  const feedbacks = getSegmentFeedbacks(state.currentIndex, modelIndex)
    .sort((a, b) => a.startOffset - b.startOffset);

  els.segmentFeedbackPanel.dataset.modelIndex = String(modelIndex);
  els.segmentFeedbackTitle.textContent = `${model?.name || "模型"} · 局部反馈 ${feedbacks.length} 条`;
  els.segmentFeedbackList.innerHTML = feedbacks.length
    ? feedbacks.map((feedback) => `
      <article class="segment-feedback-item ${segmentFeedbackOptions[feedback.type].className}">
        <div>
          <strong>${segmentFeedbackOptions[feedback.type].label}</strong>
          <span>${escapeHtml(feedback.createdAt || "")}</span>
        </div>
        <blockquote>${escapeHtml(feedback.selectedText)}</blockquote>
        <p>${escapeHtml(feedback.reason)}</p>
        <button type="button" data-delete-segment="${feedback.id}">删除</button>
      </article>
    `).join("")
    : "<div class=\"empty-state\">这个模型结果还没有局部反馈</div>";
  els.segmentFeedbackPanel.hidden = false;
}

function closeSegmentFeedbackPanel() {
  els.segmentFeedbackPanel.hidden = true;
  els.segmentFeedbackPanel.dataset.modelIndex = "";
}

function createWebModelPane(model, output) {
  const modelIndex = state.models.indexOf(model);
  const article = document.createElement("article");
  article.className = "version-pane";
  article.setAttribute("aria-labelledby", `${model.id}-title`);
  article.innerHTML = `
    <header class="pane-header">
      <h3 id="${model.id}-title">${escapeHtml(model.name)}</h3>
      <div class="pane-actions">
        ${createFeedbackCountButton(state.currentIndex, modelIndex)}
        <span>${output.length} 字符</span>
      </div>
    </header>
    <div class="markdown-body">${renderOutputContent(output)}</div>
  `;
  enhanceMarkdownBody(article.querySelector(".markdown-body"), state.currentIndex, modelIndex);
  return article;
}

function createMobileModelPane(model, output, query) {
  const modelIndex = state.models.indexOf(model);
  const article = document.createElement("article");
  article.className = "mobile-device-pane";
  article.setAttribute("aria-labelledby", `${model.id}-mobile-title`);
  article.innerHTML = `
    <div class="mobile-device-label">
      <strong id="${model.id}-mobile-title">${escapeHtml(model.name)}</strong>
      <div class="pane-actions">
        ${createFeedbackCountButton(state.currentIndex, modelIndex)}
        <span>${output.length} 字符</span>
      </div>
    </div>
    <div class="phone-shell" aria-label="${escapeHtml(model.name)} 移动端容器">
      <img class="phone-frame" src="./设备外壳.png" alt="" aria-hidden="true">
      <div class="phone-screen">
        <header class="mobile-app-bar">
          <span>当前 query</span>
          <strong>${escapeHtml(truncateChars(query, 24))}</strong>
        </header>
        <div class="markdown-body mobile-content">${renderOutputContent(output)}</div>
      </div>
    </div>
  `;
  enhanceMarkdownBody(article.querySelector(".markdown-body"), state.currentIndex, modelIndex);
  return article;
}

function renderCurrent() {
  const row = state.rows[state.currentIndex];
  const filteredPosition = state.filteredIndexes.indexOf(state.currentIndex);
  const hasRow = Boolean(row);
  const hasDataset = state.rows.length > 0;

  els.compareArea.classList.toggle("is-empty", !hasDataset);
  els.compareGrid.classList.toggle("is-one", state.models.length === 1);
  els.compareGrid.classList.toggle("is-two", state.models.length === 2);
  els.compareGrid.classList.toggle("is-mobile-mode", state.containerMode === "mobile");
  els.prevBtn.disabled = state.filteredIndexes.length <= 1;
  els.nextBtn.disabled = state.filteredIndexes.length <= 1;
  els.shuffleBtn.disabled = state.filteredIndexes.length <= 1;
  els.shareImageBtn.disabled = !hasRow || state.models.length < 2;
  els.exportRatingsBtn.disabled = !hasDataset || state.models.length < 2;
  els.summaryViewBtn.disabled = !hasDataset;
  els.matchStat.textContent = `${state.filteredIndexes.length} 条结果`;
  els.positionStat.textContent = hasRow ? `${filteredPosition + 1} / ${state.filteredIndexes.length}` : "0 / 0";
  els.compareGrid.innerHTML = "";
  hideSegmentToolbar();
  hideSegmentReasonPanel();
  state.pendingSegmentSelection = null;
  renderContainerModeSwitch();
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
    const article = state.containerMode === "mobile"
      ? createMobileModelPane(model, output, getRowLabel(row))
      : createWebModelPane(model, output);
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

const canvasFontFamily = "Arial, \"PingFang SC\", \"Microsoft YaHei\", sans-serif";
const canvasMonoFontFamily = "\"SFMono-Regular\", Consolas, monospace";

function canvasFont({ size = 18, weight = 400, italic = false, mono = false } = {}) {
  return `${italic ? "italic " : ""}${weight} ${size}px ${mono ? canvasMonoFontFamily : canvasFontFamily}`;
}

function stripCanvasMarkdown(value) {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt) => alt || "图片")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function parseCanvasInlineMarkdown(value) {
  const text = String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt) => (alt ? `图片：${alt}` : "图片"))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const segments = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      segments.push({ text: match[1], code: true });
    } else if (match[2] || match[3]) {
      segments.push({ text: match[2] || match[3], bold: true });
    } else {
      segments.push({ text: match[4] || match[5], italic: true });
    }

    lastIndex = pattern.lastIndex;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

function sameCanvasSegmentStyle(first, second) {
  return Boolean(first.bold) === Boolean(second.bold) &&
    Boolean(first.italic) === Boolean(second.italic) &&
    Boolean(first.code) === Boolean(second.code);
}

function segmentCanvasFont(segment, style) {
  return canvasFont({
    size: style.size,
    weight: segment.bold ? style.boldWeight : style.weight,
    italic: segment.italic,
    mono: segment.code,
  });
}

function appendCanvasSegment(line, segment, text) {
  const last = line[line.length - 1];
  if (last && sameCanvasSegmentStyle(last, segment)) {
    last.text += text;
    return;
  }
  line.push({
    text,
    bold: segment.bold,
    italic: segment.italic,
    code: segment.code,
  });
}

function wrapCanvasSegments(ctx, segments, maxWidth, style) {
  const lines = [];
  let line = [];
  let lineWidth = 0;

  segments.forEach((segment) => {
    Array.from(segment.text).forEach((char) => {
      ctx.font = segmentCanvasFont(segment, style);
      const charWidth = ctx.measureText(char).width;
      if (line.length > 0 && lineWidth + charWidth > maxWidth) {
        lines.push(line);
        line = [];
        lineWidth = 0;
        if (char.trim() === "") return;
      }
      appendCanvasSegment(line, segment, char);
      lineWidth += charWidth;
    });
  });

  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [[{ text: "" }]];
}

function wrapCanvasText(ctx, text, maxWidth, style = {}) {
  const lines = [];
  const fontStyle = {
    size: style.size || 18,
    weight: style.weight || 400,
    mono: style.mono || false,
  };
  const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split("\n");

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let line = "";
    Array.from(paragraph).forEach((char) => {
      ctx.font = canvasFont(fontStyle);
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

function parseCanvasMarkdown(markdown) {
  const lines = String(markdown || "该模型没有输出内容").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      blocks.push({ type: "space" });
      continue;
    }

    if (/^```/.test(trimmed)) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", text: codeLines.join("\n") || " " });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      continue;
    }

    if (line.includes("|") && isTableDivider(lines[index + 1] || "")) {
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "quote", text: quoteLines.join(" ") });
      continue;
    }

    const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/);
    const ordered = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items = [];
      while (index < lines.length) {
        const current = lines[index];
        const itemMatch = orderedList
          ? current.match(/^(\s*)\d+\.\s+(.+)$/)
          : current.match(/^(\s*)[-*+]\s+(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[2].trim());
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "list", ordered: orderedList, items });
      continue;
    }

    const paragraphLines = [trimmed];
    while (index + 1 < lines.length && lines[index + 1].trim() && !isBlockStart(lines[index + 1], lines[index + 2] || "")) {
      paragraphLines.push(lines[index + 1].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks.filter((block, index, allBlocks) => {
    if (block.type !== "space") return true;
    return index > 0 && index < allBlocks.length - 1 && allBlocks[index - 1].type !== "space";
  });
}

function drawCanvasInlineLines(ctx, lines, x, y, lineHeight, style) {
  let currentY = y;

  lines.forEach((line) => {
    let currentX = x;
    line.forEach((segment) => {
      ctx.font = segmentCanvasFont(segment, style);
      ctx.fillStyle = segment.code ? "#0f766e" : style.color;
      ctx.fillText(segment.text, currentX, currentY + lineHeight * 0.76);
      currentX += ctx.measureText(segment.text).width;
    });
    currentY += lineHeight;
  });

  return currentY;
}

function drawCanvasPlainLines(ctx, lines, x, y, lineHeight, style) {
  ctx.font = canvasFont(style);
  ctx.fillStyle = style.color;
  let currentY = y;

  lines.forEach((line) => {
    ctx.fillText(line, x, currentY + lineHeight * 0.76);
    currentY += lineHeight;
  });

  return currentY;
}

function measureCanvasMarkdown(ctx, blocks, maxWidth) {
  return renderCanvasMarkdown(ctx, blocks, 0, 0, maxWidth, Infinity, false);
}

function renderCanvasMarkdown(ctx, blocks, x, y, maxWidth, maxY, shouldDraw = true) {
  let currentY = y;
  let isTruncated = false;

  function hasRoom(height) {
    if (!shouldDraw || currentY + height <= maxY) return true;
    if (!isTruncated) {
      ctx.font = canvasFont({ size: 17, weight: 700 });
      ctx.fillStyle = "#657281";
      ctx.fillText("...... 内容过长，图片已截断", x, Math.max(currentY + 22, maxY - 6));
      isTruncated = true;
    }
    return false;
  }

  function blockGap(index) {
    return index === 0 ? 0 : 10;
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block.type === "space") {
      currentY += 8;
      continue;
    }

    if (block.type === "heading") {
      const sizeMap = { 1: 25, 2: 22, 3: 20 };
      const size = sizeMap[block.level] || 18;
      const lineHeight = size + 10;
      const style = { size, weight: 700, boldWeight: 700, color: "#17202a" };
      const lines = wrapCanvasSegments(ctx, parseCanvasInlineMarkdown(block.text), maxWidth, style);
      const height = blockGap(index) + lines.length * lineHeight + 8;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      if (shouldDraw) drawCanvasInlineLines(ctx, lines, x, currentY, lineHeight, style);
      currentY += lines.length * lineHeight + 8;
      continue;
    }

    if (block.type === "paragraph") {
      const style = { size: 18, weight: 400, boldWeight: 700, color: "#17202a" };
      const lineHeight = 29;
      const lines = wrapCanvasSegments(ctx, parseCanvasInlineMarkdown(block.text), maxWidth, style);
      const height = blockGap(index) + lines.length * lineHeight + 10;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      if (shouldDraw) drawCanvasInlineLines(ctx, lines, x, currentY, lineHeight, style);
      currentY += lines.length * lineHeight + 10;
      continue;
    }

    if (block.type === "list") {
      const style = { size: 18, weight: 400, boldWeight: 700, color: "#17202a" };
      const lineHeight = 28;
      const indent = 28;
      const renderedItems = block.items.map((item) => wrapCanvasSegments(ctx, parseCanvasInlineMarkdown(item), maxWidth - indent, style));
      const height = blockGap(index) + renderedItems.reduce((sum, lines) => sum + lines.length * lineHeight + 6, 0) + 4;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      renderedItems.forEach((lines, itemIndex) => {
        if (shouldDraw) {
          ctx.font = canvasFont({ size: 18, weight: 700 });
          ctx.fillStyle = "#0f766e";
          ctx.fillText(block.ordered ? `${itemIndex + 1}.` : "•", x, currentY + lineHeight * 0.76);
          drawCanvasInlineLines(ctx, lines, x + indent, currentY, lineHeight, style);
        }
        currentY += lines.length * lineHeight + 6;
      });
      currentY += 4;
      continue;
    }

    if (block.type === "quote") {
      const style = { size: 17, weight: 400, boldWeight: 700, color: "#334155" };
      const lineHeight = 27;
      const lines = wrapCanvasSegments(ctx, parseCanvasInlineMarkdown(block.text), maxWidth - 30, style);
      const height = blockGap(index) + lines.length * lineHeight + 24;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      if (shouldDraw) {
        drawRoundedRect(ctx, x, currentY, maxWidth, height - blockGap(index), 8);
        ctx.fillStyle = "#f1faf8";
        ctx.fill();
        ctx.fillStyle = "#0f766e";
        ctx.fillRect(x, currentY + 12, 4, height - blockGap(index) - 24);
        drawCanvasInlineLines(ctx, lines, x + 18, currentY + 12, lineHeight, style);
      }
      currentY += height - blockGap(index) + 10;
      continue;
    }

    if (block.type === "code") {
      const style = { size: 15, weight: 400, mono: true, color: "#334155" };
      const lineHeight = 24;
      const lines = wrapCanvasText(ctx, block.text, maxWidth - 24, style);
      const height = blockGap(index) + lines.length * lineHeight + 24;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      if (shouldDraw) {
        drawRoundedRect(ctx, x, currentY, maxWidth, height - blockGap(index), 8);
        ctx.fillStyle = "#eef2f7";
        ctx.fill();
        drawCanvasPlainLines(ctx, lines, x + 12, currentY + 12, lineHeight, style);
      }
      currentY += height - blockGap(index) + 10;
      continue;
    }

    if (block.type === "table") {
      const columnCount = Math.min(Math.max(block.headers.length, 1), 4);
      const columnWidth = maxWidth / columnCount;
      const rows = [block.headers, ...block.rows];
      const style = { size: 15, weight: 400, color: "#334155" };
      const lineHeight = 23;
      const rowLayouts = rows.map((row) => {
        const cells = Array.from({ length: columnCount }, (_item, cellIndex) =>
          wrapCanvasText(ctx, stripCanvasMarkdown(row[cellIndex] || ""), columnWidth - 20, style)
        );
        const rowHeight = Math.max(...cells.map((cellLines) => cellLines.length)) * lineHeight + 16;
        return { cells, rowHeight };
      });
      const height = blockGap(index) + rowLayouts.reduce((sum, row) => sum + row.rowHeight, 0) + 2;
      if (!hasRoom(height)) return currentY;
      currentY += blockGap(index);
      if (shouldDraw) {
        let tableY = currentY;
        rowLayouts.forEach((row, rowIndex) => {
          ctx.fillStyle = rowIndex === 0 ? "#e8f0ff" : "#ffffff";
          ctx.fillRect(x, tableY, maxWidth, row.rowHeight);
          ctx.strokeStyle = "#d8dee7";
          ctx.strokeRect(x, tableY, maxWidth, row.rowHeight);
          row.cells.forEach((cellLines, cellIndex) => {
            ctx.strokeStyle = "#d8dee7";
            ctx.strokeRect(x + cellIndex * columnWidth, tableY, columnWidth, row.rowHeight);
            drawCanvasPlainLines(
              ctx,
              cellLines,
              x + cellIndex * columnWidth + 10,
              tableY + 8,
              lineHeight,
              { ...style, weight: rowIndex === 0 ? 700 : 400 }
            );
          });
          tableY += row.rowHeight;
        });
      }
      currentY += height + 10;
    }
  }

  return currentY - y;
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

function safeSheetName(value) {
  return String(value || "评分结果")
    .replace(/[\\/*?:[\]]+/g, " ")
    .trim()
    .slice(0, 31) || "评分结果";
}

function formatDateForFilename(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function makeUniqueHeaders(headers, extraHeaders) {
  const used = new Map();
  const unique = [];

  headers.concat(extraHeaders).forEach((header, index) => {
    const fallback = index < headers.length ? `原始列${index + 1}` : `评分列${index - headers.length + 1}`;
    const base = String(header || fallback).trim() || fallback;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    unique.push(count === 0 ? base : `${base}_${count + 1}`);
  });

  return unique;
}

function getSegmentFeedbackCount(rowIndex, modelIndex, type) {
  return state.segmentFeedbacks.filter((feedback) => (
    feedback.rowIndex === rowIndex &&
    feedback.modelIndex === modelIndex &&
    feedback.type === type
  )).length;
}

function buildRatingExportRows() {
  const extraHeaders = [
    "评分结果",
    "胜出模型",
    "左侧模型列名",
    "右侧模型列名",
    "是否已评分",
    "左侧局部好评数",
    "左侧局部差评数",
    "右侧局部好评数",
    "右侧局部差评数",
    "局部反馈总数",
  ];
  const headers = makeUniqueHeaders(state.originalHeaders, extraHeaders);
  const leftModel = state.models[0]?.name || "左侧模型";
  const rightModel = state.models[1]?.name || "右侧模型";
  const rows = state.rows.map((row, rowIndex) => {
    const rating = getRating(rowIndex);
    const ratingLabel = ratingOptions[rating]?.label || "未评分";
    const winner = rating === "first"
      ? leftModel
      : rating === "second"
        ? rightModel
        : rating === "same"
          ? "相同"
          : "";
    const originalCells = state.originalRows[rowIndex] || row.originalCells || [];
    const leftGood = getSegmentFeedbackCount(rowIndex, 0, "good");
    const leftBad = getSegmentFeedbackCount(rowIndex, 0, "bad");
    const rightGood = getSegmentFeedbackCount(rowIndex, 1, "good");
    const rightBad = getSegmentFeedbackCount(rowIndex, 1, "bad");

    return [
      ...state.originalHeaders.map((_header, columnIndex) => originalCells[columnIndex] || ""),
      ratingLabel,
      winner,
      leftModel,
      rightModel,
      rating ? "是" : "否",
      leftGood,
      leftBad,
      rightGood,
      rightBad,
      leftGood + leftBad + rightGood + rightBad,
    ];
  });

  return [headers, ...rows];
}

function buildSegmentFeedbackExportRows() {
  const headers = [
    "query",
    "模型名称",
    "模型列名",
    "反馈类型",
    "选中文本",
    "反馈原因",
    "前文",
    "后文",
    "文本起始位置",
    "文本结束位置",
    "原始行号",
    "创建时间",
  ];
  const rows = state.segmentFeedbacks
    .slice()
    .sort((a, b) => a.rowIndex - b.rowIndex || a.modelIndex - b.modelIndex || a.startOffset - b.startOffset)
    .map((feedback) => {
      const row = state.rows[feedback.rowIndex];
      const model = state.models[feedback.modelIndex];
      return [
        row ? getRowLabel(row) : "",
        model?.name || "",
        model?.name || "",
        segmentFeedbackOptions[feedback.type]?.label || "",
        feedback.selectedText || "",
        feedback.reason || "",
        feedback.beforeContext || "",
        feedback.afterContext || "",
        feedback.startOffset,
        feedback.endOffset,
        feedback.rowIndex + 2,
        feedback.createdAt || "",
      ];
    });

  return [headers, ...rows];
}

function downloadRatingsWorkbook() {
  if (!state.rows.length || state.models.length < 2) return;

  if (!window.XLSX) {
    alert("XLSX 导出库加载失败，请刷新页面后重试");
    return;
  }

  const workbook = window.XLSX.utils.book_new();
  const rows = buildRatingExportRows();
  const worksheet = window.XLSX.utils.aoa_to_sheet(rows);
  const widths = rows[0].map((_header, columnIndex) => {
    const maxLength = Math.max(
      ...rows.slice(0, 30).map((row) => String(row[columnIndex] || "").length),
      String(rows[0][columnIndex] || "").length
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 36) };
  });

  worksheet["!cols"] = widths;
  window.XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName("原始数据+评分"));

  const segmentRows = buildSegmentFeedbackExportRows();
  const segmentWorksheet = window.XLSX.utils.aoa_to_sheet(segmentRows);
  segmentWorksheet["!cols"] = segmentRows[0].map((_header, columnIndex) => {
    const maxLength = Math.max(
      ...segmentRows.slice(0, 30).map((row) => String(row[columnIndex] || "").length),
      String(segmentRows[0][columnIndex] || "").length
    );
    return { wch: Math.min(Math.max(maxLength + 2, 10), 42) };
  });
  window.XLSX.utils.book_append_sheet(workbook, segmentWorksheet, safeSheetName("局部反馈明细"));

  window.XLSX.writeFile(
    workbook,
    `评分结果-${safeFilename(state.sourceName || "评测数据")}-${formatDateForFilename(new Date())}.xlsx`
  );
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
  const maxCanvasHeight = 30000;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const query = getRowLabel(row);

  const leftBlocks = parseCanvasMarkdown(row.outputs[0] || "该模型没有输出内容");
  const rightBlocks = parseCanvasMarkdown(row.outputs[1] || "该模型没有输出内容");
  const markdownWidth = columnWidth - columnPadding * 2;
  const leftHeight = measureCanvasMarkdown(ctx, leftBlocks, markdownWidth);
  const rightHeight = measureCanvasMarkdown(ctx, rightBlocks, markdownWidth);
  const contentHeight = Math.max(leftHeight, rightHeight) + columnHeaderHeight + columnPadding * 2;
  const canvasHeight = Math.min(maxCanvasHeight, headerHeight + contentHeight + padding);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#17202a";
  ctx.font = canvasFont({ size: 34, weight: 700 });
  ctx.fillText("模型效果对比", padding, 64);

  ctx.fillStyle = "#657281";
  ctx.font = canvasFont({ size: 18, weight: 400 });
  ctx.fillText(`${state.sourceName || "评测数据"} · ${new Date().toLocaleString()}`, padding, 98);

  ctx.fillStyle = "#0b5f59";
  ctx.font = canvasFont({ size: 20, weight: 700 });
  ctx.fillText("当前 query", padding, 142);

  ctx.fillStyle = "#17202a";
  ctx.font = canvasFont({ size: 24, weight: 700 });
  ctx.fillText(truncateChars(query, 20), padding, 178);

  const columns = [
    {
      x: padding,
      title: state.models[0].name,
      blocks: leftBlocks,
      color: "#0f766e",
      soft: "#e3f3f0",
    },
    {
      x: padding + columnWidth + gap,
      title: state.models[1].name,
      blocks: rightBlocks,
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
    ctx.font = canvasFont({ size: 22, weight: 700 });
    ctx.fillText(column.title, column.x + columnPadding, y + 42);

    renderCanvasMarkdown(
      ctx,
      column.blocks,
      column.x + columnPadding,
      y + columnHeaderHeight + columnPadding,
      markdownWidth,
      canvasHeight - padding - 18,
      true
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
      clearSavedRatings();
      normalizeRows(rows, file.name, { loadRatings: false });
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
  els.exportRatingsBtn.addEventListener("click", downloadRatingsWorkbook);
  els.containerModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.containerMode = button.dataset.containerMode || "web";
      renderCurrent();
      resetCompareScroll();
    });
  });
  els.compareGrid.addEventListener("mouseup", (event) => {
    window.setTimeout(() => captureSegmentSelection(event), 0);
  });
  els.segmentToolbar.querySelectorAll("[data-segment-type]").forEach((button) => {
    button.addEventListener("click", () => openSegmentReasonPanel(button.dataset.segmentType));
  });
  els.segmentConfirmBtn.addEventListener("click", confirmSegmentFeedback);
  els.segmentCancelBtn.addEventListener("click", () => {
    hideSegmentReasonPanel();
    hideSegmentToolbar();
    state.pendingSegmentSelection = null;
    window.getSelection()?.removeAllRanges();
  });
  els.closeSegmentFeedbackBtn.addEventListener("click", closeSegmentFeedbackPanel);
  els.compareGrid.addEventListener("click", (event) => {
    const listButton = event.target.closest("[data-feedback-list]");
    if (listButton) {
      openSegmentFeedbackPanel(Number(listButton.dataset.feedbackList));
    }
  });
  els.segmentFeedbackList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-segment]");
    if (deleteButton) deleteSegmentFeedback(deleteButton.dataset.deleteSegment);
  });
  document.addEventListener("mousedown", (event) => {
    if (
      !els.segmentToolbar.hidden &&
      !els.segmentToolbar.contains(event.target) &&
      !event.target.closest(".markdown-body")
    ) {
      hideSegmentToolbar();
    }
  });
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
