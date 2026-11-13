export function normalizeSkydioFlights(rawPayload) {
  let flights = [];

  if (Array.isArray(rawPayload)) {
    flights = rawPayload;
  } else if (Array.isArray(rawPayload?.flights)) {
    flights = rawPayload.flights;
  } else if (Array.isArray(rawPayload?.data?.flights)) {
    flights = rawPayload.data.flights;
  } else if (Array.isArray(rawPayload?.items)) {
    flights = rawPayload.items;
  }

  return flights.map((f, index) => {
    const rawCaseId = f.case_id ?? f.caseId ?? f.incident_id ?? f.incidentId ?? "";
    return {
      flightId: String(f.id || f.flight_id || f.uuid || `flight-${index}`),
      caseId: String(rawCaseId).trim(),
      takeoffUtc: f.takeoff_time || f.takeoff || f.start_time || f.created_at || "Unknown",
      durationSec: Number(f.duration_seconds ?? f.duration ?? f.flight_duration ?? 0),
      purpose: f.purpose || f.statutory_purpose || f.reason || f.flight_purpose || "Unspecified",
      hasFlightPath: Boolean(f.flight_path || f.flightPath || f.path || f.telemetry),
      pathCoordinates: f.flight_path?.coordinates || f.path || [],
    };
  });
}