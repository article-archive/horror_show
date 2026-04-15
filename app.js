const PAGE_SIZE = 30;
const CSV_PATH = "links.csv";

const listEl = document.getElementById("list");
const errorBox = document.getElementById("errorBox");
const countLabel = document.getElementById("countLabel");
const pageLabel = document.getElementById("pageLabel");
const searchInput = document.getElementById("searchInput");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageNumbers = document.getElementById("pageNumbers");

let allItems = [];
let filteredItems = [];
let currentPage = getPageFromUrl();
let currentQuery = new URLSearchParams(location.search).get("q") || "";

searchInput.value = currentQuery;

init();

async function init() {
  try {
    const response = await fetch(CSV_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${CSV_PATH}. Make sure it exists in the site root.`);
    }
    const csvText = await response.text();
    allItems = normalizeRows(parseCsv(csvText));
    filteredItems = applySearch(allItems, currentQuery);
    clampPage();
    render();
  } catch (error) {
    showError(error.message);
    console.error(error);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += ch;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows
    .map(cols => cols.map(col => col.trim()))
    .filter(cols => cols.some(col => col.length));
}

function normalizeRows(rows) {
  if (!rows.length) return [];

  const firstCell = (rows[0][0] || "").toLowerCase();
  const looksLikeHeader = ["url", "link", "pdf", "href"].includes(firstCell);

  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  return dataRows
    .map((cols, index) => {
      const url = (cols[0] || "").trim();
      const title = (cols[1] || "").trim() || `PDF ${index + 1}`;
      const note = (cols[2] || "").trim();
      return {
        id: index + 1,
        url,
        title,
        note
      };
    })
    .filter(item => item.url);
}

function applySearch(items, query) {
  if (!query) return items.slice();
  const q = query.toLowerCase();
  return items.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.url.toLowerCase().includes(q) ||
    item.note.toLowerCase().includes(q)
  );
}

function render() {
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  listEl.innerHTML = "";

  if (!pageItems.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = "<h2>No results</h2><div class='url'>Try a different search or check links.csv.</div>";
    listEl.appendChild(empty);
  } else {
    for (const item of pageItems) {
      const card = document.createElement("article");
      card.className = "card";

      const safeTitle = escapeHtml(item.title);
      const safeUrl = escapeHtml(item.url);
      const safeNote = escapeHtml(item.note || "");

      card.innerHTML = `
        <h2>${safeTitle}</h2>
        <div class="url">${safeUrl}</div>
        ${safeNote ? `<div class="url" style="margin-top:0.35rem">${safeNote}</div>` : ""}
        <div class="actions">
          <a class="linkbtn" href="${item.url}" target="_blank" rel="noopener noreferrer">Open PDF</a>
          <a class="linkbtn" href="${item.url}" download>Download</a>
        </div>
      `;
      listEl.appendChild(card);
    }
  }

  countLabel.textContent = `${filteredItems.length} PDF${filteredItems.length === 1 ? "" : "s"} total`;
  pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  renderPageNumbers(totalPages);
  updateUrl();
}

function renderPageNumbers(totalPages) {
  pageNumbers.innerHTML = "";
  const visiblePages = buildPageList(currentPage, totalPages);

  visiblePages.forEach(page => {
    if (page === "...") {
      const spacer = document.createElement("span");
      spacer.textContent = "...";
      spacer.className = "btn page-pill";
      spacer.style.cursor = "default";
      spacer.setAttribute("aria-hidden", "true");
      pageNumbers.appendChild(spacer);
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn page-pill" + (page === currentPage ? " active" : "");
    btn.textContent = page;
    btn.addEventListener("click", () => {
      currentPage = page;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    pageNumbers.appendChild(btn);
  });
}

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("...");

  for (let i = start; i <= end; i++) pages.push(i);

  if (end < total - 1) pages.push("...");

  pages.push(total);
  return pages;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function getPageFromUrl() {
  const value = Number(new URLSearchParams(location.search).get("page") || "1");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function clampPage() {
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
}

function updateUrl() {
  const params = new URLSearchParams();
  if (currentPage > 1) params.set("page", String(currentPage));
  if (currentQuery) params.set("q", currentQuery);
  const nextUrl = `${location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
  history.replaceState({}, "", nextUrl);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

prevBtn.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

nextBtn.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage++;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

searchInput.addEventListener("input", (event) => {
  currentQuery = event.target.value.trim();
  filteredItems = applySearch(allItems, currentQuery);
  currentPage = 1;
  clampPage();
  render();
});
