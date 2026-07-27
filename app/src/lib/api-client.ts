/// <reference types="vite/client" />

const API_BASE = ((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = input.startsWith("/") ? `${API_BASE}${input}` : input;
  return fetch(url, {
    ...init,
    credentials: "include",
  });
}
