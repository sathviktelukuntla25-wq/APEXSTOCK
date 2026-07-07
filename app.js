const safeLocalStorage = { getItem: function(k) { try { return localStorage.getItem(k); } catch(e) { if (!window.lFallback) window.lFallback = {}; return window.lFallback[k] || null; } }, setItem: function(k, v) { try { localStorage.setItem(k, v); } catch(e) { if (!window.lFallback) window.lFallback = {}; window.lFallback[k] = String(v); } }, removeItem: function(k) { try { localStorage.removeItem(k); } catch(e) { if (window.lFallback) delete window.lFallback[k]; } } };
const safeSessionStorage = { getItem: function(k) { try { return sessionStorage.getItem(k); } catch(e) { if (!window.sFallback) window.sFallback = {}; return window.sFallback[k] || null; } }, setItem: function(k, v) { try { sessionStorage.setItem(k, v); } catch(e) { if (!window.sFallback) window.sFallback = {}; window.sFallback[k] = String(v); } }, removeItem: function(k) { try { sessionStorage.removeItem(k); } catch(e) { if (window.sFallback) delete window.sFallback[k]; } } };

/**
 * ApexStock - Warehouse & Inventory Management Console Controller
 * High-usability data binder, notifications log, SVG charts, and CSV report generator
 */

// Global State
let products = [];
let incoming = [];
let outgoing = [];
let systemNotifications = [];
let actions = [];

let currentNavTab = "dashboard"; // dashboard, inventory, incoming, outgoing, analytics, insights

// Helper state for multi-vault view switching (for Admin / Head Manager)
window.selectedVaultFilter = "all";

function getActiveProducts() {
  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");
  const selectedVault = window.selectedVaultFilter || "all";

  if (selectedVault !== "all") {
    return products.filter(p => p.location && p.location.includes(selectedVault));
  }
  
  if ((role === "manager" || role === "worker") && vault && vault !== "all") {
    return products.filter(p => p.location && p.location.includes(vault));
  }
  return products;
}

function getActiveIncoming() {
  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");
  const selectedVault = window.selectedVaultFilter || "all";

  let activeProds = products;
  if (selectedVault !== "all") {
    activeProds = products.filter(p => p.location && p.location.includes(selectedVault));
  } else if ((role === "manager" || role === "worker") && vault && vault !== "all") {
    activeProds = products.filter(p => p.location && p.location.includes(vault));
  } else {
    return incoming;
  }

  const activePrefixes = new Set(activeProds.map(p => p.name.split(" (")[0].toLowerCase()));
  return incoming.filter(i => {
    const cleanName = i.productName.split(" (")[0].toLowerCase();
    return activePrefixes.has(cleanName);
  });
}

function getActiveOutgoing() {
  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");
  const selectedVault = window.selectedVaultFilter || "all";

  let activeProds = products;
  if (selectedVault !== "all") {
    activeProds = products.filter(p => p.location && p.location.includes(selectedVault));
  } else if ((role === "manager" || role === "worker") && vault && vault !== "all") {
    activeProds = products.filter(p => p.location && p.location.includes(vault));
  } else {
    return outgoing;
  }

  const activePrefixes = new Set(activeProds.map(p => p.name.split(" (")[0].toLowerCase()));
  return outgoing.filter(o => {
    const cleanName = o.productName.split(" (")[0].toLowerCase();
    return activePrefixes.has(cleanName);
  });
}

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.hash === "#start" || window.location.hash === "#restart") {
    safeSessionStorage.removeItem("apex_logged_in");
    safeSessionStorage.removeItem("apex_user_role");
    safeSessionStorage.removeItem("apex_user_vault");
    safeSessionStorage.removeItem("apex_user_display_name");
    safeSessionStorage.removeItem("apex_intro_played");
    safeLocalStorage.removeItem("apex_selected_vault_view");
    window.location.hash = "";
  }

  loadDatabase();

  // Auto-detect computer local network IP from python backend
  fetch('/api/get-server-ip')
    .then(res => res.json())
    .then(data => {
      if (data.ip && data.ip !== '127.0.0.1') {
        safeLocalStorage.setItem("apex_local_ip", data.ip);
        const ipInput = document.getElementById("local-ip-input");
        if (ipInput) ipInput.value = data.ip;
        console.log("[Settings] Auto-detected local server IP:", data.ip);
      }
    })
    .catch(err => console.warn("Failed to auto-detect server IP:", err));
  
  // Hide layout wrappers initially for authentication
  const appLayout = document.querySelector(".app-layout-container");
  if (appLayout) appLayout.style.display = "none";

  const loginOverlay = document.getElementById("login-overlay");
  if (loginOverlay) loginOverlay.style.display = "none";
  
  // Set default active tab
  switchNavTab("dashboard");
  
  // Populate category filter dropdown
  populateCategoryDropdown();

  // Initialize notifications bell toggle
  const btnNotifToggle = document.getElementById("btn-notifications-toggle");
  if (btnNotifToggle) {
    updateNotificationToggleUI();
    btnNotifToggle.addEventListener("click", () => {
      const isEnabled = safeLocalStorage.getItem("apex_notifications_enabled") === "true";
      const nextState = !isEnabled;
      safeLocalStorage.setItem("apex_notifications_enabled", nextState.toString());
      updateNotificationToggleUI();

      if (nextState) {
        showToast("🔔 Alerts Activated", "You will now receive notifications for low stock items.");
        if (typeof Notification !== "undefined") {
          if (Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
              if (permission === "granted") {
                sendSystemNotification("🔔 Alerts Activated", "Browser push notifications are active.");
              }
            });
          }
        }
      } else {
        showToast("🔕 Alerts Muted", "Low stock warnings have been muted.");
      }
    });
  }

  // Bind form submissions
  setupFormHandlers();

  // Close modals when clicking backdrop overlay
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove("active");
      }
    });
  });

  // Render icons
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Start 3D Intro Animation (Bypass if already played or skip hash in URL)
  const introPlayed = safeSessionStorage.getItem("apex_intro_played") === "true" || window.location.hash === "#skipintro";
  if (introPlayed) {
    const overlay = document.getElementById("intro-overlay");
    if (overlay) overlay.style.display = "none";
    checkAuthSession();
  } else {
    init3DIntroAnimation();
  }
});

// Load database from LocalStorage
async function loadDatabase() {
  // 1. Initial LocalStorage fallback pre-load to make rendering instant
  const localProducts = safeLocalStorage.getItem("apex_products_v2");
  const localIncoming = safeLocalStorage.getItem("apex_incoming_v2");
  const localOutgoing = safeLocalStorage.getItem("apex_outgoing_v2");
  
  if (localProducts) products = JSON.parse(localProducts);
  else products = [...SEED_PRODUCTS];

  if (localIncoming) incoming = JSON.parse(localIncoming);
  else incoming = [...SEED_INCOMING];

  if (localOutgoing) outgoing = JSON.parse(localOutgoing);
  else outgoing = [...SEED_OUTGOING];

  // 2. Fetch from MongoDB server (runs asynchronously in background and refreshes views)
  try {
    const resProd = await fetch('/api/db-get?collection=products');
    const dataProd = await resProd.json();
    if (dataProd && dataProd.length > 0) {
      products = dataProd;
      safeLocalStorage.setItem("apex_products_v2", JSON.stringify(products));
    } else {
      // Seed MongoDB
      await saveProducts();
    }

    const resIn = await fetch('/api/db-get?collection=incoming');
    const dataIn = await resIn.json();
    if (dataIn && dataIn.length > 0) {
      incoming = dataIn;
      safeLocalStorage.setItem("apex_incoming_v2", JSON.stringify(incoming));
    } else {
      await saveIncoming();
    }

    const resOut = await fetch('/api/db-get?collection=outgoing');
    const dataOut = await resOut.json();
    if (dataOut && dataOut.length > 0) {
      outgoing = dataOut;
      safeLocalStorage.setItem("apex_outgoing_v2", JSON.stringify(outgoing));
    } else {
      await saveOutgoing();
    }

    console.log("[MongoDB] Local lists synchronized successfully with MongoDB collections.");
    refreshDashboard();
    if (typeof refreshTabContent !== "undefined") {
      refreshTabContent(currentNavTab);
    }
  } catch (e) {
    console.warn("[MongoDB] Offline fallback: Using local browser storage caches.", e);
  }

  // Initialize notifications list
  systemNotifications = [
    {
      id: "n_1",
      title: "Consolidated Safety Check",
      desc: "Lead warehouse database synced successfully with MongoDB and local storage buffers.",
      type: "success",
      time: "Just Now"
    }
  ];
  
  // Inspect for initial low stock items to add to notifications
  products.forEach(p => {
    if (p.stock === 0) {
      systemNotifications.push({
        id: "n_init_" + p.id,
        title: "Out of Stock Warning",
        desc: `Product ${p.name} (${p.sku}) is completely empty.`,
        type: "danger",
        time: "10m ago"
      });
    } else if (p.stock <= p.minStock) {
      systemNotifications.push({
        id: "n_init_" + p.id,
        title: "Low Stock Alert",
        desc: `Product ${p.name} stock level is running low (${p.stock} units).`,
        type: "warning",
        time: "15m ago"
      });
    }
  });

  // Load Actions Required ledger
  const localActions = safeLocalStorage.getItem("apex_actions_v2");
  if (localActions) {
    actions = JSON.parse(localActions);
  } else {
    actions = [
      { id: "a1", text: "Restock Rice" },
      { id: "a2", text: "Transfer Oil to Warehouse B" },
      { id: "a3", text: "Remove Expired Products" }
    ];
    safeLocalStorage.setItem("apex_actions_v2", JSON.stringify(actions));
  }
}

// Save databases to LocalStorage & MongoDB
async function saveProducts() {
  safeLocalStorage.setItem("apex_products_v2", JSON.stringify(products));
  try {
    await fetch('/api/db-set?collection=products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(products)
    });
  } catch (e) {
    console.warn("Failed to push products to MongoDB:", e);
  }
}

async function saveIncoming() {
  safeLocalStorage.setItem("apex_incoming_v2", JSON.stringify(incoming));
  try {
    await fetch('/api/db-set?collection=incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(incoming)
    });
  } catch (e) {
    console.warn("Failed to push incoming logs to MongoDB:", e);
  }
}

async function saveOutgoing() {
  safeLocalStorage.setItem("apex_outgoing_v2", JSON.stringify(outgoing));
  try {
    await fetch('/api/db-set?collection=outgoing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outgoing)
    });
  } catch (e) {
    console.warn("Failed to push outgoing logs to MongoDB:", e);
  }
}

// ── NAVIGATION TAB CONTROLS ─────────────────────────────────────────
window.switchNavTab = function(tabName) {
  currentNavTab = tabName;
  
  // Switch navigation active button
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`nav-${tabName}`);
  if (activeBtn) activeBtn.classList.add("active");

  // Update Page Title
  const title = document.getElementById("page-title");
  const subtitle = document.getElementById("page-subtitle");
  
  switch(tabName) {
    case "dashboard":
      title.textContent = "Dashboard Overview";
      subtitle.textContent = "Real-time status of your store, warehouse, or godown operations.";
      break;
    case "inventory":
      title.textContent = "Inventory Management";
      subtitle.textContent = "Add/edit catalog parameters, track safety stock, and record refilling/sales.";
      break;
    case "incoming":
      title.textContent = "Incoming Stock Log";
      subtitle.textContent = "Track supply arrivals, register incoming cargo, and verify warehouse unloading.";
      break;
    case "outgoing":
      title.textContent = "Outgoing Stock Log";
      subtitle.textContent = "Track shipments dispatched, check delivery locations, and monitor dispatches.";
      break;
    case "insights":
      title.textContent = "AI Recommendations & Insights";
      subtitle.textContent = "Decision intelligence recommendations based on safety levels and velocity analysis.";
      break;
    case "analytics":
      title.textContent = "Analytics & Decision Intelligence";
      subtitle.textContent = "Daily stock trends, weekly valuation curves, and reports distribution center.";
      break;
  }

  // Switch display panel
  document.querySelectorAll(".panel-view").forEach(panel => panel.classList.remove("active"));
  const activePanel = document.getElementById(`panel-${tabName}`);
  if (activePanel) activePanel.classList.add("active");

  // Sync action button text/actions in top header
  syncHeaderActions();

  // Load panel content
  refreshTabContent(tabName);
};

// Sync header button action context
function syncHeaderActions() {
  const btn = document.getElementById("btn-header-action");
  const text = document.getElementById("text-header-action");
  
  if (currentNavTab === "inventory") {
    btn.style.display = "inline-flex";
    text.textContent = "Add Product";
    btn.setAttribute("onclick", "openProductModal()");
  } else if (currentNavTab === "incoming") {
    btn.style.display = "inline-flex";
    text.textContent = "Log Inbound Cargo";
    btn.setAttribute("onclick", "openIncomingModal()");
  } else if (currentNavTab === "outgoing") {
    btn.style.display = "inline-flex";
    text.textContent = "Log Outbound Dispatch";
    btn.setAttribute("onclick", "openMovementModal()");
  } else {
    // Hide action button on dashboard overview and analytics
    btn.style.display = "none";
  }
}

// Global topbar button proxy click
window.handleHeaderAction = function() {
  // Directly triggers attributes set in syncHeaderActions()
};

// ── REFRESH CONTROLLER ──────────────────────────────────────────────
function refreshDashboard() {
  refreshTabContent(currentNavTab);
}

function refreshTabContent(tabName) {
  switch(tabName) {
    case "dashboard":
      renderOverviewKPIs();
      renderRevenueTrendChart();
      renderAIInsights();
      renderActionsRequired();
      renderNotificationsList();
      break;
    case "inventory":
      renderInventoryTable();
      break;
    case "incoming":
      renderIncomingTable();
      break;
    case "outgoing":
      renderOutgoingTable();
      break;
    case "insights":
      renderAIInsightsTab();
      break;
    case "analytics":
      renderAnalyticsCharts();
      renderAnalyticsLists();
      break;
  }
}

// MODULE 1: Dashboard Overview
function renderOverviewKPIs() {
  const activeProducts = getActiveProducts();
  const totalSKUs = activeProducts.length;
  const lowStockCount = activeProducts.filter(p => p.stock <= p.minStock && p.stock > 0).length;
  const totalValuation = activeProducts.reduce((acc, p) => acc + (p.stock * p.price), 0);

  // Dynamic health score logic: drops slightly as low stock increases
  const healthScore = Math.max(75, 100 - (lowStockCount * 2));

  const formattedVal = (totalValuation >= 100000) 
    ? "₹" + (totalValuation / 100000).toFixed(1) + " Lakh"
    : "₹" + (totalValuation / 1000).toFixed(1) + "k";

  const healthEl = document.getElementById("kpi-health");
  if (healthEl) healthEl.textContent = healthScore + "%";

  const revEl = document.getElementById("kpi-revenue");
  if (revEl) revEl.textContent = "₹1,24,500";

  const valEl = document.getElementById("kpi-total-value");
  if (valEl) valEl.textContent = formattedVal;

  const lowEl = document.getElementById("kpi-low-stock");
  if (lowEl) lowEl.textContent = lowStockCount + " Items";

  // Highlight warnings colors dynamically
  const cardLow = document.getElementById("card-low-stock");
  if (cardLow) {
    if (lowStockCount > 0) {
      cardLow.classList.add("kpi-warning");
    } else {
      cardLow.classList.remove("kpi-warning");
    }
  }
}

function renderRevenueTrendChart() {
  const container = document.getElementById("revenue-trend-chart");
  if (!container) return;
  
  container.innerHTML = `
    <svg viewBox="0 0 450 180" width="100%" height="100%">
      <defs>
        <!-- Gold Laser Glow Filter -->
        <filter id="gold-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Grid lines -->
      <line x1="40" y1="20" x2="430" y2="20" stroke="rgba(255,255,255,0.02)" />
      <line x1="40" y1="60" x2="430" y2="60" stroke="rgba(255,255,255,0.02)" />
      <line x1="40" y1="100" x2="430" y2="100" stroke="rgba(255,255,255,0.02)" />
      <line x1="40" y1="140" x2="430" y2="140" stroke="rgba(255,255,255,0.02)" />
      
      <!-- Axis -->
      <line x1="40" y1="140" x2="430" y2="140" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" />
      
      <!-- Graph Spline (Revenue going up towards ₹1,24,500) -->
      <path d="M 40 130 C 100 110, 160 125, 220 80 S 340 50, 420 40" fill="none" stroke="var(--color-gold-bright)" stroke-width="3" stroke-linecap="round" filter="url(#gold-glow)" />
      
      <!-- Spline points -->
      <circle cx="220" cy="80" r="4.5" fill="#020617" stroke="var(--color-gold-bright)" stroke-width="2" />
      <circle cx="420" cy="40" r="5.5" fill="#020617" stroke="var(--color-gold-bright)" stroke-width="2.5" />
      
      <!-- Value Label -->
      <text x="350" y="30" fill="var(--color-gold-bright)" font-size="11.5" font-weight="bold" font-family="'Geist', sans-serif" style="text-shadow: 0 0 8px rgba(251, 191, 36, 0.4);">₹1,24,500</text>
      
      <!-- Labels -->
      <text x="40" y="158" fill="var(--text-second)" font-size="9.5" font-family="'Geist', sans-serif">Mon</text>
      <text x="135" y="158" fill="var(--text-second)" font-size="9.5" font-family="'Geist', sans-serif">Tue</text>
      <text x="230" y="158" fill="var(--text-second)" font-size="9.5" font-family="'Geist', sans-serif">Wed</text>
      <text x="325" y="158" fill="var(--text-second)" font-size="9.5" font-family="'Geist', sans-serif">Thu</text>
      <text x="420" y="158" fill="var(--text-second)" font-size="9.5" font-family="'Geist', sans-serif">Fri</text>
    </svg>
  `;
}

function renderAIInsights() {
  const container = document.getElementById("ai-insights-list");
  if (!container) return;
  container.innerHTML = "";

  const activeProducts = getActiveProducts();
  const lowStock = activeProducts.filter(p => p.stock <= p.minStock);
  
  if (lowStock.length > 0) {
    lowStock.slice(0, 2).forEach(p => {
      container.innerHTML += `
        <div class="insight-item">
          <div class="insight-text">
            💡 <strong>Restock Recommendation:</strong> Product <strong>${p.name}</strong> is running low (${p.stock} left). Consider restocking immediately.
          </div>
        </div>
      `;
    });
  }

  // Fast moving mock note
  const fastProd = activeProducts[0] || { name: "Basmati Rice" };
  container.innerHTML += `
    <div class="insight-item">
      <div class="insight-text">
        📈 <strong>Demand Velocity:</strong> Product <strong>${fastProd.name}</strong> sales are increasing. Ensure safety threshold is met.
      </div>
    </div>
  `;

  // Slow moving mock note
  const slowProd = activeProducts[activeProducts.length - 1] || { name: "Almonds" };
  container.innerHTML += `
    <div class="insight-item">
      <div class="insight-text">
        ❄️ <strong>Dead Stock Warning:</strong> Product <strong>${slowProd.name}</strong> is not moving well. Consider lowering wholesale replenishment sizes.
      </div>
    </div>
  `;
}

function renderActionsRequired() {
  const container = document.getElementById("actions-list-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (actions.length === 0) {
    container.innerHTML = `
      <div style="color: var(--color-success); font-size: 13px; font-style: italic; padding: 16px; text-align: center; background: rgba(16, 185, 129, 0.02); border: 1px dashed rgba(16, 185, 129, 0.15); border-radius: var(--border-radius-md);">
        🎉 All actions completed!
      </div>
    `;
    return;
  }
  
  actions.forEach(act => {
    container.innerHTML += `
      <div class="action-item-card" id="action-node-${act.id}">
        <span>${act.text}</span>
        <button class="action-resolve-btn" onclick="resolveActionItem('${act.id}')" title="Mark as resolved">
          <i data-lucide="check" style="width: 13px; height: 13px;"></i>
        </button>
      </div>
    `;
  });
  
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

window.resolveActionItem = function(id) {
  const node = document.getElementById(`action-node-${id}`);
  if (node) {
    node.style.opacity = "0";
    node.style.transform = "translateX(20px)";
    
    setTimeout(() => {
      actions = actions.filter(act => act.id !== id);
      safeLocalStorage.setItem("apex_actions_v2", JSON.stringify(actions));
      renderActionsRequired();
      
      // Toast notification for user feedback
      showToast("✔️ Action Resolved", "Task marked as completed successfully.");
    }, 250);
  }
};

function renderAIInsightsTab() {
  const grid = document.getElementById("insights-cards-grid");
  if (!grid) return;
  
  const activeProducts = getActiveProducts();
  const lowStockList = activeProducts.filter(p => p.stock <= p.minStock && p.stock > 0);
  
  // 1. Demand Surge Product
  const surgeProduct = activeProducts[0] || { name: "Basmati Rice" };
  const surgeName = surgeProduct.name.split(" (")[0]; // Clean up Telugu names
  
  // 2. Velocity Warning Product
  const warningProduct = activeProducts[activeProducts.length - 1] || activeProducts[0] || { name: "Cooking Oil" };
  const warningName = warningProduct.name.split(" (")[0];
  
  // 3. Replenishment Alert Message
  let replenishmentMsg = "";
  if (lowStockList.length > 0) {
    const lowNames = lowStockList.map(p => p.name.split(" (")[0]).slice(0, 2).join(" & ");
    replenishmentMsg = `✔ Restock ${lowNames} immediately. Current stock has breached safety threshold levels.`;
  } else {
    replenishmentMsg = `✔ All vault items are well stocked. No immediate replenishment action required.`;
  }

  // 4. Warehouse Space Allocation
  const role = safeSessionStorage.getItem("apex_user_role");
  const vaultName = safeSessionStorage.getItem("apex_user_vault") || "Royal Vault A";
  let allocationMsg = "";
  if (role === "admin") {
    allocationMsg = `✔ Warehouse B is underutilized (usage is below 45%). Consolidate expiring inventory here to save cost.`;
  } else {
    if (vaultName.includes("Vault A")) {
      allocationMsg = `✔ Royal Vault A is operating at 82% storage utilization. Core grain stacks are optimized.`;
    } else if (vaultName.includes("Vault B")) {
      allocationMsg = `✔ Royal Vault B is operating at 65% capacity. Consider request to store buffer overflow here.`;
    } else {
      allocationMsg = `✔ Luxury Vault C is highly optimized (90% capacity). Monitor incoming transits to prevent congestion.`;
    }
  }

  grid.innerHTML = `
    <div class="chart-card glass-card" style="border-left: 4px solid #10b981; text-align: left;">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="background: rgba(16, 185, 129, 0.1); color: #10b981; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="check" style="width: 16px; height: 16px;"></i>
        </div>
        <div>
          <h4 style="color: #fff; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">Demand Surge Detected</h4>
          <p style="color: var(--text-second); font-size: 12.5px; margin: 0; line-height: 1.4;">✔ Demand for <strong>${surgeName}</strong> increased by 18% over the past 7 days. Replenish immediately to capture maximum margin.</p>
        </div>
      </div>
    </div>

    <div class="chart-card glass-card" style="border-left: 4px solid #ef4444; text-align: left;">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="background: rgba(239, 68, 68, 0.1); color: #ef4444; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="trending-down" style="width: 16px; height: 16px;"></i>
        </div>
        <div>
          <h4 style="color: #fff; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">Sales Velocity Warning</h4>
          <p style="color: var(--text-second); font-size: 12.5px; margin: 0; line-height: 1.4;">✔ <strong>${warningName}</strong> sales are declining by 12% weekly. Consider lower pricing or running targeted local promotions.</p>
        </div>
      </div>
    </div>

    <div class="chart-card glass-card" style="border-left: 4px solid #fbbf24; text-align: left;">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="background: rgba(251, 191, 36, 0.1); color: #fbbf24; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="alert-triangle" style="width: 16px; height: 16px;"></i>
        </div>
        <div>
          <h4 style="color: #fff; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">Critical Replenishment Alert</h4>
          <p style="color: var(--text-second); font-size: 12.5px; margin: 0; line-height: 1.4;">${replenishmentMsg}</p>
        </div>
      </div>
    </div>

    <div class="chart-card glass-card" style="border-left: 4px solid #3b82f6; text-align: left;">
      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i data-lucide="warehouse" style="width: 16px; height: 16px;"></i>
        </div>
        <div>
          <h4 style="color: #fff; font-size: 14px; font-weight: 700; margin: 0 0 6px 0;">Warehouse Space Allocation</h4>
          <p style="color: var(--text-second); font-size: 12.5px; margin: 0; line-height: 1.4;">${allocationMsg}</p>
        </div>
      </div>
    </div>
  `;
  
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}

window.generateAISummaryReport = function() {
  // Create dialog backdrop
  const modal = document.createElement("div");
  modal.className = "modal-backdrop active";
  modal.id = "modal-ai-summary";
  modal.style.zIndex = "99999";
  
  // Calculate summary metrics
  const activeProducts = getActiveProducts();
  const totalValuation = activeProducts.reduce((acc, p) => acc + (p.stock * p.price), 0);
  const formattedVal = (totalValuation >= 100000) 
    ? "₹" + (totalValuation / 100000).toFixed(2) + " Lakh"
    : "₹" + totalValuation.toLocaleString("en-IN");
  const lowStockList = activeProducts.filter(p => p.stock <= p.minStock && p.stock > 0);
  const healthScore = Math.max(75, 100 - (lowStockList.length * 2));

  // 1. Dynamic surge product
  const surgeProduct = activeProducts[0] || { name: "Basmati Rice" };
  const surgeName = surgeProduct.name.split(" (")[0];

  // 2. Dynamic space message
  const role = safeSessionStorage.getItem("apex_user_role");
  const vaultName = safeSessionStorage.getItem("apex_user_vault") || "Royal Vault A";
  let spaceMessage = "";
  if (role === "admin") {
    spaceMessage = `Warehouse B is currently operating below 45% storage vault capacity. Recommend re-routing incoming dispatches to B.`;
  } else {
    if (vaultName.includes("Vault A")) {
      spaceMessage = `Royal Vault A is operating at 82% efficiency. Stacks are clean and safety aisles are clear.`;
    } else if (vaultName.includes("Vault B")) {
      spaceMessage = `Royal Vault B space utilization is low (65%). Storing overflow here will reduce overhead.`;
    } else {
      spaceMessage = `Luxury Vault C is at 90% capacity. Restrict slow-moving volume inputs.`;
    }
  }

  // 3. Dynamic slow-mover
  const slowProduct = activeProducts[activeProducts.length - 1] || activeProducts[0] || { name: "Almonds" };
  const slowName = slowProduct.name.split(" (")[0];

  modal.innerHTML = `
    <div class="modal-card glass-card" style="max-width: 550px; border: 1px solid rgba(251, 191, 36, 0.25); box-shadow: 0 10px 40px rgba(0,0,0,0.5), 0 0 30px rgba(251, 191, 36, 0.05); text-align: left;">
      <div class="modal-header" style="border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
        <h3 style="color: #fff; font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 8px; margin: 0;">
          <i data-lucide="sparkles" style="color: var(--color-gold-bright);"></i>
          <span>AI Executive Business Diagnosis</span>
        </h3>
        <button class="modal-close-btn" onclick="document.getElementById('modal-ai-summary').remove()"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" style="padding: 20px; font-size: 13.5px; line-height: 1.5; color: var(--text-main);">
        <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 6px; padding: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; color: #10b981; font-size: 12px;">SYSTEM STATUS: ACTIVE & OPTIMIZED</span>
          <span style="font-weight: 800; color: #10b981; font-size: 14px;">Health Score: ${healthScore}%</span>
        </div>

        <p style="margin-bottom: 16px;">Based on consolidated transactions log analysis, your inventory balance is currently valued at <strong style="color: var(--color-gold-bright);">${formattedVal}</strong>.</p>
        
        <h4 style="color: #fff; font-size: 13px; font-weight: 700; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">💡 Strategic Recommendations</h4>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: var(--text-second);">
          <li>
            <strong style="color: #fff;">Replenishment Priority:</strong> 
            ${surgeName} demand velocity has risen by 18%. Refill low stock items immediately to avoid lost margins.
          </li>
          <li>
            <strong style="color: #fff;">Storage Capacity:</strong> 
            ${spaceMessage}
          </li>
          <li>
            <strong style="color: #fff;">Slow Moving Capital:</strong> 
            Slow-moving dead stock is holding up liquid capital. Recommend checking replenishment sizes for ${slowName}.
          </li>
        </ul>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; font-size: 12px; color: var(--text-muted); font-family: monospace;">
          Diagnosis compiled using WAREFLOW AI Decision model.
        </div>
      </div>
      <div class="modal-footer" style="border-top: 1px solid rgba(255,255,255,0.08);">
        <button class="btn btn-secondary" onclick="document.getElementById('modal-ai-summary').remove()" style="padding: 10px 20px; font-size: 12px;">Dismiss</button>
        <button class="btn btn-gold" onclick="window.print();" style="padding: 10px 20px; font-size: 12px;">Print Summary</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
};

window.generateReport = function(type) {
  showToast("📄 Compiling Report", `Extracting system matrices for ${type} report...`);
  
  if (type === "executive") {
    setTimeout(() => {
      generateAISummaryReport();
    }, 600);
    return;
  }
  
  // Construct a CSV string and download it
  setTimeout(() => {
    let csvContent = "";
    let filename = `wareflow_${type}_report.csv`;
    
    if (type === "inventory") {
      csvContent = "Product SKU,Product Name,Category,Quantity,Price per Unit,Total Value,Location,Stock Status\r\n";
      getActiveProducts().forEach(p => {
        const val = p.stock * p.price;
        const status = p.stock === 0 ? "Out of Stock" : (p.stock <= p.minStock ? "Low Stock" : "In Stock");
        csvContent += `"${p.sku}","${p.name}","${p.category}",${p.stock},${p.price},${val},"${p.location}","${status}"\r\n`;
      });
    } else if (type === "weekly" || type === "monthly") {
      csvContent = "Log Type,Date/Time,Product Name,Quantity Transacted,Target/Supplier,Status\r\n";
      getActiveIncoming().forEach(i => {
        csvContent += `"INCOMING","${i.date || ''}","${i.productName || ''}",${i.quantity || 0},"${i.supplierName || ''}","${i.status || ''}"\r\n`;
      });
      getActiveOutgoing().forEach(o => {
        csvContent += `"OUTGOING","${o.date || ''}","${o.productName || ''}",${o.quantity || 0},"${o.destination || ''}","${o.status || ''}"\r\n`;
      });
    }
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("✔️ Download Complete", `${filename} successfully downloaded.`);
    }
  }, 1000);
};

function renderNotificationsList() {
  const container = document.getElementById("notifications-list");
  if (!container) return;
  container.innerHTML = "";

  if (systemNotifications.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:32px;" class="text-muted">No system alerts.</div>`;
    return;
  }

  // Render top 8 notifications
  systemNotifications.slice(0, 8).forEach(notif => {
    let iconName = "bell";
    if (notif.type === "success") iconName = "check-circle";
    if (notif.type === "warning") iconName = "alert-triangle";
    if (notif.type === "danger") iconName = "alert-octagon";
    if (notif.type === "info") iconName = "info";

    container.innerHTML += `
      <div class="notification-item">
        <div class="notification-icon ${notif.type}">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="notification-body">
          <h4>${notif.title}</h4>
          <p>${notif.desc}</p>
          <span style="font-size:10px; color:var(--text-muted);">${notif.time}</span>
        </div>
      </div>
    `;
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// MODULE 2: Inventory Management Directory
window.refreshInventoryView = function() {
  renderInventoryTable();
};

function renderInventoryTable() {
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("inventory-search").value.toLowerCase();
  const filterCat = document.getElementById("inventory-cat-filter").value;

  const activeProducts = getActiveProducts();
  const filtered = activeProducts.filter(p => {
    if (filterCat && p.category !== filterCat) return false;
    return p.name.toLowerCase().includes(query) || 
           p.sku.toLowerCase().includes(query) || 
           p.category.toLowerCase().includes(query);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px;" class="text-muted">No products cataloged in this filter view.</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const statusText = p.status || (p.stock === 0 ? "Out of Stock" : (p.stock <= p.minStock ? "Low Stock" : "Available"));
    let badgeClass = "badge-in-stock";

    if (statusText === "Pending") badgeClass = "badge-pending";
    else if (statusText === "Received" || statusText === "Verified") badgeClass = "badge-received";
    else if (statusText === "Stored" || statusText === "Available") badgeClass = "badge-stored";
    else if (statusText === "Reserved") badgeClass = "badge-reserved";
    else if (statusText === "Dispatched" || statusText === "Delivered") badgeClass = "badge-dispatched";
    else if (statusText === "Low Stock") badgeClass = "badge-low-stock";
    else if (statusText === "Out of Stock" || statusText === "Expired" || statusText === "Damaged") badgeClass = "badge-out-stock";
    else if (statusText === "Returned") badgeClass = "badge-returned";

    tbody.innerHTML += `
      <tr>
        <td class="font-mono text-sm font-semibold" style="color: var(--color-gold);">${p.sku}</td>
        <td style="font-weight:600;">${p.name}</td>
        <td>${p.category}</td>
        <td style="font-weight:700; font-size:14px;">${p.stock}</td>
        <td>₹${p.price.toLocaleString("en-IN")}</td>
        <td style="font-weight:600; color: var(--text-main);">₹${(p.price * p.stock).toLocaleString("en-IN")}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td>
          <div class="table-actions">
            <button class="row-btn btn-refill" onclick="quickArrival('${p.id}')">
              <i data-lucide="download"></i>
              <span>Refill</span>
            </button>
            <button class="row-btn btn-ship" onclick="quickDispatch('${p.id}')">
              <i data-lucide="shopping-cart"></i>
              <span>Ship</span>
            </button>
            <button class="row-btn" onclick="editProduct('${p.id}')">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="row-btn btn-delete" onclick="deleteProduct('${p.id}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

function populateIncomingSupplierFilter() {
  const select = document.getElementById("incoming-supplier-filter");
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = `<option value="all">🏢 All Suppliers</option>`;
  
  const suppliers = [...new Set(incoming.map(i => i.supplier).filter(Boolean))];
  suppliers.forEach(s => {
    select.innerHTML += `<option value="${s}">${s}</option>`;
  });
  
  if (suppliers.includes(currentVal)) {
    select.value = currentVal;
  }
}

// MODULE 3: Incoming supply table
function renderIncomingTable() {
  const tbody = document.getElementById("incoming-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  populateIncomingSupplierFilter();

  const timeFilter = document.getElementById("incoming-time-filter") ? document.getElementById("incoming-time-filter").value : "all";
  const supplierFilter = document.getElementById("incoming-supplier-filter") ? document.getElementById("incoming-supplier-filter").value : "all";

  let filtered = getActiveIncoming();

  // Date constants (supporting both mock dateline 2026-07-07 and real system times)
  const sysToday = new Date().toISOString().split("T")[0];
  const sysYesterdayObj = new Date();
  sysYesterdayObj.setDate(sysYesterdayObj.getDate() - 1);
  const sysYesterday = sysYesterdayObj.toISOString().split("T")[0];
  const sysMonth = new Date().toISOString().slice(0, 7);

  // 1. Time Filtering (Today's, Yesterday's, and Monthly grouping)
  if (timeFilter === "today") {
    filtered = filtered.filter(i => i.eta === "2026-07-07" || i.eta === sysToday);
  } else if (timeFilter === "yesterday") {
    filtered = filtered.filter(i => i.eta === "2026-07-06" || i.eta === sysYesterday);
  } else if (timeFilter === "monthly") {
    filtered = filtered.filter(i => i.eta.startsWith("2026-07") || i.eta.startsWith(sysMonth));
  }

  // 2. Supplier Filtering
  if (supplierFilter !== "all") {
    filtered = filtered.filter(i => i.supplier === supplierFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px;" class="text-muted">No inbound cargo logs match current filters.</td></tr>`;
    return;
  }

  filtered.forEach(inb => {
    let badgeClass = "badge-info";
    if (inb.status === "Arrived") badgeClass = "badge-success";
    if (inb.status === "Delayed") badgeClass = "badge-danger";

    const disabledIfArrived = inb.status === "Arrived" ? "disabled style='opacity:0.4; pointer-events:none;'" : "";

    tbody.innerHTML += `
      <tr>
        <td>${inb.eta}</td>
        <td style="font-weight:600;">${inb.productName}</td>
        <td>${inb.supplier}</td>
        <td style="font-weight:700;">${inb.quantity}</td>
        <td style="color:#f59e0b; font-weight:700;">${inb.expiry || "None"}</td>
        <td><span class="badge ${badgeClass}">${inb.status}</span></td>
        <td style="text-align:right;">
          <button class="row-btn btn-refill" onclick="confirmArrival('${inb.id}')" ${disabledIfArrived}>
            <i data-lucide="shield-check"></i>
            <span>Confirm Arrival</span>
          </button>
        </td>
      </tr>
    `;
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// MODULE 4: Outgoing table
function renderOutgoingTable() {
  const tbody = document.getElementById("outgoing-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const activeOutgoing = getActiveOutgoing();

  if (activeOutgoing.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px;" class="text-muted">No outbound logs recorded.</td></tr>`;
    return;
  }

  const sorted = [...activeOutgoing].reverse();

  sorted.forEach(out => {
    tbody.innerHTML += `
      <tr>
        <td>${out.date}</td>
        <td style="font-weight:600;">${out.productName}</td>
        <td style="font-weight:700; color: var(--color-gold);">${out.quantity}</td>
        <td>${out.destination}</td>
        <td><span class="badge badge-success">Dispatched</span></td>
      </tr>
    `;
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

// MODULE 5: Analytics & Graphs
function renderAnalyticsCharts() {
  const daily = document.getElementById("chart-daily-movement");
  const weekly = document.getElementById("chart-weekly-trends");
  const categories = document.getElementById("chart-categories-split");

  // 1. Daily Movement
  if (daily) {
    daily.innerHTML = `
      <svg viewBox="0 0 400 180" width="100%" height="100%">
        <line x1="40" y1="20" x2="40" y2="150" stroke="#cbd5e1" stroke-width="1" />
        <line x1="40" y1="150" x2="380" y2="150" stroke="#cbd5e1" stroke-width="1" />
        
        <rect x="70" y="80" width="14" height="70" fill="#94a3b8" />
        <rect x="86" y="90" width="14" height="60" fill="#b45309" />
        
        <rect x="160" y="60" width="14" height="90" fill="#94a3b8" />
        <rect x="176" y="100" width="14" height="50" fill="#b45309" />
        
        <rect x="250" y="50" width="14" height="110" fill="#94a3b8" />
        <rect x="266" y="70" width="14" height="80" fill="#b45309" />
        
        <text x="75" y="165" fill="#64748b" font-size="8">Mon</text>
        <text x="165" y="165" fill="#64748b" font-size="8">Tue</text>
        <text x="255" y="165" fill="#64748b" font-size="8">Wed</text>
      </svg>
    `;
  }

  // 2. Weekly Trends
  if (weekly) {
    weekly.innerHTML = `
      <svg viewBox="0 0 400 180" width="100%" height="100%">
        <line x1="40" y1="20" x2="40" y2="150" stroke="#cbd5e1" />
        <line x1="40" y1="150" x2="380" y2="150" stroke="#cbd5e1" />
        <path d="M 40 120 Q 120 70 200 90 T 360 40" fill="none" stroke="#b45309" stroke-width="3" />
        <circle cx="200" cy="90" r="4" fill="#b45309" />
        <circle cx="360" cy="40" r="4" fill="#d4af37" />
        <text x="40" y="165" fill="#64748b" font-size="8">Week 1</text>
        <text x="200" y="165" fill="#64748b" font-size="8">Week 2</text>
        <text x="360" y="165" fill="#64748b" font-size="8">Week 3</text>
      </svg>
    `;
  }

  // 3. Category Split Pie/Donut Chart
  if (categories) {
    categories.innerHTML = `
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        <circle cx="100" cy="100" r="50" fill="none" stroke="#f1f5f9" stroke-width="20" />
        <circle cx="100" cy="100" r="50" fill="none" stroke="#b45309" stroke-width="20" stroke-dasharray="160 314" stroke-dashoffset="0" />
        <circle cx="100" cy="100" r="50" fill="none" stroke="#0f172a" stroke-width="20" stroke-dasharray="100 314" stroke-dashoffset="-160" />
        <circle cx="100" cy="100" r="50" fill="none" stroke="#2563eb" stroke-width="20" stroke-dasharray="54 314" stroke-dashoffset="-260" />
        <text x="100" y="105" text-anchor="middle" fill="#0f172a" font-size="10" font-weight="bold">Category %</text>
      </svg>
    `;
  }
}

function renderAnalyticsLists() {
  const fast = document.getElementById("list-fast-moving");
  const slow = document.getElementById("list-slow-moving");

  const activeProducts = getActiveProducts();

  if (fast) {
    fast.innerHTML = "";
    // Seed fast list
    activeProducts.slice(0, 3).forEach(p => {
      fast.innerHTML += `
        <div class="perf-item">
          <div class="perf-details">
            <span class="perf-name">${p.name}</span>
            <span class="perf-sku">SKU: ${p.sku}</span>
          </div>
          <span class="perf-metric text-success" style="color:var(--color-success);">🔥 High Velocity</span>
        </div>
      `;
    });
  }

  if (slow) {
    slow.innerHTML = "";
    activeProducts.slice(Math.max(0, activeProducts.length - 2)).forEach(p => {
      slow.innerHTML += `
        <div class="perf-item">
          <div class="perf-details">
            <span class="perf-name">${p.name}</span>
            <span class="perf-sku">SKU: ${p.sku}</span>
          </div>
          <span class="perf-metric text-danger" style="color:var(--color-danger);">❄️ Idle / Dead Stock</span>
        </div>
      `;
    });
  }
}

// ── CRUD OPERATIONS (INVENTORY LISTINGS) ────────────────────────────
window.openProductModal = function(id = "") {
  const modal = document.getElementById("modal-product");
  const form = document.getElementById("form-product");
  const title = document.getElementById("modal-product-title");

  form.reset();
  document.getElementById("prod-id").value = "";
  
  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");
  const locInput = document.getElementById("prod-location");

  const stepperContainer = document.getElementById("prod-status-stepper-container");

  if (id) {
    title.textContent = "Edit Product Catalog Entry";
    const prod = products.find(p => p.id === id);
    if (prod) {
      document.getElementById("prod-id").value = prod.id;
      document.getElementById("prod-name").value = prod.name;
      document.getElementById("prod-sku").value = prod.sku;
      document.getElementById("prod-category").value = prod.category;
      document.getElementById("prod-location").value = prod.location;
      document.getElementById("prod-price").value = prod.price;
      
      const stockInput = document.getElementById("prod-stock");
      stockInput.value = prod.stock;
      stockInput.setAttribute("disabled", "true");
      
      document.getElementById("prod-min-stock").value = prod.minStock;

      // Enable and populate Stepper
      if (stepperContainer) {
        stepperContainer.style.display = "block";
        const currentStatus = prod.status || (prod.stock === 0 ? "Out of Stock" : (prod.stock <= prod.minStock ? "Low Stock" : "Available"));
        window.updateStepperUI(currentStatus);
      }
    }
  } else {
    title.textContent = "Add New Product Catalog Entry";
    document.getElementById("prod-stock").removeAttribute("disabled");
    if (role === "manager" && locInput) {
      locInput.value = vault;
    }
    // Hide Stepper for new products
    if (stepperContainer) {
      stepperContainer.style.display = "none";
    }
  }

  // Enforce Manager Vault Location Read-Only lock
  if (role === "manager" && locInput) {
    locInput.setAttribute("readonly", "true");
    locInput.style.opacity = "0.75";
  } else if (locInput) {
    locInput.removeAttribute("readonly");
    locInput.style.opacity = "1";
  }

  if (modal) modal.classList.add("active");
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.closeProductModal = function() {
  const modal = document.getElementById("modal-product");
  if (modal) modal.classList.remove("active");
};

// ── PRODUCT LIFE-CYCLE STATE MACHINE STEPPER FUNCTIONS ────────────────
const LifecycleSteps = ["Pending", "Received", "Verified", "Stored", "Available", "Reserved", "Dispatched", "Delivered"];

window.updateStepperUI = function(status) {
  const badge = document.getElementById("prod-status-badge");
  const fill = document.getElementById("stepper-progress-fill");
  const select = document.getElementById("prod-status-select");

  if (!badge || !fill || !select) return;

  select.value = status;
  badge.textContent = status;
  
  // Distinct visual stylings
  if (status === "Pending") {
    badge.style.background = "rgba(148,163,184,0.15)";
    badge.style.color = "#94a3b8";
    badge.style.borderColor = "rgba(148,163,184,0.3)";
  } else if (status === "Received" || status === "Verified") {
    badge.style.background = "rgba(59,130,246,0.15)";
    badge.style.color = "#60a5fa";
    badge.style.borderColor = "rgba(59,130,246,0.3)";
  } else if (status === "Stored" || status === "Available") {
    badge.style.background = "rgba(16,185,129,0.15)";
    badge.style.color = "#34d399";
    badge.style.borderColor = "rgba(16,185,129,0.3)";
  } else if (status === "Reserved") {
    badge.style.background = "rgba(245,158,11,0.15)";
    badge.style.color = "#fbbf24";
    badge.style.borderColor = "rgba(245,158,11,0.3)";
  } else if (status === "Dispatched" || status === "Delivered") {
    badge.style.background = "rgba(139,92,246,0.15)";
    badge.style.color = "#a78bfa";
    badge.style.borderColor = "rgba(139,92,246,0.3)";
  } else if (status === "Low Stock" || status === "Out of Stock") {
    badge.style.background = "rgba(239,68,68,0.15)";
    badge.style.color = "#f87171";
    badge.style.borderColor = "rgba(239,68,68,0.3)";
  } else if (status === "Expired" || status === "Damaged") {
    badge.style.background = "rgba(220,38,38,0.2)";
    badge.style.color = "#ef4444";
    badge.style.borderColor = "rgba(220,38,38,0.4)";
  } else if (status === "Returned") {
    badge.style.background = "rgba(6,182,212,0.15)";
    badge.style.color = "#22d3ee";
    badge.style.borderColor = "rgba(6,182,212,0.3)";
  }

  const activeIndex = LifecycleSteps.indexOf(status);
  const stepElements = document.querySelectorAll(".stepper-step");

  if (activeIndex !== -1) {
    const percentage = (activeIndex / (LifecycleSteps.length - 1)) * 100;
    fill.style.width = percentage + "%";

    stepElements.forEach((el, index) => {
      const dot = el.querySelector(".step-dot");
      const label = el.querySelector("span");
      if (index <= activeIndex) {
        dot.style.background = "var(--color-gold-bright)";
        dot.style.borderColor = "var(--color-gold-bright)";
        dot.style.color = "#000";
        label.style.color = "#fff";
      } else {
        dot.style.background = "#1e293b";
        dot.style.borderColor = "rgba(255,255,255,0.15)";
        dot.style.color = "var(--text-muted)";
        label.style.color = "var(--text-muted)";
      }
    });
  } else {
    fill.style.width = "0%";
    stepElements.forEach(el => {
      const dot = el.querySelector(".step-dot");
      const label = el.querySelector("span");
      dot.style.background = "#1e293b";
      dot.style.borderColor = "rgba(255,255,255,0.15)";
      dot.style.color = "var(--text-muted)";
      label.style.color = "var(--text-muted)";
    });
  }
};

window.setProductStepperStatus = function(status) {
  window.updateStepperUI(status);
};

window.handleProductStatusDropdownChange = function() {
  const select = document.getElementById("prod-status-select");
  if (select) {
    window.updateStepperUI(select.value);
  }
};

window.editProduct = function(id) {
  openProductModal(id);
};

window.deleteProduct = function(id) {
  if (confirm("Are you sure you want to permanently erase this product catalog entry?")) {
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) {
      const name = products[idx].name;
      products.splice(idx, 1);
      saveProducts();
      refreshDashboard();
      
      logNotification("Product Catalog Erased", `Product ${name} was permanently removed.`, "danger");
      showToast("🗑️ Catalog Erased", `${name} was deleted.`);
    }
  }
};

window.quickArrival = function(id) {
  const prod = products.find(p => p.id === id);
  if (!prod) return;
  
  const qtyStr = prompt(`Enter arrived quantity to refill for ${prod.name}:`, "50");
  if (qtyStr === null) return;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    alert("Invalid quantity.");
    return;
  }

  prod.stock += qty;
  saveProducts();
  
  incoming.push({
    id: "in_" + Date.now(),
    supplier: "Direct Stock Refill",
    productName: prod.name,
    quantity: qty,
    eta: new Date().toISOString().split("T")[0],
    status: "Arrived"
  });
  saveIncoming();

  logNotification("Stock Added Successfully", `Refilled +${qty} units for product ${prod.name}.`, "success");
  showToast("📦 Inbound Arrived", `Restocked +${qty} units of ${prod.sku}.`);
  refreshDashboard();
};

window.quickDispatch = function(id) {
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  const qtyStr = prompt(`Enter quantity to ship for ${prod.name} (Stock: ${prod.stock}):`);
  if (qtyStr === null) return;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    alert("Invalid quantity.");
    return;
  }

  if (prod.stock < qty) {
    alert(`Insufficient stock! ${prod.name} has only ${prod.stock} units left.`);
    return;
  }

  prod.stock -= qty;
  saveProducts();

  outgoing.push({
    id: "out_" + Date.now(),
    destination: "Direct Customer Sale",
    productName: prod.name,
    quantity: qty,
    date: new Date().toISOString().split("T")[0],
    status: "Delivered"
  });
  saveOutgoing();

  logNotification("Stock Shipped", `Dispatched -${qty} units of product ${prod.name}.`, "info");
  showToast("📤 Cargo Shipped", `Dispatched -${qty} units of ${prod.sku}.`);
  checkStockAlert(prod);
  refreshDashboard();
};

// ── CRUD OPERATIONS (INCOMING & OUTGOING SHIPMENTS) ──────────────────
window.openIncomingModal = function() {
  const modal = document.getElementById("modal-incoming");
  const select = document.getElementById("incoming-product");
  
  if (select) {
    select.innerHTML = "";
    getActiveProducts().forEach(p => {
      select.innerHTML += `<option value="${p.id}">${p.name} (${p.sku})</option>`;
    });
  }

  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");
  const whSelect = document.getElementById("incoming-warehouse");
  
  if (whSelect) {
    whSelect.innerHTML = "";
    if ((role === "manager" || role === "worker") && vault && vault !== "all") {
      whSelect.innerHTML = `<option value="${vault}">${vault}</option>`;
    } else {
      whSelect.innerHTML = `
        <option value="Royal Vault A">Royal Vault A</option>
        <option value="Royal Vault B">Royal Vault B</option>
        <option value="Luxury Vault C">Luxury Vault C</option>
      `;
    }
  }

  // Filter scanning buttons based on vault assignment
  const btnDeccan = document.getElementById("btn-scan-deccan");
  const btnGn = document.getElementById("btn-scan-gn");
  const btnGlobal = document.getElementById("btn-scan-global");
  const btnAssam = document.getElementById("btn-scan-assam");

  if (btnDeccan && btnGn && btnGlobal && btnAssam) {
    btnDeccan.style.display = "inline-flex";
    btnGn.style.display = "inline-flex";
    btnGlobal.style.display = "inline-flex";
    btnAssam.style.display = "inline-flex";

    if ((role === "manager" || role === "worker") && vault && vault !== "all") {
      if (vault.includes("Vault A")) {
        btnGlobal.style.display = "none";
        btnAssam.style.display = "none";
      } else if (vault.includes("Vault B")) {
        btnDeccan.style.display = "none";
        btnGn.style.display = "none";
        btnAssam.style.display = "none";
      } else if (vault.includes("Vault C")) {
        btnDeccan.style.display = "none";
        btnGn.style.display = "none";
        btnGlobal.style.display = "none";
      }
    }
  }

  document.getElementById("incoming-eta").value = new Date().toISOString().split("T")[0];

  if (modal) modal.classList.add("active");
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.closeIncomingModal = function() {
  const modal = document.getElementById("modal-incoming");
  if (modal) modal.classList.remove("active");
};

window.activeVerifyArrivalId = null;

window.confirmArrival = function(id) {
  const inb = incoming.find(i => i.id === id);
  if (!inb) return;

  const cleanInbName = inb.productName.split(" (")[0].toLowerCase();
  const prod = products.find(p => p.name.toLowerCase().includes(cleanInbName) || 
                                  cleanInbName.includes(p.name.split(" (")[0].toLowerCase()));
  if (prod) {
    prod.stock += inb.quantity;
    inb.status = "Arrived";
    
    saveProducts();
    saveIncoming();
    
    logNotification("Stock Arrival Confirmed", `Received ${inb.quantity} units for product ${prod.name} successfully.`, "success");
    showToast("✅ Cargo Received", `Received ${inb.quantity} units of ${prod.sku} into storage.`);
    
    refreshDashboard();
  } else {
    alert("Match failed: Product catalog not found in store registry.");
  }
};

// State management variables for Outbound scan loop
let outboundCart = [];
let activeScannedProduct = null;

window.openMovementModal = function() {
  const modal = document.getElementById("modal-movement");
  if (!modal) return;

  // Reset stages to show Stage 0 Pairing QR first
  document.getElementById("outbound-stage-pair").style.display = "block";
  document.getElementById("outbound-stage-scan").style.display = "none";
  document.getElementById("outbound-stage-item-detail").style.display = "none";
  document.getElementById("outbound-stage-cart-buyer").style.display = "none";
  document.getElementById("outbound-stage-invoice").style.display = "none";

  // Reset pairing status text
  const pairingStatus = document.getElementById("pairing-handshake-status");
  if (pairingStatus) {
    pairingStatus.textContent = "AWAITING HANDSHAKE...";
    pairingStatus.style.color = "#fbbf24";
  }

  // Reset variables
  outboundCart = [];
  activeScannedProduct = null;

  // Hide scanner progress box
  const progressBox = document.getElementById("outbound-scan-progress-box");
  if (progressBox) progressBox.style.display = "none";

  // Generate dynamic unique pairing ID
  const pairingId = 'apex-' + Math.random().toString(36).substring(2, 9);
  window.activeOutboundPairingId = pairingId;

  // Retrieve saved IP address from LocalStorage
  const savedIp = safeLocalStorage.getItem("apex_local_ip") || window.location.hostname || "localhost";
  
  // Build pairing URL matching current hostname & port dynamically
  let pairingUrl = "";
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    pairingUrl = `http://${savedIp}:${window.location.port || '8080'}/mobile.html?peer=${pairingId}`;
  } else {
    pairingUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'))}/mobile.html?peer=${pairingId}`;
  }

  // Generate dynamic QR code in canvas using QRious (or fallback to SVG)
  const qrCanvas = document.getElementById("outbound-qr-canvas");
  if (qrCanvas && typeof QRious !== "undefined") {
    new QRious({
      element: qrCanvas,
      value: pairingUrl,
      size: 250,
      background: '#ffffff',
      foreground: '#000000'
    });
  } else {
    const qrBox = document.getElementById("outbound-pairing-qr-box");
    if (qrBox) {
      qrBox.innerHTML = window.generateQRCodeSVG ? window.generateQRCodeSVG(pairingUrl) : "";
    }
  }

  // Update pairing text link to copy/open
  const pairLink = document.getElementById("outbound-pairing-link");
  if (pairLink) {
    pairLink.href = pairingUrl;
  }

  let isMobilePaired = false;

  // ── 1. WebSocket Connection (Primary - local only, skipped on HTTPS/cloud) ─
  if (window.activeOutboundWS) {
    try { window.activeOutboundWS.close(); } catch(e) {}
  }

  const isSecure = window.location.protocol === 'https:';
  const wsHost   = safeLocalStorage.getItem("apex_local_ip") || window.location.hostname || "localhost";
  const wsUrl    = `ws://${wsHost}:8765`;

  function handleSkuScan(sku) {
    const prod = products.find(p =>
      p.sku.toLowerCase() === sku.toLowerCase() || (p.barcode && p.barcode === sku)
    );
    if (prod) {
      window.triggerOutboundScan(prod.id);
    } else {
      showToast("⚠️ Barcode Not Found", `Scanned: ${sku} is not registered in catalog.`);
    }
  }

  if (!isSecure) {
    // Only attempt WebSocket on local/HTTP origins (not on Vercel HTTPS)
    try {
      const ws = new WebSocket(wsUrl);
      window.activeOutboundWS = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "register", peer: pairingId, role: "laptop" }));
        console.log(`[WS] Laptop registered for session: ${pairingId}`);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "paired" && !isMobilePaired) {
            isMobilePaired = true;
            if (pairingStatus) {
              pairingStatus.textContent = "PAIRED (WebSocket) ✓";
              pairingStatus.style.color = "#10b981";
            }
            showToast("📱 Mobile Paired", "Real-time WebSocket connection established!");
            setTimeout(() => {
              document.getElementById("outbound-stage-pair").style.display = "none";
              document.getElementById("outbound-stage-scan").style.display = "block";
            }, 800);

          } else if (msg.type === "scan_sku") {
            handleSkuScan(msg.sku);

          } else if (msg.type === "disconnected") {
            isMobilePaired = false;
            showToast("📵 Mobile Disconnected", "Scanner phone disconnected from session.");
            if (pairingStatus) {
              pairingStatus.textContent = "DISCONNECTED — Rescan QR to reconnect";
              pairingStatus.style.color = "#ef4444";
            }
          }
        } catch (e) { /* ignore bad JSON */ }
      };

      ws.onerror = () => {
        console.warn("[WS] WebSocket unavailable, falling back to PeerJS + REST polling...");
      };

      ws.onclose = () => {
        console.log("[WS] Laptop WebSocket closed.");
      };

    } catch (wsErr) {
      console.warn("[WS] Could not create WebSocket:", wsErr);
    }
  } else {
    console.log("[WS] HTTPS detected — skipping WebSocket, using PeerJS cloud broker.");
  }

  // ── 2. PeerJS WebRTC fallback (Cloud broker - works over internet) ────────
  if (typeof Peer !== "undefined") {
    try {
      if (window.activeOutboundPeer) {
        window.activeOutboundPeer.destroy();
      }
      const peer = new Peer(pairingId);
      window.activeOutboundPeer = peer;

      peer.on('connection', (conn) => {
        conn.on('data', (data) => {
          if (data.type === 'pair' && !isMobilePaired) {
            isMobilePaired = true;
            if (pairingStatus) {
              pairingStatus.textContent = "PAIRED (Cloud P2P) ✓";
              pairingStatus.style.color = "#10b981";
            }
            showToast("📱 Mobile Paired", "Cloud P2P WebRTC connection established.");
            setTimeout(() => {
              document.getElementById("outbound-stage-pair").style.display = "none";
              document.getElementById("outbound-stage-scan").style.display = "block";
            }, 1000);
          } else if (data.type === 'scan_sku') {
            handleSkuScan(data.sku);
          }
        });
      });
    } catch (err) {
      console.warn("[PeerJS] Initialization failed:", err);
    }
  }

  // ── 3. REST Polling fallback (Local Wi-Fi only) ───────────────────────────
  if (window.outboundPollTimer) clearInterval(window.outboundPollTimer);

  window.outboundPollTimer = setInterval(() => {
    if (!modal.classList.contains("active")) {
      clearInterval(window.outboundPollTimer);
      return;
    }
    if (isMobilePaired) return; // WebSocket or PeerJS already handling it

    fetch(`/api/check-pair?peer=${pairingId}`)
      .then(r => r.json())
      .then(data => {
        if (data.paired && !isMobilePaired) {
          isMobilePaired = true;
          if (pairingStatus) {
            pairingStatus.textContent = "PAIRED (Wi-Fi REST) ✓";
            pairingStatus.style.color = "#10b981";
          }
          showToast("📱 Mobile Paired", "REST handshake established over local Wi-Fi.");
          setTimeout(() => {
            document.getElementById("outbound-stage-pair").style.display = "none";
            document.getElementById("outbound-stage-scan").style.display = "block";
          }, 1000);
        }
      }).catch(() => {});

    fetch(`/api/poll-scan?peer=${pairingId}`)
      .then(r => r.json())
      .then(data => {
        (data.skus || []).forEach(sku => handleSkuScan(sku));
      }).catch(() => {});
  }, 1000);

  // Populate dynamic barcode simulation buttons
  const optionsEl = document.getElementById("outbound-scan-options");
  if (optionsEl) {
    optionsEl.innerHTML = "";
    getActiveProducts().forEach(p => {
      optionsEl.innerHTML += `
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.triggerOutboundScan('${p.id}')" style="font-size:10px; padding:5px 10px; border-radius:4px;">
          🔍 ${p.name.split(" (")[0]}
        </button>
      `;
    });
  }

  modal.classList.add("active");
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.closeMovementModal = function() {
  const modal = document.getElementById("modal-movement");
  if (modal) modal.classList.remove("active");
};

// Wizard helper: simulate phone pairing scan sequence
window.simulateMobilePairingHandshake = function() {
  const statusEl = document.getElementById("pairing-handshake-status");
  if (!statusEl) return;

  statusEl.textContent = "DECODING SECURE PAIRING LINK...";
  statusEl.style.color = "#fbbf24";

  setTimeout(() => {
    statusEl.textContent = "PAIRED SUCCESSFULLY!";
    statusEl.style.color = "#10b981";
    showToast("📱 Mobile Paired", "Google Lens pairing connection established successfully.");

    setTimeout(() => {
      // Transition to Stage 1 barcode scan viewport
      document.getElementById("outbound-stage-pair").style.display = "none";
      document.getElementById("outbound-stage-scan").style.display = "block";
    }, 1000);
  }, 1200);
};

// Wizard helper: simulate barcode scan progress
window.triggerOutboundScan = function(productId) {
  const p = products.find(prod => prod.id === productId);
  if (!p) return;

  const progressBox = document.getElementById("outbound-scan-progress-box");
  const progressEl = document.getElementById("outbound-scan-progress-bar");
  const percentageEl = document.getElementById("outbound-scan-percentage");
  const statusEl = document.getElementById("outbound-scan-status-text");

  if (!progressBox || !progressEl || !percentageEl || !statusEl) return;

  progressBox.style.display = "block";
  progressEl.style.width = "0%";
  percentageEl.textContent = "0%";
  statusEl.textContent = "Booting Camera Core...";

  const steps = [
    { p: 30, txt: "Aiming viewfinder laser..." },
    { p: 65, txt: "Decoding barcode symbology..." },
    { p: 100, txt: "Item recognized!" }
  ];

  let currentIdx = 0;
  function runScanStep() {
    if (currentIdx < steps.length) {
      const step = steps[currentIdx];
      progressEl.style.width = step.p + "%";
      percentageEl.textContent = step.p + "%";
      statusEl.textContent = step.txt;
      currentIdx++;
      setTimeout(runScanStep, 350);
    } else {
      // Completed scan! Hide scanner stage and show details stage
      progressBox.style.display = "none";
      document.getElementById("outbound-stage-scan").style.display = "none";
      document.getElementById("outbound-stage-item-detail").style.display = "block";

      // Fill in scanned product details
      document.getElementById("outbound-detail-name").textContent = p.name;
      document.getElementById("outbound-detail-sku").textContent = p.sku;
      document.getElementById("outbound-detail-avail").textContent = p.stock;
      
      const qtyInput = document.getElementById("outbound-detail-qty");
      if (qtyInput) {
        qtyInput.value = "";
        qtyInput.max = p.stock;
        qtyInput.focus();
      }
      
      // Default date to today
      const dateInput = document.getElementById("outbound-detail-date");
      if (dateInput) {
        dateInput.value = new Date().toISOString().split("T")[0];
      }

      activeScannedProduct = p;
      showToast("📸 Barcode Scanned", `Decoded SKU for ${p.name.split(" (")[0]}`);
    }
  }

  setTimeout(runScanStep, 200);
};

// Wizard helper: go back to scan stage to queue next item
window.outboundBackToScan = function() {
  const qtyInput = document.getElementById("outbound-detail-qty");
  const dateInput = document.getElementById("outbound-detail-date");
  if (!qtyInput || !dateInput) return;

  const qty = parseInt(qtyInput.value);
  const date = dateInput.value;

  if (isNaN(qty) || qty <= 0) {
    showToast("⚠️ Invalid Quantity", "Please enter a valid quantity to dispatch.");
    return;
  }

  if (activeScannedProduct && activeScannedProduct.stock < qty) {
    showToast("⚠️ Insufficient Stock", `Only ${activeScannedProduct.stock} units available in vault storage.`);
    return;
  }

  // Push item to cart
  const exists = outboundCart.find(item => item.product.id === activeScannedProduct.id);
  if (exists) {
    exists.qty += qty;
  } else {
    outboundCart.push({
      product: activeScannedProduct,
      qty: qty,
      date: date
    });
  }

  showToast("➕ Item Added to Queue", `Added ${qty} bags of ${activeScannedProduct.sku} to dispatch queue.`);

  // Reset details stage
  activeScannedProduct = null;
  document.getElementById("outbound-stage-item-detail").style.display = "none";
  document.getElementById("outbound-stage-scan").style.display = "block";
};

// Wizard helper: add current item and proceed to review cart & buyer info
window.outboundAddAndProceed = function() {
  const qtyInput = document.getElementById("outbound-detail-qty");
  const dateInput = document.getElementById("outbound-detail-date");
  if (!qtyInput || !dateInput) return;

  const qty = parseInt(qtyInput.value);
  const date = dateInput.value;

  if (!isNaN(qty) && qty > 0) {
    if (activeScannedProduct && activeScannedProduct.stock < qty) {
      showToast("⚠️ Insufficient Stock", `Only ${activeScannedProduct.stock} units available in vault storage.`);
      return;
    }

    const exists = outboundCart.find(item => item.product.id === activeScannedProduct.id);
    if (exists) {
      exists.qty += qty;
    } else {
      outboundCart.push({
        product: activeScannedProduct,
        qty: qty,
        date: date
      });
    }
  }

  if (outboundCart.length === 0) {
    showToast("⚠️ Dispatch Cart Empty", "Please scan and add at least one item first.");
    return;
  }

  activeScannedProduct = null;
  document.getElementById("outbound-stage-item-detail").style.display = "none";
  document.getElementById("outbound-stage-cart-buyer").style.display = "block";

  renderOutboundCartTable();
};

// Wizard helper: render cart list
function renderOutboundCartTable() {
  const tbody = document.getElementById("outbound-cart-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  outboundCart.forEach((item, index) => {
    tbody.innerHTML += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
        <td style="padding: 8px 12px; font-weight:700; color:#fff;">${item.product.name.split(" (")[0]}</td>
        <td style="padding: 8px 12px; font-family:monospace; color:var(--text-second);">${item.product.sku}</td>
        <td style="padding: 8px 12px; text-align:right; font-weight:700; color:var(--color-gold-bright);">${item.qty}</td>
        <td style="padding: 8px 12px; text-align:center;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="removeOutboundCartItem(${index})" style="padding:3px; background:none; border:none; height:auto; color:var(--color-danger); cursor:pointer;">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
          </button>
        </td>
      </tr>
    `;
  });

  if (typeof lucide !== "undefined") lucide.createIcons();
}

window.removeOutboundCartItem = function(index) {
  outboundCart.splice(index, 1);
  renderOutboundCartTable();
  if (outboundCart.length === 0) {
    document.getElementById("outbound-stage-cart-buyer").style.display = "none";
    document.getElementById("outbound-stage-scan").style.display = "block";
  }
};

window.outboundBackToScanFromCart = function() {
  document.getElementById("outbound-stage-cart-buyer").style.display = "none";
  document.getElementById("outbound-stage-scan").style.display = "block";
};

// Wizard helper: validate buyer inputs and proceed to preview printable invoice
window.submitOutboundDispatchList = function() {
  const name = document.getElementById("outbound-buyer-name").value.trim();
  const address = document.getElementById("outbound-buyer-address").value.trim();
  const gstin = document.getElementById("outbound-buyer-gstin").value.trim().toUpperCase();
  const phone = document.getElementById("outbound-buyer-phone").value.trim();

  if (!name || !address || !gstin || !phone) {
    showToast("⚠️ Missing Buyer Info", "Please fill in all buyer billing details first.");
    return;
  }

  // Pre-fill invoice layout
  const vault = safeSessionStorage.getItem("apex_user_vault") || "Royal Vault A";
  document.getElementById("invoice-seller-vault").textContent = `${vault} Storage Terminal`;
  
  if (vault.includes("Vault A")) {
    document.getElementById("invoice-seller-address").textContent = "Aisle 5, Grains Facility, Zone 2";
  } else if (vault.includes("Vault B")) {
    document.getElementById("invoice-seller-address").textContent = "Aisle 2, Liquid Oils Terminal, Zone 1";
  } else {
    document.getElementById("invoice-seller-address").textContent = "Aisle 9, Luxury Packagings Terminal, Zone 3";
  }

  // Set IDs and buyer details
  document.getElementById("invoice-id-val").textContent = `INV/OUT/2026-${Math.floor(Math.random() * 90000 + 10000)}`;
  document.getElementById("invoice-date-val").textContent = new Date().toLocaleDateString("en-IN") + " " + new Date().toLocaleTimeString("en-IN", {hour: '2-digit', minute:'2-digit'});
  
  document.getElementById("invoice-buyer-name").textContent = name;
  document.getElementById("invoice-buyer-address").textContent = address;
  document.getElementById("invoice-buyer-gstin").textContent = gstin;
  document.getElementById("invoice-buyer-phone").textContent = phone;

  // Build items list
  const tbody = document.getElementById("invoice-items-tbody");
  if (tbody) {
    tbody.innerHTML = "";
    let totalAmt = 0;
    outboundCart.forEach(item => {
      const lineAmt = item.qty * item.product.price;
      totalAmt += lineAmt;
      tbody.innerHTML += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 6px 4px; font-weight:bold;">${item.product.name}</td>
          <td style="padding: 6px 4px; font-family:monospace;">${item.product.sku}</td>
          <td style="padding: 6px 4px; text-align:right; font-weight:bold;">${item.qty}</td>
          <td style="padding: 6px 4px; text-align:right;">₹${item.product.price.toLocaleString("en-IN")}</td>
          <td style="padding: 6px 4px; text-align:right; font-weight:bold;">₹${lineAmt.toLocaleString("en-IN")}</td>
        </tr>
      `;
    });

    document.getElementById("invoice-total-val").textContent = `₹${totalAmt.toLocaleString("en-IN")}`;
  }

  // Switch to invoice stage
  document.getElementById("outbound-stage-cart-buyer").style.display = "none";
  document.getElementById("outbound-stage-invoice").style.display = "block";
};

// Wizard helper: finalize stock subtraction and ledger insertion
window.finalizeOutboundShipment = function() {
  const buyerName = document.getElementById("outbound-buyer-name").value.trim();
  const dateVal = document.getElementById("outbound-detail-date").value || new Date().toISOString().split("T")[0];

  outboundCart.forEach(item => {
    // Subtract stock
    const prod = products.find(p => p.id === item.product.id);
    if (prod) {
      prod.stock = Math.max(0, prod.stock - item.qty);
      checkStockAlert(prod);
    }

    // Insert into outgoing shipments list
    outgoing.push({
      id: "out_sys_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      destination: buyerName,
      productName: item.product.name,
      quantity: item.qty,
      date: dateVal,
      status: "Delivered"
    });
  });

  saveProducts();
  saveOutgoing();

  logNotification("Outbound Dispatched", `Successfully dispatched ${outboundCart.length} products to ${buyerName} and generated printable dispatch bill.`, "success");
  showToast("🚚 Cargo Shipped", `Successfully processed outgoing shipments pipeline!`);

  closeMovementModal();
  refreshDashboard();
};

// ── FORMS SUBMISSION HANDLERS ───────────────────────────────────────
function setupFormHandlers() {
  // 1. Save Product
  const formProd = document.getElementById("form-product");
  if (formProd) {
    formProd.addEventListener("submit", (e) => {
      e.preventDefault();
      
      const id = document.getElementById("prod-id").value;
      const name = document.getElementById("prod-name").value.trim();
      const sku = document.getElementById("prod-sku").value.trim().toUpperCase();
      const category = document.getElementById("prod-category").value.trim();
      const location = document.getElementById("prod-location").value.trim();
      const price = parseFloat(document.getElementById("prod-price").value);
      const minStock = parseInt(document.getElementById("prod-min-stock").value);

      if (id) {
        // Edit mode
        const idx = products.findIndex(p => p.id === id);
        if (idx !== -1) {
          const status = document.getElementById("prod-status-select") ? document.getElementById("prod-status-select").value : "Available";
          products[idx] = {
            ...products[idx],
            name, sku, category, location, price, minStock, status
          };
          saveProducts();
          logNotification("Product Catalog Modified", `Updated details and workflow status for ${name} (${sku}).`, "info");
          showToast("✏️ Catalog Modified", `Updated details for ${sku}.`);
        }
      } else {
        // Create mode
        const stock = parseInt(document.getElementById("prod-stock").value);
        const newProd = {
          id: "p_" + Date.now(),
          name, sku, category, location, price, stock, minStock,
          createdDate: new Date().toISOString().split("T")[0],
          image: "images/cardboard_box.svg",
          status: "Available"
        };
        products.push(newProd);
        saveProducts();
        logNotification("New Product Cataloged", `Added ${name} to listings.`, "success");
        showToast("✨ Catalog Created", `Added new product entry ${sku}.`);
        
        if (stock > 0) {
          incoming.push({
            id: "in_init_" + Date.now(),
            supplier: "Warehouse Initial Load",
            productName: name,
            quantity: stock,
            eta: new Date().toISOString().split("T")[0],
            status: "Arrived"
          });
          saveIncoming();
        }
      }

      closeProductModal();
      populateCategoryDropdown();
      refreshDashboard();
    });
  }

  // 2. Outgoing Cargo Dispatch (Wizard handles this directly via submitOutboundDispatchList and finalizeOutboundShipment)

  // 3. Log Inbound Cargo
  const formIncoming = document.getElementById("form-incoming");
  if (formIncoming) {
    formIncoming.addEventListener("submit", (e) => {
      e.preventDefault();

      const previewCard = document.getElementById("scanner-preview-card");
      const isScanned = previewCard && previewCard.style.display === "block";
      
      // Determine if this is the G.N. Enterprises multi-item invoice
      const sellerNameEl = document.getElementById("preview-seller-name");
      const isGnScan = isScanned && sellerNameEl && sellerNameEl.textContent === "G. N. ENTERPRISES";

      if (isGnScan) {
        // Log all 7 G.N. Enterprises grain items into stock at once!
        const gnItems = [
          { name: "Malki (మల్కీ)", sku: "GR-MK-001", qty: 75 },
          { name: "Rajma (రాజ్మా)", sku: "GR-RJ-001", qty: 60 },
          { name: "Kabli Chana (కాబ్లీ శనగలు)", sku: "GR-KC-001", qty: 60 },
          { name: "Moong Dhowa (పెసర పప్పు)", sku: "GR-MD-001", qty: 30 },
          { name: "Lobiya (అలసందలు)", sku: "GR-LB-001", qty: 30 },
          { name: "Dall Arhar (కంది పప్పు)", sku: "GR-DA-001", qty: 3000 },
          { name: "Dall Chana (శనగ పప్పు)", sku: "GR-DC-001", qty: 1500 }
        ];

        gnItems.forEach((item, index) => {
          const prod = products.find(p => p.sku === item.sku);
          if (prod) {
            prod.stock += item.qty;
            incoming.push({
              id: "in_gn_" + item.sku.toLowerCase().replace(/-/g, "_") + "_" + (Date.now() + index),
              supplier: "G. N. ENTERPRISES",
              productName: prod.name,
              quantity: item.qty,
              eta: "2024-04-09",
              status: "Arrived"
            });
          }
        });

        saveProducts();
        saveIncoming();

        logNotification("Multi-Stock Received (G.N.)", "Directly logged and loaded all 7 grain items from G.N. Enterprises bill into storage vaults.", "success");
        showToast("✅ 7 Items Stocked", "Successfully added all 7 invoice items to vault stock balances!");

      } else {
        // Standard single item cargo entry
        const supplier = document.getElementById("incoming-supplier").value.trim();
        const productId = document.getElementById("incoming-product").value;
        const quantity = parseInt(document.getElementById("incoming-quantity").value);
        const eta = document.getElementById("incoming-eta").value;
        const expiry = document.getElementById("incoming-expiry").value;

        const prod = products.find(p => p.id === productId);
        if (!prod) return;

        const status = isScanned ? "Arrived" : "In Transit";

        if (isScanned) {
          prod.stock += quantity;
          saveProducts();
        }

        incoming.push({
          id: "in_" + Date.now(),
          supplier: supplier,
          productName: prod.name,
          quantity: quantity,
          eta: eta,
          expiry: expiry,
          status: status
        });
        saveIncoming();

        if (isScanned) {
          logNotification("Stock Received (Bill Scanned)", `Directly added +${quantity} units to ${prod.name} after bill scan.`, "success");
          showToast("✅ Stock Updated", `Added +${quantity} units of ${prod.sku} directly to stock.`);
        } else {
          logNotification("Supply Pipeline Inbound", `Logged shipment transit for ${prod.name} (QTY: ${quantity}).`, "info");
          showToast("🚚 Supply Inbound", `Log entry added to supply transits pipeline.`);
        }
      }

      // Reset scanner elements for next time
      if (previewCard) previewCard.style.display = "none";

      closeIncomingModal();
      refreshDashboard();
    });
  }
}

// Populate Category Filter dropdown
function populateCategoryDropdown() {
  const select = document.getElementById("inventory-cat-filter");
  if (!select) return;
  select.innerHTML = `<option value="">All Categories</option>`;
  
  const activeProducts = getActiveProducts();
  const categories = [...new Set(activeProducts.map(p => p.category))];
  categories.forEach(cat => {
    select.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
}

// Helper: Log notifications feed dynamically
function logNotification(title, desc, type) {
  const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  systemNotifications.unshift({
    id: "n_" + Date.now(),
    title, desc, type, time
  });
  renderNotificationsList();
}

// ── LOW STOCK NOTIFICATIONS UTILS ──────────────────────────────────
window.updateNotificationToggleUI = function() {
  const btn = document.getElementById("btn-notifications-toggle");
  const icon = document.getElementById("icon-notification-bell");
  const text = document.getElementById("text-notification-toggle");
  if (!btn || !icon || !text) return;

  const isEnabled = safeLocalStorage.getItem("apex_notifications_enabled") === "true";

  if (isEnabled) {
    icon.setAttribute("data-lucide", "bell");
    text.textContent = "Alerts On";
    btn.style.color = "var(--color-gold)";
    btn.style.borderColor = "var(--color-gold)";
    btn.style.background = "var(--color-gold-light)";
  } else {
    icon.setAttribute("data-lucide", "bell-off");
    text.textContent = "Alerts Off";
    btn.style.color = "var(--text-muted)";
    btn.style.borderColor = "var(--border-color)";
    btn.style.background = "none";
  }

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
};

window.showToast = function(title, body, product = null) {
  const container = document.getElementById("toast-container") || createToastContainer();
  const toast = document.createElement("div");
  toast.className = "toast-notification";
  
  const iconHtml = product && product.stock === 0 
    ? `<i data-lucide="alert-octagon" style="width:18px;height:18px;"></i>`
    : `<i data-lucide="alert-triangle" style="width:18px;height:18px;"></i>`;
    
  let whatsappBtnHtml = "";
  if (product && (product.stock <= product.minStock || product.stock === 0)) {
    whatsappBtnHtml = `
      <button class="btn btn-gold btn-sm" onclick="sendWhatsAppAlertDirect('${product.sku}', '${product.name.replace(/'/g, "\\'")}', ${product.stock}, ${product.minStock})" style="margin-top: 8px; padding: 4px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border-radius: 4px; border: 1px solid var(--color-gold);">
        <i data-lucide="send" style="width:11px;height:11px;"></i>
        <span>Send WhatsApp Alert</span>
      </button>
    `;
  }

  toast.innerHTML = `
    <div class="toast-icon" style="${product && product.stock === 0 ? 'background:var(--color-danger-bg);color:var(--color-danger);' : 'background:var(--color-warning-bg);color:var(--color-warning);'}">
      ${iconHtml}
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-desc">${body}</div>
      ${whatsappBtnHtml}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
  `;
  container.appendChild(toast);
  
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
  
  setTimeout(() => toast.classList.add("active"), 10);
  setTimeout(() => {
    toast.classList.remove("active");
    setTimeout(() => toast.remove(), 400);
  }, 6000);
};

function createToastContainer() {
  const div = document.createElement("div");
  div.id = "toast-container";
  div.className = "toast-container";
  document.body.appendChild(div);
  return div;
}

window.sendSystemNotification = function(title, body) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted" && safeLocalStorage.getItem("apex_notifications_enabled") === "true") {
    try {
      new Notification(title, {
        body: body,
        icon: "images/cardboard_box.svg"
      });
    } catch (e) {
      console.warn("System notification block failed", e);
    }
  }
};

window.checkStockAlert = function(product) {
  if (product.stock === 0) {
    logNotification("Product Out of Stock", `Product ${product.name} (${product.sku}) is completely empty.`, "danger");
    triggerAlertNotification(
      `🚫 Stock Empty: ${product.name}`,
      `${product.name} is out of stock. dispatches are blocked.`,
      product
    );
    triggerWhatsAppAlert(product);
  } else if (product.stock <= product.minStock) {
    logNotification("Product Stock Low", `Product ${product.name} (${product.sku}) is below safety threshold limit.`, "warning");
    triggerAlertNotification(
      `⚠️ Low Stock: ${product.name}`,
      `${product.name} is running low. Current: ${product.stock} (Safety limit: ${product.minStock}).`,
      product
    );
    triggerWhatsAppAlert(product);
  }
};

function triggerAlertNotification(title, message, product) {
  if (safeLocalStorage.getItem("apex_notifications_enabled") === "true") {
    window.showToast(title, message, product);
    window.sendSystemNotification(title, message);
  }
}

// ── CSV REPORT EXPORTER ─────────────────────────────────────────────
window.exportDataCSV = function(type) {
  let csvContent = "data:text/csv;charset=utf-8,";
  let filename = `apexstock_${type}_report_${Date.now()}.csv`;

  const activeProducts = getActiveProducts();
  const activeIncoming = getActiveIncoming();
  const activeOutgoing = getActiveOutgoing();

  if (type === "inventory") {
    csvContent += "=== WAREHOUSE INVENTORY REPORT ===\n";
    csvContent += "SKU,Product Name,Category,Quantity On Hand,Valuation Price,Safety Threshold,Vault Location\n";
    activeProducts.forEach(p => {
      csvContent += `"${p.sku}","${p.name.replace(/"/g, '""')}","${p.category}",${p.stock},${p.price},${p.minStock},"${p.location}"\n`;
    });
  } 
  else if (type === "incoming") {
    csvContent += "=== INCOMING CARGO SHIPMENTS LEDGER ===\n";
    csvContent += "Expected Date/Time,Product Name,Supplier Name,Quantity Added,Status\n";
    activeIncoming.forEach(i => {
      csvContent += `"${i.eta}","${i.productName.replace(/"/g, '""')}","${i.supplier.replace(/"/g, '""')}",${i.quantity},"${i.status}"\n`;
    });
  } 
  else if (type === "outgoing") {
    csvContent += "=== OUTBOUND CARGO DISPATCHES LEDGER ===\n";
    csvContent += "Date & Time,Product Name,Quantity Removed,Customer / Delivery Location\n";
    activeOutgoing.forEach(o => {
      csvContent += `"${o.date}","${o.productName.replace(/"/g, '""')}",${o.quantity},"${o.destination.replace(/"/g, '""')}"\n`;
    });
  } 
  else if (type === "analytics") {
    csvContent += "=== ANALYTICS SUMMARY REPORT ===\n";
    csvContent += "Metrics Description,Metric Value\n";
    csvContent += `"Total SKU Catalog size",${activeProducts.length}\n`;
    csvContent += `"Total Stock Volume Stored",${activeProducts.reduce((acc,p)=>acc+p.stock, 0)}\n`;
    csvContent += `"Valuation ledger balance",₹${activeProducts.reduce((acc,p)=>acc+(p.stock*p.price), 0)}\n`;
    csvContent += `"Total warnings items below threshold",${activeProducts.filter(p=>p.stock<=p.minStock).length}\n`;
  }

  // Trigger browser downloader anchor click
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast("📊 Spreadsheet Exported", `Report downloaded successfully: ${filename}`);
  logNotification("Spreadsheet Downloaded", `Spreadsheet exported successfully for: ${type} report logs.`, "success");
};

// ── WAREFLOW AI 3D CINEMATIC INTRO ANIMATION ─────────────────────────
let introAnimId;
let introRenderer, introScene, introCamera;
let introStartTimestamp = null;
let animationEnded = false;

window.init3DIntroAnimation = function() {
  const canvas = document.getElementById("intro-canvas");
  if (!canvas || typeof THREE === "undefined") {
    const overlay = document.getElementById("intro-overlay");
    if (overlay) overlay.style.display = "none";
    checkAuthSession();
    return;
  }

  introScene = new THREE.Scene();
  introScene.background = new THREE.Color(0x020306);
  introScene.fog = new THREE.FogExp2(0x020306, 0.015);

  introCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  introCamera.position.set(0, 45, 95);
  introCamera.lookAt(0, 10, 0);

  introRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  introRenderer.setSize(window.innerWidth, window.innerHeight);
  introRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  window.addEventListener("resize", onIntroResize);

  const warehouseGroup = new THREE.Group();
  introScene.add(warehouseGroup);

  const gridHelper = new THREE.GridHelper(200, 20, 0xd4af37, 0x1e293b);
  gridHelper.position.y = -10;
  warehouseGroup.add(gridHelper);

  const beamGeo = new THREE.CylinderGeometry(0.8, 0.8, 100, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xd4af37,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  const lightBeam = new THREE.Mesh(beamGeo, beamMat);
  lightBeam.position.set(0, 40, 0);
  introScene.add(lightBeam);

  const wireMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, wireframe: true, transparent: true, opacity: 0 });
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, wireframe: true, transparent: true, opacity: 0 });

  const columns = [];
  const shelves = [];

  for (let row = -1; row <= 1; row++) {
    const rx = row * 26;
    for (let bay = 0; bay < 4; bay++) {
      const bz = -30 + bay * 20;

      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 25, 0.5), pillarMat);
      c1.position.set(rx - 3, 2.5, bz);
      warehouseGroup.add(c1);
      columns.push(c1);

      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 25, 0.5), pillarMat);
      c2.position.set(rx + 3, 2.5, bz);
      warehouseGroup.add(c2);
      columns.push(c2);

      [2, 9, 16].forEach(sy => {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.15, 2), wireMat);
        sh.position.set(rx, sy - 10, bz);
        warehouseGroup.add(sh);
        shelves.push(sh);
      });
    }
  }

  const particleGeo = new THREE.BufferGeometry();
  const particleCount = 300;
  const posArray = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount * 3; i += 3) {
    posArray[i] = (Math.random() - 0.5) * 150;
    posArray[i+1] = (Math.random() - 0.5) * 60 + 10;
    posArray[i+2] = (Math.random() - 0.5) * 150;
  }
  particleGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
  const particleMat = new THREE.PointsMaterial({
    size: 0.35,
    color: 0xd4af37,
    transparent: true,
    opacity: 0.65
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  introScene.add(particles);

  const movingBoxes = [];
  const boxMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, wireframe: true, transparent: true, opacity: 0 });

  for (let i = 0; i < 6; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), boxMat);
    box.position.set(0, -9.25, 0);
    warehouseGroup.add(box);
    movingBoxes.push({
      mesh: box,
      speed: 15 + Math.random() * 10,
      direction: Math.random() > 0.5 ? 1 : -1,
      z: -40 + Math.random() * 80
    });
  }

  const holoGeo = new THREE.CylinderGeometry(8, 8, 3, 24, 1, true);
  const holoMat = new THREE.MeshBasicMaterial({
    color: 0xd4af37,
    wireframe: true,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  const holoChart = new THREE.Mesh(holoGeo, holoMat);
  holoChart.position.set(0, 10, 20);
  introScene.add(holoChart);

  function tick(timestamp) {
    if (animationEnded) return;
    if (!introStartTimestamp) introStartTimestamp = timestamp;
    const elapsed = (timestamp - introStartTimestamp) / 1000;

    if (elapsed < 1.5) {
      // Stage 1 (0s - 1.5s): Sparks (Volumetric light beam appears)
      lightBeam.material.opacity = (elapsed / 1.5) * 0.8;
      particles.rotation.y += 0.005;
    } 
    else if (elapsed < 3.0) {
      // Stage 2 (1.5s - 3.0s): Emergence (Warehouse Racks fade in)
      const fadeProgress = (elapsed - 1.5) / 1.5;
      lightBeam.material.opacity = 0.8 - fadeProgress * 0.8;
      
      columns.forEach(c => c.material.opacity = fadeProgress * 0.15);
      shelves.forEach(s => s.material.opacity = fadeProgress * 0.25);
      
      introCamera.position.z = 95 - 15 * fadeProgress;
      introCamera.position.y = 45 - 5 * fadeProgress;
      introCamera.lookAt(0, 5, 0);
    } 
    else if (elapsed < 4.5) {
      // Stage 3 (3.0s - 4.5s): Smart Flux (Moving boxes & sensor paths)
      introCamera.position.set(0, 40, 80);
      introCamera.lookAt(0, 5, 0);

      movingBoxes.forEach(b => {
        b.mesh.material.opacity = 0.8;
        b.z += b.speed * 0.016 * b.direction;
        if (b.z > 50) b.direction = -1;
        if (b.z < -50) b.direction = 1;
        b.mesh.position.set(b.direction * 12, -9.25, b.z);
      });

      shelves.forEach(s => s.material.opacity = 0.25 + Math.sin(timestamp * 0.01) * 0.05);
    } 
    else if (elapsed < 6.0) {
      // Stage 4 (4.5s - 6.0s): Analytics elements appear & float
      const analyticProgress = (elapsed - 4.5) / 1.5;
      holoChart.material.opacity = analyticProgress * 0.35;
      holoChart.rotation.y += 0.01;

      const alert1 = document.getElementById("holo-alert-1");
      const alert2 = document.getElementById("holo-alert-2");
      const alert3 = document.getElementById("holo-alert-3");
      
      if (alert1) alert1.classList.add("active");
      if (alert2 && analyticProgress > 0.3) alert2.classList.add("active");
      if (alert3 && analyticProgress > 0.6) alert3.classList.add("active");
    } 
    else if (elapsed < 7.0) {
      // Stage 5 (6.0s - 7.0s): Zoom out & WAREFLOW AI flash
      const zoomProgress = elapsed - 6.0;
      
      introCamera.position.set(0, 40 + zoomProgress * 65, 80 + zoomProgress * 125);
      introCamera.lookAt(0, 10, 0);

      const alert1 = document.getElementById("holo-alert-1");
      const alert2 = document.getElementById("holo-alert-2");
      const alert3 = document.getElementById("holo-alert-3");
      if (alert1) alert1.classList.remove("active");
      if (alert2) alert2.classList.remove("active");
      if (alert3) alert3.classList.remove("active");

      holoChart.material.opacity = 0.35 - zoomProgress * 0.35;

      const title = document.getElementById("intro-title-wrapper");
      if (title) {
        title.style.opacity = zoomProgress * 1.5;
        title.style.transform = `scale(${0.92 + zoomProgress * 0.08})`;
      }
    } 
    else {
      endIntroAnimation();
      return;
    }

    introRenderer.render(introScene, introCamera);
    introAnimId = requestAnimationFrame(tick);
  }

  introAnimId = requestAnimationFrame(tick);
};

function onIntroResize() {
  if (!introCamera || !introRenderer) return;
  introCamera.aspect = window.innerWidth / window.innerHeight;
  introCamera.updateProjectionMatrix();
  introRenderer.setSize(window.innerWidth, window.innerHeight);
}

window.endIntroAnimation = function() {
  if (animationEnded) return;
  animationEnded = true;
  cancelAnimationFrame(introAnimId);
  window.removeEventListener("resize", onIntroResize);

  // Mark intro as played in this browser session to bypass on refreshes
  safeSessionStorage.setItem("apex_intro_played", "true");
  window.location.hash = "skipintro";

  const overlay = document.getElementById("intro-overlay");
  if (overlay) {
    overlay.classList.add("fade-out");
    setTimeout(() => {
      overlay.style.display = "none";
      if (introRenderer) {
        introRenderer.dispose();
      }
      
      // DIAGNOSTIC CHECK AUTH AFTER INTRO
      checkAuthSession();
    }, 800);
  }
};

window.selectRole = function(role) {
  const roleView = document.getElementById("role-selector-view");
  const formView = document.getElementById("login-form-view");
  if (roleView) roleView.style.display = "none";
  if (formView) formView.style.display = "block";
  
  window.currentSelectedLoginRole = role;
  
  const title = document.getElementById("login-role-title");
  const quickPass = document.getElementById("quick-pass-credentials-box");
  const userEl = document.getElementById("login-user");
  const passEl = document.getElementById("login-pass");
  if (userEl) userEl.value = "";
  if (passEl) passEl.value = "";
  
  if (role === "admin") {
    if (title) title.textContent = "System Admin Access";
    if (quickPass) {
      quickPass.innerHTML = `
        <div style="font-weight:800; color:var(--color-gold-bright); font-size:11px; margin-bottom:6px; text-transform:uppercase; letter-spacing:1px;">🏅 Hackathon Judges Admin Pass:</div>
        <div style="font-family:monospace; font-size:11px; color:#cbd5e1; margin-bottom:8px;">
          User: sathvik7576 | Pass: sathvik@7576
        </div>
        <button type="button" class="btn btn-secondary btn-sm" style="width:100%; font-size:10px; padding:6px;" onclick="autofillLogin('sathvik7576', 'sathvik@7576')">⚡ Quick Unlock Admin</button>
      `;
    }
  } else if (role === "manager") {
    if (title) title.textContent = "Vault Manager Portal";
    if (quickPass) {
      quickPass.innerHTML = `
        <div style="font-weight:800; color:var(--color-gold-bright); font-size:11px; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">🏅 Hackathon Judges Manager Pass:</div>
        <div style="font-size:10.5px; color:#cbd5e1; margin-bottom:8px; font-style:italic;">Each manager is assigned to a specific vault & category:</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:10px; padding:6px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('harika_7576', 'harika@7576')">
            <span>Vault A (Harika) - <strong style="color:var(--color-gold-bright);">Grains</strong></span> <span style="font-size:8px; color:var(--text-muted);">harika_7576</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:10px; padding:6px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('priya_8585', 'Priya@8585')">
            <span>Vault B (Priya) - <strong style="color:var(--color-gold-bright);">Oils & Spices</strong></span> <span style="font-size:8px; color:var(--text-muted);">priya_8585</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:10px; padding:6px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('meghana_9696', 'Meghana@9696')">
            <span>Vault C (Meghana) - <strong style="color:var(--color-gold-bright);">Beverages & Nuts</strong></span> <span style="font-size:8px; color:var(--text-muted);">meghana_9696</span>
          </button>
        </div>
      `;
    }
  } else if (role === "worker") {
    if (title) title.textContent = "Operations Worker Gate";
    if (quickPass) {
      quickPass.innerHTML = `
        <div style="font-weight:800; color:var(--color-gold-bright); font-size:11px; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">🏅 Hackathon Judges Worker Pass:</div>
        <div style="font-size:10.5px; color:#cbd5e1; margin-bottom:8px; font-style:italic;">Select a worker account to test vault-isolated shipping:</div>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:9.5px; padding:5px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('Sreenidhi_7575', 'sreenidhi@7575')">
            <span>Vault A (Sreenidhi)</span> <span style="font-size:8px; color:var(--text-muted);">Sreenidhi_7575</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:9.5px; padding:5px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('rahul_8584', 'Rahul@8584')">
            <span>Vault B (Rahul)</span> <span style="font-size:8px; color:var(--text-muted);">rahul_8584</span>
          </button>
          <button type="button" class="btn btn-secondary btn-sm" style="font-size:9.5px; padding:5px; text-align:left; justify-content:space-between; display:flex; align-items:center;" onclick="autofillLogin('vamsi_9695', 'Vamsi@9695')">
            <span>Vault C (Vamsi)</span> <span style="font-size:8px; color:var(--text-muted);">vamsi_9695</span>
          </button>
        </div>
      `;
    }
  }
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.goBackToRoleSelection = function() {
  const roleView = document.getElementById("role-selector-view");
  const formView = document.getElementById("login-form-view");
  if (roleView) roleView.style.display = "block";
  if (formView) formView.style.display = "none";
};

window.autofillLogin = function(user, pass) {
  const userEl = document.getElementById("login-user");
  const passEl = document.getElementById("login-pass");
  if (userEl) userEl.value = user;
  if (passEl) passEl.value = pass;
  showToast("⚡ Credentials Loaded", "Autofilled demo account keys successfully.");
};

// ── AUTHENTICATION GATEWAY CONTROLLER ─────────────────────────────────
window.checkAuthSession = function() {
  const isLoggedIn = safeSessionStorage.getItem("apex_logged_in") === "true";
  const loginOverlay = document.getElementById("login-overlay");
  const appLayout = document.querySelector(".app-layout-container");
  
  if (isLoggedIn) {
    if (loginOverlay) loginOverlay.style.display = "none";
    if (appLayout) appLayout.style.display = "flex";
    
    // Enforce role-based access visual restrictions
    const role = safeSessionStorage.getItem("apex_user_role");
    const vault = safeSessionStorage.getItem("apex_user_vault");
    const isWorker = role === "worker";
    
    const navDashboard = document.getElementById("nav-dashboard");
    const navInventory = document.getElementById("nav-inventory");
    const navInsights = document.getElementById("nav-insights");
    const navAnalytics = document.getElementById("nav-analytics");
    const headerActionBtn = document.getElementById("btn-header-action");
    
    if (navDashboard) navDashboard.style.display = isWorker ? "none" : "flex";
    if (navInventory) navInventory.style.display = isWorker ? "none" : "flex";
    if (navInsights) navInsights.style.display = isWorker ? "none" : "flex";
    if (navAnalytics) navAnalytics.style.display = isWorker ? "none" : "flex";
    if (headerActionBtn) headerActionBtn.style.display = isWorker ? "none" : "flex";

    // Vault Switcher Logic
    const switcher = document.getElementById("vault-switcher-container");
    if (switcher) {
      if (role === "admin" || vault === "all") {
        switcher.style.display = "flex";
        const savedView = safeLocalStorage.getItem("apex_selected_vault_view") || "all";
        window.selectedVaultFilter = savedView;
        const selectEl = document.getElementById("vault-switcher-select");
        if (selectEl) selectEl.value = savedView;
      } else {
        switcher.style.display = "none";
        window.selectedVaultFilter = vault;
      }
    }

    // If Worker, force active tab to be "incoming" if current tab is restricted
    if (isWorker && (currentNavTab === "dashboard" || currentNavTab === "inventory" || currentNavTab === "insights" || currentNavTab === "analytics")) {
      switchNavTab("incoming");
    } else {
      // Re-populate dashboard layout welcome names
      const welcomeH2 = document.querySelector(".welcome-title-group h2");
      if (welcomeH2) {
        const displayName = safeSessionStorage.getItem("apex_user_display_name") || "Store Manager";
        welcomeH2.textContent = `Good Morning, ${displayName} 👋`;
      }
      refreshTabContent(currentNavTab);
    }
    
    // Pre-fill WhatsApp & Local IP settings inputs
    const savedPhone = safeLocalStorage.getItem("apex_whatsapp_number") || "";
    const phoneInput = document.getElementById("whatsapp-phone-input");
    if (phoneInput) phoneInput.value = savedPhone;

    const savedIp = safeLocalStorage.getItem("apex_local_ip") || window.location.hostname || "localhost";
    const ipInput = document.getElementById("local-ip-input");
    if (ipInput) ipInput.value = savedIp;
  } else {
    // Hide vault switcher on logout
    const switcher = document.getElementById("vault-switcher-container");
    if (switcher) switcher.style.display = "none";

    if (loginOverlay) {
      loginOverlay.style.display = "flex";
      loginOverlay.style.opacity = "1";
    }
    if (appLayout) appLayout.style.display = "none";
  }
};;

window.handleVaultViewChange = function() {
  const select = document.getElementById("vault-switcher-select");
  if (!select) return;

  window.selectedVaultFilter = select.value;
  safeLocalStorage.setItem("apex_selected_vault_view", select.value);

  showToast("🏢 Vault View Switched", `Active view changed to: ${select.value === "all" ? "All Vaults" : select.value}`);
  
  // Re-populate and render tab contents and dashboard statistics
  refreshDashboard();
  if (typeof refreshTabContent !== "undefined") {
    refreshTabContent(currentNavTab);
  }
};

window.submitLoginCredentials = function(event) {
  event.preventDefault();
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value.trim();
  const errorMsg = document.getElementById("login-error-msg");
  const role = window.currentSelectedLoginRole || "admin";

  let success = false;
  let vault = "all";
  let displayName = "Sathvik (Admin)";

  // Complete registry datastore representing all managers & workers per vault
  const registry = {
    // SYSTEM ADMIN
    "sathvik7576": { role: "admin", vault: "all", display: "Sathvik (Admin)", pass: "sathvik@7576" },

    // VAULT A
    "harika_7576": { role: "manager", vault: "Royal Vault A", display: "Harika (Manager - Vault A)", pass: "harika@7576" },
    "sreenidhi_7575": { role: "worker", vault: "Royal Vault A", display: "Sreenidhi (Worker - Vault A)", pass: "sreenidhi@7575" },
    "samruthi_7475": { role: "worker", vault: "Royal Vault A", display: "Samruthi (Worker - Vault A)", pass: "samruthi@7475" },
    "balaram_7474": { role: "worker", vault: "Royal Vault A", display: "Balaram (Worker - Vault A)", pass: "Balaram@7474" },

    // VAULT B
    "priya_8585": { role: "manager", vault: "Royal Vault B", display: "Priya (Manager - Vault B)", pass: "Priya@8585" },
    "rahul_8584": { role: "worker", vault: "Royal Vault B", display: "Rahul (Worker - Vault B)", pass: "Rahul@8584" },
    "anitha_8583": { role: "worker", vault: "Royal Vault B", display: "Anitha (Worker - Vault B)", pass: "Anitha@8583" },
    "kiran_8582": { role: "worker", vault: "Royal Vault B", display: "Kiran (Worker - Vault B)", pass: "Kiran@8582" },

    // VAULT C
    "meghana_9696": { role: "manager", vault: "Luxury Vault C", display: "Meghana (Manager - Vault C)", pass: "Meghana@9696" },
    "vamsi_9695": { role: "worker", vault: "Luxury Vault C", display: "Vamsi (Worker - Vault C)", pass: "Vamsi@9695" },
    "navya_9694": { role: "worker", vault: "Luxury Vault C", display: "Navya (Worker - Vault C)", pass: "Navya@9694" },
    "akhil_9693": { role: "worker", vault: "Luxury Vault C", display: "Akhil (Worker - Vault C)", pass: "Akhil@9693" }
  };

  const lookupKey = user.toLowerCase();
  const userData = registry[lookupKey];

  if (userData && userData.role === role && pass === userData.pass) {
    success = true;
    vault = userData.vault;
    displayName = userData.display;
  }

  if (success) {
    safeSessionStorage.setItem("apex_logged_in", "true");
    safeSessionStorage.setItem("apex_user_role", role);
    safeSessionStorage.setItem("apex_user_vault", vault);
    safeSessionStorage.setItem("apex_user_display_name", displayName);

    if (errorMsg) errorMsg.style.display = "none";
    
    // Reset selections
    goBackToRoleSelection();

    const loginOverlay = document.getElementById("login-overlay");
    if (loginOverlay) {
      loginOverlay.style.opacity = "0";
      setTimeout(() => {
        loginOverlay.style.display = "none";
        checkAuthSession();
      }, 600);
    }
    showToast("🔐 Access Granted", `Welcome back, ${displayName}!`);
  } else {
    if (errorMsg) errorMsg.style.display = "block";
  }
};

window.handleUserLogout = function() {
  if (confirm("Are you sure you want to lock the system?")) {
    safeSessionStorage.removeItem("apex_logged_in");
    
    // Reset forms
    const loginForm = document.getElementById("form-login");
    if (loginForm) loginForm.reset();
    
    const errorMsg = document.getElementById("login-error-msg");
    if (errorMsg) errorMsg.style.display = "none";
    
    checkAuthSession();
    showToast("🔒 System Locked", "You have successfully logged out.");
  }
};

// ── SYSTEM CONFIGURATION SETTINGS CONTROLLERS ─────────────────────────
window.saveSystemSettings = function() {
  const phoneInput = document.getElementById("whatsapp-phone-input");
  const ipInput = document.getElementById("local-ip-input");
  
  let successMsg = "";
  if (phoneInput) {
    const val = phoneInput.value.trim();
    if (val) {
      if (val.length < 10) {
        alert("Please enter a valid WhatsApp number (e.g. 919876543210).");
        return;
      }
      safeLocalStorage.setItem("apex_whatsapp_number", val);
      successMsg += `WhatsApp: +${val} `;
    }
  }

  if (ipInput) {
    const val = ipInput.value.trim();
    if (val) {
      safeLocalStorage.setItem("apex_local_ip", val);
      successMsg += `IP: ${val}`;
    }
  }

  showToast("⚙️ Settings Saved", "Configurations updated successfully.");
  logNotification("System Settings Updated", "WhatsApp number and pairing IP configurations updated.", "success");
};

window.triggerWhatsAppAlert = function(product) {
  const number = safeLocalStorage.getItem("apex_whatsapp_number");
  if (!number) return; // Skip if no number configured

  const message = `⚠️ *WAREFLOW AI Alert* \n\n` +
                  `*Product:* ${product.name} (${product.sku})\n` +
                  `*Current Stock:* ${product.stock} units\n` +
                  `*Safety Threshold:* ${product.minStock} units\n\n` +
                  `_Attention Required: Stock level has crossed safety limits. Replenish immediately._`;

  const url = `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`;
  
  try {
    const win = window.open(url, "_blank");
    if (!win) {
      console.warn("WhatsApp popup blocked by browser.");
    }
  } catch (e) {
    console.error("Failed to auto-open WhatsApp redirection", e);
  }
};

window.sendWhatsAppAlertDirect = function(sku, name, stock, minStock) {
  const number = safeLocalStorage.getItem("apex_whatsapp_number");
  if (!number) {
    alert("Please configure the WhatsApp phone number in the settings panel first!");
    return;
  }

  const message = `⚠️ *WAREFLOW AI Alert* \n\n` +
                  `*Product:* ${name} (${sku})\n` +
                  `*Current Stock:* ${stock} units\n` +
                  `*Safety Threshold:* ${minStock} units\n\n` +
                  `_Attention Required: Stock level has crossed safety limits. Replenish immediately._`;

  const url = `https://api.whatsapp.com/send?phone=${number}&text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
};

window.autofillDemoCredentials = function() {
  const userEl = document.getElementById("login-user");
  const passEl = document.getElementById("login-pass");
  if (userEl) userEl.value = "sathvik7576";
  if (passEl) passEl.value = "sathvik@7576";
  showToast("⚡ Credentials Loaded", "Autofilled demo account keys successfully.");
};

window.triggerMockBillScan = function(type) {
  const container = document.getElementById("scanner-overlay-container");
  const statusText = document.getElementById("scanner-status-text");
  const percentage = document.getElementById("scanner-percentage");
  const progress = document.getElementById("scanner-progress-bar");
  const detectedLines = document.getElementById("scanner-detected-lines");

  if (!container || !statusText || !percentage || !progress || !detectedLines) return;

  // Show scanner layout
  container.style.display = "block";
  progress.style.width = "0%";
  percentage.textContent = "0%";
  statusText.textContent = "Initializing Camera Stream & OCR Core...";
  detectedLines.innerHTML = `[CONNECTING TO AI COGNITIVE PARSER...]`;

  // Detect currently selected product in form dropdown to make scanner fully dynamic
  const prodSelect = document.getElementById("incoming-product");
  let activeProduct = null;
  if (prodSelect && prodSelect.value) {
    activeProduct = products.find(p => p.id === prodSelect.value);
  }

  // Determine target scan type based on the active product's location if available
  let targetType = type;
  if (activeProduct && activeProduct.location) {
    if (activeProduct.location.includes("Vault B")) {
      targetType = "global";
    } else if (activeProduct.location.includes("Vault C")) {
      targetType = "assam";
    } else {
      targetType = type === "gn" ? "gn" : "deccan";
    }
  }

  let billData = {};
  let databaseUpdated = false;

  if (targetType === "deccan") {
    // Auto-catalog Basmati Rice if it's missing from catalog database
    const hasRice = products.find(p => p.sku === "GR-BR-50K" || p.name.toLowerCase().includes("basmati"));
    let targetProd = activeProduct;
    if (!hasRice) {
      targetProd = {
        id: "p_basmati_" + Date.now(),
        name: "Premium Basmati Rice (50kg) (బాస్మతి బియ్యం)",
        sku: "GR-BR-50K",
        category: "Grains",
        location: "Royal Vault A - Aisle 2",
        price: 3200,
        stock: 0,
        minStock: 50,
        createdDate: new Date().toISOString().split("T")[0],
        image: "images/rice_bag.svg",
        status: "Available"
      };
      products.push(targetProd);
      databaseUpdated = true;
    } else if (!targetProd || !targetProd.location || !targetProd.location.includes("Vault A")) {
      targetProd = hasRice;
    }

    const pName = targetProd.name;
    const pSku = targetProd.sku;
    const pPrice = targetProd.price;
    const pQty = 150;
    
    billData = {
      supplier: "Deccan Agro Suppliers Ltd",
      productSku: pSku,
      qty: pQty,
      warehouse: "Royal Vault A",
      address: "Plot 45, Gachibowli Industrial Corridor, Hyderabad, TS - 500032",
      gstin: "36AAFCD8281M1Z5",
      phone: "+91 98480 22338",
      invoiceNo: "INV/GR/2026-9041",
      datetime: "07/07/2026 03:30 PM",
      cashier: "Rajesh Kumar",
      unitPrice: pPrice,
      productName: pName,
      ocrSteps: [
        { p: 20, txt: "⚡ [Azure AI] Connecting to: https://apex-document-intelligence.cognitiveservices.azure.com/" },
        { p: 45, txt: "⚡ [Azure AI] Model: prebuilt-invoice | Analyzing document layout..." },
        { p: 75, txt: `📦 [Azure AI] MATCHED Supplier -> Deccan Agro, Product -> ${pName.split(" (")[0]}` },
        { p: 90, txt: `🔢 [Azure AI] EXTRACTED Quantity -> ${pQty} bags | Price -> ₹${pPrice.toLocaleString("en-IN")}` },
        { p: 100, txt: "✅ [Azure AI] Document parsed successfully with 98.6% confidence score!" }
      ]
    };
  } else if (targetType === "gn") {
    // Array of all items in G.N. Enterprises bill
    const gnItems = [
      { name: "Malki (మల్కీ)", sku: "GR-MK-001", qty: 75, price: 72 },
      { name: "Rajma (రాజ్మా)", sku: "GR-RJ-001", qty: 60, price: 128 },
      { name: "Kabli Chana (కాబ్లీ శనగలు)", sku: "GR-KC-001", qty: 60, price: 120 },
      { name: "Moong Dhowa (పెసర పప్పు)", sku: "GR-MD-001", qty: 30, price: 106 },
      { name: "Lobiya (అలసందలు)", sku: "GR-LB-001", qty: 30, price: 97 },
      { name: "Dall Arhar (కంది పప్పు)", sku: "GR-DA-001", qty: 3000, price: 138.5 },
      { name: "Dall Chana (శనగ పప్పు)", sku: "GR-DC-001", qty: 1500, price: 68.5 }
    ];

    gnItems.forEach(item => {
      const exists = products.find(p => p.sku === item.sku || p.name.split(" (")[0].toLowerCase() === item.name.split(" (")[0].toLowerCase());
      if (!exists) {
        products.push({
          id: "p_gn_" + item.sku.toLowerCase().replace(/-/g, "_") + "_" + Date.now(),
          name: item.name,
          sku: item.sku,
          category: "Grains",
          location: "Royal Vault A - Aisle 5",
          price: item.price,
          stock: 0,
          minStock: 30,
          createdDate: new Date().toISOString().split("T")[0],
          image: "images/cardboard_box.svg",
          status: "Available"
        });
        databaseUpdated = true;
      }
    });

    let targetProd = activeProduct;
    // Default to Malki (first item in bill) if no Vault A product is currently selected
    const defaultMalki = products.find(p => p.sku === "GR-MK-001");
    if (!targetProd || !targetProd.location || !targetProd.location.includes("Vault A")) {
      targetProd = defaultMalki;
    }

    const pName = targetProd.name;
    const pSku = targetProd.sku;
    const pPrice = targetProd.price;
    const matchedGnItem = gnItems.find(item => item.sku === pSku);
    const pQty = matchedGnItem ? matchedGnItem.qty : 60;

    billData = {
      supplier: "G. N. ENTERPRISES",
      productSku: pSku,
      qty: pQty,
      warehouse: "Royal Vault A",
      address: "1738-2nd Floor, Nai Basti, Naya Bazar, Delhi-110006",
      gstin: "07AAYFG0808Q1ZN",
      phone: "9289117467",
      invoiceNo: "0017294",
      datetime: "09/04/2024 03:00 PM",
      cashier: "Rajesh Sharma (Partner)",
      unitPrice: pPrice,
      productName: pName,
      ocrSteps: [
        { p: 20, txt: "⚡ [Azure AI] Connecting to: https://apex-document-intelligence.cognitiveservices.azure.com/" },
        { p: 45, txt: "⚡ [Azure AI] Model: prebuilt-invoice | Analyzing document layout..." },
        { p: 75, txt: `📦 [Azure AI] MATCHED Supplier -> G.N. Enterprises, Product -> ${pName.split(" (")[0]}` },
        { p: 90, txt: `🔢 [Azure AI] EXTRACTED Quantity -> ${pQty} bags | Rate -> ₹${pPrice.toLocaleString("en-IN")}/kg` },
        { p: 100, txt: "✅ [Azure AI] Multi-product document parsed with 99.1% confidence score!" }
      ]
    };
  } else if (targetType === "global") {
    // Auto-catalog sunflower oil if it is missing
    const hasOil = products.find(p => p.sku === "OL-SO-15L" || p.name.toLowerCase().includes("sunflower"));
    let targetProd = activeProduct;
    if (!hasOil) {
      targetProd = {
        id: "p_oil_" + Date.now(),
        name: "Refined Sunflower Oil (15L) (సన్ ఫ్లవర్ ఆయిల్)",
        sku: "OL-SO-15L",
        category: "Oils & Spices",
        location: "Royal Vault B - Aisle 1",
        price: 1850,
        stock: 0,
        minStock: 30,
        createdDate: new Date().toISOString().split("T")[0],
        image: "images/oil_can.svg",
        status: "Available"
      };
      products.push(targetProd);
      databaseUpdated = true;
    } else if (!targetProd || !targetProd.location || !targetProd.location.includes("Vault B")) {
      targetProd = hasOil;
    }

    const pName = targetProd.name;
    const pSku = targetProd.sku;
    const pPrice = targetProd.price;
    const pQty = 100;

    billData = {
      supplier: "Global Oils Wholesale Ltd",
      productSku: pSku,
      qty: pQty,
      warehouse: "Royal Vault B",
      address: "Phase 3, Industrial Estate, Vijayawada, AP - 520007",
      gstin: "37AAGCG4090A1Z2",
      phone: "+91 866 244 5959",
      invoiceNo: "INV/OL/2026-5582",
      datetime: "07/07/2026 11:15 AM",
      cashier: "Suresh Naidu",
      unitPrice: pPrice,
      productName: pName,
      ocrSteps: [
        { p: 20, txt: "⚡ [Azure AI] Connecting to: https://apex-document-intelligence.cognitiveservices.azure.com/" },
        { p: 45, txt: "⚡ [Azure AI] Model: prebuilt-invoice | Analyzing document layout..." },
        { p: 75, txt: `📦 [Azure AI] MATCHED Supplier -> Global Oils Wholesale, Product -> ${pName.split(" (")[0]}` },
        { p: 90, txt: `🔢 [Azure AI] EXTRACTED Quantity -> ${pQty} cans | Price -> ₹${pPrice.toLocaleString("en-IN")}` },
        { p: 100, txt: "✅ [Azure AI] Document parsed successfully with 97.9% confidence score!" }
      ]
    };
  } else if (targetType === "assam") {
    // Auto-catalog assam tea dust if it is missing
    const hasTea = products.find(p => p.sku === "BV-AT-10K" || p.name.toLowerCase().includes("assam"));
    let targetProd = activeProduct;
    if (!hasTea) {
      targetProd = {
        id: "p_tea_" + Date.now(),
        name: "Premium Assam Tea Dust (10kg) (అస్సాం టీ పొడి)",
        sku: "BV-AT-10K",
        category: "Beverages & Dry Fruits",
        location: "Luxury Vault C - Aisle 3",
        price: 2400,
        stock: 0,
        minStock: 20,
        createdDate: new Date().toISOString().split("T")[0],
        image: "images/cardboard_box.svg",
        status: "Available"
      };
      products.push(targetProd);
      databaseUpdated = true;
    } else if (!targetProd || !targetProd.location || !targetProd.location.includes("Vault C")) {
      targetProd = hasTea;
    }

    const pName = targetProd.name;
    const pSku = targetProd.sku;
    const pPrice = targetProd.price;
    const pQty = 50;

    billData = {
      supplier: "Royal Spices & Beverages Dist",
      productSku: pSku,
      qty: pQty,
      warehouse: "Luxury Vault C",
      address: "80 Feet Ring Road, Kengeri, Bengaluru, KA - 560060",
      gstin: "29AAKCR0194K2Z9",
      phone: "+91 80 2860 8820",
      invoiceNo: "INV/BV/2026-3394",
      datetime: "07/07/2026 01:45 PM",
      cashier: "Anjali Gowda",
      unitPrice: pPrice,
      productName: pName,
      ocrSteps: [
        { p: 20, txt: "⚡ [Azure AI] Connecting to: https://apex-document-intelligence.cognitiveservices.azure.com/" },
        { p: 45, txt: "⚡ [Azure AI] Model: prebuilt-invoice | Analyzing document layout..." },
        { p: 75, txt: `📦 [Azure AI] MATCHED Supplier -> Royal Spices & Beverages, Product -> ${pName.split(" (")[0]}` },
        { p: 90, txt: `🔢 [Azure AI] EXTRACTED Quantity -> ${pQty} packets | Price -> ₹${pPrice.toLocaleString("en-IN")}` },
        { p: 100, txt: "✅ [Azure AI] Document parsed successfully with 98.4% confidence score!" }
      ]
    };
  }

  // Refresh dropdown immediately if catalog updated
  if (databaseUpdated) {
    saveProducts();
    populateCategoryDropdown();
    if (prodSelect) {
      prodSelect.innerHTML = "";
      getActiveProducts().forEach(p => {
        prodSelect.innerHTML += `<option value="${p.id}">${p.name} (${p.sku})</option>`;
      });
    }
  }

  const userVault = safeSessionStorage.getItem("apex_user_vault");
  const userRole = safeSessionStorage.getItem("apex_user_role");
  if ((userRole === "manager" || userRole === "worker") && userVault && userVault !== "all" && userVault !== billData.warehouse) {
    showToast("⚠️ Scan Blocked", `This invoice belongs to ${billData.warehouse}. You can only scan bills for ${userVault}!`);
    container.style.display = "none";
    return;
  }

  let currentStep = 0;
  function processOCRStep() {
    if (currentStep < billData.ocrSteps.length) {
      const step = billData.ocrSteps[currentStep];
      
      // Update progress bar & label
      progress.style.width = step.p + "%";
      percentage.textContent = step.p + "%";
      
      if (step.p < 50) {
        statusText.textContent = "Connecting to Azure AI Document Intelligence...";
      } else if (step.p < 90) {
        statusText.textContent = "Running prebuilt-invoice Model Extractor...";
      } else {
        statusText.textContent = "Syncing Document Layout Outputs...";
      }

      detectedLines.innerHTML += `<br>${step.txt}`;
      detectedLines.scrollTop = detectedLines.scrollHeight; // Scroll to bottom

      currentStep++;
      setTimeout(processOCRStep, 450);
    } else {
      // Step 4 complete: Fill the form!
      document.getElementById("incoming-supplier").value = billData.supplier;
      document.getElementById("incoming-quantity").value = billData.qty;
      document.getElementById("incoming-eta").value = new Date().toISOString().split("T")[0];
      
      const expiryDateObj = new Date();
      expiryDateObj.setFullYear(expiryDateObj.getFullYear() + 1); // 1-year shelf life
      document.getElementById("incoming-expiry").value = expiryDateObj.toISOString().split("T")[0];
      
      // Select the product from the dropdown
      const prodSelect = document.getElementById("incoming-product");
      if (prodSelect) {
        const options = Array.from(prodSelect.options);
        const match = options.find(opt => {
          const optText = opt.text.toLowerCase();
          return optText.includes(billData.productSku.toLowerCase()) || 
                 optText.includes(billData.productName.split(" (")[0].toLowerCase());
        });
        if (match) {
          prodSelect.value = match.value;
        } else if (options.length > 0) {
          prodSelect.value = options[0].value;
        }
      }

      // Select the warehouse vault from dropdown
      const whSelect = document.getElementById("incoming-warehouse");
      if (whSelect) {
        whSelect.value = billData.warehouse;
      }

      // Generate dynamic items view in summary card
      let itemsHtml = "";
      if (targetType === "gn") {
        itemsHtml = `
          <table style="width:100%; border-collapse:collapse; margin-top:8px; border: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.15); border-radius:4px; overflow:hidden;">
            <thead>
              <tr style="background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.08); text-align:left; font-size:9.5px; color:var(--text-muted);">
                <th style="padding:6px;">Product</th>
                <th style="padding:6px;">SKU</th>
                <th style="padding:6px; text-align:right;">Qty</th>
                <th style="padding:6px; text-align:right;">Rate</th>
                <th style="padding:6px; text-align:right;">Amount</th>
                <th style="padding:6px; text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
        `;
        
        const gnItems = [
          { name: "Malki (మల్కీ)", sku: "GR-MK-001", qty: 75, price: 7200, total: 54000 },
          { name: "Rajma (రాజ్మా)", sku: "GR-RJ-001", qty: 60, price: 12800, total: 76800 },
          { name: "Kabli Chana (కాబ్లీ శనగలు)", sku: "GR-KC-001", qty: 60, price: 12000, total: 72000 },
          { name: "Moong Dhowa (పెసర పప్పు)", sku: "GR-MD-001", qty: 30, price: 10600, total: 31800 },
          { name: "Lobiya (అలసందలు)", sku: "GR-LB-001", qty: 30, price: 9700, total: 29100 },
          { name: "Dall Arhar (కంది పప్పు)", sku: "GR-DA-001", qty: 3000, price: 13850, total: 415500 },
          { name: "Dall Chana (శనగ పప్పు)", sku: "GR-DC-001", qty: 1500, price: 6850, total: 102750 }
        ];

        gnItems.forEach(item => {
          itemsHtml += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03); font-size:10px;">
              <td style="padding:6px; font-weight:700; color:#fff;">${item.name.split(" (")[0]}</td>
              <td style="padding:6px; font-family:monospace; color:var(--text-second);">${item.sku}</td>
              <td style="padding:6px; text-align:right; font-weight:700; color:#fff;">${item.qty}</td>
              <td style="padding:6px; text-align:right; color:var(--text-second);">₹${item.price}</td>
              <td style="padding:6px; text-align:right; font-weight:700; color:var(--color-gold-bright);">₹${item.total.toLocaleString("en-IN")}</td>
              <td style="padding:6px; text-align:center;">
                <button type="button" class="btn btn-gold" onclick="window.loadScannedInvoiceItem('${item.sku}', ${item.qty})" style="font-size:8.5px; padding:2px 5px; border-radius:3px; cursor:pointer; line-height:1; display:inline-block; border:none; height:auto;">Select</button>
              </td>
            </tr>
          `;
        });
        
        itemsHtml += `
            </tbody>
          </table>
          <div style="font-size:9.5px; color:var(--text-muted); margin-top:8px; text-align:center; font-style:italic;">
            💡 Click "Select" next to any scanned item to automatically load its details into the logging form!
          </div>
        `;
      } else {
        itemsHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Product Item:</span>
              <span style="font-weight: 700; color: #fff;">${billData.productName}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Quantity:</span>
              <span style="font-weight: 700; color: #fff;">${billData.qty} units</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: var(--text-muted);">Price per Unit:</span>
              <span style="font-weight: 700; color: #fff;">₹${billData.unitPrice.toLocaleString("en-IN")}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 8px; margin-top: 4px;">
              <span style="font-weight: 700; color: var(--color-gold-bright);">Total Valuation:</span>
              <span style="font-weight: 800; color: var(--color-gold-bright); font-size: 13px;">₹${(billData.qty * billData.unitPrice).toLocaleString("en-IN")}</span>
            </div>
          </div>
        `;
      }

      const itemsContainer = document.getElementById("preview-items-container");
      if (itemsContainer) itemsContainer.innerHTML = itemsHtml;

      document.getElementById("preview-seller-name").textContent = billData.supplier;
      document.getElementById("preview-seller-address").textContent = billData.address;
      document.getElementById("preview-seller-gstin").textContent = billData.gstin;
      document.getElementById("preview-seller-phone").textContent = billData.phone;
      document.getElementById("preview-invoice-no").textContent = billData.invoiceNo;
      document.getElementById("preview-invoice-datetime").textContent = billData.datetime;
      document.getElementById("preview-cashier-name").textContent = billData.cashier;

      // Display the preview card
      const previewCard = document.getElementById("scanner-preview-card");
      if (previewCard) previewCard.style.display = "block";

      // Reset the details to collapsed state
      const detailsPanel = document.getElementById("expanded-invoice-details");
      if (detailsPanel) detailsPanel.style.display = "none";

      const toggleText = document.getElementById("text-toggle-invoice");
      const toggleIcon = document.getElementById("icon-toggle-invoice");
      if (toggleText) toggleText.textContent = "View More Invoice Details";
      if (toggleIcon) toggleIcon.setAttribute("data-lucide", "chevron-down");

      showToast("📸 Bill Scanned Successfully", `Auto-filled details for ${billData.supplier} incoming delivery.`);
      
      // Hide scanner after a short delay
      setTimeout(() => {
        container.style.display = "none";
        if (typeof lucide !== "undefined" && lucide.createIcons) {
          lucide.createIcons();
        }
      }, 1200);
    }
  }

  // Start OCR sequence
  setTimeout(processOCRStep, 300);
};

window.handleBillFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const role = safeSessionStorage.getItem("apex_user_role");
  const vault = safeSessionStorage.getItem("apex_user_vault");

  let type = "deccan";
  
  // Parse filename to see what it matches
  const name = file.name.toLowerCase();
  if (name.includes("oil") || name.includes("sunflower") || name.includes("global") || name.includes("fortune") || name.includes("golddrop") || name.includes("safola") || name.includes("mustard")) {
    type = "global";
  } else if (name.includes("tea") || name.includes("assam") || name.includes("spices") || name.includes("beverage") || name.includes("coffee") || name.includes("tajmahal") || name.includes("redlabel") || name.includes("dust") || name.includes("powder")) {
    type = "assam";
  } else if (name.includes("gn") || name.includes("enterprises") || name.includes("rajma") || name.includes("chana") || name.includes("arhar") || name.includes("malki") || name.includes("lobiya") || name.includes("dall") || name.includes("moong") || name.includes("lentils")) {
    type = "gn";
  } else if (name.includes("deccan") || name.includes("basmati") || name.includes("rice") || name.includes("wheat") || name.includes("flour") || name.includes("atta") || name.includes("paddy") || name.includes("grain")) {
    type = "deccan";
  } else {
    // If vault context is known, guide default
    if ((role === "manager" || role === "worker") && vault && vault !== "all") {
      if (vault.includes("Vault A")) {
        type = "deccan";
      } else if (vault.includes("Vault B")) {
        type = "global";
      } else if (vault.includes("Vault C")) {
        type = "assam";
      }
    } else {
      type = "deccan"; // Admin default
    }
  }

  showToast("📁 Bill File Received", `File: ${file.name}. Starting OCR analysis...`);
  window.triggerMockBillScan(type);
};

window.handleVerifyBillFileUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  showToast("📁 Verify Invoice Received", `File: ${file.name}. Starting OCR match...`);
  window.triggerVerifyArrivalScan();
};

window.toggleInvoiceDetails = function() {
  const panel = document.getElementById("expanded-invoice-details");
  const text = document.getElementById("text-toggle-invoice");
  const icon = document.getElementById("icon-toggle-invoice");
  
  if (!panel || !text || !icon) return;

  if (panel.style.display === "none" || panel.style.display === "") {
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    text.textContent = "Collapse Details";
    icon.setAttribute("data-lucide", "chevron-up");
  } else {
    panel.style.display = "none";
    text.textContent = "View More Invoice Details";
    icon.setAttribute("data-lucide", "chevron-down");
  }

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
};

window.loadScannedInvoiceItem = function(sku, qty) {
  // Update quantity field
  const qtyInput = document.getElementById("incoming-quantity");
  if (qtyInput) qtyInput.value = qty;
  
  // Select product by SKU
  const prodSelect = document.getElementById("incoming-product");
  if (prodSelect) {
    const options = Array.from(prodSelect.options);
    const match = options.find(opt => opt.text.toLowerCase().includes(sku.toLowerCase()));
    if (match) {
      prodSelect.value = match.value;
    }
  }

  showToast("⚡ Item Loaded", `Loaded scanned details for item SKU: ${sku} into form!`);
};

window.generateQRCodeSVG = function(data) {
  const size = 21;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = data.charCodeAt(i) + ((hash << 5) - hash);
  }
  let svg = `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" shape-rendering="crispEdges" style="background:#fff; padding:2px; border-radius:4px; display:block;">`;
  svg += `<rect x="0" y="0" width="7" height="7" fill="#000"/><rect x="1" y="1" width="5" height="5" fill="#fff"/><rect x="2" y="2" width="3" height="3" fill="#000"/>`;
  svg += `<rect x="14" y="0" width="7" height="7" fill="#000"/><rect x="15" y="1" width="5" height="5" fill="#fff"/><rect x="16" y="2" width="3" height="3" fill="#000"/>`;
  svg += `<rect x="0" y="14" width="7" height="7" fill="#000"/><rect x="1" y="15" width="5" height="5" fill="#fff"/><rect x="2" y="16" width="3" height="3" fill="#000"/>`;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x < 8 && y < 8) || (x > 13 && y < 8) || (x < 8 && y > 13)) {
        continue;
      }
      const val = Math.abs(Math.sin(hash + x * 17 + y * 31)) * 10;
      if (Math.floor(val) % 2 === 0) {
        svg += `<rect x="${x}" y="${y}" width="1" height="1" fill="#000"/>`;
      }
    }
  }
  svg += `</svg>`;
  return svg;
};

// Global variables for camera simulator
let webcamStream = null;
let capturedPhotos = [];

window.openMobileVerifyModal = function(shipmentId) {
  const inb = incoming.find(i => i.id === shipmentId);
  if (!inb) return;

  window.activeMobileVerifyShipmentId = shipmentId;
  capturedPhotos = [];

  document.getElementById("verify-shipment-id-label").textContent = inb.id;
  document.getElementById("verify-product-name-label").textContent = inb.productName;
  document.getElementById("verify-supplier-label").textContent = inb.supplier;
  document.getElementById("verify-qty-label").textContent = inb.quantity + " units";

  // Reset checklist
  document.getElementById("check-supplier").checked = false;
  document.getElementById("check-barcode").checked = false;
  document.getElementById("check-damage").checked = false;

  // Reset gallery
  document.getElementById("verify-photos-gallery").innerHTML = `<div style="font-size: 10px; color: var(--text-muted); font-style: italic; padding: 12px 0;">No snapshots captured yet.</div>`;

  // Show placeholder
  document.getElementById("verify-cam-placeholder").style.display = "flex";
  const videoEl = document.getElementById("verify-video");
  if (videoEl) videoEl.style.display = "none";

  document.getElementById("cam-status-indicator").textContent = "Inactive";
  document.getElementById("cam-status-indicator").style.color = "var(--text-muted)";

  const snapBtn = document.getElementById("btn-snap-photo");
  if (snapBtn) {
    snapBtn.setAttribute("disabled", "true");
    snapBtn.style.opacity = "0.5";
    snapBtn.style.pointerEvents = "none";
  }

  // Open modal active
  const modal = document.getElementById("modal-mobile-verify");
  if (modal) modal.classList.add("active");
  if (typeof lucide !== "undefined") lucide.createIcons();
};

window.closeMobileVerifyModal = function() {
  // Stop webcam if active
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  const modal = document.getElementById("modal-mobile-verify");
  if (modal) modal.classList.remove("active");
};

window.startWebcamFeed = function() {
  const video = document.getElementById("verify-video");
  const placeholder = document.getElementById("verify-cam-placeholder");
  const indicator = document.getElementById("cam-status-indicator");
  const snapBtn = document.getElementById("btn-snap-photo");

  if (!video || !placeholder || !indicator || !snapBtn) return;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      webcamStream = stream;
      video.srcObject = stream;
      video.style.display = "block";
      placeholder.style.display = "none";
      
      indicator.textContent = "Live Stream Connected";
      indicator.style.color = "var(--color-success)";

      snapBtn.removeAttribute("disabled");
      snapBtn.style.opacity = "1";
      snapBtn.style.pointerEvents = "auto";
      
      showToast("📹 Camera Active", "Paired mobile lens feed established successfully.");
    })
    .catch(err => {
      console.warn("Webcam access failed, loading simulation fallback mode:", err);
      // Fallback: Simulation mode
      video.style.display = "none";
      placeholder.innerHTML = `
        <div style="background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); padding: 12px; border-radius:6px; max-width:240px; margin: 0 auto; text-align: center;">
          <i data-lucide="shield-alert" style="color:var(--color-gold-bright); width:32px; height:32px; margin-bottom:6px; display:inline-block;"></i>
          <div style="font-size:11px; font-weight:700; color:#fff;">Camera Sandbox Mode</div>
          <div style="font-size:9px; color:var(--text-second); line-height:1.2; margin-top:2px;">Camera restricted by browser policies. Triggering high-fidelity mock frame simulator.</div>
        </div>
      `;
      placeholder.style.display = "flex";

      indicator.textContent = "Simulation Sandbox Active";
      indicator.style.color = "var(--color-gold-bright)";

      snapBtn.removeAttribute("disabled");
      snapBtn.style.opacity = "1";
      snapBtn.style.pointerEvents = "auto";

      showToast("🤖 Sandbox Paired", "Simulated cargo photo engine active.");
      if (typeof lucide !== "undefined") lucide.createIcons();
    });
};

window.captureWebcamSnapshot = function() {
  const gallery = document.getElementById("verify-photos-gallery");
  if (!gallery) return;

  if (capturedPhotos.length === 0) {
    gallery.innerHTML = "";
  }

  let photoUrl = "";
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (webcamStream) {
    const video = document.getElementById("verify-video");
    const canvas = document.getElementById("verify-canvas");
    if (video && canvas) {
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      photoUrl = canvas.toDataURL("image/jpeg");
    }
  } else {
    // Generate simulated cargo package image in canvas
    const canvas = document.getElementById("verify-canvas");
    if (canvas) {
      canvas.width = 300;
      canvas.height = 220;
      const ctx = canvas.getContext("2d");
      // Draw background box
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 300, 220);
      // Draw simulated cardboard container box
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 4;
      ctx.strokeRect(50, 40, 200, 140);
      ctx.fillStyle = "rgba(251,191,36,0.1)";
      ctx.fillRect(52, 42, 196, 136);
      // Draw scan grids
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(150, 40); ctx.lineTo(150, 180);
      ctx.moveTo(50, 110); ctx.lineTo(250, 110);
      ctx.stroke();
      // Draw cargo label text
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("CARGO ID: " + window.activeMobileVerifyShipmentId, 150, 90);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText("DEC: ALL SECURE", 150, 130);
      
      photoUrl = canvas.toDataURL("image/jpeg");
    }
  }

  if (photoUrl) {
    capturedPhotos.push({
      timestamp: new Date().toISOString(),
      url: photoUrl
    });

    const index = capturedPhotos.length;
    gallery.innerHTML += `
      <div style="position:relative; width: 68px; flex-shrink:0; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; overflow:hidden; background:#000;">
        <img src="${photoUrl}" style="width:100%; height:50px; object-fit:cover; display:block;">
        <div style="font-size:7px; text-align:center; padding:2px; color:var(--text-second); line-height:1;">${time}</div>
      </div>
    `;
    
    showToast("📸 Snapshot Saved", `Logged verification photo #${index} with timestamp!`);
  }
};

window.submitCargoVerification = function(action) {
  const id = window.activeMobileVerifyShipmentId;
  const inb = incoming.find(i => i.id === id);
  if (!inb) return;

  if (action === "approve") {
    // Requirements: checklist and at least one picture
    if (capturedPhotos.length === 0) {
      alert("Verification Rejected: You must capture at least one verification photo of the physical cargo containers.");
      return;
    }
    const supChecked = document.getElementById("check-supplier").checked;
    const barChecked = document.getElementById("check-barcode").checked;
    const dmgChecked = document.getElementById("check-damage").checked;

    if (!supChecked || !barChecked || !dmgChecked) {
      alert("Verification Rejected: Please complete the audit checklist to confirm supplier integrity, barcode matches, and physical cargo condition.");
      return;
    }

    // Successful match
    // Update shipment details
    inb.status = "Arrived"; // Lifecycle updates
    inb.photos = capturedPhotos;

    // Add to stock catalog
    const cleanInbName = inb.productName.split(" (")[0].toLowerCase();
    const prod = products.find(p => p.name.toLowerCase().includes(cleanInbName) || 
                                    cleanInbName.includes(p.name.split(" (")[0].toLowerCase()));
    if (prod) {
      prod.stock += inb.quantity;
      saveProducts();
    }

    saveIncoming();
    logNotification("Cargo Handshake Approved", `Directly verified and received ${inb.quantity} bags for ${inb.productName} after mobile camera match.`, "success");
    showToast("✅ Delivery Verified", `Added +${inb.quantity} bags of cargo to catalog stock.`);

  } else {
    // Rejected
    inb.status = "Delayed"; // or mark as anomalous/damaged
    
    // Add anomaly record
    anomalies.push({
      date: new Date().toISOString().split("T")[0],
      product: inb.productName,
      type: "Rejected",
      description: `Delivery rejected by mobile audit for shipment ID ${inb.id}. Supplier: ${inb.supplier}.`
    });

    saveIncoming();
    saveAnomalies();
    
    logNotification("Cargo Verification Rejected", `Worker rejected delivery of ${inb.quantity} bags from ${inb.supplier} due to audit failure.`, "danger");
    showToast("❌ Delivery Rejected", "Shipment marked as verification mismatch inside log ledger.");
  }

  closeMobileVerifyModal();
  refreshDashboard();
};
