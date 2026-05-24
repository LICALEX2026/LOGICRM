const { useEffect, useState } = React;

const apiBase = "";

const statCards = [
  { key: "clients", label: "Clientes activos", hint: "Base comercial registrada" },
  { key: "shipments", label: "Envios totales", hint: "Historico operativo" },
  { key: "operators", label: "Operadores", hint: "Talento operativo disponible" },
  { key: "vehicles", label: "Unidades", hint: "Flota registrada" },
  { key: "incidents", label: "Incidencias", hint: "Seguimiento urgente" },
  { key: "inTransit", label: "En transito", hint: "Unidades en ruta" }
];

const emptyLogin = { username: "", password: "" };
const emptyClient = { name: "", company: "", email: "", phone: "", priority: "Alta" };
const emptyOperator = { name: "", phone: "", license: "", status: "Disponible" };
const emptyVehicle = { label: "", plate: "", type: "", capacity: "", status: "Disponible" };
const emptyUser = { username: "", password: "", name: "", role: "Cliente", client_id: "" };
const emptyInvite = { username: "", password: "", name: "", client_id: "" };
const emptyPasswordForm = { currentPassword: "", newPassword: "", confirmPassword: "" };
const emptyShipment = {
  tracking_code: "",
  client_id: "",
  origin: "",
  destination: "",
  departure_date: new Date().toISOString().slice(0, 10),
  status: "Pendiente",
  operator_name: "",
  vehicle: "",
  cargo: "",
  notes: ""
};

function App() {
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState({});
  const [clients, setClients] = useState([]);
  const [operators, setOperators] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [filter, setFilter] = useState("Todos");
  const [login, setLogin] = useState(emptyLogin);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [operatorForm, setOperatorForm] = useState(emptyOperator);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [userForm, setUserForm] = useState(emptyUser);
  const [inviteForm, setInviteForm] = useState(emptyInvite);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [shipmentForm, setShipmentForm] = useState(emptyShipment);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const role = user?.role;
  const isAdmin = role === "Administrador";
  const isOperations = role === "Operaciones";
  const isSales = role === "Ventas";
  const isClient = role === "Cliente";
  const canManageClients = isAdmin || isSales;
  const canManageShipments = isAdmin || isSales || isOperations;
  const canManageOperators = isAdmin || isOperations;
  const canManageVehicles = isAdmin || isOperations;
  const canUpdateStatus = isAdmin || isOperations;
  const canDeleteShipments = isAdmin;

  useEffect(() => {
    if (user) {
      refresh().catch((refreshError) => {
        setError(refreshError.message);
      });
    }
  }, [user, filter]);

  async function request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(user ? { "x-user-session": JSON.stringify(user) } : {})
    };

    const response = await fetch(`${apiBase}${path}`, {
      headers,
      ...options
    });
    const rawPayload = await response.text();
    let payload = {};

    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        payload = {
          error: rawPayload.includes("<!doctype") || rawPayload.includes("<html")
            ? "El servidor devolvio una respuesta invalida."
            : rawPayload
        };
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || `Ocurrio un error (${response.status}).`);
    }
    return payload;
  }

  async function refresh() {
    setError("");

    const baseResults = await Promise.allSettled([
      request("/api/summary"),
      request("/api/clients"),
      request(`/api/shipments?status=${encodeURIComponent(filter)}`)
    ]);

    const [summaryResult, clientsResult, shipmentsResult] = baseResults;
    if (summaryResult.status !== "fulfilled") {
      throw summaryResult.reason;
    }
    if (clientsResult.status !== "fulfilled") {
      throw clientsResult.reason;
    }
    if (shipmentsResult.status !== "fulfilled") {
      throw shipmentsResult.reason;
    }

    const summaryData = summaryResult.value;
    const clientsData = clientsResult.value;
    const shipmentsData = shipmentsResult.value;

    let operatorsData = { operators: [] };
    let vehiclesData = { vehicles: [] };
    let usersData = { users: [] };
    const partialErrors = [];

    if (!isClient) {
      const internalResults = await Promise.allSettled([
        request("/api/operators"),
        request("/api/vehicles")
      ]);
      const [operatorsResult, vehiclesResult] = internalResults;

      if (operatorsResult.status === "fulfilled") {
        operatorsData = operatorsResult.value;
      } else {
        partialErrors.push("No se pudo cargar la lista de operadores.");
      }

      if (vehiclesResult.status === "fulfilled") {
        vehiclesData = vehiclesResult.value;
      } else {
        partialErrors.push("No se pudo cargar la lista de unidades.");
      }
    }

    if (isAdmin) {
      const usersResult = await Promise.allSettled([request("/api/users")]);
      if (usersResult[0].status === "fulfilled") {
        usersData = usersResult[0].value;
      } else {
        partialErrors.push("No se pudo cargar el control de accesos.");
      }
    }

    const normalizedShipments = (shipmentsData.shipments || []).map((shipment) => ({
      ...shipment,
      departure_date: normalizeDateOnly(shipment.departure_date)
    }));

    setSummary(summaryData.stats);
    setClients(clientsData.clients);
    setShipments(normalizedShipments);
    setOperators(operatorsData?.operators || []);
    setVehicles(vehiclesData?.vehicles || []);
    setUsers(usersData?.users || []);
    setSelectedShipment((current) => {
      if (!current) {
        return null;
      }
      const matchedShipment = normalizedShipments.find((item) => item.id === current.id);
      return matchedShipment ? { ...matchedShipment } : null;
    });
    setShipmentForm((current) => ({
      ...current,
      client_id: current.client_id || String(clientsData.clients[0]?.id || ""),
      operator_name: current.operator_name || operatorsData?.operators?.[0]?.name || "",
      vehicle: current.vehicle || vehiclesData?.vehicles?.[0]?.label || ""
    }));
    setUserForm((current) => ({
      ...current,
      client_id: current.client_id || String(clientsData.clients[0]?.id || "")
    }));
    setInviteForm((current) => ({
      ...current,
      client_id: current.client_id || String(clientsData.clients[0]?.id || "")
    }));

    setInfoMessage(partialErrors.join(" "));
  }

  async function openShipmentHistory(shipmentId) {
    const response = await request(`/api/shipments/${shipmentId}`);
    setSelectedShipment(response.shipment);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    try {
      const data = await request("/api/login", {
        method: "POST",
        body: JSON.stringify(login)
      });
      setUser(data.user);
      setInfoMessage("");
    } catch (loginError) {
      setError(loginError.message);
    }
  }

  function logout() {
    setUser(null);
    setSummary({});
    setClients([]);
    setOperators([]);
    setVehicles([]);
    setUsers([]);
    setShipments([]);
    setSelectedShipment(null);
    setLogin(emptyLogin);
    setError("");
    setInfoMessage("");
  }

  async function handleClientSubmit(event) {
    event.preventDefault();
    const method = clientForm.id ? "PUT" : "POST";
    const path = clientForm.id ? `/api/clients/${clientForm.id}` : "/api/clients";
    await request(path, { method, body: JSON.stringify(clientForm) });
    setClientForm(emptyClient);
    await refresh();
  }

  async function handleOperatorSubmit(event) {
    event.preventDefault();
    const method = operatorForm.id ? "PUT" : "POST";
    const path = operatorForm.id ? `/api/operators/${operatorForm.id}` : "/api/operators";
    await request(path, { method, body: JSON.stringify(operatorForm) });
    setOperatorForm(emptyOperator);
    await refresh();
  }

  async function handleVehicleSubmit(event) {
    event.preventDefault();
    const method = vehicleForm.id ? "PUT" : "POST";
    const path = vehicleForm.id ? `/api/vehicles/${vehicleForm.id}` : "/api/vehicles";
    await request(path, { method, body: JSON.stringify(vehicleForm) });
    setVehicleForm(emptyVehicle);
    await refresh();
  }

  async function handleUserSubmit(event) {
    event.preventDefault();
    const method = userForm.id ? "PUT" : "POST";
    const path = userForm.id ? `/api/users/${userForm.id}` : "/api/users";
    await request(path, { method, body: JSON.stringify(userForm) });
    setUserForm(emptyUser);
    await refresh();
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    const response = await request("/api/users/invite-client", {
      method: "POST",
      body: JSON.stringify(inviteForm)
    });
    setInviteForm(emptyInvite);
    setInfoMessage(`Cuenta cliente creada: ${response.user.username} | Contrasena temporal: ${response.temporaryPassword}`);
    await refresh();
  }

  async function handleChangePassword(event) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("La confirmacion de contrasena no coincide.");
      return;
    }
    const response = await request("/api/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      })
    });
    setUser(response.user);
    setPasswordForm(emptyPasswordForm);
    setError("");
    setInfoMessage("Contrasena actualizada correctamente.");
  }

  async function resetUserPassword(targetUser) {
    const newPassword = window.prompt(`Nueva contrasena para ${targetUser.username}`);
    if (!newPassword) {
      return;
    }
    await request(`/api/users/${targetUser.id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword })
    });
    setInfoMessage(`Contrasena restablecida para ${targetUser.username}.`);
  }

  async function handleShipmentSubmit(event) {
    event.preventDefault();
    const method = shipmentForm.id ? "PUT" : "POST";
    const path = shipmentForm.id ? `/api/shipments/${shipmentForm.id}` : "/api/shipments";
    await request(path, { method, body: JSON.stringify(shipmentForm) });
    setShipmentForm({
      ...emptyShipment,
      client_id: clients[0] ? String(clients[0].id) : "",
      operator_name: operators[0]?.name || "",
      vehicle: vehicles[0]?.label || ""
    });
    await refresh();
  }

  async function updateShipmentStatus(shipment, status) {
    const notes = window.prompt("Notas de seguimiento", shipment.notes || "");
    if (notes === null) {
      return;
    }
    await request(`/api/shipments/${shipment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes })
    });
    await refresh();
    await openShipmentHistory(shipment.id);
  }

  async function removeEntity(path, message) {
    if (!window.confirm(message)) {
      return;
    }
    await request(path, { method: "DELETE" });
    if (path === `/api/shipments/${selectedShipment?.id}`) {
      setSelectedShipment(null);
    }
    await refresh();
  }

  const incidents = shipments.filter((shipment) => shipment.status === "Incidencia");
  const pending = shipments.filter((shipment) => shipment.status === "Pendiente");

  if (!user) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="auth-copy">
            <p className="eyebrow">CRM Logistico</p>
            <h1>LOGICRM</h1>
            <p>Controla, administra y supervisa tu operacion logistica en la palma de tus manos.</p>
          </div>
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              <span>Usuario</span>
              <input value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} />
            </label>
            <label>
              <span>Contrasena</span>
              <input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
            </label>
            <button className="primary-btn" type="submit">Entrar</button>
            <p className="error">{error}</p>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Panel central</p>
          <h2>LOGICRM</h2>
          <p className="sidebar-copy">{user.name} | {user.role}{user.client_company ? ` | ${user.client_company}` : ""}</p>
        </div>
        <div className="status-card">
          <strong>Sesion activa</strong>
          <p>{isClient ? "Vista cliente con seguimiento de envios." : "Vista interna con permisos por rol."}</p>
          <button type="button" className="ghost-btn top-gap" onClick={logout}>Cerrar sesion</button>
        </div>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <p className="eyebrow">Centro de operaciones</p>
            <h1>LogiCRM</h1>
            <p className="hero-copy">{isClient ? "Consulta el estado y la bitacora de tus envios en tiempo real." : "Interfaz React conectada a una API local con persistencia en archivo JSON."}</p>
          </div>
        </header>

        <section className="stats-grid">
          {statCards
            .filter((card) => !isClient || !["operators", "vehicles"].includes(card.key))
            .map((card) => (
              <article className="stat-card" key={card.key}>
                <p>{card.label}</p>
                <strong>{summary[card.key] ?? 0}</strong>
                <span>{card.hint}</span>
              </article>
            ))}
        </section>

        <section className="panel-grid">
          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Seguridad</p>
              <h3>Cambiar contrasena</h3>
            </div>
            <form className="form-grid narrow-grid" onSubmit={handleChangePassword}>
              <input type="password" placeholder="Contrasena actual" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} />
              <input type="password" placeholder="Nueva contrasena" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} />
              <input type="password" placeholder="Confirmar contrasena" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} />
              <button className="primary-btn span-all" type="submit">Actualizar contrasena</button>
            </form>
            {infoMessage ? <p className="helper success-text">{infoMessage}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </article>

          {isAdmin ? (
            <article className="panel">
              <div className="panel-heading">
                <p className="eyebrow">Invitacion</p>
                <h3>Crear cuenta cliente</h3>
              </div>
              <form className="form-grid narrow-grid" onSubmit={handleInviteSubmit}>
                <select value={inviteForm.client_id} onChange={(event) => setInviteForm({ ...inviteForm, client_id: event.target.value })}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.company}</option>
                  ))}
                </select>
                <input placeholder="Usuario" value={inviteForm.username} onChange={(event) => setInviteForm({ ...inviteForm, username: event.target.value })} />
                <input placeholder="Nombre visible" value={inviteForm.name} onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })} />
                <input placeholder="Contrasena temporal (opcional)" value={inviteForm.password} onChange={(event) => setInviteForm({ ...inviteForm, password: event.target.value })} />
                <button className="primary-btn span-all" type="submit">Crear acceso cliente</button>
              </form>
            </article>
          ) : null}
        </section>

        <section className="panel-grid">
          {isAdmin ? (
            <article className="panel wide">
              <div className="panel-heading">
                <p className="eyebrow">Usuarios</p>
                <h3>Control de accesos</h3>
              </div>
              <form className="form-grid" onSubmit={handleUserSubmit}>
                <input placeholder="Nombre" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} />
                <input placeholder="Usuario" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} />
                <input placeholder={userForm.id ? "Nueva contrasena (opcional)" : "Contrasena"} value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} />
                <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}>
                  <option value="Administrador">Administrador</option>
                  <option value="Operaciones">Operaciones</option>
                  <option value="Ventas">Ventas</option>
                  <option value="Cliente">Cliente</option>
                </select>
                <select value={userForm.client_id} onChange={(event) => setUserForm({ ...userForm, client_id: event.target.value })} disabled={userForm.role !== "Cliente"}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.company}</option>
                  ))}
                </select>
                <div className="inline-actions span-all">
                  <button className="primary-btn" type="submit">{userForm.id ? "Actualizar usuario" : "Crear usuario"}</button>
                  {userForm.id ? <button type="button" className="ghost-btn" onClick={() => setUserForm(emptyUser)}>Cancelar</button> : null}
                </div>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Usuario</th>
                      <th>Rol</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.username}</td>
                        <td>{item.role}{item.client_company ? ` | ${item.client_company}` : ""}</td>
                        <td>
                          <div className="status-actions compact">
                            <button type="button" className="ghost-btn" onClick={() => setUserForm({ ...item, password: "", client_id: item.client_id ? String(item.client_id) : "" })}>Editar</button>
                            <button type="button" className="ghost-btn" onClick={() => resetUserPassword(item)}>Reset password</button>
                            <button type="button" className="ghost-btn" onClick={() => removeEntity(`/api/users/${item.id}`, `Eliminar al usuario ${item.username}?`)}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {canManageClients || isClient ? (
            <article className="panel wide">
              <div className="panel-heading">
                <p className="eyebrow">Clientes</p>
                <h3>{isClient ? "Tu perfil comercial" : "Directorio comercial"}</h3>
              </div>
              {canManageClients ? (
                <form className="form-grid" onSubmit={handleClientSubmit}>
                  <input placeholder="Nombre del cliente" value={clientForm.name} onChange={(event) => setClientForm({ ...clientForm, name: event.target.value })} />
                  <input placeholder="Empresa" value={clientForm.company} onChange={(event) => setClientForm({ ...clientForm, company: event.target.value })} />
                  <input placeholder="Correo" value={clientForm.email} onChange={(event) => setClientForm({ ...clientForm, email: event.target.value })} />
                  <input placeholder="Telefono" value={clientForm.phone} onChange={(event) => setClientForm({ ...clientForm, phone: event.target.value })} />
                  <select value={clientForm.priority} onChange={(event) => setClientForm({ ...clientForm, priority: event.target.value })}>
                    <option value="Alta">Prioridad alta</option>
                    <option value="Media">Prioridad media</option>
                    <option value="Baja">Prioridad baja</option>
                  </select>
                  <div className="inline-actions span-all">
                    <button className="primary-btn" type="submit">{clientForm.id ? "Actualizar cliente" : "Guardar cliente"}</button>
                    {clientForm.id ? <button type="button" className="ghost-btn" onClick={() => setClientForm(emptyClient)}>Cancelar</button> : null}
                  </div>
                </form>
              ) : null}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Empresa</th>
                      <th>Contacto</th>
                      <th>Prioridad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id}>
                        <td><strong>{client.name}</strong></td>
                        <td>{client.company}</td>
                        <td>{client.email} | {client.phone}</td>
                        <td>
                          <span className={`badge ${client.priority === "Alta" ? "status-incidencia" : "status-pendiente"}`}>{client.priority}</span>
                          {canManageClients ? (
                            <div className="status-actions compact">
                              <button type="button" className="ghost-btn" onClick={() => setClientForm(client)}>Editar</button>
                              {isAdmin ? <button type="button" className="ghost-btn" onClick={() => removeEntity(`/api/clients/${client.id}`, `Eliminar a ${client.company}?`)}>Eliminar</button> : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {canManageOperators ? (
            <article className="panel">
              <div className="panel-heading">
                <p className="eyebrow">Operadores</p>
                <h3>Equipo en ruta</h3>
              </div>
              <form className="form-grid narrow-grid" onSubmit={handleOperatorSubmit}>
                <input placeholder="Nombre" value={operatorForm.name} onChange={(event) => setOperatorForm({ ...operatorForm, name: event.target.value })} />
                <input placeholder="Telefono" value={operatorForm.phone} onChange={(event) => setOperatorForm({ ...operatorForm, phone: event.target.value })} />
                <input placeholder="Licencia" value={operatorForm.license} onChange={(event) => setOperatorForm({ ...operatorForm, license: event.target.value })} />
                <select value={operatorForm.status} onChange={(event) => setOperatorForm({ ...operatorForm, status: event.target.value })}>
                  <option value="Disponible">Disponible</option>
                  <option value="En ruta">En ruta</option>
                  <option value="Descanso">Descanso</option>
                </select>
                <div className="inline-actions span-all">
                  <button className="primary-btn" type="submit">{operatorForm.id ? "Actualizar operador" : "Guardar operador"}</button>
                  {operatorForm.id ? <button type="button" className="ghost-btn" onClick={() => setOperatorForm(emptyOperator)}>Cancelar</button> : null}
                </div>
              </form>
              <div className="stack-list">
                {operators.map((operator) => (
                  <InfoCard
                    key={operator.id}
                    title={`${operator.name} | ${operator.status}`}
                    body={`${operator.phone} | ${operator.license}`}
                    actions={
                      <>
                        <button type="button" className="ghost-btn" onClick={() => setOperatorForm(operator)}>Editar</button>
                        {isAdmin ? <button type="button" className="ghost-btn" onClick={() => removeEntity(`/api/operators/${operator.id}`, `Eliminar a ${operator.name}?`)}>Eliminar</button> : null}
                      </>
                    }
                  />
                ))}
              </div>
            </article>
          ) : null}

          {canManageVehicles ? (
            <article className="panel">
              <div className="panel-heading">
                <p className="eyebrow">Unidades</p>
                <h3>Flota disponible</h3>
              </div>
              <form className="form-grid narrow-grid" onSubmit={handleVehicleSubmit}>
                <input placeholder="Nombre de unidad" value={vehicleForm.label} onChange={(event) => setVehicleForm({ ...vehicleForm, label: event.target.value })} />
                <input placeholder="Placa" value={vehicleForm.plate} onChange={(event) => setVehicleForm({ ...vehicleForm, plate: event.target.value })} />
                <input placeholder="Tipo" value={vehicleForm.type} onChange={(event) => setVehicleForm({ ...vehicleForm, type: event.target.value })} />
                <input placeholder="Capacidad" value={vehicleForm.capacity} onChange={(event) => setVehicleForm({ ...vehicleForm, capacity: event.target.value })} />
                <select value={vehicleForm.status} onChange={(event) => setVehicleForm({ ...vehicleForm, status: event.target.value })}>
                  <option value="Disponible">Disponible</option>
                  <option value="En ruta">En ruta</option>
                  <option value="Mantenimiento">Mantenimiento</option>
                </select>
                <div className="inline-actions span-all">
                  <button className="primary-btn" type="submit">{vehicleForm.id ? "Actualizar unidad" : "Guardar unidad"}</button>
                  {vehicleForm.id ? <button type="button" className="ghost-btn" onClick={() => setVehicleForm(emptyVehicle)}>Cancelar</button> : null}
                </div>
              </form>
              <div className="stack-list">
                {vehicles.map((vehicle) => (
                  <InfoCard
                    key={vehicle.id}
                    title={`${vehicle.label} | ${vehicle.status}`}
                    body={`${vehicle.plate} | ${vehicle.type} | ${vehicle.capacity}`}
                    actions={
                      <>
                        <button type="button" className="ghost-btn" onClick={() => setVehicleForm(vehicle)}>Editar</button>
                        {isAdmin ? <button type="button" className="ghost-btn" onClick={() => removeEntity(`/api/vehicles/${vehicle.id}`, `Eliminar la unidad ${vehicle.label}?`)}>Eliminar</button> : null}
                      </>
                    }
                  />
                ))}
              </div>
            </article>
          ) : null}

          <article className="panel wide">
            <div className="panel-heading split">
              <div>
                <p className="eyebrow">Envios</p>
                <h3>{isClient ? "Tus embarques" : "Control de embarques"}</h3>
              </div>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="Todos">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="En transito">En transito</option>
                <option value="Entregado">Entregado</option>
                <option value="Incidencia">Incidencia</option>
              </select>
            </div>
            {canManageShipments ? (
              <form className="form-grid" onSubmit={handleShipmentSubmit}>
                <input placeholder="Folio / guia" value={shipmentForm.tracking_code} onChange={(event) => setShipmentForm({ ...shipmentForm, tracking_code: event.target.value })} />
                <select value={shipmentForm.client_id} onChange={(event) => setShipmentForm({ ...shipmentForm, client_id: event.target.value })}>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.company} | {client.name}</option>
                  ))}
                </select>
                <input placeholder="Origen" value={shipmentForm.origin} onChange={(event) => setShipmentForm({ ...shipmentForm, origin: event.target.value })} />
                <input placeholder="Destino" value={shipmentForm.destination} onChange={(event) => setShipmentForm({ ...shipmentForm, destination: event.target.value })} />
                <input type="date" value={shipmentForm.departure_date} onChange={(event) => setShipmentForm({ ...shipmentForm, departure_date: event.target.value })} />
                <select value={shipmentForm.status} onChange={(event) => setShipmentForm({ ...shipmentForm, status: event.target.value })}>
                  <option value="Pendiente">Pendiente</option>
                  <option value="En transito">En transito</option>
                  <option value="Entregado">Entregado</option>
                  <option value="Incidencia">Incidencia</option>
                </select>
                <select value={shipmentForm.operator_name} onChange={(event) => setShipmentForm({ ...shipmentForm, operator_name: event.target.value })}>
                  {operators.map((operator) => (
                    <option key={operator.id} value={operator.name}>{operator.name} | {operator.status}</option>
                  ))}
                </select>
                <select value={shipmentForm.vehicle} onChange={(event) => setShipmentForm({ ...shipmentForm, vehicle: event.target.value })}>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.label}>{vehicle.label} | {vehicle.status}</option>
                  ))}
                </select>
                <input placeholder="Carga" value={shipmentForm.cargo} onChange={(event) => setShipmentForm({ ...shipmentForm, cargo: event.target.value })} />
                <input placeholder="Notas" value={shipmentForm.notes} onChange={(event) => setShipmentForm({ ...shipmentForm, notes: event.target.value })} />
                <div className="inline-actions span-all">
                  <button className="primary-btn" type="submit">{shipmentForm.id ? "Actualizar envio" : "Registrar envio"}</button>
                  {shipmentForm.id ? <button type="button" className="ghost-btn" onClick={() => setShipmentForm({
                    ...emptyShipment,
                    client_id: clients[0] ? String(clients[0].id) : "",
                    operator_name: operators[0]?.name || "",
                    vehicle: vehicles[0]?.label || ""
                  })}>Cancelar</button> : null}
                </div>
              </form>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Guia</th>
                    <th>Cliente</th>
                    <th>Ruta</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Operacion</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td><strong>{shipment.tracking_code}</strong></td>
                      <td>{shipment.client_company}</td>
                      <td>{shipment.origin} -&gt; {shipment.destination}</td>
                      <td>{formatDate(shipment.departure_date)}</td>
                      <td><span className={`badge ${statusClass(shipment.status)}`}>{shipment.status}</span></td>
                      <td>
                        <div>{shipment.operator_name} | {shipment.vehicle}</div>
                        <div className="status-actions">
                          {canManageShipments ? (
                            <button type="button" className="ghost-btn" onClick={() => setShipmentForm({
                              id: shipment.id,
                              tracking_code: shipment.tracking_code,
                              client_id: String(shipment.client_id),
                              origin: shipment.origin,
                              destination: shipment.destination,
                              departure_date: shipment.departure_date,
                              status: shipment.status,
                              operator_name: shipment.operator_name,
                              vehicle: shipment.vehicle,
                              cargo: shipment.cargo,
                              notes: shipment.notes || ""
                            })}>Editar</button>
                          ) : null}
                          <button type="button" className="ghost-btn" onClick={() => openShipmentHistory(shipment.id)}>Historial</button>
                          {canUpdateStatus ? <button type="button" className="ghost-btn" onClick={() => updateShipmentStatus(shipment, "En transito")}>En transito</button> : null}
                          {canUpdateStatus ? <button type="button" className="ghost-btn" onClick={() => updateShipmentStatus(shipment, "Entregado")}>Entregado</button> : null}
                          {canUpdateStatus ? <button type="button" className="ghost-btn" onClick={() => updateShipmentStatus(shipment, "Incidencia")}>Incidencia</button> : null}
                          {canDeleteShipments ? <button type="button" className="ghost-btn" onClick={() => removeEntity(`/api/shipments/${shipment.id}`, `Eliminar envio ${shipment.tracking_code}?`)}>Eliminar</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Bitacora</p>
              <h3>Historial por envio</h3>
            </div>
            <div className="stack-list">
              {!selectedShipment ? <InfoCard title="Selecciona un envio" body="Pulsa Historial sobre una guia para ver su bitacora de seguimiento." /> : null}
              {selectedShipment ? <InfoCard title={`${selectedShipment.tracking_code} | ${selectedShipment.client_company}`} body={`${selectedShipment.origin} -> ${selectedShipment.destination} | ${selectedShipment.status}`} /> : null}
              {(selectedShipment?.history || []).map((event) => (
                <TimelineCard
                  key={event.id}
                  title={`${event.type} | ${event.status}`}
                  body={event.notes || "Sin nota operativa."}
                  meta={`${formatDateTime(event.created_at)} | ${event.actor}`}
                />
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">{isClient ? "Resumen" : "Alertas"}</p>
              <h3>{isClient ? "Movimientos recientes" : "Seguimiento operativo"}</h3>
            </div>
            <div className="stack-list">
              {!incidents.length && !pending.length && !isClient ? <InfoCard title="Todo bajo control" body="No hay eventos criticos en el filtro actual." /> : null}
              {!shipments.length && isClient ? <InfoCard title="Sin envios" body="Todavia no tienes movimientos registrados." /> : null}
              {isClient
                ? shipments.slice(0, 4).map((shipment) => (
                    <InfoCard key={shipment.id} title={`${shipment.tracking_code} | ${shipment.status}`} body={`${shipment.origin} -> ${shipment.destination} | ${formatDate(shipment.departure_date)}`} />
                  ))
                : incidents.map((shipment) => (
                    <InfoCard key={shipment.id} title={`Incidencia ${shipment.tracking_code}`} body={`${shipment.client_company} requiere seguimiento en la ruta ${shipment.origin} -> ${shipment.destination}.`} />
                  ))}
              {!isClient && pending.slice(0, 3).map((shipment) => (
                <InfoCard key={shipment.id} title={`Salida pendiente ${shipment.tracking_code}`} body={`Validar ${shipment.cargo}, unidad ${shipment.vehicle} y operador ${shipment.operator_name}.`} />
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function InfoCard({ title, body, actions }) {
  return (
    <article className="stack-card">
      <strong>{title}</strong>
      <p>{body}</p>
      {actions ? <div className="status-actions compact top-gap">{actions}</div> : null}
    </article>
  );
}

function TimelineCard({ title, body, meta }) {
  return (
    <article className="stack-card timeline-card">
      <small className="timeline-meta">{meta}</small>
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
  );
}

function formatDate(value) {
  const normalized = normalizeDateOnly(value);
  if (!normalized) {
    return "-";
  }
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${normalized}T00:00:00`));
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function normalizeDateOnly(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function statusClass(status) {
  switch (status) {
    case "En transito":
      return "status-transito";
    case "Entregado":
      return "status-entregado";
    case "Incidencia":
      return "status-incidencia";
    default:
      return "status-pendiente";
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
