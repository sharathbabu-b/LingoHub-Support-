const TOKEN_KEY = 'lh_token';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  ''
).replace(/\/+$/, '');

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (t) => {
  try {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable: session lasts until reload */
  }
};

export const browserTz = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

let onUnauthorized = () => {};

export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Production: VITE_API_URL points to the Render backend.
  // Development: if VITE_API_URL is empty, /api uses the Vite proxy.
  const url = `${API_URL}/api${path}`;

  let res;

  try {
    res = await fetch(url, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && token) {
    onUnauthorized();
  }

  if (!res.ok) {
    throw new Error(
      data.error || `Request failed (${res.status})`
    );
  }

  return data;
}
// const TOKEN_KEY = 'lh_token';

// export const getToken = () => {
//   try {
//     return localStorage.getItem(TOKEN_KEY);
//   } catch {
//     return null;
//   }
// };
// export const setToken = (t) => {
//   try {
//     if (t) localStorage.setItem(TOKEN_KEY, t);
//     else localStorage.removeItem(TOKEN_KEY);
//   } catch {
//     /* storage unavailable: session lasts until reload */
//   }
// };

// export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// let onUnauthorized = () => {};
// export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

// export async function api(path, { method = 'GET', body } = {}) {
//   const headers = { 'Content-Type': 'application/json' };
//   const token = getToken();
//   if (token) headers.Authorization = `Bearer ${token}`;
//   let res;
//   try {
//     res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
//   } catch {
//     throw new Error('Cannot reach the server. Is it running?');
//   }
//   const data = await res.json().catch(() => ({}));
//   if (res.status === 401 && token) onUnauthorized();
//   if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
//   return data;
// }
