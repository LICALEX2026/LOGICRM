import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(__dirname, "..", "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "crm-data.json");

function now() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextId(items) {
  return items.length ? Math.max(...items.map((item) => Number(item.id))) + 1 : 1;
}

function buildHistoryEntry(type, status, notes, actor = "Sistema") {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    status,
    notes: String(notes || "").trim(),
    actor,
    created_at: now()
  };
}

function defaultUsers() {
  return [
    { id: 1, username: "admin", password: "admin123", name: "Coordinacion Atlas", role: "Administrador" },
    { id: 2, username: "operaciones", password: "operaciones123", name: "Mesa Operativa", role: "Operaciones" },
    { id: 3, username: "ventas", password: "ventas123", name: "Equipo Comercial", role: "Ventas" }
  ];
}

function defaultClients() {
  return [
    { id: 1, name: "Laura Martinez", company: "Distribuciones del Norte", email: "laura@disnorte.com", phone: "55 2100 1144", priority: "Alta", created_at: now() },
    { id: 2, name: "Carlos Vega", company: "Farmared Express", email: "cvega@farmared.mx", phone: "81 4550 7755", priority: "Media", created_at: now() },
    { id: 3, name: "Ana Torres", company: "Retail Pacifico", email: "ana@retailpacifico.mx", phone: "33 9021 8844", priority: "Alta", created_at: now() }
  ];
}

function defaultClientUsers() {
  return [
    { id: 4, username: "disnorte", password: "cliente123", name: "Laura Martinez", role: "Cliente", client_id: 1 },
    { id: 5, username: "farmared", password: "cliente123", name: "Carlos Vega", role: "Cliente", client_id: 2 }
  ];
}

function seedData() {
  return {
    users: [...defaultUsers(), ...defaultClientUsers()],
    clients: defaultClients(),
    operators: [
      { id: 1, name: "Miguel Leon", phone: "55 7788 1122", license: "LIC-AT-001", status: "Disponible", created_at: now() },
      { id: 2, name: "Sofia Campos", phone: "81 2233 8899", license: "LIC-AT-002", status: "En ruta", created_at: now() }
    ],
    vehicles: [
      { id: 1, label: "Caja 18T", plate: "AT-901-XP", type: "Caja seca", capacity: "18 toneladas", status: "Disponible", created_at: now() },
      { id: 2, label: "Rabon 3.5T", plate: "AT-447-KL", type: "Rabon", capacity: "3.5 toneladas", status: "En ruta", created_at: now() }
    ],
    shipments: [
      {
        id: 1,
        tracking_code: "AT-24051",
        client_id: 1,
        origin: "CDMX",
        destination: "Queretaro",
        departure_date: today(),
        status: "En transito",
        operator_name: "Miguel Leon",
        vehicle: "Caja 18T",
        cargo: "Electrodomesticos",
        notes: "Entrega prioritaria",
        created_at: now(),
        history: [{ id: 1, type: "Creacion", status: "En transito", notes: "Envio registrado como prioritario.", actor: "Coordinacion Atlas", created_at: now() }]
      },
      {
        id: 2,
        tracking_code: "AT-24052",
        client_id: 2,
        origin: "Monterrey",
        destination: "Saltillo",
        departure_date: today(),
        status: "Pendiente",
        operator_name: "Sofia Campos",
        vehicle: "Rabon 3.5T",
        cargo: "Medicamento",
        notes: "Esperando liberacion de carga",
        created_at: now(),
        history: [{ id: 2, type: "Creacion", status: "Pendiente", notes: "Carga en espera de liberacion.", actor: "Coordinacion Atlas", created_at: now() }]
      }
    ]
  };
}

function ensureDb() {
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, JSON.stringify(seedData(), null, 2), "utf8");
  }
}

function normalizeUsers(data) {
  data.users = data.users || defaultUsers();
  const hasCoreRoles = data.users.some((user) => user.role === "Operaciones") && data.users.some((user) => user.role === "Ventas");
  if (!hasCoreRoles) {
    defaultUsers().forEach((baseUser) => {
      if (!data.users.some((user) => user.username === baseUser.username)) {
        data.users.push(baseUser);
      }
    });
  }
  defaultClientUsers().forEach((baseUser) => {
    if (!data.users.some((user) => user.username === baseUser.username)) {
      data.users.push(baseUser);
    }
  });
}

function normalizeData(data) {
  normalizeUsers(data);
  data.clients = data.clients || defaultClients();
  data.operators = data.operators || [];
  data.vehicles = data.vehicles || [];
  data.shipments = (data.shipments || []).map((shipment) => ({
    ...shipment,
    history: shipment.history || [buildHistoryEntry("Migracion", shipment.status || "Pendiente", shipment.notes || "Bitacora inicial creada.", "Sistema")]
  }));
  return data;
}

function readDb() {
  ensureDb();
  return normalizeData(JSON.parse(readFileSync(dbPath, "utf8")));
}

function writeDb(data) {
  writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}

function withClient(shipment, clients) {
  const client = clients.find((item) => item.id === shipment.client_id);
  return { ...shipment, client_name: client?.name || "Cliente", client_company: client?.company || "Cliente" };
}

function sanitizeUser(user, clients) {
  const safeUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  if (user.client_id) {
    const client = clients.find((item) => item.id === user.client_id);
    safeUser.client_id = user.client_id;
    safeUser.client_company = client?.company || "Cliente";
  }
  return safeUser;
}

export function findUser(username, password) {
  const db = readDb();
  const user = db.users.find((item) => item.username === username && item.password === password);
  return user ? sanitizeUser(user, db.clients) : null;
}

export function listUsers() {
  const db = readDb();
  return db.users.map((user) => sanitizeUser(user, db.clients)).sort((a, b) => a.name.localeCompare(b.name));
}

export function createUser(payload) {
  const db = readDb();
  if (db.users.some((user) => user.username === payload.username.trim())) throw new Error("USERNAME_EXISTS");
  const user = { id: nextId(db.users), username: payload.username.trim(), password: payload.password.trim(), name: payload.name.trim(), role: payload.role.trim() };
  if (payload.role.trim() === "Cliente") user.client_id = Number(payload.client_id);
  db.users.push(user);
  writeDb(db);
  return sanitizeUser(user, db.clients);
}

export function createClientUserInvite(payload) {
  const db = readDb();
  const clientId = Number(payload.client_id);
  const client = db.clients.find((item) => item.id === clientId);
  if (!client) throw new Error("CLIENT_NOT_FOUND");
  const username = payload.username.trim();
  if (db.users.some((user) => user.username === username)) throw new Error("USERNAME_EXISTS");
  if (db.users.some((user) => Number(user.client_id) === clientId)) throw new Error("CLIENT_USER_EXISTS");
  const password = payload.password?.trim() || `cliente${clientId}123`;
  const user = { id: nextId(db.users), username, password, name: payload.name.trim() || client.name, role: "Cliente", client_id: clientId };
  db.users.push(user);
  writeDb(db);
  return { user: sanitizeUser(user, db.clients), temporaryPassword: password };
}

export function updateUser(id, payload) {
  const db = readDb();
  const user = db.users.find((item) => item.id === Number(id));
  if (!user) return null;
  const duplicate = db.users.find((item) => item.username === payload.username.trim() && item.id !== Number(id));
  if (duplicate) throw new Error("USERNAME_EXISTS");
  user.username = payload.username.trim();
  user.name = payload.name.trim();
  user.role = payload.role.trim();
  if (payload.password && payload.password.trim()) user.password = payload.password.trim();
  if (user.role === "Cliente") user.client_id = Number(payload.client_id);
  else delete user.client_id;
  writeDb(db);
  return sanitizeUser(user, db.clients);
}

export function changeOwnPassword(sessionUser, currentPassword, newPassword) {
  const db = readDb();
  const user = db.users.find((item) => item.id === Number(sessionUser.id));
  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.password !== currentPassword.trim()) throw new Error("INVALID_PASSWORD");
  user.password = newPassword.trim();
  writeDb(db);
  return sanitizeUser(user, db.clients);
}

export function adminResetPassword(id, newPassword) {
  const db = readDb();
  const user = db.users.find((item) => item.id === Number(id));
  if (!user) return null;
  user.password = newPassword.trim();
  writeDb(db);
  return sanitizeUser(user, db.clients);
}

export function deleteUser(id) {
  const db = readDb();
  const index = db.users.findIndex((item) => item.id === Number(id));
  if (index === -1) return false;
  db.users.splice(index, 1);
  writeDb(db);
  return true;
}

export function getSummary(user = null) {
  const db = readDb();
  const shipments = user?.role === "Cliente" ? db.shipments.filter((item) => item.client_id === Number(user.client_id)) : db.shipments;
  const clients = user?.role === "Cliente" ? db.clients.filter((item) => item.id === Number(user.client_id)) : db.clients;
  return {
    clients: clients.length,
    shipments: shipments.length,
    operators: user?.role === "Cliente" ? 0 : db.operators.length,
    vehicles: user?.role === "Cliente" ? 0 : db.vehicles.length,
    inTransit: shipments.filter((item) => item.status === "En transito").length,
    incidents: shipments.filter((item) => item.status === "Incidencia").length,
    completed: shipments.filter((item) => item.status === "Entregado").length
  };
}

export function listClients(user = null) {
  const db = readDb();
  const clients = user?.role === "Cliente" ? db.clients.filter((item) => item.id === Number(user.client_id)) : db.clients;
  return [...clients].sort((a, b) => b.id - a.id);
}

export function createClient(payload) {
  const db = readDb();
  const client = { id: nextId(db.clients), name: payload.name.trim(), company: payload.company.trim(), email: payload.email.trim(), phone: payload.phone.trim(), priority: payload.priority.trim(), created_at: now() };
  db.clients.push(client);
  writeDb(db);
  return client;
}

export function updateClient(id, payload) {
  const db = readDb();
  const client = db.clients.find((item) => item.id === Number(id));
  if (!client) return null;
  client.name = payload.name.trim();
  client.company = payload.company.trim();
  client.email = payload.email.trim();
  client.phone = payload.phone.trim();
  client.priority = payload.priority.trim();
  writeDb(db);
  return client;
}

export function deleteClient(id) {
  const db = readDb();
  const clientId = Number(id);
  if (db.shipments.some((item) => item.client_id === clientId)) throw new Error("CLIENT_HAS_SHIPMENTS");
  if (db.users.some((item) => item.client_id === clientId)) throw new Error("CLIENT_HAS_USER");
  const index = db.clients.findIndex((item) => item.id === clientId);
  if (index === -1) return false;
  db.clients.splice(index, 1);
  writeDb(db);
  return true;
}

export function listOperators() {
  const db = readDb();
  return [...db.operators].sort((a, b) => b.id - a.id);
}

export function createOperator(payload) {
  const db = readDb();
  const operator = { id: nextId(db.operators), name: payload.name.trim(), phone: payload.phone.trim(), license: payload.license.trim(), status: payload.status.trim(), created_at: now() };
  db.operators.push(operator);
  writeDb(db);
  return operator;
}

export function updateOperator(id, payload) {
  const db = readDb();
  const operator = db.operators.find((item) => item.id === Number(id));
  if (!operator) return null;
  operator.name = payload.name.trim();
  operator.phone = payload.phone.trim();
  operator.license = payload.license.trim();
  operator.status = payload.status.trim();
  writeDb(db);
  return operator;
}

export function deleteOperator(id) {
  const db = readDb();
  const index = db.operators.findIndex((item) => item.id === Number(id));
  if (index === -1) return false;
  db.operators.splice(index, 1);
  writeDb(db);
  return true;
}

export function listVehicles() {
  const db = readDb();
  return [...db.vehicles].sort((a, b) => b.id - a.id);
}

export function createVehicle(payload) {
  const db = readDb();
  const vehicle = { id: nextId(db.vehicles), label: payload.label.trim(), plate: payload.plate.trim(), type: payload.type.trim(), capacity: payload.capacity.trim(), status: payload.status.trim(), created_at: now() };
  db.vehicles.push(vehicle);
  writeDb(db);
  return vehicle;
}

export function updateVehicle(id, payload) {
  const db = readDb();
  const vehicle = db.vehicles.find((item) => item.id === Number(id));
  if (!vehicle) return null;
  vehicle.label = payload.label.trim();
  vehicle.plate = payload.plate.trim();
  vehicle.type = payload.type.trim();
  vehicle.capacity = payload.capacity.trim();
  vehicle.status = payload.status.trim();
  writeDb(db);
  return vehicle;
}

export function deleteVehicle(id) {
  const db = readDb();
  const index = db.vehicles.findIndex((item) => item.id === Number(id));
  if (index === -1) return false;
  db.vehicles.splice(index, 1);
  writeDb(db);
  return true;
}

export function listShipments(status = "Todos", user = null) {
  const db = readDb();
  let shipments = user?.role === "Cliente" ? db.shipments.filter((item) => item.client_id === Number(user.client_id)) : db.shipments;
  if (status !== "Todos") shipments = shipments.filter((item) => item.status === status);
  return shipments.map((shipment) => withClient(shipment, db.clients)).sort((a, b) => a.departure_date.localeCompare(b.departure_date) || b.id - a.id);
}

export function getShipmentById(id, user = null) {
  const db = readDb();
  const shipment = db.shipments.find((item) => item.id === Number(id));
  if (!shipment) return null;
  if (user?.role === "Cliente" && shipment.client_id !== Number(user.client_id)) return null;
  return withClient(shipment, db.clients);
}

export function createShipment(payload) {
  const db = readDb();
  if (db.shipments.some((item) => item.tracking_code === payload.tracking_code.trim())) throw new Error("DUPLICATE_TRACKING");
  const shipment = {
    id: nextId(db.shipments),
    tracking_code: payload.tracking_code.trim(),
    client_id: Number(payload.client_id),
    origin: payload.origin.trim(),
    destination: payload.destination.trim(),
    departure_date: payload.departure_date,
    status: payload.status.trim(),
    operator_name: payload.operator_name.trim(),
    vehicle: payload.vehicle.trim(),
    cargo: payload.cargo.trim(),
    notes: String(payload.notes || "").trim(),
    created_at: now(),
    history: [buildHistoryEntry("Creacion", payload.status.trim(), String(payload.notes || "Envio creado en el sistema.").trim(), "Coordinacion Atlas")]
  };
  db.shipments.push(shipment);
  writeDb(db);
  return withClient(shipment, db.clients);
}

export function updateShipment(id, payload) {
  const db = readDb();
  const shipment = db.shipments.find((item) => item.id === Number(id));
  if (!shipment) return null;
  const previousStatus = shipment.status;
  shipment.tracking_code = payload.tracking_code.trim();
  shipment.client_id = Number(payload.client_id);
  shipment.origin = payload.origin.trim();
  shipment.destination = payload.destination.trim();
  shipment.departure_date = payload.departure_date;
  shipment.status = payload.status.trim();
  shipment.operator_name = payload.operator_name.trim();
  shipment.vehicle = payload.vehicle.trim();
  shipment.cargo = payload.cargo.trim();
  shipment.notes = String(payload.notes || "").trim();
  shipment.history = shipment.history || [];
  shipment.history.unshift(buildHistoryEntry("Actualizacion", shipment.status, previousStatus !== shipment.status ? `Estado cambiado de ${previousStatus} a ${shipment.status}. ${shipment.notes}`.trim() : shipment.notes || "Datos operativos actualizados.", "Coordinacion Atlas"));
  writeDb(db);
  return withClient(shipment, db.clients);
}

export function updateShipmentStatus(id, status, notes = "") {
  const db = readDb();
  const shipment = db.shipments.find((item) => item.id === Number(id));
  if (!shipment) return false;
  shipment.status = status.trim();
  shipment.notes = String(notes).trim();
  shipment.history = shipment.history || [];
  shipment.history.unshift(buildHistoryEntry("Seguimiento", shipment.status, shipment.notes || `Estado actualizado a ${shipment.status}.`, "Coordinacion Atlas"));
  writeDb(db);
  return true;
}

export function deleteShipment(id) {
  const db = readDb();
  const index = db.shipments.findIndex((item) => item.id === Number(id));
  if (index === -1) return false;
  db.shipments.splice(index, 1);
  writeDb(db);
  return true;
}
