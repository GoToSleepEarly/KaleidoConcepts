type LoginInput = {
  username: string;
  password: string;
};

type DbUser = {
  id: string;
  username: string;
  password: string;
  displayName: string;
  aiGateway: "quickrouter" | "crazyrouter";
};

export type AuthDb = {
  user: {
    findUnique: (query: { where: { username: string } | { id: string } }) => Promise<DbUser | null>;
    update: (query: { where: { id: string }; data: { aiGateway: "quickrouter" | "crazyrouter" } }) => Promise<DbUser>;
  };
};

export async function verifyTeacherLogin(db: AuthDb, input: LoginInput) {
  const user = await db.user.findUnique({ where: { username: input.username } });

  if (!user || user.password !== input.password) {
    return null;
  }

  return { id: user.id, displayName: user.displayName };
}
