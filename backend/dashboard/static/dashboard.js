// API origin: sed-substituted into the app script tag's data-api-base at S3 upload
// time. When left unsubstituted (local dev), fall back to same-origin.
const API_BASE = (() => {
  const el = document.getElementById("app");
  const v = (el && el.dataset.apiBase) || "";
  return v.startsWith("__API_BASE__") ? "" : v.replace(/\/$/, "");
})();

const PRIMARY_VITAL = "heart_rate";
const SECONDARY_VITALS = ["spo2", "body_temperature", "respiration_rate", "systolic_bp"];

const VITAL_META = {
  heart_rate:       { label: "Heart Rate",  unit: "bpm" },
  spo2:             { label: "SpO2",        unit: "%" },
  body_temperature: { label: "Body Temp",   unit: "°C" },
  respiration_rate: { label: "Respiration", unit: "brpm" },
  systolic_bp:      { label: "Systolic BP", unit: "mmHg" },
};

const ALERT_TEXT = {
  bradycardia_risk: "Bradycardia risk",
  tachycardia_risk: "Tachycardia risk",
  hypoxia_risk: "Hypoxia risk",
  fever: "Fever",
  hypothermia_risk: "Hypothermia risk",
  respiratory_distress: "Respiratory distress",
  bradypnea_risk: "Slow breathing",
  hypertension_risk: "Hypertension risk",
  hypotension_risk: "Hypotension risk",
};

const STALE_AFTER_SECONDS = 30;
const ecgCharts = {};

function vitalDot(vital) {
  return `<span class="vdot ${vital}"></span>`;
}

function ageInSeconds(iso) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
}

function shortClock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function describeAlert(key) {
  return ALERT_TEXT[key] || key.replace(/_/g, " ");
}

function paintWardSummary(patients) {
  const box = document.getElementById("ward-summary");
  const totalAlerts = patients.reduce(
    (sum, p) => sum + Object.values(p.vitals).filter((v) => v.alerts.length).length, 0
  );
  box.innerHTML =
    `<span>${patients.length} PATIENTS MONITORED</span>` +
    `<span class="${totalAlerts ? "warn" : ""}">${totalAlerts} VITALS OUT OF RANGE</span>`;
}

function paintCriticalBanner(patients) {
  const box = document.getElementById("critical-banner");
  const flagged = [];
  for (const patient of patients) {
    for (const [vital, reading] of Object.entries(patient.vitals)) {
      for (const key of reading.alerts) {
        flagged.push({ patient_id: patient.patient_id, vital, key });
      }
    }
  }
  if (flagged.length === 0) {
    box.className = "critical-banner calm";
    box.innerHTML = `All monitored vitals within normal range`;
    return;
  }
  box.className = "critical-banner alert";
  box.innerHTML = flagged
    .map((f) => `${vitalDot(f.vital)}${f.patient_id.toUpperCase()}: ${describeAlert(f.key)}`)
    .join(" &nbsp;&middot;&nbsp; ");
}

function makeEcgChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: "#34e0c0", borderWidth: 1.75, pointRadius: 0, tension: 0.35 }] },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

function vitalTileHtml(vital, reading) {
  const meta = VITAL_META[vital];
  if (!reading) {
    return `<div class="vital-tile empty">${vitalDot(vital)}${meta.label}<span class="vt-value">&ndash;</span></div>`;
  }
  const flagged = reading.alerts.length > 0;
  const age = ageInSeconds(reading.window_end);
  return `
    <div class="vital-tile${flagged ? " flagged" : ""}">
      <div class="vt-label">${vitalDot(vital)}${meta.label}</div>
      <div class="vt-value">${reading.latest}<small>${meta.unit}</small></div>
      <div class="vt-range">${reading.min}&ndash;${reading.max} &middot; ${age}s ago</div>
      ${flagged ? `<div class="vt-flag">${reading.alerts.map(describeAlert).join(", ")}</div>` : ""}
    </div>`;
}

function patientCardHtml(patient) {
  const heartRate = patient.vitals[PRIMARY_VITAL];
  const flagged = heartRate && heartRate.alerts.length > 0;
  return `
    <article class="patient-card${flagged ? " flagged" : ""}" data-patient="${patient.patient_id}">
      <div class="patient-head">
        <span class="patient-id">${patient.patient_id.toUpperCase()}</span>
        ${flagged ? `<span class="patient-flag">${heartRate.alerts.map(describeAlert).join(", ")}</span>` : ""}
      </div>
      <div class="monitor-screen">
        <canvas class="ecg-trace"></canvas>
        <div class="ecg-readout">${heartRate ? heartRate.latest : "--"}<small>bpm</small></div>
      </div>
      <div class="vital-row">
        ${SECONDARY_VITALS.map((v) => vitalTileHtml(v, patient.vitals[v])).join("")}
      </div>
    </article>`;
}

async function refreshEcgTrace(patientId) {
  const res = await fetch(`${API_BASE}/api/readings?sensor_type=${PRIMARY_VITAL}&site_id=${patientId}&limit=40`);
  const data = await res.json();
  if (!data.items.length) return;

  if (!ecgCharts[patientId]) {
    const canvas = document.querySelector(`.patient-card[data-patient="${patientId}"] canvas.ecg-trace`);
    ecgCharts[patientId] = makeEcgChart(canvas);
  }
  const chart = ecgCharts[patientId];
  chart.data.labels = data.items.map((i) => shortClock(i.window_end));
  chart.data.datasets[0].data = data.items.map((i) => i.avg);
  chart.update();
}

async function pollWard() {
  try {
    const [patientData, health, backend] = await Promise.all([
      fetch(`${API_BASE}/api/patients`).then((r) => r.json()),
      fetch(`${API_BASE}/api/health`).then((r) => r.json()),
      fetch(`${API_BASE}/api/backend-stats`).then((r) => r.json()),
    ]);

    const patients = patientData.patients;
    paintWardSummary(patients);
    paintCriticalBanner(patients);

    for (const key of Object.keys(ecgCharts)) {
      ecgCharts[key].destroy();
      delete ecgCharts[key];
    }
    document.getElementById("patient-list").innerHTML = patients.map(patientCardHtml).join("");
    await Promise.all(patients.map((p) => refreshEcgTrace(p.patient_id)));

    document.getElementById("gateway-status").innerHTML =
      `<span>edge gateway: ${health.gateway ? "online" : "offline"}</span>` +
      `<span>queue: ${health.queue ? "reachable" : "unreachable"}${backend.queue ? ` (${backend.queue.waiting} pending)` : ""}</span>` +
      `<span>lambda: ${health.lambda ? "deployed" : "not found"}</span>` +
      `<span>records archived: ${backend.items_in_table}</span>`;
  } catch (e) {
    // backend not ready yet; next poll retries
  }
}

pollWard();
setInterval(pollWard, 2500);
