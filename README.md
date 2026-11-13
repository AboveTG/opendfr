# OpenDFR

**Live Web App:** [https://abovetg.github.io/opendfr/](https://abovetg.github.io/opendfr/)

**OpenDFR** is a 100% client-side civic transparency toolkit that cross-references public municipal Drone-as-First-Responder (DFR) flight logs with local police crime reports and Computer-Aided Dispatch (CAD) incident datasets.

---

## Core Principles
* **Zero-Server Privacy:** All flight log parsing and municipal API queries execute directly inside your browser or local CLI—no proxy servers, no analytics, and no user tracking.
* **Cascading Multi-Backend Resolution:** Chains Primary Crime Report APIs (Esri ArcGIS REST) with Secondary County CAD Dispatch APIs (Socrata SODA) to resolve both criminal offense reports and non-criminal calls (welfare checks, missing persons, perimeter assists).
* **Self-Service City Builder:** Configure any municipality running a Skydio Transparency Dashboard directly in your browser via **+ Add / Configure City**, save it to `localStorage`, and export a ready-to-paste JSON snippet for GitHub Pull Requests.

---

## How to Use the Web App

### 1. Capture Your City's Skydio Flight Log (`.json`)
Skydio's public transparency dashboards load flight logs via an unauthenticated client-side API call:
1. Open your local agency's dashboard (e.g., `https://cloud.skydio.com/dashboard/sppd` for St. Paul PD).
2. Open your browser's **Developer Tools** (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`) and select the **Network** tab.
3. Filter by **Fetch/XHR** and reload the page (or scroll/paginate through the flight log list).
4. Click the network request returning the flight list JSON, open its **Response** tab, and save the JSON payload locally (e.g., `sppd_flights.json`).

### 2. Cross-Reference Against Municipal Incident Data
1. Open [OpenDFR](https://abovetg.github.io/opendfr/).
2. Choose your agency from the dropdown (or click **+ Add / Configure City** to map a new city).
3. Upload your saved `.json` file under **Load Skydio Flight Log (.json)**.
4. Use the search bar or **Show Unmatched / Restricted Calls Only** toggle to isolate deployments omitted from public crime portals—each row includes a direct link to that agency's public records / FOIA portal.

---

## Running Locally or via Python CLI

### Local Browser (Loopback-Only)
Bind Python's built-in static server strictly to `127.0.0.1` so zero traffic is exposed to your local network:
```bash
python3 -m http.server 8080 --bind 127.0.0.1 -d docs
