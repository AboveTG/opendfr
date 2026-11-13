import { queryArcgis } from "./backends/arcgisAdapter.js";
import { querySocrata } from "./backends/socrataAdapter.js";
import { parseLocalCsvToMap } from "./backends/csvAdapter.js";

export async function correlateForAgency(agency, skydioFlights, optionalCsvText = null) {
  const backends = agency.backends || (agency.backend ? [agency.backend] : []);
  const resolvedMap = new Map();
  let remainingIds = [...new Set(skydioFlights.map((f) => f.caseId).filter(Boolean))];

  for (const backend of backends) {
    if (remainingIds.length === 0) break;

    let batchMatches = new Map();
    if (backend.type === "arcgis") {
      batchMatches = await queryArcgis(backend, remainingIds);
    } else if (backend.type === "socrata") {
      batchMatches = await querySocrata(backend, remainingIds);
    } else if (backend.type === "csv" && optionalCsvText) {
      batchMatches = parseLocalCsvToMap(optionalCsvText, backend.fields);
    }

    for (const [caseId, record] of batchMatches.entries()) {
      if (!resolvedMap.has(caseId)) {
        resolvedMap.set(caseId, {
          ...record,
          sourceLabel: backend.label || backend.type.toUpperCase(),
        });
      }
    }

    remainingIds = remainingIds.filter((id) => !resolvedMap.has(id));
  }

  return skydioFlights.map((flight) => {
    const match = resolvedMap.get(flight.caseId);
    return {
      ...flight,
      agencyName: agency.name,
      matched: Boolean(match),
      sourceLabel: match?.sourceLabel || "Unmatched",
      incidentType: match?.incidentType || "Unmatched / Restricted Call",
      location: match?.location || "N/A",
      district: match?.district || "N/A",
      disposition: match?.disposition || "N/A",
      publicRecordsUrl: agency.publicRecordsUrl,
    };
  });
}