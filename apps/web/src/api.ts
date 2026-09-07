export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  organizationId?: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method: method ?? (body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: {
      ...(organizationId ? { "x-organization-id": organizationId } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const e = await response.json();
    throw new ApiError(e.code, e.message, response.status);
  }
  return response.json();
}
export async function login(email: string, password: string) {
  const r = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok)
    throw new Error(
      "Inloggen lukt niet. Controleer je e-mailadres en wachtwoord.",
    );
  return r.json() as Promise<{ twoFactorRedirect?: boolean }>;
}
export async function logout() {
  const r = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error("Afmelden is niet gelukt. Probeer opnieuw.");
}

export async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch("/api/auth" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok)
    throw new Error(
      "Verificatie mislukt. Controleer je invoer en probeer opnieuw.",
    );
  return r.json();
}
