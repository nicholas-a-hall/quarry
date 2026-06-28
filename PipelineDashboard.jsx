import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid, Legend,
} from "recharts";
import {
  Download, Upload, Plus, Trash2, RotateCcw, TrendingUp, Target,
  Layers, Wrench, Image as ImageIcon, Filter, Radio, Users, Mail,
  Send, Briefcase, Clock, ExternalLink, Pencil, X, DollarSign,
  MapPin, Search, ArrowUpDown, Star, Pin, ChevronDown, GripVertical,
} from "lucide-react";

/* ============================================================
   QUARRY — Job search pipeline (Midnight Arcade theme) v3
   Per-application records are the single source of truth.
   Every stat below rolls up from the records array.
   ============================================================ */

const T = {
  bg: "#2c313c", panel: "#333944", inset: "#252a33",
  edgeLight: "#3f4754", edgeDark: "#1c2027",
  text: "#f0f3f8", textDim: "#9aa3b2",
  cyan: "#3fc8b4", magenta: "#e06fa6", amber: "#dba14e",
  violet: "#9d92e0", green: "#5cc486", red: "#e57a72", blue: "#6f9fe0",
};
const raised = `-6px -6px 14px ${T.edgeLight}, 7px 7px 18px ${T.edgeDark}`;
const raisedSm = `-3px -3px 8px ${T.edgeLight}, 4px 4px 10px ${T.edgeDark}`;
const inset = `inset -3px -3px 8px ${T.edgeLight}66, inset 4px 4px 10px ${T.edgeDark}`;

// Status: the pipeline stages an application moves through.
// "responded" is derived (interview|offer|rejected), not a stored status.
const STATUSES = [
  { key: "applied",   label: "Applied",   color: T.cyan,    sentiment: "neutral" },
  { key: "interview", label: "Interview", color: T.green,   sentiment: "positive" },
  { key: "offer",     label: "Offer",     color: T.amber,   sentiment: "positive" },
  { key: "rejected",  label: "Rejected",  color: T.red,     sentiment: "negative" },
  { key: "withdrawn", label: "Withdrawn", color: T.violet,  sentiment: "neutral" },
  { key: "noResponse",label: "No Response",color: T.textDim,sentiment: "neutral" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

const SOURCES = [
  { key: "referral", label: "Referral / Networking", short: "Referral", icon: Users,    color: T.violet },
  { key: "recruiter",label: "Recruiter (inbound)",   short: "Recruiter",icon: Mail,     color: T.red },
  { key: "direct",   label: "Direct / Cold",         short: "Direct",   icon: Send,     color: T.amber },
  { key: "board",    label: "Job Board",             short: "Board",    icon: Briefcase,color: T.cyan },
];
const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.key, s]));

const isoWeekOf = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - ys) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  a && b ? Math.round((new Date(b) - new Date(a)) / 86400000) : null;
const STALE_DAYS = 14;
// A record is stale if still in "applied" and applied more than STALE_DAYS ago.
const isStale = (r) =>
  r.status === "applied" &&
  r.appliedDate &&
  daysBetween(r.appliedDate, today()) > STALE_DAYS;
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const fmtMoney = (n) => (n ? "$" + Math.round(n / 1000) + "k" : "—");

const uid = () => Math.random().toString(36).slice(2, 9);

// each record is one application
const blankRecord = () => ({
  id: uid(),
  company: "", role: "", category: "", source: "direct",
  salaryMin: "", salaryMax: "", location: "", remote: "remote",
  status: "applied",
  skills: [], link: "",
  appliedDate: today(), responseDate: "",
  notes: "", starred: false,
});

const REMOTE_OPTS = ["remote", "hybrid", "onsite"];


const SEED = { categories: [], records: [] };

// Reorderable data columns for the applications table.
// Each: key, label, sortKey (null = not sortable), render(r, ctx) -> cell content.
// Star+Edit are pinned far-left and Trash far-right, outside this list.
const COLUMNS = [
  { key: "company", label: "Company", sortKey: "company",
    render: (r) => (
      <>
        {r.company || "—"}
        {r.link && <a href={r.link} target="_blank" rel="noreferrer" style={s.jdLink} title="Open job posting"><ExternalLink size={12} /></a>}
      </>
    ), tdStyle: () => s.tdCompany },
  { key: "role", label: "Role", sortKey: "role",
    render: (r) => r.role || "—", tdStyle: () => s.tdRole },
  { key: "category", label: "Category", sortKey: "category",
    render: (r) => r.category || "—" },
  { key: "source", label: "Source", sortKey: "source",
    render: (r, { sc }) => <span style={{ ...s.srcPill, color: sc.color, borderColor: sc.color + "44" }}>{sc.short}</span> },
  { key: "salary", label: "Salary", sortKey: "salaryMax",
    render: (r) => (r.salaryMin || r.salaryMax) ? `${fmtMoney(+r.salaryMin)}–${fmtMoney(+r.salaryMax)}` : "—" },
  { key: "location", label: "Location", sortKey: "location",
    render: (r) => <>{r.location || "—"}<span style={s.remoteTag}>{r.remote}</span></> },
  { key: "status", label: "Status", sortKey: "status",
    render: (r, { st, stale, ageDays }) => (
      <>
        <span style={{ ...s.statusPill, background: st.color + "22", color: st.color }}>{st.label}</span>
        {stale && <span style={s.staleBadge} title={`No response in ${ageDays} days`}>STALE</span>}
      </>
    ) },
  { key: "applied", label: "Applied", sortKey: "appliedDate",
    render: (r) => r.appliedDate?.slice(5) || "—" },
  { key: "resp", label: "Resp.", sortKey: null,
    render: (r, { respDays }) => respDays != null ? `${respDays}d` : "—" },
  { key: "skills", label: "Skills", sortKey: null,
    render: (r) => (
      <>
        {r.skills.slice(0, 3).map((sk) => <span key={sk} style={s.skillTag}>{sk}</span>)}
        {r.skills.length > 3 && <span style={s.skillMore}>+{r.skills.length - 3}</span>}
      </>
    ), tdStyle: () => s.tdSkills },
];
const DEFAULT_COL_ORDER = COLUMNS.map((c) => c.key);
const COL_MAP = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

export default function PipelineDashboard() {
  const [data, setData] = useState(SEED);
  const [editing, setEditing] = useState(null); // record being edited, or null
  const [catFilter, setCatFilter] = useState("all");
  const [srcFilter, setSrcFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("appliedDate");
  const [sortDir, setSortDir] = useState("desc");
  const [colOrder, setColOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("quarry-colorder"));
      if (Array.isArray(saved)) {
        const known = saved.filter((k) => COL_MAP[k]);
        const missing = DEFAULT_COL_ORDER.filter((k) => !known.includes(k));
        return [...known, ...missing];
      }
    } catch (e) {}
    return DEFAULT_COL_ORDER;
  });
  const dragCol = useRef(null);
  useEffect(() => {
    try { localStorage.setItem("quarry-colorder", JSON.stringify(colOrder)); } catch (e) {}
  }, [colOrder]);
  const onColDrop = (targetKey) => {
    const from = dragCol.current;
    dragCol.current = null;
    if (!from || from === targetKey) return;
    setColOrder((order) => {
      const next = order.filter((k) => k !== from);
      const idx = next.indexOf(targetKey);
      next.splice(idx, 0, from);
      return next;
    });
  };
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef(null);
  const cardRef = useRef(null);

  const cats = data.categories;
  const records = data.records;
  const starred = useMemo(() => records.filter((r) => r.starred), [records]);

  // ---- record mutations ----
  const saveRecord = (rec) => {
    setData((d) => {
      const exists = d.records.some((r) => r.id === rec.id);
      // auto-add new category if typed
      const categories = d.categories.includes(rec.category)
        ? d.categories : [...d.categories, rec.category];
      return {
        ...d, categories,
        records: exists
          ? d.records.map((r) => (r.id === rec.id ? rec : r))
          : [...d.records, rec],
      };
    });
    setEditing(null);
  };
  const deleteRecord = (id) =>
    setData((d) => ({ ...d, records: d.records.filter((r) => r.id !== id) }));
  const toggleStar = (id) =>
    setData((d) => ({ ...d, records: d.records.map((r) => r.id === id ? { ...r, starred: !r.starred } : r) }));

  // ---- JSON ----
  const exportJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quarry-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    } catch (err) {
      alert("Download blocked by this environment. Open the page outside the preview to export.");
    }
  };
  const importJSON = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (!p.records) throw new Error("missing records array");
        if (!p.categories) p.categories = [...new Set(p.records.map((x) => x.category))];
        setData(p);
      } catch (err) { alert("Not a valid pipeline file: " + err.message); }
    };
    r.readAsText(f); e.target.value = "";
  };
  const reset = () => { if (confirm("Reset to seed example?")) setData(SEED); };

  // ============ FILTERED RECORD SET (drives every stat) ============
  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) +
    (srcFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const filtered = useMemo(() => {
    let rs = records;
    if (catFilter !== "all") rs = rs.filter((r) => r.category === catFilter);
    if (srcFilter !== "all") rs = rs.filter((r) => r.source === srcFilter);
    if (statusFilter !== "all") rs = rs.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter((r) =>
        r.company.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.skills.some((s) => s.toLowerCase().includes(q)));
    }
    return rs;
  }, [records, catFilter, srcFilter, statusFilter, search]);

  const sorted = useMemo(() => {
    const rs = [...filtered];
    rs.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === "salaryMax") { av = +av || 0; bv = +bv || 0; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rs;
  }, [filtered, sortKey, sortDir]);

  // ---- core aggregates from filtered set ----
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const count = (st) => filtered.filter((r) => r.status === st).length;
  const totalApps = filtered.length;
  const nInterview = count("interview"), nOffer = count("offer"),
        nRejected = count("rejected"), nNoResp = count("noResponse"),
        nApplied = count("applied"), nWithdrawn = count("withdrawn");
  const reachedInterview = nInterview + nOffer;
  // employer engaged in any way (incl. cases you later withdrew from)
  const responded = nInterview + nOffer + nRejected + nWithdrawn;
  const responseRate = pct(responded, totalApps);
  const interviewRate = pct(reachedInterview, totalApps);
  const ghostRate = pct(nNoResp, totalApps);

  // computed median time-to-response from real dates
  const responseDays = useMemo(() =>
    filtered.map((r) => daysBetween(r.appliedDate, r.responseDate)).filter((v) => v != null && v >= 0),
    [filtered]);
  const medianResponse = median(responseDays);

  // active (still live) vs closed
  const activeCount = filtered.filter((r) =>
    r.status === "applied" || r.status === "interview").length;
  // stale: still in "applied" and aging past the threshold
  const staleCount = filtered.filter(isStale).length;

  // ---- chart data ----
  const sentimentData = [
    { name: "Positive", value: reachedInterview, color: T.green },
    { name: "Negative", value: nRejected, color: T.red },
    { name: "Withdrawn", value: nWithdrawn, color: T.violet },
    { name: "No response", value: nNoResp, color: T.textDim },
    { name: "Pending", value: nApplied, color: T.cyan },
  ].filter((d) => d.value > 0);

  const sourceData = useMemo(() =>
    SOURCES.map((sc) => {
      const rs = records.filter((r) => r.source === sc.key
        && (catFilter === "all" || r.category === catFilter));
      const app = rs.length;
      const resp = rs.filter((r) => ["interview", "offer", "rejected", "withdrawn"].includes(r.status)).length;
      const pos = rs.filter((r) => ["interview", "offer"].includes(r.status)).length;
      return { source: sc.short, key: sc.key, color: sc.color, applied: app,
        responseRate: pct(resp, app), positiveRate: pct(pos, app) };
    }), [records, catFilter]);

  const catData = useMemo(() =>
    cats.map((c) => {
      const rs = records.filter((r) => r.category === c
        && (srcFilter === "all" || r.source === srcFilter));
      const app = rs.length;
      const resp = rs.filter((r) => ["interview", "offer", "rejected", "withdrawn"].includes(r.status)).length;
      const pos = rs.filter((r) => ["interview", "offer"].includes(r.status)).length;
      return { category: c, applied: app,
        responseRate: pct(resp, app), positiveRate: pct(pos, app) };
    }).filter((d) => d.applied > 0), [records, cats, srcFilter]);

  const funnel = [
    { stage: "Applied", value: totalApps, color: T.cyan },
    { stage: "Responded", value: responded, color: T.violet },
    { stage: "Interview", value: reachedInterview, color: T.green },
  ];

  // weekly trend from applied dates
  const trendData = useMemo(() => {
    const byWeek = {};
    filtered.forEach((r) => {
      const wk = isoWeekOf(r.appliedDate); if (!wk) return;
      byWeek[wk] = byWeek[wk] || { week: wk, applied: 0, interview: 0, offer: 0, rejected: 0, noResponse: 0 };
      byWeek[wk].applied += 1;
      if (r.status !== "applied") byWeek[wk][r.status] = (byWeek[wk][r.status] || 0) + 1;
    });
    return Object.values(byWeek).sort((a, b) => a.week.localeCompare(b.week))
      .map((w) => ({ ...w, week: "W" + w.week.split("-W")[1] }));
  }, [filtered]);

  // salary insight (uses max where available)
  const salaryStats = useMemo(() => {
    const vals = filtered.map((r) => +r.salaryMax || +r.salaryMin || 0).filter((v) => v > 0);
    if (!vals.length) return null;
    return {
      median: median(vals),
      min: Math.min(...vals), max: Math.max(...vals),
    };
  }, [filtered]);

  // skills demand — how often each skill appears across applied roles
  const skillDemand = useMemo(() => {
    const m = {};
    filtered.forEach((r) => r.skills.forEach((sk) => {
      m[sk] = m[sk] || { name: sk, count: 0, positive: 0 };
      m[sk].count += 1;
      if (["interview", "offer"].includes(r.status)) m[sk].positive += 1;
    }));
    return Object.values(m).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [filtered]);
  const maxSkillCount = Math.max(1, ...skillDemand.map((s) => s.count));

  const exportPNG = useCallback(async () => {
    const node = cardRef.current; if (!node) return;
    setExporting(true);
    try {
      const w = node.offsetWidth, h = node.offsetHeight, scale = 2;
      const clone = node.cloneNode(true);
      const inlineAll = (src, dst) => {
        const cs = window.getComputedStyle(src);
        let css = "";
        for (let i = 0; i < cs.length; i++) css += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
        dst.setAttribute("style", css);
        for (let i = 0; i < src.children.length; i++) inlineAll(src.children[i], dst.children[i]);
      };
      inlineAll(node, clone);
      const xml = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${xml}</div></foreignObject></svg>`;
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement("canvas");
      cv.width = w * scale; cv.height = h * scale;
      const ctx = cv.getContext("2d");
      ctx.scale(scale, scale); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.download = "quarry-summary.png"; a.href = cv.toDataURL("image/png"); a.click();
    } catch (e) { alert("Export failed — try again or screenshot."); }
    finally { setExporting(false); }
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  return (
    <div style={s.shell}>
      <style>{CSS}</style>

      <header style={s.topbar}>
        <div style={s.brand}>
          <svg width="26" height="26" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
            <rect width="64" height="64" rx="15" fill={T.panel} stroke={T.edgeLight} strokeWidth="1.5" />
            <path d="M16 18 L48 18 L48 26 L16 26 Z" fill="#414956" />
            <path d="M20 26 L48 26 L41 36 L27 36 Z" fill="#333a45" />
            <path d="M27 36 L41 36 L35 47 L33 47 Z" fill="#252a33" />
            <path d="M32 19 L34 26 L31 36 L34 46" fill="none" stroke={T.cyan} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M34 30 l5 -3 l3 5 l-4 4 l-5 -1 z" fill={T.amber} />
          </svg>
          <div>
            <div style={s.brandTitle}>QUARRY</div>
          </div>
        </div>
        <div style={s.topActions}>
          <input type="file" accept="application/json" ref={fileRef} onChange={importJSON} style={{ display: "none" }} />
          <IconBtn onClick={() => setEditing(blankRecord())} icon={Plus} label="Log application" accent />
          <IconBtn onClick={() => fileRef.current?.click()} icon={Upload} label="Import" />
          <IconBtn onClick={exportJSON} icon={Download} label="Export JSON" />
          <IconBtn onClick={exportPNG} icon={ImageIcon} label={exporting ? "Rendering…" : "PNG"} />
          <IconBtn onClick={reset} icon={RotateCcw} label="" />
        </div>
      </header>

      {/* FILTER BAR */}
      <div style={s.filterBar}>
        <button className="filterToggle" style={s.filterHeader} onClick={() => setFiltersOpen((o) => !o)}>
          <Filter size={14} color={T.textDim} />
          <span style={s.filterHeaderLbl}>Filters</span>
          {activeFilterCount > 0 && <span style={s.filterCount}>{activeFilterCount}</span>}
          {!filtersOpen && activeFilterCount > 0 && (
            <span style={s.filterSummary}>
              {[catFilter !== "all" && catFilter,
                srcFilter !== "all" && SOURCE_MAP[srcFilter]?.short,
                statusFilter !== "all" && STATUS_MAP[statusFilter]?.label,
                search.trim() && `"${search.trim()}"`].filter(Boolean).join(" · ")}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {activeFilterCount > 0 && (
            <span className="filterClearAll" style={s.filterClearAll}
              onClick={(e) => { e.stopPropagation(); setCatFilter("all"); setSrcFilter("all"); setStatusFilter("all"); setSearch(""); }}>
              Clear all
            </span>
          )}
          <ChevronDown size={16} color={T.textDim}
            style={{ transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
        </button>

        {filtersOpen && (
          <div style={s.filterBody}>
            <div style={s.searchWrap}>
              <Search size={14} color={T.textDim} />
              <input placeholder="Search company, role, or skill…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="searchIn" style={s.searchIn} />
              {search && (
                <button className="iconbtn" style={s.searchClear} onClick={() => setSearch("")} title="Clear">
                  <X size={13} color={T.textDim} />
                </button>
              )}
            </div>

            <div style={s.filterGroup}>
              <span style={s.filterGroupLbl}>Category</span>
              <div style={s.chipRow}>
                <Chip active={catFilter === "all"} onClick={() => setCatFilter("all")} label="All" />
                {cats.map((c) => <Chip key={c} active={catFilter === c} onClick={() => setCatFilter(c)} label={c} />)}
              </div>
            </div>

            <div style={s.filterGroup}>
              <span style={s.filterGroupLbl}>Source</span>
              <div style={s.chipRow}>
                <Chip active={srcFilter === "all"} onClick={() => setSrcFilter("all")} label="All" />
                {SOURCES.map((sc) => <Chip key={sc.key} active={srcFilter === sc.key} onClick={() => setSrcFilter(sc.key)} label={sc.short} />)}
              </div>
            </div>

            <div style={s.filterGroup}>
              <span style={s.filterGroupLbl}>Status</span>
              <div style={s.chipRow}>
                <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="All" />
                {STATUSES.map((st) => <Chip key={st.key} active={statusFilter === st.key} onClick={() => setStatusFilter(st.key)} label={st.label} />)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== APPLICATIONS TABLE — the birds-eye view ===== */}
      <section style={{ ...s.card, marginBottom: 16 }}>
        <div style={s.cardHead}><Briefcase size={14} color={T.textDim} />
          <span style={s.cardTitle}>Applications ({sorted.length})</span>
        </div>
        <div style={s.tableWrap}>
          <table style={s.appTable}>
            <thead>
              <tr>
                <th style={{ ...s.th, ...s.thPin }}></th>
                {colOrder.map((key) => {
                  const col = COL_MAP[key];
                  const sortable = !!col.sortKey;
                  const active = sortable && sortKey === col.sortKey;
                  return (
                    <th key={key}
                      draggable
                      onDragStart={() => { dragCol.current = key; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onColDrop(key)}
                      onClick={() => sortable && toggleSort(col.sortKey)}
                      className="colHead"
                      style={{ ...s.th, cursor: sortable ? "pointer" : "grab", color: active ? T.cyan : T.textDim }}
                      title="Drag to reorder">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <GripVertical size={11} style={{ opacity: 0.35 }} />
                        {col.label}
                        {sortable && <ArrowUpDown size={10} style={{ opacity: active ? 1 : 0.4 }} />}
                      </span>
                    </th>
                  );
                })}
                <th style={{ ...s.th, ...s.thPinRight }}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={colOrder.length + 2} style={s.emptyRow}>No applications match. Log one with “Log application”.</td></tr>
              )}
              {sorted.map((r) => {
                const st = STATUS_MAP[r.status], sc = SOURCE_MAP[r.source];
                const respDays = daysBetween(r.appliedDate, r.responseDate);
                const stale = isStale(r);
                const ageDays = daysBetween(r.appliedDate, today());
                const ctx = { st, sc, respDays, stale, ageDays };
                return (
                  <tr key={r.id} className="appRow">
                    <td style={s.tdPin}>
                      <button className="iconbtn" style={s.miniBtn} onClick={() => toggleStar(r.id)} title={r.starred ? "Unpin" : "Pin as priority"}>
                        <Star size={12} color={r.starred ? T.amber : T.textDim} fill={r.starred ? T.amber : "none"} />
                      </button>
                      <button className="iconbtn" style={s.miniBtn} onClick={() => setEditing(r)} title="Edit">
                        <Pencil size={12} color={T.textDim} />
                      </button>
                    </td>
                    {colOrder.map((key) => {
                      const col = COL_MAP[key];
                      const tdStyle = col.tdStyle ? col.tdStyle() : s.tdSmall;
                      return <td key={key} style={tdStyle}>{col.render(r, ctx)}</td>;
                    })}
                    <td style={s.tdPinRight}>
                      <button className="iconbtn" style={s.miniBtn} onClick={() => deleteRecord(r.id)} title="Delete">
                        <Trash2 size={12} color={T.textDim} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* PINNED PRIORITY TARGETS */}
      {starred.length > 0 && (
        <section style={s.pinnedWrap}>
          <button className="filterToggle" style={{ ...s.pinnedHead, marginBottom: pinnedOpen ? 14 : 0 }} onClick={() => setPinnedOpen((o) => !o)}>
            <Pin size={13} color={T.amber} fill={T.amber} />
            <span style={s.pinnedTitle}>Priority Targets</span>
            <span style={s.pinnedCount}>{starred.length}</span>
            <span style={{ flex: 1 }} />
            <ChevronDown size={16} color={T.amber}
              style={{ transform: pinnedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
          </button>
          {pinnedOpen && (
            <div style={s.pinnedGrid}>
              {starred.map((r) => {
                const st = STATUS_MAP[r.status], sc = SOURCE_MAP[r.source];
                return (
                  <div key={r.id} style={s.pinnedCard}>
                    <div style={s.pinnedCardGlow} />
                    <div style={s.pinnedCardTop}>
                      <div style={{ minWidth: 0 }}>
                        <div style={s.pinnedCompany}>
                          {r.company}
                          {r.link && <a href={r.link} target="_blank" rel="noreferrer" style={s.jdLink}><ExternalLink size={12} /></a>}
                        </div>
                        <div style={s.pinnedRole}>{r.role}</div>
                      </div>
                      <button className="iconbtn" style={s.pinStar} onClick={() => toggleStar(r.id)} title="Unpin">
                        <Star size={15} color={T.amber} fill={T.amber} />
                      </button>
                    </div>
                    <div style={s.pinnedMeta}>
                      <span style={{ ...s.statusPill, background: st.color + "22", color: st.color }}>{st.label}</span>
                      <span style={{ ...s.srcPill, color: sc.color, borderColor: sc.color + "44" }}>{sc.short}</span>
                      {(r.salaryMin || r.salaryMax) && (
                        <span style={s.pinnedSalary}>{fmtMoney(+r.salaryMin)}–{fmtMoney(+r.salaryMax)}</span>
                      )}
                    </div>
                    {r.notes && <div style={s.pinnedNotes}>{r.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* KPI STRIP — summary stats below the applications list */}
      <div style={s.kpiRow}>
        <Kpi label="Total Applied" value={totalApps} accent={T.cyan} sub={staleCount > 0 ? `${activeCount} active · ${staleCount} stale` : `${activeCount} still active`} />
        <Kpi label="Response Rate" value={`${responseRate}%`} accent={T.violet} sub={`${responded} responded`} />
        <Kpi label="Interview Rate" value={`${interviewRate}%`} accent={T.green} sub={`${reachedInterview} reached`} />
        <Kpi label="Median Response" value={medianResponse ? `${medianResponse}d` : "—"} accent={T.blue} sub={`${responseDays.length} measured`} />
        <Kpi label="Ghost Rate" value={`${ghostRate}%`} accent={T.red} sub={`${nNoResp} silent`} />
      </div>

      {/* ===== ANALYTICS GRID ===== */}
      <div style={s.grid}>
        <Card title="Conversion by Lead Source" icon={Radio} span={2}>
          {sourceData.some((d) => d.applied > 0) ? (
            <>
              <div style={s.metricKey}>
                <span style={s.metricKeyItem}><span style={{ ...s.metricKeyDot, background: T.green }} />Positive</span>
                <span style={s.metricKeyItem}><span style={{ ...s.metricKeyDot, background: T.blue }} />Any response</span>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={sourceData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.edgeLight} vertical={false} />
                  <XAxis dataKey="source" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip {...tooltipProps} />
                  <Bar dataKey="positiveRate" name="Positive %" radius={[6, 6, 0, 0]} fill={T.green} />
                  <Bar dataKey="responseRate" name="Any response %" radius={[6, 6, 0, 0]} fill={T.blue} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : <Empty msg="Log applications across sources to compare." />}
          <div style={s.sourceVolRow}>
            {sourceData.map((d) => (
              <div key={d.key} style={s.sourceVol}>
                <span style={{ ...s.sourceVolDot, background: d.color }} />
                <span style={s.sourceVolLbl}>{d.source}</span>
                <span style={s.sourceVolNum}>{d.applied} app{d.applied === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Status Breakdown" icon={Target}>
          {sentimentData.length ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={3} stroke="none">
                    {sentimentData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} />
                </PieChart>
              </ResponsiveContainer>
              <div style={s.legend}>
                {sentimentData.map((d, i) => (
                  <div key={i} style={s.legendItem}>
                    <span style={{ ...s.legendDot, background: d.color }} />
                    <span style={s.legendLbl}>{d.name}</span>
                    <span style={s.legendVal}>{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty msg="No applications yet." />}
        </Card>

        <Card title="Pipeline Funnel" icon={TrendingUp}>
          <div style={s.funnel}>
            {funnel.map((f, i) => {
              const p = funnel[0].value ? (f.value / funnel[0].value) * 100 : 0;
              const conv = i === 0 ? 100 : funnel[i - 1].value ? Math.round(f.value / funnel[i - 1].value * 100) : 0;
              return (
                <div key={f.stage}>
                  <div style={s.funnelTop}>
                    <span style={s.funnelStage}>{f.stage}</span>
                    <span style={s.funnelVal}>{f.value}{i > 0 && <span style={s.funnelConv}> · {conv}%</span>}</span>
                  </div>
                  <div style={s.funnelTrack}>
                    <div style={{ ...s.funnelFill, width: `${Math.max(p, 4)}%`, background: f.color, boxShadow: `0 0 12px ${f.color}66` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Salary Range Seen" icon={DollarSign}>
          {salaryStats ? (
            <div style={s.salaryWrap}>
              <div style={s.salaryBig}>{fmtMoney(salaryStats.median)}</div>
              <div style={s.salarySub}>median target (max band)</div>
              <div style={s.salaryRange}>
                <span style={s.salaryRangeVal}>{fmtMoney(salaryStats.min)}</span>
                <div style={s.salaryBar}>
                  <div style={s.salaryBarFill} />
                </div>
                <span style={s.salaryRangeVal}>{fmtMoney(salaryStats.max)}</span>
              </div>
            </div>
          ) : <Empty msg="Add salary data to applications." />}
        </Card>

        <Card title="Response Rate by Category" icon={Layers}>
          {catData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={catData} margin={{ top: 8, right: 8, left: -16, bottom: 4 }} layout="vertical">
                <CartesianGrid strokeDasharray="2 4" stroke={T.edgeLight} horizontal={false} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="category" tick={{ ...axisTick, fontSize: 10 }} tickLine={false} axisLine={false} width={88} />
                <Tooltip {...tooltipProps} />
                <Bar dataKey="positiveRate" name="Positive %" radius={[0, 6, 6, 0]} fill={T.green} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty msg="No applications logged yet." />}
        </Card>

        <Card title="Skills in Demand" icon={Wrench} span={3}>
          {skillDemand.length ? (
            <div style={s.skillGrid}>
              {skillDemand.map((sk) => (
                <div key={sk.name} style={s.skillRow}>
                  <span style={s.skillNameRO}>{sk.name}</span>
                  <div style={s.skillBarWrap}>
                    <div style={{ ...s.skillBar, width: `${(sk.count / maxSkillCount) * 100}%` }} />
                  </div>
                  <span style={s.skillCount}>{sk.count}</span>
                </div>
              ))}
            </div>
          ) : <Empty msg="Tag applications with skills." />}
        </Card>

        <Card title="Weekly Trend" icon={TrendingUp} span={3}>
          {trendData.length ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={trendData} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.edgeLight} vertical={false} />
                <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {STATUSES.map((st) => (
                  <Line key={st.key} type="monotone" dataKey={st.key} name={st.label}
                    stroke={st.color} strokeWidth={2.5} dot={{ r: 3, fill: st.color }} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty msg="Log applications with dates to see the trend." />}
        </Card>
      </div>

      {/* LINKEDIN SUMMARY CARD */}
      <div style={s.exportSection}>
        <div style={s.exportLabel}>LinkedIn summary card · exports as PNG</div>
        <div ref={cardRef} style={s.summaryCard}>
          <div style={s.scGlow} />
          <div style={s.scHead}>
            <div>
              <div style={s.scKicker}>JOB SEARCH · PIPELINE SNAPSHOT</div>
              <div style={s.scTitle}>{totalApps} application{totalApps === 1 ? "" : "s"} · {responseRate}% response</div>
            </div>
            <div style={s.scWeeks}>
              <div style={s.scWeeksNum}>{activeCount}</div>
              <div style={s.scWeeksLbl}>ACTIVE</div>
            </div>
          </div>
          <div style={s.scStats}>
            <ScStat value={totalApps} label="Applied" color={T.cyan} />
            <ScStat value={staleCount} label="Stale" color={T.amber} />
            <ScStat value={nRejected} label="Rejected" color={T.red} />
            <ScStat value={reachedInterview} label="Interview" color={T.green} />
          </div>
          <div style={s.scBars}>
            {sourceData.filter((d) => d.applied > 0).map((d) => (
              <div key={d.key} style={s.scBarRow}>
                <span style={s.scBarLbl}>{d.source}</span>
                <div style={s.scBarTrack}>
                  <div style={{ ...s.scBarFill, width: `${d.positiveRate}%`, background: d.color }} />
                </div>
                <span style={s.scBarPct}>{d.positiveRate}%</span>
              </div>
            ))}
          </div>
          <div style={s.scFoot}><span style={s.scMark}>◈</span> tracked in quarry</div>
        </div>
      </div>

      {/* ===== EDIT / ADD MODAL ===== */}
      {editing && (
        <RecordModal
          record={editing}
          categories={cats}
          onSave={saveRecord}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ============ RECORD MODAL ============ */
function RecordModal({ record, categories, onSave, onClose }) {
  const [r, setR] = useState(record);
  const [skillInput, setSkillInput] = useState("");
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const addSkill = () => {
    const v = skillInput.trim();
    if (v && !r.skills.includes(v)) set("skills", [...r.skills, v]);
    setSkillInput("");
  };
  const removeSkill = (sk) => set("skills", r.skills.filter((x) => x !== sk));
  const valid = r.company.trim() && r.role.trim();

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={(e) => e.stopPropagation()}>
        <div style={m.head}>
          <span style={m.title}>{record.company ? "Edit application" : "Log application"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="iconbtn" style={{ ...m.close, ...(r.starred ? { boxShadow: `inset 3px 3px 7px ${T.edgeDark}` } : {}) }}
              onClick={() => set("starred", !r.starred)} title={r.starred ? "Unpin priority" : "Pin as priority"}>
              <Star size={15} color={T.amber} fill={r.starred ? T.amber : "none"} />
            </button>
            <button className="iconbtn" style={m.close} onClick={onClose}><X size={16} color={T.textDim} /></button>
          </div>
        </div>

        <div style={m.body}>
          {/* Required */}
          <div style={m.row2}>
            <Field label="Company *"><In value={r.company} onChange={(v) => set("company", v)} ph="Company name" /></Field>
            <Field label="Role *"><In value={r.role} onChange={(v) => set("role", v)} ph="Job title" /></Field>
          </div>

          {/* Status */}
          <Field label="Status">
            <div style={m.statusBtns}>
              {STATUSES.map((st) => {
                const on = r.status === st.key;
                return (
                  <button key={st.key} type="button" className="statusBtn"
                    onClick={() => set("status", st.key)}
                    style={{
                      ...m.statusBtn,
                      ...(on ? { background: st.color + "26", color: st.color, boxShadow: `inset 0 0 0 1px ${st.color}` } : {}),
                    }}>
                    {st.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Source + Salary */}
          <div style={m.row3}>
            <Field label="Source">
              <select value={r.source} onChange={(e) => set("source", e.target.value)} className="modalIn" style={m.input}>
                {SOURCES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
              </select>
            </Field>
            <Field label="Salary min"><In type="number" value={r.salaryMin} onChange={(v) => set("salaryMin", v)} ph="200000" /></Field>
            <Field label="Salary max"><In type="number" value={r.salaryMax} onChange={(v) => set("salaryMax", v)} ph="280000" /></Field>
          </div>

          {/* Location */}
          <div style={m.row2}>
            <Field label="Location"><In value={r.location} onChange={(v) => set("location", v)} ph="Remote US" /></Field>
            <Field label="Work mode">
              <select value={r.remote} onChange={(e) => set("remote", e.target.value)} className="modalIn" style={m.input}>
                {REMOTE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>

          {/* Dates */}
          <div style={m.row2}>
            <Field label="Applied date"><In type="date" value={r.appliedDate} onChange={(v) => set("appliedDate", v)} /></Field>
            <Field label="First response date">
              <In type="date" value={r.responseDate} onChange={(v) => set("responseDate", v)} />
            </Field>
          </div>

          {/* Ancillary */}
          <div style={m.divider}><span style={m.dividerLbl}>Additional details</span><span style={m.dividerLine} /></div>

          <div style={m.row2}>
            <Field label="Category">
              <input list="cats" value={r.category} onChange={(e) => set("category", e.target.value)}
                className="modalIn" style={m.input} placeholder="e.g. Engineering, Design, Sales" />
              <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="JD / posting link"><In value={r.link} onChange={(v) => set("link", v)} ph="https://…" /></Field>
          </div>

          <Field label="Skills required">
            <div style={m.skillsBox}>
              {r.skills.map((sk) => (
                <span key={sk} style={m.skillChip}>{sk}
                  <button className="iconbtn" style={m.skillX} onClick={() => removeSkill(sk)}><X size={11} /></button>
                </span>
              ))}
              <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
                placeholder="type + Enter" className="modalIn" style={m.skillInput} />
            </div>
          </Field>

          <Field label="Notes">
            <textarea value={r.notes} onChange={(e) => set("notes", e.target.value)}
              className="modalIn" style={{ ...m.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Referral contact, leverage, follow-up reminders…" />
          </Field>
        </div>

        <div style={m.foot}>
          <button className="textbtn" style={m.cancelBtn} onClick={onClose}>Cancel</button>
          <button className="textbtn" style={{ ...m.saveBtn, opacity: valid ? 1 : 0.5 }}
            onClick={() => valid && onSave(r)} disabled={!valid}>
            {record.company ? "Save changes" : "Add application"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- components ---- */
const axisTick = { fill: "#9aa3b2", fontSize: 11 };
const tooltipProps = {
  contentStyle: { background: "#252a33", border: "1px solid #3f4754", borderRadius: 10, fontSize: 12, color: "#f0f3f8" },
  itemStyle: { color: "#f0f3f8" }, labelStyle: { color: "#9aa3b2" },
};
function Card({ title, icon: Icon, children, span = 1 }) {
  return (
    <section style={{ ...s.card, gridColumn: `span ${span}` }}>
      <div style={s.cardHead}><Icon size={14} color={T.textDim} /><span style={s.cardTitle}>{title}</span></div>
      {children}
    </section>
  );
}
function Kpi({ label, value, accent, sub }) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: accent }}>{value}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  );
}
function IconBtn({ icon: Icon, label, onClick, accent }) {
  return (
    <button className="textbtn" onClick={onClick} style={{ ...s.iconBtn, ...(accent ? { background: T.cyan, color: "#10231f" } : {}) }}>
      <Icon size={14} /> {label}
    </button>
  );
}
function Chip({ active, onClick, label }) {
  return <button className="textbtn" onClick={onClick} style={{ ...s.chip, ...(active ? s.chipActive : {}) }}>{label}</button>;
}
function ScStat({ value, label, color }) {
  return <div style={s.scStat}><div style={{ ...s.scStatVal, color }}>{value}</div><div style={s.scStatLbl}>{label}</div></div>;
}
function Empty({ msg }) { return <div style={s.empty}>{msg}</div>; }
function Field({ label, children }) {
  return <div style={m.field}><label style={m.label}>{label}</label>{children}</div>;
}
function In({ value, onChange, ph, type = "text" }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
    placeholder={ph} className="modalIn" style={m.input} />;
}

/* ---- styles ---- */
const s = {
  shell: { minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'Inter', system-ui, sans-serif", padding: 20, boxSizing: "border-box" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  brand: { display: "flex", alignItems: "center", gap: 11 },
  brandTitle: { fontSize: 12.5, fontWeight: 800, letterSpacing: "0.18em" },
  topActions: { display: "flex", gap: 9, flexWrap: "wrap" },
  iconBtn: { display: "flex", alignItems: "center", gap: 6, background: T.panel, border: "none", borderRadius: 11, padding: "9px 13px", color: T.text, fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: raisedSm, fontFamily: "inherit" },

  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16, marginTop: 4 },
  kpi: { background: T.panel, borderRadius: 16, padding: "14px 16px", boxShadow: raised },
  kpiLabel: { fontSize: 10.5, color: T.textDim, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" },
  kpiValue: { fontSize: 28, fontWeight: 800, marginTop: 5, letterSpacing: "-0.02em" },
  kpiSub: { fontSize: 10.5, color: T.textDim, marginTop: 3 },

  pinnedWrap: { marginBottom: 16, padding: "16px 18px", background: T.panel, borderRadius: 18, boxShadow: raised, border: `1px solid ${T.amber}22` },
  pinnedHead: { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 },
  pinnedTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.amber },
  pinnedCount: { fontSize: 10.5, fontWeight: 800, color: T.amber, background: T.amber + "22", borderRadius: 20, padding: "1px 8px" },
  pinnedGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 },
  pinnedCard: { position: "relative", background: T.inset, borderRadius: 14, padding: 16, boxShadow: inset, overflow: "hidden" },
  pinnedCardGlow: { position: "absolute", top: -40, right: -40, width: 110, height: 110, borderRadius: "50%", background: T.amber, opacity: 0.08, filter: "blur(28px)", pointerEvents: "none" },
  pinnedCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  pinnedCompany: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em", display: "flex", alignItems: "center" },
  pinnedRole: { fontSize: 12, color: T.textDim, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  pinStar: { background: T.panel, border: "none", borderRadius: 8, padding: 7, cursor: "pointer", boxShadow: raisedSm, display: "grid", placeItems: "center", flexShrink: 0 },
  pinnedMeta: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  pinnedSalary: { fontSize: 11.5, fontWeight: 700, color: T.violet },
  pinnedNotes: { fontSize: 11, color: T.textDim, marginTop: 11, lineHeight: 1.45, borderTop: `1px solid ${T.edgeDark}`, paddingTop: 10 },

  filterBar: { marginBottom: 16, background: T.panel, borderRadius: 14, boxShadow: inset, overflow: "hidden" },
  filterHeader: { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", color: T.text },
  filterHeaderLbl: { fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.textDim },
  filterCount: { fontSize: 10.5, fontWeight: 800, color: T.cyan, background: T.cyan + "22", borderRadius: 20, padding: "1px 8px", minWidth: 18, textAlign: "center" },
  filterSummary: { fontSize: 11.5, color: T.textDim, fontWeight: 500, marginLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 360 },
  filterClearAll: { fontSize: 11, color: T.textDim, fontWeight: 600, marginRight: 4, textDecoration: "underline", textUnderlineOffset: 2 },
  filterBody: { display: "flex", flexDirection: "column", gap: 12, padding: "4px 16px 16px" },
  searchWrap: { display: "flex", alignItems: "center", gap: 8, background: T.inset, borderRadius: 10, padding: "9px 12px", boxShadow: inset },
  searchIn: { background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 0 },
  searchClear: { background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "grid", placeItems: "center", flexShrink: 0 },
  filterGroup: { display: "flex", alignItems: "flex-start", gap: 12 },
  filterGroupLbl: { fontSize: 10.5, color: T.textDim, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", width: 66, flexShrink: 0, paddingTop: 7 },
  chipRow: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", flex: 1 },
  chip: { background: T.panel, border: "none", borderRadius: 9, padding: "6px 12px", color: T.textDim, fontSize: 11.5, fontWeight: 600, cursor: "pointer", boxShadow: raisedSm, fontFamily: "inherit" },
  chipActive: { color: T.text, boxShadow: inset, background: T.inset },

  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  card: { background: T.panel, borderRadius: 18, padding: 18, boxShadow: raised, minWidth: 0 },
  cardHead: { display: "flex", alignItems: "center", gap: 7, marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textDim },

  tableWrap: { overflowX: "auto" },
  appTable: { width: "100%", borderCollapse: "collapse", minWidth: 900 },
  th: { fontSize: 10, color: T.textDim, fontWeight: 700, textAlign: "left", padding: "8px 10px", letterSpacing: "0.03em", textTransform: "uppercase", borderBottom: `1px solid ${T.edgeDark}`, whiteSpace: "nowrap" },
  tdCompany: { fontSize: 12.5, fontWeight: 700, padding: "10px", whiteSpace: "nowrap" },
  tdRole: { fontSize: 12, padding: "10px", whiteSpace: "nowrap", color: T.text },
  tdSmall: { fontSize: 11.5, padding: "10px", whiteSpace: "nowrap", color: T.textDim },
  tdSkills: { padding: "10px", whiteSpace: "nowrap" },
  tdPin: { padding: "10px", whiteSpace: "nowrap", display: "flex", gap: 5, position: "sticky", left: 0, background: T.panel, zIndex: 2 },
  tdPinRight: { padding: "10px", whiteSpace: "nowrap", position: "sticky", right: 0, background: T.panel, zIndex: 2 },
  thPin: { position: "sticky", left: 0, background: T.panel, zIndex: 3 },
  thPinRight: { position: "sticky", right: 0, background: T.panel, zIndex: 3 },
  emptyRow: { textAlign: "center", padding: "32px", color: T.textDim, fontStyle: "italic", fontSize: 12.5 },
  jdLink: { marginLeft: 6, color: T.cyan, display: "inline-flex", verticalAlign: "middle" },
  srcPill: { fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 6, border: "1px solid" },
  statusPill: { fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7 },
  staleBadge: { fontSize: 9, fontWeight: 800, color: T.amber, background: T.amber + "22", padding: "2px 6px", borderRadius: 5, marginLeft: 6, letterSpacing: "0.06em", verticalAlign: "middle" },
  remoteTag: { fontSize: 9.5, color: T.textDim, marginLeft: 6, padding: "1px 6px", background: T.inset, borderRadius: 5, boxShadow: inset, textTransform: "uppercase", letterSpacing: "0.04em" },
  skillTag: { fontSize: 10, color: T.violet, background: T.violet + "18", padding: "2px 7px", borderRadius: 6, marginRight: 4 },
  skillMore: { fontSize: 10, color: T.textDim },
  miniBtn: { background: T.panel, border: "none", borderRadius: 7, padding: 6, cursor: "pointer", boxShadow: raisedSm, display: "grid", placeItems: "center" },

  legend: { display: "flex", flexDirection: "column", gap: 6, marginTop: 8 },
  legendItem: { display: "flex", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLbl: { fontSize: 12, color: T.textDim, flex: 1 },
  legendVal: { fontSize: 12, fontWeight: 700 },

  metricKey: { display: "flex", gap: 16, marginBottom: 6, paddingLeft: 4 },
  metricKeyItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textDim, fontWeight: 600 },
  metricKeyDot: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  sourceVolRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 },
  sourceVol: { display: "flex", alignItems: "center", gap: 7 },
  sourceVolDot: { width: 9, height: 9, borderRadius: 3, flexShrink: 0 },
  sourceVolLbl: { fontSize: 11.5, color: T.text, fontWeight: 600, minWidth: 60 },
  sourceVolNum: { fontSize: 11, color: T.textDim },

  funnel: { display: "flex", flexDirection: "column", gap: 14, marginTop: 4 },
  funnelTop: { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  funnelStage: { fontSize: 12.5, fontWeight: 600 },
  funnelVal: { fontSize: 12.5, fontWeight: 700 },
  funnelConv: { color: T.textDim, fontWeight: 600 },
  funnelTrack: { height: 12, background: T.inset, borderRadius: 7, boxShadow: inset, overflow: "hidden" },
  funnelFill: { height: "100%", borderRadius: 7, transition: "width 0.4s ease" },

  salaryWrap: { textAlign: "center", padding: "8px 0" },
  salaryBig: { fontSize: 38, fontWeight: 800, color: T.violet, letterSpacing: "-0.02em" },
  salarySub: { fontSize: 11, color: T.textDim, marginTop: 2, marginBottom: 18 },
  salaryRange: { display: "flex", alignItems: "center", gap: 10 },
  salaryRangeVal: { fontSize: 12, fontWeight: 700, color: T.textDim },
  salaryBar: { flex: 1, height: 8, borderRadius: 5, background: `linear-gradient(90deg, ${T.cyan}, ${T.violet}, ${T.amber})`, boxShadow: inset },
  salaryBarFill: { display: "none" },
  skillGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "9px 28px" },
  skillRow: { display: "flex", alignItems: "center", gap: 9 },
  skillNameRO: { width: 100, fontSize: 11.5, color: T.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  skillBarWrap: { flex: 1, height: 8, background: T.inset, borderRadius: 5, boxShadow: inset, overflow: "hidden" },
  skillBar: { height: "100%", background: `linear-gradient(90deg, ${T.amber}, ${T.magenta})`, borderRadius: 5, transition: "width 0.3s ease" },
  skillCount: { fontSize: 11.5, fontWeight: 700, width: 24, textAlign: "right" },

  empty: { fontSize: 12.5, color: T.textDim, textAlign: "center", padding: "32px 8px", fontStyle: "italic" },

  exportSection: { marginTop: 22 },
  exportLabel: { fontSize: 11, color: T.textDim, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 },
  summaryCard: { width: 480, maxWidth: "100%", boxSizing: "border-box", background: T.panel, borderRadius: 24, padding: 28, position: "relative", overflow: "hidden", boxShadow: raised },
  scGlow: { position: "absolute", top: -60, right: -50, width: 180, height: 180, borderRadius: "50%", background: T.cyan, opacity: 0.12, filter: "blur(40px)" },
  scHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  scKicker: { fontSize: 10, color: T.cyan, fontWeight: 700, letterSpacing: "0.16em" },
  scTitle: { fontSize: 20, fontWeight: 800, marginTop: 6, letterSpacing: "-0.02em", lineHeight: 1.2 },
  scWeeks: { background: T.inset, borderRadius: 13, padding: "9px 14px", textAlign: "center", boxShadow: inset },
  scWeeksNum: { fontSize: 22, fontWeight: 800, color: T.cyan, lineHeight: 1 },
  scWeeksLbl: { fontSize: 8.5, color: T.textDim, letterSpacing: "0.16em", marginTop: 3 },
  scStats: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 22, marginBottom: 22 },
  scStat: { background: T.panel, borderRadius: 13, padding: "12px 8px", textAlign: "center", boxShadow: raisedSm },
  scStatVal: { fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" },
  scStatLbl: { fontSize: 9, color: T.textDim, marginTop: 4, fontWeight: 600 },
  scBars: { display: "flex", flexDirection: "column", gap: 9 },
  scBarRow: { display: "flex", alignItems: "center", gap: 10 },
  scBarLbl: { fontSize: 11, width: 78, color: T.textDim, fontWeight: 600, whiteSpace: "nowrap" },
  scBarTrack: { flex: 1, height: 8, background: T.inset, borderRadius: 5, boxShadow: inset, overflow: "hidden" },
  scBarFill: { height: "100%", borderRadius: 5 },
  scBarPct: { fontSize: 11, fontWeight: 700, width: 34, textAlign: "right" },
  scFoot: { marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.edgeDark}`, fontSize: 10, color: T.textDim, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 },
  scMark: { color: T.cyan, marginRight: 6 },
};

const m = {
  overlay: { position: "fixed", inset: 0, background: "rgba(7,9,16,0.7)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 100, padding: 20 },
  modal: { background: T.panel, borderRadius: 22, width: 620, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: `-10px -10px 30px ${T.edgeLight}, 12px 12px 36px ${T.edgeDark}` },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: `1px solid ${T.edgeDark}`, position: "sticky", top: 0, background: T.panel, zIndex: 1 },
  title: { fontSize: 15, fontWeight: 800, letterSpacing: "0.02em" },
  close: { background: T.panel, border: "none", borderRadius: 8, padding: 7, cursor: "pointer", boxShadow: raisedSm },
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 14 },
  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  row3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, color: T.textDim, fontWeight: 600 },
  input: { width: "100%", boxSizing: "border-box", background: T.inset, border: "none", borderRadius: 10, padding: "10px 12px", color: T.text, fontSize: 13, outline: "none", boxShadow: inset, fontFamily: "inherit" },
  statusBtns: { display: "flex", flexWrap: "wrap", gap: 8 },
  statusBtn: { flex: "1 1 auto", minWidth: 86, background: T.inset, border: "none", borderRadius: 10, padding: "10px 8px", color: T.textDim, fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: raisedSm, fontFamily: "inherit", transition: "color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease" },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "6px 0 -2px" },
  dividerLbl: { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textDim, whiteSpace: "nowrap" },
  dividerLine: { flex: 1, height: 1, background: T.edgeDark },
  skillsBox: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", background: T.inset, borderRadius: 10, padding: "8px 10px", boxShadow: inset, minHeight: 40 },
  skillChip: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.violet, background: T.violet + "22", padding: "3px 4px 3px 9px", borderRadius: 7, fontWeight: 600 },
  skillX: { background: "transparent", border: "none", cursor: "pointer", color: T.violet, display: "grid", placeItems: "center", padding: 1 },
  skillInput: { background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12.5, fontFamily: "inherit", flex: 1, minWidth: 90, boxShadow: "none" },
  foot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "18px 24px", borderTop: `1px solid ${T.edgeDark}`, position: "sticky", bottom: 0, background: T.panel },
  cancelBtn: { background: T.panel, border: "none", borderRadius: 11, padding: "11px 20px", color: T.textDim, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: raisedSm, fontFamily: "inherit" },
  saveBtn: { background: T.cyan, border: "none", borderRadius: 11, padding: "11px 22px", color: "#10231f", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
};

const CSS = `
  .modalIn:focus, .searchIn:focus { box-shadow: inset 5px 5px 12px ${T.edgeDark}, 0 0 0 1px ${T.cyan}66 !important; }
  .skillInput:focus { box-shadow: none !important; }
  .textbtn:active, .iconbtn:active { transform: translateY(1px); }
  .filterToggle:hover .filterHeaderLbl, .filterToggle:hover { color: ${T.text}; }
  .filterClearAll:hover { color: ${T.cyan} !important; }
  .statusBtn:hover { color: ${T.text}; }
  .colHead:hover { color: ${T.text}; background: ${T.inset}; }
  .colHead:active { cursor: grabbing; }
  .appRow:hover { background: ${T.inset}66; }
  .appRow td:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
  input[type="number"]::-webkit-inner-spin-button { opacity: 0.35; }
  input[type="date"] { color-scheme: dark; }
  * { transition: box-shadow 0.15s ease, transform 0.1s ease; }
  ::selection { background: ${T.cyan}44; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.edgeLight}; border-radius: 5px; }
`;
