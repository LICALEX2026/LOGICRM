import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
});

let readyPromise;

async function query(text, params = []) {
  await ensureDb();
  return pool.query(text, params);
}

function now() {
  return new Date().toISOString();
}

function buildHistoryEntry(type, status, notes, actor = "Sistema") {
  return {
    type,
    status,
    notes: String(notes || "").trim(),
    actor,
    created_at: now()
  };
}

async function ensureDb() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        priority TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS operators (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        license TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        label TEXT NOT NULL,
        plate TEXT NOT NULL,
        type TEXT NOT NULL,
        capacity TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipments (
        id SERIAL PRIMARY KEY,
        tracking_code TEXT NOT NULL UNIQUE,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        origin TEXT NOT NULL,
        destination TEXT NOT NULL,
        departure_date DATE NOT NULL,
        status TEXT NOT NULL,
        operator_name TEXT NOT NULL,
        vehicle TEXT NOT NULL,
        cargo TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shipment_history (
        id SERIAL PRIMARY KEY,
        shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const clientsCount = Number((await pool.query("SELECT COUNT(*)::int AS total FROM clients")).rows[0].total);
    if (!clientsCount) {
      await pool.query(`
        INSERT INTO clients (id, name, company, email, phone, priority) VALUES
        (1,'Laura Martinez','Distribuciones del Norte','laura@disnorte.com','55 2100 1144','Alta'),
        (2,'Carlos Vega','Farmared Express','cvega@farmared.mx','81 4550 7755','Media'),
        (3,'Ana Torres','Retail Pacifico','ana@retailpacifico.mx','33 9021 8844','Alta')
        ON CONFLICT DO NOTHING
      `);
    }

    const usersCount = Number((await pool.query("SELECT COUNT(*)::int AS total FROM users")).rows[0].total);
    if (!usersCount) {
      await pool.query(`
        INSERT INTO users (id, username, password, name, role, client_id) VALUES
        (1,'admin','admin123','Coordinacion Atlas','Administrador',NULL),
        (2,'operaciones','operaciones123','Mesa Operativa','Operaciones',NULL),
        (3,'ventas','ventas123','Equipo Comercial','Ventas',NULL),
        (4,'disnorte','cliente123','Laura Martinez','Cliente',1),
        (5,'farmared','cliente123','Carlos Vega','Cliente',2)
        ON CONFLICT (username) DO NOTHING
      `);
    }

    const operatorsCount = Number((await pool.query("SELECT COUNT(*)::int AS total FROM operators")).rows[0].total);
    if (!operatorsCount) {
      await pool.query(`
        INSERT INTO operators (id, name, phone, license, status) VALUES
        (1,'Miguel Leon','55 7788 1122','LIC-AT-001','Disponible'),
        (2,'Sofia Campos','81 2233 8899','LIC-AT-002','En ruta')
        ON CONFLICT DO NOTHING
      `);
    }

    const vehiclesCount = Number((await pool.query("SELECT COUNT(*)::int AS total FROM vehicles")).rows[0].total);
    if (!vehiclesCount) {
      await pool.query(`
        INSERT INTO vehicles (id, label, plate, type, capacity, status) VALUES
        (1,'Caja 18T','AT-901-XP','Caja seca','18 toneladas','Disponible'),
        (2,'Rabon 3.5T','AT-447-KL','Rabon','3.5 toneladas','En ruta')
        ON CONFLICT DO NOTHING
      `);
    }

    const shipmentsCount = Number((await pool.query("SELECT COUNT(*)::int AS total FROM shipments")).rows[0].total);
    if (!shipmentsCount) {
      await pool.query(`
        INSERT INTO shipments (id, tracking_code, client_id, origin, destination, departure_date, status, operator_name, vehicle, cargo, notes) VALUES
        (1,'AT-24051',1,'CDMX','Queretaro',CURRENT_DATE,'En transito','Miguel Leon','Caja 18T','Electrodomesticos','Entrega prioritaria'),
        (2,'AT-24052',2,'Monterrey','Saltillo',CURRENT_DATE,'Pendiente','Sofia Campos','Rabon 3.5T','Medicamento','Esperando liberacion de carga')
        ON CONFLICT (tracking_code) DO NOTHING
      `);
      await pool.query(`
        INSERT INTO shipment_history (shipment_id, type, status, notes, actor) VALUES
        (1,'Creacion','En transito','Envio registrado como prioritario.','Coordinacion Atlas'),
        (2,'Creacion','Pendiente','Carga en espera de liberacion.','Coordinacion Atlas')
      `);
    }
  })();
  return readyPromise;
}

function sanitizeUserRow(row) {
  const user = {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role
  };
  if (row.client_id) {
    user.client_id = row.client_id;
    user.client_company = row.client_company || "Cliente";
  }
  return user;
}

async function loadHistory(shipmentId) {
  const { rows } = await query(
    "SELECT id, type, status, notes, actor, created_at FROM shipment_history WHERE shipment_id = $1 ORDER BY created_at DESC, id DESC",
    [shipmentId]
  );
  return rows;
}

function restrictShipmentRows(rows, user) {
  return user?.role === "Cliente"
    ? rows.filter((row) => Number(row.client_id) === Number(user.client_id))
    : rows;
}

export async function findUser(username, password) {
  const { rows } = await query(`
    SELECT users.id, users.username, users.name, users.role, users.client_id, clients.company AS client_company
    FROM users
    LEFT JOIN clients ON clients.id = users.client_id
    WHERE users.username = $1 AND users.password = $2
    LIMIT 1
  `, [username, password]);
  return rows[0] ? sanitizeUserRow(rows[0]) : null;
}

export async function listUsers() {
  const { rows } = await query(`
    SELECT users.id, users.username, users.name, users.role, users.client_id, clients.company AS client_company
    FROM users
    LEFT JOIN clients ON clients.id = users.client_id
    ORDER BY users.name ASC
  `);
  return rows.map(sanitizeUserRow);
}

export async function createUser(payload) {
  const { rows } = await query(`
    INSERT INTO users (username, password, name, role, client_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, username, name, role, client_id
  `, [payload.username.trim(), payload.password.trim(), payload.name.trim(), payload.role.trim(), payload.role.trim() === "Cliente" ? Number(payload.client_id) : null]);
  const user = rows[0];
  const clientCompany = user.client_id ? (await query("SELECT company FROM clients WHERE id = $1", [user.client_id])).rows[0]?.company : null;
  return sanitizeUserRow({ ...user, client_company: clientCompany });
}

export async function createClientUserInvite(payload) {
  const password = payload.password?.trim() || `cliente${payload.client_id}123`;
  const user = await createUser({ ...payload, role: "Cliente", password });
  return { user, temporaryPassword: password };
}

export async function updateUser(id, payload) {
  const params = [
    payload.username.trim(),
    payload.name.trim(),
    payload.role.trim(),
    payload.role.trim() === "Cliente" ? Number(payload.client_id) : null,
    Number(id)
  ];
  let sql = `
    UPDATE users
    SET username = $1, name = $2, role = $3, client_id = $4
  `;
  if (payload.password && payload.password.trim()) {
    params.splice(4, 0, payload.password.trim());
    sql += ", password = $5 WHERE id = $6 RETURNING id, username, name, role, client_id";
  } else {
    sql += " WHERE id = $5 RETURNING id, username, name, role, client_id";
  }
  const { rows } = await query(sql, params);
  if (!rows[0]) return null;
  const user = rows[0];
  const clientCompany = user.client_id ? (await query("SELECT company FROM clients WHERE id = $1", [user.client_id])).rows[0]?.company : null;
  return sanitizeUserRow({ ...user, client_company: clientCompany });
}

export async function changeOwnPassword(sessionUser, currentPassword, newPassword) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [sessionUser.id]);
  const user = rows[0];
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.password !== currentPassword.trim()) throw new Error("INVALID_PASSWORD");
  await query("UPDATE users SET password = $1 WHERE id = $2", [newPassword.trim(), sessionUser.id]);
  return findUser(user.username, newPassword.trim());
}

export async function adminResetPassword(id, newPassword) {
  const { rows } = await query("UPDATE users SET password = $1 WHERE id = $2 RETURNING username", [newPassword.trim(), Number(id)]);
  if (!rows[0]) return null;
  return (await query(`
    SELECT users.id, users.username, users.name, users.role, users.client_id, clients.company AS client_company
    FROM users LEFT JOIN clients ON clients.id = users.client_id WHERE users.id = $1
  `, [Number(id)])).rows.map(sanitizeUserRow)[0];
}

export async function deleteUser(id) {
  const result = await query("DELETE FROM users WHERE id = $1", [Number(id)]);
  return result.rowCount > 0;
}

export async function getSummary(user = null) {
  const shipments = await listShipments("Todos", user);
  const clients = await listClients(user);
  const operators = user?.role === "Cliente" ? 0 : Number((await query("SELECT COUNT(*)::int AS total FROM operators")).rows[0].total);
  const vehicles = user?.role === "Cliente" ? 0 : Number((await query("SELECT COUNT(*)::int AS total FROM vehicles")).rows[0].total);
  return {
    clients: clients.length,
    shipments: shipments.length,
    operators,
    vehicles,
    inTransit: shipments.filter((item) => item.status === "En transito").length,
    incidents: shipments.filter((item) => item.status === "Incidencia").length,
    completed: shipments.filter((item) => item.status === "Entregado").length
  };
}

export async function listClients(user = null) {
  const { rows } = user?.role === "Cliente"
    ? await query("SELECT * FROM clients WHERE id = $1 ORDER BY id DESC", [Number(user.client_id)])
    : await query("SELECT * FROM clients ORDER BY id DESC");
  return rows;
}

export async function createClient(payload) {
  const { rows } = await query(`
    INSERT INTO clients (name, company, email, phone, priority)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [payload.name.trim(), payload.company.trim(), payload.email.trim(), payload.phone.trim(), payload.priority.trim()]);
  return rows[0];
}

export async function updateClient(id, payload) {
  const { rows } = await query(`
    UPDATE clients
    SET name = $1, company = $2, email = $3, phone = $4, priority = $5
    WHERE id = $6
    RETURNING *
  `, [payload.name.trim(), payload.company.trim(), payload.email.trim(), payload.phone.trim(), payload.priority.trim(), Number(id)]);
  return rows[0] || null;
}

export async function deleteClient(id) {
  const result = await query("DELETE FROM clients WHERE id = $1", [Number(id)]);
  return result.rowCount > 0;
}

export async function listOperators() {
  return (await query("SELECT * FROM operators ORDER BY id DESC")).rows;
}

export async function createOperator(payload) {
  const { rows } = await query(`
    INSERT INTO operators (name, phone, license, status)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [payload.name.trim(), payload.phone.trim(), payload.license.trim(), payload.status.trim()]);
  return rows[0];
}

export async function updateOperator(id, payload) {
  const { rows } = await query(`
    UPDATE operators
    SET name = $1, phone = $2, license = $3, status = $4
    WHERE id = $5
    RETURNING *
  `, [payload.name.trim(), payload.phone.trim(), payload.license.trim(), payload.status.trim(), Number(id)]);
  return rows[0] || null;
}

export async function deleteOperator(id) {
  const result = await query("DELETE FROM operators WHERE id = $1", [Number(id)]);
  return result.rowCount > 0;
}

export async function listVehicles() {
  return (await query("SELECT * FROM vehicles ORDER BY id DESC")).rows;
}

export async function createVehicle(payload) {
  const { rows } = await query(`
    INSERT INTO vehicles (label, plate, type, capacity, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [payload.label.trim(), payload.plate.trim(), payload.type.trim(), payload.capacity.trim(), payload.status.trim()]);
  return rows[0];
}

export async function updateVehicle(id, payload) {
  const { rows } = await query(`
    UPDATE vehicles
    SET label = $1, plate = $2, type = $3, capacity = $4, status = $5
    WHERE id = $6
    RETURNING *
  `, [payload.label.trim(), payload.plate.trim(), payload.type.trim(), payload.capacity.trim(), payload.status.trim(), Number(id)]);
  return rows[0] || null;
}

export async function deleteVehicle(id) {
  const result = await query("DELETE FROM vehicles WHERE id = $1", [Number(id)]);
  return result.rowCount > 0;
}

export async function listShipments(status = "Todos", user = null) {
  const params = [];
  const where = [];
  if (status !== "Todos") {
    params.push(status);
    where.push(`shipments.status = $${params.length}`);
  }
  if (user?.role === "Cliente") {
    params.push(Number(user.client_id));
    where.push(`shipments.client_id = $${params.length}`);
  }
  const sql = `
    SELECT shipments.*, clients.name AS client_name, clients.company AS client_company
    FROM shipments
    JOIN clients ON clients.id = shipments.client_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY shipments.departure_date ASC, shipments.id DESC
  `;
  return (await query(sql, params)).rows;
}

export async function getShipmentById(id, user = null) {
  const rows = await query(`
    SELECT shipments.*, clients.name AS client_name, clients.company AS client_company
    FROM shipments
    JOIN clients ON clients.id = shipments.client_id
    WHERE shipments.id = $1
    LIMIT 1
  `, [Number(id)]);
  const shipment = rows.rows[0];
  if (!shipment) return null;
  if (user?.role === "Cliente" && Number(shipment.client_id) !== Number(user.client_id)) return null;
  shipment.history = await loadHistory(shipment.id);
  return shipment;
}

export async function createShipment(payload) {
  const { rows } = await query(`
    INSERT INTO shipments (tracking_code, client_id, origin, destination, departure_date, status, operator_name, vehicle, cargo, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [
    payload.tracking_code.trim(),
    Number(payload.client_id),
    payload.origin.trim(),
    payload.destination.trim(),
    payload.departure_date,
    payload.status.trim(),
    payload.operator_name.trim(),
    payload.vehicle.trim(),
    payload.cargo.trim(),
    String(payload.notes || "").trim()
  ]);
  const shipment = rows[0];
  const history = buildHistoryEntry("Creacion", payload.status.trim(), String(payload.notes || "Envio creado en el sistema.").trim(), "Coordinacion Atlas");
  await query("INSERT INTO shipment_history (shipment_id, type, status, notes, actor, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [shipment.id, history.type, history.status, history.notes, history.actor, history.created_at]);
  return getShipmentById(shipment.id);
}

export async function updateShipment(id, payload) {
  const current = await getShipmentById(id);
  if (!current) return null;
  const { rows } = await query(`
    UPDATE shipments
    SET tracking_code = $1, client_id = $2, origin = $3, destination = $4, departure_date = $5, status = $6, operator_name = $7, vehicle = $8, cargo = $9, notes = $10
    WHERE id = $11
    RETURNING *
  `, [
    payload.tracking_code.trim(),
    Number(payload.client_id),
    payload.origin.trim(),
    payload.destination.trim(),
    payload.departure_date,
    payload.status.trim(),
    payload.operator_name.trim(),
    payload.vehicle.trim(),
    payload.cargo.trim(),
    String(payload.notes || "").trim(),
    Number(id)
  ]);
  if (!rows[0]) return null;
  const note = current.status !== payload.status.trim()
    ? `Estado cambiado de ${current.status} a ${payload.status.trim()}. ${String(payload.notes || "").trim()}`.trim()
    : String(payload.notes || "Datos operativos actualizados.").trim();
  const history = buildHistoryEntry("Actualizacion", payload.status.trim(), note, "Coordinacion Atlas");
  await query("INSERT INTO shipment_history (shipment_id, type, status, notes, actor, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [Number(id), history.type, history.status, history.notes, history.actor, history.created_at]);
  return getShipmentById(id);
}

export async function updateShipmentStatus(id, status, notes = "") {
  const result = await query("UPDATE shipments SET status = $1, notes = $2 WHERE id = $3", [status.trim(), String(notes).trim(), Number(id)]);
  if (!result.rowCount) return false;
  const history = buildHistoryEntry("Seguimiento", status.trim(), String(notes || `Estado actualizado a ${status.trim()}.`).trim(), "Coordinacion Atlas");
  await query("INSERT INTO shipment_history (shipment_id, type, status, notes, actor, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [Number(id), history.type, history.status, history.notes, history.actor, history.created_at]);
  return true;
}

export async function deleteShipment(id) {
  const result = await query("DELETE FROM shipments WHERE id = $1", [Number(id)]);
  return result.rowCount > 0;
}
