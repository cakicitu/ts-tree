// Base path the app is served under, without trailing slash ('' at the root, '/ts-tree' on the VPS).
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
