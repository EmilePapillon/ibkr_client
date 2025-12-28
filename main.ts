import {
  ApiPosition,
  Position,
  PortfolioResponse,
  formatChange,
  formatCurrency,
  handleFilter,
  normalizePositions,
  setText,
} from "./utils.js";

// Plotly is loaded globally via script tag; declare for TypeScript.
declare const Plotly:
  | {
      react: (
        root: HTMLElement,
        data: unknown[],
        layout: unknown,
        config?: Record<string, unknown>
      ) => Promise<void> | void;
      Plots?: { resize: (root: HTMLElement) => void };
    }
  | undefined;

const API_BASE = "http://127.0.0.1:5000/api";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const positionsRoot = document.querySelector<HTMLDivElement>("#positions");
const filterPill = document.querySelector<HTMLDivElement>("#filter-pill");
const searchInput = document.querySelector<HTMLInputElement>("#search");
const loginShell = document.querySelector<HTMLDivElement>("#login-shell");
const appShell = document.querySelector<HTMLDivElement>("#app-shell");
const loginBtn = document.querySelector<HTMLButtonElement>("#login-btn");
const loginUser = document.querySelector<HTMLInputElement>("#login-user");
const loginPass = document.querySelector<HTMLInputElement>("#login-pass");
const loginStatus = document.querySelector<HTMLParagraphElement>("#login-status");
const logoutBtn = document.querySelector<HTMLButtonElement>("#logout-btn");
const reloadBtn = document.querySelector<HTMLButtonElement>("#reload-btn");
const chartRoot = document.querySelector<HTMLDivElement>("#chart-main");
const chartChange = document.querySelector<HTMLDivElement>("#chart-change");
const chartNote = document.querySelector<HTMLParagraphElement>("#chart-note");
const chartTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const horizonButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".horizon-btn"));

let authToken: string | null = null;
let positionsData: Position[];
let chartHistory: number[] = [];
let chartPerf: number[] = [];
let activeChart: "value" | "performance" = "value";
type Horizon = "1D" | "1W" | "1M" | "YTD";
let activeHorizon: Horizon = "1M";
const horizonLabels: Record<Horizon, string> = {
  "1D": "1 day",
  "1W": "1 week",
  "1M": "1 month",
  YTD: "Year to date",
};
const TOKEN_KEY = "ibkr_token";

function persistToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function login(username: string, password: string) {
  const resp = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include", // send/receive cookies
  });
  if (!resp.ok) throw new Error(`Login failed ${resp.status}`);
  const data = (await resp.json()) as { token?: string };
  return data.token || null;
}

async function logout() {
  persistToken(null);
  // Clear cookie by setting it expired; backend could provide a /logout endpoint if preferred.
  document.cookie = "ibkr_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  showLogin("Logged out.");
}

function setStatus(message = "") {
  if (loginStatus) loginStatus.textContent = message;
}

function pointsForHorizon(horizon: typeof activeHorizon) {
  switch (horizon) {
    case "1D":
      return 12;
    case "1W":
      return 18;
    case "YTD":
      return 90;
    case "1M":
    default:
      return 30;
  }
}

function buildPortfolioHistory(totalValue: number, pnlToday: number, points = 30) {
  if (points < 2) return [];
  const pctChange = totalValue ? pnlToday / totalValue : 0;
  const start = totalValue * (1 - Math.max(Math.min(pctChange * 4, 0.08), -0.08));
  const series: number[] = [];

  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1);
    const wave = Math.sin(progress * Math.PI * 2) * 0.01 + Math.sin(progress * Math.PI * 5) * 0.003;
    const drift = pctChange * 0.7 * progress;
    const value = start * (1 + drift + wave);
    series.push(Math.max(value, totalValue * 0.6));
  }

  series[points - 1] = totalValue;
  return series;
}

function renderSelectedChart(tab: "value" | "performance") {
  if (!chartRoot || !Plotly) return;
  activeChart = tab;
  chartTabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));

  const xLabels = chartHistory.map((_, idx) => (idx === chartHistory.length - 1 ? "Today" : `T-${chartHistory.length - 1 - idx}`));
  const baseLayout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 42, r: 16, t: 8, b: 36 },
    height: 300,
    showlegend: false,
    font: { color: "#cdd5e7" },
    xaxis: {
      title: "Time",
      color: "#8a93a5",
      gridcolor: "rgba(255,255,255,0.06)",
      tickfont: { size: 11 },
    },
    yaxis: {
      color: "#8a93a5",
      gridcolor: "rgba(255,255,255,0.06)",
      tickfont: { size: 11 },
    },
  };

  if (tab === "value") {
    const delta = chartHistory.length ? chartHistory[chartHistory.length - 1] - chartHistory[0] : 0;
    Plotly.react(
      chartRoot,
      [
        {
          x: xLabels,
          y: chartHistory,
          type: "scatter",
          mode: "lines",
          line: { color: "#6cf0c2", width: 2.2 },
          hovertemplate: "<b>%{y:$,.0f}</b><extra>%{x}</extra>",
        },
      ],
      {
        ...baseLayout,
        yaxis: { ...baseLayout.yaxis, title: "Value" },
      },
      { displayModeBar: false, responsive: true }
    );
    if (chartChange) chartChange.textContent = `${delta >= 0 ? "+" : "-"}${formatter.format(Math.abs(delta))}`;
    if (chartNote)
      chartNote.textContent = `Synthetic ${chartHistory.length}-point curve anchored to today (${horizonLabels[activeHorizon]})`;
  } else {
    const last = chartPerf.length ? chartPerf[chartPerf.length - 1] : 0;
    Plotly.react(
      chartRoot,
      [
        {
          x: xLabels,
          y: chartPerf,
          type: "scatter",
          mode: "lines",
          line: { color: "#5bc0f8", width: 2.2 },
          hovertemplate: "<b>%{y:.1f}%</b><extra>%{x}</extra>",
        },
      ],
      {
        ...baseLayout,
        yaxis: { ...baseLayout.yaxis, title: "Return %", ticksuffix: "%" },
      },
      { displayModeBar: false, responsive: true }
    );
    if (chartChange) chartChange.textContent = `${last >= 0 ? "+" : ""}${last.toFixed(1)}%`;
    if (chartNote)
      chartNote.textContent = `Performance vs start of window (${chartPerf.length - 1} steps back, ${horizonLabels[activeHorizon]})`;
  }
  // Force Plotly to recalc size in case the container changed.
  Plotly.Plots?.resize(chartRoot);
}

function renderPortfolioCharts(list: Position[], totalValue: number, pnlToday: number) {
  const points = pointsForHorizon(activeHorizon);
  chartHistory = buildPortfolioHistory(totalValue, pnlToday, points);
  const startValue = chartHistory[0] || totalValue || 1;
  chartPerf = chartHistory.map((value) => ((value - startValue) / startValue) * 100);
  renderSelectedChart(activeChart);
}

function renderSummary(list: Position[]) {
  const value = list.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const pnlToday = list.reduce((sum, p) => sum + p.change * p.quantity, 0);
  const topMover = [...list].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];

  setText("portfolio-value", formatter.format(value));
  setText("positions-count", `${list.length} positions tracked`);
  setText("pnl-today", `${pnlToday >= 0 ? "+" : "-"}${formatter.format(Math.abs(pnlToday))}`);
  setText("pnl-note", pnlToday >= 0 ? "Up on the session" : "Down on the session");
  setText("top-mover", `${topMover.symbol} · ${formatChange(topMover.change, topMover.price)}`);
  renderPortfolioCharts(list, value, pnlToday);
}

function renderPositions(list: Position[]) {
  if (!positionsRoot) return;
  positionsRoot.innerHTML = list
    .map((p) => {
      const total = p.price * p.quantity;
      const today = p.change * p.quantity;
      const direction = today >= 0 ? "pos" : "neg";
      return `
        <div class="position">
          <div class="position-header">
            <span class="ticker">${p.symbol}</span>
            <div>
              <p class="name">${p.name}</p>
              <p class="status">${p.quantity} shares · ${p.sector}</p>
            </div>
          </div>
          <div>
            <p class="num">${formatCurrency(total, p.currency)}</p>
            <p class="status">Last: ${formatCurrency(p.price, p.currency)}</p>
          </div>
          <div class="chip ${direction}">
            ${formatChange(p.change, p.price)} · ${formatCurrency(today, p.currency)}
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchPortfolio(): Promise<Position[]> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const resp = await fetch(`${API_BASE}/portfolio`, { credentials: "include", headers });
  if (resp.status === 401) throw new Error("unauthorized");
  if (!resp.ok) throw new Error(`Backend error ${resp.status}`);
  const data = (await resp.json()) as PortfolioResponse;
  return normalizePositions(data);
}

async function fetchAndRender(filterTerm = "") {
  const list = await fetchPortfolio();
  positionsData = list;
  renderSummary(list);
  const filtered = handleFilter(filterTerm, positionsData, filterPill);
  renderPositions(filtered);
}

function showLogin(message?: string) {
  appShell?.classList.add("hidden");
  loginShell?.classList.remove("hidden");
  if (loginStatus) loginStatus.textContent = message || "";
}

function showApp() {
  loginShell?.classList.add("hidden");
  appShell?.classList.remove("hidden");
}

async function bootstrap() {
  try {
    // Restore token from a prior login to avoid forcing a fresh sign-in on reload.
    if (!authToken) {
      const stored = localStorage.getItem(TOKEN_KEY);
      if (stored) authToken = stored;
    }
    await fetchAndRender();
    showApp();
  } catch (err) {
    console.warn("Auth required or backend unavailable", err);
    const message =
      err instanceof Error && err.message.toLowerCase().includes("failed to fetch")
        ? "Backend not reachable. Please start the backend."
        : "Please log in to load your portfolio.";
    showLogin(message);
  }
}

loginBtn?.addEventListener("click", async () => {
  if (!loginUser || !loginPass) return;
  try {
    setStatus("Signing in…");
    loginBtn.disabled = true;
    const token = await login(loginUser.value, loginPass.value);
    if (token) persistToken(token);
    await fetchAndRender();
    showApp();
    setStatus();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "Login failed");
  } finally {
    loginBtn.disabled = false;
  }
});

searchInput?.addEventListener("input", (evt) => {
  const target = evt.currentTarget as HTMLInputElement;
  const filtered = handleFilter(target.value, positionsData, filterPill);
  renderPositions(filtered);
});

logoutBtn?.addEventListener("click", () => {
  logout();
});

reloadBtn?.addEventListener("click", async () => {
  try {
    setStatus("Refreshing…");
    await fetchAndRender(searchInput?.value || "");
    setStatus();
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes("unauthorized")) {
      showLogin("Session expired. Please log in again.");
    } else {
      setStatus(err instanceof Error ? err.message : "Refresh failed");
      console.error(err);
    }
  }
});

chartTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab === "performance" ? "performance" : "value";
    renderSelectedChart(tab);
  });
});

horizonButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const horizon = (btn.dataset.horizon as typeof activeHorizon) || "1M";
    activeHorizon = horizon;
    horizonButtons.forEach((b) => b.classList.toggle("active", b.dataset.horizon === horizon));
    // Rebuild data to respect the new horizon, but keep the active tab.
    const totalValue = positionsData.reduce((sum, p) => sum + p.price * p.quantity, 0);
    const pnlToday = positionsData.reduce((sum, p) => sum + p.change * p.quantity, 0);
    renderPortfolioCharts(positionsData, totalValue, pnlToday);
  });
});

window.addEventListener("resize", () => {
  if (chartRoot && Plotly?.Plots?.resize) {
    Plotly.Plots.resize(chartRoot);
  }
});

bootstrap();
