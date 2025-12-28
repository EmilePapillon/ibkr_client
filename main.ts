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

let authToken: string | null = null;
let positionsData: Position[];
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

function renderSummary(list: Position[]) {
  const value = list.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const pnlToday = list.reduce((sum, p) => sum + p.change * p.quantity, 0);
  const topMover = [...list].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];

  setText("portfolio-value", formatter.format(value));
  setText("positions-count", `${list.length} positions tracked`);
  setText("pnl-today", `${pnlToday >= 0 ? "+" : "-"}${formatter.format(Math.abs(pnlToday))}`);
  setText("pnl-note", pnlToday >= 0 ? "Up on the session" : "Down on the session");
  setText("top-mover", `${topMover.symbol} · ${formatChange(topMover.change, topMover.price)}`);
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

bootstrap();
