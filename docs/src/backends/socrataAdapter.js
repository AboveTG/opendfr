export async function querySocrata(backendConfig, caseIds) {
  const { endpoint, fields, caseIdIsNumeric, matchMode } = backendConfig;
  const cleanIds = [...new Set(caseIds.map((id) => String(id).trim()).filter(Boolean))];
  if (cleanIds.length === 0) return new Map();

  const results = new Map();
  const chunkSize = 75;

  for (let i = 0; i < cleanIds.length; i += chunkSize) {
    const chunk = cleanIds.slice(i, i + chunkSize);
    let whereClause = "";

    if (matchMode === "contains_or_exact") {
      whereClause = chunk
        .map((id) => `${fields.caseId} like '%${id.replace(/'/g, "''")}'`)
        .join(" OR ");
    } else {
      const formatted = chunk
        .map((id) => (caseIdIsNumeric ? id.replace(/\D/g, "") : `'${id.replace(/'/g, "''")}'`))
        .filter(Boolean);
      if (formatted.length === 0) continue;
      whereClause = `${fields.caseId} in(${formatted.join(",")})`;
    }

    const params = new URLSearchParams({
      $where: whereClause,
      $limit: "5000",
    });

    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) throw new Error(`Socrata HTTP ${res.status}`);
    const rows = await res.json();

    for (const row of rows) {
      const rawReturnedId = String(row[fields.caseId] || "").trim();
      if (!rawReturnedId) continue;

      const matchedRequestedId =
        chunk.find((reqId) => rawReturnedId === reqId || rawReturnedId.endsWith(reqId)) ||
        rawReturnedId;

      results.set(matchedRequestedId, {
        incidentType: row[fields.incidentType] || "Unspecified",
        location: row[fields.location] || "N/A",
        district: row[fields.district] || "N/A",
        disposition: row[fields.disposition] || "N/A",
        geometry: row.geocoded_column_1 || row.location || null,
      });
    }
  }

  return results;
}