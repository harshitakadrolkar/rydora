// Embedded fallback datastore used when MongoDB is not reachable.
// Implements the subset of the Mongoose Model API used by RYDORA and reuses the
// Mongoose schemas for casting, defaults and validation. Data is persisted to
// server/data/rydora-db.json so it survives restarts.
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '../../data/rydora-db.json');
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const collections = {};
let saveTimer = null;

export const storeState = { mode: 'mongodb' };

function normalize(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (v instanceof mongoose.Types.ObjectId) return v.toString();
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') {
    if (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') return v.toString();
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = normalize(x);
    return o;
  }
  return v;
}
const clone = normalize;

const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, p, val) {
  const keys = p.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = val;
}
const comparable = (v) => (v instanceof Date ? v.getTime() : (typeof v === 'string' && ISO.test(v) ? new Date(v).getTime() : v));

function matchValue(actual, cond) {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, val]) => {
      const a = comparable(actual); const b = comparable(normalize(val));
      switch (op) {
        case '$exists': return val ? actual !== undefined && actual !== null : actual === undefined || actual === null;
        case '$gte': return a >= b; case '$gt': return a > b;
        case '$lte': return a <= b; case '$lt': return a < b;
        case '$ne': return a !== b;
        case '$in': return val.map(normalize).includes(actual);
        default: return false;
      }
    });
  }
  const c = normalize(cond);
  if (Array.isArray(actual)) return actual.includes(c);
  return comparable(actual) === comparable(c);
}
const matches = (doc, q = {}) => Object.entries(normalize(q) || {}).every(([k, v]) => matchValue(getPath(doc, k), q[k] ?? v));

function project(doc, sel) {
  if (!sel) return doc;
  const fields = sel.split(/\s+/).filter(Boolean);
  if (fields.every((f) => f.startsWith('-'))) {
    const o = { ...doc }; for (const f of fields) delete o[f.slice(1)]; return o;
  }
  const o = { _id: doc._id };
  for (const f of fields) { const v = getPath(doc, f); if (v !== undefined) setPath(o, f, v); }
  return o;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(collections)); }
    catch (e) { console.error('[localStore] save failed', e.message); }
  }, 1500);
}

export function loadLocalStore() {
  storeState.mode = 'local';
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'), (k, v) => (typeof v === 'string' && ISO.test(v) ? new Date(v) : v));
    Object.assign(collections, raw);
    console.log(`[db] Loaded local datastore from ${path.relative(process.cwd(), FILE)}`);
  } catch { /* fresh store */ }
}

class MemQuery {
  constructor(exec, single = false) { this.exec_ = exec; this.single = single; this.sel = null; this.sortSpec = null; this.lim = 0; this.isLean = false; }
  select(s) { this.sel = s; return this; }
  sort(s) { this.sortSpec = s; return this; }
  limit(n) { this.lim = n; return this; }
  lean() { this.isLean = true; return this; }
  populate() { return this; }
  exec() {
    let rows = this.exec_();
    if (this.sortSpec) {
      const keys = Object.entries(this.sortSpec);
      rows = [...rows].sort((a, b) => {
        for (const [k, dir] of keys) {
          const x = comparable(getPath(a, k)); const y = comparable(getPath(b, k));
          if (x === y) continue;
          if (x === undefined || x === null) return 1;
          if (y === undefined || y === null) return -1;
          return (x < y ? -1 : 1) * (dir < 0 ? -1 : 1);
        }
        return 0;
      });
    }
    if (this.lim) rows = rows.slice(0, this.lim);
    rows = rows.map((r) => project(r, this.sel));
    const out = rows.map((r) => (this.isLean ? clone(r) : this.wrap(r)));
    return Promise.resolve(this.single ? out[0] || null : out);
  }
  then(res, rej) { return this.exec().then(res, rej); }
  catch(fn) { return this.exec().catch(fn); }
}

export function createMemoryModel(MongooseModel) {
  const name = MongooseModel.modelName;
  const hasTimestamps = !!MongooseModel.schema.options.timestamps;
  const col = () => (collections[name] = collections[name] || []);

  const build = (data) => {
    const d = new MongooseModel(data);
    const err = d.validateSync();
    if (err) throw err;
    const o = normalize(d.toObject({ depopulate: true }));
    if (hasTimestamps) { o.createdAt = o.createdAt || new Date(); o.updatedAt = new Date(); }
    return o;
  };

  function wrap(row) {
    const doc = clone(row);
    Object.defineProperties(doc, {
      save: { value: async () => { const i = col().findIndex((r) => r._id === doc._id); const plain = normalize({ ...doc }); if (hasTimestamps) plain.updatedAt = new Date(); if (i >= 0) col()[i] = plain; else col().push(plain); scheduleSave(); return doc; } },
      set: { value: (k, v) => { setPath(doc, k, v); return doc; } },
      toObject: { value: () => clone(doc) },
      id: { get: () => doc._id },
    });
    return doc;
  }
  const query = (fn, single) => { const q = new MemQuery(fn, single); q.wrap = wrap; return q; };

  function applyUpdate(row, update) {
    const ops = Object.keys(update).some((k) => k.startsWith('$')) ? update : { $set: update };
    for (const [k, v] of Object.entries(ops.$set || {})) setPath(row, k, normalize(v));
    for (const [k, v] of Object.entries(ops.$inc || {})) setPath(row, k, (getPath(row, k) || 0) + v);
    if (hasTimestamps) row.updatedAt = new Date();
  }

  return {
    modelName: name,
    async create(data) {
      if (Array.isArray(data)) return Promise.all(data.map((d) => this.create(d)));
      const o = build(data);
      if (name === 'User' && col().some((r) => r.email === o.email)) { const e = new Error('E11000 duplicate key: email'); e.code = 11000; throw e; }
      col().push(o); scheduleSave();
      return wrap(o);
    },
    async insertMany(arr) { const out = arr.map((d) => build(d)); col().push(...out); scheduleSave(); return out; },
    find(q = {}) { return query(() => col().filter((r) => matches(r, q))); },
    findOne(q = {}) { return query(() => col().filter((r) => matches(r, q)).slice(0, 1), true); },
    findById(id) { return query(() => col().filter((r) => r._id === String(id)).slice(0, 1), true); },
    findByIdAndUpdate(id, update) {
      return query(() => { const r = col().find((x) => x._id === String(id)); if (r) { applyUpdate(r, update); scheduleSave(); } return r ? [r] : []; }, true);
    },
    async countDocuments(q = {}) { return col().filter((r) => matches(r, q)).length; },
    async updateOne(q, update, opts = {}) {
      let r = col().find((x) => matches(x, q));
      if (!r && opts.upsert) { r = build({ ...normalize(q), ...(update.$set || {}) }); col().push(r); scheduleSave(); return { upsertedCount: 1 }; }
      if (r) { applyUpdate(r, update); scheduleSave(); }
      return { modifiedCount: r ? 1 : 0 };
    },
    async updateMany(q, update) { const rows = col().filter((x) => matches(x, q)); rows.forEach((r) => applyUpdate(r, update)); scheduleSave(); return { modifiedCount: rows.length }; },
    async deleteMany(q = {}) { const before = col().length; collections[name] = col().filter((r) => !matches(r, q)); scheduleSave(); return { deletedCount: before - col().length }; },
    async bulkWrite(ops) { for (const op of ops) if (op.updateOne) await this.updateOne(op.updateOne.filter, op.updateOne.update); return { ok: 1 }; },
  };
}

/** Wrap a Mongoose model so calls go to MongoDB or the local store depending on the active mode. */
export function dualModel(MongooseModel) {
  let mem = null;
  return new Proxy(MongooseModel, {
    get(target, prop, receiver) {
      if (storeState.mode === 'local') {
        mem = mem || createMemoryModel(MongooseModel);
        if (prop in mem) return typeof mem[prop] === 'function' ? mem[prop].bind(mem) : mem[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
