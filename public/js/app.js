import { initRonna } from "./utils/ronnaBase.js";
import { authService } from "./services/authService.js";
import { saveDoc, getUserDocs, tsToString } from "./services/firestoreService.js";
import { apiFetch } from "./config/env.js";
import { toast } from "./utils/toast.js";
import { gate } from "./services/paywallUI.js";
import { downloadText, setLoading, formatNumber } from "./utils/helpers.js";


let results = [];
let currentUser = null;

initRonna({ usageAction: "lookups" }).then(user => {
  currentUser = user;
  if (user) loadHistory();
});



// ─── Build tool UI ────────────────────────────────────────────────────────────
// ─── Find ─────────────────────────────────────────────────────────────────────
document.getElementById("btn-find").addEventListener("click", () => {
  const company = document.getElementById("filter-company").value.trim();
  if (!company) return toast.warning("Please enter a company name or domain.");
  gate("lookups", () => runFind(company), () => {});
});

async function runFind(company) {
  document.querySelector(".btn-text").classList.add("hidden");
  document.querySelector(".btn-loader").classList.remove("hidden");
  document.getElementById("btn-find").disabled = true;

  try {
    const data = await apiFetch("/api/contacts/find", {
        company,
        titleFilter: document.getElementById("filter-title")?.value,
        department: document.getElementById("filter-dept")?.value,
        seniority: document.getElementById("filter-seniority")?.value
    });
    results = data?.contacts || null;
  } catch {
    results = null;
  }

  if (results) renderResults(results); else showUnavailable();
  document.querySelector(".btn-text").classList.remove("hidden");
  document.querySelector(".btn-loader").classList.add("hidden");
  document.getElementById("btn-find").disabled = false;
}

function renderResults(contacts) {
  document.getElementById("results-count").textContent = contacts.length;
  document.getElementById("contacts-tbody").innerHTML = contacts.map(c => `
    <tr>
      <td><input type="checkbox" class="row-check" /></td>
      <td><strong>${c.name}</strong></td>
      <td>${c.title}</td>
      <td>${c.company}</td>
      <td>${c.email ? `<a href="mailto:${c.email}">${c.email}</a>` : "—"}</td>
      <td>${c.phone || "—"}</td>
      <td>${c.linkedin ? `<a href="${c.linkedin}" target="_blank">View</a>` : "—"}</td>
      <td><span class="tag ${c.confidence >= 80 ? "tag-green" : c.confidence >= 60 ? "tag-orange" : "tag-gray"}">${c.confidence}%</span></td>
    </tr>`).join("");
  document.getElementById("results-panel").classList.remove("hidden");
  document.getElementById("results-panel").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btn-export-csv")?.addEventListener("click", () => {
  if (!results.length) return;
  downloadFile(toCSV(results, ["name","title","company","email","phone","linkedin","confidence"]), "contacts.csv");
});

document.getElementById("btn-save")?.addEventListener("click", async () => {
  if (!results.length) return;
  if (!(await saveToFirestore("saved-contacts", { contacts: results, company: document.getElementById("filter-company").value }))) return;
  loadHistory(); toast.success("Saved!");
});

async function loadHistory() {
  const grid = document.getElementById("history-grid");
  if (!grid) return; // no history UI on this page
  const items = await getFromFirestore("saved-contacts");
  document.getElementById("history-section").classList.remove("hidden");
  grid.innerHTML = items.length
    ? items.map(i => `<div class="result-card"><div class="result-count">${i.contacts?.length || 0}</div><strong>${i.company || "Search"}</strong><small>${i.createdAt?.toDate?.().toLocaleDateString?.() || "Recently"}</small></div>`).join("")
    : "<p class='empty-state'>No saved searches yet.</p>";
}

// RONNA-MOCK-FALLBACK: never fabricate results when the scanner API is unavailable.
function showUnavailable() {
  // Keep the results table in the DOM so a later successful search can render into it.
  results = [];
  document.getElementById("results-panel")?.classList.remove("hidden");
  const count = document.getElementById("results-count");
  if (count) count.textContent = "";
  const tbody = document.getElementById("contacts-tbody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state" role="status"><p><strong>The scanner service is unavailable right now.</strong></p><p>No results were generated. Please try again later.</p></div></td></tr>';
  toast.error("Scanner service unavailable. No results were generated.");
}

// RONNA-LOADLIST-AWAIT-BUG (same class on this sub): saveToFirestore / getFromFirestore
// (and downloadFile / toCSV where used) were called but never defined → ReferenceError on
// Save / history load. Defined here on top of the shared Firestore service.
async function saveToFirestore(collectionName, data) {
  const user = authService.currentUser();
  if (!user) { document.getElementById("auth-modal")?.classList.remove("hidden"); return false; }
  try {
    await saveDoc(collectionName, user.uid, data);
    return true;
  } catch (e) {
    toast.error("Could not save. Please try again.");
    return false;
  }
}

async function getFromFirestore(collectionName) {
  const user = authService.currentUser();
  if (!user) return [];
  try {
    return await getUserDocs(collectionName, user.uid);
  } catch (e) {
    console.warn("[ronna] could not load history", e);
    return [];
  }
}

function toCSV(rows, cols) {
  const esc = v => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}

function downloadFile(text, filename) {
  downloadText(text, filename, "text/csv");
}
