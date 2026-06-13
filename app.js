/**
 * Library Management System - Frontend Logic
 * File: app.js
 */




// Global Application State
let state = {
  books: [],
  members: [],
  borrowings: [],
  stats: {},
  reports: {
    peminjamanStats: {},
    inventoryReport: [],
    returnsReport: []
  },
  filters: {
    booksSearch: '',
    membersSearch: '',
    borrowingsStatus: 'all'
  }
};

// PWA Install Event Handler
let deferredPrompt;

// Global Loading Indicator Mappings
const POST_ACTION_MAPPING = {
  login: { title: "Memverifikasi Kredensial", subtitle: "Memproses login admin..." },
  addBook: { title: "Menyimpan Buku Baru", subtitle: "Mengirim data ke Google Sheets..." },
  updateBook: { title: "Memperbarui Data Buku", subtitle: "Menyimpan perubahan ke Google Sheets..." },
  addMember: { title: "Menyimpan Anggota Baru", subtitle: "Mengirim data ke Google Sheets..." },
  updateMember: { title: "Memperbarui Data Anggota", subtitle: "Menyimpan perubahan ke Google Sheets..." },
  borrowBook: { title: "Mencatat Peminjaman", subtitle: "Memproses transaksi peminjaman..." },
  returnBook: { title: "Mencatat Pengembalian", subtitle: "Memproses transaksi pengembalian..." }
};

const GET_ACTION_MAPPING = {
  getAllData: { title: "Sinkronisasi Database", subtitle: "Memuat semua data perpustakaan..." },
  getBooks: { title: "Memuat Koleksi Buku", subtitle: "Mengambil data dari Google Sheets..." },
  getMembers: { title: "Memuat Data Anggota", subtitle: "Mengambil data dari Google Sheets..." },
  getBorrowings: { title: "Memuat Transaksi", subtitle: "Mengambil data dari Google Sheets..." }
};

// Global Loading Helper Functions
function showGlobalLoading(title = "Menghubungkan ke Database", subtitle = "Harap tunggu sebentar...") {
  const el = document.getElementById("global-loading");
  const tEl = document.getElementById("global-loading-title");
  const sEl = document.getElementById("global-loading-subtitle");
  if (tEl) tEl.innerText = title;
  if (sEl) sEl.innerText = subtitle;
  if (el) el.classList.remove("hidden");
}

function hideGlobalLoading() {
  const el = document.getElementById("global-loading");
  if (el) el.classList.add("hidden");
}

// Initialize Application on Page Load
document.addEventListener("DOMContentLoaded", () => {
  // Create icons using Lucide
  lucide.createIcons();

  // Update warning if API_URL is default/missing
  if (!API_URL || API_URL.trim() === "" || API_URL.includes("YOUR_SECRET_API_URL_HERE") || API_URL.includes("YOUR_URL_HERE")) {
    const warning = document.getElementById("setup-warning");
    if (warning) warning.classList.remove("hidden");
  }

  // Display current date in header
  const dateInfo = document.getElementById("current-date-info");
  if (dateInfo) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateInfo.innerText = new Date().toLocaleDateString('id-ID', options);
  }

  // Check Authentication Session
  const savedUser = localStorage.getItem("pustaka_admin");
  if (savedUser) {
    setLoggedIn(savedUser);
  } else {
    showLoginScreen();
  }

  // Register Service Worker for PWA
  registerServiceWorker();

  // Listen for PWA installation prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.remove('hidden');
  });

  // Reset print buttons classes if clicked outside
  window.addEventListener('afterprint', () => {
    document.body.className = "h-full text-slate-800 antialiased flex flex-col";
  });
});

// ==================== SERVICE WORKER REGISTRATION ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully!', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
}

// Trigger PWA Installation Modal
async function triggerPwaInstall() {
  if (!deferredPrompt) return;

  // Show prompt
  deferredPrompt.prompt();

  // Wait for user choices
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User installation decision: ${outcome}`);

  deferredPrompt = null;
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) installBtn.classList.add('hidden');
}

// ==================== AUTHENTICATION MANAGEMENT ====================
function showLoginScreen() {
  document.getElementById("login-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");
}

function setLoggedIn(username) {
  document.getElementById("login-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");
  const adminLabel = document.getElementById("admin-display-name");
  if (adminLabel) adminLabel.innerText = username;
  syncAllData();
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const userEl = document.getElementById("username");
  const passEl = document.getElementById("password");
  const errorBox = document.getElementById("login-error");
  const spinner = document.getElementById("login-spinner");
  const btnText = document.getElementById("login-btn-text");

  // Reset state
  errorBox.classList.add("hidden");
  spinner.classList.remove("hidden");
  btnText.classList.add("invisible");

  if (!API_URL || API_URL.trim() === "" || API_URL.includes("YOUR_SECRET_API_URL_HERE") || API_URL.includes("YOUR_URL_HERE")) {
    showToast("Error: API URL belum diset!", "error");
    errorBox.classList.remove("hidden");
    document.getElementById("login-error-msg").innerText = "URL Web App belum di-set di config.js!";
    spinner.classList.add("hidden");
    btnText.classList.remove("invisible");
    return;
  }

  const res = await apiPost({
    action: "login",
    username: userEl.value,
    password: passEl.value
  });

  spinner.classList.add("hidden");
  btnText.classList.remove("invisible");

  if (res.status === "success") {
    localStorage.setItem("pustaka_admin", res.username);
    setLoggedIn(res.username);
    showToast("Login berhasil! Selamat datang.", "success");
    userEl.value = "";
    passEl.value = "";
  } else {
    errorBox.classList.remove("hidden");
    document.getElementById("login-error-msg").innerText = res.message || "Username atau Password salah!";
    showToast(res.message || "Login gagal!", "error");
  }
}

function logout() {
  localStorage.removeItem("pustaka_admin");
  showLoginScreen();
  showToast("Berhasil logout dari sistem.", "neutral");
}

// ==================== NETWORKING & API WRAPPERS ====================

// POST: Uses text/plain to completely bypass preflight OPTIONS constraints in GAS Web App
async function apiPost(payload) {
  const mapping = POST_ACTION_MAPPING[payload.action] || { title: "Menghubungkan ke Server", subtitle: "Memproses permintaan..." };
  showGlobalLoading(mapping.title, mapping.subtitle);
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });
    return await response.json();
  } catch (err) {
    console.error("API POST Error:", err);
    return { status: "error", message: "Koneksi ke server backend gagal: " + err.message };
  } finally {
    hideGlobalLoading();
  }
}

// GET: Standard fetch GET queries
async function apiGet(action) {
  const mapping = GET_ACTION_MAPPING[action] || { title: "Menghubungkan ke Server", subtitle: "Mengambil data..." };
  showGlobalLoading(mapping.title, mapping.subtitle);
  try {
    const response = await fetch(`${API_URL}?action=${action}`);
    return await response.json();
  } catch (err) {
    console.error("API GET Error:", err);
    return { status: "error", message: "Gagal mengambil data: " + err.message };
  } finally {
    hideGlobalLoading();
  }
}

// Sync all database data
async function syncAllData() {
  if (!API_URL || API_URL.trim() === "" || API_URL.includes("YOUR_SECRET_API_URL_HERE") || API_URL.includes("YOUR_URL_HERE")) return;

  const syncIcon = document.getElementById("sync-icon");
  if (syncIcon) syncIcon.style.opacity = "0.5";

  showToast("Sinkronisasi data perpustakaan...", "neutral");

  try {
    toggleLoading("books", true);
    toggleLoading("members", true);
    toggleLoading("borrowings", true);

    const res = await apiGet("getAllData");
    if (res.status === "success") {
      state.stats = res.stats;
      state.books = res.books;
      state.members = res.members;
      state.borrowings = res.borrowings;
      state.reports = res.reports;

      // Update UI components
      updateDashboardUI();
      renderBooks();
      renderMembers();
      renderBorrowings();
      renderDashboardRecent();
      updateReportsUI();

      showToast("Sinkronisasi database berhasil!", "success");
    } else {
      showToast("Gagal memuat data: " + res.message, "error");
    }
  } catch (e) {
    showToast("Sinkronisasi gagal: " + e.message, "error");
  } finally {
    if (syncIcon) syncIcon.style.opacity = "1";
    toggleLoading("books", false);
    toggleLoading("members", false);
    toggleLoading("borrowings", false);
  }
}

function toggleLoading(panelType, show) {
  const el = document.getElementById(`${panelType}-loading`);
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// ==================== TABS SWITCHER ====================
function switchTab(tabName) {
  // Hide all panels
  document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.add("hidden"));
  // Show targeted panel
  const target = document.getElementById(`panel-${tabName}`);
  if (target) target.classList.remove("hidden");

  // Reset navigation tabs highlighting
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.className = "nav-tab w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-150 text-slate-400 hover:text-white hover:bg-slate-800";
  });

  // Highlight active tab
  const activeTabBtn = document.getElementById(`tab-${tabName}`);
  if (activeTabBtn) {
    activeTabBtn.className = "nav-tab w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-150 text-white bg-indigo-600";
  }

  // Update header text
  const pageTitle = document.getElementById("page-title");
  if (pageTitle) {
    const titles = {
      dashboard: "Dashboard Perpustakaan",
      buku: "Manajemen Koleksi Buku",
      anggota: "Manajemen Data Anggota",
      peminjaman: "Transaksi Peminjaman & Pengembalian",
      laporan: "Laporan & Rekapitulasi Tahunan"
    };
    pageTitle.innerText = titles[tabName] || "Perpustakaan";
  }
}

// ==================== DASHBOARD UI ====================
function updateDashboardUI() {
  const totBooks = document.getElementById("stat-total-books");
  const activeMem = document.getElementById("stat-active-members");
  const activeBor = document.getElementById("stat-active-borrows");
  const totDenda = document.getElementById("stat-total-denda");

  if (totBooks) totBooks.innerText = state.stats.totalBooks || 0;
  if (activeMem) activeMem.innerText = state.stats.activeMembers || 0;
  if (activeBor) activeBor.innerText = state.stats.activeBorrowings || 0;
  if (totDenda) totDenda.innerText = formatIDR(state.stats.totalDenda || 0);
}

function renderDashboardRecent() {
  const container = document.getElementById("dashboard-recent-table");
  if (!container) return;

  container.innerHTML = "";
  const activeBorrows = state.borrowings.filter(b => b["Status"] === "Berjalan").slice(0, 5);

  if (activeBorrows.length === 0) {
    container.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-xs text-slate-400">Tidak ada peminjaman aktif berjalan.</td></tr>`;
    return;
  }

  activeBorrows.forEach(b => {
    const book = state.books.find(bk => bk["ID Buku"] === b["ID Buku"]) || { "Judul": b["ID Buku"] };
    const member = state.members.find(m => m["ID Anggota"] === b["ID Anggota"]) || { "Nama": b["ID Anggota"] };

    const isLate = checkOverdue(b["Tenggat Kembali"]);
    const badgeColor = isLate ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-indigo-50 text-indigo-700 border-indigo-200";
    const badgeText = isLate ? "Terlambat" : "Berjalan";

    container.innerHTML += `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="py-3 font-semibold text-slate-900">${b["ID Pinjam"]}</td>
        <td class="py-3">
          <div class="font-medium text-slate-800">${book["Judul"]}</div>
          <div class="text-xs text-slate-400">${member["Nama"]}</div>
        </td>
        <td class="py-3 text-slate-500">${formatReadableDate(b["Tenggat Kembali"])}</td>
        <td class="py-3 text-right">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeColor}">
            ${badgeText}
          </span>
        </td>
      </tr>
    `;
  });
}

// ==================== BUKU (BOOKS) MANAGEMENT ====================
function renderBooks() {
  const body = document.getElementById("books-table-body");
  const emptyState = document.getElementById("books-empty");
  if (!body) return;

  body.innerHTML = "";

  const filtered = state.books.filter(b => {
    const q = (state.filters.booksSearch || "").trim().toLowerCase();
    if (!q) return true;

    const idBuku = String(b["ID Buku"] || "").toLowerCase();
    const judul = String(b["Judul"] || "").toLowerCase();
    const pengarang = String(b["Pengarang"] || "").toLowerCase();
    const issn = String(b["ISSN"] || "").toLowerCase();
    const ddc = String(b["DDC (Nomor Rak)"] || "").toLowerCase();
    const ddcGenre = String(b["DDC - Genre"] || "").toLowerCase();
    const kategori = String(b["Kategori (Fiksi/Non-Fiksi)"] || "").toLowerCase();

    return judul.includes(q) ||
      idBuku.includes(q) ||
      pengarang.includes(q) ||
      issn.includes(q) ||
      ddc.includes(q) ||
      ddcGenre.includes(q) ||
      kategori.includes(q);
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  filtered.forEach(b => {
    const isAvailable = b["Status"] === "Tersedia";
    const statusBadge = isAvailable
      ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>Tersedia</span>'
      : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>Tidak Tersedia</span>';

    body.innerHTML += `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-6 py-4 font-semibold text-slate-950">${b["ID Buku"]}</td>
        <td class="px-6 py-4">
          <div class="font-medium text-slate-900">${b["Judul"]}</div>
          <div class="text-xs text-slate-400">ISSN: ${b["ISSN"] || '-'}</div>
        </td>
        <td class="px-6 py-4">
          <div>${b["Pengarang"]}</div>
          <div class="text-xs text-slate-400">Tahun: ${b["Tahun Terbit"]}</div>
        </td>
        <td class="px-6 py-4">
          <div class="font-medium">${b["DDC (Nomor Rak)"] || '-'}</div>
          <div class="text-xs text-slate-400">${b["DDC - Genre"] || '-'}</div>
        </td>
        <td class="px-6 py-4">
          <span class="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">${b["Kategori (Fiksi/Non-Fiksi)"] || 'Fiksi'}</span>
        </td>
        <td class="px-6 py-4">
          <div class="font-semibold text-slate-800">${b["Jumlah Buku Tersedia"] || 0} / ${b["Jumlah Buku"] || 0}</div>
        </td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 text-right">
          <button onclick="openBookModal('${b["ID Buku"]}')" class="text-indigo-600 hover:text-indigo-900 font-semibold inline-flex items-center">
            <i data-lucide="edit" class="w-4 h-4 mr-1"></i> Edit
          </button>
        </td>
      </tr>
    `;
  });
  lucide.createIcons();
}

function searchBooks(val) {
  state.filters.booksSearch = val;
  renderBooks();
}

function openBookModal(id = null) {
  const modal = document.getElementById("book-modal");
  const title = document.getElementById("book-modal-title");
  const form = document.getElementById("book-form");
  const actionInput = document.getElementById("book-action");
  const idInput = document.getElementById("book-id");
  const availableField = document.getElementById("book-available-field");

  form.reset();
  modal.classList.remove("hidden");

  if (id) {
    title.innerText = "Edit Detail Buku";
    actionInput.value = "updateBook";
    idInput.value = id;
    idInput.disabled = true;
    availableField.classList.remove("hidden");

    const bk = state.books.find(b => b["ID Buku"] === id);
    if (bk) {
      document.getElementById("book-title").value = bk["Judul"];
      document.getElementById("book-author").value = bk["Pengarang"];
      document.getElementById("book-year").value = bk["Tahun Terbit"];
      document.getElementById("book-issn").value = bk["ISSN"] || "";
      document.getElementById("book-ddc-rak").value = bk["DDC (Nomor Rak)"] || "";
      document.getElementById("book-ddc-genre").value = bk["DDC - Genre"] || "";
      document.getElementById("book-category").value = bk["Kategori (Fiksi/Non-Fiksi)"] || "Fiksi";
      document.getElementById("book-quantity").value = bk["Jumlah Buku"] || 1;
      document.getElementById("book-available-quantity").value = bk["Jumlah Buku Tersedia"] || 0;
    }
  } else {
    title.innerText = "Tambah Buku Baru";
    actionInput.value = "addBook";
    idInput.value = "";
    idInput.disabled = false;
    availableField.classList.add("hidden");
    document.getElementById("book-quantity").value = 1;
  }
}

function closeBookModal() {
  document.getElementById("book-modal").classList.add("hidden");
}

async function handleBookSubmit(event) {
  event.preventDefault();

  const saveBtn = document.getElementById("book-save-btn");
  saveBtn.disabled = true;
  saveBtn.innerText = "Memproses...";

  const payload = {
    action: document.getElementById("book-action").value,
    idBuku: document.getElementById("book-id").value,
    judul: document.getElementById("book-title").value,
    pengarang: document.getElementById("book-author").value,
    tahunTerbit: parseInt(document.getElementById("book-year").value, 10),
    issn: document.getElementById("book-issn").value,
    ddcRak: document.getElementById("book-ddc-rak").value,
    ddcGenre: document.getElementById("book-ddc-genre").value,
    kategori: document.getElementById("book-category").value,
    jumlahBuku: parseInt(document.getElementById("book-quantity").value, 10) || 1,
    jumlahBukuTersedia: parseInt(document.getElementById("book-available-quantity").value, 10) || parseInt(document.getElementById("book-quantity").value, 10) || 1
  };

  const res = await apiPost(payload);
  saveBtn.disabled = false;
  saveBtn.innerText = "Simpan";

  if (res.status === "success") {
    showToast(res.message, "success");
    closeBookModal();
    syncAllData();
  } else {
    showToast("Error: " + res.message, "error");
  }
}

// ==================== ANGGOTA (MEMBERS) MANAGEMENT ====================
function renderMembers() {
  const body = document.getElementById("members-table-body");
  const emptyState = document.getElementById("members-empty");
  if (!body) return;

  body.innerHTML = "";

  const filtered = state.members.filter(m => {
    const q = (state.filters.membersSearch || "").trim().toLowerCase();
    if (!q) return true;

    const nama = String(m["Nama"] || "").toLowerCase();
    const idAnggota = String(m["ID Anggota"] || "").toLowerCase();
    const kelas = String(m["Kelas/Instansi"] || "").toLowerCase();
    const alamat = String(m["Alamat"] || "").toLowerCase();
    const kontak = String(m["Kontak"] || "").toLowerCase();
    const kontakOrtu = String(m["Kontak Orang Tua"] || "").toLowerCase();

    return nama.includes(q) ||
      idAnggota.includes(q) ||
      kelas.includes(q) ||
      alamat.includes(q) ||
      kontak.includes(q) ||
      kontakOrtu.includes(q);
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  filtered.forEach(m => {
    body.innerHTML += `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-6 py-4 font-semibold text-slate-950">${m["ID Anggota"]}</td>
        <td class="px-6 py-4 font-medium text-slate-900">${m["Nama"]}</td>
        <td class="px-6 py-4">${m["Kelas/Instansi"]}</td>
        <td class="px-6 py-4">
          <div class="text-slate-800">${m["Kontak"]}</div>
          <div class="text-xs text-slate-400">Ortu: ${m["Kontak Orang Tua"] || '-'}</div>
        </td>
        <td class="px-6 py-4 text-slate-500 max-w-[200px] truncate" title="${m["Alamat"] || ''}">${m["Alamat"] || '-'}</td>
        <td class="px-6 py-4 text-right">
          <button onclick="openMemberModal('${m["ID Anggota"]}')" class="text-indigo-600 hover:text-indigo-900 font-semibold inline-flex items-center">
            <i data-lucide="edit" class="w-4 h-4 mr-1"></i> Edit
          </button>
        </td>
      </tr>
    `;
  });
  lucide.createIcons();
}

function searchMembers(val) {
  state.filters.membersSearch = val;
  renderMembers();
}

function openMemberModal(id = null) {
  const modal = document.getElementById("member-modal");
  const title = document.getElementById("member-modal-title");
  const form = document.getElementById("member-form");
  const actionInput = document.getElementById("member-action");
  const idInput = document.getElementById("member-id");

  form.reset();
  modal.classList.remove("hidden");

  if (id) {
    title.innerText = "Edit Data Anggota";
    actionInput.value = "updateMember";
    idInput.value = id;
    idInput.disabled = true;

    const m = state.members.find(x => x["ID Anggota"] === id);
    if (m) {
      document.getElementById("member-name").value = m["Nama"];
      document.getElementById("member-class").value = m["Kelas/Instansi"];
      document.getElementById("member-contact").value = m["Kontak"];
      document.getElementById("member-address").value = m["Alamat"] || "";
      document.getElementById("member-contact-parent").value = m["Kontak Orang Tua"] || "";
    }
  } else {
    title.innerText = "Tambah Anggota Baru";
    actionInput.value = "addMember";
    idInput.value = "";
    idInput.disabled = false;
  }
}

// Close Member Modal
function closeMemberModal() {
  document.getElementById("member-modal").classList.add("hidden");
}

async function handleMemberSubmit(event) {
  event.preventDefault();

  const saveBtn = document.getElementById("member-save-btn");
  saveBtn.disabled = true;
  saveBtn.innerText = "Memproses...";

  const payload = {
    action: document.getElementById("member-action").value,
    idAnggota: document.getElementById("member-id").value,
    nama: document.getElementById("member-name").value,
    kelasInstansi: document.getElementById("member-class").value,
    kontak: document.getElementById("member-contact").value,
    alamat: document.getElementById("member-address").value,
    kontakOrtu: document.getElementById("member-contact-parent").value
  };

  const res = await apiPost(payload);
  saveBtn.disabled = false;
  saveBtn.innerText = "Simpan";

  if (res.status === "success") {
    showToast(res.message, "success");
    closeMemberModal();
    syncAllData();
  } else {
    showToast("Error: " + res.message, "error");
  }
}

// ==================== PEMINJAMAN (BORROWINGS) MANAGEMENT ====================
function renderBorrowings() {
  const body = document.getElementById("borrowings-table-body");
  const emptyState = document.getElementById("borrowings-empty");
  if (!body) return;

  body.innerHTML = "";

  const filtered = state.borrowings.filter(b => {
    if (state.filters.borrowingsStatus === "all") return true;
    return b["Status"] === state.filters.borrowingsStatus;
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }
  if (emptyState) emptyState.classList.add("hidden");

  filtered.forEach(b => {
    const book = state.books.find(bk => bk["ID Buku"] === b["ID Buku"]) || { "Judul": b["ID Buku"] };
    const member = state.members.find(m => m["ID Anggota"] === b["ID Anggota"]) || { "Nama": b["ID Anggota"] };

    const isCompleted = b["Status"] === "Selesai";
    const statusBadge = isCompleted
      ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Selesai</span>'
      : checkOverdue(b["Tenggat Kembali"])
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">Terlambat</span>'
        : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Berjalan</span>';

    const returnDateText = b["Tanggal Dikembalikan"] ? formatReadableDate(b["Tanggal Dikembalikan"]) : '-';
    const dendaVal = parseFloat(b["Denda Keterlambatan"]) || 0;
    const dendaText = dendaVal > 0 ? `<span class="text-rose-600 font-bold">${formatIDR(dendaVal)}</span>` : '<span class="text-slate-400">Rp 0</span>';

    const actionBtn = isCompleted
      ? '<span class="text-slate-400 text-xs italic">Selesai</span>'
      : `<button onclick="openReturnModal('${b["ID Pinjam"]}')" class="px-3 py-1.5 border border-indigo-600 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-lg text-xs font-semibold transition-all flex items-center inline-flex">
          <i data-lucide="check" class="w-3.5 h-3.5 mr-1"></i> Kembalikan
         </button>`;

    body.innerHTML += `
      <tr class="hover:bg-slate-50/50 transition-colors">
        <td class="px-6 py-4 font-semibold text-slate-950">${b["ID Pinjam"]}</td>
        <td class="px-6 py-4">
          <div class="font-medium text-slate-900">${book["Judul"]}</div>
          <div class="text-xs text-slate-400">ID: ${b["ID Buku"]}</div>
        </td>
        <td class="px-6 py-4">
          <div class="font-medium text-slate-900">${member["Nama"]}</div>
          <div class="text-xs text-slate-400">ID: ${b["ID Anggota"]}</div>
        </td>
        <td class="px-6 py-4 text-slate-500">${formatReadableDate(b["Tanggal Pinjam"])}</td>
        <td class="px-6 py-4 text-slate-500 font-semibold">${formatReadableDate(b["Tenggat Kembali"])}</td>
        <td class="px-6 py-4 text-slate-500">${returnDateText}</td>
        <td class="px-6 py-4">${dendaText}</td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 text-right">${actionBtn}</td>
      </tr>
    `;
  });
  lucide.createIcons();
}

function filterBorrowings(status) {
  state.filters.borrowingsStatus = status;

  const buttons = {
    all: document.getElementById("btn-filter-all"),
    Berjalan: document.getElementById("btn-filter-running"),
    Selesai: document.getElementById("btn-filter-done")
  };

  Object.keys(buttons).forEach(key => {
    if (!buttons[key]) return;
    if (key === status) {
      buttons[key].className = "px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-55 text-indigo-700 shadow-sm border border-indigo-200 transition-all";
    } else {
      buttons[key].className = "px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all";
    }
  });

  renderBorrowings();
}

function openBorrowModal() {
  const modal = document.getElementById("borrow-modal");
  const bookSelect = document.getElementById("borrow-book-select");
  const memberSelect = document.getElementById("borrow-member-select");

  document.getElementById("borrow-form").reset();

  // Populate Books list (only AVAILABLE books)
  bookSelect.innerHTML = '<option value="">-- Pilih Buku --</option>';
  state.books.forEach(bk => {
    if (bk["Status"] === "Tersedia") {
      bookSelect.innerHTML += `<option value="${bk["ID Buku"]}">${bk["ID Buku"]} - ${bk["Judul"]}</option>`;
    }
  });

  // Populate Members list
  memberSelect.innerHTML = '<option value="">-- Pilih Anggota --</option>';
  state.members.forEach(m => {
    memberSelect.innerHTML += `<option value="${m["ID Anggota"]}">${m["ID Anggota"]} - ${m["Nama"]}</option>`;
  });

  // Set default borrow date (Today) & default due date (Today + 7 days)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("borrow-date").value = today;
  adjustDueDate(today);

  modal.classList.remove("hidden");
}

function adjustDueDate(startDateStr) {
  const start = new Date(startDateStr);
  start.setDate(start.getDate() + 7);
  document.getElementById("borrow-due-date").value = start.toISOString().split('T')[0];
}

function closeBorrowModal() {
  document.getElementById("borrow-modal").classList.add("hidden");
}

async function handleBorrowSubmit(event) {
  event.preventDefault();

  const saveBtn = document.getElementById("borrow-save-btn");
  saveBtn.disabled = true;
  saveBtn.innerText = "Memproses...";

  const payload = {
    action: "borrowBook",
    idBuku: document.getElementById("borrow-book-select").value,
    idAnggota: document.getElementById("borrow-member-select").value,
    tanggalPinjam: document.getElementById("borrow-date").value,
    tenggatKembali: document.getElementById("borrow-due-date").value
  };

  const res = await apiPost(payload);
  saveBtn.disabled = false;
  saveBtn.innerText = "Simpan";

  if (res.status === "success") {
    showToast(res.message, "success");
    closeBorrowModal();
    syncAllData();
  } else {
    showToast("Error: " + res.message, "error");
  }
}

// ==================== RETURN BOOK FLOW ====================
function openReturnModal(idPinjam) {
  const modal = document.getElementById("return-modal");
  const transaction = state.borrowings.find(b => b["ID Pinjam"] === idPinjam);
  if (!transaction) return;

  const book = state.books.find(bk => bk["ID Buku"] === transaction["ID Buku"]) || { "Judul": transaction["ID Buku"] };
  const member = state.members.find(m => m["ID Anggota"] === transaction["ID Anggota"]) || { "Nama": transaction["ID Anggota"] };

  document.getElementById("return-id-pinjam").value = idPinjam;
  document.getElementById("return-tenggat").value = transaction["Tenggat Kembali"];

  // Populate UI descriptors
  document.getElementById("lbl-return-id").innerText = idPinjam;
  document.getElementById("lbl-return-buku").innerText = book["Judul"];
  document.getElementById("lbl-return-anggota").innerText = member["Nama"];
  document.getElementById("lbl-return-tenggat").innerText = formatReadableDate(transaction["Tenggat Kembali"]);

  // Set default return date is Today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById("return-date").value = today;

  // Run penalty check logic
  calculatePenaltyInUI();
  modal.classList.remove("hidden");
}

function closeReturnModal() {
  document.getElementById("return-modal").classList.add("hidden");
}

// Real-time JavaScript Date comparison on returning form
function calculatePenaltyInUI() {
  const returnDateStr = document.getElementById("return-date").value;
  const dueDateStr = document.getElementById("return-tenggat").value;
  const displayBox = document.getElementById("penalty-display-box");
  const iconContainer = document.getElementById("penalty-icon-container");
  const title = document.getElementById("penalty-title");
  const subtitle = document.getElementById("penalty-subtitle");

  if (!returnDateStr || !dueDateStr) return;

  const returnDate = new Date(returnDateStr);
  const dueDate = new Date(dueDateStr);

  // Eliminate times
  returnDate.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = returnDate.getTime() - dueDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    const totalDenda = diffDays * 1000;

    displayBox.className = "p-4 rounded-xl flex items-start space-x-3 bg-rose-50 border border-rose-200 text-rose-800 animate-pulse";
    iconContainer.innerHTML = '<i data-lucide="alert-triangle" class="w-6 h-6 text-rose-500"></i>';
    title.innerText = `Terlambat ${diffDays} Hari!`;
    subtitle.innerHTML = `Dikenakan denda keterlambatan sebesar <strong>${formatIDR(totalDenda)}</strong> (Rp 1.000 / hari).`;
  } else {
    displayBox.className = "p-4 rounded-xl flex items-start space-x-3 bg-emerald-50 border border-emerald-200 text-emerald-800";
    iconContainer.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6 text-emerald-500"></i>';
    title.innerText = "Pengembalian Tepat Waktu";
    subtitle.innerText = "Tidak dikenakan denda keterlambatan.";
  }
  lucide.createIcons();
}

async function handleReturnSubmit(event) {
  event.preventDefault();

  const confirmBtn = document.getElementById("return-confirm-btn");
  confirmBtn.disabled = true;
  confirmBtn.innerText = "Memproses...";

  const payload = {
    action: "returnBook",
    idPinjam: document.getElementById("return-id-pinjam").value,
    tanggalDikembalikan: document.getElementById("return-date").value
  };

  const res = await apiPost(payload);
  confirmBtn.disabled = false;
  confirmBtn.innerText = "Konfirmasi";

  if (res.status === "success") {
    let msg = res.message;
    if (res.denda > 0) {
      msg += ` Terlambat ${res.lateDays} hari, Denda: ${formatIDR(res.denda)}`;
      showToast(msg, "warning");
    } else {
      showToast(msg, "success");
    }
    closeReturnModal();
    syncAllData();
  } else {
    showToast("Error: " + res.message, "error");
  }
}

// ==================== ADVANCED REPORTS MODULE ====================
function updateReportsUI() {
  const pStats = state.reports.peminjamanStats || {};

  // Update Laporan Peminjaman Stats Block
  document.getElementById("report-total-transactions").innerText = pStats.totalTransactions || 0;
  document.getElementById("report-total-borrowed").innerText = pStats.totalBorrowed || 0;
  document.getElementById("report-total-returned").innerText = pStats.totalReturned || 0;
  document.getElementById("report-total-fines").innerText = formatIDR(pStats.totalFines || 0);
  document.getElementById("report-popular-book").innerText = pStats.mostPopularBook || "-";
  document.getElementById("report-active-borrower").innerText = pStats.mostActiveBorrower || "-";

  // Build Laporan Data Buku (Inventory Table)
  renderReportBooks();

  // Build Laporan Pengembalian Buku Table
  renderReportReturns();
}

function renderReportBooks() {
  const body = document.getElementById("report-books-table-body");
  if (!body) return;
  body.innerHTML = "";

  const inventory = state.reports.inventoryReport || [];
  if (inventory.length === 0) {
    body.innerHTML = `<tr><td colspan="8" class="px-6 py-4 text-center text-xs text-slate-400">Data rekap inventaris buku tidak ditemukan.</td></tr>`;
    return;
  }

  inventory.forEach(b => {
    const isAvailable = b["Status"] === "Tersedia";
    const statusText = b["Status"] || "Tersedia";
    const statusColor = isAvailable ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-rose-700 bg-rose-50 border-rose-100";

    body.innerHTML += `
      <tr class="border-b border-slate-100 text-slate-650 hover:bg-slate-50/40">
        <td class="px-6 py-3 font-semibold text-slate-900">${b["ID Buku"]}</td>
        <td class="px-6 py-3 font-medium text-slate-800">${b["Judul"]}</td>
        <td class="px-6 py-3">${b["Pengarang"]}</td>
        <td class="px-6 py-3">${b["Kategori"]}</td>
        <td class="px-6 py-3 text-xs font-semibold">${b["ISSN"]}</td>
        <td class="px-6 py-3">
          <span class="font-medium text-slate-700">${b["DDC"]}</span>
          <span class="text-slate-400 block text-xs">${b["Genre"]}</span>
        </td>
        <td class="px-6 py-3 font-semibold text-slate-800">${b["Jumlah Buku Tersedia"] || 0} / ${b["Jumlah Buku"] || 0}</td>
        <td class="px-6 py-3">
          <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColor}">${statusText}</span>
        </td>
      </tr>
    `;
  });
}

function renderReportReturns() {
  const body = document.getElementById("report-returns-table-body");
  if (!body) return;
  body.innerHTML = "";

  const returns = state.reports.returnsReport || [];
  if (returns.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="px-6 py-4 text-center text-xs text-slate-400">Data rekap pengembalian buku kosong.</td></tr>`;
    return;
  }

  returns.forEach(r => {
    const dendaVal = parseFloat(r["Denda"]) || 0;
    const dendaText = dendaVal > 0 ? `<span class="text-rose-600 font-bold">${formatIDR(dendaVal)}</span>` : '<span class="text-slate-400">Rp 0</span>';

    body.innerHTML += `
      <tr class="border-b border-slate-100 text-slate-650 hover:bg-slate-50/40">
        <td class="px-6 py-3 font-semibold text-slate-900">${r["ID Pinjam"]}</td>
        <td class="px-6 py-3">
          <div class="font-medium text-slate-800">${r["Judul Buku"]}</div>
          <div class="text-xs text-slate-400">ID: ${r["ID Buku"]}</div>
        </td>
        <td class="px-6 py-3">
          <div class="font-medium text-slate-800">${r["Nama Anggota"]}</div>
          <div class="text-xs text-slate-400">ID: ${r["ID Anggota"]}</div>
        </td>
        <td class="px-6 py-3 text-slate-500 text-xs">${formatReadableDate(r["Tanggal Pinjam"])}</td>
        <td class="px-6 py-3 text-slate-500 text-xs">${formatReadableDate(r["Tenggat Kembali"])}</td>
        <td class="px-6 py-3 text-slate-500 text-xs font-semibold">${formatReadableDate(r["Tanggal Dikembalikan"])}</td>
        <td class="px-6 py-3">${dendaText}</td>
      </tr>
    `;
  });
}

// Scoped printing layout trigger
function printReport(type) {
  // Add active print class to body so only selected tab is printed
  document.body.className = `print-active print-${type}`;
  window.print();
  // Reset classes after dialog closed
  document.body.className = "h-full text-slate-800 antialiased flex flex-col";
}

// ==================== SYSTEM UTILITIES ====================

function formatReadableDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString('id-ID', options);
  } catch (e) {
    return dateStr;
  }
}

function formatIDR(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function checkOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  const today = new Date();
  const due = new Date(dueDateStr);
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return today.getTime() > due.getTime();
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "flex items-center p-4 rounded-xl shadow-lg border text-sm transition-all duration-300 transform translate-y-2 opacity-0 select-none bg-white max-w-sm pointer-events-auto";

  let icon = "";
  if (type === "success") {
    toast.classList.add("border-emerald-200", "text-emerald-800");
    icon = '<i data-lucide="check-circle" class="w-5 h-5 mr-3 shrink-0 text-emerald-500"></i>';
  } else if (type === "error") {
    toast.classList.add("border-rose-200", "text-rose-800");
    icon = '<i data-lucide="x-circle" class="w-5 h-5 mr-3 shrink-0 text-rose-500"></i>';
  } else if (type === "warning") {
    toast.classList.add("border-amber-200", "text-amber-800");
    icon = '<i data-lucide="alert-triangle" class="w-5 h-5 mr-3 shrink-0 text-amber-500"></i>';
  } else {
    toast.classList.add("border-slate-200", "text-slate-800");
    icon = '<i data-lucide="info" class="w-5 h-5 mr-3 shrink-0 text-indigo-500"></i>';
  }

  toast.innerHTML = `${icon}<span class="font-medium">${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();

  // Transition entry
  setTimeout(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  }, 50);

  // Transition exit
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-1");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}
