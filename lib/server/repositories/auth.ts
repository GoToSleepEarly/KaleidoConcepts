type LoginInput = {
  username: string;
  password: string;
};

type DbUser = {
  id: string;
  username: string;
  password: string;
  displayName: string;
};

export type AuthDb = {
  user: {
    findUnique: (query: { where: { username: string } }) => Promise<DbUser | null>;
  };
};

export async function verifyTeacherLogin(db: AuthDb, input: LoginInput) {
  const user = await db.user.findUnique({ where: { username: input.username } });

  if (!user || user.password !== input.password) {
    return null;
  }

  return { displayName: user.displayName };
}
