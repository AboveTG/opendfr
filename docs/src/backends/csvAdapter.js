function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseLocalCsvToMap(csvText, fields) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const headers = parseCsvLine(lines[0]);
  const idx = {
    caseId: headers.indexOf(fields.caseId),
    incidentType: headers.indexOf(fields.incidentType),
    location: headers.indexOf(fields.location),
    district: headers.indexOf(fields.district),
    disposition: headers.indexOf(fields.disposition),
  };

  if (idx.caseId === -1) return new Map();

  const results = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const key = cols[idx.caseId];
    if (!key) continue;

    results.set(key, {
      incidentType: idx.incidentType > -1 ? cols[idx.incidentType] || "Unspecified" : "Unspecified",
      location: idx.location > -1 ? cols[idx.location] || "N/A" : "N/A",
      district: idx.district > -1 ? cols[idx.district] || "N/A" : "N/A",
      disposition: idx.disposition > -1 ? cols[idx.disposition] || "N/A" : "N/A",
      geometry: null,
    });
  }

  return results;
}