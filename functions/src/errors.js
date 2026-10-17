// Error con un mensaje para mostrar en la página y un código de HttpsError
// (invalid-argument, permission-denied…); index.js lo traduce.
export class FriendlyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
