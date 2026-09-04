import { useEffect, useState } from 'react';
import { api, UnauthorizedError } from './api/client';
import type { CurrentUser } from './api/types';
import { Console } from './console/Console';
import { Login } from './console/Login';

export default function App() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (err instanceof UnauthorizedError) setUser(null);
        else setUser(null);
      });
  }, []);

  if (user === undefined) return null;
  if (user === null) return <Login onSignedIn={setUser} />;

  return (
    <Console
      user={user}
      onSignedOut={() => {
        api.logout().finally(() => setUser(null));
      }}
    />
  );
}
