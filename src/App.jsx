import { save, load } from "./storage";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Leaf,
  Sprout,
  Calendar,
  BarChart3,
  Plus,
  Download,
  Upload,
  Trash2,
  Check,
  Edit3,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ------------------------------------------------------------
// Kai Keeper — Single-file React App
// ------------------------------------------------------------
// Features
// - Seed/plant catalogue with sensible NZ-friendly defaults
// - Add plantings: select plant type, plant date, location, qty
// - Phase estimations (Germination → Growth → Harvest Window)
// - Visual progress bars and expected date ranges
// - Log harvests (by kg or count) and review a ledger
// - Reports: totals by month and by plant type (separate for kg/count)
// - LocalStorage persistence + JSON import/export
// ------------------------------------------------------------

// --------------------- Types -------------------------------
const uid = () => (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** @typedef {"kg" | "count"} Unit */

/**
 * @typedef PlantType
 * @prop {string} id
 * @prop {string} name
 * @prop {number} germinationMinDays
 * @prop {number} germinationMaxDays
 * @prop {number} maturityDays // from sow/plant to first harvest
 * @prop {number} harvestWindowDays // how long best-quality harvest typically lasts
 * @prop {Unit} defaultUnit
 */

/**
 * @typedef Planting
 * @prop {string} id
 * @prop {string} plantTypeId
 * @prop {string} plantedAt // ISO date
 * @prop {string} location
 * @prop {number} quantityPlanted
 * @prop {string} notes
 * @prop {boolean} archived
 */

/**
 * @typedef Harvest
 * @prop {string} id
 * @prop {string} plantingId
 * @prop {string} date // ISO date
 * @prop {number} amount
 * @prop {Unit} unit
 * @prop {string} notes
 */

// --------------------- Defaults ----------------------------
/** @type {PlantType[]} */
const DEFAULT_PLANT_TYPES = [
  { id: uid(), name: "Kūmara (Sweet Potato)", germinationMinDays: 10, germinationMaxDays: 20, maturityDays: 140, harvestWindowDays: 21, defaultUnit: "kg" },
  { id: uid(), name: "Potato", germinationMinDays: 14, germinationMaxDays: 21, maturityDays: 100, harvestWindowDays: 28, defaultUnit: "kg" },
  { id: uid(), name: "Lettuce", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 50, harvestWindowDays: 21, defaultUnit: "count" },
  { id: uid(), name: "Tomato", germinationMinDays: 6, germinationMaxDays: 14, maturityDays: 85, harvestWindowDays: 35, defaultUnit: "kg" },
  { id: uid(), name: "Broccoli", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 70, harvestWindowDays: 14, defaultUnit: "count" },
  { id: uid(), name: "Silverbeet (Chard)", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 55, harvestWindowDays: 45, defaultUnit: "kg" },
  { id: uid(), name: "Corn (Sweet)", germinationMinDays: 7, germinationMaxDays: 10, maturityDays: 85, harvestWindowDays: 14, defaultUnit: "count" },
  { id: uid(), name: "Beans (Bush)", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 55, harvestWindowDays: 21, defaultUnit: "kg" },
  { id: uid(), name: "Carrot", germinationMinDays: 14, germinationMaxDays: 21, maturityDays: 80, harvestWindowDays: 21, defaultUnit: "kg" },
  { id: uid(), name: "Capsicum (Pepper)", germinationMinDays: 10, germinationMaxDays: 21, maturityDays: 110, harvestWindowDays: 35, defaultUnit: "kg" },
];

// --------------------- Storage -----------------------------
const LS_KEYS = {
  plantTypes: "kaiKeeper_plantTypes",
  plantings: "kaiKeeper_plantings",
  harvests: "kaiKeeper_harvests",
};

const loadLS = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const saveLS = (key, value) => localStorage.setItem(key, JSON.stringify(value));

// --------------------- Date helpers ------------------------
const toISO = (d) => new Date(d).toISOString().slice(0, 10);
const todayISO = () => toISO(new Date());
const addDays = (iso, days) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};
const daysBetween = (fromISO, toISODate) => {
  const a = new Date(fromISO);
  const b = new Date(toISODate);
  return Math.floor((b - a) / (24 * 3600 * 1000));
};
const nzDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-NZ", { year: "numeric", month: "short", day: "numeric" });

// --------------------- UI bits -----------------------------
const Section = ({ title, icon, children, actions }) => (
  <div className="bg-white/70 backdrop-blur border rounded-2xl shadow-sm p-4 md:p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
    {children}
  </div>
);

const Tag = ({ children }) => (
  <span className="px-2 py-1 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{children}</span>
);

const Progress = ({ value, label }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{Math.max(0, Math.min(100, Math.round(value)))}%</span>
    </div>
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  </div>
);

const Button = ({ children, onClick, kind = "solid", className = "", type = "button" }) => {
  const base = "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition border";
  const styles =
    kind === "solid"
      ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
      : kind === "ghost"
      ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
      : "bg-amber-600 text-white border-amber-600 hover:bg-amber-700";
  return (
    <button type={type} onClick={onClick} className={`${base} ${styles} ${className}`}>{children}</button>
  );
};

const Input = (props) => (
  <input {...props} className={`w-full px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${props.className || ""}`} />
);

const Select = (props) => (
  <select {...props} className={`w-full px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${props.className || ""}`} />
);

const TextArea = (props) => (
  <textarea {...props} className={`w-full px-3 py-2 border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 ${props.className || ""}`} />
);

// --------------------- App -------------------------------
export default function KaiKeeperApp() {
const [plantTypes, setPlantTypes] = useState(DEFAULT_PLANT_TYPES);
const [plantings, setPlantings] = useState([]);
const [harvests, setHarvests]   = useState([]);



const [tab, setTab] = useState("track"); // "plant" | "track" | "harvest" | "reports" | "settings"

// Load once on startup
useEffect(() => { load("plantTypes", DEFAULT_PLANT_TYPES).then(setPlantTypes); }, []);
useEffect(() => { load("plantings", []).then(setPlantings); }, []);
useEffect(() => { load("harvests", []).then(setHarvests); }, []);

// Save whenever changes happen
useEffect(() => { save("plantTypes", plantTypes); }, [plantTypes]);
useEffect(() => { save("plantings", plantings); }, [plantings]);
useEffect(() => { save("harvests",  harvests ); }, [harvests]);


  // -------- Derived maps --------
  const plantTypeById = useMemo(() => Object.fromEntries(plantTypes.map((p) => [p.id, p])), [plantTypes]);

  // -------- Add Planting --------
  const [newPlanting, setNewPlanting] = useState({ plantTypeId: plantTypes[0]?.id || "", plantedAt: todayISO(), location: "", quantityPlanted: 1, notes: "" });

  const addPlanting = (e) => {
    e?.preventDefault?.();
    if (!newPlanting.plantTypeId || !newPlanting.plantedAt) return;
    const planting = { id: uid(), archived: false, ...newPlanting };
    setPlantings((arr) => [planting, ...arr]);
    setNewPlanting({ plantTypeId: plantTypes[0]?.id || "", plantedAt: todayISO(), location: "", quantityPlanted: 1, notes: "" });
    setTab("track");
  };

  // -------- Harvest Modal --------
  const [harvestTarget, setHarvestTarget] = useState(null); // plantingId | null
  const [harvestInput, setHarvestInput] = useState({ amount: 0, unit: /** @type {Unit} */("kg"), date: todayISO(), notes: "" });

  const openHarvest = (planting) => {
    const defaultUnit = plantTypeById[planting.plantTypeId]?.defaultUnit || "kg";
    setHarvestInput({ amount: 0, unit: defaultUnit, date: todayISO(), notes: "" });
    setHarvestTarget(planting);
  };
  const logHarvest = () => {
    if (!harvestTarget) return;
    const { amount, unit, date, notes } = harvestInput;
    if (!amount || amount <= 0) return;
    const entry = { id: uid(), plantingId: harvestTarget.id, amount: Number(amount), unit, date, notes };
    setHarvests((arr) => [entry, ...arr]);
    setHarvestTarget(null);
  };

  const deletePlanting = (id) => setPlantings((arr) => arr.filter((p) => p.id !== id));
  const deleteHarvest = (id) => setHarvests((arr) => arr.filter((h) => h.id !== id));

  const toggleArchive = (id) => setPlantings((arr) => arr.map((p) => (p.id === id ? { ...p, archived: !p.archived } : p)));

  // -------- Estimation logic --------
  const phaseFor = (planting) => {
    const pt = plantTypeById[planting.plantTypeId];
    if (!pt) return null;
    const now = todayISO();
    const elapsed = Math.max(0, daysBetween(planting.plantedAt, now));
    const germAvg = (pt.germinationMinDays + pt.germinationMaxDays) / 2;
    const g1 = germAvg; // germination len
    const g2 = Math.max(1, pt.maturityDays - g1); // growth len
    const g3 = Math.max(1, pt.harvestWindowDays); // harvest window len

    const total = g1 + g2 + g3;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    const p1 = clamp((elapsed / g1) * 100, 0, 100);
    const p2 = clamp(((elapsed - g1) / g2) * 100, 0, 100);
    const p3 = clamp(((elapsed - g1 - g2) / g3) * 100, 0, 100);

    return {
      germinationPct: p1,
      growthPct: p2,
      harvestPct: p3,
      expected: {
        germinationStart: addDays(planting.plantedAt, pt.germinationMinDays),
        germinationEnd: addDays(planting.plantedAt, pt.germinationMaxDays),
        firstHarvest: addDays(planting.plantedAt, pt.maturityDays),
        lastHarvest: addDays(planting.plantedAt, pt.maturityDays + pt.harvestWindowDays),
      },
      done: elapsed > total,
      elapsed,
      total,
    };
  };

  // -------- Reports data --------
  const harvestsByUnit = useMemo(() => {
    const kg = harvests.filter((h) => h.unit === "kg");
    const count = harvests.filter((h) => h.unit === "count");
    return { kg, count };
  }, [harvests]);

  const monthKey = (iso) => iso.slice(0, 7); // YYYY-MM

  const monthlyTotals = (subset) => {
    const map = new Map();
    for (const h of subset) {
      const k = monthKey(h.date);
      map.set(k, (map.get(k) || 0) + h.amount);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, total]) => ({ month, total }));
  };

  const totalsByPlantType = (subset) => {
    const map = new Map();
    for (const h of subset) {
      const planting = plantings.find((p) => p.id === h.plantingId);
      if (!planting) continue;
      const pt = plantTypeById[planting.plantTypeId];
      const key = pt?.name || "Unknown";
      map.set(key, (map.get(key) || 0) + h.amount);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total }));
  };

  // -------- Export / Import --------
  const exportJSON = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { plantTypes, plantings, harvests, exportedAt: new Date().toISOString() },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kai-keeper-backup-${toISO(new Date()).replaceAll("-", "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = async (file) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (data.plantTypes && data.plantings && data.harvests) {
        setPlantTypes(data.plantTypes);
        setPlantings(data.plantings);
        setHarvests(data.harvests);
        alert("Import successful ✔");
      } else {
        alert("Invalid backup file");
      }
    } catch (e) {
      alert("Import failed: " + e.message);
    }
  };

  const resetToDefaults = () => {
    if (!confirm("Reset plant catalogue to defaults? (Does not change your plantings/harvests)")) return;
    setPlantTypes(DEFAULT_PLANT_TYPES.map((p) => ({ ...p, id: uid() })));
  };

  // ---------------- UI Sections ----------------------------
  const PlantForm = () => (
    <Section
      title="Add a Planting"
      icon={<Sprout className="w-5 h-5 text-emerald-600" />}
      actions={<Button kind="ghost" onClick={() => setTab("track")}><Calendar className="w-4 h-4" /> View Tracker</Button>}
    >
      <form onSubmit={addPlanting} className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-slate-600">Plant type</label>
          <Select
            value={newPlanting.plantTypeId}
            onChange={(e) => setNewPlanting((s) => ({ ...s, plantTypeId: e.target.value }))}
          >
            {plantTypes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <div className="mt-2 text-xs text-slate-500">
            Can't find it? Add it in <button type="button" onClick={() => setTab("settings")} className="underline">Settings → Plants</button>.
          </div>
        </div>
        <div>
          <label className="text-sm text-slate-600">Planted date</label>
          <Input type="date" value={newPlanting.plantedAt} onChange={(e) => setNewPlanting((s) => ({ ...s, plantedAt: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm text-slate-600">Location / Bed</label>
          <Input placeholder="e.g., Bed A, Tunnelhouse, Pā gardens" value={newPlanting.location} onChange={(e) => setNewPlanting((s) => ({ ...s, location: e.target.value }))} />
        </div>
        <div>
          <label className="text-sm text-slate-600">Qty planted</label>
          <Input type="number" min={1} value={newPlanting.quantityPlanted} onChange={(e) => setNewPlanting((s) => ({ ...s, quantityPlanted: Number(e.target.value || 0) }))} />
        </div>
        <div className="md:col-span-2">
          <label className="text-sm text-slate-600">Notes</label>
          <TextArea rows={3} placeholder="Sow depth, seed source, companion plants, etc." value={newPlanting.notes} onChange={(e) => setNewPlanting((s) => ({ ...s, notes: e.target.value }))} />
        </div>
        <div className="md:col-span-2 flex items-center justify-end gap-2">
          <Button kind="ghost" onClick={() => setNewPlanting({ plantTypeId: plantTypes[0]?.id || "", plantedAt: todayISO(), location: "", quantityPlanted: 1, notes: "" })}>Clear</Button>
          <Button type="submit"><Plus className="w-4 h-4" /> Add Planting</Button>
        </div>
      </form>
    </Section>
  );

  const Tracker = () => (
    <Section
      title="Tracker"
      icon={<Calendar className="w-5 h-5 text-emerald-600" />}
      actions={<Button kind="ghost" onClick={() => setTab("plant")}><Plus className="w-4 h-4" /> New Planting</Button>}
    >
      {plantings.length === 0 ? (
        <div className="text-slate-600 text-sm">No plantings yet — add your first in the <b>Plant</b> tab.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plantings.map((p) => {
            const pt = plantTypeById[p.plantTypeId];
            const ph = phaseFor(p);
            return (
              <motion.div key={p.id} layout className={`border rounded-2xl p-4 bg-white ${p.archived ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-emerald-600" />
                      <div className="font-semibold">{pt?.name || "Unknown"}</div>
                      {p.archived && <Tag>Archived</Tag>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Planted {nzDate(p.plantedAt)} • {p.location || "No location"} • Qty {p.quantityPlanted}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button kind="ghost" onClick={() => openHarvest(p)}>Harvest</Button>
                    <Button kind="ghost" onClick={() => toggleArchive(p.id)}>{p.archived ? "Unarchive" : "Archive"}</Button>
                    <button className="p-2 text-slate-500 hover:text-red-600" onClick={() => deletePlanting(p.id)} title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {ph && (
                  <div className="mt-4 space-y-3">
                    <Progress value={ph.germinationPct} label={`Germination (${nzDate(ph.expected.germinationStart)}–${nzDate(ph.expected.germinationEnd)})`} />
                    <Progress value={ph.growthPct} label={`Growth → first harvest ~ ${nzDate(ph.expected.firstHarvest)}`} />
                    <Progress value={ph.harvestPct} label={`Harvest window until ~ ${nzDate(ph.expected.lastHarvest)}`} />
                  </div>
                )}
                <div className="mt-4 text-xs text-slate-500">
                  Elapsed {phaseFor(p)?.elapsed} days • Notes: {p.notes || "—"}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Harvest modal */}
      <AnimatePresence>
        {harvestTarget && (
          <motion.div
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-2xl p-4 md:p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sprout className="w-5 h-5 text-emerald-600" />
                  <div className="font-semibold">Log harvest — {plantTypeById[harvestTarget.plantTypeId]?.name}</div>
                </div>
                <button className="p-2" onClick={() => setHarvestTarget(null)}>✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm text-slate-600">Date</label>
                  <Input type="date" value={harvestInput.date} onChange={(e) => setHarvestInput((s) => ({ ...s, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Amount</label>
                  <Input type="number" step="0.01" min={0} value={harvestInput.amount} onChange={(e) => setHarvestInput((s) => ({ ...s, amount: Number(e.target.value || 0) }))} />
                </div>
                <div>
                  <label className="text-sm text-slate-600">Unit</label>
                  <Select value={harvestInput.unit} onChange={(e) => setHarvestInput((s) => ({ ...s, unit: /** @type {Unit} */(e.target.value) }))}>
                    <option value="kg">kg</option>
                    <option value="count">count</option>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-sm text-slate-600">Notes</label>
                  <TextArea rows={2} placeholder="e.g., first pick of the season, great size" value={harvestInput.notes} onChange={(e) => setHarvestInput((s) => ({ ...s, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4">
                <Button kind="ghost" onClick={() => setHarvestTarget(null)}>Cancel</Button>
                <Button onClick={logHarvest}><Check className="w-4 h-4" /> Save harvest</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );

  const HarvestLedger = () => (
    <Section title="Harvest Ledger" icon={<Leaf className="w-5 h-5 text-emerald-600" />}> 
      {harvests.length === 0 ? (
        <div className="text-sm text-slate-600">No harvests yet. Use the <b>Harvest</b> button on any planting in the tracker.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Date</th>
                <th className="py-2">Plant</th>
                <th className="py-2">Location</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Notes</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {harvests.map((h) => {
                const planting = plantings.find((p) => p.id === h.plantingId);
                const pt = planting ? plantTypeById[planting.plantTypeId] : null;
                return (
                  <tr key={h.id} className="border-t">
                    <td className="py-2">{nzDate(h.date)}</td>
                    <td className="py-2">{pt?.name || "Unknown"}</td>
                    <td className="py-2 text-slate-500">{planting?.location || "—"}</td>
                    <td className="py-2 font-medium">{h.amount} {h.unit}</td>
                    <td className="py-2 text-slate-500">{h.notes || "—"}</td>
                    <td className="py-2 text-right">
                      <button className="p-2 text-slate-500 hover:text-red-600" onClick={() => deleteHarvest(h.id)} title="Delete"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );

  const Reports = () => {
    const kgMonthly = monthlyTotals(harvestsByUnit.kg);
    const ctMonthly = monthlyTotals(harvestsByUnit.count);
    const kgByType = totalsByPlantType(harvestsByUnit.kg);
    const ctByType = totalsByPlantType(harvestsByUnit.count);

    return (
      <div className="grid xl:grid-cols-2 gap-4">
        <Section title="Harvest by Month (kg)" icon={<BarChart3 className="w-5 h-5 text-emerald-600" />}>
          {kgMonthly.length === 0 ? <div className="text-sm text-slate-600">No kg-based harvest data yet.</div> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kgMonthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" name="kg" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
        <Section title="Harvest by Month (count)" icon={<BarChart3 className="w-5 h-5 text-emerald-600" />}>
          {ctMonthly.length === 0 ? <div className="text-sm text-slate-600">No count-based harvest data yet.</div> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ctMonthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="count" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
        <Section title="Totals by Plant Type (kg)" icon={<BarChart3 className="w-5 h-5 text-emerald-600" />}>
          {kgByType.length === 0 ? <div className="text-sm text-slate-600">No kg-based harvests yet.</div> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={kgByType} dataKey="total" nameKey="name" outerRadius={90} label />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
        <Section title="Totals by Plant Type (count)" icon={<BarChart3 className="w-5 h-5 text-emerald-600" />}>
          {ctByType.length === 0 ? <div className="text-sm text-slate-600">No count-based harvests yet.</div> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={ctByType} dataKey="total" nameKey="name" outerRadius={90} label />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>
    );
  };

  const Settings = () => {
    const [draft, setDraft] = useState({ name: "", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 60, harvestWindowDays: 21, defaultUnit: /** @type {Unit} */("kg") });

    const addType = () => {
      if (!draft.name.trim()) return;
      setPlantTypes((arr) => [
        { id: uid(), ...draft, germinationMinDays: Number(draft.germinationMinDays), germinationMaxDays: Number(draft.germinationMaxDays), maturityDays: Number(draft.maturityDays), harvestWindowDays: Number(draft.harvestWindowDays) },
        ...arr,
      ]);
      setDraft({ name: "", germinationMinDays: 7, germinationMaxDays: 14, maturityDays: 60, harvestWindowDays: 21, defaultUnit: "kg" });
    };

    const updateType = (id, patch) => setPlantTypes((arr) => arr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const removeType = (id) => setPlantTypes((arr) => arr.filter((p) => p.id !== id));

    return (
      <div className="grid xl:grid-cols-2 gap-4">
        <Section title="Plant Catalogue" icon={<Edit3 className="w-5 h-5 text-emerald-600" />} actions={<Button kind="ghost" onClick={resetToDefaults}>Reset to defaults</Button>}>
          <div className="grid md:grid-cols-2 gap-4">
            {plantTypes.map((p) => (
              <div key={p.id} className="border rounded-2xl p-4 bg-white">
                <div className="font-semibold mb-2">{p.name}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="text-slate-600">Germ min
                    <Input type="number" min={0} value={p.germinationMinDays} onChange={(e) => updateType(p.id, { germinationMinDays: Number(e.target.value || 0) })} />
                  </label>
                  <label className="text-slate-600">Germ max
                    <Input type="number" min={0} value={p.germinationMaxDays} onChange={(e) => updateType(p.id, { germinationMaxDays: Number(e.target.value || 0) })} />
                  </label>
                  <label className="text-slate-600">Maturity
                    <Input type="number" min={1} value={p.maturityDays} onChange={(e) => updateType(p.id, { maturityDays: Number(e.target.value || 0) })} />
                  </label>
                  <label className="text-slate-600">Harvest window
                    <Input type="number" min={1} value={p.harvestWindowDays} onChange={(e) => updateType(p.id, { harvestWindowDays: Number(e.target.value || 0) })} />
                  </label>
                  <label className="text-slate-600 col-span-2">Default unit
                    <Select value={p.defaultUnit} onChange={(e) => updateType(p.id, { defaultUnit: /** @type {Unit} */(e.target.value) })}>
                      <option value="kg">kg</option>
                      <option value="count">count</option>
                    </Select>
                  </label>
                </div>
                <div className="flex justify-end mt-2">
                  <button className="p-2 text-slate-500 hover:text-red-600" title="Remove" onClick={() => removeType(p.id)}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Add Plant Type" icon={<Plus className="w-5 h-5 text-emerald-600" />}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-slate-600">Name<Input placeholder="e.g., Kawakawa" value={draft.name} onChange={(e) => setDraft((s) => ({ ...s, name: e.target.value }))} /></label>
            <label className="text-slate-600">Germ min<Input type="number" min={0} value={draft.germinationMinDays} onChange={(e) => setDraft((s) => ({ ...s, germinationMinDays: Number(e.target.value || 0) }))} /></label>
            <label className="text-slate-600">Germ max<Input type="number" min={0} value={draft.germinationMaxDays} onChange={(e) => setDraft((s) => ({ ...s, germinationMaxDays: Number(e.target.value || 0) }))} /></label>
            <label className="text-slate-600">Maturity<Input type="number" min={1} value={draft.maturityDays} onChange={(e) => setDraft((s) => ({ ...s, maturityDays: Number(e.target.value || 0) }))} /></label>
            <label className="text-slate-600">Harvest window<Input type="number" min={1} value={draft.harvestWindowDays} onChange={(e) => setDraft((s) => ({ ...s, harvestWindowDays: Number(e.target.value || 0) }))} /></label>
            <label className="text-slate-600 col-span-2">Default unit
              <Select value={draft.defaultUnit} onChange={(e) => setDraft((s) => ({ ...s, defaultUnit: /** @type {Unit} */(e.target.value) }))}>
                <option value="kg">kg</option>
                <option value="count">count</option>
              </Select>
            </label>
            <div className="col-span-2 flex justify-end">
              <Button onClick={addType}><Plus className="w-4 h-4" /> Add Type</Button>
            </div>
          </div>
        </Section>
        <Section title="Backup & Restore" icon={<Download className="w-5 h-5 text-emerald-600" />}>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportJSON}><Download className="w-4 h-4" /> Export JSON</Button>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border bg-white cursor-pointer">
              <Upload className="w-4 h-4" /> Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
            </label>
          </div>
          <div className="text-xs text-slate-500 mt-2">Data is also saved locally in your browser.</div>
        </Section>
      </div>
    );
  };

// ---------------- Layout ----------------
const NavButton = ({ id, title, icon }) => (
  <button
    onClick={() => setTab(id)}
    className={`flex items-center gap-2 px-3.5 py-3 md:py-2 rounded-xl border text-sm ${
      tab === id
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white border-slate-200 hover:bg-slate-50"
    }`}
  >
    {icon}
    <span>{title}</span>
  </button>
);

// Mobile bottom nav (only shows on small screens)
const MobileNav = () => (
  <nav
    className="md:hidden fixed left-1/2 -translate-x-1/2 bottom-2 z-50 w-[min(640px,92%)] rounded-2xl border bg-white/95 shadow-lg backdrop-blur px-2 py-2"
    style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)` }}
  >
    <div className="grid grid-cols-5 gap-2">
      <button onClick={() => setTab('plant')}   className={`flex flex-col items-center rounded-xl py-2 ${tab==='plant'   ?'bg-emerald-600 text-white':'text-slate-700 bg-slate-50'}`}><Plus className="w-4 h-4"/><span className="text-[10px] mt-1">Plant</span></button>
      <button onClick={() => setTab('track')}   className={`flex flex-col items-center rounded-xl py-2 ${tab==='track'   ?'bg-emerald-600 text-white':'text-slate-700 bg-slate-50'}`}><Calendar className="w-4 h-4"/><span className="text-[10px] mt-1">Track</span></button>
      <button onClick={() => setTab('harvest')} className={`flex flex-col items-center rounded-xl py-2 ${tab==='harvest' ?'bg-emerald-600 text-white':'text-slate-700 bg-slate-50'}`}><Leaf className="w-4 h-4"/><span className="text-[10px] mt-1">Harvest</span></button>
      <button onClick={() => setTab('reports')} className={`flex flex-col items-center rounded-xl py-2 ${tab==='reports' ?'bg-emerald-600 text-white':'text-slate-700 bg-slate-50'}`}><BarChart3 className="w-4 h-4"/><span className="text-[10px] mt-1">Reports</span></button>
      <button onClick={() => setTab('settings')}className={`flex flex-col items-center rounded-xl py-2 ${tab==='settings'?'bg-emerald-600 text-white':'text-slate-700 bg-slate-50'}`}><Edit3 className="w-4 h-4"/><span className="text-[10px] mt-1">Settings</span></button>
    </div>
  </nav>
);


  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="max-w-7xl mx-auto px-4 md:px-6 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white grid place-items-center"><Leaf className="w-6 h-6" /></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Kai Keeper</h1>
              <div className="text-slate-500 text-sm">Plant • Track • Harvest • Report</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NavButton id="plant" title="Plant" icon={<Plus className="w-4 h-4" />} />
            <NavButton id="track" title="Track" icon={<Calendar className="w-4 h-4" />} />
            <NavButton id="harvest" title="Harvests" icon={<Leaf className="w-4 h-4" />} />
            <NavButton id="reports" title="Reports" icon={<BarChart3 className="w-4 h-4" />} />
            <NavButton id="settings" title="Settings" icon={<Edit3 className="w-4 h-4" />} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 pb-16 space-y-4">
        {tab === "plant" && <PlantForm />}
        {tab === "track" && <Tracker />}
        {tab === "harvest" && <HarvestLedger />}
        {tab === "reports" && <Reports />}
        {tab === "settings" && <Settings />}
      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-6 py-8 text-center text-xs text-slate-500">
        Built for Aotearoa growers • Uses localStorage for data • Tip: export a JSON backup after big updates.
      </footer>
    </div>
  );
}
