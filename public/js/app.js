import { initRonna } from "./utils/ronnaBase.js";
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
  const company = document.getElementById("company-input").value.trim();
  if (!company) return toast.warning("Please enter a company name or domain.");
  gate("lookups", () => runFind(company), () => {});
});

async function runFind(company) {
  document.querySelector(".btn-text").classList.add("hidden");
  document.querySelector(".btn-loader").classList.remove("hidden");
  document.getElementById("btn-find").disabled = true;

  try {
    const res = await apiFetch("/api/contacts/find", {
        company,
        titleFilter: document.getElementById("title-filter")
    });
    const data = await res.json();
    results = data.contacts || null;
  } catch {
    results = null;
  }

  if (results) renderResults(results); else showUnavailable();
  document.querySelector(".btn-text").classList.remove("hidden");
  document.querySelector(".btn-loader").classList.add("hidden");
  document.getElementById("btn-find").disabled = false;
}

function renderResults(contacts) {
  document.getElementById("result-count").textContent = contacts.length;
  document.getElementById("results-tbody").innerHTML = contacts.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.title}</td>
      <td>${c.company}</td>
      <td>${c.email ? `<a href="mailto:${c.email}">${c.email}</a>` : "—"}</td>
      <td>${c.phone || "—"}</td>
      <td>${c.linkedin ? `<a href="${c.linkedin}" target="_blank">View</a>` : "—"}</td>
      <td><span class="tag ${c.confidence >= 80 ? "tag-green" : c.confidence >= 60 ? "tag-orange" : "tag-gray"}">${c.confidence}%</span></td>
    </tr>`).join("");
  document.getElementById("results-section").classList.remove("hidden");
  document.getElementById("results-section").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("btn-export-csv")?.addEventListener("click", () => {
  if (!results.length) return;
  downloadFile(toCSV(results, ["name","title","company","email","phone","linkedin","confidence"]), "contacts.csv");
});

document.getElementById("btn-save")?.addEventListener("click", async () => {
  if (!results.length) return;
  await saveToFirestore("saved-contacts", { contacts: results, company: document.getElementById("company-input").value });
  loadHistory(); toast.success("Saved!");
});

async function loadHistory() {
  const items = await getFromFirestore("saved-contacts");
  const grid = document.getElementById("history-grid");
  if (!grid) return;
  document.getElementById("history-section").classList.remove("hidden");
  grid.innerHTML = items.length
    ? items.map(i => `<div class="result-card"><div class="result-count">${i.contacts?.length || 0}</div><strong>${i.company || "Search"}</strong><small>${i.createdAt?.toDate?.().toLocaleDateString?.() || "Recently"}</small></div>`).join("")
    : "<p class='empty-state'>No saved searches yet.</p>";
}

// RONNA-MOCK-FALLBACK: never fabricate results when the scanner API is unavailable.
function showUnavailable() {
  const panel = document.getElementById("results-panel") || document.getElementById("results-section");
  if (panel) {
    panel.classList.remove("hidden");
    panel.innerHTML = '<div class="empty-state" role="status"><p><strong>The scanner service is unavailable right now.</strong></p><p>No results were generated. Please try again later.</p></div>';
  }
  toast.error("Scanner service unavailable. No results were generated.");
}
