import { normalizeSkydioFlights } from "./skydioAdapter.js";
import { correlateForAgency } from "./correlator.js";

const CUSTOM_AGENCIES_KEY = "opendfr_custom_agencies_v1";

let agencies = [];
let rawFlights = [];
let correlatedRows = [];

const agencySelect = document.getElementById("agencySelect");
const skydioPortalLink = document.getElementById("skydioPortalLink");
const recordsPortalLink = document.getElementById("recordsPortalLink");
const csvFallbackGroup = document.getElementById("csvFallbackGroup");
const modal = document.getElementById("agencyBuilderModal");
const builderForm = document.getElementById("agencyBuilderForm");
const jsonPreview = document.getElementById("configJsonPreview");

async function init() {
  const res = await fetch("./registry/agencies.json");
  const baseRegistry = await res.json();
  const customAgencies = JSON.parse(localStorage.getItem(CUSTOM_AGENCIES_KEY) || "[]");
  agencies = [...baseRegistry.agencies, ...customAgencies];

  renderAgencyDropdown();
  bindEvents();
  updateLivePreview();
}

function renderAgencyDropdown(selectedId = null) {
  agencySelect.innerHTML = agencies
    .map((a) => {
      const backends = a.backends || (a.backend ? [a.backend] : []);
      const types = backends.map((b) => b.type.toUpperCase()).join(" + ");
      return `<option value="${a.id}">${a.name} (${a.state}) — [${types}]</option>`;
    })
    .join("");

  if (selectedId) agencySelect.value = selectedId;
  onAgencyChanged();
}

function getActiveAgency() {
  return agencies.find((a) => a.id === agencySelect.value) || agencies[0];
}

function onAgencyChanged() {
  const agency = getActiveAgency();
  if (!agency) return;
  skydioPortalLink.href = agency.skydioDashboardUrl;
  recordsPortalLink.href = agency.publicRecordsUrl;

  const backends = agency.backends || (agency.backend ? [agency.backend] : []);
  csvFallbackGroup.hidden = !backends.some((b) => b.type === "csv");

  if (rawFlights.length > 0) runCorrelation();
}

function buildConfigFromForm() {
  const name = document.getElementById("cfgName").value.trim() || "Custom Police Department";
  const state = (document.getElementById("cfgState").value.trim() || "US").toUpperCase();
  const slug = document.getElementById("cfgSkydioSlug").value.trim() || "agency-slug";
  const backendType = document.getElementById("cfgBackendType").value;

  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${state.toLowerCase()}`,
    name,
    state,
    skydioSlug: slug,
    skydioDashboardUrl: `https://cloud.skydio.com/dashboard/${slug}`,
    publicRecordsUrl: document.getElementById("cfgRecordsUrl").value.trim() || "https://example.gov",
    backends: [
      {
        label: `${name} Incident Data`,
        type: backendType,
        endpoint: backendType === "csv" ? "" : document.getElementById("cfgEndpoint").value.trim(),
        caseIdIsNumeric: document.getElementById("cfgCaseNumeric").value === "true",
        fields: {
          caseId: document.getElementById("mapCaseId").value.trim() || "CASE_NUMBER",
          date: document.getElementById("mapDate").value.trim() || "DATE",
          incidentType: document.getElementById("mapIncident").value.trim() || "INCIDENT",
          location: document.getElementById("mapLocation").value.trim() || "BLOCK",
          district: document.getElementById("mapDistrict").value.trim() || "DISTRICT",
          disposition: document.getElementById("mapDisposition").value.trim() || "DISPOSITION",
        },
      },
    ],
  };
}

function updateLivePreview() {
  jsonPreview.textContent = JSON.stringify(buildConfigFromForm(), null, 2);
  const isCsv = document.getElementById("cfgBackendType").value === "csv";
  document.getElementById("cfgEndpointGroup").hidden = isCsv;
}

async function runCorrelation(csvText = null) {
  const agency = getActiveAgency();
  const statusEl = document.getElementById("statStatus");
  statusEl.textContent = "Querying APIs...";

  try {
    correlatedRows = await correlateForAgency(agency, rawFlights, csvText);
    statusEl.textContent = "Synced";
    renderTable();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

function getFilteredRows() {
  const query = document.getElementById("searchFilter").value.toLowerCase().trim();
  const unmatchedOnly = document.getElementById("unmatchedOnlyToggle").checked;

  return correlatedRows.filter((row) => {
    if (unmatchedOnly && row.matched) return false;
    if (!query) return true;
    return [row.caseId, row.purpose, row.incidentType, row.sourceLabel, row.location, row.district]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function renderTable() {
  const filtered = getFilteredRows();

  document.getElementById("statTotal").textContent = correlatedRows.length;
  document.getElementById("statMatched").textContent = correlatedRows.filter((r) => r.matched).length;
  document.getElementById("statUnmatched").textContent = correlatedRows.filter((r) => !r.matched).length;

  document.getElementById("exportCsvBtn").disabled = filtered.length === 0;
  document.getElementById("exportJsonBtn").disabled = filtered.length === 0;

  const tbody = document.getElementById("resultsBody");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No flights match the current filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (r) => `
      <tr>
        <td>${r.takeoffUtc}</td>
        <td>${Math.round(r.durationSec / 60)}m ${r.durationSec % 60}s</td>
        <td><strong>${r.caseId || "N/A"}</strong></td>
        <td>${r.purpose}</td>
        <td>
          <span class="badge ${r.matched ? "badge-crime" : "badge-cad"}">
            ${r.incidentType}
          </span>
        </td>
        <td><span class="source-tag">${r.sourceLabel}</span></td>
        <td>${r.location} <small class="hint">(${r.district})</small></td>
        <td>
          <a class="foia-link" href="${r.publicRecordsUrl}" target="_blank" rel="noopener noreferrer">
            Request Record ↗
          </a>
        </td>
      </tr>`
    )
    .join("");
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindEvents() {
  agencySelect.addEventListener("change", onAgencyChanged);

  document.getElementById("skydioFileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    rawFlights = normalizeSkydioFlights(parsed);
    await runCorrelation();
  });

  document.getElementById("localCsvInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file || rawFlights.length === 0) return;
    await runCorrelation(await file.text());
  });

  document.getElementById("searchFilter").addEventListener("input", renderTable);
  document.getElementById("unmatchedOnlyToggle").addEventListener("change", renderTable);

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    const rows = getFilteredRows();
    const headers = ["Takeoff", "DurationSec", "CaseID", "Purpose", "IncidentType", "Source", "Location", "District"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [r.takeoffUtc, r.durationSec, r.caseId, r.purpose, r.incidentType, r.sourceLabel, r.location, r.district]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(",")
      ),
    ].join("\n");
    triggerDownload(csv, `${getActiveAgency().id}_opendfr_export.csv`, "text/csv;charset=utf-8;");
  });

  document.getElementById("exportJsonBtn").addEventListener("click", () => {
    const rows = getFilteredRows();
    triggerDownload(JSON.stringify(rows, null, 2), `${getActiveAgency().id}_opendfr_export.json`, "application/json");
  });

  document.getElementById("openBuilderBtn").addEventListener("click", () => modal.showModal());
  document.getElementById("closeModalBtn").addEventListener("click", () => modal.close());
  document.getElementById("cancelModalBtn").addEventListener("click", () => modal.close());
  builderForm.addEventListener("input", updateLivePreview);

  document.getElementById("copyConfigJsonBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(jsonPreview.textContent);
    const btn = document.getElementById("copyConfigJsonBtn");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy JSON"), 1500);
  });

  document.getElementById("testEndpointBtn").addEventListener("click", async () => {
    const cfg = buildConfigFromForm();
    const backend = cfg.backends[0];
    const btn = document.getElementById("testEndpointBtn");
    if (backend.type === "csv") {
      btn.textContent = "Static CSV Mode (No Network Test Needed)";
      return;
    }
    btn.textContent = "Testing...";
    try {
      const testUrl =
        backend.type === "arcgis"
          ? `${backend.endpoint}?where=1%3D1&resultRecordCount=1&f=json`
          : `${backend.endpoint}?$limit=1`;
      const res = await fetch(testUrl);
      btn.textContent = res.ok ? "✓ Connected (HTTP 200)" : `✕ HTTP ${res.status}`;
    } catch {
      btn.textContent = "✕ Network / CORS Error";
    }
  });

  builderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newAgency = buildConfigFromForm();
    const existingCustom = JSON.parse(localStorage.getItem(CUSTOM_AGENCIES_KEY) || "[]");
    const updatedCustom = [...existingCustom.filter((a) => a.id !== newAgency.id), newAgency];
    localStorage.setItem(CUSTOM_AGENCIES_KEY, JSON.stringify(updatedCustom));

    agencies = [...agencies.filter((a) => a.id !== newAgency.id), newAgency];
    renderAgencyDropdown(newAgency.id);
    modal.close();
  });
}

init();