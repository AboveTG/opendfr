# OpenDFR

**OpenDFR** is a 100% client-side civic transparency toolkit that cross-references public municipal Drone-as-First-Responder (DFR) flight logs with local police crime reports and Computer-Aided Dispatch (CAD) incident datasets.

## Features
* **Zero-Server Privacy:** All JSON parsing and municipal API queries run locally inside your browser or CLI.
* **Cascading Multi-Backend Resolution:** Chains Primary Crime Report APIs (Esri ArcGIS) with Secondary County CAD Dispatch APIs (Socrata SODA) to resolve both criminal and non-criminal calls.
* **Self-Service City Builder:** Add any Skydio Transparency Dashboard municipality directly in the browser, save to `localStorage`, and export a copy-pasteable `agencies.json` entry.

## Running Locally
1. Start a local static server from the repository root:
   ```bash
   python3 -m http.server 8080 -d docs