const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let booksCache = [], membersCache = [], issuesCache = [];
let toastTimer;

function notify(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.background = isError ? "#8b3e36" : "#203c34";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0,10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? escapeHTML(value) : date.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}
function showPage(name) {
  $$(".page").forEach(page => page.classList.remove("active"));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === name));
  $(`#${name}Page`).classList.add("active");
  const titles = { dashboard:"Dashboard", books:"Books", members:"Members", circulation:"Issue & Return" };
  $("#pageTitle").textContent = titles[name];
}
$$(".nav-link").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
$$("[data-go]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.go)));
$("#todayText").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });

async function loadHealth() {
  const label = $("#connectionText");
  try { await api("/api/health"); label.textContent = "Database connected"; }
  catch { label.textContent = "Database connection issue"; }
}
async function loadDashboard() {
  const stats = await api("/api/dashboard");
  $("#totalBooks").textContent = stats.totalBooks;
  $("#availableCopies").textContent = stats.availableCopies;
  $("#totalMembers").textContent = stats.totalMembers;
  $("#activeIssues").textContent = stats.activeIssues;
  const rows = await api("/api/issues");
  issuesCache = rows;
  $("#recentIssues").innerHTML = rows.length ? rows.slice(0,5).map(row => `
    <tr><td>${escapeHTML(row.book_title)}</td><td>${escapeHTML(row.member_name)}</td>
    <td>${dateLabel(row.issue_date)}</td><td><span class="status ${row.status === "Returned" ? "returned" : ""}">${escapeHTML(row.status)}</span></td></tr>`).join("") :
    '<tr><td colspan="4" class="empty">No issue records yet.</td></tr>';
}
async function loadBooks() {
  booksCache = await api("/api/books");
  renderBooks(booksCache);
  $("#issueBook").innerHTML = '<option value="">Select available book</option>' +
    booksCache.filter(book => Number(book.quantity) > 0).map(book =>
      `<option value="${book.book_id}">${escapeHTML(book.title)} (${book.quantity} available)</option>`).join("");
}
function renderBooks(rows) {
  $("#booksTable").innerHTML = rows.length ? rows.map(book => `
    <tr><td>${book.book_id}</td><td><strong>${escapeHTML(book.title)}</strong></td><td>${escapeHTML(book.author || "—")}</td>
    <td>${escapeHTML(book.category || "—")}</td><td>${book.quantity}</td></tr>`).join("") :
    '<tr><td colspan="5" class="empty">No books found.</td></tr>';
}
async function loadMembers() {
  membersCache = await api("/api/members");
  renderMembers(membersCache);
  $("#issueMember").innerHTML = '<option value="">Select member</option>' +
    membersCache.map(member => `<option value="${member.member_id}">${escapeHTML(member.name)} (${escapeHTML(member.roll_no)})</option>`).join("");
}
function renderMembers(rows) {
  $("#membersTable").innerHTML = rows.length ? rows.map(member => `
    <tr><td>${member.member_id}</td><td><strong>${escapeHTML(member.name)}</strong></td><td>${escapeHTML(member.roll_no)}</td>
    <td>${escapeHTML(member.email || "—")}</td><td>${escapeHTML(member.phone || "—")}</td></tr>`).join("") :
    '<tr><td colspan="5" class="empty">No members found.</td></tr>';
}
async function loadIssues() {
  issuesCache = await api("/api/issues");
  renderIssues(issuesCache);
}
function renderIssues(rows) {
  $("#issuesTable").innerHTML = rows.length ? rows.map(row => `
    <tr><td>#${row.issue_id}</td><td><strong>${escapeHTML(row.book_title)}</strong></td>
    <td>${escapeHTML(row.member_name)}<br><small>${escapeHTML(row.roll_no)}</small></td>
    <td>${dateLabel(row.issue_date)}</td><td>${dateLabel(row.return_date)}</td>
    <td><span class="status ${row.status === "Returned" ? "returned" : ""}">${escapeHTML(row.status)}</span></td>
    <td><button class="return-button" data-return="${row.issue_id}" ${row.status !== "Issued" ? "disabled" : ""}>Return</button></td></tr>`).join("") :
    '<tr><td colspan="7" class="empty">No issue records yet.</td></tr>';
  $$("[data-return]").forEach(button => button.addEventListener("click", async () => {
    if (!confirm("Mark this book as returned?")) return;
    try {
      const result = await api(`/api/issues/${button.dataset.return}/return`, { method:"PUT" });
      notify(result.message);
      await refreshAll();
    } catch (err) { notify(err.message, true); }
  }));
}
async function refreshAll() {
  await Promise.all([loadDashboard(), loadBooks(), loadMembers(), loadIssues()]);
}
$("#bookForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  body.quantity = Number(body.quantity);
  try {
    const result = await api("/api/books", { method:"POST", body:JSON.stringify(body) });
    event.currentTarget.reset();
    event.currentTarget.quantity.value = 1;
    notify(result.message);
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});
$("#memberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const result = await api("/api/members", { method:"POST", body:JSON.stringify(body) });
    event.currentTarget.reset();
    notify(result.message);
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});
$("#issueForm").addEventListener("submit", async event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  body.member_id = Number(body.member_id);
  body.book_id = Number(body.book_id);
  try {
    const result = await api("/api/issues", { method:"POST", body:JSON.stringify(body) });
    notify(result.message);
    event.currentTarget.reset();
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});
$("#bookSearch").addEventListener("input", event => {
  const q = event.target.value.toLowerCase();
  renderBooks(booksCache.filter(b => [b.title,b.author,b.category,b.publisher].some(v => String(v || "").toLowerCase().includes(q))));
});
$("#memberSearch").addEventListener("input", event => {
  const q = event.target.value.toLowerCase();
  renderMembers(membersCache.filter(m => [m.name,m.roll_no,m.email,m.phone].some(v => String(v || "").toLowerCase().includes(q))));
});
$("#issueSearch").addEventListener("input", event => {
  const q = event.target.value.toLowerCase();
  renderIssues(issuesCache.filter(i => [i.book_title,i.member_name,i.roll_no,i.status,i.issue_id].some(v => String(v || "").toLowerCase().includes(q))));
});

(async function init() {
  await loadHealth();
  try { await refreshAll(); }
  catch (err) { notify(err.message, true); }
})();
