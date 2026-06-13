/**
 * Library Management System - Google Apps Script Backend (PWA Version)
 * File: Code.gs
 * 
 * Instructions:
 * 1. Open your Google Spreadsheet (with tabs: Data Buku, Data Anggota, Data Peminjaman, Admin)
 * 2. Click Extensions -> Apps Script.
 * 3. Delete any default code and paste this entire Code.gs script.
 * 4. (Optional) Set SPREADSHEET_ID if running stand-alone. If container-bound (standard), leave blank.
 * 5. Click Save (disk icon).
 * 6. Click Deploy -> New Deployment.
 * 7. Click Select Type (gear icon) -> Web App.
 * 8. Set Description: "Library PWA API".
 * 9. Set Execute as: "Me (your-email@gmail.com)".
 * 10. Set Who has access: "Anyone".
 * 11. Click Deploy, authorize permissions, and copy the Web App URL.
 */

const SPREADSHEET_ID = ""; // Leave blank if script is container-bound to the spreadsheet
const DENDA_PER_HARI = 1000; // Overdue penalty in IDR per day (Rp 1,000)

// Helper to open spreadsheet
function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Helper to get worksheet by name
function getSheet(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Tab '" + sheetName + "' tidak ditemukan. Silakan buat tab ini di Spreadsheet Anda.");
  }
  return sheet;
}

// Helper to parse sheets data to JSON array
function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Empty or header only
  
  const headers = data[0];
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = {};
    let isEmptyRow = true;
    for (let j = 0; j < headers.length; j++) {
      let val = data[i][j];
      if (val !== "") isEmptyRow = false;
      
      // Convert Date object to formatted string YYYY-MM-DD
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
      }
      row[headers[j]] = val;
    }
    if (!isEmptyRow) {
      rows.push(row);
    }
  }
  return rows;
}

// Create JSON response (handles CORS redirects natively in GAS)
function getJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle GET Requests (Read Data)
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (!action) {
      return getJsonResponse({ status: "error", message: "Parameter 'action' tidak ditemukan" });
    }
    
    switch (action) {
      case "getAllData":
        return getJsonResponse({
          status: "success",
          stats: getDashboardData(),
          books: getSheetData("Data Buku"),
          members: getSheetData("Data Anggota"),
          borrowings: getSheetData("Data Peminjaman"),
          reports: getReportsData()
        });
      case "getBooks":
        return getJsonResponse({ status: "success", data: getSheetData("Data Buku") });
      case "getMembers":
        return getJsonResponse({ status: "success", data: getSheetData("Data Anggota") });
      case "getBorrowings":
        return getJsonResponse({ status: "success", data: getSheetData("Data Peminjaman") });
      case "getDashboard":
        return getJsonResponse({ status: "success", data: getDashboardData() });
      case "getReports":
        return getJsonResponse({ status: "success", data: getReportsData() });
      default:
        return getJsonResponse({ status: "error", message: "Action GET '" + action + "' tidak dikenali" });
    }
  } catch (error) {
    return getJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Handle POST Requests (Create, Update, Transactions)
 * To bypass CORS preflight OPTIONS request, frontend will send this as text/plain.
 */
function doPost(e) {
  try {
    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter;
    }
    
    const action = payload.action;
    if (!action) {
      return getJsonResponse({ status: "error", message: "Payload 'action' tidak ditemukan" });
    }
    
    switch (action) {
      case "login":
        return handleLogin(payload);
      case "addBook":
        return handleAddBook(payload);
      case "updateBook":
        return handleUpdateBook(payload);
      case "addMember":
        return handleAddMember(payload);
      case "updateMember":
        return handleUpdateMember(payload);
      case "borrowBook":
        return handleBorrowBook(payload);
      case "returnBook":
        return handleReturnBook(payload);
      default:
        return getJsonResponse({ status: "error", message: "Action POST '" + action + "' tidak dikenali" });
    }
  } catch (error) {
    return getJsonResponse({ status: "error", message: error.toString() });
  }
}

/**
 * Get Summary Stats for Dashboard
 */
function getDashboardData() {
  const books = getSheetData("Data Buku");
  const members = getSheetData("Data Anggota");
  const borrowings = getSheetData("Data Peminjaman");
  
  const totalBooks = books.length;
  const activeMembers = members.length;
  
  let activeBorrowings = 0;
  let totalDenda = 0;
  
  borrowings.forEach(row => {
    if (row["Status"] === "Berjalan") {
      activeBorrowings++;
    }
    const denda = parseFloat(row["Denda Keterlambatan"]) || 0;
    totalDenda += denda;
  });
  
  return {
    totalBooks: totalBooks,
    activeMembers: activeMembers,
    activeBorrowings: activeBorrowings,
    totalDenda: totalDenda
  };
}

/**
 * Get Advanced Reports Aggregations (Calculated Server-Side)
 */
function getReportsData() {
  const books = getSheetData("Data Buku");
  const members = getSheetData("Data Anggota");
  const borrowings = getSheetData("Data Peminjaman");
  
  // Create quick lookup maps
  const bookMap = {};
  books.forEach(b => { bookMap[b["ID Buku"]] = b; });
  
  const memberMap = {};
  members.forEach(m => { memberMap[m["ID Anggota"]] = m; });
  
  let totalTransactions = borrowings.length;
  let totalBorrowed = 0;
  let totalReturned = 0;
  let totalFines = 0;
  
  const bookCounts = {};
  const memberCounts = {};
  
  const returnsReport = [];
  
  borrowings.forEach(b => {
    const idBuku = b["ID Buku"];
    const idAnggota = b["ID Anggota"];
    const status = b["Status"];
    const denda = parseFloat(b["Denda Keterlambatan"]) || 0;
    
    totalFines += denda;
    if (status === "Berjalan") {
      totalBorrowed++;
    } else if (status === "Selesai") {
      totalReturned++;
    }
    
    // Tally counts for most popular and active
    bookCounts[idBuku] = (bookCounts[idBuku] || 0) + 1;
    memberCounts[idAnggota] = (memberCounts[idAnggota] || 0) + 1;
    
    // Build returned books detailed report table
    if (status === "Selesai") {
      const bookObj = bookMap[idBuku] || { "Judul": idBuku };
      const memberObj = memberMap[idAnggota] || { "Nama": idAnggota };
      returnsReport.push({
        "ID Pinjam": b["ID Pinjam"],
        "ID Buku": idBuku,
        "Judul Buku": bookObj["Judul"],
        "ID Anggota": idAnggota,
        "Nama Anggota": memberObj["Nama"],
        "Tanggal Pinjam": b["Tanggal Pinjam"],
        "Tenggat Kembali": b["Tenggat Kembali"],
        "Tanggal Dikembalikan": b["Tanggal Dikembalikan"],
        "Denda": denda
      });
    }
  });
  
  // Find Popular Book
  let maxBookId = "";
  let maxBookCount = 0;
  for (const id in bookCounts) {
    if (bookCounts[id] > maxBookCount) {
      maxBookCount = bookCounts[id];
      maxBookId = id;
    }
  }
  const popularBookTitle = maxBookId ? (bookMap[maxBookId] ? bookMap[maxBookId]["Judul"] : maxBookId) : "-";
  
  // Find Active Borrower
  let maxMemberId = "";
  let maxMemberCount = 0;
  for (const id in memberCounts) {
    if (memberCounts[id] > maxMemberCount) {
      maxMemberCount = memberCounts[id];
      maxMemberId = id;
    }
  }
  const activeMemberName = maxMemberId ? (memberMap[maxMemberId] ? memberMap[maxMemberId]["Nama"] : maxMemberId) : "-";
  
  // Format inventory report with classification fields
  const inventoryReport = books.map(b => ({
    "ID Buku": b["ID Buku"],
    "Judul": b["Judul"],
    "Pengarang": b["Pengarang"],
    "Kategori": b["Kategori (Fiksi/Non-Fiksi)"] || b["Kategori"] || "-",
    "ISSN": b["ISSN"] || "-",
    "DDC": b["DDC (Nomor Rak)"] || b["DDC"] || "-",
    "Genre": b["DDC - Genre"] || "-",
    "Jumlah Buku": b["Jumlah Buku"] || 0,
    "Jumlah Buku Tersedia": b["Jumlah Buku Tersedia"] || 0,
    "Status": b["Status"]
  }));
  
  return {
    peminjamanStats: {
      totalTransactions: totalTransactions,
      totalBorrowed: totalBorrowed,
      totalReturned: totalReturned,
      totalFines: totalFines,
      mostPopularBook: maxBookCount > 0 ? popularBookTitle + " (" + maxBookCount + "x)" : "-",
      mostActiveBorrower: maxMemberCount > 0 ? activeMemberName + " (" + maxMemberCount + "x)" : "-"
    },
    inventoryReport: inventoryReport,
    returnsReport: returnsReport
  };
}

/**
 * Simple Authentication
 */
function handleLogin(payload) {
  const admins = getSheetData("Admin");
  const username = payload.username;
  const password = payload.password;
  
  const match = admins.find(admin => 
    String(admin["Username"]).trim() === String(username).trim() &&
    String(admin["Password"]).trim() === String(password).trim()
  );
  
  if (match) {
    return getJsonResponse({ status: "success", message: "Login berhasil!", username: username });
  } else {
    return getJsonResponse({ status: "error", message: "Username atau password salah!" });
  }
}

/**
 * Add New Book (Expanded Schema)
 * Data Buku: ID Buku, Judul, Pengarang, Tahun Terbit, ISSN, DDC (Nomor Rak), DDC - Genre, Kategori (Fiksi/Non-Fiksi), Jumlah Buku, Jumlah Buku Tersedia, Status
 */
function handleAddBook(payload) {
  const sheet = getSheet("Data Buku");
  const idBuku = payload.idBuku || generateBookId(sheet);
  const judul = payload.judul;
  const pengarang = payload.pengarang;
  const tahun = payload.tahunTerbit;
  const issn = payload.issn || "";
  const ddcRak = payload.ddcRak || "";
  const ddcGenre = payload.ddcGenre || "";
  const kategori = payload.kategori || "Fiksi";
  const jmlBuku = parseInt(payload.jumlahBuku, 10) || 1;
  const jmlTersedia = jmlBuku;
  const status = jmlTersedia > 0 ? "Tersedia" : "Tidak Tersedia";
  
  sheet.appendRow([idBuku, judul, pengarang, tahun, issn, ddcRak, ddcGenre, kategori, jmlBuku, jmlTersedia, status]);
  return getJsonResponse({ status: "success", message: "Buku berhasil ditambahkan!", idBuku: idBuku });
}

// Auto-increment Book ID Generator (BKB-001, BKB-002...)
function generateBookId(sheet) {
  const rows = sheet.getLastRow();
  if (rows <= 1) return "BKB-001";
  
  const lastId = sheet.getRange(rows, 1).getValue().toString();
  const match = lastId.match(/BKB-(\d+)/);
  if (!match) return "BKB-" + String(rows).padStart(3, '0');
  
  const num = parseInt(match[1], 10);
  return "BKB-" + String(num + 1).padStart(3, '0');
}

/**
 * Update Book Details (Expanded Schema)
 */
function handleUpdateBook(payload) {
  const sheet = getSheet("Data Buku");
  const id = payload.idBuku;
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 2).setValue(payload.judul);
      sheet.getRange(i + 1, 3).setValue(payload.pengarang);
      sheet.getRange(i + 1, 4).setValue(payload.tahunTerbit);
      sheet.getRange(i + 1, 5).setValue(payload.issn);
      sheet.getRange(i + 1, 6).setValue(payload.ddcRak);
      sheet.getRange(i + 1, 7).setValue(payload.ddcGenre);
      sheet.getRange(i + 1, 8).setValue(payload.kategori);
      
      const jmlBuku = parseInt(payload.jumlahBuku, 10) || 0;
      const jmlTersedia = parseInt(payload.jumlahBukuTersedia, 10) || 0;
      const status = jmlTersedia > 0 ? "Tersedia" : "Tidak Tersedia";
      
      sheet.getRange(i + 1, 9).setValue(jmlBuku);
      sheet.getRange(i + 1, 10).setValue(jmlTersedia);
      sheet.getRange(i + 1, 11).setValue(status);
      
      return getJsonResponse({ status: "success", message: "Buku berhasil diperbarui!" });
    }
  }
  return getJsonResponse({ status: "error", message: "Buku dengan ID " + id + " tidak ditemukan!" });
}

/**
 * Add New Member (Expanded Schema)
 * Data Anggota: ID Anggota, Nama, Kelas/Instansi, Kontak, Alamat, Kontak Orang Tua
 */
function handleAddMember(payload) {
  const sheet = getSheet("Data Anggota");
  const idAnggota = payload.idAnggota || generateMemberId(sheet);
  const nama = payload.nama;
  const kelas = payload.kelasInstansi;
  const kontak = payload.kontak;
  const alamat = payload.alamat || "";
  const kontakOrtu = payload.kontakOrtu || "";
  
  sheet.appendRow([idAnggota, nama, kelas, kontak, alamat, kontakOrtu]);
  return getJsonResponse({ status: "success", message: "Anggota berhasil ditambahkan!", idAnggota: idAnggota });
}

// Auto-increment Member ID Generator (AGT-001, AGT-002...)
function generateMemberId(sheet) {
  const rows = sheet.getLastRow();
  if (rows <= 1) return "AGT-001";
  
  const lastId = sheet.getRange(rows, 1).getValue().toString();
  const match = lastId.match(/AGT-(\d+)/);
  if (!match) return "AGT-" + String(rows).padStart(3, '0');
  
  const num = parseInt(match[1], 10);
  return "AGT-" + String(num + 1).padStart(3, '0');
}

/**
 * Update Member Details (Expanded Schema)
 */
function handleUpdateMember(payload) {
  const sheet = getSheet("Data Anggota");
  const id = payload.idAnggota;
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 2).setValue(payload.nama);
      sheet.getRange(i + 1, 3).setValue(payload.kelasInstansi);
      sheet.getRange(i + 1, 4).setValue(payload.kontak);
      sheet.getRange(i + 1, 5).setValue(payload.alamat);
      sheet.getRange(i + 1, 6).setValue(payload.kontakOrtu);
      return getJsonResponse({ status: "success", message: "Anggota berhasil diperbarui!" });
    }
  }
  return getJsonResponse({ status: "error", message: "Anggota dengan ID " + id + " tidak ditemukan!" });
}

/**
 * Record Borrowing
 * Data Peminjaman: ID Pinjam, ID Buku, ID Anggota, Tanggal Pinjam, Tenggat Kembali, Tanggal Dikembalikan, Status, Denda Keterlambatan
 */
function handleBorrowBook(payload) {
  const pSheet = getSheet("Data Peminjaman");
  const bSheet = getSheet("Data Buku");
  
  const idPinjam = generateBorrowId(pSheet);
  const idBuku = payload.idBuku;
  const idAnggota = payload.idAnggota;
  const tglPinjam = payload.tanggalPinjam; // format YYYY-MM-DD
  const tenggat = payload.tenggatKembali; // format YYYY-MM-DD
  
  // Verify Book Availability by checking stock (Index 9 is Jumlah Buku Tersedia)
  const bData = bSheet.getDataRange().getValues();
  let bookRowIndex = -1;
  let currentJmlTersedia = 0;
  
  for (let i = 1; i < bData.length; i++) {
    if (String(bData[i][0]) === String(idBuku)) {
      const jmlTersedia = parseInt(bData[i][9], 10) || 0;
      if (jmlTersedia <= 0) {
        return getJsonResponse({ status: "error", message: "Stok buku ini sedang habis / tidak tersedia!" });
      }
      bookRowIndex = i + 1;
      currentJmlTersedia = jmlTersedia;
      break;
    }
  }
  
  if (bookRowIndex === -1) {
    return getJsonResponse({ status: "error", message: "Buku tidak ditemukan!" });
  }
  
  // Record Transaction
  pSheet.appendRow([idPinjam, idBuku, idAnggota, tglPinjam, tenggat, "", "Berjalan", 0]);
  
  // Decrement Stock count by 1 (Col 10, index 9)
  const newJmlTersedia = currentJmlTersedia - 1;
  bSheet.getRange(bookRowIndex, 10).setValue(newJmlTersedia);
  
  // Update Book status based on stock count (Col 11, index 10)
  const newStatus = newJmlTersedia > 0 ? "Tersedia" : "Tidak Tersedia";
  bSheet.getRange(bookRowIndex, 11).setValue(newStatus);
  
  return getJsonResponse({ status: "success", message: "Peminjaman berhasil dicatat!", idPinjam: idPinjam });
}

// Auto-increment Transaction ID Generator (TRX-001, TRX-002...)
function generateBorrowId(sheet) {
  const rows = sheet.getLastRow();
  if (rows <= 1) return "TRX-001";
  
  const lastId = sheet.getRange(rows, 1).getValue().toString();
  const match = lastId.match(/TRX-(\d+)/);
  if (!match) return "TRX-" + String(rows).padStart(3, '0');
  
  const num = parseInt(match[1], 10);
  return "TRX-" + String(num + 1).padStart(3, '0');
}

/**
 * Record Book Return & Calculate Late Penalty
 */
function handleReturnBook(payload) {
  const pSheet = getSheet("Data Peminjaman");
  const bSheet = getSheet("Data Buku");
  
  const idPinjam = payload.idPinjam;
  const tglKembaliStr = payload.tanggalDikembalikan; // YYYY-MM-DD
  
  const pData = pSheet.getDataRange().getValues();
  let pRowIndex = -1;
  let idBuku = "";
  let tenggatStr = "";
  
  for (let i = 1; i < pData.length; i++) {
    if (String(pData[i][0]) === String(idPinjam)) {
      if (pData[i][6] === "Selesai") {
        return getJsonResponse({ status: "error", message: "Peminjaman ini sudah dikembalikan (Status: Selesai)!" });
      }
      pRowIndex = i + 1;
      idBuku = pData[i][1];
      
      let tenggatVal = pData[i][4];
      if (tenggatVal instanceof Date) {
        tenggatStr = Utilities.formatDate(tenggatVal, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        tenggatStr = String(tenggatVal);
      }
      break;
    }
  }
  
  if (pRowIndex === -1) {
    return getJsonResponse({ status: "error", message: "Transaksi peminjaman ID " + idPinjam + " tidak ditemukan!" });
  }
  
  // Calculate Late Fee using GAS Date comparisons
  const dateKembali = new Date(tglKembaliStr);
  const dateTenggat = new Date(tenggatStr);
  
  // Reset time for pure calendar day math
  dateKembali.setHours(0, 0, 0, 0);
  dateTenggat.setHours(0, 0, 0, 0);
  
  const diffTime = dateKembali.getTime() - dateTenggat.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let denda = 0;
  let lateDays = 0;
  
  if (diffDays > 0) {
    lateDays = diffDays;
    denda = lateDays * DENDA_PER_HARI;
  }
  
  // Update transaction row details: Tanggal Dikembalikan (col 6), Status (col 7), Denda Keterlambatan (col 8)
  pSheet.getRange(pRowIndex, 6).setValue(tglKembaliStr);
  pSheet.getRange(pRowIndex, 7).setValue("Selesai");
  pSheet.getRange(pRowIndex, 8).setValue(denda);
  
  // Increment Available Stock & Reset Book status back to Tersedia (Col 10 & 11)
  const bData = bSheet.getDataRange().getValues();
  for (let j = 1; j < bData.length; j++) {
    if (String(bData[j][0]) === String(idBuku)) {
      const currentJmlTersedia = parseInt(bData[j][9], 10) || 0;
      const newJmlTersedia = currentJmlTersedia + 1;
      bSheet.getRange(j + 1, 10).setValue(newJmlTersedia);
      bSheet.getRange(j + 1, 11).setValue("Tersedia"); // Since stock is now > 0
      break;
    }
  }
  
  return getJsonResponse({
    status: "success",
    message: "Buku berhasil dikembalikan!",
    lateDays: lateDays,
    denda: denda
  });
}
