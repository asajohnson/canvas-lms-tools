declare namespace Express {
  interface User {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
  }
}
