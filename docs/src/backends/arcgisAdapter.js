export async function queryArcgis(backendConfig, caseIds) {
  const { endpoint, fields, caseIdIsNumeric } = backendConfig;
  const formattedIds = caseIds
    .map((id) => String(id).trim())
    .filter(Boolean)
    .map((id) => (caseIdIsNumeric ? id.replace(/\D/g, "") : `'${id.replace(/'/g, "''")}'`))
    .filter(Boolean);

  if (formattedIds.length === 0) return new Map();

  const results = new Map();
  const chunkSize = 150;

  for (let i = 0; i < formattedIds.length; i += chunkSize) {
    const chunk = formattedIds.slice(i, i + chunkSize);
    const outFields = Object.values(fields).filter(Boolean).join(",");
    const params = new URLSearchParams({
      where: `${fields.caseId} IN (${chunk.join(",")})`,
      outFields,
      returnGeometry: "true",
      outSR: "4326",
      f: "json",
    });

    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "ArcGIS Query Error");

    for (const feature of data.features || []) {
      const attr = feature.attributes;
      const key = String(attr[fields.caseId]).trim();
      results.set(key, {
        incidentType: attr[fields.incidentType] || "Unspecified",
        location: attr[fields.location] || "N/A",
        district: attr[fields.district] || "N/A",
        disposition: attr[fields.disposition] || "N/A",
        geometry: feature.geometry || null,
      });
    }
  }

  return results;
}