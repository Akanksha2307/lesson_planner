// The logged-in session, kept in the browser so a refresh does not log you out.
//   token → sent on every API call by apiClient.js ("Authorization: Bearer …")
//   user  → { id, name, role, departmentId, schoolId }
const TOKEN_KEY = 'token';
const USER_KEY = 'lp-user';

export function getSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    return token && user ? { token, user } : null;
  } catch {
    return null;
  }
}

export function saveSession({ token, user }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable – the session lasts until the page is closed */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}