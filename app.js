const CSV_PATH = "links.csv";
const ITEMS_PER_PAGE = 30;
const OPEN_BEFORE = 2;
const OPEN_AFTER = 2;
const CENTER_LOCK_RATIO = 0.18;

let allItems = [];
let filteredItems = [];
let currentPage = 1;
let currentQuery = "";
let currentCenterIndex = 0;
let scrollTicking = false;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const csvText = await fetchCsv(CSV_PATH);
    const parsedRows = parseCsv(csvText);

    allItems = parsedRows
      .map((row, index) => normalizeRow(row, index))
      .filter(item => item && item.url);

    filteredItems = [...allItems];
    currentPage = getPageFromUrl();

    wireSearch();
    wireScrollCentering();
    render();
  } catch (error) {
    console.error("Gallery init failed:", error);
    setStatus("Could not load links.csv");
    renderError("Failed to load gallery data.");
  }
});

async function fetchCsv(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(value => value !== "")) rows.push(row);
  }

  return rows;
}

function normalizeRow(row, index) {
  if (!row || !row.length) return null;

  const first = (row[0] || "").trim();
  const second = (row[1] || "").trim();
  const third = (row[2] || "").trim();

  const looksLikeHeader =
    index === 0 &&
    (
      first.toLowerCase() === "url" ||
      second.toLowerCase() === "title" ||
      third.toLowerCase() === "note"
    );

  if (looksLikeHeader || !first) return null;

  const fixedUrl = normalizePdfUrl(first);

  return {
    url: fixedUrl,
    title: second || deriveTitleFromUrl(fixedUrl, index + 1),
    note: third || ""
  };
}

function normalizePdfUrl(url) {
  const trimmed = String(url).trim();
  const driveMatch = trimmed.match(/^https:\/\/drive\.google\.com\/file\/d\/([^/]+).*$/i);
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return trimmed;
}

function deriveTitleFromUrl(url, fallbackNumber) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    if (lastSegment) return decodeURIComponent(lastSegment);
  } catch (_) {}
  return `PDF ${fallbackNumber}`;
}

function wireSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", event => {
    currentQuery = event.target.value.trim().toLowerCase();
    currentPage = 1;
    render();
  });
}

function wireScrollCentering() {
  window.addEventListener("scroll", () => {
    if (scrollTicking) return;

    scrollTicking = true;
    requestAnimationFrame(() => {
      updateCenterFromViewport();
      scrollTicking = false;
    });
  }, { passive: true });

  window.addEventListener("resize", () => {
    requestAnimationFrame(updateCenterFromViewport);
  });
}

function applyFilter() {
  if (!currentQuery) {
    filteredItems = [...allItems];
    return;
  }

  filteredItems = allItems.filter(item => {
    const haystack = `${item.title} ${item.note} ${item.url}`.toLowerCase();
    return haystack.includes(currentQuery);
  });
}

function render() {
  applyFilter();

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  currentPage = clamp(currentPage, 1, totalPages);
  setPageInUrl(currentPage);

  renderGallery();
  renderPagination(totalPages);
  renderStatus(totalPages);

  requestAnimationFrame(() => {
    currentCenterIndex = findBestCenterIndex();
    updateActiveWindow(currentCenterIndex);
  });
}

function renderGallery() {
  const gallery = document.getElementById("gallery");
  if (!gallery) return;

  gallery.innerHTML = "";

  if (!filteredItems.length) {
    gallery.innerHTML = `<div class="empty-state">No results found.</div>`;
    return;
  }

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, filteredItems.length);
  const pageItems = filteredItems.slice(start, end);

  pageItems.forEach((item, indexOnPage) => {
    const safeTitle = escapeHtml(item.title || "Untitled");
    const safeNote = escapeHtml(item.note || "");
    const safeUrl = escapeAttribute(item.url);

    const card = document.createElement("article");
    card.className = "pdf-card";
    card.dataset.index = String(indexOnPage);

    card.innerHTML = `
      <div class="pdf-card__header">
        <h2 class="pdf-card__title">${safeTitle}</h2>
        ${safeNote ? `<p class="pdf-card__note">${safeNote}</p>` : ""}
      </div>

      <div class="pdf-card__viewer" data-url="${safeUrl}" data-title="${safeTitle}">
        ${buildPlaceholderHtml()}
      </div>

      <div class="pdf-card__actions">
        <a class="pdf-card__open-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open PDF</a>
      </div>
    `;

    gallery.appendChild(card);
  });
}

function updateCenterFromViewport() {
  const nextIndex = findBestCenterIndex();
  if (nextIndex === currentCenterIndex) return;

  currentCenterIndex = nextIndex;
  updateActiveWindow(currentCenterIndex);
}

function findBestCenterIndex() {
  const cards = Array.from(document.querySelectorAll(".pdf-card"));
  if (!cards.length) return 0;

  const viewportCenter = window.innerHeight * 0.5;
  let bestIndex = 0;
  let bestDistance = Infinity;

  cards.forEach(card => {
    const rect = card.getBoundingClientRect();

    if (rect.bottom < window.innerHeight * 0.05 || rect.top > window.innerHeight * 0.95) {
      return;
    }

    const cardCenter = rect.top + rect.height / 2;
    const distance = Math.abs(cardCenter - viewportCenter);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = parseInt(card.dataset.index || "0", 10);
    }
  });

  return bestIndex;
}

function updateActiveWindow(centerIndex) {
  const cards = document.querySelectorAll(".pdf-card");

  cards.forEach(card => {
    const index = parseInt(card.dataset.index || "0", 10);
    const viewer = card.querySelector(".pdf-card__viewer");
    if (!viewer) return;

    const url = viewer.dataset.url || "";
    const title = viewer.dataset.title || "PDF Preview";

    const shouldOpen = index >= centerIndex - OPEN_BEFORE && index <= centerIndex + OPEN_AFTER;
    const hasIframe = !!viewer.querySelector("iframe");

    if (shouldOpen && !hasIframe) {
      viewer.innerHTML = buildIframeHtml(url, title);
    } else if (!shouldOpen && hasIframe) {
      viewer.innerHTML = buildPlaceholderHtml();
    }
  });
}

function buildIframeHtml(url, title) {
  return `
    <iframe
      class="pdf-card__iframe"
      src="${escapeAttribute(url)}"
      title="${escapeAttribute(title)}"
      loading="lazy"
      referrerpolicy="no-referrer"
      allowfullscreen
    ></iframe>
  `;
}

function buildPlaceholderHtml() {
  return `
    <div class="pdf-card__placeholder">
      <p>Preview loads automatically near the viewport.</p>
    </div>
  `;
}

function renderPagination(totalPages) {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;

  pagination.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "pagination";

  wrapper.appendChild(createPageButton("Prev", currentPage > 1, () => {
    currentPage--;
    render();
    scrollToTop();
  }));

  const pages = getPageWindow(currentPage, totalPages, 7);

  pages.forEach(page => {
    if (page === "...") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination__ellipsis";
      ellipsis.textContent = "...";
      wrapper.appendChild(ellipsis);
      return;
    }

    const button = createPageButton(String(page), true, () => {
      currentPage = page;
      render();
      scrollToTop();
    });

    if (page === currentPage) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");
    }

    wrapper.appendChild(button);
  });

  wrapper.appendChild(createPageButton("Next", currentPage < totalPages, () => {
    currentPage++;
    render();
    scrollToTop();
  }));

  pagination.appendChild(wrapper);
}

function createPageButton(label, enabled, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pagination__button";
  button.textContent = label;

  if (!enabled) {
    button.disabled = true;
  } else {
    button.addEventListener("click", onClick);
  }

  return button;
}

function getPageWindow(current, total, maxVisible) {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  const innerVisible = maxVisible - 2;
  let start = Math.max(2, current - Math.floor(innerVisible / 2));
  let end = Math.min(total - 1, start + innerVisible - 1);
  start = Math.max(2, end - innerVisible + 1);

  pages.push(1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}

function renderStatus(totalPages) {
  const status = document.getElementById("status");
  if (!status) return;

  if (!filteredItems.length) {
    status.textContent = "0 items";
    return;
  }

  const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length);
  status.textContent = `Showing ${start}-${end} of ${filteredItems.length} • Page ${currentPage} of ${totalPages}`;
}

function renderError(message) {
  const gallery = document.getElementById("gallery");
  if (!gallery) return;
  gallery.innerHTML = `<div class="error-state">${escapeHtml(message)}</div>`;
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) status.textContent = message;
}

function getPageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const page = parseInt(params.get("page") || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function setPageInUrl(page) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  window.history.replaceState({}, "", url);
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
