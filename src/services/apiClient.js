import { clearSession } from './session';
import axios from 'axios';


// Context from the top bar (school · academic year · board) is sent on every request
let context = { school: '', year: '', board: '' };
export const setApiContext = (ctx) => {
  context = { ...context, ...ctx };
};

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['x-school-id'] = context.school;
  config.headers['x-academic-year-id'] = context.year;
  config.headers['x-board-id'] = context.board;
  return config;
});

// Backend always answers { success, data, message } – return that object directly
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.message || 'Could not reach the server. Check your connection and try again.';
        // Session expired / not logged in → back to the login page (not for the login call itself)
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login?expired=1');
    }
    return Promise.reject(Object.assign(new Error(message), { response: err.response }));
  },
);
