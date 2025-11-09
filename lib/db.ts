// Simple in-memory database for demo purposes
// In production, replace with a real database

export interface User {
  id: string;
  email: string;
  password: string;
  name?: string | null;
  createdAt: Date;
}

export const users: User[] = [];

export function findUserByEmail(email: string): User | undefined {
  return users.find((user) => user.email === email);
}

export function createUser(email: string, hashedPassword: string): User {
  const newUser: User = {
    id: Math.random().toString(36).substring(2, 15),
    email,
    password: hashedPassword,
    createdAt: new Date(),
  };
  users.push(newUser);
  return newUser;
}

export function userExists(email: string): boolean {
  return users.some((user) => user.email === email);
}