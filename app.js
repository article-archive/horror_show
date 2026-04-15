const CSV_PATH = "links.csv";
const ITEMS_PER_PAGE = 30;
const AUTO_EMBED_COUNT = 6;

let allItems = [];
let filteredItems = [];
let currentPage = 1;
let currentQuery = "";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const csvText = await fetchCsv(CSV_PATH);
    allItems = parseCsv(csvText)
      .map(normalizeRow)
      .filter(item => item.url);

    filteredItems = [...allItems];
    currentPage = getPageFromUrl();

    wireSearch();
    render();
  } catch (error) {
    console.error("Failed to initialize gallery:", error);
    setStatus("Could not load links.csv");
    renderError("Failed to load gallery data.");
  }
});

async function fetchCsv(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
  }
  return await response.text();
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
      if (char === "\r" && next === "\n") {
        i++;
      }
      row.push(cell.trim());
      cell = "";
      if (row.some(value => value !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some(value => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeRow(row, index) {
  const first = row[0] || "";
  const second = row[1] || "";
  const third = row[2] || "";

  const looksLikeHeader =
    index === 0 &&
    (
      first.toLowerCase() === "url" ||
      second.toLowerCase() === "title" ||
      third.toLowerCase() === "note"
    );

  if (looksLikeHeader) {
    return { skip: true };
  }

  return {
    url: first,
    title: second || deriveTitleFromUrl(first, index + 1),
    note: third || ""
  };
}

function deriveTitleFromUrl(url, fallbackNumber) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
    if (lastSegment) {
      return decodeURIComponent(lastSegment);
    }
  } catch (_) {
    // ignore malformed URLs
  }
  return `PDF ${fallbackNumber}`;
}

function wireSearch() {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", (event) => {
    currentQuery = event.target.value.trim().toLowerCase();
    currentPage = 1;
    applyFilter();
    render();
  });
}

function applyFilter() {
  if (!currentQuery) {
    filteredItems = allItems.filter(item => !item.skip);
    return;
  }

  filteredItems = allItems.filter(item => {
    if (item.skip) return false;

    const haystack = [
      item.title || "",
      item.note || "",
      item.url || ""
    ].join(" ").toLowerCase();

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
}

function renderGallery() {
  const gallery = document.getElementById("gallery");
  if (!gallery) {
    console.warn('Missing #gallery element');
    return;
  }

  gallery.innerHTML = "";

  if (filteredItems.length === 0) {
    gallery.innerHTML = `<div class="empty-state">No results found.</div>`;
    return;
  }

  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const end = Math.min(start + ITEMS_PER_PAGE, filteredItems.length);
  const pageItems = filteredItems.slice(start, end);

  pageItems.forEach((item, indexOnPage) => {
    const shouldEmbed =
      indexOnPage < AUTO_EMBED_COUNT ||
      indexOnPage >= pageItems.length - AUTO_EMBED_COUNT;

    const card = document.createElement("article");
    card.className = "pdf-card";

    const safeTitle = escapeHtml(item.title || "Untitled");
    const safeNote = escapeHtml(item.note || "");
    const safeUrl = escapeAttribute(item.url);

    card.innerHTML = `
      <div class="pdf-card__header">
        <h2 class="pdf-card__title">${safeTitle}</h2>
        ${safeNote ? `<p class="pdf-card__note">${safeNote}</p>` : ""}
      </div>

      <div class="pdf-card__viewer" data-url="${safeUrl}">
        ${
          shouldEmbed
            ? buildIframeHtml(safeUrl, safeTitle)
            : `
              <div class="pdf-card__placeholder">
                <p>Preview parked to reduce load.</p>
                <button type="button" class="pdf-card__load-btn">Load Preview</button>
              </div>
            `
        }
      </div>

      <div class="pdf-card__actions">
        <a class="pdf-card__open-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
          Open PDF
        </a>
      </div>
    `;

    gallery.appendChild(card);
  });

  wireLoadPreviewButtons(gallery);
}

function wireLoadPreviewButtons(root) {
  const buttons = root.querySelectorAll(".pdf-card__load-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const viewer = button.closest(".pdf-card__viewer");
      if (!viewer) return;

      const url = viewer.dataset.url || "";
      const titleEl = button.closest(".pdf-card")?.querySelector(".pdf-card__title");
      const title = titleEl ? titleEl.textContent.trim() : "PDF Preview";

      viewer.innerHTML = buildIframeHtml(escapeAttribute(url), escapeHtml(title));
    });
  });
}

function buildIframeHtml(url, title) {
  return `
    <iframe
      class="pdf-card__iframe"
      src="${url}"
      title="${title}"
      loading="lazy"
      referrerpolicy="no-referrer"
    ></iframe>
  `;
}

function renderPagination(totalPages) {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;

  pagination.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "pagination";

  wrapper.appendChild(
    createPageButton("Prev", currentPage > 1, () => {
      currentPage--;
      render();
      scrollToTop();
    })
  );

  const windowPages = getPageWindow(currentPage, totalPages, 7);
  windowPages.forEach((page) => {
    if (page === "...") {
      const span = document.createElement("span");
      span.className = "pagination__ellipsis";
      span.textContent = "...";
      wrapper.appendChild(span);
      return;
    }

    const isActive = page === currentPage;
    const button = createPageButton(String(page), true, () => {
      currentPage = page;
      render();
      scrollToTop();
    });

    if (isActive) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");
    }

    wrapper.appendChild(button);
  });

  wrapper.appendChild(
    createPageButton("Next", currentPage < totalPages, () => {
      currentPage++;
      render();
      scrollToTop();
    })
  );

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
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  const innerVisible = maxVisible - 2;
  let start = Math.max(2, current - Math.floor(innerVisible / 2));
  let end = Math.min(total - 1, start + innerVisible - 1);

  start = Math.max(2, end - innerVisible + 1);

  pages.push(1);

  if (start > 2) {
    pages.push("...");
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (end < total - 1) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}

function renderStatus(totalPages) {
  const start = filteredItems.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length);

  const message = filteredItems.length === 0
    ? "0 items"
    : `Showing ${start}-${end} of ${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"} • Page ${currentPage} of ${totalPages}`;

  setStatus(message);
}

function setStatus(message) {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = message;
  }
}

function renderError(message) {
  const gallery = document.getElementById("gallery");
  if (gallery) {
    gallery.innerHTML = `<div class="error-state">${escapeHtml(message)}</div>`;
  }
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
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
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
