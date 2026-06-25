function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch {
    return null;
  }
}

export function getCurrentUserId() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.id || null;
}
