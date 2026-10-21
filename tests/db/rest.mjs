// Minimal PostgREST emulator over PGlite for tests: enough of the query syntax the API uses.
export async function createRest(db) {
  const columns = {};
  for (const row of (await db.query(`select table_name, column_name, data_type, udt_name from information_schema.columns where table_schema='public'`)).rows) {
    (columns[row.table_name] ||= {})[row.column_name] = row.data_type === 'ARRAY' ? `${row.udt_name.slice(1)}[]` : row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type;
  }
  const embeds = {
    scheduled_posts: { publish_jobs: { many: true, local: 'id', foreign: 'post_id' } },
    publish_jobs: { scheduled_posts: { many: false, local: 'post_id', foreign: 'id' } }
  };
  const q = (name) => `"${name}"`;

  function parseSelect(table, select = '*') {
    const parts = [];
    let depth = 0, current = '';
    for (const char of select) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
    }
    if (current) parts.push(current);
    return parts.map((part) => {
      const m = /^(\w+)\((.*)\)$/.exec(part.trim());
      if (m) {
        const rel = embeds[table]?.[m[1]];
        if (!rel) throw new Error(`no embed ${table}.${m[1]}`);
        const inner = m[2] === '*' ? 't2' : `jsonb_build_object(${m[2].split(',').map((c) => `'${c}', t2.${q(c)}`).join(',')})`;
        const row = m[2] === '*' ? 'to_jsonb(t2)' : inner;
        return rel.many
          ? `'${m[1]}', coalesce((select jsonb_agg(${row}) from ${q(m[1])} t2 where t2.${q(rel.foreign)} = t.${q(rel.local)}), '[]'::jsonb)`
          : `'${m[1]}', (select ${row} from ${q(m[1])} t2 where t2.${q(rel.foreign)} = t.${q(rel.local)})`;
      }
      if (part === '*') return null;
      return `'${part}', t.${q(part)}`;
    });
  }

  function where(table, params, values) {
    const clauses = [];
    const cast = (col) => columns[table][col] || 'text';
    const one = (col, expr) => {
      if (expr === 'not.is.null') return `t.${q(col)} is not null`;
      const m = /^(eq|neq|lt|lte|gt|gte|in|is)\.(.*)$/s.exec(expr);
      if (!m) throw new Error(`bad filter ${col}=${expr}`);
      const [, op, raw] = m;
      if (op === 'is') return `t.${q(col)} is ${raw === 'null' ? 'null' : raw}`;
      if (op === 'in') {
        values.push(raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')));
        const type = cast(col).replace(/\[\]$/, '');
        return `t.${q(col)} = any($${values.length}::${type}[])`;
      }
      values.push(cast(col) === 'boolean' ? raw === 'true' : raw);
      const sym = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' }[op];
      return `t.${q(col)} ${sym} $${values.length}::${cast(col)}`;
    };
    for (const [key, value] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
      if (key === 'or') {
        const items = value.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/);
        clauses.push(`(${items.map((item) => { const [col, ...rest] = item.split('.'); return one(col, rest.join('.')); }).join(' or ')})`);
        continue;
      }
      const json = /^(\w+)->>(\w+)$/.exec(key);
      if (json) {
        if (!columns[table][json[1]] || !value.startsWith('eq.')) throw new Error(`bad json filter ${key}=${value}`);
        values.push(value.slice(3));
        clauses.push(`t.${q(json[1])}->>'${json[2]}' = $${values.length}::text`);
        continue;
      }
      if (!columns[table][key]) throw new Error(`unknown column ${table}.${key}`);
      clauses.push(one(key, value));
    }
    return clauses.length ? `where ${clauses.join(' and ')}` : '';
  }

  function rowsJson(table, select) {
    const parts = parseSelect(table, select);
    const base = parts.includes(null) ? 'to_jsonb(t)' : `'{}'::jsonb`;
    const extra = parts.filter(Boolean);
    return extra.length ? `${base} || jsonb_build_object(${extra.join(',')})` : base;
  }

  return async function handle(path, { method = 'GET', headers = {}, body } = {}) {
    const url = new URL(path, 'http://x/');
    const table = url.pathname.replace(/^\//, '');
    const params = [...url.searchParams.entries()];
    const values = [];
    const prefer = headers.prefer || '';
    let sql;
    if (table.startsWith('rpc/')) {
      const fn = table.slice(4);
      const args = JSON.parse(body || '{}');
      const keys = Object.keys(args);
      keys.forEach((key) => values.push(args[key]));
      sql = `select to_jsonb(r) as j from ${q(fn)}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')}) r`;
      const result = await db.query(sql, values);
      return result.rows.map((row) => row.j);
    }
    if (!columns[table]) throw new Error(`unknown table ${table}`);
    if (method === 'GET') {
      const order = url.searchParams.get('order');
      const orderSql = order ? `order by ${order.split(',').map((item) => { const [col, dir, nulls] = item.split('.'); return `t.${q(col)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls ? ` ${nulls.replace('nulls', 'nulls ')}` : ''}`; }).join(',')}` : '';
      const limit = url.searchParams.get('limit');
      sql = `select ${rowsJson(table, url.searchParams.get('select') || '*')} as j from ${q(table)} t ${where(table, params, values)} ${orderSql} ${limit ? `limit ${Number(limit)}` : ''}`;
      return (await db.query(sql, values)).rows.map((row) => row.j);
    }
    const returning = prefer.includes('return=representation') ? 'returning to_jsonb(t) as j' : '';
    if (method === 'POST') {
      const data = JSON.parse(body);
      const list = Array.isArray(data) ? data : [data];
      if (!list.length) return [];
      const cols = [...new Set(list.flatMap((item) => Object.keys(item)))];
      values.push(JSON.stringify(list));
      const conflict = url.searchParams.get('on_conflict');
      let onConflict = '';
      if (conflict) {
        onConflict = prefer.includes('ignore-duplicates') ? `on conflict (${conflict}) do nothing`
          : `on conflict (${conflict}) do update set ${cols.map((c) => `${q(c)} = excluded.${q(c)}`).join(',')}`;
      }
      sql = `insert into ${q(table)} as t (${cols.map(q).join(',')}) select ${cols.map(q).join(',')} from jsonb_populate_recordset(null::${q(table)}, $1::jsonb) ${onConflict} ${returning}`;
      const result = await db.query(sql, values);
      return returning ? result.rows.map((row) => row.j) : null;
    }
    if (method === 'PATCH') {
      const data = JSON.parse(body);
      const cols = Object.keys(data);
      values.push(JSON.stringify(data));
      const filter = where(table, params, values);
      const assign = cols.length === 1
        ? `${q(cols[0])} = (select r.${q(cols[0])} from jsonb_populate_record(null::${q(table)}, $1::jsonb) r)`
        : `(${cols.map(q).join(',')}) = (select ${cols.map((c) => `r.${q(c)}`).join(',')} from jsonb_populate_record(null::${q(table)}, $1::jsonb) r)`;
      sql = `update ${q(table)} t set ${assign} ${filter} ${returning}`;
      const result = await db.query(sql, values);
      return returning ? result.rows.map((row) => row.j) : null;
    }
    if (method === 'DELETE') {
      sql = `delete from ${q(table)} t ${where(table, params, values)} ${returning}`;
      const result = await db.query(sql, values);
      return returning ? result.rows.map((row) => row.j) : null;
    }
    throw new Error(`unsupported ${method}`);
  };
}
