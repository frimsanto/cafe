// Base URL API backend. Default ke backend lokal (:4000); override lewat
// VITE_API_URL saat build untuk lingkungan lain (mis. VPS).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
