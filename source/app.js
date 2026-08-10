(() => {
  "use strict";

  const STORAGE_KEY = "cardpilot.cards.v1";
  const THEME_KEY = "cardpilot.theme";
  const colors = ["#4169e1", "#8b65df", "#1f9a76", "#dd7f35", "#376b91", "#c2556c", "#5c6ac4", "#4b8e8d"];
  const networkColors = { "银联": "#3f6df6", Visa: "#20a47a", Mastercard: "#ed8b39", "American Express": "#8b65df", JCB: "#d95663", "其他": "#738096" };

  let cards = loadCards();
  let activeView = "dashboard";
  let calendarDate = new Date();
  let reminderPage = 0;
  const expandedCalendarDays = new Set();
  const REMINDERS_PER_PAGE = 9;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const clampDay = (year, month, day) => Math.min(Math.max(Number(day) || 1, 1), new Date(year, month + 1, 0).getDate());
  const uid = () => globalThis.crypto?.randomUUID?.() || `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function getNetworks(card) {
    const values = Array.isArray(card?.networks) ? card.networks : Array.isArray(card?.network) ? card.network : [card?.network];
    const normalized = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
    return normalized.length ? normalized : ["其他"];
  }

  function normalizeCard(card) {
    const networks = getNetworks(card);
    const cardRole = card?.cardRole === "supplementary" ? "supplementary" : "primary";
    const creditGroupId = String(card?.creditGroupId || "");
    const limitMode = card?.limitMode === "shared" && creditGroupId ? "shared" : "individual";
    const legacyWaived = Number(card?.feeWaived || 0);
    const annualFee = Number(card?.annualFee || 0);
    const validFeeTypes = ["rigid", "waivable", "term_free", "lifetime_free"];
    const feeType = validFeeTypes.includes(card?.feeType) ? card.feeType : legacyWaived > 0 ? "waivable" : "rigid";
    return {
      ...card,
      networks,
      network: networks[0],
      cardRole,
      limitMode,
      creditGroupId: limitMode === "shared" ? creditGroupId : "",
      creditGroupName: limitMode === "shared" ? String(card?.creditGroupName || `${card?.bank || "信用卡"}共享额度`) : "",
      sharedLimit: limitMode === "shared" ? Number(card?.sharedLimit ?? card?.limit) || 0 : 0,
      primaryCardId: cardRole === "supplementary" ? String(card?.primaryCardId || "") : "",
      feeType,
      feeWaiverMethod: feeType === "waivable" ? String(card?.feeWaiverMethod || "") : "",
      feeWaiverCompleted: feeType === "waivable" && (card?.feeWaiverCompleted === true || (annualFee > 0 && legacyWaived >= annualFee)),
      feeExpiry: feeType === "term_free" ? String(card?.feeExpiry || "") : ""
    };
  }

  function annualFeeCost(card) {
    return ["term_free", "lifetime_free"].includes(card.feeType) || card.feeType === "waivable" && card.feeWaiverCompleted ? 0 : Number(card.annualFee || 0);
  }

  function getEffectiveLimit(card) {
    return card?.limitMode === "shared" && card.creditGroupId ? Number(card.sharedLimit || 0) : Number(card?.limit || 0);
  }

  function getCreditGroups() {
    const groups = new Map();
    cards.filter((card) => card.limitMode === "shared" && card.creditGroupId).forEach((card) => {
      if (!groups.has(card.creditGroupId)) groups.set(card.creditGroupId, {
        id: card.creditGroupId,
        name: card.creditGroupName || `${card.bank}共享额度`,
        bank: card.bank,
        limit: getEffectiveLimit(card),
        members: []
      });
      groups.get(card.creditGroupId).members.push(card.id);
    });
    return [...groups.values()];
  }

  function getCreditPools(cardList) {
    const pools = new Map();
    cardList.forEach((card) => {
      const key = card.limitMode === "shared" && card.creditGroupId ? `group:${card.creditGroupId}` : `card:${card.id}`;
      if (!pools.has(key)) pools.set(key, { bank: card.bank, limit: getEffectiveLimit(card) });
    });
    return [...pools.values()];
  }

  function totalCreditLimit(cardList) {
    return getCreditPools(cardList).reduce((sum, pool) => sum + pool.limit, 0);
  }

  function setChoiceValue(name, value) {
    $$(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === value; });
  }

  function getChoiceValue(name) {
    return $(`input[name="${name}"]:checked`)?.value || "";
  }

  function updateNetworkSelectLabel() {
    const selected = $$('input[name="card-network"]:checked').map((input) => input.value);
    $("#card-network-summary").textContent = selected.length ? selected.join("、") : "请选择卡组织";
  }

  function loadCards() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const loaded = Array.isArray(stored) ? stored : [];
      const userCards = loaded.filter((card) => !String(card?.id || "").startsWith("demo-"));
      if (userCards.length !== loaded.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(userCards));
      return userCards.map(normalizeCard);
    } catch { return []; }
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
    const totalLimit = totalCreditLimit(enabled);
    const totalFee = enabled.reduce((sum, c) => sum + Number(c.annualFee || 0), 0);
    const waived = enabled.reduce((sum, c) => sum + (annualFeeCost(c) === 0 ? Number(c.annualFee || 0) : 0), 0);
    const benefitCount = new Set(enabled.flatMap((c) => c.benefits || [])).size;
    const current = new Date();
    const events = getMonthEvents(current.getFullYear(), current.getMonth()).filter((e) => e.type === "payment");
    const future = events.filter((e) => e.date >= startOfToday()).sort((a, b) => a.date - b.date);
    $("#metric-limit").textContent = money(totalLimit);
    $("#metric-limit-note").textContent = `${enabled.length} 张启用卡片`;
    $("#metric-fee").textContent = money(enabled.reduce((sum, card) => sum + annualFeeCost(card), 0));
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
    getCreditPools(activeCards()).forEach((pool) => { sums[pool.bank] = (sums[pool.bank] || 0) + pool.limit; });
    const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(([, value]) => value), 1);
    $("#bank-chart").innerHTML = entries.length ? entries.map(([bank, value]) => `<div class="bar-item" title="${safe(bank)} ${money(value)}"><b>${money(value).replace("CN¥", "¥")}</b><div class="bar" style="height:${Math.max(4, value / max * 160)}px"></div><span>${safe(bank)}</span></div>`).join("") : `<div class="empty-state">暂无数据</div>`;
  }

  function renderNetworkChart() {
    const counts = {};
    activeCards().forEach((c) => getNetworks(c).forEach((network) => { counts[network] = (counts[network] || 0) + 1; }));
    const entries = Object.entries(counts);
    const membershipTotal = entries.reduce((sum, [, count]) => sum + count, 0);
    let cursor = 0;
    const segments = entries.map(([name, count]) => {
      const start = cursor;
      cursor += membershipTotal ? count / membershipTotal * 100 : 100;
      return `${networkColors[name] || networkColors["其他"]} ${start}% ${cursor}%`;
    });
    $("#network-donut").style.background = `conic-gradient(${segments.join(",") || "#dfe5ef 0 100%"})`;
    $("#donut-total").textContent = activeCards().length;
    $("#network-legend").innerHTML = entries.map(([name, count]) => `<div class="legend-item"><i style="background:${networkColors[name] || networkColors["其他"]}"></i><span>${safe(name)}</span><b>${count}</b></div>`).join("") || `<span class="muted-stack">暂无数据</span>`;
  }

  function renderFeeProgress() {
    const feeCards = activeCards().filter((c) => Number(c.annualFee) > 0);
    const waivableCards = feeCards.filter((c) => c.feeType === "waivable");
    const target = waivableCards.reduce((sum, c) => sum + Number(c.annualFee), 0);
    const current = waivableCards.reduce((sum, c) => sum + (c.feeWaiverCompleted ? Number(c.annualFee) : 0), 0);
    const ratio = target ? Math.min(100, current / target * 100) : 100;
    $("#fee-progress-value").textContent = `${Math.round(ratio)}%`;
    $("#fee-progress-label").textContent = `${money(current)} / ${money(target)}`;
    $("#fee-progress-bar").style.width = `${ratio}%`;
    const feeLabels = { rigid: "刚性年费", waivable: "待完成", term_free: "有效期内免", lifetime_free: "终身免" };
    $("#fee-list").innerHTML = feeCards.sort((a, b) => Number(a.feeWaiverCompleted) - Number(b.feeWaiverCompleted)).slice(0, 3).map((c) => `<div class="mini-row"><span>${safe(c.name)}</span><b>${c.feeType === "waivable" && c.feeWaiverCompleted ? "已完成" : feeLabels[c.feeType] || "刚性年费"}</b></div>`).join("") || `<div class="mini-row"><span>暂无年费卡片</span><b>—</b></div>`;
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
    return activeCards().flatMap((card) => {
      const events = [
        { type: "bill", label: `${card.name} · 账单`, bank: card.bank, card, date: new Date(year, month, clampDay(year, month, card.billDay)) },
        { type: "payment", label: `${card.name} · 还款`, bank: card.bank, card, date: new Date(year, month, clampDay(year, month, card.paymentDay)) }
      ];
      const feeDateParts = String(card.feeDate || "").split("-").map(Number);
      if (Number(card.annualFee) > 0 && feeDateParts.length === 3 && feeDateParts[1] - 1 === month) {
        events.push({ type: "annual-fee", label: `${card.name} · 年费收取`, bank: card.bank, card, date: new Date(year, month, clampDay(year, month, feeDateParts[2])) });
      }
      return events;
    });
  }

  function renderUpcoming() {
    const names = { payment: "还款日", bill: "账单日", "annual-fee": "年费收取日" };
    const events = upcomingEvents(40).slice(0, 8);
    const eventColors = { bill: "var(--orange)", payment: "var(--primary)", "annual-fee": "var(--purple)" };
    $("#upcoming-list").innerHTML = events.map((e) => `<div class="timeline-item"><div class="timeline-date" style="background:${eventColors[e.type]}"><b>${e.date.getDate()}</b><span>${e.date.getMonth() + 1}月</span></div><div><strong>${safe(e.card.name)}</strong><small>${safe(e.bank)} · ${names[e.type]}</small></div></div>`).join("") || `<div class="empty-state">暂无近期事项</div>`;
  }

  function renderCardStrip() {
    $("#card-strip").innerHTML = activeCards().slice(0, 8).map((c) => `<div class="credit-card" style="--card-color:${c.color || colors[0]}"><small>${safe(c.bank)} · ${safe(getNetworks(c).join(" / "))}</small><strong>${safe(c.name)}</strong><span>${money(getEffectiveLimit(c))}${c.limitMode === "shared" ? " · 共享" : ""}</span></div>`).join("") || `<div class="empty-state">暂无启用卡片</div>`;
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
      const haystack = [c.name, c.bank, c.holder, ...getNetworks(c), c.tier, c.creditGroupName, c.cardRole === "supplementary" ? "副卡" : "主卡", ...(c.benefits || [])].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (status === "all" || c.status === status) && (bank === "all" || c.bank === bank);
    });
    if (sort === "limit-desc") result.sort((a, b) => getEffectiveLimit(b) - getEffectiveLimit(a));
    else if (sort === "payment") result.sort((a, b) => a.paymentDay - b.paymentDay);
    else if (sort === "bank") result.sort((a, b) => a.bank.localeCompare(b.bank, "zh-CN"));
    return result;
  }

  function renderTable() {
    const result = filteredCards();
    $("#table-summary").textContent = `显示 ${result.length} / ${cards.length} 张卡片 · 去重额度 ${money(totalCreditLimit(result))}`;
    $("#table-empty").hidden = result.length > 0;
    $("#card-table-body").innerHTML = result.map((c) => {
      const customSort = $("#sort-select").value === "custom";
      const roleLabel = c.cardRole === "supplementary" ? "副卡" : "主卡";
      const limitNote = c.limitMode === "shared" ? c.creditGroupName || "共享额度" : "独立额度";
      const feeBadge = Number(c.annualFee) <= 0 ? `<span class="badge green">免年费</span>` : c.feeType === "term_free" ? `<span class="badge green">${c.feeExpiry ? `期免至 ${safe(c.feeExpiry)}` : "有效期内免"}</span>` : c.feeType === "lifetime_free" ? `<span class="badge green">终身免年费</span>` : c.feeType === "rigid" ? `<span class="badge gray">刚性 ${money(c.annualFee)}</span>` : c.feeWaiverCompleted ? `<span class="badge green">已完成减免</span>` : `<span class="badge">减免待完成</span>`;
      return `<tr data-card-id="${safe(c.id)}"><td><div class="cell-title"><button type="button" class="drag-handle" draggable="${customSort}" title="${customSort ? "按住并上下拖动排序" : "切换到自定义排序后可拖动"}" aria-label="拖动 ${safe(c.name)} 排序" ${customSort ? "" : "disabled"}>⋮⋮</button><span class="cell-swatch" style="--card-color:${c.color || colors[0]}"></span><div><strong>${safe(c.name)}</strong><small>${safe(c.tier || "未设置等级")} · ${roleLabel}</small></div></div></td><td><div class="muted-stack"><strong>${safe(c.bank)}</strong><span>${safe(c.holder || "未设置")}</span></div></td><td>${safe(getNetworks(c).join(" / "))}</td><td><div class="muted-stack"><strong>${money(getEffectiveLimit(c))}</strong><span>${safe(limitNote)}</span></div></td><td><div class="muted-stack"><strong>${c.billDay} 日 / ${c.paymentDay} 日</strong><span>账单 / 还款</span></div></td><td>${feeBadge}</td><td><span class="badge ${c.status === "active" ? "green" : "gray"}">${c.status === "active" ? "使用中" : "已停用"}</span></td><td><div class="row-actions"><button data-edit="${safe(c.id)}" title="编辑">✎</button></div></td></tr>`;
    }).join("");
    $$('[data-edit]').forEach((button) => button.addEventListener("click", () => openCardDialog(button.dataset.edit)));
    bindCardSorting();
  }

  function persistVisibleOrder() {
    const visibleIds = $$("#card-table-body tr[data-card-id]").map((row) => row.dataset.cardId);
    const visibleSet = new Set(visibleIds);
    const byId = new Map(cards.map((card) => [card.id, card]));
    let index = 0;
    const reordered = cards.map((card) => visibleSet.has(card.id) ? byId.get(visibleIds[index++]) : card);
    if (reordered.some((card, position) => card.id !== cards[position].id)) {
      cards = reordered;
      saveCards("卡片顺序已保存");
    }
  }

  function bindCardSorting() {
    if ($("#sort-select").value !== "custom") return;
    const body = $("#card-table-body");
    let draggedRow = null;

    const moveRowToPointer = (row, clientY) => {
      const nextRow = [...body.querySelectorAll("tr[data-card-id]")]
        .filter((candidate) => candidate !== row)
        .find((candidate) => clientY < candidate.getBoundingClientRect().top + candidate.offsetHeight / 2);
      body.insertBefore(row, nextRow || null);
    };

    $$(".drag-handle").forEach((handle) => {
      handle.addEventListener("dragstart", (event) => {
        draggedRow = handle.closest("tr");
        draggedRow.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedRow.dataset.cardId);
      });
      handle.addEventListener("dragend", () => {
        draggedRow?.classList.remove("dragging");
        draggedRow = null;
        persistVisibleOrder();
      });

      let touchRow = null;
      let touchStartY = 0;
      let touchMoved = false;
      handle.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        touchRow = handle.closest("tr");
        touchStartY = event.clientY;
        touchMoved = false;
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!touchRow) return;
        if (!touchMoved && Math.abs(event.clientY - touchStartY) < 5) return;
        touchMoved = true;
        touchRow.classList.add("dragging");
        moveRowToPointer(touchRow, event.clientY);
      });
      const finishTouchDrag = (event) => {
        if (!touchRow) return;
        touchRow.classList.remove("dragging");
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        const changed = touchMoved;
        touchRow = null;
        touchMoved = false;
        if (changed) persistVisibleOrder();
      };
      handle.addEventListener("pointerup", finishTouchDrag);
      handle.addEventListener("pointercancel", finishTouchDrag);
    });

    body.ondragover = (event) => {
      if (!draggedRow) return;
      event.preventDefault();
      moveRowToPointer(draggedRow, event.clientY);
    };
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
    const eventNames = { bill: "账单", payment: "还款", "annual-fee": "年费" };
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const dayEvents = events.filter((e) => e.date.toDateString() === date.toDateString());
      const classes = ["calendar-day", date.getMonth() !== month ? "outside" : "", date.toDateString() === today.toDateString() ? "today" : ""].filter(Boolean).join(" ");
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const expanded = expandedCalendarDays.has(dayKey);
      const visibleEvents = expanded ? dayEvents : dayEvents.slice(0, 3);
      const toggle = dayEvents.length > 3 ? `<button type="button" class="day-event event-toggle" data-expand-day="${dayKey}">${expanded ? "收起" : `+${dayEvents.length - 3} 展开`}</button>` : "";
      cells.push(`<div class="${classes}"><span class="day-num">${date.getDate()}</span><div class="day-events">${visibleEvents.map((e) => `<span class="day-event ${e.type}" title="${safe(e.label)}">${safe(e.card.name)} · ${eventNames[e.type]}</span>`).join("")}${toggle}</div></div>`);
    }
    $("#calendar-grid").innerHTML = cells.join("");
    $$('[data-expand-day]').forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.expandDay;
      if (expandedCalendarDays.has(key)) expandedCalendarDays.delete(key); else expandedCalendarDays.add(key);
      renderCalendar();
    }));

    const reminderNames = { bill: "账单日", payment: "还款日", "annual-fee": "年费收取日" };
    const sortedEvents = [...events].sort((a, b) => a.date - b.date || a.card.name.localeCompare(b.card.name, "zh-CN"));
    const pageCount = Math.max(1, Math.ceil(sortedEvents.length / REMINDERS_PER_PAGE));
    reminderPage = Math.min(reminderPage, pageCount - 1);
    const pageEvents = sortedEvents.slice(reminderPage * REMINDERS_PER_PAGE, (reminderPage + 1) * REMINDERS_PER_PAGE);
    $("#month-reminders").innerHTML = pageEvents.map((e) => `<div class="reminder-item ${e.type}"><strong>${e.date.getDate()} 日 · ${safe(e.card.name)}</strong><span>${safe(e.bank)} · ${reminderNames[e.type]}</span></div>`).join("") || `<div class="empty-state">本月暂无提醒</div>`;
    $("#reminder-page").textContent = `${reminderPage + 1} / ${pageCount}`;
    $("#reminder-prev").disabled = reminderPage === 0;
    $("#reminder-next").disabled = reminderPage >= pageCount - 1;
    $("#reminder-pagination").hidden = pageCount <= 1;
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

  function populateCreditGroupOptions(selectedId = "") {
    const select = $("#card-credit-group");
    const bank = $("#card-bank").value.trim();
    const editingId = $("#card-id").value;
    const groups = getCreditGroups().filter((group) => !bank || group.bank === bank);
    const standalonePrimaryCards = cards.filter((card) => card.id !== editingId && card.cardRole !== "supplementary" && card.limitMode !== "shared" && (!bank || card.bank === bank));
    select.innerHTML = `<option value="new">＋ 新建共享额度组</option>${groups.map((group) => `<option value="${safe(group.id)}">${safe(group.name)} · ${money(group.limit)}</option>`).join("")}${standalonePrimaryCards.map((card) => `<option value="card:${safe(card.id)}">与“${safe(card.name)}”建立共享 · ${money(getEffectiveLimit(card))}</option>`).join("")}`;
    select.value = groups.some((group) => group.id === selectedId) || standalonePrimaryCards.some((card) => `card:${card.id}` === selectedId) ? selectedId : "new";
  }

  function populatePrimaryCardOptions(selectedId = "") {
    const select = $("#card-primary-card");
    const bank = $("#card-bank").value.trim();
    const editingId = $("#card-id").value;
    const primaryCards = cards.filter((card) => card.id !== editingId && card.cardRole !== "supplementary" && (!bank || card.bank === bank));
    const emptyLabel = bank ? "请选择同银行主卡" : "请先填写银行渠道";
    select.innerHTML = `<option value="">${emptyLabel}</option>${primaryCards.map((card) => `<option value="${safe(card.id)}">${safe(card.name)} · ${safe(card.holder || "未设置持卡人")} · ${money(getEffectiveLimit(card))}</option>`).join("")}`;
    select.value = primaryCards.some((card) => card.id === selectedId) ? selectedId : "";
  }

  function applyCreditGroupSelection() {
    const groupId = $("#card-credit-group").value;
    const group = getCreditGroups().find((item) => item.id === groupId);
    const standaloneCard = groupId.startsWith("card:") ? cards.find((card) => card.id === groupId.slice(5)) : null;
    if (group) {
      $("#card-group-name").value = group.name;
      $("#card-shared-limit").value = group.limit;
    } else if (standaloneCard) {
      $("#card-group-name").value = `${standaloneCard.bank}共享额度`;
      $("#card-shared-limit").value = getEffectiveLimit(standaloneCard);
    } else if (!$("#card-group-name").value.trim()) {
      $("#card-group-name").value = `${$("#card-bank").value.trim() || "信用卡"}共享额度`;
    }
  }

  function updateRelationPreview() {
    const parent = cards.find((card) => card.id === $("#card-primary-card").value);
    const preview = $("#relation-preview");
    if (!parent) {
      preview.innerHTML = `<span>选择主卡后，副卡将自动共享其额度，持卡人可以不同。</span>`;
      return;
    }
    const relation = parent.limitMode === "shared" ? parent.creditGroupName : "将为主卡自动建立共享额度组";
    preview.innerHTML = `<i>↳</i><div><strong>${safe(parent.name)}</strong><span>${safe(parent.holder || "未设置持卡人")} · ${safe(relation)} · ${money(getEffectiveLimit(parent))}</span></div>`;
  }

  function updateCreditForm() {
    const role = getChoiceValue("card-role") || "primary";
    if (role === "supplementary") setChoiceValue("limit-mode", "shared");
    const mode = getChoiceValue("limit-mode") || "individual";
    const supplementary = role === "supplementary";
    $("#limit-mode-row").hidden = supplementary;
    $("#individual-limit-panel").hidden = supplementary || mode !== "individual";
    $("#primary-shared-panel").hidden = supplementary || mode !== "shared";
    $("#supplementary-panel").hidden = !supplementary;
    $("#limit-section-help").textContent = supplementary ? "关联主卡后自动共享额度，持卡人可不同" : "设置独立额度或加入共享额度组";
    $("#card-limit").required = !supplementary && mode === "individual";
    $("#card-group-name").required = !supplementary && mode === "shared";
    $("#card-shared-limit").required = !supplementary && mode === "shared";
    $("#card-primary-card").required = supplementary;
    if (supplementary) {
      const selected = $("#card-primary-card").value;
      populatePrimaryCardOptions(selected);
      updateRelationPreview();
    } else if (mode === "shared") {
      const selected = $("#card-credit-group").value;
      populateCreditGroupOptions(selected);
      applyCreditGroupSelection();
    }
  }

  function updateFeeForm() {
    const feeType = getChoiceValue("fee-type");
    const waivable = feeType === "waivable";
    const termFree = feeType === "term_free";
    $("#waiver-panel").hidden = !waivable;
    $("#term-free-panel").hidden = !termFree;
    $("#card-fee-method").required = waivable;
    $("#card-fee-expiry").required = termFree;
  }

  function openCardDialog(id = null) {
    const card = cards.find((c) => c.id === id);
    $("#dialog-title").textContent = card ? "编辑信用卡" : "添加信用卡";
    $("#delete-card-btn").hidden = !card;
    $("#card-id").value = card?.id || "";
    $("#card-name").value = card?.name || "";
    $("#card-bank").value = card?.bank || "";
    $("#card-holder").value = card?.holder || "本人";
    setChoiceValue("card-role", card?.cardRole || "primary");
    setChoiceValue("limit-mode", card?.limitMode || "individual");
    const selectedNetworks = new Set(card ? getNetworks(card) : ["银联"]);
    $$('input[name="card-network"]').forEach((input) => { input.checked = selectedNetworks.has(input.value); });
    updateNetworkSelectLabel();
    $("#card-network-select").open = false;
    $("#card-tier").value = card?.tier || "";
    $("#card-limit").value = card?.limit || 0;
    populateCreditGroupOptions(card?.creditGroupId || "");
    $("#card-group-name").value = card?.creditGroupName || `${card?.bank || "信用卡"}共享额度`;
    $("#card-shared-limit").value = card?.sharedLimit || card?.limit || 0;
    populatePrimaryCardOptions(card?.primaryCardId || "");
    $("#card-bill-day").value = card?.billDay || 1;
    $("#card-payment-day").value = card?.paymentDay || 20;
    $("#card-fee").value = card?.annualFee || 0;
    setChoiceValue("fee-type", card?.feeType || "rigid");
    setChoiceValue("fee-status", card?.feeWaiverCompleted ? "completed" : "pending");
    $("#card-fee-method").value = card?.feeWaiverMethod || "";
    $("#card-fee-expiry").value = card?.feeExpiry || "";
    $("#card-fee-date").value = card?.feeDate || "";
    $("#card-status").value = card?.status || "active";
    $("#card-benefits").value = (card?.benefits || []).join("，");
    $("#card-notes").value = card?.notes || "";
    updateCreditForm();
    updateFeeForm();
    $("#card-dialog").showModal();
    $("#card-name").focus();
  }

  function collectFormCard() {
    const existing = cards.find((c) => c.id === $("#card-id").value);
    const networks = $$('input[name="card-network"]:checked').map((input) => input.value);
    const cardRole = getChoiceValue("card-role") || "primary";
    let limitMode = getChoiceValue("limit-mode") || "individual";
    let creditGroupId = "", creditGroupName = "", sharedLimit = 0, primaryCardId = "";

    if (cardRole === "supplementary") {
      const primary = cards.find((card) => card.id === $("#card-primary-card").value);
      limitMode = "shared";
      primaryCardId = primary.id;
      if (primary.limitMode !== "shared" || !primary.creditGroupId) {
        primary.limitMode = "shared";
        primary.creditGroupId = `group-${uid()}`;
        primary.creditGroupName = `${primary.bank}共享额度`;
        primary.sharedLimit = Number(primary.limit || 0);
      }
      creditGroupId = primary.creditGroupId;
      creditGroupName = primary.creditGroupName;
      sharedLimit = getEffectiveLimit(primary);
    } else if (limitMode === "shared") {
      const selectedGroupId = $("#card-credit-group").value;
      creditGroupName = $("#card-group-name").value.trim();
      sharedLimit = Number($("#card-shared-limit").value) || 0;
      const standaloneCard = selectedGroupId.startsWith("card:") ? cards.find((card) => card.id === selectedGroupId.slice(5)) : null;
      if (standaloneCard) {
        creditGroupId = `group-${uid()}`;
        standaloneCard.limitMode = "shared";
        standaloneCard.creditGroupId = creditGroupId;
        standaloneCard.creditGroupName = creditGroupName;
        standaloneCard.sharedLimit = sharedLimit;
        standaloneCard.limit = sharedLimit;
      } else {
        creditGroupId = selectedGroupId === "new" ? `group-${uid()}` : selectedGroupId;
      }
    }

    const feeType = getChoiceValue("fee-type") || "rigid";
    return {
      id: existing?.id || uid(), name: $("#card-name").value.trim(), bank: $("#card-bank").value.trim(), holder: $("#card-holder").value.trim(),
      networks, network: networks[0] || "其他", tier: $("#card-tier").value.trim(), limit: limitMode === "individual" ? Number($("#card-limit").value) || 0 : sharedLimit,
      cardRole, limitMode, creditGroupId, creditGroupName, sharedLimit, primaryCardId,
      billDay: Number($("#card-bill-day").value) || 1, paymentDay: Number($("#card-payment-day").value) || 1,
      annualFee: Number($("#card-fee").value) || 0, feeType,
      feeWaiverMethod: feeType === "waivable" ? $("#card-fee-method").value.trim() : "",
      feeWaiverCompleted: feeType === "waivable" && getChoiceValue("fee-status") === "completed",
      feeExpiry: feeType === "term_free" ? $("#card-fee-expiry").value.trim() : "",
      feeDate: $("#card-fee-date").value, status: $("#card-status").value,
      benefits: $("#card-benefits").value.split(/[，,]/).map((x) => x.trim()).filter(Boolean), notes: $("#card-notes").value.trim(),
      color: existing?.color || colors[cards.length % colors.length]
    };
  }

  function syncCreditGroup(sourceCard) {
    if (sourceCard.limitMode !== "shared" || !sourceCard.creditGroupId) return;
    cards.forEach((card) => {
      if (card.creditGroupId === sourceCard.creditGroupId) {
        card.limitMode = "shared";
        card.creditGroupName = sourceCard.creditGroupName;
        card.sharedLimit = sourceCard.sharedLimit;
        card.limit = sourceCard.sharedLimit;
      }
    });
  }

  function exportJson() {
    download(`cardpilot-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "CardPilot", version: 4, exportedAt: new Date().toISOString(), cards }, null, 2), "application/json");
    toast("备份已导出");
  }

  function exportCsv() {
    const headers = ["卡片名称", "银行", "持卡人", "卡片类型", "卡组织", "等级", "额度方式", "额度组", "固定/共享额度", "账单日", "还款日", "年费", "年费类型", "减免状态", "减免方法", "期免有效期", "年费日期", "权益", "状态", "备注"];
    const feeTypeLabels = { rigid: "刚性年费", waivable: "可减免年费", term_free: "期免", lifetime_free: "终免" };
    const rows = cards.map((c) => [c.name, c.bank, c.holder, c.cardRole === "supplementary" ? "副卡" : "主卡", getNetworks(c).join("、"), c.tier, c.limitMode === "shared" ? "共享额度" : "独立额度", c.creditGroupName, getEffectiveLimit(c), c.billDay, c.paymentDay, c.annualFee, feeTypeLabels[c.feeType] || "刚性年费", c.feeType === "waivable" ? c.feeWaiverCompleted ? "已完成" : "未完成" : "不适用", c.feeWaiverMethod, c.feeExpiry, c.feeDate, (c.benefits || []).join("、"), c.status === "active" ? "使用中" : "已停用", c.notes]);
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
        const valid = incoming.filter((c) => c && typeof c.name === "string" && typeof c.bank === "string").map((c, index) => normalizeCard({ ...c, id: c.id || uid(), color: c.color || colors[index % colors.length], benefits: Array.isArray(c.benefits) ? c.benefits : [] }));
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
    $("#card-limit").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, ""); });
    $("#card-shared-limit").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, ""); });
    $("#card-fee-expiry").addEventListener("input", (event) => {
      const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
      event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });
    $$('input[name="card-role"], input[name="limit-mode"]').forEach((input) => input.addEventListener("change", updateCreditForm));
    $$('input[name="fee-type"]').forEach((input) => input.addEventListener("change", updateFeeForm));
    $("#card-credit-group").addEventListener("change", applyCreditGroupSelection);
    $("#card-primary-card").addEventListener("change", updateRelationPreview);
    $("#card-bank").addEventListener("change", () => {
      if (getChoiceValue("card-role") === "supplementary") {
        populatePrimaryCardOptions($("#card-primary-card").value);
        updateRelationPreview();
      } else if (getChoiceValue("limit-mode") === "shared") {
        const selectedGroup = $("#card-credit-group").value;
        populateCreditGroupOptions(selectedGroup);
        if ($("#card-credit-group").value === "new") $("#card-group-name").value = `${$("#card-bank").value.trim() || "信用卡"}共享额度`;
      }
    });
    $$('input[name="card-network"]').forEach((input) => input.addEventListener("change", updateNetworkSelectLabel));
    document.addEventListener("click", (event) => {
      const select = $("#card-network-select");
      if (select.open && !select.contains(event.target)) select.open = false;
    });
    $("#card-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      if (!$$('input[name="card-network"]:checked').length) { $("#card-network-select").open = true; toast("请至少选择一个卡组织"); return; }
      const card = collectFormCard();
      const index = cards.findIndex((c) => c.id === card.id);
      if (index >= 0) cards[index] = card; else cards.push(card);
      syncCreditGroup(card);
      $("#card-dialog").close(); saveCards(index >= 0 ? "卡片已更新" : "卡片已添加");
    });
    $("#delete-card-btn").addEventListener("click", () => {
      const id = $("#card-id").value;
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const dependentCount = cards.filter((item) => item.primaryCardId === id).length;
      const message = dependentCount ? `确认删除“${card.name}”？关联的 ${dependentCount} 张副卡将转为主卡并继续共享额度。` : `确认删除“${card.name}”？此操作无法撤销。`;
      if (confirm(message)) {
        cards = cards.filter((item) => item.id !== id).map((item) => item.primaryCardId === id ? { ...item, cardRole: "primary", primaryCardId: "" } : item);
        $("#card-dialog").close(); saveCards("卡片已删除");
      }
    });
    ["#search-input", "#status-filter", "#bank-filter", "#sort-select"].forEach((selector) => $(selector).addEventListener(selector === "#search-input" ? "input" : "change", renderTable));
    $("#export-btn").addEventListener("click", exportJson);
    $("#export-csv-btn").addEventListener("click", exportCsv);
    $("#import-btn").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", (event) => event.target.files[0] && importJson(event.target.files[0]));
    $("#prev-month").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() - 1); reminderPage = 0; expandedCalendarDays.clear(); renderCalendar(); });
    $("#next-month").addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() + 1); reminderPage = 0; expandedCalendarDays.clear(); renderCalendar(); });
    $("#today-btn").addEventListener("click", () => { calendarDate = new Date(); reminderPage = 0; expandedCalendarDays.clear(); renderCalendar(); });
    $("#reminder-prev").addEventListener("click", () => { if (reminderPage > 0) { reminderPage -= 1; renderCalendar(); } });
    $("#reminder-next").addEventListener("click", () => { reminderPage += 1; renderCalendar(); });
    $("#theme-toggle").addEventListener("click", () => { const dark = document.documentElement.dataset.theme === "dark"; document.documentElement.dataset.theme = dark ? "" : "dark"; localStorage.setItem(THEME_KEY, dark ? "light" : "dark"); });
    bindJumpButtons();
    renderAll();
  }

  window.CardPilot = { getCards: () => structuredClone(cards), money, getMonthEvents };
  document.addEventListener("DOMContentLoaded", init);
})();
