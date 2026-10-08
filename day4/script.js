// ---------- 1. Select the elements ----------
const textarea = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearBtn = document.querySelector("#clear-btn");
const themeBtn = document.querySelector("#theme-toggle");

const MAX_CHARS = 200;
const WARNING_AT = 180;
const DRAFT_KEY = "quicknotes-draft";
const THEME_KEY = "quicknotes-theme";

// ---------- 2. Counters ----------
function updateCounts() {
  const text = textarea.value;
  const length = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${length} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} words`;

  // Over 200: red and bold. Over 180: orange. Otherwise: normal.
  charCount.classList.toggle("over", length > MAX_CHARS);
  charCount.classList.toggle("warning", length > WARNING_AT && length <= MAX_CHARS);
}

// ---------- 3. Draft ----------
function saveDraft() {
  localStorage.setItem(DRAFT_KEY, textarea.value);
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved !== null) {
    textarea.value = saved;
  }
}

function clearAll() {
  textarea.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
  textarea.focus();
}

// ---------- 4. Theme ----------
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeBtn.textContent = isDark ? "Light mode" : "Dark mode";
}

function loadTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) === "dark");
}

// ---------- 5. Listeners ----------
textarea.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

textarea.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearAll();
  }
});

clearBtn.addEventListener("click", clearAll);

themeBtn.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

// ---------- 6. Start-up ----------
loadDraft();
loadTheme();
updateCounts();
