// Errores con código para mostrar mensajes claros en la interfaz.
export class SyncError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}
