const useDatabase = process.env.DATABASE_URL;

const adapter = useDatabase
  ? await import("./db-postgres.js")
  : await import("./db-json.js");

export const {
  adminResetPassword,
  changeOwnPassword,
  createClient,
  createClientUserInvite,
  createOperator,
  createShipment,
  createUser,
  createVehicle,
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
} = adapter;
