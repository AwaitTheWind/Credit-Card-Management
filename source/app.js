(() => {
  "use strict";

  const STORAGE_KEY = "cardpilot.cards.v1";
  const THEME_KEY = "cardpilot.theme";
  const colors = ["#4169e1", "#8b65df", "#1f9a76", "#dd7f35", "#376b91", "#c2556c", "#5c6ac4", "#4b8e8d"];
  const networkColors = { "银联": "#3f6df6", Visa: "#20a47a", Mastercard: "#ed8b39", "American Express": "#8b65df", JCB: "#d95663", "其他": "#738096" };

  const sampleCards = [
    { id: "demo-1", name: "环球旅行白金卡", bank: "中国银行", holder: "本人", network: "Mastercard", tier: "白金", limit: 50000, billDay: 6, paymentDay: 26, annualFee: 800, feeWaived: 800, feeDate: "2026-11-18", benefits: ["境外返现", "机场贵宾厅"], notes: "匿名示例数据", status: "active", color: colors[0] },
    { id: "demo-2", name: "经典白金卡", bank: "招商银行", holder: "本人", network: "银联", tier: "白金", limit: 80000, billDay: 12, paymentDay: 30, annualFee: 3600, feeWaived: 2600, feeDate: "2026-09-08", benefits: ["酒店权益", "延误险", "贵宾厅"], notes: "匿名示例数据", status: "active", color: colors[1] },
    { id: "demo-3", name: "牡丹世界卡", bank: "工商银行", holder: "本人", network: "Mastercard", tier: "世界", limit: 100000, billDay: 1, paymentDay: 25, annualFee: 2000, feeWaived: 1000, feeDate: "2027-01-12", benefits: ["境外返现", "消费挑战"], notes: "匿名示例数据", status: "active", color: colors[2] },
    { id: "demo-4", name: "尊然白金卡", bank: "农业银行", holder: "家人", network: "Visa", tier: "白金", limit: 100000, billDay: 17, paymentDay: 11, annualFee: 880, feeWaived: 880, feeDate: "2026-12-20", benefits: ["接送机", "酒店权益"], notes: "匿名示例数据", status: "active", color: colors[3] },
    { id: "demo-5", name: "尊享白金卡", bank: "建设银行", holder: "本人", network: "Visa", tier: "白金", limit: 100000, billDay: 22, paymentDay: 10, annualFee: 1800, feeWaived: 1080, feeDate: "2026-10-06", benefits: ["龙腾出行", "接送机", "酒店权益"], notes: "匿名示例数据", status: "active", color: colors[4] },
    { id: "demo-6", name: "行悠白金卡", bank: "兴业银行", holder: "本人", network: "American Express", tier: "白金", limit: 100000, billDay: 9, paymentDay: 29, annualFee: 1800, feeWaived: 800, feeDate: "2026-08-28", benefits: ["贵宾厅", "商场会籍"], notes: "匿名示例数据", status: "active", color: colors[5] }
  ];

  let cards = loadCards();
  let activeView = "dashboard";
  let calendarDate = new Date();

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const clampDay = (year, month, day) => Math.min(Math.max(Number(day) || 1, 1), new Date(year, month + 1, 0).getDate());
  const uid = () => globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadCards() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(stored) ? stored : structuredClone(sampleCards);
    } catch { return structuredClone(sampleCards); }
  }

  function saveCards(message = "数据已保存") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    toast(message);
    renderAll();
  }

  function activeCards() { return cards.filter((card) => card.status === "active"); }

  function renderAll() {
    renderMetrics();
    renderBankChart();
    renderNetworkChart();
    renderFeeProgress();
    renderBenefits();
    renderUpcoming();
    renderCardStrip();
    populateBankFilter();
    renderTable();
    renderCalendar();
  }

  function renderMetrics() {
    const enabled = activeCards();
    const totalLimit = enabled.reduce((sum, c) => sum + Number(c.limit || 0), 0);
    const totalFee = enabled.reduce((sum, c) => sum + Number(c.annualFee || 0), 0);
    const waived = enabled.reduce((sum, c) => sum + Math.min(Number(c.feeWaived || 0), Number(c.annualFee || 0)), 0);
    const benefitCount = new Set(enabled.flatMap((c) => c.benefits || [])).size;
    const current = new Date();
    const events = getMonthEvents(current.getFullYear(), current.getMonth()).filter((e) => e.type === "payment");
    const future = events.filter((e) => e.date >= startOfToday()).sort((a, b) => a.date - b.date);
    $("#metric-limit").textContent = money(totalLimit);
    $("#metric-limit-note").textContent = `${enabled.length} 张启用卡片`;
    $("#metric-fee").textContent = money(Math.max(0, totalFee - waived));
    $("#metric-fee-note").textContent = `已减免 ${money(waived)}`;
    $("#metric-repayment").textContent = `${events.length} 笔`;
    $("#metric-repayment-note").textContent = future[0] ? `最近 ${future[0].date.getMonth() + 1}月${future[0].date.getDate()}日` : "本月暂无待办";
    $("#metric-benefits").textContent = `${benefitCount} 项`;
    const weekEvents = upcomingEvents(7).filter((e) => e.type === "payment");
    const alert = $("#alert-strip");
    alert.classList.toggle("show", weekEvents.length > 0);
    alert.innerHTML = weekEvents.length ? `<span>⚠ 未来 7 天有 <strong>${weekEvents.length}</strong> 个还款日，请确认账单已处理。</span><button class="text-btn" data-jump="calendar">查看日历 →</button>` : "";
    bindJumpButtons();
  }

  function renderBankChart() {
    const sums = {};
    activeCards().forEach((c) => { sums[c.bank] = (sums[c.bank] || 0) + Number(c.limit || 0); });
    const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(([, value]) => value), 1);
    $("#bank-chart").innerHTML = entries.length ? entries.map(([bank, value]) => `<div class="bar-item" title="${safe(bank)} ${money(value)}"><b>${money(value).replace("CN¥", "¥")}</b><div class="bar" style="height:${Math.max(4, value / max * 160)}px"></div><span>${safe(bank.replace("银行", ""))}</span></div>`).join("") : `<div class="empty-state">暂无数据</div>`;
  }

  function renderNetworkChart() {
    const counts = {};
    activeCards().forEach((c) => { counts[c.network || "其他"] = (counts[c.network || "其他"] || 0) + 1; });
    const entries = Object.entries(counts);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    let cursor = 0;
    const segments = entries.map(([name, count]) => {
      const start = cursor;
      cursor += total ? count / total * 100 : 100;
      return `${networkColors[name] || networkColors["其他"]} ${start}% ${cursor}%`;
    });
    $("#network-donut").style.background = `conic-gradient(${segments.join(",") || "#dfe5ef 0 100%"})`;
    $("#donut-total").textContent = total;
    $("#network-legend").innerHTML = entries.map(([name, count]) => `<div class="legend-item"><i style="background:${networkColors[name] || networkColors["其他"]}"></i><span>${safe(name)}</span><b>${count}</b></div>`).join("") || `<span class="muted-stack">暂无数据</span>`;
  }

  function renderFeeProgress() {
    const feeCards = activeCards().filter((c) => Number(c.annualFee) > 0);
    const target = feeCards.reduce((sum, c) => sum + Number(c.annualFee), 0);
    const current = feeCards.reduce((sum, c) => sum + Math.min(Number(c.feeWaived || 0), Number(c.annualFee || 0)), 0);
    const ratio = target ? Math.min(100, current / target * 100) : 100;
    $("#fee-progress-value").textContent = `${Math.round(ratio)}%`;
    $("#fee-progress-label").textContent = `${money(current)} / ${money(target)}`;
    $("#fee-progress-bar").style.width = `${ratio}%`;
    $("#fee-list").innerHTML = feeCards.sort((a, b) => (a.feeWaived / a.annualFee) - (b.feeWaived / b.annualFee)).slice(0, 3).map((c) => `<div class="mini-row"><span>${safe(c.name)}</span><b>${Math.round(c.feeWaived / c.annualFee * 100)}%</b></div>`).join("") || `<div class="mini-row"><span>所有卡片均免年费</span><b>完成</b></div>`;
  }

  function renderBenefits() {
    const counts = {};
    activeCards().flatMap((c) => c.benefits || []).filter(Boolean).forEach((benefit) => { counts[benefit] = (counts[benefit] || 0) + 1; });
    $("#benefit-cloud").innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<span class="benefit-tag" style="--weight:${Math.min(count, 4)}">${safe(name)}${count > 1 ? ` · ${count}` : ""}</span>`).join("") || `<span class="muted-stack">暂无权益数据</span>`;
  }

  function startOfToday() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  function upcomingEvents(days = 45) {
    const start = startOfToday();
    const end = new Date(start); end.setDate(end.getDate() + days);
    const events = [];
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) events.push(...getMonthEvents(cursor.getFullYear(), cursor.getMonth()));
    return events.filter((e) => e.date >= start && e.date <= end).sort((a, b) => a.date - b.date);
  }

  function getMonthEvents(year, month) {
    return activeCards().flatMap((card) => [
      { type: "bill", label: `${card.name} · 账单`, bank: card.bank, card, date: new Date(year, month, clampDay(year, month, card.billDay)) },
      { type: "payment", label: `${card.name} · 还款`, bank: card.bank, card, date: new Date(year, month, clampDay(year, month, card.paymentDay)) }
    ]);
  }

  function renderUpcoming() {
    const names = { payment: "还款日", bill: "账单日" };
    const events = upcomingEvents(40).slice(0, 8);
    $("#upcoming-list").innerHTML = events.map((e) => `<div class="timeline-item"><div class="timeline-date" style="background:${e.type === "bill" ? "var(--orange)" : "var(--primary)"}"><b>${e.date.getDate()}</b><span>${e.date.getMonth() + 1}月</span></div><div><strong>${safe(e.card.name)}</strong><small>${safe(e.bank)} · ${names[e.type]}</small></div></div>`).join("") || `<div class="empty-state">暂无近期事项</div>`;
  }

  function renderCardStrip() {
    $("#card-strip").innerHTML = activeCards().slice(0, 8).map((c) => `<div class="credit-card" style="--card-color:${c.color || colors[0]}"><small>${safe(c.bank)} · ${safe(c.network)}</small><strong>${safe(c.name)}</strong><span>${money(c.limit)}</span></div>`).join("") || `<div class="empty-state">暂无启用卡片</div>`;
  }

  function populateBankFilter() {
    const select = $("#bank-filter");
    const current = select.value;
    const banks = [...new Set(cards.map((c) => c.bank).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    select.innerHTML = `<option value="all">全部银行</option>${banks.map((bank) => `<option value="${safe(bank)}">${safe(bank)}</option>`).join("")}`;
    select.value = banks.includes(current) ? current : "all";
  }

  function filteredCards() {
    const query = $("#search-input").value.trim().toLowerCase();
    const status = $("#status-filter").value;
    const bank = $("#bank-filter").value;
    const sort = $("#sort-select").value;
    const result = cards.filter((c) => {
      const haystack = [c.name, c.bank, c.holder, c.network, c.tier, ...(c.benefits || [])].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (status === "all" || c.status === status) && (bank === "all" || c.bank === bank);
    });
    if (sort === "limit-desc") result.sort((a, b) => b.limit - a.limit);
    else if (sort === "payment") result.sort((a, b) => a.paymentDay - b.paymentDay);
    else result.sort((a, b) => a.bank.localeCompare(b.bank, "zh-CN"));
    return result;
  }

  function renderTable() {
    const result = filteredCards();
    $("#table-summary").textContent = `显示 ${result.length} / ${cards.length} 张卡片 · 合计额度 ${money(result.reduce((sum, c) => sum + Number(c.limit || 0), 0))}`;
    $("#table-empty").hidden = result.length > 0;
    $("#card-table-body").innerHTML = result.map((c) => {
      const remainingFee = Math.max(0, Number(c.annualFee || 0) - Number(c.feeWaived || 0));
      return `<tr><td><div class="cell-title"><span class="cell-swatch" style="--card-color:${c.color || colors[0]}"></span><div><strong>${safe(c.name)}</strong><small>${safe(c.tier || "未设置等级")}</small></div></div></td><td><div class="muted-stack"><strong>${safe(c.bank)}</strong><span>${safe(c.holder || "未设置")}</span></div></td><td>${safe(c.network || "其他")}</td><td><strong>${money(c.limit)}</strong></td><td><div class="muted-stack"><strong>${c.billDay} 日 / ${c.paymentDay} 日</strong><span>账单 / 还款</span></div></td><td>${remainingFee ? `<span class="badge">待减免 ${money(remainingFee)}</span>` : `<span class="badge green">已减免</span>`}</td><td><span class="badge ${c.status === "active" ? "green" : "gray"}">${c.status === "active" ? "使用中" : "已停用"}</span></td><td><div class="row-actions"><button data-edit="${safe(c.id)}" title="编辑">✎</button></div></td></tr>`;
    }).join("");
    $$('[data-edit]').forEach((button) => button.addEventListener("click", () => openCardDialog(button.dataset.edit)));
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear(), month = calendarDate.getMonth();
    $("#calendar-title").textContent = `${year} 年 ${month + 1} 月`;
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const events = getMonthEvents(year, month);
    const today = startOfToday();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dayEvents = events.filter((e) => e.date.toDateString() === date.toDateString());
      const classes = ["calendar-day", date.getMonth() !== month ? "outside" : "", date.toDateString() === today.toDateString() ? "today" : ""].filter(Boolean).join(" ");
      cells.push(`<div class="${classes}"><span class="day-num">${date.getDate()}</span><div class="day-events">${dayEvents.slice(0, 3).map((e) => `<span class="day-event ${e.type}" title="${safe(e.label)}">${safe(e.card.name)} · ${e.type === "bill" ? "账单" : "还款"}</span>`).join("")}${dayEvents.length > 3 ? `<span class="day-event">+${dayEvents.length - 3}</span>` : ""}</div></div>`);
    }
    $("#calendar-grid").innerHTML = cells.join("");
    $("#month-reminders").innerHTML = events.sort((a, b) => a.date - b.date).map((e) => `<div class="reminder-item"><strong>${e.date.getDate()} 日 · ${safe(e.card.name)}</strong><span>${safe(e.bank)} · ${e.type === "bill" ? "账单日" : "还款日"}</span></div>`).join("") || `<div class="empty-state">本月暂无提醒</div>`;
  }

  function switchView(view) {
    activeView = view;
    const titles = { dashboard: ["财务概览", "信用卡信息汇总"], cards: ["数据管理", "信用卡数据管理"], calendar: ["计划与提醒", "账单与还款日历"], guide: ["安全与帮助", "使用说明"] };
    $$(".view").forEach((el) => el.classList.toggle("active", el.id === `${view}-view`));
    $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
    $("#view-eyebrow").textContent = titles[view][0];
    $("#view-title").textContent = titles[view][1];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function bindJumpButtons() { $$('[data-jump]').forEach((el) => { el.onclick = () => switchView(el.dataset.jump); }); }

  function openCardDialog(id = null) {
    const card = cards.find((c) => c.id === id);
    $("#dialog-title").textContent = card ? "编辑信用卡" : "添加信用卡";
    $("#delete-card-btn").hidden = !card;
    $("#card-id").value = card?.id || "";
    $("#card-name").value = card?.name || "";
    $("#card-bank").value = card?.bank || "";
    $("#card-holder").value = card?.holder || "本人";
    $("#card-network").value = card?.network || "银联";
    $("#card-tier").value = card?.tier || "";
    $("#card-limit").value = card?.limit || 0;
    $("#card-bill-day").value = card?.billDay || 1;
    $("#card-payment-day").value = card?.paymentDay || 20;
    $("#card-fee").value = card?.annualFee || 0;
    $("#card-fee-waived").value = card?.feeWaived || 0;
    $("#card-fee-date").value = card?.feeDate || "";
    $("#card-status").value = card?.status || "active";
    $("#card-benefits").value = (card?.benefits || []).join("，");
    $("#card-notes").value = card?.notes || "";
    $("#card-dialog").showModal();
    $("#card-name").focus();
  }

  function collectFormCard() {
    const existing = cards.find((c) => c.id === $("#card-id").value);
    return {
      id: existing?.id || uid(), name: $("#card-name").value.trim(), bank: $("#card-bank").value.trim(), holder: $("#card-holder").value.trim(),
      network: $("#card-network").value, tier: $("#card-tier").value.trim(), limit: Number($("#card-limit").value) || 0,
      billDay: Number($("#card-bill-day").value) || 1, paymentDay: Number($("#card-payment-day").value) || 1,
      annualFee: Number($("#card-fee").value) || 0, feeWaived: Number($("#card-fee-waived").value) || 0,
      feeDate: $("#card-fee-date").value, status: $("#card-status").value,
      benefits: $("#card-benefits").value.split(/[，,]/).map((x) => x.trim()).filter(Boolean), notes: $("#card-notes").value.trim(),
      color: existing?.color || colors[cards.length % colors.length]
    };
  }

  function exportJson() {
    download(`cardpilot-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "CardPilot", version: 1, exportedAt: new Date().toISOString(), cards }, null, 2), "application/json");
    toast("备份已导出");
  }

  function exportCsv() {
    const headers = ["卡片名称", "银行", "持卡人", "卡组织", "等级", "固定额度", "账单日", "还款日", "年费", "已减免", "年费日期", "权益", "状态", "备注"];
    const rows = cards.map((c) => [c.name, c.bank, c.holder, c.network, c.tier, c.limit, c.billDay, c.paymentDay, c.annualFee, c.feeWaived, c.feeDate, (c.benefits || []).join("、"), c.status === "active" ? "使用中" : "已停用", c.notes]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    download(`cardpilot-cards-${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
    toast("CSV 已导出");
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = Object.assign(document.createElement("a"), { href: url, download: filename });
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.cards;
        if (!Array.isArray(incoming)) throw new Error("备份中没有 cards 数组");
        const valid = incoming.filter((c) => c && typeof c.name === "string" && typeof c.bank === "string").map((c, index) => ({ ...c, id: c.id || uid(), color: c.color || colors[index % colors.length], benefits: Array.isArray(c.benefits) ? c.benefits : [] }));
        if (!valid.length && incoming.length) throw new Error("没有可识别的卡片记录");
        cards = valid; saveCards(`已导入 ${valid.length} 张卡片`);
      } catch (error) { toast(`导入失败：${error.message}`); }
      $("#import-file").value = "";
    };
    reader.readAsText(file, "utf-8");
  }

  let toastTimer;
  function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }

  function init() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark") document.documentElement.dataset.theme = "dark";
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    $("#add-card-btn").addEventListener("click", () => openCardDialog());
    $("#dialog-close").addEventListener("click", () => $("#card-dialog").close());
    $("#cancel-card-btn").addEventListener("click", () => $("#card-dialog").close());
    $("#card-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const card = collectFormCard();
      const index = cards.findIndex((c) => c.id === card.id);
      if (index >= 0) cards[index] = card; else cards.push(card);
      $("#card-dialog").close(); saveCards(index >= 0 ? "卡片已更新" : "卡片已添加");
    });
    $("#delete-card-btn").addEventListener("click", () => {
      const id = $("#card-id").value;
      const card = cards.find((c) => c.id === id);
      if (card && confirm(`确认删除“${card.name}”？此操作无法撤销。`)) { cards = cards.filter((c) => c.id !== id); $("#card-dialog").close(); saveCards("卡片已删除"); }
    });
    ["#search-input", "#status-filter", "#bank-filter", "#sort-select"].forEach((selector) => $(selector).addEventListener(selector === "#search-input" ? "input" : "change", renderTable));
    $("#export-btn").addEventListener("click", exportJson);
    $("#export-csv-btn").addEventListener("click", exportCsv);
    $("#import-btn").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (event) => event.target.files[0] && importJson(event.target.files[0]));
    $("#prev-month").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    $("#next-month").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    $("#today-btn").addEventListener("click", () => { calendarDate = new Date(); renderCalendar(); });
    $("#theme-toggle").addEventListener("click", () => { const dark = document.documentElement.dataset.theme === "dark"; document.documentElement.dataset.theme = dark ? "" : "dark"; localStorage.setItem(THEME_KEY, dark ? "light" : "dark"); });
    $("#reset-btn").addEventListener("click", () => { if (confirm("确认删除当前本地数据，并恢复匿名示例数据？")) { cards = structuredClone(sampleCards); saveCards("已恢复示例数据"); } });
    bindJumpButtons();
    renderAll();
  }

  window.CardPilot = { getCards: () => structuredClone(cards), money, getMonthEvents };
  document.addEventListener("DOMContentLoaded", init);
})();
