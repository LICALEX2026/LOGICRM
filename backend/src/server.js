import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createClient,
  createClientUserInvite,
  createOperator,
  createShipment,
  createUser,
  createVehicle,
  adminResetPassword,
  changeOwnPassword,
  deleteClient,
  deleteOperator,
  deleteShipment,
  deleteUser,
  deleteVehicle,
  findUser,
  getShipmentById,
  getSummary,
  listClients,
  listOperators,
  listShipments,
  listUsers,
  listVehicles,
  updateClient,
  updateOperator,
  updateShipment,
  updateShipmentStatus,
  updateUser,
  updateVehicle
} from "./db.js";

const app = express();
const PORT = process.env.PORT || 4100;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

function parseSession(req) {
  const raw = req.headers["x-user-session"];
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireRole(req, res, roles) {
  const user = parseSession(req);
  if (!user || !roles.includes(user.role)) {
    res.status(403).json({ error: "No tienes permisos para esta accion." });
    return null;
  }
  return user;
}

function requireInternalUser(req, res) {
  return requireRole(req, res, ["Administrador", "Operaciones", "Ventas", "Logistica / Trafico"]);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.post("/api/login", async (req, res) => {
  const { username = "", password = "" } = req.body;
  const user = await findUser(username.trim(), password.trim());

  if (!user) {
    res.status(401).json({ error: "Credenciales invalidas." });
    return;
  }

  res.json({ user });
});

app.post("/api/change-password", async (req, res) => {
  const sessionUser = parseSession(req);
  if (!sessionUser) {
    res.status(401).json({ error: "Sesion invalida." });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Debes capturar la contrasena actual y la nueva." });
    return;
  }

  try {
    const user = await changeOwnPassword(sessionUser, currentPassword, newPassword);
    res.json({ user });
  } catch (error) {
    if (error.message === "INVALID_PASSWORD") {
      res.status(400).json({ error: "La contrasena actual no coincide." });
      return;
    }
    res.status(404).json({ error: "Usuario no encontrado." });
  }
});

app.get("/api/summary", async (req, res) => {
  const user = parseSession(req);
  res.json({ stats: await getSummary(user) });
});

app.get("/api/users", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  res.json({ users: await listUsers() });
});

app.post("/api/users", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }

  const { username, password, name, role, client_id } = req.body;
  if (!username || !password || !name || !role) {
    res.status(400).json({ error: "Todos los campos del usuario son obligatorios." });
    return;
  }
  if (role === "Cliente" && !client_id) {
    res.status(400).json({ error: "Debes vincular el usuario a un cliente." });
    return;
  }

  try {
    res.status(201).json({
      user: await createUser({ username, password, name, role, client_id })
    });
  } catch (error) {
    res.status(409).json({ error: "El nombre de usuario ya existe." });
  }
});

app.post("/api/users/invite-client", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }

  const { username, password, name, client_id } = req.body;
  if (!username || !client_id) {
    res.status(400).json({ error: "Debes indicar cliente y nombre de usuario." });
    return;
  }

  try {
    const invitation = await createClientUserInvite({ username, password, name, client_id });
    res.status(201).json(invitation);
  } catch (error) {
    if (error.message === "USERNAME_EXISTS") {
      res.status(409).json({ error: "El nombre de usuario ya existe." });
      return;
    }
    if (error.message === "CLIENT_USER_EXISTS") {
      res.status(409).json({ error: "Ese cliente ya tiene una cuenta vinculada." });
      return;
    }
    res.status(404).json({ error: "Cliente no encontrado." });
  }
});

app.put("/api/users/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }

  const { username, password, name, role, client_id } = req.body;
  if (!username || !name || !role) {
    res.status(400).json({ error: "Faltan datos del usuario." });
    return;
  }
  if (role === "Cliente" && !client_id) {
    res.status(400).json({ error: "Debes vincular el usuario a un cliente." });
    return;
  }

  try {
    const user = await updateUser(req.params.id, { username, password, name, role, client_id });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado." });
      return;
    }
    res.json({ user });
  } catch (error) {
    res.status(409).json({ error: "El nombre de usuario ya existe." });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  const deleted = await deleteUser(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Usuario no encontrado." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/users/:id/reset-password", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  const { newPassword } = req.body;
  if (!newPassword) {
    res.status(400).json({ error: "Debes indicar una nueva contrasena." });
    return;
  }
  const user = await adminResetPassword(req.params.id, newPassword);
  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado." });
    return;
  }
  res.json({ user });
});

app.get("/api/clients", async (req, res) => {
  const user = parseSession(req);
  res.json({ clients: await listClients(user) });
});

app.post("/api/clients", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Ventas"])) {
    return;
  }

  const { name, company, email, phone, priority } = req.body;
  if (!name || !company || !email || !phone || !priority) {
    res.status(400).json({ error: "Todos los campos del cliente son obligatorios." });
    return;
  }

  res.status(201).json({
    client: await createClient({ name, company, email, phone, priority })
  });
});

app.put("/api/clients/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Ventas"])) {
    return;
  }

  const { name, company, email, phone, priority } = req.body;
  if (!name || !company || !email || !phone || !priority) {
    res.status(400).json({ error: "Todos los campos del cliente son obligatorios." });
    return;
  }

  const client = await updateClient(req.params.id, { name, company, email, phone, priority });
  if (!client) {
    res.status(404).json({ error: "Cliente no encontrado." });
    return;
  }
  res.json({ client });
});

app.delete("/api/clients/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  try {
    const deleted = await deleteClient(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Cliente no encontrado." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(409).json({ error: "No puedes eliminar un cliente con envios o usuarios vinculados." });
  }
});

app.get("/api/operators", async (req, res) => {
  if (!requireInternalUser(req, res)) {
    return;
  }
  res.json({ operators: await listOperators() });
});

app.post("/api/operators", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Operaciones", "Logistica / Trafico"])) {
    return;
  }
  const { name, phone, license, status } = req.body;
  if (!name || !phone || !license || !status) {
    res.status(400).json({ error: "Todos los campos del operador son obligatorios." });
    return;
  }
  res.status(201).json({ operator: await createOperator({ name, phone, license, status }) });
});

app.put("/api/operators/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Operaciones", "Logistica / Trafico"])) {
    return;
  }
  const { name, phone, license, status } = req.body;
  if (!name || !phone || !license || !status) {
    res.status(400).json({ error: "Todos los campos del operador son obligatorios." });
    return;
  }
  const operator = await updateOperator(req.params.id, { name, phone, license, status });
  if (!operator) {
    res.status(404).json({ error: "Operador no encontrado." });
    return;
  }
  res.json({ operator });
});

app.delete("/api/operators/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  const deleted = await deleteOperator(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Operador no encontrado." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/vehicles", async (req, res) => {
  if (!requireInternalUser(req, res)) {
    return;
  }
  res.json({ vehicles: await listVehicles() });
});

app.post("/api/vehicles", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Operaciones", "Logistica / Trafico"])) {
    return;
  }
  const { label, plate, type, capacity, status } = req.body;
  if (!label || !plate || !type || !capacity || !status) {
    res.status(400).json({ error: "Todos los campos de la unidad son obligatorios." });
    return;
  }
  res.status(201).json({ vehicle: await createVehicle({ label, plate, type, capacity, status }) });
});

app.put("/api/vehicles/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Operaciones", "Logistica / Trafico"])) {
    return;
  }
  const { label, plate, type, capacity, status } = req.body;
  if (!label || !plate || !type || !capacity || !status) {
    res.status(400).json({ error: "Todos los campos de la unidad son obligatorios." });
    return;
  }
  const vehicle = await updateVehicle(req.params.id, { label, plate, type, capacity, status });
  if (!vehicle) {
    res.status(404).json({ error: "Unidad no encontrada." });
    return;
  }
  res.json({ vehicle });
});

app.delete("/api/vehicles/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  const deleted = await deleteVehicle(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Unidad no encontrada." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/shipments", async (req, res) => {
  const user = parseSession(req);
  const status = req.query.status || "Todos";
  res.json({ shipments: await listShipments(status, user) });
});

app.get("/api/shipments/:id", async (req, res) => {
  const user = parseSession(req);
  const shipment = await getShipmentById(req.params.id, user);
  if (!shipment) {
    res.status(404).json({ error: "Envio no encontrado." });
    return;
  }
  res.json({ shipment });
});

app.post("/api/shipments", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Ventas", "Operaciones", "Logistica / Trafico"])) {
    return;
  }

  const {
    tracking_code,
    client_id,
    origin,
    destination,
    departure_date,
    status,
    operator_name,
    vehicle,
    cargo,
    notes = ""
  } = req.body;

  if (!tracking_code || !client_id || !origin || !destination || !departure_date || !status || !operator_name || !vehicle || !cargo) {
    res.status(400).json({ error: "Todos los campos del envio son obligatorios." });
    return;
  }

  try {
    const shipment = await createShipment({
      tracking_code,
      client_id,
      origin,
      destination,
      departure_date,
      status,
      operator_name,
      vehicle,
      cargo,
      notes
    });
    res.status(201).json({ shipment });
  } catch (error) {
    res.status(409).json({ error: "La guia ya existe o el registro es invalido." });
  }
});

app.put("/api/shipments/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Ventas", "Operaciones", "Logistica / Trafico"])) {
    return;
  }

  const {
    tracking_code,
    client_id,
    origin,
    destination,
    departure_date,
    status,
    operator_name,
    vehicle,
    cargo,
    notes = ""
  } = req.body;

  if (!tracking_code || !client_id || !origin || !destination || !departure_date || !status || !operator_name || !vehicle || !cargo) {
    res.status(400).json({ error: "Todos los campos del envio son obligatorios." });
    return;
  }

  const shipment = await updateShipment(req.params.id, {
    tracking_code,
    client_id,
    origin,
    destination,
    departure_date,
    status,
    operator_name,
    vehicle,
    cargo,
    notes
  });
  if (!shipment) {
    res.status(404).json({ error: "Envio no encontrado." });
    return;
  }
  res.json({ shipment });
});

app.patch("/api/shipments/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador", "Operaciones", "Logistica / Trafico"])) {
    return;
  }

  const { id } = req.params;
  const { status, notes = "" } = req.body;

  if (!status) {
    res.status(400).json({ error: "Debes indicar un estado." });
    return;
  }

  const updated = await updateShipmentStatus(id, status, notes);
  if (!updated) {
    res.status(404).json({ error: "Envio no encontrado." });
    return;
  }

  res.json({ ok: true });
});

app.delete("/api/shipments/:id", async (req, res) => {
  if (!requireRole(req, res, ["Administrador"])) {
    return;
  }
  const deleted = await deleteShipment(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Envio no encontrado." });
    return;
  }
  res.json({ ok: true });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`LOGICRM listo en http://localhost:${PORT}`);
  });
}

export default app;
